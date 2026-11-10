/* Run AFTER 001_schema.sql, in the same database. SQL Server 2016+, level 130+.
   Repeatable DDL only. Existing documents are migrated atomically by the new
   repository on the first application read, with a retained legacy backup. */
SET XACT_ABORT ON;
IF (SELECT compatibility_level FROM sys.databases WHERE name = DB_NAME()) < 130
    THROW 51000, 'Set database compatibility level to 130 or higher before migration.', 1;
IF OBJECT_ID(N'dbo.quiz_rooms', N'U') IS NULL
    THROW 51000, 'Run 001_schema.sql first.', 1;

BEGIN TRY
    BEGIN TRANSACTION;
    IF COL_LENGTH('dbo.quiz_rooms', 'storage_version') IS NULL
        ALTER TABLE dbo.quiz_rooms ADD storage_version INT NOT NULL
            CONSTRAINT DF_bgi_quiz_rooms_storage_version DEFAULT (1);
    IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE parent_object_id = OBJECT_ID(N'dbo.quiz_rooms') AND name = 'CK_bgi_quiz_rooms_document')
        ALTER TABLE dbo.quiz_rooms DROP CONSTRAINT CK_bgi_quiz_rooms_document;
    ALTER TABLE dbo.quiz_rooms ALTER COLUMN document NVARCHAR(MAX) NULL;
    ALTER TABLE dbo.quiz_rooms WITH CHECK ADD CONSTRAINT CK_bgi_quiz_rooms_document
        CHECK (document IS NULL OR ISJSON(document) = 1);

    IF OBJECT_ID(N'dbo.quiz_settings', N'U') IS NULL
        CREATE TABLE dbo.quiz_settings (
            room_id NVARCHAR(40) NOT NULL PRIMARY KEY,
            schema_version INT NOT NULL CHECK (schema_version BETWEEN 1 AND 3),
            sound_enabled BIT NOT NULL,
            event_name NVARCHAR(60) NOT NULL DEFAULT (N'Quiz Night'),
            FOREIGN KEY (room_id) REFERENCES dbo.quiz_rooms(id)
        );

    IF OBJECT_ID(N'dbo.quiz_teams', N'U') IS NULL
        CREATE TABLE dbo.quiz_teams (
            room_id NVARCHAR(40) NOT NULL,
            id NVARCHAR(1) NOT NULL CHECK (id IN ('A', 'B', 'C')),
            name NVARCHAR(40) NOT NULL,
            photo NVARCHAR(MAX) NOT NULL,
            buzzer_key NVARCHAR(128) NOT NULL,
            participants NVARCHAR(200) NOT NULL,
            sort_order INT NOT NULL CHECK (sort_order >= 0),
            PRIMARY KEY (room_id, id),
            FOREIGN KEY (room_id) REFERENCES dbo.quiz_rooms(id)
        );

    IF OBJECT_ID(N'dbo.quiz_team_scores', N'U') IS NULL
        CREATE TABLE dbo.quiz_team_scores (
            room_id NVARCHAR(40) NOT NULL,
            team_id NVARCHAR(1) NOT NULL,
            score INT NOT NULL CHECK (score >= 0),
            PRIMARY KEY (room_id, team_id),
            FOREIGN KEY (room_id, team_id) REFERENCES dbo.quiz_teams(room_id, id)
        );

    IF OBJECT_ID(N'dbo.quiz_rounds', N'U') IS NULL
        CREATE TABLE dbo.quiz_rounds (
            room_id NVARCHAR(40) NOT NULL,
            id NVARCHAR(128) NOT NULL,
            type NVARCHAR(10) NOT NULL CHECK (type IN ('reguler', 'rebutan')),
            batch_number INT NULL CHECK (batch_number > 0),
            batch_team NVARCHAR(1) NULL,
            name NVARCHAR(80) NOT NULL,
            sort_order INT NOT NULL CHECK (sort_order BETWEEN 1 AND 20),
            question_count INT NOT NULL CHECK (question_count BETWEEN 1 AND 100),
            duration INT NOT NULL CHECK (duration BETWEEN 1 AND 600),
            points INT NOT NULL CHECK (points BETWEEN 0 AND 1000),
            scoring_mode NVARCHAR(10) NOT NULL CHECK (scoring_mode IN ('round', 'question')),
            PRIMARY KEY (room_id, id),
            FOREIGN KEY (room_id) REFERENCES dbo.quiz_rooms(id),
            FOREIGN KEY (room_id, batch_team) REFERENCES dbo.quiz_teams(room_id, id)
        );

    IF OBJECT_ID(N'dbo.quiz_questions', N'U') IS NULL
        CREATE TABLE dbo.quiz_questions (
            room_id NVARCHAR(40) NOT NULL,
            round_id NVARCHAR(128) NOT NULL,
            id NVARCHAR(128) NOT NULL,
            number INT NOT NULL CHECK (number BETWEEN 1 AND 100),
            text NVARCHAR(2000) NOT NULL,
            answer NVARCHAR(1000) NOT NULL,
            category NVARCHAR(60) NOT NULL,
            points INT NOT NULL CHECK (points BETWEEN 0 AND 1000),
            duration INT NULL CHECK (duration BETWEEN 1 AND 600),
            notes NVARCHAR(2000) NOT NULL,
            image NVARCHAR(MAX) NULL,
            sort_order INT NOT NULL CHECK (sort_order >= 0),
            PRIMARY KEY (room_id, round_id, id),
            FOREIGN KEY (room_id, round_id) REFERENCES dbo.quiz_rounds(room_id, id)
        );

    IF OBJECT_ID(N'dbo.quiz_question_options', N'U') IS NULL
        CREATE TABLE dbo.quiz_question_options (
            room_id NVARCHAR(40) NOT NULL,
            round_id NVARCHAR(128) NOT NULL,
            question_id NVARCHAR(128) NOT NULL,
            option_index INT NOT NULL CHECK (option_index BETWEEN 0 AND 5),
            text NVARCHAR(400) NOT NULL,
            PRIMARY KEY (room_id, round_id, question_id, option_index),
            FOREIGN KEY (room_id, round_id, question_id) REFERENCES dbo.quiz_questions(room_id, round_id, id)
        );

    IF OBJECT_ID(N'dbo.quiz_game_state', N'U') IS NULL
        CREATE TABLE dbo.quiz_game_state (
            room_id NVARCHAR(40) NOT NULL PRIMARY KEY,
            round_id NVARCHAR(128) NOT NULL,
            question_index INT NOT NULL CHECK (question_index BETWEEN 0 AND 100),
            selected_team_id NVARCHAR(1) NULL,
            active_team_id NVARCHAR(1) NULL,
            phase NVARCHAR(12) NOT NULL CHECK (phase IN ('ready', 'buzzing', 'review', 'answering', 'paused', 'judged', 'finished')),
            deadline BIGINT NULL,
            remaining BIGINT NULL CHECK (remaining >= 0),
            opened_at BIGINT NULL,
            epoch NVARCHAR(128) NOT NULL,
            feedback NVARCHAR(7) NULL CHECK (feedback IN ('correct', 'wrong')),
            session_id NVARCHAR(128) NOT NULL,
            answer_visible BIT NOT NULL DEFAULT (0),
            FOREIGN KEY (room_id, round_id) REFERENCES dbo.quiz_rounds(room_id, id),
            FOREIGN KEY (room_id, selected_team_id) REFERENCES dbo.quiz_teams(room_id, id),
            FOREIGN KEY (room_id, active_team_id) REFERENCES dbo.quiz_teams(room_id, id)
        );

    IF OBJECT_ID(N'dbo.quiz_progress', N'U') IS NULL
        CREATE TABLE dbo.quiz_progress (
            room_id NVARCHAR(40) NOT NULL,
            progress_key NVARCHAR(260) NOT NULL,
            round_id NVARCHAR(128) NOT NULL,
            team_id NVARCHAR(1) NULL,
            answered_count INT NOT NULL CHECK (answered_count BETWEEN 0 AND 100),
            PRIMARY KEY (room_id, progress_key),
            FOREIGN KEY (room_id, round_id) REFERENCES dbo.quiz_rounds(room_id, id),
            FOREIGN KEY (room_id, team_id) REFERENCES dbo.quiz_teams(room_id, id)
        );

    IF OBJECT_ID(N'dbo.quiz_buzzes', N'U') IS NULL
        CREATE TABLE dbo.quiz_buzzes (
            room_id NVARCHAR(40) NOT NULL,
            id NVARCHAR(128) NOT NULL,
            team_id NVARCHAR(1) NOT NULL,
            received_at BIGINT NOT NULL,
            elapsed BIGINT NOT NULL CHECK (elapsed >= 0),
            sort_order INT NOT NULL CHECK (sort_order BETWEEN 0 AND 2),
            PRIMARY KEY (room_id, id),
            FOREIGN KEY (room_id, team_id) REFERENCES dbo.quiz_teams(room_id, id)
        );

    IF OBJECT_ID(N'dbo.quiz_results', N'U') IS NULL
        CREATE TABLE dbo.quiz_results (
            room_id NVARCHAR(40) NOT NULL,
            id NVARCHAR(400) NOT NULL,
            round_id NVARCHAR(128) NULL,
            team_id NVARCHAR(1) NOT NULL,
            question_text NVARCHAR(2000) NOT NULL,
            round_name NVARCHAR(80) NOT NULL,
            correct BIT NOT NULL,
            points INT NOT NULL CHECK (points BETWEEN 0 AND 1000),
            judged_at BIGINT NOT NULL,
            sort_order INT NOT NULL CHECK (sort_order >= 0),
            possible_points INT NULL,
            correction_count INT NOT NULL CONSTRAINT DF_quiz_results_correction_count DEFAULT (0),
            corrected_at BIGINT NULL,
            correction_reason NVARCHAR(500) NOT NULL CONSTRAINT DF_quiz_results_correction_reason DEFAULT (N''),
            PRIMARY KEY (room_id, id),
            FOREIGN KEY (room_id, round_id) REFERENCES dbo.quiz_rounds(room_id, id),
            FOREIGN KEY (room_id, team_id) REFERENCES dbo.quiz_teams(room_id, id)
        );

    IF OBJECT_ID(N'dbo.quiz_legacy_snapshots', N'U') IS NULL
        CREATE TABLE dbo.quiz_legacy_snapshots (
            room_id NVARCHAR(40) NOT NULL,
            revision INT NOT NULL,
            document NVARCHAR(MAX) NOT NULL CHECK (ISJSON(document) = 1),
            archived_at BIGINT NOT NULL,
            PRIMARY KEY (room_id, revision),
            FOREIGN KEY (room_id) REFERENCES dbo.quiz_rooms(id)
        );

    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.quiz_questions') AND name = 'IX_bgi_questions_number')
        CREATE INDEX IX_bgi_questions_number ON dbo.quiz_questions(room_id, round_id, number);
    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.quiz_results') AND name = 'IX_bgi_results_team')
        CREATE INDEX IX_bgi_results_team ON dbo.quiz_results(room_id, team_id, judged_at);
    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;
