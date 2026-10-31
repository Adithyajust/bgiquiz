/* BGI Quiz Night. Run in the selected quiz database using SSMS or pnpm db:init.
   Microsoft SQL Server 2016+ / Azure SQL. This script never drops existing data. */
SET XACT_ABORT ON;
BEGIN TRY
    BEGIN TRANSACTION;

    IF OBJECT_ID(N'dbo.quiz_rooms', N'U') IS NULL
    BEGIN
        CREATE TABLE dbo.quiz_rooms (
            id NVARCHAR(40) NOT NULL CONSTRAINT PK_bgi_quiz_rooms PRIMARY KEY,
            document NVARCHAR(MAX) NOT NULL,
            revision INT NOT NULL CONSTRAINT DF_bgi_quiz_rooms_revision DEFAULT (0),
            updated_at BIGINT NOT NULL,
            CONSTRAINT CK_bgi_quiz_rooms_document CHECK (ISJSON(document) = 1),
            CONSTRAINT CK_bgi_quiz_rooms_revision CHECK (revision >= 0)
        );
    END;

    IF OBJECT_ID(N'dbo.quiz_events', N'U') IS NULL
    BEGIN
        CREATE TABLE dbo.quiz_events (
            id NVARCHAR(80) NOT NULL CONSTRAINT PK_bgi_quiz_events PRIMARY KEY,
            revision INT NOT NULL,
            kind NVARCHAR(80) NOT NULL,
            payload NVARCHAR(MAX) NOT NULL,
            created_at BIGINT NOT NULL,
            CONSTRAINT CK_bgi_quiz_events_payload CHECK (ISJSON(payload) = 1)
        );
        CREATE UNIQUE INDEX UX_bgi_quiz_events_revision ON dbo.quiz_events (revision);
        CREATE INDEX IX_bgi_quiz_events_created_at ON dbo.quiz_events (created_at);
    END;

    IF OBJECT_ID(N'dbo.quiz_owners', N'U') IS NULL
    BEGIN
        CREATE TABLE dbo.quiz_owners (
            id NVARCHAR(40) NOT NULL CONSTRAINT PK_bgi_quiz_owners PRIMARY KEY,
            user_id NVARCHAR(256) NOT NULL,
            created_at BIGINT NOT NULL
        );
    END;

    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;
