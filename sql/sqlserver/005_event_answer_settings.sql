/* Additive upgrade for existing relational SQL Server databases.
   Stop the application, back up the database, then run after 002.
   Rerunning preserves custom names and the current reveal status. */
SET XACT_ABORT ON;
IF OBJECT_ID(N'dbo.quiz_settings', N'U') IS NULL OR OBJECT_ID(N'dbo.quiz_game_state', N'U') IS NULL
    THROW 51000, 'Run 001_schema.sql and 002_relational_schema.sql first.', 1;
BEGIN TRY
    BEGIN TRANSACTION;
    IF COL_LENGTH('dbo.quiz_settings', 'event_name') IS NULL
        ALTER TABLE dbo.quiz_settings ADD event_name NVARCHAR(60) NOT NULL
            CONSTRAINT DF_quiz_settings_event_name DEFAULT (N'Quiz Night') WITH VALUES;
    IF COL_LENGTH('dbo.quiz_game_state', 'answer_visible') IS NULL
        ALTER TABLE dbo.quiz_game_state ADD answer_visible BIT NOT NULL
            CONSTRAINT DF_quiz_game_state_answer_visible DEFAULT (0) WITH VALUES;
    COMMIT;
END TRY
BEGIN CATCH
    IF XACT_STATE() <> 0 ROLLBACK;
    THROW;
END CATCH;
