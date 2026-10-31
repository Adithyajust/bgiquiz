import type { Game } from "./engine";

export const BUZZER_AUDIO_URL = "/audio/bunyi_buzer.mp3?v=4d74ba22b7e8";
export const VERDICT_AUDIO_URLS = {
  correct: "/audio/benar.mp3?v=a23e872d18e9",
  wrong: "/audio/salah.mp3?v=6f9b453e90bd",
} as const;
export type QuizSound = "buzzer" | keyof typeof VERDICT_AUDIO_URLS;
export type QuizClip = { src: string; currentTime: number; pause(): void; play(): Promise<void> };
type AudioGame = Pick<Game, "sessionId" | "epoch" | "buzzes" | "phase" | "feedback">;

// Reuse the media element unlocked by the Audio button for all three sounds.
// The server can reorder close buzzes, so identify them by question epoch.
export class QuizAudioPlayback {
  private clip: QuizClip | null = null;
  private source: string | null = null;
  private observed: string | null = null;
  private verdictObserved: string | null = null;
  private enabled = false;
  private sequence = 0;

  constructor(private createClip: () => QuizClip, private onError: () => void) {}

  observe(game: AudioGame | null | undefined, enabled: boolean): Promise<boolean> {
    const key = game?.buzzes.length ? JSON.stringify([game.sessionId, game.epoch]) : null;
    const verdict = game?.phase === "judged" ? game.feedback : null;
    const verdictKey = verdict ? JSON.stringify([game!.sessionId, game!.epoch, verdict]) : null;
    const fresh = key !== this.observed;
    const freshVerdict = verdictKey !== this.verdictObserved;
    this.observed = key;
    this.verdictObserved = verdictKey;
    const wasEnabled = this.enabled;
    this.enabled = enabled;
    // Muted polling must not interrupt the user-initiated activation preview.
    if (!enabled) { if (wasEnabled) this.stop(); return Promise.resolve(false); }
    // A snapshot may contain a buzzer and its verdict together. Prefer the verdict.
    if (freshVerdict && verdict) return this.play(VERDICT_AUDIO_URLS[verdict]);
    return fresh && key ? this.play(BUZZER_AUDIO_URL) : Promise.resolve(false);
  }

  // Call directly from the Audio button to unlock and test browser playback.
  preview(sound: QuizSound = "buzzer"): Promise<boolean> {
    return this.play(sound === "buzzer" ? BUZZER_AUDIO_URL : VERDICT_AUDIO_URLS[sound]);
  }

  private async play(url: string): Promise<boolean> {
    const sequence = ++this.sequence;
    try {
      const clip = this.clip ??= this.createClip();
      clip.pause();
      if (this.source !== url) { clip.src = url; this.source = url; }
      try { clip.currentTime = 0; } catch { /* A new clip already starts at zero. */ }
      await clip.play();
      return sequence === this.sequence;
    } catch {
      if (sequence === this.sequence) this.onError();
      return false;
    }
  }

  stop(): void {
    this.enabled = false;
    this.sequence++;
    try { if (this.clip) { this.clip.pause(); this.clip.currentTime = 0; } } catch {}
  }

  dispose(): void { this.stop(); this.clip = null; this.source = null; }
}
