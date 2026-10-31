# Musik perayaan juara di Arena

Pembaruan ini menghubungkan musik kemenangan dengan tombol **Tentukan Juara**. Arena memutar musik saat host mengumumkan juara. Kontrol Kuis dan perangkat peserta tetap menjalankan perannya tanpa memutar musik.

**Paket belum memuat berkas MP3 “We Are the Champions” dari Queen.** Gunakan MP3 Anda melalui tombol pilihan pada Arena, atau tempatkan berkasnya pada folder proyek sesuai petunjuk di bawah. Pemutar musik sudah siap menerima berkas tersebut.

## Cara paling mudah untuk operator

1. Pasang source pembaruan. Jika Anda memakai mode produksi, lakukan build ulang dan mulai ulang aplikasi dengan konfigurasi yang sekarang.
2. Hubungkan speaker ke perangkat yang membuka **Arena**.
3. Buka Arena, lalu klik **Aktifkan Audio Arena** sekali.
4. Di bawah toolbar Arena, cari panel **Musik perayaan juara**.
5. Klik **Pilih MP3 perayaan**, lalu pilih berkas lagu “We Are the Champions” dari Queen pada perangkat Anda. Batas ukuran berkas adalah 20 MB.
6. Tunggu sampai panel menampilkan nama berkas dan pesan bahwa musik sudah siap.
7. Setelah seluruh babak yang dimainkan selesai, host menekan **Tentukan Juara** pada Kontrol Kuis.
8. Arena menampilkan foto, nama, skor, dan perayaan juara sambil memutar lagu.

Pilihan berkas berlaku selama tab Arena tetap terbuka. Setelah refresh atau membuka tab baru, aktifkan audio dan pilih MP3 kembali. Operator memilih lagu pada perangkat Arena yang terhubung ke speaker. Host dapat menggunakan perangkat lain untuk Kontrol Kuis.

## Perilaku musik

- Musik menunggu pengumuman juara. Memilih MP3 sebelum pengumuman hanya menyiapkan lagu.
- Jika perayaan sudah tampil, memilih MP3 atau mengaktifkan Audio Arena akan memulai musik.
- Aplikasi memutar lagu satu kali. Pembaruan data otomatis tidak memulai ulang atau mengulang lagu.
- Tombol **Tutup perayaan**, **Reset sesi**, serta koreksi nilai yang membatalkan juara menghentikan musik saat Arena menerima data terbaru.
- Menonaktifkan Audio Arena atau meninggalkan halaman Arena juga menghentikan musik. Mengaktifkannya kembali saat perayaan masih tampil memulai lagu dari awal.
- Musik perayaan menggantikan suara penilaian terakhir agar kedua audio tidak bertumpuk.
- Jika lagu belum tersedia, Arena tetap dapat memakai buzzer, Benar, dan Salah pada sesi kuis.
- Tombol **Ganti MP3 perayaan** memungkinkan operator memilih ulang lagu. Jika perayaan sedang berjalan, Arena mulai memainkan pilihan baru setelah selesai menyiapkannya.

## Menyertakan MP3 langsung dalam source

Untuk persiapan tetap oleh operator IT:

1. Salin berkas MP3 lagu ke **public/sounds/we_are_the_champions.mp3**.
2. Gunakan ejaan dan huruf kecil persis seperti nama tersebut.
3. Lakukan build ulang untuk mode produksi, kemudian mulai ulang aplikasi.
4. Periksa alamat **/sounds/we_are_the_champions.mp3** pada situs kuis. Browser harus dapat mengakses dan memutarnya.
5. Buka Arena dan aktifkan audio. Host dapat langsung menekan Tentukan Juara setelah kuis selesai. Arena memakai berkas tersebut tanpa meminta operator memilih MP3 lagi.

Pilihan MP3 melalui Arena mengutamakan berkas yang operator pilih untuk tab tersebut. Pembaruan ini tidak menambah tabel, kolom, atau migrasi database.

## Pemeriksaan

Sebelas pengujian baru musik perayaan lulus. Cakupan mencakup penantian pengumuman, satu kali pemutaran, penutupan perayaan, pengumuman ulang, mute, reset, berkas yang belum tersedia, berkas server, pemilihan berkas saat perayaan, permintaan audio yang selesai terlambat, prioritas terhadap suara penilaian, pembatalan juara, serta kegagalan membuka MP3.

Suite lengkap menghasilkan **192 lulus dari 199 pengujian**. Tujuh kegagalan lama tetap sama. Pemeriksaan TypeScript masih menemukan lima error lama terkait tipe DB dan konfigurasi hosting; perubahan musik tidak menambah error tersebut. Pemeriksaan memakai pemutar audio tiruan dan belum menguji lagu Queen atau speaker pada perangkat acara karena berkas lagunya belum tersedia.
