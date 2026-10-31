# Membuka menu Koreksi Nilai

Patch v2 menambahkan menu **Koreksi Nilai** pada navigasi utama, di dekat Kontrol Kuis. Panel host juga mempunyai tombol besar **Buka Koreksi Nilai**. Menu tetap terlihat sebelum ada hasil penilaian.

## Buka langsung

Buka http://localhost:3100/koreksi pada komputer server aplikasi. Jika aplikasi memakai alamat IP atau port lain, gunakan alamat yang sama dengan panel host lalu tambahkan /koreksi. Masuk sebagai penyelenggara jika aplikasi meminta kata sandi.

1. Cari nama grup, batch, atau pertanyaan pada halaman Koreksi Nilai.
2. Klik **Koreksi** pada hasil yang tepat.
3. Pilih **Benar** atau **Salah**, isi alasan, dan periksa pratinjau skor.
4. Klik **Simpan koreksi**. Skor Arena mengikuti hasil terbaru.

Jika belum ada penilaian, halaman menampilkan **Belum ada hasil untuk dikoreksi**. Buka Kontrol Kuis dan nilai satu jawaban terlebih dahulu. Setelah itu, hasil muncul di halaman Koreksi Nilai.

## Memasang pembaruan

Paket ini mencakup pembaruan koreksi sebelumnya. Ekstrak seluruh isinya ke folder aplikasi yang sudah mempunyai package.json. Jangan menambahkan lapisan folder baru.

1. Cadangkan database dan source. Hentikan aplikasi dengan Ctrl+C.
2. Ekstrak ZIP langsung ke folder proyek, misalnya C:\js\BGI_Quiz. Timpa berkas yang sama dan pertahankan konfigurasi .env.local.
3. Buka PowerShell dan jalankan:

```powershell
Set-Location 'C:\js\BGI_Quiz'
pnpm db:init
pnpm db:check
if (Test-Path '.next') {
    Remove-Item '.next' -Recurse -Force
}
pnpm exec next dev --hostname 127.0.0.1 --port 3100
```

Lanjutkan setelah db:init dan db:check berhasil. Jika akun aplikasi tidak memiliki izin perubahan skema, minta operator database menjalankan skrip 005 dan 006 pada database kuis, lalu ulangi db:check. Patch v2 tidak menambah kolom di luar patch koreksi sebelumnya.

4. Buka http://localhost:3100/koreksi dan tekan Ctrl+F5. Muat ulang tab host serta Arena juga.

Untuk perangkat lain di jaringan, operator dapat mengganti hostname menjadi 0.0.0.0 dan mengizinkan akses port aplikasi pada jaringan acara. Peserta memakai IP server, bukan localhost.

## Jika menu masih belum muncul

- Pastikan terminal menjalankan proyek dari folder yang sama dengan lokasi ekstraksi.
- Pastikan folder proyek memuat app/koreksi/page.tsx dan components/result-corrections.tsx.
- Jika /koreksi menampilkan 404, periksa alamat server, folder proyek, dan proses aplikasi. Hentikan proses lama, bersihkan .next, dan jalankan kembali source terbaru.
- Untuk mode produksi, jalankan pnpm build:next sebelum menyalakan pnpm exec next start --hostname 127.0.0.1 --port 3100.
- Gunakan server dan port yang sama untuk Koreksi Nilai, Kontrol Kuis, dan Arena.

Baca PANDUAN_KOREKSI_PENILAIAN.md untuk nilai asli soal, hasil dari versi lama, audit, dan ekspor. Panduan Word dalam folder docs menjelaskan alur koreksi melalui tombol Koreksi penilaian pada panel host; tombol tersebut tetap tersedia pada versi ini.
