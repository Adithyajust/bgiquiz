/* Additive upgrade for host result corrections. Run in the quiz database.
   Existing results remain intact; NULL possible_points means legacy value. */
SET XACT_ABORT ON;
IF OBJECT_ID(N'dbo.quiz_results', N'U') IS NULL
    THROW 51000, 'Run 001_schema.sql and 002_relational_schema.sql first.', 1;
BEGIN TRY
    BEGIN TRANSACTION;
    IF COL_LENGTH('dbo.quiz_results', 'possible_points') IS NULL
        ALTER TABLE dbo.quiz_results ADD possible_points INT NULL;
    IF COL_LENGTH('dbo.quiz_results', 'correction_count') IS NULL
        ALTER TABLE dbo.quiz_results ADD correction_count INT NOT NULL
            CONSTRAINT DF_quiz_results_correction_count DEFAULT (0) WITH VALUES;
    IF COL_LENGTH('dbo.quiz_results', 'corrected_at') IS NULL
        ALTER TABLE dbo.quiz_results ADD corrected_at BIGINT NULL;
    IF COL_LENGTH('dbo.quiz_results', 'correction_reason') IS NULL
        ALTER TABLE dbo.quiz_results ADD correction_reason NVARCHAR(500) NOT NULL
            CONSTRAINT DF_quiz_results_correction_reason DEFAULT (N'') WITH VALUES;
    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;
