-- Jalankan pada database BGI Quiz yang sedang digunakan.
-- Menambahkan ilustrasi opsional untuk soal Jawaban singkat.
-- Aman dijalankan ulang; aplikasi juga menyiapkan kolom ini saat tersambung.
IF COL_LENGTH(N'dbo.quiz_questions', N'image') IS NULL
BEGIN
  ALTER TABLE dbo.quiz_questions ADD image NVARCHAR(MAX) NULL;
END;
