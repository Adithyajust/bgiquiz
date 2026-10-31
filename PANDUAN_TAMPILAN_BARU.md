# Tampilan arena biru dan oranye

Desain mengikuti pola visual referensi pengguna: biru tua sebagai dasar, bidang putih pada area logo, bingkai bersudut, garis biru elektrik, serta aksen oranye. Identitas yang ditampilkan tetap BGI. Elemen merek dan materi pelatihan dalam gambar referensi tidak dimasukkan ke arena kuis.

Panel soal berada di bagian tengah dengan timer di sebelah kanan. Tiga kartu grup ditempatkan sejajar di bawahnya. Foto grup tetap berbentuk lingkaran berukuran besar, sementara skor dan status buzzer memiliki ruang tersendiri. Teks soal menyesuaikan ukurannya berdasarkan panjang isi. Teks atau pilihan yang sangat panjang dapat digulir di dalam panel agar tidak menutupi timer atau kartu grup.

## Memasang pembaruan

1. Hentikan server aplikasi dengan Ctrl+C. Salin source dalam ZIP ke folder proyek yang memuat `package.json`, dan pertahankan `.env.local` milik server Anda.
2. Jika Anda sudah memakai versi 14 tabel terpisah, pembaruan tampilan ini tidak memerlukan migrasi database atau dependensi baru. Jika masih memakai versi penyimpanan JSON lama, pasang skema sesuai `PANDUAN_MAINTENANCE_DATABASE.md` terlebih dahulu.
3. Hapus hasil build lama, lalu jalankan aplikasi kembali. Contoh pada PowerShell:

```powershell
if (Test-Path '.next') {
    Remove-Item '.next' -Recurse -Force
}
pnpm dev:next
```

Untuk produksi:

```powershell
pnpm build:next
pnpm start:next
```

4. Buka arena dan tekan Ctrl+F5. Pilih Layar penuh untuk proyektor. Jika perangkat tidak mengizinkan Fullscreen API, gunakan F11 sesuai petunjuk aplikasi.

## Berkas desain

| Berkas | Fungsi |
| --- | --- |
| `public/brand/arena-blue-orange.svg` | Latar vektor 16:9, garis bingkai, pola titik, dan bidang diagonal |
| `public/styles/arena-reference.css` | Warna, bidang putih logo, panel soal, timer, foto, kartu skor, dan mode layar penuh |
| `app/layout.tsx` | Memuat stylesheet dasar dan tema baru secara berurutan |
| `components/core.tsx` | Komponen arena dan kelas status aktif, jawaban benar, serta ukuran teks soal |

Latar dibuat sebagai SVG agar tetap tajam pada proyektor beresolusi tinggi. Logo tetap berasal dari `public/brand/bgi.png` dan `public/brand/36-tahun.png`. Tidak ada aset desain yang perlu diunduh dari situs eksternal ketika aplikasi digunakan.

Untuk mengganti warna, edit variabel pada bagian atas `arena-reference.css`. Ukuran arena tetap 16:9, baik pada tampilan biasa, pratinjau host, maupun layar penuh. Pada layar ponsel, arena mempertahankan komposisi panggung dan dapat diperbesar melalui mode layar penuh lanskap. Gunakan halaman buzzer masing-masing grup untuk interaksi peserta.
