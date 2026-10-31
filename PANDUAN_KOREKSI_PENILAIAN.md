# Koreksi penilaian oleh host

Gunakan menu ini jika host menekan Salah padahal jawaban peserta Benar, atau sebaliknya. Aplikasi memperbarui hasil serta selisih skor pada server. Arena dan perangkat lain mengikuti skor terbaru.

## Menu Koreksi Nilai pada versi 2

Buka **Koreksi Nilai** pada navigasi utama atau langsung kunjungi **/koreksi**. Kontrol Kuis juga menyediakan tombol besar **Buka Koreksi Nilai** dan tombol **Koreksi penilaian** yang membuka dialog. Menu tetap terlihat saat belum ada hasil. Baca MULAI_DI_SINI_MENU_KOREKSI.md untuk pemasangan dan pemeriksaan jika menu belum muncul.

## Cara menggunakan

1. Pada Kontrol Kuis, klik **Koreksi penilaian** di bagian atas. Tombol aktif setelah ada hasil penilaian. Alternatifnya, klik **Koreksi** pada baris Riwayat penilaian.
2. Cari pertanyaan, batch, atau nama grup. Gunakan filter Grup bila perlu. Menu memuat seluruh hasil sesi aktif, termasuk soal lama yang sudah host lewati.
3. Klik **Koreksi** pada hasil yang tepat. Periksa nama grup, babak, pertanyaan, serta penilaian awal.
4. Pada **Hasil yang benar**, pilih **Benar** untuk memperbaiki Salah menjadi Benar, atau pilih **Salah** untuk koreksi sebaliknya.
5. Periksa nilai soal dan pratinjau skor. Isi **Alasan koreksi**.
6. Klik **Simpan koreksi**. Periksa konfirmasi, riwayat terbaru, dan skor pada Arena.
7. Lanjutkan acara. Koreksi tidak mengulang soal maupun mengubah progres. Jika timer sedang berjalan, timer tetap berjalan. Klik Jeda sebelum membuka form jika host perlu meninjau hasil tanpa menghabiskan waktu peserta.

Contoh: skor grup 20, nilai soal 10, dan host keliru menekan Salah. Koreksi menjadi Benar menambah 10 poin sehingga total menjadi 30. Koreksi Benar menjadi Salah mengurangi poin yang sebelumnya diberikan untuk hasil tersebut, bukan memberi hukuman tambahan.

## Nilai asli dan data dari versi lama

Penilaian baru menyimpan nilai jawaban benar saat soal pertama dinilai. Koreksi memakai nilai tersebut meskipun pengaturan Bank Soal kemudian berubah. Koreksi ulang memakai selisih dari hasil terakhir, sehingga skor tidak bertambah dua kali.

Hasil Salah dari versi lama belum menyimpan nilai asli soal. Pada hasil tersebut, form menampilkan **Nilai jawaban benar untuk hasil lama**. Host wajib mengonfirmasi nilai asli, antara 0 sampai 1000 poin. Aplikasi tidak menebaknya dari bank soal yang mungkin sudah berubah. Hasil Benar lama sudah memiliki nilai yang pernah diberikan, sehingga aplikasi dapat memakai nilai itu.

Hasil yang sudah hilang setelah reset sesi tidak muncul dalam menu koreksi. Ekspor hasil sebelum reset. Menu koreksi memperbaiki Benar atau Salah pada grup yang tercatat; menu ini tidak memindahkan hasil ke grup lain.

## Memasang patch pada proyek yang sudah berjalan

Paket ini melengkapi versi BGI Quiz SQL Server dengan tabel terpisah serta pembaruan host dan Arena sebelumnya. Pemasangan awal tetap memerlukan source aplikasi lengkap.

1. Cadangkan database dan folder proyek. Hentikan aplikasi dengan Ctrl+C.
2. Ekstrak isi ZIP langsung ke folder yang berisi package.json, misalnya C:\js\BGI_Quiz. Timpa berkas yang sama. Pertahankan .env.local dengan koneksi SQL Server serta kata sandi penyelenggara.
3. Buka PowerShell pada folder proyek, lalu jalankan:

```powershell
Set-Location 'C:\js\BGI_Quiz'
pnpm db:init
pnpm db:check
```

Lanjutkan setelah kedua perintah berhasil. Skrip init menjalankan skema 001, 002, 005, dan 006. Pembaruan koreksi menambah empat kolom pada dbo.quiz_results: possible_points, correction_count, corrected_at, dan correction_reason. Skrip 006 menambah kolom yang belum ada dan mempertahankan hasil lama.

Jika akun aplikasi tidak memiliki izin mengubah skema, minta operator database menjalankan **sql/sqlserver/006_result_corrections.sql** melalui SSMS pada database sesuai .env.local. Untuk versi yang belum mendukung jawaban Arena, jalankan juga 005_event_answer_settings.sql. Setelah itu, ulangi pnpm db:check.

4. Bersihkan build lama dan nyalakan aplikasi:

```powershell
if (Test-Path '.next') {
    Remove-Item '.next' -Recurse -Force
}
pnpm exec next dev --hostname 127.0.0.1 --port 3100
```

Untuk perangkat lain di jaringan acara, operator dapat mengganti hostname menjadi 0.0.0.0 dan membuka akses port 3100 pada jaringan tersebut. Gunakan IP server saat membagikan tautan buzzer ke ponsel.

5. Tekan Ctrl+F5 pada host dan Arena. Gunakan server serta port yang sama. Jangan mencampur host lokal dengan Arena pratinjau online yang memakai database berbeda.
6. Uji satu jawaban Salah, koreksi ke Benar, lalu koreksi kembali ke Salah. Pastikan skor sesuai dan Soal berikutnya tetap bekerja. Ekspor hasil latihan sebelum reset sesi latihan.

## Catatan koreksi dan ekspor

Riwayat host menampilkan jumlah koreksi, waktu koreksi, dan alasan terakhir. Ekspor CSV memuat hasil serta poin terbaru, nilai jawaban benar, jumlah koreksi, waktu koreksi, dan alasan koreksi terakhir. Waktu CSV menggunakan ISO UTC.

Setiap koreksi juga menambah audit pada dbo.quiz_events dengan kind correctResult. Audit menyimpan ID hasil, grup, alasan, serta hasil, poin, dan skor sebelum serta sesudah koreksi. Seluruh perubahan hasil, skor, dan audit memakai transaksi yang sama. Jika penulisan gagal, transaksi membatalkan seluruh perubahan. Akses peserta tidak dapat mengirim koreksi atau membaca alasan koreksi melalui API publik.

Kueri pemeriksaan untuk operator:

```sql
SELECT revision, created_at,
       JSON_VALUE(payload, '$.teamId') AS grup,
       JSON_VALUE(payload, '$.before.correct') AS hasil_sebelum,
       JSON_VALUE(payload, '$.after.correct') AS hasil_sesudah,
       JSON_VALUE(payload, '$.before.score') AS skor_sebelum,
       JSON_VALUE(payload, '$.after.score') AS skor_sesudah,
       JSON_VALUE(payload, '$.reason') AS alasan
FROM dbo.quiz_events
WHERE kind = N'correctResult'
ORDER BY revision DESC;
```

## Panduan Word dan validasi

Panduan Word terbaru tersedia pada docs/Buku_Panduan_Host_BGI_Quiz_Koreksi.docx. Baca bab Memperbaiki penilaian host untuk alur koreksi.

Sebanyak 116 pengujian, pemeriksaan TypeScript, dan build Next.js lulus. Pengujian mencakup logika skor reguler dan rebutan, nilai nol, hasil lama, perubahan bank soal, koreksi berulang, konflik dua perangkat, API host dan publik, ekspor, serta rollback transaksi. Pengujian API memakai SQLite terisolasi. Pengujian adapter SQL Server memakai driver tiruan. Pengujian tidak menjalankan koneksi atau migrasi pada SQL Server pengguna. Pengujian render komponen memeriksa markup; lingkungan ini belum menyediakan browser untuk menguji klik langsung pada Windows pengguna.
