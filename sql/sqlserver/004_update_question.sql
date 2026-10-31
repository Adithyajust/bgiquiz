/* Optional manual maintenance template. Stop the application first.
   Replace the four input values below. This script deliberately refuses to
   execute until the placeholder text has been replaced. Use /admin for normal
   question editing. Never paste credentials or buzzer keys into this script. */
DECLARE @room NVARCHAR(40) = N'main';
DECLARE @round NVARCHAR(128) = N'reguler';
DECLARE @question NVARCHAR(128) = N'reg-1';
DECLARE @text NVARCHAR(MAX) = N'ISI_PERTANYAAN_BARU';
DECLARE @answer NVARCHAR(MAX) = N'ISI_JAWABAN_BENAR';

IF @text = N'ISI_PERTANYAAN_BARU' OR @answer = N'ISI_JAWABAN_BENAR'
    THROW 51000, 'Replace the question and answer placeholders first.', 1;
IF LEN(LTRIM(RTRIM(@text))) = 0 OR DATALENGTH(@text) > 4000
    OR LEN(LTRIM(RTRIM(@answer))) = 0 OR DATALENGTH(@answer) > 2000
    THROW 51000, 'Question or answer is blank or exceeds its column limit.', 1;

SET XACT_ABORT ON;
BEGIN TRY
    BEGIN TRANSACTION;
    DECLARE @revision INT, @storage INT;
    SELECT @revision = revision, @storage = storage_version
    FROM dbo.quiz_rooms WITH (UPDLOCK, HOLDLOCK) WHERE id = @room;
    IF @revision IS NULL OR @storage <> 2
        THROW 51000, 'Room is missing or relational migration has not completed.', 1;
    IF NOT EXISTS (SELECT 1 FROM dbo.quiz_game_state WHERE room_id = @room AND phase IN ('ready', 'judged', 'finished'))
        THROW 51000, 'Finish the active question before editing.', 1;
    IF EXISTS (SELECT 1 FROM dbo.quiz_question_options WHERE room_id = @room AND round_id = @round AND question_id = @question)
       AND NOT EXISTS (SELECT 1 FROM dbo.quiz_question_options WHERE room_id = @room AND round_id = @round AND question_id = @question AND text COLLATE Latin1_General_100_BIN2 = @answer COLLATE Latin1_General_100_BIN2 AND DATALENGTH(text) = DATALENGTH(@answer))
        THROW 51000, 'For multiple choice, the answer must match an existing option exactly.', 1;

    UPDATE dbo.quiz_questions SET text = @text, answer = @answer
    WHERE room_id = @room AND round_id = @round AND id = @question;
    IF @@ROWCOUNT <> 1 THROW 51000, 'Question identity was not found.', 1;

    DECLARE @at BIGINT = DATEDIFF_BIG(MILLISECOND, CONVERT(DATETIME2, '1970-01-01T00:00:00'), SYSUTCDATETIME());
    UPDATE dbo.quiz_rooms SET revision = revision + 1, updated_at = @at WHERE id = @room;
    DECLARE @payload NVARCHAR(MAX) = (SELECT @round AS roundId, @question AS questionId FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);
    INSERT INTO dbo.quiz_events (id, revision, kind, payload, created_at)
    VALUES (CONVERT(NVARCHAR(80), NEWID()), @revision + 1, N'manual_question_update', @payload, @at);
    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;
