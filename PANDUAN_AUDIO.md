# Suara buzzer, Benar, dan Salah melalui Arena

Arena menjadi satu-satunya halaman yang memutar ketiga suara kuis. Host mengirim penilaian melalui Kontrol Kuis. Peserta mengirim tekanan buzzer melalui halaman grup. Arena mengikuti kejadian yang berhasil diterima server, lalu memutar MP3 yang sesuai.

| Kejadian | Berkas suara | Perangkat yang memutar |
| --- | --- | --- |
| Tekanan buzzer pertama yang sah | public/sounds/bunyi_buzer.mp3 | Perangkat yang membuka Arena |
| Host menekan Benar dan server menerima penilaian | public/sounds/benar.mp3 | Perangkat yang membuka Arena |
| Host menekan Salah dan server menerima penilaian | public/sounds/salah.mp3 | Perangkat yang membuka Arena |

## Persiapan operator

1. Hubungkan speaker ke komputer atau laptop yang membuka **Arena**.
2. Buka halaman **Arena** pada browser perangkat tersebut.
3. Klik **Aktifkan Audio Arena** sekali. Tunggu sampai tombol menampilkan **Audio Arena aktif**. Browser memerlukan interaksi ini sebelum memutar suara otomatis dari kejadian kuis.
4. Gunakan layar penuh untuk menampilkan Arena pada proyektor. Pertahankan tab Arena tetap terbuka selama acara.
5. Host dapat menjalankan **Kontrol Kuis** pada tab atau perangkat lain. Perangkat Arena tetap memutar seluruh suara.

Jika Anda memuat ulang atau membuka tab Arena baru, klik Aktifkan Audio Arena kembali. Tombol yang sama dapat menghentikan suara pada perangkat tersebut. Aktifkan audio pada satu tab Arena yang terhubung ke speaker agar beberapa tab tidak memutar suara bersamaan.

## Uji sebelum acara

1. Host memilih batch reguler dan grup, lalu memulai soal.
2. Peserta menekan buzzer grup yang aktif. Arena memutar **bunyi_buzer.mp3** setelah server mencatat tekanan pertama.
3. Host menekan **Benar**. Arena memutar **benar.mp3**.
4. Pada soal berikutnya, host menekan **Salah**. Arena memutar **salah.mp3**.
5. Ulangi uji buzzer pada babak Rebutan. Tekanan pertama yang sah memicu suara; tekanan ganda atau tekanan berdekatan dari tim lain tidak menggandakan suara penguncian.

Arena mengikuti kejadian server, bukan hanya perubahan tahap soal. Jika host cepat menekan Soal berikutnya, Arena masih dapat menerima kejadian suara sebelumnya. Pemutar mengurutkan suara baru dan melewati antrean yang sudah berumur lebih dari lima detik agar suara tetap mengikuti acara.

Membuka Arena, refresh, mengaktifkan audio, mengganti nama tim, dan mengoreksi hasil lama tidak memutar ulang suara penilaian. Reset sesi menghentikan pemutaran serta antrean sesi sebelumnya. Permintaan yang gagal atau transaksi yang batal tidak memicu suara.

## Memasang source

1. Hentikan aplikasi dengan Ctrl+C.
2. Ekstrak ZIP dan gabungkan isinya ke folder proyek yang berisi package.json. Timpa source yang berubah. Gunakan konfigurasi dan database acara yang sekarang.
3. Jika memakai mode produksi, lakukan build ulang dan jalankan aplikasi dengan perintah serta port yang biasa Anda gunakan. Untuk Next.js native, perintah build proyek adalah **npm run build:next**.
4. Muat ulang Arena, Kontrol Kuis, dan halaman peserta dengan Ctrl+F5 agar semuanya memakai pembaruan ini.
5. Klik **Aktifkan Audio Arena** pada perangkat speaker, lalu lakukan uji di atas.

Perubahan audio ini tidak menambah tabel atau kolom database. Aplikasi memakai catatan kejadian pada tabel quiz_events yang sudah tersedia. Paket lengkap juga mempertahankan fitur juara dan pengelolaan batch sebelumnya; ikuti panduan fitur tersebut jika Anda memperbarui dari versi yang lebih lama.

Berkas utama pembaruan audio: components/quiz-client.tsx, components/screens.tsx, lib/arena-audio.ts, lib/engine.ts, lib/persistence.ts, lib/store.ts, lib/sqlite-repository.ts, dan lib/mssql-repository.ts. Paket menyertakan ketiga MP3 asli tanpa mengubah isinya.

## Jika suara belum muncul

- Periksa apakah tombol menampilkan **Audio Arena aktif** pada perangkat speaker.
- Periksa volume perangkat, pilihan output speaker atau HDMI, serta pengaturan bisu tab browser.
- Pastikan perangkat Arena tetap menerima pembaruan koneksi.
- Buka /sounds/bunyi_buzer.mp3, /sounds/benar.mp3, dan /sounds/salah.mp3 pada alamat aplikasi Anda. Browser harus dapat mengakses ketiganya.
- Jika browser menangguhkan audio atau menampilkan pesan kegagalan, klik Aktifkan Audio Arena lagi.

## Hasil pemeriksaan

**19 pengujian baru lulus**. Cakupan mencakup handler klik host dan peserta, pemetaan ketiga MP3, izin awal audio, urutan pemutaran, kejadian ganda, perpindahan soal yang cepat, refresh, mute, reset sesi, koreksi nilai, antrean kedaluwarsa, autentikasi API, transaksi, rollback, SQLite, dan kontrak repository SQL Server.

Suite lengkap menghasilkan **192 lulus dari 199 pengujian**. Tujuh kegagalan berasal dari pemeriksaan lama; pembaruan ini tidak menambah kegagalan. Pemeriksaan TypeScript masih menemukan lima error lama terkait tipe DB dan konfigurasi hosting. Build produksi belum lolos pemeriksaan proyek tersebut.

Server pengembangan berhasil menyajikan Arena, Kontrol Kuis, halaman peserta, dan ketiga MP3 dengan HTTP 200. Pemeriksaan membandingkan isi MP3 dari server dengan berkas asli. Pengujian memakai pemutar audio tiruan dan kontrak SQL Server; pemeriksaan ini belum menguji speaker atau browser Windows pada perangkat acara Anda.

## Musik perayaan juara

Arena kini menyediakan tombol **Pilih MP3 perayaan** untuk menyiapkan lagu “We Are the Champions” dari Queen. Berkas lagu belum termasuk paket. Baca **PANDUAN_MUSIK_PERAYAAN.md** untuk memilih MP3, menyertakannya dalam source, dan mengatur pemutaran saat host menetapkan juara.
