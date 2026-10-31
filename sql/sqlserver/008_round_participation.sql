-- Jalankan pada database BGI Quiz yang sedang digunakan.
-- Menyimpan pilihan babak Tidak dimainkan per sesi tanpa mengubah soal, nilai, atau progres.
-- Aman dijalankan ulang; tabel juga disiapkan otomatis oleh aplikasi jika akun memiliki izin.
IF OBJECT_ID(N'dbo.quiz_round_exclusions', N'U') IS NULL
BEGIN
  BEGIN TRY
    CREATE TABLE dbo.quiz_round_exclusions (
      room_id nvarchar(40) NOT NULL,
      round_id nvarchar(128) NOT NULL,
      session_id nvarchar(128) NOT NULL,
      CONSTRAINT PK_quiz_round_exclusions PRIMARY KEY (room_id, round_id),
      CONSTRAINT FK_quiz_round_exclusions_room FOREIGN KEY (room_id) REFERENCES dbo.quiz_rooms(id),
      CONSTRAINT FK_quiz_round_exclusions_round FOREIGN KEY (room_id, round_id) REFERENCES dbo.quiz_rounds(room_id, id)
    );
  END TRY
  BEGIN CATCH
    IF ERROR_NUMBER() <> 2714 OR OBJECT_ID(N'dbo.quiz_round_exclusions', N'U') IS NULL THROW;
  END CATCH
END;
