# Tombol Tentukan Juara terkunci karena batch cadangan

Pada versi sebelumnya, semua babak yang terdaftar diperiksa berdasarkan jumlah soal dalam pengaturan. Batch 4 yang tidak dipilih, termasuk batch dengan bank soal kosong, tetap dihitung sebagai babak yang belum selesai.

## Cara memakai perbaikan

1. Pasang source dalam ZIP ini pada folder aplikasi, menggunakan konfigurasi dan database yang sekarang. Gabungkan folder dan timpa source yang berubah.
2. Pada SQL Server, tabel baru disiapkan otomatis jika akun aplikasi memiliki izin. Jika tidak, jalankan **sql/sqlserver/008_round_participation.sql** melalui SSMS pada database kuis dan berikan izin baca/tulis pada **dbo.quiz_round_exclusions**. Bila fitur juara belum pernah dipasang, jalankan juga **007_championship.sql**.
3. Jalankan ulang aplikasi. Untuk mode produksi, lakukan build ulang dengan perintah proyek yang biasa digunakan. Muat ulang Host dan Arena dengan Ctrl+F5.
4. Buka **Kontrol Kuis → Tentukan Juara**.
5. Batch 4 tanpa soal dan tanpa progres tampil **Dilewati: bank soal kosong** secara otomatis.
6. Jika Batch 4 berisi soal tetapi tidak digunakan, klik **Tidak dimainkan** pada kartu Batch 4. Pilihan ini tidak menghapus soal, skor, atau hasil dan tersimpan untuk sesi yang berjalan.
7. Setelah Batch 1, Batch 2, Batch 3, dan Rebutan selesai dinilai, tombol **Tentukan Juara** aktif. Klik untuk menampilkan juara di Arena.

## Jika tombol masih terkunci

Baca keterangan tepat di bawah kartu babak. Panel menyebut nama dan progres babak yang belum selesai, soal yang masih berjalan, atau koneksi yang terputus.

- Batch sudah mendapat penilaian: selesaikan sisa soal. Pilihan Tidak dimainkan hanya tersedia untuk babak yang belum dinilai.
- Jumlah soal tidak sesuai acara: sesuaikan jumlahnya melalui pengaturan babak.
- Soal terakhir masih berjalan: beri penilaian Benar atau Salah. Setelah penilaian terakhir, tidak perlu menekan Soal berikutnya untuk menetapkan juara.
- Semua babak kosong/dilewati: minimal satu babak harus selesai dimainkan agar ada hasil perlombaan.

## Membatalkan pilihan

Klik **Ikutkan lagi** untuk memainkan batch cadangan. Jika juara sudah diumumkan, pengumuman dibatalkan sampai babak tambahan selesai dan host menetapkan ulang juara. Reset sesi juga membersihkan pilihan Tidak dimainkan untuk acara berikutnya.

Source ini mempertahankan fitur juara dengan foto dan skor, koreksi nilai, suara MP3 melalui Arena, serta sinkronisasi soal/jawaban di Arena dan halaman peserta.

## Verifikasi

15 pengujian baru perbaikan ini lulus. Suite lengkap: 192 lulus dari 199; tujuh kegagalan lama masih tersisa. Pemeriksaan TypeScript masih memiliki lima error lama terkait tipe DB dan konfigurasi hosting. Pengujian SQL Server menggunakan kontrak repository, bukan koneksi ke server acara Anda.

Pembaruan audio terbaru memutar buzzer, Benar, dan Salah melalui Arena. Baca **PANDUAN_AUDIO.md**, lalu klik **Aktifkan Audio Arena** sekali pada perangkat speaker sebelum acara.

Untuk musik saat pengumuman juara, buka panel **Musik perayaan juara** pada Arena. Pilih MP3 sebelum host menekan Tentukan Juara. Petunjuk dan status berkas lagu ada pada **PANDUAN_MUSIK_PERAYAAN.md**.
