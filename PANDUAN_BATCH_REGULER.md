# Pengelolaan batch nama grup dan foto oleh host

Babak Reguler mulai dengan tiga paket soal. Host dapat mengatur jumlah batch dari 1 sampai 19 melalui menu Kelola batch. Host memilih batch dan grup secara terpisah. Batch 1 dapat dimainkan Grup B, Batch 2 dapat dimainkan Grup C, dan Batch 3 dapat dimainkan Grup A. Host dapat memilih kombinasi lainnya sesuai kebutuhan acara.

| Paket | Grup yang dapat dipilih host | Jumlah awal | Nilai awal | Durasi awal |
| --- | --- | --- | --- | --- |
| Batch 1 | Grup A, B, atau C | 10 soal | 10 poin | 30 detik |
| Batch 2 | Grup A, B, atau C | 10 soal | 10 poin | 30 detik |
| Batch 3 | Grup A, B, atau C | 10 soal | 10 poin | 30 detik |

Setiap batch menyimpan bank soal, jumlah soal, durasi, dan nilai sendiri. Aplikasi menyimpan progres untuk setiap kombinasi batch dan grup. Jika host kembali ke Batch 1 dan Grup B, aplikasi melanjutkan progres pasangan tersebut. Memilih Grup C pada batch yang sama memakai progres Grup C sendiri.

## Memperbarui proyek Windows

1. Hentikan server dengan Ctrl+C. Simpan cadangan database dan source proyek.
2. Salin isi folder source dalam ZIP versi tabel terpisah ini ke folder proyek yang berisi `package.json`, misalnya `C:\js\BGI_Quiz`. Jangan menambahkan lapisan folder proyek baru. Izinkan penggantian source. Jalankan pembaruan database sesuai `PANDUAN_MAINTENANCE_DATABASE.md` sebelum langkah 4.
3. Pertahankan `.env.local` yang menyimpan koneksi SQL Server dan `BGI_ADMIN_TOKEN`.
4. Buka PowerShell pada folder proyek dan jalankan:

```powershell
Set-Location 'C:\js\BGI_Quiz'
if (Test-Path '.next') {
    Remove-Item '.next' -Recurse -Force
}
pnpm exec next dev --hostname 127.0.0.1 --port 3100
```

5. Buka `http://localhost:3100/host`, tekan Ctrl+F5, lalu periksa dua bagian pilihan: batch soal dan grup yang bermain.

Untuk versi tabel terpisah dalam paket ini, jalankan pembaruan database melalui `pnpm db:init` atau kedua skrip skema di SSMS sebelum menjalankan source baru. Ikuti `PANDUAN_MAINTENANCE_DATABASE.md`. Pembaruan tidak menambah dependensi. Petunjuk patch host di atas menjelaskan fitur antarmuka; pemasangan versi database terbaru mengikuti panduan maintenance.

## Menu Kelola batch pada panel host

1. Buka `/host`, lalu klik **Kelola batch** di bagian atas atau di bawah daftar pilihan batch.
2. Klik **Tambah batch**. Isi nama paket, jumlah soal, durasi, nilai awal, dan mode nilai. Nama batch wajib unik.
3. Pilih bank soal awal: **Kosong, isi melalui Bank Soal** atau **Salin dari** batch yang ada. Form mengikuti pengaturan sumber saat Anda memilih salinan, lalu Anda dapat mengubahnya sebelum menyimpan.
4. Klik **Simpan batch**. Paket baru muncul pada Kontrol Kuis dan Bank Soal. Salinan memakai identitas soal sendiri dan tidak menyalin skor atau progres sumber. Tinjau kesetaraan materi sebelum acara.
5. Klik **Ubah** untuk mengubah nama dan pengaturan batch. Gunakan panah naik atau turun untuk mengatur urutan. Aplikasi mempertahankan progres, identitas paket, dan hasil lama saat nama atau urutan berubah.
6. Gunakan ikon hapus untuk menghapus batch yang belum memiliki progres atau hasil. Konfirmasikan penghapusan pada dialog. Penghapusan juga menghapus bank soal paket tersebut. Aplikasi tetap menyisakan minimal satu batch reguler.
7. Aplikasi mengunci perubahan batch saat timer atau buzzer sedang berjalan. Selesaikan penilaian sebelum mengubah paket. Jika paket sudah memiliki progres, aplikasi mengunci hapus sampai host melakukan reset sesi secara terpisah.

Batas saat ini adalah 19 batch reguler dan satu babak rebutan, dengan 1 sampai 100 soal per paket. Paket baru yang kosong tidak dapat mulai sampai host melengkapi soal. Mengurangi jumlah soal sampai di bawah progres akan menandai giliran selesai. Menambahnya kembali membuka soal berikutnya sesuai progres.

## Menu Nama dan foto grup pada panel host

1. Klik **Nama & foto grup** pada `/host`.
2. Klik **Ubah nama & foto** pada grup yang ingin Anda ubah.
3. Isi nama baru, misalnya Tim Nusantara. Nama wajib berisi 1 sampai 40 karakter dan berbeda dari grup lain. Isi nama tiga peserta bila diperlukan.
4. Pilih satu foto bersama ketiga peserta. Aplikasi menerima JPG, PNG, atau WebP hingga 8 MB, memotong area tengah, lalu mengompresnya.
5. Klik **Simpan grup**. Arena, papan skor, urutan buzzer, dan halaman peserta mengikuti nama serta foto terbaru.

Kode internal A, B, dan C tetap menjaga identitas grup. Mengganti nama mempertahankan skor, progres, foto yang tidak Anda ubah, dan tautan buzzer. Menu **Grup** tetap menyediakan tautan buzzer untuk dibagikan kepada peserta.

Foto lingkaran pada arena kini memakai diameter 10cqw, sebelumnya 6.5cqw. Perubahan ini memperbesar diameter sekitar 54 persen. Foto pada halaman Grup dan form edit juga lebih besar. Teks nama dapat memakai dua baris, sementara skor dan status buzzer tetap tampil.

## Alur host

1. Buka Kontrol Kuis, lalu pilih Babak Reguler.
2. Pada bagian 1, pilih Batch 1, Batch 2, atau Batch 3.
3. Pada bagian 2, pilih Grup A, Grup B, atau Grup C. Periksa indikator giliran dan progres grup pada batch tersebut.
4. Klik Mulai waktu menjawab. Hanya grup pilihan yang dapat menekan buzzer dan menjawab. Aplikasi menolak permintaan dari grup lainnya.
5. Klik Benar atau Salah. Jawaban benar menambah nilai kepada grup pilihan; jawaban salah memberi 0 poin.
6. Klik Soal berikutnya. Pada soal terakhir, klik Selesaikan giliran.
7. Pilih batch dan grup untuk giliran berikutnya. Saat soal atau timer masih berjalan, aplikasi mengunci pergantian batch dan grup. Setelah penilaian, klik Soal berikutnya sebelum mengganti grup.
8. Pilih Babak Rebutan saat diperlukan. Semua grup memakai buzzer rebutan seperti sebelumnya, dan skor reguler tetap terkumpul.

Memilih batch mengosongkan pilihan grup sehingga host perlu menetapkan grup sebelum memulai. Memilih kembali grup yang sudah menyelesaikan paket akan menampilkan status selesai. Aplikasi tetap mencegah penilaian ganda pada pasangan batch dan grup yang sama.

## Mengatur soal

Pada Bank Soal, pilih Babak Reguler lalu pilih batch yang ingin diubah. Admin mengatur paket soal tanpa menetapkan grup pemilik. Nama paket, urutan, jumlah soal, durasi, dan mode nilai hanya berlaku pada batch pilihan tersebut.

Setiap batch memiliki nomor soal sendiri. Nomor 1 pada Batch 1 tidak menimpa nomor 1 pada Batch 2. Pertanyaan dan jawaban benar tetap wajib diisi. Soal pilihan ganda memerlukan pilihan yang berbeda serta jawaban yang cocok.

Instalasi baru menyediakan 40 soal contoh, terdiri dari 30 soal reguler berbeda dan 10 rebutan. Tinjau materi serta kesetaraan kesulitan sebelum acara. Panitia menentukan pembagian paket agar pertandingan tetap adil.

## Data lama dan penyimpanan

Server menyesuaikan dokumen kuis versi 1 atau 2 ke versi 3 melalui transaksi dan pemeriksaan revisi. Migrasi bersamaan hanya menyimpan satu pembaruan beserta auditnya.

Untuk versi tiga batch yang sebelumnya mengikat Grup A, B, dan C, aplikasi mempertahankan semua bank soal, pengaturan, skor, hasil, progres, foto, kunci buzzer, serta timer yang sedang berjalan. Aplikasi melepaskan pengikatan grup tetap. Pilihan grup yang sedang aktif tetap tersedia sampai host memilih giliran baru.

Untuk versi satu bank reguler, aplikasi mempertahankan soal lama pada Batch 1. Batch baru yang belum dimainkan memperoleh contoh soal berbeda. Jika sesi lama sudah memakai bank tersebut untuk Grup B atau C, aplikasi mempertahankan bank serta pengaturannya pada batch terkait agar sesi tetap dapat berlanjut. Setelah migrasi, host dapat memilih grup mana pun pada setiap batch.

Arena, buzzer peserta, riwayat, dan ekspor CSV mengikuti batch serta grup pilihan host. Reset sesi tetap memerlukan tindakan terpisah dengan konfirmasi RESET dan tidak menghapus paket soal.

## Hasil pemeriksaan

Build Next.js, pemeriksaan TypeScript, dan pengujian source lulus. Lihat jumlah dan rincian pemeriksaan terbaru pada `SOURCE_MANIFEST.json`. Pengujian mencakup sembilan kombinasi batch dan grup, penolakan buzzer grup lain, pergantian giliran, progres terpisah, skor, migrasi data versi 1 dan 2, sesi aktif atau dijeda, konkurensi, rollback, serta render kontrol host dan admin. Pengujian tambahan mencakup penambahan batch hingga batas, salinan soal independen, pengaturan urutan, perlindungan penghapusan progres, perubahan nama, akses penyelenggara, dan persistensi pengaturan host.

Pengujian adapter SQL Server memakai driver tiruan. Koneksi SQL Server nyata dan tampilan pada browser Windows belum terverifikasi pada lingkungan pengerjaan. Lakukan latihan pada server dan perangkat acara setelah memasang pembaruan.

Panduan Word versi 4 di dalam ZIP source lengkap menjelaskan pemilihan batch dan grup secara dinamis.
