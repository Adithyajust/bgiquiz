-- Jalankan pada database kuis yang sudah digunakan aplikasi.
-- Aplikasi juga membuat tabel ini otomatis saat membuka koneksi SQL Server.
IF OBJECT_ID(N'dbo.quiz_championships', N'U') IS NULL
BEGIN
  BEGIN TRY
    CREATE TABLE dbo.quiz_championships (
      room_id nvarchar(40) NOT NULL PRIMARY KEY,
      session_id nvarchar(128) NOT NULL,
      declared_at bigint NOT NULL,
      team_ids nvarchar(30) NOT NULL,
      final_score int NOT NULL CHECK (final_score >= 0),
      CONSTRAINT FK_quiz_championships_room FOREIGN KEY (room_id) REFERENCES dbo.quiz_rooms(id),
      CONSTRAINT CK_quiz_championships_json CHECK (ISJSON(team_ids) = 1)
    );
  END TRY
  BEGIN CATCH
    IF ERROR_NUMBER() <> 2714 OR OBJECT_ID(N'dbo.quiz_championships', N'U') IS NULL THROW;
  END CATCH
END;
