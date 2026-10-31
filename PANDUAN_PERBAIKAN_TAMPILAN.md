# Memperbarui tampilan BGI Quiz di Windows

Untuk tema biru dan oranye pada paket terbaru, ikuti `PANDUAN_TAMPILAN_BARU.md`. Pastikan stylesheet dasar, stylesheet tema, dan latar SVG ikut tersalin.

Pembaruan 19 Oktober 2026 ini memuat CSS aplikasi langsung dari folder `public/styles`. Layout BGI tidak lagi bergantung pada kompilasi Tailwind untuk memperoleh warna, grid, ukuran timer, dan kartu grup.

## Untuk proyek yang sudah berjalan

1. Hentikan server Next.js dengan Ctrl+C pada terminal yang menjalankannya.
2. Buat salinan berkas tampilan lama jika Anda telah mengubahnya sendiri.
3. Ekstrak `Perbaikan_Tampilan_BGI_Quiz.zip` langsung ke folder proyek, misalnya `C:\js\BGI_Quiz`. Izinkan penggantian berkas berikut:

   - `app/layout.tsx`
   - `app/globals.css`
   - `components/core.tsx`
   - `public/styles/bgi-quiz.css`

   Pastikan struktur akhirnya `C:\js\BGI_Quiz\app\layout.tsx`, bukan folder `app` di dalam folder proyek tambahan. Pertahankan `.env.local` dan konfigurasi koneksi SQL Server yang sudah Anda isi.

4. Buka PowerShell pada folder proyek, bersihkan hasil build lama, lalu jalankan kembali:

```powershell
Set-Location 'C:\js\BGI_Quiz'
if (Test-Path '.next') {
    Remove-Item '.next' -Recurse -Force
}
pnpm exec next dev --hostname 127.0.0.1 --port 3100
```

5. Buka `http://localhost:3100`, lalu tekan Ctrl+F5 untuk memuat ulang seluruh aset. Jika browser sebelumnya menambahkan zoom, tekan Ctrl+0 untuk kembali ke 100 persen.
6. Periksa Arena, Kontrol Kuis, Bank Soal, dan Grup. Klik Layar penuh saat menggunakan proyektor 16:9.

Pembaruan tampilan tidak memerlukan instalasi ulang dependensi atau perubahan tabel database. ZIP patch tidak memuat kredensial, data kuis, ataupun perintah reset.

## Memeriksa pemuatan CSS

Buka alamat berikut pada server lokal yang sama:

```text
http://localhost:3100/styles/bgi-quiz.css?v=20261019-2
```

Browser harus menampilkan teks CSS yang diawali komentar `BGI application styles`. Jika browser menampilkan halaman 404, periksa lokasi berkas `public/styles/bgi-quiz.css` dan folder kerja terminal. Jalankan server dari folder yang berisi `package.json`.

Gunakan satu proses Next.js untuk port 3100. Jika terminal melaporkan port sudah digunakan, hentikan proses aplikasi lama dari terminalnya sebelum menjalankan server baru.

## Perubahan tampilan

- Root layout memuat stylesheet BGI melalui tautan langsung dengan versi aset baru.
- Baris logo memakai grid agar logo BGI dan logo 36 Tahun menempati sisi kiri dan kanan.
- Arena mempertahankan kanvas 16:9, tiga kartu grup, satu foto lingkaran per grup, serta timer di samping soal.
- Skor dan pertanyaan memakai ukuran yang lebih besar.
- SVG timer memiliki ukuran dan garis dasar sehingga kegagalan pemuatan CSS tidak mengubahnya menjadi lingkaran hitam besar.

Source lengkap juga menambahkan `nodeLinker: hoisted` pada `pnpm-workspace.yaml` untuk menghindari pemasangan symlink antarpaket pada Windows. Patch tampilan tidak mengganti berkas pengaturan pnpm Anda.

## Hasil pemeriksaan

Build Next.js, pemeriksaan TypeScript, serta 37 pengujian logika dan API lulus. Pemeriksaan HTML hasil build memastikan Arena, Kontrol Kuis, Bank Soal, Grup, dan Panduan memuat tautan CSS yang baru.

Lingkungan pengerjaan tidak menyediakan sarana pemeriksaan browser. Pemeriksaan ini belum membuktikan tampilan pada browser Windows, proyektor, atau perangkat peserta Anda. Koneksi ke SQL Server nyata juga perlu Anda periksa pada server acara.

Panduan Word yang tersedia dalam source lengkap tetap menjelaskan instalasi dan alur kuis. Gunakan dokumen ini sebagai tambahan untuk memasang perbaikan tampilan.
