# Menjalankan BGI Quiz Night dengan Microsoft SQL Server

Backend Next.js standar kini menggunakan Microsoft SQL Server. Tampilan BGI dan alur reguler, rebutan, timer, foto, serta skor tetap sama.

Tautan `chatgpt.site` masih merupakan pratinjau berbasis D1/SQLite. Hosting tersebut tidak menyediakan koneksi TCP ke SQL Server. Jalankan aplikasi Next.js di komputer atau server yang dapat menjangkau SQL Server Anda. Perubahan source ini tidak memindahkan data dari pratinjau ke SQL Server secara otomatis.

## 1. Siapkan database

Gunakan Microsoft SQL Server 2016 atau lebih baru, termasuk SQL Server Express dan Azure SQL. Konfigurasi yang tersedia menggunakan SQL Server Authentication berupa username dan password.

Buat database khusus, misalnya `BGIQuiz`, atau gunakan database kuis yang sudah ada. Hentikan aplikasi lama sebelum memperbarui. Pada database yang sama di SSMS, jalankan `sql/sqlserver/001_schema.sql`, kemudian `sql/sqlserver/002_relational_schema.sql` dan `sql/sqlserver/005_event_answer_settings.sql`. Alternatifnya, gunakan `pnpm db:init` untuk menjalankan ketiga skrip dengan akun berizin DDL.

Versi ini menyediakan 14 tabel terpisah, meliputi metadata ruang, pengaturan, grup, skor, babak, soal, pilihan jawaban, status permainan, progres, buzzer, hasil, audit, pemilik, dan arsip JSON lama. Rincian kolom, relasi, migrasi, dan maintenance tersedia pada [PANDUAN_MAINTENANCE_DATABASE.md](PANDUAN_MAINTENANCE_DATABASE.md). Compatibility level database harus minimal 130 untuk `OPENJSON`.

Akun aplikasi memerlukan izin `SELECT`, `INSERT`, `UPDATE`, dan `DELETE` pada tabel terkait. Waktu disimpan sebagai `BIGINT` dalam milidetik. Teks menggunakan `NVARCHAR` dan foto menggunakan `NVARCHAR(MAX)`. Setelah migrasi, aplikasi membaca tabel operasional sebagai sumber data aktif. Dokumen lama dipertahankan di `quiz_legacy_snapshots`.

## 2. Pasang dependensi

Gunakan Node.js 22.13 atau lebih baru dan pnpm 11.25.

```sh
pnpm install --frozen-lockfile
pnpm db:driver
```

Perintah kedua memasang driver `mssql` dari manifest khusus `drivers/sqlserver/package.json`. Manifest mematok versi 12.7.4. Driver native ini terpisah dari dependensi pratinjau Workers. Aplikasi tidak beralih ke SQLite jika driver atau koneksi SQL Server gagal.

Lingkungan pengerjaan awal menolak unduhan registry npm. Karena itu, driver harus dipasang pada server Anda yang memiliki akses registry npm atau mirror perusahaan. Build source dan pengujian kontrak transaksi tidak menggantikan pengujian koneksi ke SQL Server nyata.

## 3. Isi konfigurasi koneksi

Salin `.env.example` menjadi `.env.local`, lalu isi pada server aplikasi:

```dotenv
MSSQL_SERVER=ALAMAT_SERVER_ANDA
MSSQL_DATABASE=BGIQuiz
MSSQL_USER=LOGIN_APLIKASI_ANDA
MSSQL_PASSWORD=ISI_PASSWORD_DI_SERVER
MSSQL_PORT=1433
MSSQL_ENCRYPT=true
MSSQL_TRUST_SERVER_CERTIFICATE=false
BGI_ADMIN_TOKEN=ISI_KATA_SANDI_PENYELENGGARA
```

Alamat, nama database, dan akun di atas merupakan contoh. Gunakan nilai server Anda. Jangan memasukkan kredensial ke source code atau mengirimkannya melalui chat.

Jika menggunakan instance bernama, seperti SQL Server Express, kosongkan `MSSQL_PORT`, isi `MSSQL_SERVER` dengan nama host, lalu tambahkan:

```dotenv
MSSQL_INSTANCE=SQLEXPRESS
```

Pilih port TCP tetap atau nama instance, bukan keduanya. Untuk pengembangan lokal dengan sertifikat mandiri, Anda dapat mengatur `MSSQL_TRUST_SERVER_CERTIFICATE=true` sesuai konfigurasi server. Default tetap memverifikasi sertifikat. Server Next.js harus memiliki akses jaringan ke SQL Server; browser peserta hanya mengakses aplikasi Next.js.

## 4. Periksa dan jalankan

Jika Anda telah menjalankan ketiga skrip melalui SSMS:

```sh
pnpm db:check
pnpm dev:next
```

Jika akun konfigurasi mempunyai izin membuat tabel, Anda dapat menggunakan helper:

```sh
pnpm db:init
pnpm db:check
pnpm dev:next
```

Buka `http://127.0.0.1:3000`. Mode pengembangan lokal memberi akses penyelenggara pada localhost jika `BGI_ADMIN_TOKEN` belum diisi. Untuk produksi, isi token penyelenggara, gunakan HTTPS, dan jalankan:

```sh
pnpm build:next
pnpm start:next
```

Buka `/host`, `/admin`, dan `/teams` untuk mengelola acara. Instalasi baru menyediakan 40 soal contoh: 10 untuk setiap batch reguler serta 10 rebutan. Host memilih grup secara terpisah saat memainkan paket. Melalui Kelola batch pada /host, host dapat menambah, mengubah, mengurutkan, atau menghapus paket yang belum memiliki progres. Menu Nama & foto grup mengubah identitas grup dari panel host. Setiap batch memiliki pengaturan sendiri. Tinjau soal sebelum acara. Data kuis kemudian tersimpan pada SQL Server yang Anda konfigurasi.

Untuk proyek lama, ikuti `PANDUAN_MAINTENANCE_DATABASE.md` sebelum menjalankan source baru. Pembaruan ini memerlukan skema relasional dari `002_relational_schema.sql`. Saat kuis pertama dibuka, repository mengarsipkan dokumen JSON lama dan memindahkan isinya ke tabel terpisah dalam satu transaksi. Data lama tetap dipakai, tanpa menimpa bank soal dengan contoh. Dokumen engine versi 1 atau 2 tetap menyesuaikan ke versi 3 melalui migrasi aplikasi yang sudah ada.

## Transaksi dan pengujian

Repository SQL Server memakai query berparameter dan satu koneksi transaksi untuk pembaruan skor serta audit. Klausa `WHERE revision = @revision` mencegah permintaan bersamaan menimpa perubahan lain. Pembaruan yang kehilangan revisi mencoba kembali untuk buzzer, atau meminta pembawa acara mengulang tindakan pada data terbaru.

```sh
pnpm test
pnpm check
pnpm build:next
```

Pengujian logika, API, serta persistensi pratinjau memakai database SQLite terisolasi. Pengujian adapter SQL Server memakai driver tiruan untuk memeriksa parameter, konflik revisi, commit, rollback, serta penanganan transaksi yang sudah dibatalkan server. Pengujian ini tidak membuktikan sintaks dan konektivitas pada server SQL Server Anda. Jalankan `pnpm db:check` dan latihan kuis pada server Anda setelah memasang driver.

Referensi implementasi: dokumentasi resmi [node-mssql](https://github.com/tediousjs/node-mssql), [OPENJSON Microsoft SQL Server](https://learn.microsoft.com/en-us/sql/t-sql/functions/openjson-transact-sql), dan [table hints](https://learn.microsoft.com/en-us/sql/t-sql/queries/hints-transact-sql-table).


## Pembaruan jawaban Arena dan nama acara

Baca [PANDUAN_JAWABAN_ARENA_NAMA_ACARA.md](PANDUAN_JAWABAN_ARENA_NAMA_ACARA.md) untuk menu Pengaturan acara, tombol Buka jawaban di Arena, dan pembaruan skema 005. Jalankan `pnpm db:init` sebelum memakai source ini.
