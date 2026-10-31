# Patch sinkronisasi jawaban host ke halaman utama Arena

Paket ini menyatukan komponen host, Arena, aturan API publik, penyimpanan SQL Server, serta perbaikan hydration dari versi sebelumnya. Gunakan pada source BGI Quiz Layout Biru Oranye atau versi Jawaban Arena dan Nama Dinamis.

## Hasil yang diharapkan

1. Host membuka /host, memilih soal, lalu menekan **Buka jawaban di Arena**.
2. Panel host menampilkan konfirmasi: **Jawaban sekarang tampil di halaman utama Arena.**
3. Halaman utama / menampilkan kotak **JAWABAN BENAR** di bawah pertanyaan.
4. **Sembunyikan jawaban** menutup kotak tersebut pada host dan Arena.
5. Soal berikutnya kembali menyembunyikan jawaban. Buka jawaban tidak menilai atau mengubah skor.

Host dan Arena harus memakai server aplikasi yang sama. Contoh:
- Host: http://localhost:3100/host
- Arena: http://localhost:3100/

Untuk proyektor pada komputer lain, gunakan alamat IP server kuis dengan port yang sama. Jangan mencampur host lokal dengan Arena dari tautan pratinjau online karena keduanya dapat memakai database berbeda.

## Memasang

1. Cadangkan folder proyek dan database. Hentikan aplikasi dengan Ctrl+C.
2. Ekstrak isi ZIP langsung ke folder yang berisi package.json, misalnya C:\js\BGI_Quiz. Izinkan penggantian berkas.
3. Jalankan PowerShell:

```powershell
Set-Location 'C:\js\BGI_Quiz'
pnpm db:init
pnpm db:check
```

Lanjutkan setelah kedua perintah berhasil. Jika akun aplikasi tidak memiliki izin mengubah skema, jalankan `sql/sqlserver/005_event_answer_settings.sql` melalui SSMS pada database sesuai `.env.local`. Setelah itu, jalankan `pnpm db:check`.

4. Bersihkan hasil build dan nyalakan aplikasi:

```powershell
if (Test-Path '.next') {
    Remove-Item '.next' -Recurse -Force
}
pnpm exec next dev --hostname 127.0.0.1 --port 3100
```

5. Tutup tab lama. Buka kembali host dan Arena, kemudian tekan Ctrl+F5 pada keduanya.
6. Pastikan tombol host bernama **Buka jawaban di Arena**. Jika masih bernama **Lihat jawaban**, periksa bahwa ZIP masuk ke folder proyek yang benar dan terminal menjalankan source dari folder tersebut.

Patch tidak berisi .env.local atau data kuis. Kolom answer_visible pada quiz_game_state menyimpan status tampil. Nama acara tetap tersimpan di quiz_settings.event_name. Skrip 005 hanya menambahkan kedua kolom jika belum tersedia.

## Pemeriksaan bila Arena belum mengikuti

- Pastikan tombol host memberikan konfirmasi keberhasilan dan tidak menampilkan error.
- Pastikan alamat dan port host sama dengan Arena.
- Berikan waktu sekitar satu detik untuk polling dan latensi jaringan.
- Pastikan pertanyaan memiliki jawaban benar pada Bank Soal.
- Jika muncul Invalid column name 'answer_visible', jalankan skrip 005 pada database yang dipakai aplikasi.

Untuk pemeriksaan SQL, jalankan pada database yang sama:

```sql
SELECT DB_NAME() AS database_aktif;
SELECT room_id, round_id, question_index, phase, answer_visible
FROM dbo.quiz_game_state WHERE room_id=N'main';
```

Nilai answer_visible berubah menjadi 1 ketika host membuka jawaban dan 0 saat menutup atau berpindah soal. Catatan pembawa acara dan jawaban soal lain tetap khusus penyelenggara. Jawaban soal aktif yang host buka menjadi informasi publik, sesuai tampilan proyektor.

## Validasi

TypeScript, build Next.js, dan 97 pengujian lulus. Pengujian tambahan menelusuri login host, POST buka/tutup jawaban, GET publik yang dipakai Arena, render komponen Arena, serta soal berikutnya. Tes memakai database SQLite untuk API dan driver tiruan untuk adapter SQL Server. Koneksi SQL Server dan browser Windows pengguna belum diuji langsung.
