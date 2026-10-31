/* Read-only maintenance queries. Select the quiz database in SSMS first. */
DECLARE @room NVARCHAR(40) = N'main';

-- Storage format. Migrated databases have storage_version = 2, document = NULL.
SELECT id, revision, storage_version, updated_at,
       CASE WHEN document IS NULL THEN N'Relasional' ELSE N'JSON lama, belum dimigrasi' END AS storage_format
FROM dbo.quiz_rooms WHERE id = @room;
SELECT room_id, revision, archived_at, DATALENGTH(document) AS archived_bytes
FROM dbo.quiz_legacy_snapshots WHERE room_id = @room;

-- Settings and basic row counts. Custom databases need not match the example counts.
SELECT room_id, schema_version, sound_enabled FROM dbo.quiz_settings WHERE room_id = @room;
SELECT N'Babak' AS entity, COUNT(*) AS total FROM dbo.quiz_rounds WHERE room_id = @room
UNION ALL SELECT N'Soal', COUNT(*) FROM dbo.quiz_questions WHERE room_id = @room
UNION ALL SELECT N'Pilihan jawaban', COUNT(*) FROM dbo.quiz_question_options WHERE room_id = @room
UNION ALL SELECT N'Grup', COUNT(*) FROM dbo.quiz_teams WHERE room_id = @room
UNION ALL SELECT N'Hasil sesi aktif', COUNT(*) FROM dbo.quiz_results WHERE room_id = @room;

-- Rounds and question banks.
SELECT id, type, batch_number, name, sort_order, question_count, duration, points, scoring_mode
FROM dbo.quiz_rounds WHERE room_id = @room ORDER BY sort_order;
SELECT r.name AS round_name, q.round_id, q.id AS question_id, q.number,
       q.text, q.answer, q.category, q.points, q.duration, q.notes
FROM dbo.quiz_questions AS q
INNER JOIN dbo.quiz_rounds AS r ON r.room_id = q.room_id AND r.id = q.round_id
WHERE q.room_id = @room ORDER BY r.sort_order, q.sort_order;
SELECT round_id, question_id, option_index + 1 AS option_number, text
FROM dbo.quiz_question_options WHERE room_id = @room
ORDER BY round_id, question_id, option_index;

-- Team identity and score. Excludes photo payloads and secret buzzer keys.
SELECT t.id, t.name, t.participants, s.score
FROM dbo.quiz_teams AS t
INNER JOIN dbo.quiz_team_scores AS s ON s.room_id = t.room_id AND s.team_id = t.id
WHERE t.room_id = @room ORDER BY s.score DESC, t.sort_order;

-- Current session. Preserve historical question/name text when master data changes.
SELECT v.id, v.round_id, v.round_name, t.name AS team_name,
       v.question_text, v.correct, v.points, v.judged_at
FROM dbo.quiz_results AS v
INNER JOIN dbo.quiz_teams AS t ON t.room_id = v.room_id AND t.id = v.team_id
WHERE v.room_id = @room ORDER BY v.sort_order;
SELECT round_id, team_id, answered_count FROM dbo.quiz_progress
WHERE room_id = @room ORDER BY round_id, team_id;
SELECT b.team_id, t.name, b.received_at, b.elapsed, b.sort_order
FROM dbo.quiz_buzzes AS b
INNER JOIN dbo.quiz_teams AS t ON t.room_id = b.room_id AND t.id = b.team_id
WHERE b.room_id = @room ORDER BY b.sort_order;
SELECT round_id, question_index, selected_team_id, active_team_id,
       phase, deadline, remaining, opened_at, feedback
FROM dbo.quiz_game_state WHERE room_id = @room;

-- Detect inconsistent question numbers, a possible consequence of manual edits.
SELECT round_id, number, COUNT(*) AS duplicate_count FROM dbo.quiz_questions
WHERE room_id = @room GROUP BY round_id, number HAVING COUNT(*) > 1;
