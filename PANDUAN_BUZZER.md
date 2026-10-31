# Buzzer peserta dan suara pada Arena

Peserta membuka tautan khusus grup melalui /buzzer/A, /buzzer/B, atau /buzzer/C dengan key dari penyelenggara. Klik tombol buzzer besar atau tekan Spasi ketika host membuka giliran. Server mencatat tekanan yang sah, lalu Arena memutar **bunyi_buzer.mp3** melalui perangkat speaker.

Pada babak reguler, hanya grup pilihan host yang dapat menekan buzzer setelah host memulai soal. Pada Rebutan, tekanan pertama mengunci buzzer. Server juga mencatat tim yang menekan berdekatan sesuai aturan kuis. Arena memutar satu suara untuk tekanan pertama, sehingga tekanan ganda tidak menggandakan suara.

Host memulai dan menilai jawaban melalui Kontrol Kuis. Arena juga memutar **benar.mp3** atau **salah.mp3** setelah server menerima penilaian. Perangkat peserta memberikan getaran singkat jika browser mendukungnya.

Sebelum acara, buka Arena pada perangkat speaker dan klik **Aktifkan Audio Arena** sekali. Pertahankan tab tersebut tetap terbuka. Setelah refresh atau membuka tab Arena baru, aktifkan audio kembali.

Pasang seluruh pembaruan source agar Arena, Kontrol Kuis, dan perangkat peserta memakai aturan audio yang sama. Lakukan build ulang untuk mode produksi, mulai ulang aplikasi, lalu muat ulang semua halaman dengan Ctrl+F5. Skor, kunci buzzer, dan aturan penguncian tetap mengikuti database acara.

Lihat **PANDUAN_AUDIO.md** untuk langkah pemasangan, pemetaan ketiga MP3, dan uji suara sebelum acara.
