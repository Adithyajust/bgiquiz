# Menentukan juara dan menampilkan perayaan di Arena

## Menggunakan fitur

1. Buka **Kontrol Kuis**. Panel **Tentukan Juara** berada di bagian atas, tepat di bawah judul halaman.
2. Panel menampilkan progres setiap batch reguler dan babak Rebutan. Pada pengaturan awal, panel memeriksa Batch 1, Batch 2, Batch 3, dan Rebutan.
3. Selesaikan setiap batch reguler yang dimainkan dengan satu grup pilihan host. Setelah satu grup menuntaskan seluruh soal sebuah batch, panel menandai batch itu Selesai. Aplikasi tidak mewajibkan ketiga grup mengerjakan paket reguler yang sama.
4. Batch kosong tanpa progres dilewati otomatis. Untuk batch cadangan berisi soal yang tidak dipakai, klik **Tidak dimainkan** pada kartu batch di panel ini. Pilihan tersedia hanya sebelum batch mendapat penilaian dan dapat dibatalkan melalui **Ikutkan lagi**.
5. Selesaikan seluruh soal Rebutan yang dimainkan. Penilaian Benar maupun Salah sama-sama menandai soal sebagai selesai dinilai.
6. Setelah semua babak yang dimainkan selesai, klik **Tentukan Juara**. Tombol dapat digunakan setelah penilaian soal terakhir, tanpa harus menekan Soal berikutnya lebih dulu. Tombol tetap terkunci selama ada soal yang sedang berjalan.
7. Buka **Arena** atau gunakan layar penuh. Arena menampilkan tim dengan nilai akhir tertinggi, foto grup, nama tim, dan total poin dalam perayaan berwarna emas dengan piala, mahkota, sorotan cahaya, serta konfeti.

Jika Anda menambah atau mengganti nama batch, panel mengikuti nama dan pengaturan terbaru. Setiap kartu menunjukkan progres atau alasan dilewati. Teks di bawah kartu menjelaskan babak yang masih mengunci tombol. Minimal satu babak harus selesai dimainkan; sesi kosong tidak dapat menentukan juara.

**Batch 4 kosong atau tidak dipilih:** bank soal kosong dilewati otomatis. Batch berisi soal tetap wajib selesai sampai host menandainya Tidak dimainkan. Jika sebagian soal batch sudah mendapat penilaian, tuntaskan sisanya. Jika jumlah soal yang diatur berbeda dengan jumlah soal acara, periksa Pengaturan Babak agar jumlahnya sesuai.

## Foto dan nilai akhir

Unggah foto melalui **Kontrol Kuis → Nama & foto grup**. Perayaan memakai foto dan nama yang tersimpan untuk tim pemenang. Jika foto belum tersedia, aplikasi menampilkan ikon foto tim.

Server menentukan juara dari skor seluruh tim dalam database. Host tidak mengisi nilai atau memilih nama pemenang pada tombol penetapan. Skor yang tampil merupakan nilai tertinggi saat host menetapkan juara.

Jika dua atau tiga tim memperoleh skor tertinggi yang sama, Arena menampilkan **JUARA BERSAMA**, lengkap dengan masing-masing foto, nama, dan nilai. Aplikasi tidak memilih pemenang secara acak.

## Mengoreksi atau menutup perayaan

- **Koreksi Nilai:** koreksi yang berhasil tersimpan membatalkan penetapan juara sebelumnya. Periksa skor terbaru, lalu tekan **Tentukan Juara** lagi di Kontrol Kuis.
- **Tutup perayaan:** mengembalikan Arena ke tampilan kuis. Skor dan progres tetap tersedia. Host dapat menetapkan juara kembali.
- **Reset sesi:** membersihkan pengumuman juara, pilihan Tidak dimainkan, skor, dan progres sesi, mengikuti prosedur reset yang sudah ada.
- Memulai giliran lain atau mengubah pengaturan babak juga memerlukan penetapan ulang. Pengubahan nama acara atau foto/nama tim mengikuti identitas terbaru pada perayaan.

Hasil penetapan tersimpan pada database. Menutup tab atau memuat ulang Arena tidak menghilangkannya. Perubahan host mengikuti pembaruan data otomatis pada browser Arena.

## Memasang source

1. Hentikan aplikasi dengan Ctrl+C.
2. Ekstrak ZIP ke folder proyek yang berisi package.json. Gabungkan folder dan timpa berkas dengan nama yang sama.
3. Gunakan konfigurasi .env.local dan database kuis yang sekarang. Jika memakai folder baru, pasang dependensi dengan pnpm install --frozen-lockfile.
4. Untuk SQL Server, aplikasi menyiapkan **dbo.quiz_championships** dan **dbo.quiz_round_exclusions** saat koneksi pertama. Tabel pertama menyimpan juara, dan tabel kedua menyimpan pilihan babak Tidak dimainkan per sesi.
5. Jika akun aplikasi tidak memiliki izin membuat tabel, jalankan **sql/sqlserver/007_championship.sql** dan **sql/sqlserver/008_round_participation.sql** melalui SSMS pada database kuis sebelum menjalankan versi baru. Skrip dapat dijalankan ulang. Akun dengan hak akses per tabel juga memerlukan izin baca dan tulis pada kedua tabel tersebut.
6. Jalankan kembali aplikasi dengan perintah yang biasa Anda gunakan. Jika memakai build produksi, lakukan build ulang.
7. Tekan Ctrl+F5 pada Host, Arena, dan perangkat peserta agar browser memuat source serta tampilan terbaru.

Periksa contoh tampilan melalui **docs/PRATINJAU_JUARA.html**. Buka berkas tersebut di browser. Contoh menyediakan satu juara, dua juara bersama, dan tiga juara bersama dengan data demonstrasi.

## Pemeriksaan

Perbaikan tombol menambah **15 pengujian yang semuanya lulus**. Pengujian meliputi Batch 4 kosong, batch cadangan berisi soal, klik tombol kontrol host, pembatalan pilihan, penolakan melewati babak yang sudah dinilai, penyimpanan setelah restart, akses host, reset, dan transaksi/rollback SQL Server.

Suite lengkap menghasilkan **192 lulus dari 199 pengujian**, dengan tujuh kegagalan lama dan tanpa kegagalan tambahan dari pembaruan audio. Pemeriksaan TypeScript tetap menemukan lima error lama terkait tipe DB dan referensi .openai/hosting.json; tidak ada error TypeScript baru pada perubahan ini. Build produksi belum lolos pemeriksaan proyek tersebut.

Pengujian menggunakan render komponen, handler tombol sebenarnya, API, SQLite, serta kontrak repository SQL Server. Pengujian tidak menjalankan SQL Server dan browser Windows Anda secara langsung. Gerakan perayaan mengikuti preferensi reduced motion pada perangkat.

Pembaruan audio terbaru memutar buzzer, Benar, dan Salah melalui Arena. Baca **PANDUAN_AUDIO.md**, lalu klik **Aktifkan Audio Arena** sekali pada perangkat speaker sebelum acara.

Untuk musik saat pengumuman juara, buka panel **Musik perayaan juara** pada Arena. Pilih MP3 sebelum host menekan Tentukan Juara. Petunjuk dan status berkas lagu ada pada **PANDUAN_MUSIK_PERAYAAN.md**.
