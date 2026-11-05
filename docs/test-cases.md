# Test Cases - Tracking Build (Pertemuan 4)

Isi kolom "Actual result", "Status" (Pass/Fail), dan "Catatan/bukti" berdasarkan hasil nyata Anda.

| ID | Skenario | Langkah pengujian | Expected result | Actual result | Status | Catatan/bukti |
|---|---|---|---|---|---|---|
| TC-01 | Halaman terbuka tanpa error fatal | Buka index.html, image-tracking.html, face-tracking.html; lihat Console | Ketiga halaman tampil; tidak ada error merah yang menghentikan halaman | | | |
| TC-02 | Izin kamera diberikan | Tekan Mulai, pilih Izinkan | Video kamera tampil; status berubah dari "Memuat" ke "Mencari ..." | | | |
| TC-03 | Image target terdeteksi | Arahkan kamera ke target-card.png | Status "Target terdeteksi"; objek 3D muncul di atas gambar | | | |
| TC-04 | Objek mengikuti posisi/orientasi target | Geser, miringkan, dan putar gambar target | Objek tetap menempel pada gambar dan ikut bergerak/miring | | | |
| TC-05 | Target hilang | Tutup atau jauhkan gambar target | Objek menghilang; status "Target hilang - mencari target" | | | |
| TC-06 | Wajah terdeteksi | Buka face-tracking, hadapkan wajah | Status "Wajah terdeteksi"; kacamata tampil di wajah | | | |
| TC-07 | Aksesori mengikuti gerakan wajah | Tolehkan, angguk, dan miringkan kepala | Kacamata ikut bergerak mengikuti wajah | | | |
| TC-08 | Wajah tidak terdeteksi | Tutup wajah atau keluar dari bingkai | Kacamata menghilang; status "Wajah tidak terdeteksi ..." | | | |
| TC-09 | Dua kondisi pencahayaan | Ulangi TC-03 dan TC-06 pada cahaya terang dan redup | Perilaku tiap kondisi tercatat (terdeteksi/tidak, stabil/bergetar) | | | |
| TC-10 | Lebih dari satu jarak target | Uji TC-03 pada minimal 3 jarak | Rentang jarak yang berhasil dan gagal tercatat | | | |
| TC-11 | Perangkat HP | Jalankan TC-02 sampai TC-08 di HP yang Anda punya | Hasil tercatat di device-matrix.md | | | |
| TC-12 | Deployment HTTPS | Publikasikan ke GitHub Pages, buka URL di HP | Halaman terbuka via https://; kamera dapat diminta | | | |
