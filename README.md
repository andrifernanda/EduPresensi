# 🎓 EduPresensi

EduPresensi adalah aplikasi manajemen absensi dan penilaian berbasis *mobile* modern yang dirancang khusus untuk memudahkan tugas guru di kelas. Dibangun menggunakan **React Native** dan **Expo**, aplikasi ini memungkinkan guru untuk mengelola kelas, absensi harian, nilai tugas/ujian, dan mencetak laporan secara otomatis dengan sangat mudah, aman, dan tanpa perlu koneksi internet yang rumit (menggunakan penyimpanan lokal SQLite).

## 🚀 Fitur Utama
* **👥 Manajemen Siswa & Kelas:** Mengelola daftar siswa, membuat kelas, mengelompokkan siswa ke dalam kelas, dan mendukung fitur Impor/Ekspor data siswa menggunakan file Excel (`.xlsx`).
* **📅 Absensi Harian (Sekali Tap):** Mencatat kehadiran siswa (Hadir, Sakit, Izin, Alfa) per tanggal dengan mudah. Fitur *toggle* pintar memudahkan pembatalan absensi yang salah klik.
* **📊 Penilaian Fleksibel:** Menambahkan kriteria penilaian (UTS, UAS, Tugas) lengkap dengan bobot (*weight*). Sistem secara otomatis akan menghitung nilai akhir siswa di *tab* Analisa Nilai.
* **📈 Laporan PDF & Excel:** Mengekspor rekap absen dan nilai akhir ke dalam format PDF dan Excel, siap untuk dibagikan ke wali kelas atau kepala sekolah.
* **💾 Backup & Restore Database Lokal:** Data Anda adalah milik Anda. Cadangkan database penuh ke penyimpanan lokal atau bagikan via WhatsApp/Google Drive, dan pulihkan kembali kapan saja dengan lancar.
* **🔒 Akun Demo:** Aplikasi mendukung fitur multi-akun.
  * **Username Demo:** `12345`
  * **Password Demo:** `12345`

## 🛠️ Teknologi yang Digunakan
* **Framework:** React Native & Expo
* **Navigasi:** React Navigation
* **Penyimpanan Lokal:** Expo SQLite
* **Manajemen State:** Zustand
* **UI/UX:** Vanilla CSS-in-JS (StyleSheet) dengan desain premium, micro-animation, dan nuansa modern *glassmorphism*.
* **Manajemen File:** Expo File System, Expo Document Picker, Expo Sharing, & SheetJS (XLSX).

## 📱 Cara Menjalankan Aplikasi (Lokal)
1. Pastikan Anda sudah menginstal **Node.js** dan aplikasi **Expo Go** di perangkat Android/iOS Anda.
2. Lakukan *clone* repositori ini:
   ```bash
   git clone https://github.com/username-github-anda/EduPresensi.git
   ```
3. Masuk ke dalam direktori aplikasi:
   ```bash
   cd EduPresensi
   ```
4. Instal semua dependensi:
   ```bash
   npm install
   ```
5. Jalankan server Expo:
   ```bash
   npx expo start
   ```
6. Scan QR Code yang muncul di terminal menggunakan aplikasi Expo Go di smartphone Anda.

## 👨‍💻 Pengembang
Dikembangkan dengan penuh dedikasi oleh:
**Andri Fernanda, S.Pd., Gr.**

## 📄 Lisensi
Hak cipta dilindungi. EduPresensi diciptakan sebagai solusi nyata untuk digitalisasi dan mempermudah administrasi guru di Indonesia.
