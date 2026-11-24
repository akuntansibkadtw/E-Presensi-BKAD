# Panduan Lengkap E-Presensi BKAD Kab. Teluk Wondama

Panduan ini mencakup cara menjalankan aplikasi secara lokal, melakukan setup & deploy backend **Google Apps Script (GAS)** + **Google Sheets**, mempublikasikan frontend ke **GitHub Pages**, serta panduan penggunaan untuk **Pegawai ASN** maupun **Admin / Pejabat Penelaah**.

---

## 1. Struktur Folder Proyek

```text
proyek-baru/
├── index.html               # Halaman utama aplikasi (Login, Shell Mobile ASN, Shell Desktop Admin)
├── css/
│   └── style.css            # Gaya tambahan UI & cetak
├── js/
│   ├── config.js            # Konfigurasi URL API Google Apps Script (GAS_API_URL)
│   └── app.js               # Logika aplikasi frontend, cache lokal, & sinkronisasi offline
├── _gas_backend/            # Kode backend Google Apps Script (tidak ikut ter-push ke GitHub)
│   ├── code.gs              # REST API controller (doGet/doPost) & bisnis proses
│   └── setup.gs             # Inisialisasi 10 tabel Google Sheets & Safe Migration
└── .gitignore               # Mengabaikan folder _gas_backend/ saat push ke Git
```

---

## 2. Cara Menjalankan dalam Mode Simulasi Lokal (Tanpa Backend)

Secara bawaan, nilai `GAS_API_URL` di `js/config.js` masih kosong (`''`):

```javascript
window.APP_CONFIG = {
  GAS_API_URL: ''
};
```

Selama `GAS_API_URL` kosong, aplikasi otomatis berjalan dalam **Mode Simulasi Lokal** menggunakan `localStorage` browser dengan data contoh bawaan. Anda dapat langsung membuka `index.html` melalui web server lokal (mis. Live Server di VS Code atau `npx serve`) untuk menguji seluruh antarmuka.

---

## 3. Panduan Setup & Deploy Backend (Google Apps Script)

Agar data presensi, pegawai, izin/cuti, SPT, disiplin, dan rekonsiliasi tersimpan permanen di **Google Sheets**:

### Langkah 1: Siapkan Google Sheets & Apps Script
1. Buka [Google Sheets](https://sheets.google.com) dan buat spreadsheet baru (misalnya beri nama: `Database E-Presensi BKAD Teluk Wondama`).
   > *Catatan: Anda juga bisa membuat proyek standalone di [script.google.com](https://script.google.com); fungsi `setupDatabase()` akan otomatis membuat spreadsheet baru dan menyimpan ID-nya di Script Properties.*
2. Di Google Sheets, buka menu **Extensions → Apps Script**.
3. Di editor Apps Script:
   - Ganti isi file `Code.gs` dengan seluruh isi file `_gas_backend/code.gs`.
   - Klik ikon **`+`** di samping *Files* → pilih **Script** → beri nama `setup`, lalu salin seluruh isi `_gas_backend/setup.gs` ke dalamnya.
4. Simpan proyek (`Ctrl + S`).

### Langkah 2: Inisialisasi Database (Setup & Safe Migration)
1. Di toolbar Apps Script, pilih fungsi **`setupDatabase`** lalu klik **Run**.
2. Jika diminta izin akses (*Authorization required*), klik **Review permissions → pilih akun Google → Advanced → Go to ... (unsafe) → Allow**.
   *(Alternatif jika terikat di Google Sheets: refresh Google Sheets, lalu klik menu **E-Presensi BKAD → Jalankan Setup & Safe Migration**).*
3. Pastikan 10 tab berikut otomatis terbuat beserta header dan data awalnya:
   - `DataPegawai`
   - `LogPresensi`
   - `PengajuanIzinCuti`
   - `PenugasanSPT`
   - `DisiplinPegawai`
   - `RekonPresensi`
   - `PengaturanSistem`
   - `DelegasiPlt`
   - `AuditLog`
   - `MasterSKPD`

> **Safe Migration:** `setupDatabase()` bersifat idempoten (aman dijalankan ulang). Data yang sudah ada tidak akan dihapus, dan kolom baru akan ditambahkan di sisi paling kanan.

### Langkah 3: Deploy sebagai Web App (REST API)
1. Di editor Apps Script, klik **Deploy → New deployment**.
2. Klik ikon gerigi (*Select type*) → pilih **Web app**.
3. Atur konfigurasi berikut:
   - **Description:** `E-Presensi BKAD API v1` (bebas)
   - **Execute as:** **Me** (akun pemilik script/spreadsheet)
   - **Who has access:** **Anyone**
4. Klik **Deploy**, lalu salin **Web app URL** yang berakhiran `/exec` (contoh: `https://script.google.com/macros/s/AKfycb.../exec`).

> **Penting saat update backend:** Setiap kali Anda mengubah kode di `code.gs` atau `setup.gs`, lakukan **Deploy → Manage deployments → Edit (ikon pensil) → Version: New version → Deploy** agar perubahan aktif di URL `/exec`.

---

## 4. Menghubungkan Frontend & Deploy ke GitHub Pages

### Langkah 1: Pasang URL API di `js/config.js`
Buka `js/config.js` dan tempelkan URL `/exec` hasil deploy GAS:

```javascript
window.APP_CONFIG = {
  GAS_API_URL: 'https://script.google.com/macros/s/ISI_ID_DEPLOY_ANDA/exec'
};
```

### Langkah 2: Verifikasi Koneksi API (Opsional)
Buka URL `/exec` langsung di browser. Jika berhasil, browser akan menampilkan JSON:
```json
{"ok":true,"service":"E-Presensi BKAD Teluk Wondama REST API","status":"ONLINE"}
```

### Langkah 3: Upload ke GitHub & Aktifkan GitHub Pages
File `.gitignore` sudah mengecualikan folder `_gas_backend/`, sehingga kode backend tidak akan ikut terpublikasi ke repository publik.
1. Inisialisasi dan push ke repository GitHub Anda (`index.html`, `css/`, `js/`, `.gitignore`).
2. Di repository GitHub, buka **Settings → Pages**.
3. Pada **Source**, pilih **Deploy from a branch**, pilih branch `main` (folder `/ (root)`), lalu klik **Save**.
4. Tunggu beberapa saat hingga URL GitHub Pages aktif dan bisa diakses melalui browser HP maupun desktop.

---

## 5. Akun Demo & Cara Login

Di halaman login (`view-login`), masukkan **18 digit NIP** dan **6 digit Kode PIN**.
- **Aturan PIN bawaan:** `123456` **atau** **6 digit terakhir NIP** pegawai.
- Centang **"Ingat NIP saya di perangkat ini"** jika ingin NIP tersimpan otomatis di perangkat tersebut.

### Daftar Akun Awal (Data Seed)

| Peran Akses | Nama | NIP | PIN Bawaan |
| :--- | :--- | :--- | :--- |
| **Super Admin** | Yulianus Mandacan, S.IP | `198001102006041001` | `123456` atau `041001` |
| **Pegawai ASN (WFO)** | Budi Santoso, S.E. | `198503122010011002` | `123456` atau `011002` |
| **Pegawai ASN (WFO)** | Yulianus Kereway, A.Md. | `199108152015051003` | `123456` atau `051003` |
| **Pegawai PPPK (WFA)** | Maria Rumbiak, A.Md. | `199405192022212004` | `123456` atau `212004` |
| **Pegawai ASN (WFH)** | Oktovianus Sayori, S.Kom. | `198911032014031002` | `123456` atau `031002` |
| **Kasubid (Tahap 1)** | Dominggus Torey, S.E., M.Si. | `198802142008021001` | `123456` atau `021001` |
| **Kabid (Tahap 2)** | Drs. Lukas Wambrauw, M.M. | `198106222007011002` | `123456` atau `011002` |
| **Kepala Badan (Tahap 3)** | Dr. Hendrik Mambor, S.E., M.Si. | `197511282009091001` | `123456` atau `091001` |

> Untuk pengujian cepat di halaman login, buka bagian lipat **"Mode Uji Coba / Simulasi Peran (Khusus Admin)"** untuk memilih peran secara instan.

---

## 6. Panduan Penggunaan Aplikasi

### A. Tampilan Mobile ASN (`shell-mobile`)
Digunakan oleh pegawai ASN/PPPK (atau Admin yang menekan tombol **Mode Mobile ASN**):
1. **Beranda:** Menampilkan status kehadiran hari ini (Jam Masuk/Pulang WIT), mode kerja aktif (`WFO`, `WFA`, atau `WFH`), serta ringkasan statistik pribadi.
2. **Presensi (Kamera & GPS):**
   - Izinkan akses **Kamera** dan **Lokasi (GPS)** pada browser HP.
   - Pastikan berada dalam radius geofence kantor (untuk `WFO`) atau sesuai penugasan SPT (untuk `WFA`).
   - Jika koneksi internet terputus saat absen, data akan masuk ke **antrean offline** (`localStorage`) dan otomatis disinkronkan ketika perangkat kembali online.
3. **Izin/Cuti:** Mengajukan izin (Sakit, Keluar Kota, Cuti Tahunan, dll.) dan memantau status persetujuan berjenjang (Kasubid → Kabid → Kepala Badan).
4. **SPT & Log:** Melihat jadwal Surat Perintah Tugas (SPT) dan riwayat log presensi harian beserta titik koordinatnya.

### B. Tampilan Desktop Admin & Pejabat Penelaah (`shell-desktop`)
Digunakan oleh **Super Admin**, **Kasubid**, **Kabid**, dan **Kepala Badan** dengan menu sidebar berikut:
1. **Dasbor Utama:** Ringkasan KPI kehadiran harian, anomali, pengajuan izin tertunda, dan statistik per bidang.
2. **Master SKPD & Sub Unit:** Pengelolaan daftar SKPD, pejabat pimpinan SKPD, sub unit, dan impor batch SKPD.
3. **Master & Impor Pegawai:** Tambah/ubah/arsipkan data pegawai, atur mode kerja massal, pendaftaran/reset biometrik wajah, dan impor pegawai batch.
4. **Rekonsiliasi & TPP:** Menjalankan rekonsiliasi presensi bulanan (*Dry-Run* → *Commit/Lock* database bulanan), perhitungan potongan TPP, serta adendum rekon.
5. **Mode Kerja & SPT GPS:** Penjadwalan Surat Perintah Tugas (SPT), daftar NIP petugas lapangan, serta verifikasi geotagging GPS.
6. **Persetujuan Izin & Cuti:** Penelaahan berjenjang 3 tahap:
   - Tahap 1: **Kasubid**
   - Tahap 2: **Kabid**
   - Tahap 3: **Kepala Badan** (penerbitan nomor surat resmi)
7. **Rekapitulasi Presensi:** Rekap harian/bulanan presensi ASN serta impor log presensi batch jika diperlukan.
8. **Disiplin PP 94/2021:** Penanganan kasus disiplin pegawai bertahap (pemanggilan, BAP, penetapan sanksi, hingga sinkronisasi I-Dis BKN) dan pencetakan dokumen resmi.
9. **Pengaturan Sistem:** Konfigurasi koordinat geofence & radius meter, jam kerja standar WIT (UTC+9), tarif potongan TPP, pejabat penandatangan, daftar bidang/sub-bidang, kalender hari libur nasional/fakultatif, serta delegasi **Plt.** (*Pelaksana Tugas*).
10. **Galeri 73 Dokumen UI:** Pratinjau dan cetak dokumen/formulir resmi sistem.

---

## 7. Pemecahan Masalah Umum (Troubleshooting)

- **Data tidak masuk ke Google Sheets (tetap pakai data simulasi):**
  Pastikan `GAS_API_URL` di `js/config.js` sudah diisi dengan URL `/exec` yang valid (diawali `https://`) dan bukan masih kosong (`''`).
- **Error saat fetch API / respons kosong:**
  Pastikan pada saat deploy Web App di GAS, opsi **Who has access** dipilih **Anyone**, dan Anda sudah menekan **New version** setiap kali mengubah `code.gs`.
- **Kamera atau GPS tidak muncul di HP:**
  Browser mewajibkan koneksi **HTTPS** untuk mengakses kamera dan geolocation. Gunakan **GitHub Pages** atau hosting HTTPS lainnya (bukan membuka file via `file://`).
- **Pegawai gagal login dengan pesan "Data pegawai telah diarsipkan":**
  Cek kolom `StatusAktif` pada tab `DataPegawai` di Google Sheets (harus bernilai `AKTIF`, bukan `ARSIP`).
