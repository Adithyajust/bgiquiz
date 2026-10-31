import { teamIds, QuizError, type Quiz, type Round, type TeamId } from "./engine";
import { seedQuiz } from "./seed";

// Existing SQL snapshots are upgraded atomically by loadQuiz. Keep the active
// question, server deadline, epoch and buzzer keys intact during the upgrade.
function upgradeToBatches(source: Quiz): Quiz {
  const q = structuredClone(source);
  const regular = q.rounds.filter(r => r.type === "reguler");
  if (regular.length === 3 && teamIds.every(id => regular.some(r => r.batchTeam === id))) {
    q.schemaVersion = 2;
    return q;
  }
  if (regular.length !== 1) throw new QuizError("Struktur babak lama tidak dikenali. Periksa cadangan data sebelum memperbarui aplikasi.", 409);
  const old = regular[0], g = q.game;
  const templates = seedQuiz().rounds.filter(r => r.type === "reguler");
  const ids = new Set(q.rounds.map(r => r.id));
  const batchIds: Record<TeamId, string> = { A: old.id, B: `${old.id}-b`, C: `${old.id}-c` };
  for (const teamId of ["B", "C"] as const) {
    const baseId = batchIds[teamId]; let suffix = 2;
    while (ids.has(batchIds[teamId])) batchIds[teamId] = `${baseId}-${suffix++}`;
    ids.add(batchIds[teamId]);
  }
  const wasRegular = g.roundId === old.id;
  const liveTeam = wasRegular ? g.selectedTeam ?? g.activeTeam : null;
  const batches: Round[] = teamIds.map((teamId, i) => {
    const oldKey = `${old.id}:${teamId}`;
    const used = teamId === "A" || liveTeam === teamId || (g.progress[oldKey] ?? 0) > 0
      || q.results.some(x => x.teamId === teamId && x.id.includes(`:${old.id}:${teamId}:`));
    const batch: Round = structuredClone(used ? old : templates[i]);
    batch.id = batchIds[teamId]; batch.batchTeam = teamId;
    batch.name = `${old.name.slice(0, 69).trimEnd()} · Batch ${i + 1}`;
    if (Object.hasOwn(g.progress, oldKey)) {
      g.progress[`${batch.id}:${teamId}`] = g.progress[oldKey];
      if (oldKey !== `${batch.id}:${teamId}`) delete g.progress[oldKey];
    }
    return batch;
  });
  // Three regular batches replace the former single slot. Other rounds keep
  // their relative order and every existing question and setting.
  q.rounds = [...q.rounds].sort((a,b) => a.order - b.order)
    .flatMap(r => r.id === old.id ? batches : [r]);
  q.rounds.forEach((r, i) => r.order = i + 1);
  if (wasRegular) g.roundId = batchIds[liveTeam ?? "A"];
  for (const result of q.results) {
    const marker = `:${old.id}:${result.teamId}:`;
    if (!result.id.includes(marker)) continue;
    const batch = batches.find(r => r.batchTeam === result.teamId)!;
    result.id = result.id.replace(marker, `:${batch.id}:${result.teamId}:`);
    result.round = batch.name;
  }
  q.schemaVersion = 2;
  return q;
}

export function upgradeQuiz(source: Quiz): { quiz: Quiz; changed: boolean } {
  if ((source.schemaVersion ?? 1) > 3) throw new QuizError("Versi data kuis lebih baru. Gunakan versi aplikasi yang sesuai.", 409);
  if (source.schemaVersion === 3) return { quiz: source, changed: false };
  const q = source.schemaVersion === 2 ? structuredClone(source) : upgradeToBatches(source);
  q.rounds.filter(r => r.type === "reguler").forEach((r, i) => {
    // A batch number identifies its question package, never its playing team.
    r.batchNumber = r.batchTeam ? teamIds.indexOf(r.batchTeam) + 1 : r.batchNumber ?? i + 1;
    delete r.batchTeam;
  });
  q.schemaVersion = 3;
  return { quiz: q, changed: true };
}
