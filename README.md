# TrackScooter 🛴

Sistem manajemen inventaris, penyewaan, dan pelacakan unit scooter secara real-time. Aplikasi ini dirancang dengan antarmuka gelap (*dark mode*) yang bersih, modern, dan sangat responsif.

## ✨ Fitur Utama

- **📊 Dasbor Pemantauan Real-Time:**
  - Ringkasan statistik cepat (Online, Offline/Rusak, Maintenance, Total Unit).
  - Kisi status unit (*Scooter Grid*) dengan filter status dan jenis — klik unit untuk membuka **detail modal**.
  - Ringkasan distribusi unit per jenis (SD - Standar & SJ - Jumbo).
  - Panel alur aktivitas terbaru (*Live Feed*) dengan penanda waktu relatif.

- **🔍 Detail Unit (Modal):**
  - **Kondisi Perangkat** per unit: Spakbor, Lampu, Baterai, Jenis Error (E2/E4/E16/E6/Lain), Rem, Ban (Botak/Tipis/Aman) — dengan status "Belum dicek" jika belum pernah disimpan.
  - **Edit kondisi** langsung dari modal; menyimpan Jenis Error otomatis menandai unit **Rusak**, dan menormalkannya mengembalikan unit ke Tersedia.
  - Riwayat unit + riwayat maintenance, dengan **Export Excel** (.xlsx, 2 sheet).

- **📜 Tabel Riwayat Aktivitas Lengkap:**
  - Histori transaksi penyewaan (masuk/keluar) dengan pencarian ID, penyaringan aksi, dan paginasi.

- **📸 Pemindai QR Code Pintar:**
  - Pemindaian kamera (*environment facing*), unggah gambar QR, atau input ID manual.
  - Unit berstatus *maintenance* / *rusak* memerlukan konfirmasi sebelum disewakan.

- **🛠️ Manajemen Unit & Maintenance:**
  - Tambah unit (ID kustom atau auto-generate), ubah status, unduh QR per unit / semua unit (ZIP).
  - Status **Maintenance** mencatat lokasi (Di Outlet / Keluar) + kendala, dan menghasilkan catatan perbaikan yang bisa ditandai **Selesai** dari dashboard.
  - **Backup database** (file `.db`) dengan retention otomatis (10 backup terakhir).

- **📊 Laporan & Ekspor:**
  - **Export Kondisi Unit** (.xlsx) untuk seluruh armada.
  - **Laporan Harian** (.xlsx) per tanggal dari tab Monitor (laporan per-sesi sewa).
  - **Export JSON** seluruh data dari sidebar.

## 🛠️ Teknologi yang Digunakan

- **Frontend:** React 19 + Vite 8, Tailwind CSS v4, Lucide React, SweetAlert2, date-fns
- **QR Engine:** `html5-qrcode` (decode) & `qrcode` (generate)
- **Backend:** Express 5 + better-sqlite3 (SQLite, WAL mode), PM2 (ecosystem.config.cjs)
- **Excel:** SheetJS `xlsx` 0.20.x (via CDN resmi — versi npm 0.18.5 punya CVE)
- **Deploy:** nginx reverse proxy + HTTPS (lihat bagian Produksi)

## 🚀 Cara Menjalankan Proyek

### 1. Prasyarat
**Node.js** (v20+) dan **pnpm**.

### 2. Instalasi Dependensi
```bash
pnpm install
```

### 3. Menjalankan Server Pengembangan (Frontend + API)
```bash
pnpm dev:all
```
- Frontend Vite: `http://localhost:5173/` (proxy `/api` → `localhost:3005`)
- Atau jalankan terpisah: `pnpm dev` (frontend) dan `pnpm dev:server` (API)

### 4. Build untuk Produksi
```bash
pnpm build
```
Hasil di `dist/` — siap di-serve oleh nginx (lihat bagian Produksi).

### 5. Test & Lint
```bash
pnpm test      # Vitest (104 test: API + storage + komponen)
pnpm lint      # ESLint
```

## 📁 Struktur Folder Proyek

```text
├── src/
│   ├── components/      # Komponen UI (ScooterCard, ScooterDetailModal, dll.)
│   ├── pages/           # Halaman (Dashboard, Scan, Manage, Monitor)
│   ├── hooks/           # useScooterData (fetch + polling realtime 30s)
│   ├── constants.js     # Sumber tunggal status/jenis/device condition
│   ├── storage.js       # API client (satu-satunya gerbang ke backend)
│   ├── App.jsx          # Routing & Layouting
│   └── main.jsx         # Entry point
├── server/
│   ├── server.js        # Express API (port 3005, bind 127.0.0.1)
│   ├── db.js            # Schema SQLite + migrasi idempoten
│   ├── backup.js        # Backup DB + retention
│   └── trackscooter.db  # Database (gitignored)
├── ecosystem.config.cjs # PM2
└── .github/workflows/   # (deploy.yml.disabled — nonaktif, lihat Produksi)
```

## ☁️ Produksi

Arsitektur produksi **same-origin** — nginx yang menangani semuanya:

```text
Browser ──▶ https://qr.evrenhouse.online  (nginx, HTTPS via Certbot)
                ├── /        → serve dist/ (frontend)
                └── /api/*   → proxy ke 127.0.0.1:3005 (Express + SQLite)
```

- **API bind `127.0.0.1`** — tidak terekspos langsung; hanya lewat nginx.
- **CORS allowlist** di `server/server.js` (same-origin request tanpa Origin header selalu diizinkan).
- **PM2:** `npx pm2 start ecosystem.config.cjs` → app `trackscooter-api`.
- **Migrasi DB otomatis** saat server start (idempoten, aman untuk data lama).
- Workflow GitHub Pages **dinonaktifkan** (`.disabled`) karena Pages tidak bisa menjalankan API; frontend di-serve dari host yang sama dengan API.

## 🧪 Catatan Pengembangan

- Status unit: `available` (Tersedia) · `in-use` (Online) · `rusak` (Offline/Rusak) · `maintenance`.
- Definisikan label/warna status & device di `src/constants.js` — jangan hardcode di komponen.
- `VITE_API_URL` boleh kosong (same-origin via nginx); build produksi menolak nilai `localhost`.
