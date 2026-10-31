# Maintenance BGI Quiz dengan tabel SQL Server terpisah

Versi ini memisahkan data operasional dari satu dokumen JSON menjadi baris dan kolom pada tabel tersendiri. Kode repository Next.js sudah membaca dan memperbarui tabel tersebut. JSON tetap dipakai untuk pertukaran data di API, parameter query, audit tindakan, dan arsip migrasi. Dokumen JSON bukan lagi sumber data aktif SQL Server setelah migrasi.

## Daftar tabel

Semua tabel data operasional memakai `room_id = N'main'`. Primary key gabungan membedakan soal yang memiliki ID sama pada batch berbeda. Foreign key menghubungkan data anak dengan babak, grup, dan soal yang sesuai.

| Tabel | Data yang dikelola | Primary key atau hubungan utama |
| --- | --- | --- |
| `dbo.quiz_rooms` | Ruang kuis, revisi transaksi, waktu perubahan, versi penyimpanan | `id` |
| `dbo.quiz_settings` | Suara dan versi struktur data aplikasi | `room_id` |
| `dbo.quiz_teams` | Kode grup, nama, foto bersama, nama peserta, kunci buzzer | `room_id, id` |
| `dbo.quiz_team_scores` | Skor terkumpul setiap grup | `room_id, team_id`, ke grup |
| `dbo.quiz_rounds` | Babak, batch, urutan, jumlah soal, durasi, aturan nilai | `room_id, id` |
| `dbo.quiz_questions` | Nomor, pertanyaan, jawaban, kategori, nilai, durasi khusus, catatan | `room_id, round_id, id`, ke babak |
| `dbo.quiz_question_options` | Satu baris untuk setiap pilihan jawaban | `room_id, round_id, question_id, option_index`, ke soal |
| `dbo.quiz_game_state` | Babak aktif, indeks soal, giliran grup, fase, timer, sesi | `room_id`, ke babak dan grup |
| `dbo.quiz_progress` | Jumlah soal yang telah dinilai per kombinasi batch dan grup | `room_id, progress_key`, ke babak dan grup |
| `dbo.quiz_buzzes` | Urutan buzzer pada soal yang sedang aktif | `room_id, id`, ke grup |
| `dbo.quiz_results` | Hasil penilaian dalam sesi aktif | `room_id, id`, ke grup dan babak bila tersedia |
| `dbo.quiz_events` | Audit tindakan aplikasi dan nomor revisinya | `id`, revisi unik |
| `dbo.quiz_owners` | Identitas pemilik akses penyelenggara | `id` |
| `dbo.quiz_legacy_snapshots` | Salinan lengkap dokumen lama sebelum migrasi | `room_id, revision` |

Foto tetap berupa data URL pada kolom `quiz_teams.photo`, mengikuti aplikasi semula. Kolom `participants` tetap berupa teks nama peserta, mengikuti formulir grup. Skor dipisahkan dari identitas grup sehingga perubahan nilai tidak menulis ulang foto. `quiz_buzzes` berisi buzzer soal aktif, sedangkan jejak tindakan buzzer tetap dicatat di `quiz_events`. Reset sesi menghapus hasil sesi, progres, dan skor melalui alur aplikasi. Tabel hasil bukan arsip lintas reset. Ekspor hasil sebelum melakukan reset.

## Memperbarui proyek lama

1. Hentikan seluruh proses aplikasi versi lama. Simpan cadangan database dan folder proyek.
2. Salin source versi ini ke folder proyek yang berisi `package.json`. Pertahankan `.env.local` milik server Anda. Pembaruan ini tidak mengubah dependensi.
3. Pada database yang sama, jalankan `sql/sqlserver/001_schema.sql`, kemudian `sql/sqlserver/002_relational_schema.sql` dan `sql/sqlserver/005_event_answer_settings.sql` melalui SSMS. Alternatifnya, jalankan `pnpm db:init` menggunakan akun dengan izin DDL.
4. Akun aplikasi memerlukan `SELECT`, `INSERT`, `UPDATE`, dan `DELETE` pada tabel kuis yang relevan. Akun yang sebelumnya tidak memiliki izin `DELETE` perlu disesuaikan karena penghapusan soal, pilihan, progres, dan hasil kini dilakukan pada tabel masing-masing.
5. Jalankan `pnpm db:check`, kemudian `pnpm dev:next` untuk pengembangan, atau bangun ulang dan jalankan mode produksi.
6. Buka `/host`. Pembacaan pertama mengunci data ruang, menyimpan JSON asli pada `quiz_legacy_snapshots`, mengisi tabel terpisah, lalu mengubah `quiz_rooms.storage_version` menjadi `2` dan `document` menjadi `NULL` dalam satu transaksi. Migrasi format mempertahankan nomor revisi, soal, foto, skor, progres, timer, sesi, dan kunci buzzer. Jika suatu tahap gagal, seluruh transaksi dibatalkan dan dokumen sumber tetap tersedia.
7. Periksa jumlah baris menggunakan `sql/sqlserver/003_maintenance_queries.sql`, cocokkan dengan data sebelum pembaruan, dan lakukan latihan kuis. Instalasi baru mengisi data contoh saat kuis pertama dibuka. Jumlah contoh awal adalah 4 babak, 40 soal, dan 3 grup. Database lama mengikuti isinya sendiri.

Dokumen engine versi 1 atau 2 masih diperbarui ke versi 3 melalui alur migrasi aplikasi yang sudah ada. Perubahan engine ini dicatat pada `quiz_events` dan menaikkan revisi satu kali. `storage_version = 2` mengacu pada format penyimpanan relasional, sedangkan `quiz_settings.schema_version = 3` mengacu pada struktur data permainan. Kedua angka mempunyai fungsi berbeda.

Jangan menjalankan aplikasi versi lama bersama versi ini setelah migrasi. Versi lama masih membaca dan menulis `quiz_rooms.document`. Untuk kembali ke versi lama, gunakan cadangan database sebelum migrasi beserta source yang sesuai. Arsip JSON di `quiz_legacy_snapshots` merupakan data pada waktu migrasi, sehingga tidak berisi perubahan kuis yang terjadi sesudahnya.

## Maintenance rutin

Gunakan `/admin` untuk mengubah soal dan pilihan jawaban, `/host` untuk mengatur batch dan permainan, serta `/teams` untuk identitas grup. Formulir aplikasi memeriksa nomor soal, jumlah pilihan, jawaban benar, kelengkapan bank soal, dan fase permainan sebelum menyimpan. Relasi tabel tidak menggantikan validasi tersebut.

Untuk pemeriksaan melalui SSMS, buka `003_maintenance_queries.sql`. Skrip itu hanya membaca metadata migrasi, isi babak, bank soal, pilihan jawaban, papan skor, hasil, progres, dan buzzer aktif. Kunci buzzer dan foto tidak ditampilkan pada query ringkasan.

Jika perlu memperbaiki teks soal langsung melalui SQL, gunakan templat `004_update_question.sql`. Isi ID dan teks pada bagian atas, hentikan server aplikasi, lalu jalankan pada database kuis. Templat mengunci ruang, memeriksa fase dan pilihan jawaban, menaikkan revisi, serta menambahkan audit dalam transaksi yang sama. Perubahan susunan soal, batch, identitas grup, nilai, dan sesi sebaiknya dilakukan melalui aplikasi karena berkaitan dengan progres dan hasil penilaian. Jangan mengubah skor saja bila tujuannya memperbaiki hasil penilaian, karena skor dan hasil dapat menjadi tidak selaras.

## Perilaku penyimpanan

Repository mempertahankan revisi optimistis dan transaksi atomik. Penulisan harus memperoleh revisi yang sesuai sebelum tabel anak dan audit diperbarui. Pembacaan menahan kunci ruang sampai seluruh tabel selesai dibaca. Setiap tindakan hanya memperbarui baris yang berubah. Tekan buzzer, misalnya, memperbarui status permainan dan baris buzzer, tanpa menulis ulang seluruh bank soal atau foto.

Parameter array dikirim ke SQL Server sebagai JSON lalu diuraikan menggunakan `OPENJSON` ke kolom bertipe. Data operasional disimpan sebagai kolom biasa. `OPENJSON` memerlukan SQL Server 2016 atau lebih baru dan compatibility level minimal 130. Sumber resmi: [Microsoft OPENJSON](https://learn.microsoft.com/en-us/sql/t-sql/functions/openjson-transact-sql) dan [Microsoft table hints](https://learn.microsoft.com/en-us/sql/t-sql/queries/hints-transact-sql-table).

Jalur pratinjau Workers/D1 tetap menggunakan repository SQLite semula. Pemisahan tabel ini diterapkan pada jalur Microsoft SQL Server yang dijalankan melalui `dev:next`, `build:next`, dan `start:next`.

## Batas pemeriksaan paket

Pengujian source memeriksa konversi data, transaksi, migrasi, urutan relasi, konflik revisi, penilaian, reset, dan regresi aplikasi. Pengujian adapter memakai driver tiruan dengan pemeriksaan relasi dan rollback. Pemeriksaan ini tidak menjalankan sintaks SQL pada SQL Server nyata. `pnpm db:check` memeriksa koneksi dan kelengkapan skema, tetapi tidak membuktikan seluruh skenario permainan. Jalankan instalasi dan latihan pada SQL Server Anda sebelum menggunakan versi ini untuk acara.

Panduan Word dalam folder `docs` merupakan dokumentasi versi sumber sebelumnya. Untuk struktur database dan langkah migrasi versi ini, gunakan panduan ini dan `SQLSERVER_SETUP.md`.


## Pembaruan jawaban Arena dan nama acara

Baca [PANDUAN_JAWABAN_ARENA_NAMA_ACARA.md](PANDUAN_JAWABAN_ARENA_NAMA_ACARA.md) untuk menu Pengaturan acara, tombol Buka jawaban di Arena, dan pembaruan skema 005. Jalankan `pnpm db:init` sebelum memakai source ini.
