# TrackScooter 🛴

Sistem manajemen inventaris, penyewaan, dan pelacakan unit scooter secara real-time. Aplikasi ini dirancang dengan antarmuka gelap (*dark mode*) yang bersih, modern, dan sangat responsif.

## ✨ Fitur Utama

- **📊 Dasbor Pemantauan Real-Time:**
  - Ringkasan statistik cepat (Unit Tersedia, Disewakan, Total Unit, dan Aktivitas Hari Ini).
  - Kisi status unit (*Scooter Grid*) dengan filter status dan jenis.
  - Ringkasan distribusi unit per jenis (SD - Dewasa & SJ - Jumbo) beserta jumlah unit aktif/dirawat.
  - Panel alur aktivitas terbaru (*Live Feed*) dengan penanda waktu relatif.

- **📜 Tabel Riwayat Aktivitas Lengkap:**
  - Menyimpan histori transaksi penyewaan (masuk/keluar).
  - Dilengkapi fitur pencarian ID unit dan penyaringan aksi.
  - Dilengkapi fitur **paginasi** (pagination) untuk kemudahan navigasi log yang panjang.

- **📸 Pemindai QR Code Pintar:**
  - Pemindaian langsung menggunakan kamera perangkat (*environment facing camera*).
  - Pilihan pemindaian melalui unggah file gambar QR code dari galeri.
  - Alternatif input ID unit secara manual jika kamera tidak tersedia.

- **🛠️ Manajemen Unit Terintegrasi:**
  - Input unit baru dengan opsi kustomisasi ID (untuk stok tidak berurutan) atau penomoran otomatis (*auto-generate*).
  - Dropdown pengubah status unit langsung (Tersedia ↔ Maintenance) dari tabel inventaris.
  - Fitur unduh QR code unit dalam format PNG secara instan.

- **⚠️ Proteksi Unit Maintenance:**
  - Fitur **Catatan Perbaikan** opsional ketika unit diletakkan ke status *Maintenance* (contoh: "Ganti ban", "Rem blong").
  - Menampilkan catatan perbaikan langsung pada kartu unit di dasbor dan tabel inventaris.
  - **Peringatan Pemindaian:** Jika unit berstatus *maintenance* dipindai untuk disewa, sistem akan menampilkan konfirmasi peringatan beserta catatan perbaikan sebelum menyewakan unit.

- **🔄 Sinkronisasi & Ekspor Data:**
  - Ekspor seluruh data (unit scooter & log aktivitas) ke file format JSON.
  - Sinkronisasi instan antar-tab browser menggunakan `storage` event handler.

## 🛠️ Teknologi yang Digunakan

- **Core:** React 19 + Vite 8
- **Styling:** Tailwind CSS v4 (menggunakan plugin `@tailwindcss/vite` & `@theme` tokens)
- **Icons:** Lucide React
- **QR Engine:**
  - `html5-qrcode` (untuk decode QR melalui kamera/gambar)
  - `qrcode` (untuk generate QR Code sebagai file PNG)
- **Helper:** `date-fns` (untuk format tanggal & penanda waktu relatif)

## 🚀 Cara Menjalankan Proyek

### 1. Prasyarat
Pastikan Anda memiliki **Node.js** dan package manager **pnpm** (atau npm/yarn) terinstal pada mesin lokal Anda.

### 2. Instalasi Dependensi
Jalankan perintah berikut untuk menginstal seluruh dependensi proyek:
```bash
pnpm install
```

### 3. Menjalankan Server Pengembangan
Jalankan server lokal untuk pengembangan dengan fitur hot reload:
```bash
pnpm dev
```
Aplikasi akan dapat diakses secara default melalui URL `http://localhost:5173/`.

### 4. Build untuk Produksi
Guna mengompilasi dan mengoptimalkan aplikasi untuk kebutuhan produksi:
```bash
pnpm build
```
Hasil kompilasi akan berada di dalam direktori `dist/` dan siap di-deploy ke server statis.

## 📁 Struktur Folder Proyek

```text
src/
├── assets/         # Aset statis seperti gambar & logo
├── components/     # Komponen UI modular (Navbar, Card, Scanner, dll.)
├── hooks/          # React custom hooks (useScooterData)
├── pages/          # Halaman aplikasi (Dashboard, Scan, Manage)
├── App.jsx         # Routing & Layouting aplikasi
├── index.css       # Desain global & Token Custom Property Tailwind v4
├── main.jsx        # Entry point aplikasi
└── storage.js      # Manajemen localStorage CRUD & logika bisnis
```
