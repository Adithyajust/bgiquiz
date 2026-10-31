# Pembaruan soal dan jawaban pada buzzer peserta

ZIP ini memuat source lengkap dari BGI_Quiz_Buzzer_MP3.zip yang Anda kirim, dengan kartu soal dan jawaban pada halaman buzzer grup A, B, serta C. Arena dan halaman peserta menggunakan aturan tampilan yang sama.

| Tindakan host | Tampilan soal | Blok jawaban benar |
| --- | --- | --- |
| Memilih batch atau grup sebelum Mulai | Menunggu host | Belum tampil |
| Mulai menjawab atau Mulai soal & buka buzzer | Soal aktif tampil beserta pilihan jika ada | Belum tampil |
| Buka jawaban di Arena | Soal aktif tetap tampil | Tampil di Arena dan buzzer peserta |
| Sembunyikan jawaban | Soal aktif tetap tampil | Kembali tersembunyi |
| Benar atau Salah | Soal aktif tetap tampil | Mengikuti status Buka atau Sembunyikan |
| Soal berikutnya | Menunggu host memulai soal berikutnya | Kembali tersembunyi |
| Selesai giliran | Pesan persiapan giliran berikutnya | Tidak tampil |

Saat host membuka jawaban pilihan ganda, peserta melihat huruf pilihan dan jawaban benar seperti Arena. Saat host menyembunyikan jawaban, pilihan jawaban tampil kembali. Catatan khusus host dan isi soal berikutnya tidak tampil pada perangkat peserta.

Pada layar lebar, kartu soal berada di samping tombol buzzer. Pada ponsel, kartu berada di atas tombol. Peserta dapat menggulir halaman untuk membaca soal panjang.

## Memasang pada aplikasi yang sudah berjalan

1. Hentikan aplikasi dengan Ctrl+C.
2. Ekstrak ZIP ini, lalu salin isinya ke folder proyek yang berisi package.json. Gabungkan folder dan timpa berkas dengan nama yang sama.
3. Gunakan konfigurasi .env.local serta database yang sekarang. Pembaruan ini tidak memerlukan migrasi database atau dependensi tambahan.
4. Jalankan kembali aplikasi menggunakan perintah yang biasa Anda pakai.
5. Tekan Ctrl+F5 pada Host, Arena, dan semua perangkat buzzer peserta.

Jika memakai folder proyek baru, jalankan pnpm install --frozen-lockfile untuk memasang dependensi. Jika memakai hasil build produksi, lakukan build ulang sebelum menjalankannya.

## Menguji alur

1. Buka Host, Arena, dan tautan buzzer salah satu grup.
2. Pilih batch serta grup. Pastikan Arena dan buzzer belum menampilkan isi soal.
3. Klik Mulai menjawab. Keduanya menampilkan soal yang sama.
4. Klik Buka jawaban di Arena. Keduanya menampilkan jawaban yang sama.
5. Klik Sembunyikan jawaban. Keduanya menutup blok jawaban benar.
6. Nilai jawaban, klik Soal berikutnya, lalu periksa bahwa keduanya menunggu host memulai soal berikutnya.
7. Ulangi pada babak rebutan dan halaman buzzer grup lain.

Halaman mengikuti perubahan host melalui pembaruan data otomatis. Periksa indikator koneksi pada perangkat peserta jika perubahan belum muncul.

## Berkas yang berubah

- lib/engine.ts: aturan tampilan bersama untuk Arena dan peserta.
- components/core.tsx: kartu soal peserta dan pemakaian aturan bersama oleh Arena.
- components/screens.tsx: penempatan kartu pada halaman buzzer.
- public/styles/bgi-quiz.css: tata letak kartu dan penyesuaian ponsel.
- app/layout.tsx: versi URL stylesheet terbaru.
- tests/run.mjs: menjalankan pengujian baru.

Source juga menambahkan tests/buzzer-content.mjs dan panduan ini. Seluruh berkas lain mengikuti unggahan Anda, termasuk MP3 serta mekanisme audio pada Host dan buzzer.

## Hasil pemeriksaan

Semua 15 pengujian baru lulus. Pengujian mencakup reguler, rebutan, Mulai, buka dan sembunyikan jawaban, jeda, penilaian, pindah soal, ganti batch, selesai giliran, pilihan ganda, serta penanganan karakter HTML pada isi soal.

Source sebelum perubahan menghasilkan 105 pengujian lulus dari 116. Setelah perubahan, 120 pengujian lulus dari 131. Sebelas kegagalan yang sama tetap muncul. Kegagalan awal mencakup skrip SQL yang tidak ada, pengujian lama mengenai soal sebelum Mulai, serta pemetaan impor modul audio pada pengujian render Host.

Pemeriksaan TypeScript menghasilkan lima error lama yang sama: tipe DB pada db/index.ts dan lib/runtime-cloudflare.ts, serta referensi .openai/hosting.json pada vite.config.ts. Perubahan ini tidak menambahkan error TypeScript. Build produksi belum lolos pemeriksaan proyek tersebut.

Server pengembangan Next.js berhasil menyajikan halaman Arena, Host, ketiga halaman buzzer, dan stylesheet terbaru dengan HTTP 200. Pemeriksaan tidak mencakup interaksi langsung melalui browser Windows dan database SQL Server Anda.
