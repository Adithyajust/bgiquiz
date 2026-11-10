export type TeamId = "A" | "B" | "C";
export type Phase = "ready" | "buzzing" | "review" | "answering" | "paused" | "judged" | "finished";
export type Question = { id: string; number: number; text: string; answer: string; category: string; options: string[]; points: number; duration: number | null; notes: string; image?: string };
export type Round = { id: string; type: "reguler" | "rebutan"; batchNumber?: number; batchTeam?: TeamId; name: string; order: number; questionCount: number; duration: number; points: number; scoringMode: "round" | "question"; questions: Question[] };
export type Team = { id: TeamId; name: string; photo: string; score: number; key: string; participants: string };
export type Buzz = { id: string; teamId: TeamId; receivedAt: number; elapsed: number };
export type Result = { id: string; roundId?: string; teamId: TeamId; question: string; round: string; correct: boolean; points: number; at: number; possiblePoints?: number; correction?: { count: number; at: number; reason: string } };
export type Game = { roundId: string; index: number; selectedTeam: TeamId | null; activeTeam: TeamId | null; phase: Phase; deadline: number | null; remaining: number | null; openedAt: number | null; epoch: string; buzzes: Buzz[]; feedback: "correct" | "wrong" | null; progress: Record<string, number>; sessionId: string; answerVisible?: boolean; excludedRoundIds?: string[] };
export type Championship = { sessionId: string; declaredAt: number; teamIds: TeamId[]; score: number };
export type Quiz = { schemaVersion?: number; rounds: Round[]; teams: Team[]; game: Game; results: Result[]; sound: boolean; eventName?: string; championship?: Championship };
export type AudioCueType = "buzz" | "correct" | "wrong";
export type AudioCue = { id: string; revision: number; sessionId: string; type: AudioCueType; at: number };
export type Snapshot = { quiz: Quiz; revision: number; serverNow: number; admin: boolean; audioCues?: AudioCue[] };
export type Action = { type: string; [key: string]: unknown };
export class QuizError extends Error { constructor(message: string, public status = 400) { super(message); } }
export const teamIds: TeamId[] = ["A", "B", "C"];
export const MAX_REGULAR_BATCHES = 19;
export const DEFAULT_EVENT_NAME = "Quiz Night";
export const MAX_EVENT_NAME_LENGTH = 60;
export function eventName(q: Pick<Quiz, "eventName">) { return q.eventName?.trim() || DEFAULT_EVENT_NAME; }
export function batchNumber(r: Round) { return r.batchNumber ?? (r.batchTeam ? teamIds.indexOf(r.batchTeam) + 1 : 0); }
export function regularReboundOwner(r: Round): TeamId | undefined {
  return r.type === "reguler" ? teamIds[batchNumber(r) - 1] : undefined;
}
export function regularBatches(q: Quiz) { return q.rounds.filter(r => r.type === "reguler").sort((a,b) => a.order - b.order); }
export function competitionProgress(q: Quiz) {
  const rounds = [...q.rounds].sort((a,b) => a.order - b.order).map(r => {
    const answered = r.type === "reguler" ? Math.max(0, ...q.teams.map(t => q.game.progress[`${r.id}:${t.id}`] ?? 0)) : q.game.progress[r.id] ?? 0;
    const canExclude = answered === 0 && !q.results.some(result => result.roundId === r.id || result.id.includes(`:${r.id}:`));
    const exclusion = canExclude && q.game.excludedRoundIds?.includes(r.id) ? "host" : answered === 0 && r.questions.length === 0 ? "empty" : null;
    return { id: r.id, name: r.name, answered: Math.min(answered, r.questionCount), total: r.questionCount,
      complete: r.questionCount > 0 && answered >= r.questionCount, excluded: exclusion !== null, exclusion, canExclude };
  });
  const complete = q.rounds.some(r => r.type === "reguler") && q.rounds.some(r => r.type === "rebutan")
    && rounds.some(r => r.complete && !r.excluded) && rounds.every(r => r.complete || r.excluded);
  return { rounds, complete, ready: complete && ["ready", "judged", "finished"].includes(q.game.phase) };
}
export function championTeams(q: Quiz): Team[] {
  const result = q.championship;
  if (!result || result.sessionId !== q.game.sessionId || !competitionProgress(q).complete || !q.teams.length) return [];
  const score = Math.max(...q.teams.map(t => t.score)), leaders = q.teams.filter(t => t.score === score);
  return result.score === score && leaders.length === result.teamIds.length && leaders.every(t => result.teamIds.includes(t.id)) ? leaders : [];
}
export function batchDeleteReason(q: Quiz, r: Round) {
  if (r.type !== "reguler") return "Hanya batch reguler yang dapat dihapus.";
  if (regularBatches(q).length <= 1) return "Sisakan minimal satu batch reguler.";
  if (!["ready", "judged", "finished"].includes(q.game.phase)) return "Selesaikan soal yang sedang berjalan terlebih dahulu.";
  if (Object.entries(q.game.progress).some(([key, value]) => key.startsWith(`${r.id}:`) && value > 0)
    || q.results.some(result => result.roundId === r.id || result.id.includes(`:${r.id}:`)))
    return "Batch ini sudah memiliki progres atau hasil. Ekspor hasil dan reset sesi terlebih dahulu jika ingin menghapusnya.";
  return "";
}
export function currentRound(q: Quiz) { return q.rounds.find(r => r.id === q.game.roundId)!; }
export function currentQuestion(q: Quiz) { return currentRound(q)?.questions[q.game.index]; }
// The regular turn uses openedAt only once its question is passed to the other groups.
export function isRegularRebound(q: Quiz) {
  return currentRound(q)?.type === "reguler" && typeof q.game.openedAt === "number";
}
export function isBuzzerReady(q: Quiz, teamId: TeamId) {
  const g = q.game;
  if (isRegularRebound(q)) return g.phase === "buzzing" && teamId !== g.selectedTeam;
  if (currentRound(q).type === "rebutan") return g.phase === "buzzing";
  return g.phase === "answering" && teamId === g.selectedTeam;
}
// Use the same display rules for Arena and participant devices.
export function questionView(q: Quiz, preview = false) {
  const finished = q.game.phase === "finished";
  const question = preview || !["ready", "finished"].includes(q.game.phase) ? currentQuestion(q) : undefined;
  return { question, finished, showAnswer: q.game.answerVisible === true && !!question?.answer && !finished };
}
export function pointsFor(r: Round, q: Question) { return r.scoringMode === "round" ? r.points : q.points; }
export function durationFor(r: Round, q: Question) { return q?.duration ?? r.duration; }
const REBOUND_RESULT_PREFIX = "rebound-";
function resultId(q: Quiz, question: Question, slot?: TeamId) {
  const g = q.game, r = currentRound(q);
  const regularSlot = isRegularRebound(q) ? `${REBOUND_RESULT_PREFIX}${g.selectedTeam}` : g.activeTeam;
  const attempt = slot ?? (r.type === "reguler" ? regularSlot : "all");
  return `${g.sessionId}:${r.id}:${attempt}:${question.id}`;
}
function pairedResult(q: Quiz, result: Result) {
  const prefix = `${q.game.sessionId}:${result.roundId}:`;
  if (!result.roundId || !result.id.startsWith(prefix)) return undefined;
  const attempt = result.id.slice(prefix.length);
  const paired = attempt.startsWith(REBOUND_RESULT_PREFIX)
    ? attempt.slice(REBOUND_RESULT_PREFIX.length)
    : REBOUND_RESULT_PREFIX + attempt;
  return q.results.find(other => other.id === prefix + paired);
}
export function currentResult(q: Quiz) { const question = currentQuestion(q); return question && q.game.activeTeam ? q.results.find(x => x.id === resultId(q, question)) : undefined; }
// Legacy wrong answers did not retain their original value. Ask the host to
// confirm it instead of silently using a question bank that may have changed.
export function resultPossiblePoints(result: Result): number | null { return result.possiblePoints ?? (result.correct ? result.points : null); }
function assert(ok: unknown, message: string): asserts ok { if (!ok) throw new QuizError(message); }
function int(v: unknown, label: string, min: number, max: number) { const n = Number(v); assert(Number.isInteger(n) && n >= min && n <= max, `${label} harus berupa angka ${min} sampai ${max}.`); return n; }
function str(v: unknown, label: string, max: number, required = true) { assert(typeof v === "string", `${label} tidak valid.`); const s = v.trim(); assert(!required || s.length > 0, `${label} wajib diisi.`); assert(s.length <= max, `${label} maksimal ${max} karakter.`); return s; }
export function validateQuestion(input: unknown, fallbackId: string): Question {
  assert(input && typeof input === "object", "Data soal tidak valid.");
  const v = input as Record<string, unknown>;
  const text = str(v.text, "Pertanyaan", 2000), answer = str(v.answer, "Jawaban benar", 1000);
  assert(Array.isArray(v.options) && v.options.length <= 6, "Pilihan jawaban tidak valid.");
  const options = v.options.map(o => str(o, "Pilihan jawaban", 400));
  if (options.length) { assert(options.length >= 2, "Sediakan minimal dua pilihan jawaban."); assert(new Set(options).size === options.length, "Pilihan jawaban tidak boleh sama."); assert(options.includes(answer), "Jawaban benar harus sesuai salah satu pilihan."); }
  const image = v.image === undefined || v.image === null || v.image === "" ? undefined : str(v.image, "Gambar soal", 300000);
  assert(!image || options.length === 0, "Gambar hanya dapat digunakan pada jenis Jawaban singkat.");
  assert(!image || /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(image), "Format gambar soal tidak valid. Gunakan PNG, JPG, atau WebP.");
  return { id: fallbackId, number: int(v.number, "Nomor soal", 1, 100), text, answer, options, category: str(v.category ?? "Pengetahuan umum", "Kategori", 60), points: int(v.points, "Nilai soal", 0, 1000), duration: v.duration === null || v.duration === "" ? null : int(v.duration, "Waktu menjawab", 1, 600), notes: str(v.notes ?? "", "Catatan pembawa acara", 2000, false), ...(image ? { image } : {}) };
}
function ensureRoundReady(r: Round) {
  assert(r.questions.length >= r.questionCount, `Lengkapi ${r.questionCount} soal di bank soal terlebih dahulu. Saat ini tersedia ${r.questions.length} soal.`);
  r.questions.slice(0, r.questionCount).forEach((q, i) => { assert(q.number === i + 1, "Nomor soal harus berurutan mulai dari 1."); validateQuestion(q, q.id); });
}
function roundSettings(v: Record<string, unknown>) {
  assert(v.scoringMode === "round" || v.scoringMode === "question", "Mode nilai tidak valid.");
  return {
    name: str(v.name, "Nama babak", 80), questionCount: int(v.questionCount, "Jumlah soal", 1, 100),
    duration: int(v.duration, "Durasi", 1, 600), points: int(v.points, "Nilai", 0, 1000),
    scoringMode: v.scoringMode as Round["scoringMode"]
  };
}
function uniqueBatchName(q: Quiz, name: string, exceptId?: string) {
  assert(!regularBatches(q).some(r => r.id !== exceptId && r.name.toLocaleLowerCase("id-ID") === name.toLocaleLowerCase("id-ID")), "Nama batch sudah digunakan. Pilih nama lain.");
}
function progressKey(r: Round, t: TeamId | null) { return r.type === "reguler" ? `${r.id}:${t}` : r.id; }
function resetQuestion(g: Game, epoch: string, phase: Phase = "ready") { Object.assign(g, { phase, activeTeam: null, deadline: null, remaining: null, openedAt: null, epoch, buzzes: [], feedback: null, answerVisible: false }); }
function openBuzzer(g: Game, epoch: string, now: number) {
  resetQuestion(g, epoch, "buzzing");
  g.openedAt = now;
}
function finishQuestion(g: Game, r: Round, correct: boolean, now: number) {
  g.progress[progressKey(r, g.selectedTeam)] = g.index + 1;
  g.remaining = g.deadline !== null ? Math.max(0, g.deadline - now) : g.remaining;
  g.feedback = correct ? "correct" : "wrong";
  g.phase = "judged";
  g.deadline = null;
}
export function applyAction(source: Quiz, a: Action, now: number, uid: string): Quiz {
  const q: Quiz = structuredClone(source), g = q.game;
  const r = currentRound(q), question = currentQuestion(q);
  const rebound = isRegularRebound(q), buzzerRound = r?.type === "rebutan" || rebound;
  const quiet = ["ready", "judged", "finished"].includes(g.phase);
  switch (a.type) {
    case "declareChampion": {
      const progress = competitionProgress(q);
      const pending = progress.rounds.filter(r => !r.complete && !r.excluded).map(r => r.name);
      assert(progress.complete, `Selesaikan seluruh babak sebelum menentukan juara${pending.length ? `: ${pending.join(", ")}` : "."}`);
      assert(progress.ready, "Selesaikan soal yang sedang berjalan sebelum menentukan juara.");
      if (championTeams(q).length) return q;
      assert(q.teams.length > 0 && q.teams.every(t => Number.isSafeInteger(t.score) && t.score >= 0), "Nilai akhir grup tidak valid.");
      const score = Math.max(...q.teams.map(t => t.score));
      q.championship = { sessionId: g.sessionId, declaredAt: now, score, teamIds: q.teams.filter(t => t.score === score).map(t => t.id) };
      g.index = r.questionCount; resetQuestion(g, uid, "finished");
      break;
    }
    case "clearChampion": delete q.championship; break;
    case "setRoundParticipation": {
      assert(quiet, "Selesaikan soal yang sedang berjalan sebelum mengubah babak yang dimainkan.");
      assert(typeof a.enabled === "boolean", "Status babak tidak valid.");
      const target = competitionProgress(q).rounds.find(round => round.id === a.roundId);
      assert(target, "Babak tidak ditemukan.");
      assert(a.enabled || target.canExclude, "Babak ini sudah dimainkan. Selesaikan sisa soal; nilai dan progres tidak boleh dilewati.");
      const ids = new Set(g.excludedRoundIds ?? []);
      if (a.enabled) ids.delete(target.id); else ids.add(target.id);
      if (ids.size) g.excludedRoundIds = [...ids]; else delete g.excludedRoundIds;
      break;
    }
    case "saveEventSettings": {
      const name = str(a.eventName, "Nama acara", MAX_EVENT_NAME_LENGTH);
      assert(!/[\r\n\t]/.test(name), "Nama acara harus berupa satu baris teks.");
      q.eventName = name; break;
    }
    case "setAnswerVisibility": {
      assert(typeof a.visible === "boolean", "Status jawaban tidak valid.");
      assert(a.epoch === g.epoch && a.questionId === question?.id, "Soal sudah berubah. Muat ulang sebelum membuka jawaban.");
      assert(question && g.phase !== "finished", "Tidak ada jawaban untuk ditampilkan.");
      assert(!a.visible || !!question.answer.trim(), "Lengkapi jawaban benar pada Bank Soal terlebih dahulu.");
      g.answerVisible = a.visible; break;
    }
    case "selectRound": {
      assert(quiet, "Selesaikan soal yang sedang berjalan terlebih dahulu.");
      const next = q.rounds.find(x => x.id === a.roundId); assert(next, "Babak tidak ditemukan.");
      g.roundId = next.id; g.selectedTeam = null;
      g.index = next.type === "rebutan" ? (g.progress[next.id] ?? 0) : 0;
      resetQuestion(g, uid, g.index >= next.questionCount ? "finished" : "ready"); break;
    }
    case "selectTeam": {
      assert(r.type === "reguler", "Pilihan grup hanya berlaku pada babak reguler."); assert(quiet, "Selesaikan soal yang sedang berjalan terlebih dahulu.");
      assert(teamIds.includes(a.teamId as TeamId), "Grup tidak valid.");
      if (g.phase === "judged") throw new QuizError("Klik soal berikutnya sebelum mengganti grup.");
      g.selectedTeam = a.teamId as TeamId; g.index = g.progress[progressKey(r, g.selectedTeam)] ?? 0;
      resetQuestion(g, uid, g.index >= r.questionCount ? "finished" : "ready"); break;
    }
    case "start": {
      assert(!g.excludedRoundIds?.includes(r.id), "Babak ini ditandai Tidak dimainkan. Klik Ikutkan lagi pada panel Tentukan Juara sebelum memulai.");
      assert(g.phase === "ready", "Soal sudah dimulai."); ensureRoundReady(r); assert(question, "Soal belum tersedia.");
      g.answerVisible = false;
      if (r.type === "reguler") { assert(g.selectedTeam, "Pilih grup yang bermain terlebih dahulu."); g.activeTeam = g.selectedTeam; g.phase = "answering"; g.deadline = now + durationFor(r, question) * 1000; }
      else openBuzzer(g, uid, now);
      break;
    }
    case "buzz": {
      assert(teamIds.includes(a.teamId as TeamId), "Grup tidak valid."); assert(a.epoch === g.epoch, "Buzzer ini berasal dari soal sebelumnya. Tunggu sinkronisasi.");
      if (!buzzerRound) {
        assert(g.selectedTeam === a.teamId, "Hanya grup terpilih yang dapat menjawab.");
        if (g.phase === "answering" && g.buzzes.some(b => b.teamId === a.teamId)) return q;
        assert(g.phase === "answering", "Buzzer belum aktif. Tunggu host memulai soal."); ensureRoundReady(r);
        g.activeTeam = g.selectedTeam; g.phase = "answering"; g.deadline ??= now + durationFor(r, question) * 1000;
        g.buzzes = [{ id: uid, teamId: a.teamId as TeamId, receivedAt: now, elapsed: 0 }];
      } else {
        assert(!rebound || a.teamId !== g.selectedTeam, "Buzzer grup utama terkunci selama lemparan.");
        assert(g.phase === "buzzing" || g.phase === "review", "Buzzer terkunci. Tunggu soal berikutnya.");
        if (g.buzzes.some(b => b.teamId === a.teamId)) return q;
        assert(g.phase === "buzzing" || now - g.buzzes[0].receivedAt <= 250, "Buzzer sudah terkunci oleh grup lain.");
        g.buzzes.push({ id: uid, teamId: a.teamId as TeamId, receivedAt: now, elapsed: Math.max(0, now - (g.openedAt ?? now)) });
        g.buzzes.sort((a, b) => a.receivedAt - b.receivedAt || a.id.localeCompare(b.id)); g.phase = "review";
      }
      break;
    }
    case "confirmBuzz": {
      assert(g.phase === "review" && buzzerRound, "Tidak ada urutan buzzer yang perlu dikonfirmasi.");
      assert(g.buzzes.some(b => b.teamId === a.teamId), "Grup ini tidak tercatat dalam urutan buzzer.");
      g.activeTeam = a.teamId as TeamId; g.phase = "answering"; g.deadline = now + durationFor(r, question) * 1000; break;
    }
    case "reopen": {
      assert(buzzerRound && ["review", "buzzing"].includes(g.phase), "Buzzer tidak dapat dibuka kembali pada tahap ini.");
      openBuzzer(g, uid, now); break;
    }
    case "skipRegularRebound": {
      assert(rebound && g.phase === "buzzing", "Lewati hanya saat buzzer lemparan terbuka dan belum ditekan.");
      g.openedAt = null;
      g.activeTeam = g.selectedTeam;
      g.remaining = 0;
      finishQuestion(g, r, false, now);
      break;
    }
    case "pause": assert(g.phase === "answering" && g.deadline, "Timer belum berjalan."); g.remaining = Math.max(0, g.deadline - now); g.deadline = null; g.phase = "paused"; break;
    case "resume": assert(g.phase === "paused", "Timer tidak sedang dijeda."); g.deadline = now + (g.remaining ?? 0); g.phase = "answering"; g.remaining = null; break;
    case "judge": {
      assert(["answering", "paused"].includes(g.phase) && g.activeTeam, "Konfirmasi grup yang menjawab sebelum menilai."); assert(typeof a.correct === "boolean", "Penilaian tidak valid.");
      assert(r.type !== "reguler" || (rebound ? g.selectedTeam !== g.activeTeam : g.selectedTeam === g.activeTeam), "Grup yang menjawab tidak sesuai giliran.");
      const id = resultId(q, question);
      assert(!q.results.some(x => x.id === id), "Soal ini sudah mendapat penilaian.");
      const possiblePoints = pointsFor(r, question), points = a.correct ? possiblePoints : 0;
      q.teams.find(t => t.id === g.activeTeam)!.score += points;
      q.results.push({ id, roundId: r.id, teamId: g.activeTeam, question: question.text, round: r.name, correct: a.correct, points, possiblePoints, at: now });
      if (!a.correct && !rebound && regularReboundOwner(r) === g.selectedTeam) openBuzzer(g, uid, now);
      else finishQuestion(g, r, a.correct, now);
      break;
    }
    case "correctResult": {
      const id = str(a.resultId, "Hasil penilaian", 400), result = q.results.find(x => x.id === id);
      assert(result, "Hasil penilaian tidak ditemukan. Sesi mungkin sudah direset.");
      assert(typeof a.correct === "boolean", "Hasil koreksi harus Benar atau Salah.");
      if (a.expectedCorrect !== result.correct || a.expectedPoints !== result.points || a.expectedCorrectionCount !== (result.correction?.count ?? 0))
        throw new QuizError("Hasil penilaian sudah berubah. Tutup form dan buka kembali hasil terbaru sebelum mengoreksi.", 409);
      assert(a.correct !== result.correct, "Pilih hasil yang berbeda dari penilaian saat ini.");
      if (a.correct) {
        if (rebound && !quiet && question && g.selectedTeam)
          assert(id !== resultId(q, question, g.selectedTeam), "Selesaikan atau lewati lemparan sebelum mengoreksi jawaban grup utama.");
        assert(!pairedResult(q, result)?.correct, "Soal ini sudah tercatat benar pada giliran lain. Koreksi hasil itu terlebih dahulu.");
      }
      const reason = str(a.reason, "Alasan koreksi", 500);
      const possiblePoints = int(resultPossiblePoints(result) ?? a.possiblePoints, "Nilai jawaban benar", 0, 1000);
      const nextPoints = a.correct ? possiblePoints : 0;
      const team = q.teams.find(t => t.id === result.teamId);
      assert(team, "Grup pada hasil penilaian tidak ditemukan.");
      const nextScore = team.score + nextPoints - result.points;
      assert(Number.isSafeInteger(nextScore) && nextScore >= 0, "Skor grup tidak konsisten dengan hasil. Hubungi operator sebelum mengoreksi.");
      const isCurrent = g.phase === "judged" && currentResult(q)?.id === result.id;
      team.score = nextScore;
      result.correct = a.correct; result.points = nextPoints; result.possiblePoints = possiblePoints;
      result.correction = { count: (result.correction?.count ?? 0) + 1, at: now, reason };
      if (isCurrent) g.feedback = a.correct ? "correct" : "wrong";
      break;
    }
    case "next": {
      assert(g.phase === "judged", "Nilai jawaban sebelum melanjutkan ke soal berikutnya.");
      g.index += 1; resetQuestion(g, uid, g.index >= r.questionCount ? "finished" : "ready"); break;
    }
    case "saveRound": {
      assert(quiet, "Jeda pengubahan pengaturan sampai soal selesai.");
      const v = a.round as Record<string, unknown>; assert(v, "Pengaturan tidak valid.");
      const target = q.rounds.find(x => x.id === v.id); assert(target, "Babak tidak ditemukan.");
      const settings = roundSettings(v), order = int(v.order, "Urutan babak", 1, 20);
      assert(!q.rounds.some(x => x.id !== target.id && x.order === order), "Urutan babak sudah digunakan.");
      if (target.type === "reguler") uniqueBatchName(q, settings.name, target.id);
      Object.assign(target, settings, { order });
      if (g.roundId === target.id && g.phase !== "judged") {
        const phase = g.index >= target.questionCount ? "finished" : "ready";
        if (phase !== g.phase) resetQuestion(g, uid, phase);
      }
      q.rounds.sort((a,b) => a.order - b.order); break;
    }
    case "createBatch": {
      assert(quiet, "Selesaikan soal yang sedang berjalan terlebih dahulu.");
      const batches = regularBatches(q);
      assert(batches.length < MAX_REGULAR_BATCHES && q.rounds.length < 20, `Maksimal ${MAX_REGULAR_BATCHES} batch reguler dan 20 babak keseluruhan.`);
      const v = a.round as Record<string, unknown>; assert(v, "Pengaturan tidak valid.");
      const settings = roundSettings(v); uniqueBatchName(q, settings.name);
      const template = a.templateRoundId ? batches.find(r => r.id === a.templateRoundId) : null;
      assert(!a.templateRoundId || template, "Batch sumber tidak ditemukan.");
      const id = `reguler-${uid}`; assert(!q.rounds.some(r => r.id === id), "Identitas batch sudah digunakan. Ulangi tindakan.");
      const created: Round = { ...settings, id, type: "reguler", batchNumber: Math.max(0, ...batches.map(batchNumber)) + 1, order: 1,
        questions: template ? template.questions.map((question, i) => ({ ...structuredClone(question), id: `${id}-q-${i + 1}` })) : [] };
      q.rounds.sort((a,b) => a.order - b.order);
      const last = q.rounds.reduce((index, round, i) => round.type === "reguler" ? i : index, -1);
      q.rounds.splice(last + 1, 0, created); q.rounds.forEach((round, i) => round.order = i + 1);
      break;
    }
    case "moveBatch": {
      assert(quiet, "Selesaikan soal yang sedang berjalan terlebih dahulu.");
      const batches = regularBatches(q), index = batches.findIndex(r => r.id === a.roundId);
      assert(index >= 0, "Batch tidak ditemukan.");
      assert(a.direction === "up" || a.direction === "down", "Arah perpindahan tidak valid.");
      const other = batches[index + (a.direction === "up" ? -1 : 1)]; assert(other, "Batch sudah berada di urutan tersebut.");
      [batches[index].order, other.order] = [other.order, batches[index].order];
      q.rounds.sort((a,b) => a.order - b.order); break;
    }
    case "deleteBatch": {
      const target = q.rounds.find(r => r.id === a.roundId); assert(target, "Batch tidak ditemukan.");
      const reason = batchDeleteReason(q, target); assert(!reason, reason);
      assert(a.confirm === "HAPUS", "Konfirmasi HAPUS untuk menghapus batch.");
      q.rounds = q.rounds.filter(r => r.id !== target.id).sort((a,b) => a.order - b.order);
      q.rounds.forEach((round, i) => round.order = i + 1);
      for (const key of Object.keys(g.progress)) if (key.startsWith(`${target.id}:`)) delete g.progress[key];
      if (g.excludedRoundIds) { g.excludedRoundIds = g.excludedRoundIds.filter(id => id !== target.id); if (!g.excludedRoundIds.length) delete g.excludedRoundIds; }
      if (g.roundId === target.id) { g.roundId = regularBatches(q)[0].id; g.index = 0; g.selectedTeam = null; resetQuestion(g, uid); }
      break;
    }
    case "saveQuestion": {
      assert(quiet, "Ubah soal setelah pertanyaan yang berjalan selesai.");
      const target = q.rounds.find(x => x.id === a.roundId); assert(target, "Babak tidak ditemukan.");
      const v = a.question as Record<string, unknown>; assert(v, "Soal tidak valid.");
      const existing = target.questions.find(x => x.id === v.id);
      const fresh = validateQuestion(v, existing?.id ?? uid);
      assert(!target.questions.some(x => x.id !== fresh.id && x.number === fresh.number), "Nomor soal sudah digunakan.");
      if (existing) target.questions[target.questions.indexOf(existing)] = fresh; else { assert(target.questions.length < 100, "Maksimal 100 soal per babak."); target.questions.push(fresh); }
      target.questions.sort((a,b) => a.number - b.number);
      if (target.id === g.roundId) g.answerVisible = false;
      break;
    }
    case "deleteQuestion": {
      assert(quiet, "Hapus soal setelah pertanyaan yang berjalan selesai.");
      const target = q.rounds.find(x => x.id === a.roundId); assert(target, "Babak tidak ditemukan.");
      assert(target.questions.some(x => x.id === a.questionId), "Soal tidak ditemukan.");
      target.questions = target.questions.filter(x => x.id !== a.questionId).map((x,i) => ({...x,number:i+1}));
      if (target.id === g.roundId) g.answerVisible = false;
      break;
    }
    case "saveTeam": {
      const t = q.teams.find(x => x.id === a.teamId); assert(t, "Grup tidak ditemukan.");
      t.name = str(a.name, "Nama grup", 40); t.participants = str(a.participants ?? "", "Nama peserta", 200, false);
      assert(!q.teams.some(other => other.id !== t.id && other.name.toLocaleLowerCase("id-ID") === t.name.toLocaleLowerCase("id-ID")), "Nama grup sudah digunakan. Pilih nama lain.");
      assert(typeof a.photo === "string" && a.photo.length <= 300000 && (!a.photo || /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(a.photo)), "Foto harus berupa PNG, JPG, atau WebP maksimal 220 KB setelah kompresi.");
      t.photo = a.photo; break;
    }
    case "reset": {
      assert(a.confirm === "RESET", "Ketik RESET untuk mengulang kuis.");
      q.teams.forEach(t => t.score = 0); g.progress = {}; delete g.excludedRoundIds; g.index = 0; g.selectedTeam = null; g.sessionId = uid; resetQuestion(g, uid); q.results = []; break;
    }
    case "sound": q.sound = !!a.enabled; break;
    default: throw new QuizError("Perintah tidak dikenal.");
  }
  // A changed score or resumed game requires a fresh host announcement.
  if (q.championship && !["declareChampion", "clearChampion", "sound", "saveTeam", "saveEventSettings"].includes(a.type)) delete q.championship;
  return q;
}
export function publicQuiz(q: Quiz): Quiz {
  const safe = structuredClone(q);
  safe.teams.forEach(t => t.key = "");
  safe.rounds.forEach(r => r.questions.forEach((x,i) => {
    const current = r.id === q.game.roundId && i === q.game.index && !["ready", "finished"].includes(q.game.phase);
    if (!(current && q.game.answerVisible === true && q.game.phase !== "finished")) x.answer = "";
    x.notes = "";
    if (!current) { x.text = ""; x.options = []; x.category = ""; delete x.image; }
  }));
  safe.results = [];
  return safe;
}
