# Jawaban di Arena dan nama acara dinamis

Pembaruan ini melanjutkan source Layout Biru Oranye yang Anda unggah. Aplikasi mempertahankan Next.js, SQL Server, bank soal, batch dinamis, identitas grup, foto, skor, dan progres.

## Memperbarui aplikasi Windows

1. Cadangkan database dan folder proyek.
2. Hentikan seluruh proses aplikasi dengan Ctrl+C, termasuk proses lain yang memakai database kuis yang sama.
3. Ekstrak ZIP. Salin isi folder `BGI_Quiz_NextJS_SQLServer` ke folder proyek Anda, misalnya `C:\js\BGI_Quiz`. Izinkan penggantian berkas source. Pertahankan `.env.local` Anda. ZIP ini tidak memuat kredensial atau data sesi.
4. Dari PowerShell pada folder proyek, jalankan:

```powershell
Set-Location 'C:\js\BGI_Quiz'
pnpm db:init
pnpm db:check
if (Test-Path '.next') {
    Remove-Item '.next' -Recurse -Force
}
pnpm exec next dev --hostname 127.0.0.1 --port 3100
```

Jika dependensi atau driver belum tersedia, jalankan `pnpm install --frozen-lockfile` dan `pnpm db:driver` terlebih dahulu. Jika proyek sudah berjalan dengan paket sebelumnya, pembaruan ini tidak mengubah daftar dependensi.

5. Buka `http://localhost:3100/host` dan tekan Ctrl+F5. Muat ulang juga tab Arena dan perangkat peserta agar semuanya memakai versi yang sama.
6. Jika akun aplikasi tidak memiliki izin mengubah skema, jalankan `sql/sqlserver/005_event_answer_settings.sql` melalui SSMS pada database kuis yang sama setelah 001 dan 002. Kemudian jalankan `pnpm db:check` sebelum menyalakan aplikasi. Skrip 005 hanya menambah kolom yang belum ada; pengulangan tidak menghapus nilai yang sudah tersimpan.

Untuk perangkat peserta pada jaringan lokal, gunakan alamat IP komputer server dan jalankan Next.js dengan `--hostname 0.0.0.0`. Gunakan konfigurasi jaringan yang selama ini sudah bekerja.

## Mengganti nama Quiz Night

1. Buka **Kontrol Kuis** di `/host` dan masuk sebagai penyelenggara.
2. Klik **Pengaturan acara**.
3. Isi **Nama acara**, misalnya `Cerdas Cermat BGI`.
4. Klik **Simpan nama acara**.

Nama mengikuti masukan host pada navigasi, judul Arena, footer Arena, halaman buzzer, dan judul tab browser. Nama awal tetap `Quiz Night`. Batas nama 60 karakter dalam satu baris. Aplikasi menolak nama kosong. Mengganti nama tidak mengubah logo BGI, nama perusahaan, foto grup, soal, skor, timer, atau tautan buzzer. Nama tetap tersimpan setelah kuis direset.

## Membuka jawaban pada Arena

1. Pilih batch dan grup seperti biasa, atau jalankan Babak Rebutan.
2. Di bagian jawaban pada panel host, klik **Buka jawaban di Arena**.
3. Arena menampilkan kotak **JAWABAN BENAR** di bawah pertanyaan. Untuk pilihan ganda, kotak tersebut juga memuat huruf pilihan. Kotak jawaban menggantikan daftar opsi selama jawaban terbuka.
4. Klik **Sembunyikan jawaban** untuk menutup jawaban kembali.

Server menyimpan status tampil. Tab Arena lain mengikuti pembaruan lewat polling sekitar 0,65 detik ditambah latensi jaringan. Memuat ulang halaman tidak menutup jawaban yang masih terbuka. Saat host berpindah soal, batch, atau grup, memulai pertanyaan, membuka kembali buzzer rebutan, mengubah soal aktif, atau mereset sesi, aplikasi menyembunyikan jawaban otomatis. Penilaian benar/salah mempertahankan jawaban yang sudah terbuka sampai host menutup atau berpindah soal.

Tombol buka/tutup jawaban tidak menjalankan penilaian, menambah skor, atau menghentikan timer. Gunakan tombol Jeda dan penilaian yang sudah ada sesuai kebutuhan acara. Hanya host dapat mengubah status tampil.

Jawaban yang host buka menjadi informasi publik untuk soal aktif. Arena dan perangkat yang mengakses data publik dapat menerima jawaban tersebut. Aplikasi tetap merahasiakan jawaban soal lain, catatan pembawa acara, dan kunci buzzer. Catatan host tidak muncul di Arena. Panduan ini melengkapi panduan Word versi sebelumnya, khususnya perilaku tombol jawaban yang kini tersinkron ke Arena.

## Penyimpanan SQL Server

| Data | Tabel dan kolom |
| --- | --- |
| Nama acara | `dbo.quiz_settings.event_name`, NVARCHAR(60), nilai awal `Quiz Night` |
| Status jawaban | `dbo.quiz_game_state.answer_visible`, BIT, nilai awal 0 |

`pnpm db:init` kini menjalankan 001, 002, dan 005. Tabel lain tetap mengikuti struktur relasional yang sudah ada. Penyimpanan melalui aplikasi memakai transaksi dan pemeriksaan revisi yang sama dengan skor dan progres. Backend SQLite pratinjau juga menyimpan kedua pengaturan dalam dokumen sesi.

## Pemeriksaan setelah pemasangan

- Ubah nama acara pada host dan periksa judul Arena di tab lain.
- Buka lalu sembunyikan jawaban. Pastikan tab Arena mengikuti kedua tindakan.
- Buka jawaban, lalu muat ulang host dan Arena. Pastikan status tetap sama.
- Nilai jawaban dan lanjut ke soal berikutnya. Pastikan jawaban soal berikutnya belum terbuka.
- Periksa bahwa skor tidak berubah ketika tombol buka/tutup jawaban ditekan.

Pemeriksaan pengembangan: TypeScript, build Next.js, dan 96 pengujian lulus. Tes mencakup logika, API, render komponen, penyimpanan SQLite, serta adapter SQL Server dengan driver tiruan. Koneksi dan migrasi SQL Server nyata belum diuji. Browser pengujian tidak dapat mengakses server lokal pada lingkungan ini, sehingga tampilan langsung pada Windows/proyektor perlu Anda periksa setelah pemasangan.
