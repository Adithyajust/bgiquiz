import { applyAction, publicQuiz, QuizError, type Action, type Quiz, type Snapshot, type AudioCue } from "./engine";
import { seedQuiz } from "./seed";
import { upgradeQuiz } from "./migrations";
import type { QuizRepository } from "./persistence";
export async function loadQuiz(db: QuizRepository): Promise<{ quiz: Quiz; revision: number }> {
  let row = await db.read();
  if (!row) {
    await db.initialize(JSON.stringify(seedQuiz()), Date.now());
    row = await db.read();
  }
  if (!row) throw new Error("Database initialization failed");
  for (let attempt = 0; attempt < 12; attempt++) {
    const original: Quiz = JSON.parse(row.document);
    const upgraded = upgradeQuiz(original);
    if (!upgraded.changed) return { quiz: upgraded.quiz, revision: row.revision };
    if (await db.compareAndSwap({ document: JSON.stringify(upgraded.quiz), expectedRevision: row.revision,
      eventId: crypto.randomUUID(), kind: "schema_migration_v3", payload: JSON.stringify({ from: original.schemaVersion ?? 1, to: 3 }), at: Date.now() })) {
      return { quiz: upgraded.quiz, revision: row.revision + 1 };
    }
    const latest = await db.read();
    if (!latest) throw new Error("Database snapshot missing during upgrade");
    row = latest;
  }
  throw new QuizError("Data kuis sedang diperbarui. Muat ulang halaman untuk melanjutkan.", 409);
}
export async function isOwner(db: QuizRepository, userId: string | null, claim = false) {
  if (!userId) return false;
  if (claim) await db.claimOwner(userId, Date.now());
  return await db.getOwner() === userId;
}
export async function snapshot(db: QuizRepository, admin = false): Promise<Snapshot> {
  const { quiz, revision } = await loadQuiz(db);
  const audioCues: AudioCue[] = [];
  for (const event of await db.readRecentEvents?.(revision) ?? []) {
    try {
      const cue = JSON.parse(event.payload).audio, at = Number(event.created_at);
      if (cue?.sessionId !== quiz.game.sessionId || !["buzz", "correct", "wrong"].includes(cue?.type)
        || (event.kind === "buzz" ? cue.type !== "buzz" : event.kind !== "judge" || cue.type === "buzz")
        || !Number.isSafeInteger(event.revision) || event.revision > revision || !Number.isSafeInteger(at)) continue;
      audioCues.push({ id: event.id, revision: event.revision, sessionId: cue.sessionId, type: cue.type, at });
    } catch { /* Old audit entries have no audio metadata. */ }
  }
  audioCues.sort((a,b) => a.revision - b.revision);
  return { quiz: admin ? quiz : publicQuiz(quiz), revision, serverNow: Date.now(), admin, audioCues };
}
export async function mutate(db: QuizRepository, action: Action, options: { admin: boolean; key?: string; expectedRevision?: number; now?: number; id?: string }): Promise<Snapshot> {
  const arrival = options.now ?? Date.now(), id = options.id ?? crypto.randomUUID();
  for (let attempt = 0; attempt < 12; attempt++) {
    const { quiz, revision } = await loadQuiz(db);
    if (action.type !== "buzz" && !options.admin) throw new QuizError("Hanya penyelenggara yang dapat mengubah kuis.", 403);
    if (action.type === "buzz" && !options.admin) {
      const team = quiz.teams.find(t => t.id === action.teamId);
      if (!team || !options.key || team.key !== options.key) throw new QuizError("Tautan buzzer tidak valid. Minta tautan dari penyelenggara.", 403);
    }
    if (action.type !== "buzz" && options.expectedRevision !== undefined && options.expectedRevision !== revision) throw new QuizError("Kuis telah berubah di perangkat lain. Data terbaru sudah dimuat; ulangi tindakan Anda.", 409);
    const updated = applyAction(quiz, action, arrival, id);
    let payload = action.type === "buzz"
      ? JSON.stringify({ teamId: action.teamId, epoch: action.epoch, receivedAt: arrival })
      : JSON.stringify({ type: action.type });
    if (action.type === "judge" || (action.type === "buzz" && quiz.game.buzzes.length === 0 && updated.game.buzzes.some(b => b.id === id))) {
      payload = JSON.stringify({ ...JSON.parse(payload), audio: { sessionId: updated.game.sessionId,
        type: action.type === "buzz" ? "buzz" : action.correct ? "correct" : "wrong" } });
    }
    if (action.type === "correctResult") {
      const before = quiz.results.find(r => r.id === action.resultId)!;
      const after = updated.results.find(r => r.id === action.resultId)!;
      payload = JSON.stringify({ type: action.type, resultId: after.id, teamId: after.teamId,
        reason: after.correction!.reason, correctionCount: after.correction!.count, possiblePoints: after.possiblePoints,
        before: { correct: before.correct, points: before.points, score: quiz.teams.find(t => t.id === before.teamId)!.score },
        after: { correct: after.correct, points: after.points, score: updated.teams.find(t => t.id === after.teamId)!.score } });
    }
    if (action.type === "declareChampion") payload = JSON.stringify({ type: action.type, championship: updated.championship });
    if (action.type === "setRoundParticipation") payload = JSON.stringify({ type: action.type, roundId: action.roundId, enabled: action.enabled,
      sessionId: updated.game.sessionId, before: quiz.game.excludedRoundIds ?? [], after: updated.game.excludedRoundIds ?? [] });
    if (await db.compareAndSwap({ document: JSON.stringify(updated), expectedRevision: revision, eventId: id, kind: action.type, payload, at: arrival })) {
      return { quiz: options.admin ? updated : publicQuiz(updated), revision: revision + 1, serverNow: Date.now(), admin: options.admin };
    }
  }
  throw new QuizError("Kuis sedang menerima banyak masukan. Silakan ulangi tindakan.", 409);
}
