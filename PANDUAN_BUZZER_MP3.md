# Panduan suara Arena: buzzer, Benar, dan Salah

Pembaruan ini memakai ketiga MP3 asli yang Anda kirim:

| Kejadian | Berkas suara |
| --- | --- |
| Server menerima tekanan buzzer pertama | bunyi_buzer.mp3 |
| Host memberi nilai Benar | benar.mp3 |
| Host memberi nilai Salah | salah.mp3 |

Halaman dengan Audio aktif mengikuti penilaian yang berhasil diterima server. Versi ini menyediakan Audio di Host maupun Arena. Pembaruan data berkala tidak mengulang bunyi. Satu pemutar menangani semua suara. Saat penilaian masuk, pemutar menghentikan bunyi buzzer yang masih berjalan lalu memutar suara Benar atau Salah.

## Memasang pada aplikasi yang sudah berjalan

1. Hentikan aplikasi dengan Ctrl+C.
2. Salin tujuh berkas berikut dari ZIP ke lokasi yang sama pada folder proyek yang berisi package.json. Timpa berkas lama jika Windows meminta:
   - components/quiz-client.tsx
   - components/audio-controls.tsx
   - components/screens.tsx
   - lib/buzzer-audio.ts
   - public/audio/bunyi_buzer.mp3
   - public/audio/benar.mp3
   - public/audio/salah.mp3
3. Pertahankan konfigurasi .env.local dan database yang sekarang. Pembaruan audio ini tidak membutuhkan migrasi database atau paket tambahan.
4. Jalankan kembali aplikasi dengan perintah yang biasa Anda pakai. Contoh pengembangan pada port 3100:

```powershell
Set-Location 'C:\js\BGI_Quiz'
pnpm exec next dev --hostname 127.0.0.1 --port 3100
```

Jika Anda memakai build produksi, lakukan build ulang sebelum menjalankan hasil build tersebut.

5. Buka Arena melalui http://localhost:3100/ atau alamat server Anda, lalu tekan Ctrl+F5.
6. Klik **Audio nonaktif** pada toolbar di bawah Arena. Browser memutar contoh bunyi buzzer, lalu tombol berubah menjadi **Audio aktif**. Langkah ini mengaktifkan ketiga suara sekaligus.
7. Jika Anda ingin suara berasal dari halaman Host, buka Kontrol Kuis. Panel **Audio Host** berada di bawah judul halaman. Klik **Audio Host nonaktif**, **Uji Benar**, atau **Uji Salah** untuk mengaktifkan suara di Host.
8. Pilih satu tab yang terhubung ke speaker. Jika Host dan Arena sama-sama aktif, keduanya memutar suara. Matikan Audio pada tab yang tidak Anda gunakan sebagai sumber suara.

Browser menyimpan pengaktifan Audio selama tab tersebut berjalan. Setelah memuat ulang halaman atau membuka tab baru, klik Audio lagi. Tombol **Audio aktif** mematikan semua suara dan menghentikan pemutaran yang masih berlangsung.

## Menguji sebagai host

1. Buka Kontrol Kuis pada tab atau perangkat host. Aktifkan Audio pada Host atau Arena sesuai perangkat speaker Anda.
2. Klik **Uji Benar** untuk memutar benar.mp3, lalu **Uji Salah** untuk memutar salah.mp3. Kedua tombol uji tidak menilai jawaban dan tidak mengubah skor. Tombol uji tersedia di panel Audio Host dan di bawah toolbar Arena. Menguji suara juga mengaktifkan Audio pada tab tersebut.
3. Untuk reguler, pilih batch dan grup, lalu klik **Mulai menjawab**. Untuk rebutan, klik **Mulai soal & buka buzzer**, kemudian konfirmasi grup setelah menerima buzzer.
4. Saat peserta menekan buzzer yang aktif, halaman dengan Audio aktif memutar **bunyi_buzer.mp3**.
5. Klik **Benar**. Halaman dengan Audio aktif memutar **benar.mp3**, dan aplikasi menambahkan poin sesuai aturan soal.
6. Lanjutkan ke soal berikutnya, mulai soal, lalu klik **Salah**. Halaman dengan Audio aktif memutar **salah.mp3**, dan aplikasi mengikuti aturan nilai Salah yang sudah ada.

Host juga dapat memakai **Uji buzzer** setelah membuka tahap permainan yang sesuai. Jika host mengoreksi hasil soal yang masih tampil melalui Koreksi Nilai, Arena memutar suara sesuai hasil koreksi. Koreksi soal lama tidak memutar ulang suara pada Arena.

Audio berasal dari tab yang Anda aktifkan, baik Host maupun Arena. Jika Audio sedang mati, mengaktifkannya tidak mengulang penilaian atau buzzer yang sudah lewat. Versi sebelumnya hanya memutar suara otomatis dari Arena.

## Jika suara belum terdengar

Periksa volume komputer, volume tab browser, dan perangkat keluaran speaker. Klik Audio untuk mencoba kembali. Periksa akses berkas melalui alamat server aplikasi Anda:

- http://localhost:3100/audio/bunyi_buzer.mp3
- http://localhost:3100/audio/benar.mp3
- http://localhost:3100/audio/salah.mp3

Jika tautan menghasilkan 404, periksa lokasi berkas di public/audio, jalankan ulang server, lalu muat ulang Arena dengan Ctrl+F5.

## Hasil pemeriksaan

- Semua 23 pengujian audio lulus. Pengujian mencakup reguler, rebutan, penilaian Benar dan Salah, koreksi hasil saat ini, pembaruan data berulang, kondisi Audio mati, serta penanganan penolakan pemutaran oleh browser. Pengujian tambahan menjalankan handler tombol Uji Benar dan Uji Salah pada komponen Host dan Arena untuk memastikan pemetaan MP3 tanpa mengubah skor.
- Pemeriksaan byte dan SHA-256 memastikan semua MP3 sama persis dengan unggahan Anda. Ketiganya juga lolos decoding MP3.
- Server pengembangan Next.js mengembalikan HTTP 200 dengan tipe audio/mpeg untuk ketiga berkas. Isi unduhan HTTP cocok dengan berkas asli.
- Keseluruhan suite setelah pembaruan soal buzzer menghasilkan 147 pengujian lulus dari 154. Tujuh kegagalan yang sama sudah muncul pada source awal. Kegagalan tersebut berkaitan dengan skrip SQL yang tidak ada dalam ZIP serta pengujian lama mengenai waktu tampil soal dan pembukaan buzzer.
- Pemeriksaan TypeScript masih menemukan error bawaan pada db/index.ts, lib/runtime-cloudflare.ts, serta referensi .openai/hosting.json pada vite.config.ts. Perubahan ini memperbaiki pemeriksaan panjang teks saat soal belum tersedia pada components/core.tsx. Build produksi belum lolos pemeriksaan proyek tersebut.
- Pengujian tidak mencakup pemutaran yang terdengar langsung melalui browser Windows dan speaker Anda. Gunakan langkah uji host di atas sebelum acara.
