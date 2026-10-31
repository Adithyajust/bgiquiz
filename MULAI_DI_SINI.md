# Mulai menggunakan BGI Quiz dengan SQL Server

Untuk pembaruan desain biru dan oranye, baca `PANDUAN_TAMPILAN_BARU.md`. Jika database sudah memakai 14 tabel terpisah, pembaruan desain ini cukup dilakukan pada source aplikasi.

Paket ini memuat source Next.js, skema Microsoft SQL Server, aset BGI, serta panduan Word. Baca `PANDUAN_MAINTENANCE_DATABASE.md` untuk struktur tabel dan migrasi terbaru. Panduan Word dalam folder `docs` berasal dari versi sebelum pemisahan tabel.

## Langkah singkat

1. Ekstrak ZIP, lalu buka terminal pada folder `BGI_Quiz_NextJS_SQLServer` yang memuat `package.json`.
2. Gunakan Node.js 22.13 atau lebih baru dan pnpm 11.25.0.
3. Siapkan database kuis pada Microsoft SQL Server 2016 atau lebih baru. Konfigurasi menggunakan SQL Server Authentication.
4. Pasang dependensi dan driver:

```sh
pnpm install --frozen-lockfile
pnpm db:driver
```

5. Salin `.env.example` menjadi `.env.local`. Isi server, database, username, password, serta `BGI_ADMIN_TOKEN` pada komputer server aplikasi.
6. Jalankan `sql/sqlserver/001_schema.sql`, kemudian `sql/sqlserver/002_relational_schema.sql` dan `sql/sqlserver/005_event_answer_settings.sql` melalui SSMS pada database kuis yang sama. Jika akun koneksi memiliki izin membuat tabel, Anda dapat menjalankan `pnpm db:init`.
7. Periksa koneksi dan jalankan aplikasi:

```sh
pnpm db:check
pnpm dev:next
```

Buka `http://127.0.0.1:3000` pada komputer tersebut. Untuk penggunaan acara melalui jaringan, gunakan build produksi:

```sh
pnpm build:next
pnpm start:next
```

Buka aplikasi melalui IP atau domain server yang dapat dijangkau peserta. Salin tautan buzzer dari alamat jaringan tersebut, bukan dari localhost.

## Halaman utama

| Halaman | Kegunaan |
| --- | --- |
| `/` | Arena panggung 16:9 |
| `/host` | Kontrol pembawa acara, giliran, timer, penilaian, dan hasil |
| `/admin` | Pengaturan babak dan soal |
| `/teams` | Foto, identitas grup, dan tautan buzzer |
| `/panduan` | Panduan singkat dalam aplikasi |

## Perintah yang digunakan

Gunakan `dev:next`, `build:next`, dan `start:next` untuk versi Microsoft SQL Server. Perintah `dev` dan `build` pada source asli melayani jalur pratinjau hosting yang memakai D1/SQLite. Paket tidak memindahkan data pratinjau ke SQL Server secara otomatis.

Paket mengecualikan node_modules, hasil build, cache, kredensial, riwayat Git, dan data sesi. Konfigurasi hosting menyertakan binding contoh tanpa identitas Site milik pengembang. Deklarasi next-env.d.ts menggunakan referensi dasar yang akan Next.js perbarui ketika Anda melakukan build.

## Status pemeriksaan

Versi ini telah lulus pemeriksaan TypeScript dan 86 pengujian source. Status build tercatat pada `SOURCE_MANIFEST.json`. Adapter SQL Server memakai driver tiruan dalam pengujian. Koneksi SQL Server nyata belum diuji karena konfigurasi server pengujian belum tersedia. Pasang driver pada server Anda dan jalankan `pnpm db:check` sebelum acara.

Lakukan latihan pada jaringan, proyektor, browser, dan perangkat buzzer yang akan dipakai. Tinjau 40 soal contoh sebelum menjalankan acara sebenarnya.

Lihat `README.md` dan `SQLSERVER_SETUP.md` untuk rincian teknis. File `SOURCE_MANIFEST.json` mencatat revisi sumber dan checksum berkas paket.

## Batch dan grup pilihan host

Pada `/host`, pilih Babak Reguler, lalu pilih batch soal dan grup yang akan bermain secara terpisah. Semua batch dapat dimainkan Grup A, B, atau C. Contoh: Batch 1 untuk Grup B, kemudian Batch 2 untuk Grup A. Hanya buzzer grup pilihan host yang aktif. Progres disimpan per kombinasi batch dan grup; skor tetap terkumpul saat berpindah babak.

Setiap batch memiliki bank soal dan pengaturan sendiri. Pada instalasi baru tersedia tiga paket reguler berisi 10 soal berbeda per paket dan satu paket rebutan berisi 10 soal. Atur jumlah, nilai, dan durasi melalui `/admin`.

Di `/host`, klik **Kelola batch** untuk menambah paket, menyalin soal, mengubah nama dan pengaturan, mengatur urutan, atau menghapus paket yang belum memiliki progres. Jumlah batch reguler mendukung 1 sampai 19. Klik **Nama & foto grup** untuk mengganti nama bawaan dan foto peserta. Skor, progres, dan akses buzzer mengikuti kode grup yang tetap sama. Foto panggung kini lebih besar.

Untuk proyek yang sudah terpasang, hentikan aplikasi, cadangkan database, lalu ikuti `PANDUAN_MAINTENANCE_DATABASE.md`. Pertahankan `.env.local`. Pembaruan ini menambahkan tabel SQL Server dan memigrasikan dokumen lama secara atomik. Pengoperasian batch tetap dijelaskan pada `PANDUAN_BATCH_REGULER.md`.

## Tampilan dan instalasi Windows

Source lengkap memakai `nodeLinker: hoisted` untuk menghindari masalah izin symlink pnpm pada Windows. Tampilan BGI memakai stylesheet langsung pada `public/styles/bgi-quiz.css`, dengan tautan versi terbaru di `app/layout.tsx`. Setelah memperbarui, hapus hasil build `.next`, jalankan ulang aplikasi, lalu tekan Ctrl+F5. Lihat `PANDUAN_PERBAIKAN_TAMPILAN.md` bila diperlukan.


## Pembaruan jawaban Arena dan nama acara

Baca [PANDUAN_JAWABAN_ARENA_NAMA_ACARA.md](PANDUAN_JAWABAN_ARENA_NAMA_ACARA.md) untuk menu Pengaturan acara, tombol Buka jawaban di Arena, dan pembaruan skema 005. Jalankan `pnpm db:init` sebelum memakai source ini.
