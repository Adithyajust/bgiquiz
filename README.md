# BGI Quiz Night

Tampilan arena kini mengikuti referensi biru tua, biru elektrik, dan oranye, dengan bidang putih pada area logo. Lihat [PANDUAN_TAMPILAN_BARU.md](PANDUAN_TAMPILAN_BARU.md) untuk pemasangan dan lokasi berkas desain.

Versi tabel terpisah SQL Server. Baca [PANDUAN_MAINTENANCE_DATABASE.md](PANDUAN_MAINTENANCE_DATABASE.md) untuk memasang skema dan memigrasikan dokumen lama. Data babak, soal, pilihan, grup, skor, permainan, progres, buzzer, dan hasil sekarang berada pada tabel masing-masing.

Aplikasi kuis panggung untuk 36 Tahun PT Bringin Gigantara. Menggunakan Next.js App Router, React, TypeScript, dan Microsoft SQL Server untuk server Node.js. Jalur publikasi Sites memakai runtime Vinext yang menjalankan antarmuka App Router, dengan Cloudflare D1 sebagai SQLite terkelola. Jalur Next.js standar memakai Microsoft SQL Server. Tautan Sites tetap menjadi pratinjau, terpisah dari SQL Server pengguna.

Kode aplikasi lama tidak tersedia pada permintaan awal. Proyek ini merupakan implementasi baru berdasarkan gambar referensi dan alur yang diminta. Logo pada aplikasi berasal dari gambar referensi pengguna; gunakan aset logo asli beresolusi tinggi bila tersedia.

## Halaman

| Alamat | Fungsi |
| --- | --- |
| `/` | Arena panggung 16:9 dan mode layar penuh |
| `/host` | Pengelolaan batch, nama dan foto grup, giliran, timer, buzzer, penilaian, riwayat |
| `/admin` | Pengaturan babak dan tambah, ubah, hapus, simpan, pratinjau soal |
| `/teams` | Identitas, satu foto bersama tiga peserta per grup, tautan buzzer |
| `/buzzer/A?key=...` | Buzzer grup A. Gunakan tautan khusus dari halaman Grup |
| `/panduan` | Panduan pembawa acara dan peserta |

## Menjalankan Next.js dengan SQL Server

Backend Next.js standar sekarang menggunakan Microsoft SQL Server. Ikuti [panduan SQL Server](SQLSERVER_SETUP.md), isi konfigurasi dari `.env.example`, lalu jalankan:

```sh
pnpm install --frozen-lockfile
pnpm db:driver
pnpm db:init
pnpm db:check
pnpm dev:next
```

Database kuis harus sudah tersedia. `db:init` memerlukan izin membuat tabel; jika DBA telah menjalankan `sql/sqlserver/001_schema.sql` , `sql/sqlserver/002_relational_schema.sql`, dan `sql/sqlserver/005_event_answer_settings.sql` melalui SSMS, langsung jalankan `db:check`. Kredensial koneksi tetap berada di server. Untuk produksi, isi `BGI_ADMIN_TOKEN`, lalu jalankan `pnpm build:next` dan `pnpm start:next`.

## Publikasi Sites

`pnpm dev` dan `pnpm build` menggunakan runtime Vinext dari starter Sites. Adapter build Vite memilih `lib/runtime-cloudflare.ts`; Next.js standar memilih `lib/runtime-node.ts` melalui alias TypeScript. Keduanya menjalankan mesin kuis yang sama dengan repository sesuai dialek database. Source terbaru tidak mengalihkan database pratinjau ke SQL Server secara otomatis.

Binding `DB` tercantum dalam `.openai/hosting.json`. Migrasi dalam `drizzle/` membuat tabel SQL. Sites menerapkan migrasi saat publikasi. Site baru bersifat privat. Penyelenggara pertama yang membuka panel pada Site privat akan menjadi pemilik aplikasi. Akun peserta yang berbeda membutuhkan akses berbagi ke Site tersebut serta tautan buzzer grupnya. Mengubah akses Site tetap melalui pengaturan berbagi Sites.

## Aturan permainan

- Reguler: pembawa acara memilih paket dari daftar batch, lalu memilih grup secara terpisah. Host dapat menambah, mengubah, mengurutkan, atau menghapus paket yang belum memiliki progres melalui Kelola batch. Jumlah batch dapat berubah dari tiga paket awal, dengan minimal 1 dan maksimal 19 batch reguler. Semua batch dapat dimainkan grup pilihan host. Setiap paket memiliki bank soal, jumlah soal, nilai, dan durasi sendiri. Progres mengikuti setiap kombinasi batch dan grup. Jumlah awal 10 soal per batch. Skor tetap terkumpul saat masuk rebutan.
- Rebutan: pembawa acara membuka buzzer. Tekanan pertama mengunci giliran. Permintaan yang telah tiba berdekatan dalam 250 ms tetap tercatat agar pembawa acara dapat memeriksa urutannya. Tekanan sesudah jendela tersebut mendapat status terkunci.
- Server mencatat waktu terima permintaan. Latensi jaringan dapat memengaruhi urutan. Aplikasi tidak mengklaim pengukuran waktu fisik tombol secara tersinkron pada semua perangkat.
- Pembawa acara memilih grup dari daftar tekanan yang tercatat. Timer menjawab baru mulai setelah konfirmasi.
- Jawaban benar menambah nilai soal. Jawaban salah tidak mengurangi skor. Setelah penilaian, pembawa acara melanjutkan soal lalu membuka buzzer kembali.
- Nilai awal 10. Mode nilai dapat mengikuti seluruh babak atau setiap soal. Durasi soal yang kosong mengikuti durasi babak.
- Timer memakai tenggat server. Memuat ulang halaman tetap menampilkan sisa waktu yang sama. Pembawa acara dapat menjeda dan melanjutkannya.
- Server menolak soal dengan pertanyaan atau jawaban kosong. Soal pilihan ganda memerlukan minimal dua pilihan yang berbeda dan jawaban yang sesuai salah satu pilihan.
- Instalasi baru menyertakan 40 soal contoh, terdiri dari 10 per batch reguler dan 10 rebutan. Tinjau isi serta kesetaraan kesulitan sebelum acara.

## Penyimpanan SQL dan konkurensi

Pada SQL Server, `quiz_rooms` menyimpan metadata ruang dan nomor revisi. Data operasional berada pada tabel `quiz_settings`, `quiz_teams`, `quiz_team_scores`, `quiz_rounds`, `quiz_questions`, `quiz_question_options`, `quiz_game_state`, `quiz_progress`, `quiz_buzzes`, dan `quiz_results`. `quiz_events` menyimpan audit, `quiz_owners` menyimpan identitas penyelenggara, dan `quiz_legacy_snapshots` menyimpan JSON sebelum migrasi. Jalur pratinjau SQLite tetap memakai snapshot JSON semula.

Backend SQL Server memakai `UPDATE ... WHERE revision = @revision`. Transaksi SQL Server atau batch D1 menyimpan skor, progres, dan jejak perubahan secara atomik. Permintaan buzzer yang bersaing memuat ulang revisi lalu mencoba kembali, sehingga tidak menimpa tekanan lain. Aplikasi menyimpan progres saat penilaian agar perpindahan babak tidak memberi kesempatan menilai soal yang sama dua kali.

Polling menyinkronkan perangkat setiap sekitar 0,6 detik ditambah latensi jaringan. Tombol buzzer mengirim permintaan segera saat ditekan. Polling tidak menentukan urutan tekanan. Sebelum host membuka jawaban, halaman publik tidak menerima kunci jawaban. Setelah host menekan Buka jawaban di Arena, server hanya mengirim jawaban soal aktif. Catatan pembawa acara, kunci buzzer grup, dan isi soal berikutnya tetap tersembunyi.

Foto tim tersimpan sebagai satu gambar WebP persegi 400 × 400 pada database, lalu arena menampilkannya dalam satu lingkaran. Pilih foto dengan tiga peserta di tengah. Aplikasi mengompresi foto sebelum menyimpan.

## Pemeriksaan

```sh
pnpm test
pnpm check
pnpm build:next
pnpm build
```

`pnpm check` memeriksa source aplikasi tanpa mencampurkan cache tipe yang dibuat Next.js dan Vinext. Build Next.js juga memeriksa tipe rutenya sendiri.

Pengujian adapter SQL Server menggunakan driver tiruan. Koneksi ke SQL Server nyata belum diverifikasi karena konfigurasi koneksi server pengujian belum tersedia. Pengujian regresi SQLite memeriksa validasi soal, setiap fase babak, penguncian buzzer, timer, progres per grup, penyembunyian jawaban, otorisasi, konkurensi SQL, penilaian ganda, rollback transaksi, pemulihan data dari disk, dan sesi admin native Next.js.

Suite saat ini mencakup 86 pengujian. Cakupan meliputi batch dinamis, salinan soal yang independen, pengaturan urutan dan nilai, penghapusan batch dengan perlindungan progres, nama grup, akses host, konflik revisi, sembilan kombinasi awal batch dan grup, migrasi versi 1 dan 2, persistensi, rollback, serta render menu host dan admin.

Pemeriksaan visual tema baru merender komponen aplikasi di Chromium menggunakan data uji. Pemeriksaan meliputi arena biasa, layar penuh, soal pilihan ganda, soal panjang, nama grup panjang, ukuran 1920 × 1080, dan ponsel. Panel host juga diperiksa melalui render komponen. Pemeriksaan ini tidak menggunakan koneksi SQL Server nyata atau membuktikan interaksi pada browser Windows dan proyektor fisik. Lakukan latihan pada perangkat serta jaringan acara.

## Pembaruan tampilan Windows

CSS dasar dimuat dari `public/styles/bgi-quiz.css`, kemudian tema baru dimuat dari `public/styles/arena-reference.css` melalui root layout. Latar vektor berada di `public/brand/arena-blue-orange.svg`. Lihat `PANDUAN_PERBAIKAN_TAMPILAN.md` untuk menerapkan patch, membersihkan hasil build lama, dan memeriksa pemuatan CSS.

## Pengaturan dinamis oleh host

Ikuti `PANDUAN_MAINTENANCE_DATABASE.md` untuk memperbarui database proyek lama, lalu gunakan `PANDUAN_BATCH_REGULER.md` untuk pengoperasian host. Dokumen kuis versi 1 atau 2 menyesuaikan otomatis ke versi 3 saat server membacanya. Penyimpanan SQL Server memakai tabel terpisah dengan transaksi dan nomor revisi. Pasang skema relasional sebelum menjalankan source ini. Pembaruan dari versi tiga batch tetap mempertahankan semua paket soal dan melepaskan pengikatan grup. Pembaruan dari versi satu bank tetap mempertahankan materi lama sesuai riwayat sesi. Skor, progres, foto, kunci buzzer, serta timer lama tetap tersedia.


Pada `/host`, klik **Kelola batch** untuk menambah paket kosong atau menyalin bank soal yang ada. Host dapat mengganti nama, jumlah soal, durasi, nilai, dan mode nilai. Gunakan panah untuk mengatur urutan. Aplikasi mengunci pengubahan batch selama pertanyaan berjalan. Hapus hanya tersedia untuk paket yang belum memiliki progres atau hasil, dan aplikasi tetap menyisakan satu paket reguler. Hasil lama tetap memakai nama babak saat penilaian.

Klik **Nama & foto grup** untuk mengganti nama Grup A, B, atau C dan foto bersama tiga peserta. Nama wajib unik dan berisi 1 sampai 40 karakter. Aplikasi mempertahankan kode grup, skor, progres, dan kunci buzzer. Arena, daftar buzzer, dan papan skor mengikuti nama terbaru. Menu Grup tetap menyediakan tautan buzzer untuk peserta.

Diameter foto panggung kini memakai 10cqw, naik dari 6.5cqw. Foto pada halaman Grup juga lebih besar. Source tetap memakai Next.js dan SQL Server. Struktur engine tetap memakai versi 3. Pembaruan penyimpanan memerlukan tabel relasional baru tanpa dependensi tambahan. Ikuti `PANDUAN_MAINTENANCE_DATABASE.md` untuk memasang pembaruan database, dan `PANDUAN_BATCH_REGULER.md` untuk pengoperasian host.


## Pembaruan jawaban Arena dan nama acara

Baca [PANDUAN_JAWABAN_ARENA_NAMA_ACARA.md](PANDUAN_JAWABAN_ARENA_NAMA_ACARA.md) untuk menu Pengaturan acara, tombol Buka jawaban di Arena, dan pembaruan skema 005. Jalankan `pnpm db:init` sebelum memakai source ini.
