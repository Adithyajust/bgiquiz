import { eventName } from "./engine";
import type { Buzz, Game, Question, Quiz, Result, Round, Team } from "./engine";

export type SqlRow = Record<string, string | number | boolean | null>;
type Table = { name: string; keys: string[]; columns: Record<string, string> };

// Order is deliberate: parents before children for writes, reversed for deletes.
// SQL identifiers and types come exclusively from this static allowlist.
export const quizTables: Table[] = [
  { name: "quiz_settings", keys: ["room_id"], columns: { room_id: "nvarchar(40)", schema_version: "int", sound_enabled: "bit", event_name: "nvarchar(60)" } },
  { name: "quiz_teams", keys: ["room_id", "id"], columns: { room_id: "nvarchar(40)", id: "nvarchar(1)", name: "nvarchar(40)", photo: "nvarchar(max)", buzzer_key: "nvarchar(128)", participants: "nvarchar(200)", sort_order: "int" } },
  { name: "quiz_team_scores", keys: ["room_id", "team_id"], columns: { room_id: "nvarchar(40)", team_id: "nvarchar(1)", score: "int" } },
  { name: "quiz_rounds", keys: ["room_id", "id"], columns: { room_id: "nvarchar(40)", id: "nvarchar(128)", type: "nvarchar(10)", batch_number: "int", batch_team: "nvarchar(1)", name: "nvarchar(80)", sort_order: "int", question_count: "int", duration: "int", points: "int", scoring_mode: "nvarchar(10)" } },
  { name: "quiz_questions", keys: ["room_id", "round_id", "id"], columns: { room_id: "nvarchar(40)", round_id: "nvarchar(128)", id: "nvarchar(128)", number: "int", text: "nvarchar(2000)", answer: "nvarchar(1000)", category: "nvarchar(60)", points: "int", duration: "int", notes: "nvarchar(2000)", sort_order: "int" } },
  { name: "quiz_question_options", keys: ["room_id", "round_id", "question_id", "option_index"], columns: { room_id: "nvarchar(40)", round_id: "nvarchar(128)", question_id: "nvarchar(128)", option_index: "int", text: "nvarchar(400)" } },
  { name: "quiz_game_state", keys: ["room_id"], columns: { room_id: "nvarchar(40)", round_id: "nvarchar(128)", question_index: "int", selected_team_id: "nvarchar(1)", active_team_id: "nvarchar(1)", phase: "nvarchar(12)", deadline: "bigint", remaining: "bigint", opened_at: "bigint", epoch: "nvarchar(128)", feedback: "nvarchar(7)", session_id: "nvarchar(128)", answer_visible: "bit" } },
  { name: "quiz_progress", keys: ["room_id", "progress_key"], columns: { room_id: "nvarchar(40)", progress_key: "nvarchar(260)", round_id: "nvarchar(128)", team_id: "nvarchar(1)", answered_count: "int" } },
  { name: "quiz_buzzes", keys: ["room_id", "id"], columns: { room_id: "nvarchar(40)", id: "nvarchar(128)", team_id: "nvarchar(1)", received_at: "bigint", elapsed: "bigint", sort_order: "int" } },
  { name: "quiz_results", keys: ["room_id", "id"], columns: { room_id: "nvarchar(40)", id: "nvarchar(400)", round_id: "nvarchar(128)", team_id: "nvarchar(1)", question_text: "nvarchar(2000)", round_name: "nvarchar(80)", correct: "bit", points: "int", judged_at: "bigint", sort_order: "int", possible_points: "int", correction_count: "int", corrected_at: "bigint", correction_reason: "nvarchar(500)" } },
  { name: "quiz_championships", keys: ["room_id"], columns: { room_id: "nvarchar(40)", session_id: "nvarchar(128)", declared_at: "bigint", team_ids: "nvarchar(30)", final_score: "int" } },
  { name: "quiz_round_exclusions", keys: ["room_id", "round_id"], columns: { room_id: "nvarchar(40)", round_id: "nvarchar(128)", session_id: "nvarchar(128)" } },
];
export type QuizRows = Record<string, SqlRow[]>;
export const emptyQuizRows = (): QuizRows => Object.fromEntries(quizTables.map(t => [t.name, []]));

export function quizToRows(q: Quiz, room = "main"): QuizRows {
  const rows = emptyQuizRows(), room_id = room;
  if (q.championship) rows.quiz_championships.push({ room_id, session_id: q.championship.sessionId, declared_at: q.championship.declaredAt, team_ids: JSON.stringify(q.championship.teamIds), final_score: q.championship.score });
  rows.quiz_settings.push({ room_id, schema_version: q.schemaVersion ?? 1, sound_enabled: q.sound, event_name: eventName(q) });
  q.teams.forEach((t, sort_order) => {
    rows.quiz_teams.push({ room_id, id: t.id, name: t.name, photo: t.photo, buzzer_key: t.key, participants: t.participants, sort_order });
    rows.quiz_team_scores.push({ room_id, team_id: t.id, score: t.score });
  });
  q.rounds.forEach(r => {
    rows.quiz_rounds.push({ room_id, id: r.id, type: r.type, batch_number: r.batchNumber ?? null, batch_team: r.batchTeam ?? null, name: r.name, sort_order: r.order, question_count: r.questionCount, duration: r.duration, points: r.points, scoring_mode: r.scoringMode });
    r.questions.forEach((v, sort_order) => {
      rows.quiz_questions.push({ room_id, round_id: r.id, id: v.id, number: v.number, text: v.text, answer: v.answer, category: v.category, points: v.points, duration: v.duration, notes: v.notes, sort_order });
      v.options.forEach((text, option_index) => rows.quiz_question_options.push({ room_id, round_id: r.id, question_id: v.id, option_index, text }));
    });
  });
  const g = q.game;
  for (const round_id of g.excludedRoundIds ?? []) {
    if (!q.rounds.some(r => r.id === round_id)) throw new Error(`Babak yang tidak dimainkan tidak ditemukan: ${round_id}`);
    rows.quiz_round_exclusions.push({ room_id, round_id, session_id: g.sessionId });
  }
  rows.quiz_game_state.push({ room_id, round_id: g.roundId, question_index: g.index, selected_team_id: g.selectedTeam, active_team_id: g.activeTeam, phase: g.phase, deadline: g.deadline, remaining: g.remaining, opened_at: g.openedAt, epoch: g.epoch, feedback: g.feedback, session_id: g.sessionId, answer_visible: g.answerVisible === true });
  Object.entries(g.progress).forEach(([progress_key, answered_count]) => {
    const r = q.rounds.find(r => progress_key === r.id || ["A", "B", "C"].some(t => progress_key === `${r.id}:${t}`));
    if (!r) throw new Error(`Progres tidak merujuk babak yang tersedia: ${progress_key}`);
    const team_id = progress_key === r.id ? null : progress_key.slice(r.id.length + 1);
    rows.quiz_progress.push({ room_id, progress_key, round_id: r.id, team_id, answered_count });
  });
  g.buzzes.forEach((b, sort_order) => rows.quiz_buzzes.push({ room_id, id: b.id, team_id: b.teamId, received_at: b.receivedAt, elapsed: b.elapsed, sort_order }));
  q.results.forEach((v, sort_order) => rows.quiz_results.push({ room_id, id: v.id, round_id: v.roundId ?? null, team_id: v.teamId, question_text: v.question, round_name: v.round, correct: v.correct, points: v.points, judged_at: v.at, sort_order, possible_points: v.possiblePoints ?? null, correction_count: v.correction?.count ?? 0, corrected_at: v.correction?.at ?? null, correction_reason: v.correction?.reason ?? "" }));
  // OPENJSON WITH can truncate strings. Validate widths before writing, also
  // during legacy migration, so an oversized source remains untouched.
  for (const table of quizTables) for (const row of rows[table.name]) {
    for (const [column, type] of Object.entries(table.columns)) {
      const limit = /^nvarchar\((\d+)\)$/.exec(type), value = row[column];
      if (limit && typeof value === "string" && value.length > Number(limit[1]))
        throw new Error(`Kolom ${table.name}.${column} melebihi ${limit[1]} karakter. Data sumber tidak diubah.`);
      if ((type === "int" || type === "bigint") && value !== null && !Number.isSafeInteger(value))
        throw new Error(`Kolom ${table.name}.${column} harus berupa bilangan bulat yang valid.`);
    }
  }
  return rows;
}

function ordered(rows: SqlRow[]) { return [...rows].sort((a, b) => Number(a.sort_order) - Number(b.sort_order)); }
function s(v: SqlRow[string]) { return String(v); }
function n(v: SqlRow[string]) { return Number(v); }
function nullableNumber(v: SqlRow[string]) { return v === null ? null : n(v); }

export function rowsToQuiz(rows: QuizRows): Quiz {
  const settings = rows.quiz_settings[0], g = rows.quiz_game_state[0];
  if (!settings || !g || rows.quiz_teams.length !== 3) throw new Error("Data relasional kuis belum lengkap. Periksa hasil migrasi database.");
  const teams: Team[] = ordered(rows.quiz_teams).map(t => {
    const score = rows.quiz_team_scores.find(x => x.team_id === t.id);
    if (!score) throw new Error(`Skor grup ${t.id} belum tersedia.`);
    return { id: s(t.id) as Team["id"], name: s(t.name), photo: s(t.photo), key: s(t.buzzer_key), participants: s(t.participants), score: n(score.score) };
  });
  const rounds: Round[] = ordered(rows.quiz_rounds).map(r => {
    const questions: Question[] = ordered(rows.quiz_questions.filter(v => v.round_id === r.id)).map(v => ({
      id: s(v.id), number: n(v.number), text: s(v.text), answer: s(v.answer), category: s(v.category), points: n(v.points), duration: nullableNumber(v.duration), notes: s(v.notes),
      options: rows.quiz_question_options.filter(o => o.round_id === r.id && o.question_id === v.id).sort((a, b) => n(a.option_index) - n(b.option_index)).map(o => s(o.text)),
    }));
    return { id: s(r.id), type: s(r.type) as Round["type"], ...(r.batch_number === null ? {} : { batchNumber: n(r.batch_number) }), ...(r.batch_team === null ? {} : { batchTeam: s(r.batch_team) as Team["id"] }), name: s(r.name), order: n(r.sort_order), questionCount: n(r.question_count), duration: n(r.duration), points: n(r.points), scoringMode: s(r.scoring_mode) as Round["scoringMode"], questions };
  });
  const buzzes: Buzz[] = ordered(rows.quiz_buzzes).map(b => ({ id: s(b.id), teamId: s(b.team_id) as Team["id"], receivedAt: n(b.received_at), elapsed: n(b.elapsed) }));
  const game: Game = { roundId: s(g.round_id), index: n(g.question_index), selectedTeam: g.selected_team_id as Game["selectedTeam"], activeTeam: g.active_team_id as Game["activeTeam"], phase: s(g.phase) as Game["phase"], deadline: nullableNumber(g.deadline), remaining: nullableNumber(g.remaining), openedAt: nullableNumber(g.opened_at), epoch: s(g.epoch), feedback: g.feedback as Game["feedback"], sessionId: s(g.session_id), answerVisible: !!g.answer_visible, buzzes, progress: Object.fromEntries(rows.quiz_progress.map(p => [s(p.progress_key), n(p.answered_count)])) };
  const excluded = (rows.quiz_round_exclusions ?? []).filter(row => s(row.session_id) === game.sessionId).map(row => s(row.round_id));
  if (excluded.some(id => !rounds.some(r => r.id === id))) throw new Error("Babak yang tidak dimainkan tidak ditemukan pada database.");
  if (excluded.length) game.excludedRoundIds = excluded;
  const results: Result[] = ordered(rows.quiz_results).map(v => ({ id: s(v.id), ...(v.round_id === null ? {} : { roundId: s(v.round_id) }), teamId: s(v.team_id) as Team["id"], question: s(v.question_text), round: s(v.round_name), correct: !!v.correct, points: n(v.points), at: n(v.judged_at), ...(v.possible_points == null ? {} : { possiblePoints: n(v.possible_points) }), ...(n(v.correction_count ?? 0) > 0 ? { correction: { count: n(v.correction_count), at: n(v.corrected_at), reason: s(v.correction_reason) } } : {}) }));
  const championship = rows.quiz_championships?.[0];
  const teamIds: unknown = championship ? JSON.parse(s(championship.team_ids)) : [];
  if (championship && (!Array.isArray(teamIds) || !teamIds.length || new Set(teamIds).size !== teamIds.length || teamIds.some(id => !teams.some(t => t.id === id)))) throw new Error("Data juara tidak valid.");
  return { schemaVersion: n(settings.schema_version), sound: !!settings.sound_enabled, eventName: typeof settings.event_name === "string" ? settings.event_name : "Quiz Night", teams, rounds, game, results,
    ...(championship ? { championship: { sessionId: s(championship.session_id), declaredAt: n(championship.declared_at), teamIds: teamIds as Team["id"][], score: n(championship.final_score) } } : {}) };
}

export function rowChanges(before: QuizRows, after: QuizRows) {
  return quizTables.map(table => {
    const key = (row: SqlRow) => JSON.stringify(table.keys.map(k => row[k]));
    const previous = new Map(before[table.name].map(row => [key(row), row]));
    const current = new Map(after[table.name].map(row => [key(row), row]));
    return { table, deleted: [...previous].filter(([id]) => !current.has(id)).map(([, row]) => row),
      changed: [...current].filter(([id, row]) => { const old = previous.get(id); return !old || Object.keys(table.columns).some(k => old[k] !== row[k]); }).map(([, row]) => row) };
  });
}

export function jsonColumns(table: Table) {
  return Object.entries(table.columns).map(([name, type]) => `[${name}] ${type} '$.${name}'`).join(", ");
}
export function keyJoin(table: Table, left: string, right: string) { return table.keys.map(k => `${left}.[${k}] = ${right}.[${k}]`).join(" AND "); }
