import type { AudioCue, AudioCueType, Snapshot } from "./engine";
import { championTeams } from "./engine";

export const ARENA_SOUND_FILES: Record<AudioCueType, string> = {
  buzz: "/sounds/bunyi_buzer.mp3",
  correct: "/sounds/benar.mp3",
  wrong: "/sounds/salah.mp3",
};
export const MAX_AUDIO_AGE_MS = 5000;
export const VICTORY_MUSIC_FILE = "/sounds/we_are_the_champions.mp3";

// Follow committed events, rather than a phase that a fast host can skip
// between two Arena polls. Initial load and muted periods establish a baseline.
export class ArenaAudioCursor {
  private sessionId: string | null = null;
  private revision = -1;

  take(snapshot: Snapshot, active: boolean): AudioCue[] {
    const session = snapshot.quiz.game.sessionId;
    if (this.sessionId !== session) {
      this.sessionId = session; this.revision = snapshot.revision; return [];
    }
    if (snapshot.revision <= this.revision) return [];
    const previous = this.revision; this.revision = snapshot.revision;
    if (!active || !snapshot.quiz.sound) return [];
    return (snapshot.audioCues ?? []).filter(cue => cue.sessionId === session
      && cue.revision > previous && cue.revision <= snapshot.revision
      && snapshot.serverNow - cue.at >= 0 && snapshot.serverNow - cue.at <= MAX_AUDIO_AGE_MS)
      .sort((a,b) => a.revision - b.revision)
      .filter((cue,i,all) => !all.slice(0,i).some(other => other.id === cue.id || other.revision === cue.revision));
  }
}

async function fetchAudio(path: string) {
  const response = await fetch(path, { cache: "force-cache" });
  if (!response.ok) throw new Error("Berkas suara Arena belum tersedia.");
  return response.arrayBuffer();
}

// Only the Arena creates this player, inside its Enable Audio click handler.
// One resumed AudioContext plays all three decoded MP3 files on later events.
export class ArenaAudio {
  private cursor = new ArenaAudioCursor();
  private buffers = new Map<AudioCueType, AudioBuffer>();
  private loading: Promise<void> | null = null;
  private queue: { type: AudioCueType; expiresAt: number }[] = [];
  private source: AudioBufferSourceNode | null = null;
  private sessionId: string | null = null;
  private disposed = false;
  private victoryKey: string | null = null;
  private victoryActive = false;
  private victoryStarted: string | null = null;
  private victoryBuffer: AudioBuffer | null = null;
  private victorySource: AudioBufferSourceNode | null = null;
  private victoryLoading: Promise<void> | null = null;
  private victoryAttempted = false;
  private victoryGeneration = 0;

  constructor(private context: AudioContext, private onError: () => void = () => {}, private loadAudio = fetchAudio, private onMusicMissing: () => void = () => {}) {}

  async activate() {
    if (this.disposed) throw new Error("Pemutar suara Arena sudah ditutup.");
    // Start resume synchronously within the user's click, before loading files.
    const resume = this.context.resume();
    if (!this.victoryBuffer) this.victoryAttempted = false;
    if (!this.loading) {
      this.loading = Promise.all((Object.keys(ARENA_SOUND_FILES) as AudioCueType[]).map(async type => {
        const bytes = await this.loadAudio(ARENA_SOUND_FILES[type]);
        const buffer = await this.context.decodeAudioData(bytes);
        if (!this.disposed) this.buffers.set(type, buffer);
      })).then(() => {}).catch(error => { this.loading = null; throw error; });
    }
    await Promise.all([resume, this.loading]);
    if (this.disposed || this.context.state !== "running") throw new Error("Aktifkan kembali suara pada layar Arena.");
  }

  observe(snapshot: Snapshot, active: boolean) {
    if (this.disposed) return;
    const changed = this.sessionId !== snapshot.quiz.game.sessionId;
    this.sessionId = snapshot.quiz.game.sessionId;
    if (changed || !active || !snapshot.quiz.sound) this.stop();
    const celebrating = this.syncVictory(snapshot, active);
    const cues = this.cursor.take(snapshot, active && !celebrating);
    this.queue.push(...cues.map(cue => ({ type: cue.type, expiresAt: Date.now() + MAX_AUDIO_AGE_MS - (snapshot.serverNow - cue.at) })));
    this.queue = this.queue.slice(-8);
    this.playNext();
  }

  // The Arena operator may choose a local MP3 without changing the database.
  async setVictoryMusic(bytes: ArrayBuffer) {
    if (this.disposed) return false;
    const generation = ++this.victoryGeneration;
    this.victoryLoading = null; this.victoryAttempted = true;
    let buffer: AudioBuffer;
    try { buffer = await this.context.decodeAudioData(bytes); }
    catch (error) { if (generation === this.victoryGeneration) this.victoryAttempted = false; throw error; }
    if (this.disposed || generation !== this.victoryGeneration) return false;
    this.victoryBuffer = buffer; this.victoryAttempted = true;
    this.victoryLoading = null; this.stopVictory(); this.victoryStarted = null;
    this.playVictory(); return true;
  }

  private syncVictory(snapshot: Snapshot, active: boolean) {
    const key = championTeams(snapshot.quiz).length ? `${snapshot.quiz.game.sessionId}:${snapshot.quiz.championship!.declaredAt}` : null;
    if (key !== this.victoryKey) { this.stopVictory(); this.victoryStarted = null; this.victoryKey = key; }
    this.victoryActive = !!key && active && snapshot.quiz.sound;
    if (!this.victoryActive) { this.stopVictory(); this.victoryStarted = null; return false; }
    this.stopEffects(); this.playVictory(); return true;
  }

  private playVictory() {
    const key = this.victoryKey;
    if (this.disposed || !this.victoryActive || !key || this.victoryStarted === key) return;
    if (!this.victoryBuffer) {
      if (this.victoryLoading || this.victoryAttempted) return;
      const generation = this.victoryGeneration; this.victoryAttempted = true;
      this.victoryLoading = this.loadAudio(VICTORY_MUSIC_FILE).then(bytes => this.context.decodeAudioData(bytes))
        .then(buffer => {
          if (this.disposed || generation !== this.victoryGeneration) return;
          this.victoryBuffer = buffer; this.playVictory();
        }).catch(() => {
          if (!this.disposed && generation === this.victoryGeneration && this.victoryActive) this.onMusicMissing();
        }).finally(() => { if (generation === this.victoryGeneration) this.victoryLoading = null; });
      return;
    }
    try {
      if (this.context.state !== "running") throw new Error("Audio context suspended");
      const source = this.context.createBufferSource();
      source.buffer = this.victoryBuffer; source.loop = false; source.connect(this.context.destination);
      this.victorySource = source; this.victoryStarted = key;
      source.onended = () => { source.disconnect(); if (this.victorySource === source) this.victorySource = null; };
      source.start();
    } catch { this.stopVictory(); this.onError(); }
  }

  private stopVictory() {
    const source = this.victorySource; this.victorySource = null;
    if (source) { source.onended = null; try { source.stop(); source.disconnect(); } catch {} }
  }

  private playNext() {
    if (this.disposed || this.source || !this.queue.length) return;
    while (this.queue.length && this.queue[0].expiresAt < Date.now()) this.queue.shift();
    if (!this.queue.length) return;
    const { type } = this.queue.shift()!, buffer = this.buffers.get(type);
    if (!buffer || this.context.state !== "running") { this.stop(); this.onError(); return; }
    try {
      const source = this.context.createBufferSource(); this.source = source;
      source.buffer = buffer; source.connect(this.context.destination);
      source.onended = () => {
        source.disconnect();
        if (this.source === source) { this.source = null; this.playNext(); }
      };
      source.start();
    } catch { this.stop(); this.onError(); }
  }

  private stopEffects() {
    this.queue = [];
    const source = this.source; this.source = null;
    if (source) { source.onended = null; try { source.stop(); source.disconnect(); } catch {} }
  }

  stop() {
    this.stopEffects(); this.stopVictory(); this.victoryActive = false; this.victoryStarted = null;
  }

  dispose() {
    this.disposed = true; this.stop(); this.buffers.clear(); this.victoryBuffer = null; this.victoryGeneration++;
    void this.context.close().catch(() => {});
  }
}
