# Facebook Multi-Account Comment Bot 🤖

Bot otomatisasi komentar Facebook untuk multi-akun (>20 akun) berbasis **Node.js** dan **Playwright Stealth**. Dilengkapi dengan manajemen akun via CLI, Bulk Import, manajemen sesi (cookie & storageState), generator variasi komentar (Spintax), generator 2FA otomatis, dukungan proxy per-akun, serta emulasi ketikan manusia untuk mencegah checkpoint/banned.

---

## 🌟 Fitur Utama

- 👥 **Manajemen Akun via CLI**: Tambah 1 akun manual atau **Bulk Import** puluhan akun sekaligus via teks.
- 🎲 **Komentar di Postingan Acak (Random Feed)**: Otomatis scroll Beranda / Timeline masing-masing akun dan berkomentar di postingan orang lain secara dinamis.
- 🎯 **Target Postingan Spesifik**: Pilihan untuk komentar di daftar URL tertentu atau input URL langsung.
- 🛡️ **Playwright Stealth Engine**: Bypass deteksi bot Chromium secara otomatis.
- 🍪 **Session & Cookie Manager**: Simpan sesi login (`sessions/acc_xx.json`) agar akun tidak perlu login berulang-ulang.
- 🔀 **Spintax Comment Generator**: Ubah template `{Halo|Hai} {kak|gan}` menjadi komentar unik otomatis di setiap akun agar tidak terkena filter spam Facebook.
- 🌐 **Proxy per Akun**: Mendukung proxy HTTP/SOCKS5 yang terisolasi untuk tiap akun.
- 🔐 **2FA (Two-Factor Authentication) Support**: Otomatis generate kode OTP 6-digit saat login.
- ⌨️ **Human-like Behavior**: Simulasi pengetikan karakter per karakter (*keystroke delay*), jeda acak antar akun, dan scrolling.

---

## 🚀 Cara Menjalankan & Menggunakan

Jalankan bot melalui terminal:

```bash
npm start
```

Menu Utama:
```text
=====================================================
    🤖 FACEBOOK MULTI-ACCOUNT COMMENT BOT 🤖
=====================================================

? Pilih menu yang ingin dijalankan:
  1. 👥 Manajemen Akun Facebook (Tambah, Import, Hapus, Lihat)
  2. 🔑 Login / Simpan Sesi Akun (Buat Session Baru)
  3. 🩺 Verifikasi Status Sesi Semua Akun (Health Check)
  4. 🎲 Komentar di Postingan Acak Beranda / Feed (Random Post)
  5. 🎯 Komentar di URL Postingan Target Tertentu
  6. 🧪 Test & Preview Spintax Komentar
  7. ❌ Keluar
```

---

### 1. Memasukkan Akun Facebook
Pilih **Menu `1. Manajemen Akun Facebook`**:
- **Tambah 1 Akun**: Masukkan username, password, 2FA key (opsional), dan proxy (opsional).
- **Bulk Import Akun**: Salin dan tempel puluhan akun sekaligus dengan format:
  ```text
  email1@gmail.com|password123|2FA_SECRET|http://ip:port
  email2@gmail.com|password456|2FA_SECRET
  email3@gmail.com|password789
  ```

---

### 2. Login & Simpan Sesi
Pilih **Menu `2. Login / Simpan Sesi Akun`**:
- Bot akan membuka browser Facebook dan login dengan kredensial yang tersimpan.
- Jika ada 2FA, bot akan otomatis memasukkan kode OTP 6-digit.
- Sesi aktif disimpan ke folder `sessions/` sehingga bot tidak perlu mengulang login email/password lagi di masa mendatang.

---

### 3. Menjalankan Komentar Acak di Beranda (Feed)
Pilih **Menu `4. Komentar di Postingan Acak Beranda / Feed`**:
- Tentukan jumlah postingan orang yang ingin dikomentari per akun (misal: 2–3 postingan).
- Masukkan template spintax komentar (misal: `{Halo|Hai} kak, {menarik infonya|keren postingannya}!`).
- Bot akan otomatis membuka beranda masing-masing akun, scroll mencari postingan orang lain, mengetikkan komentar spintax dengan gaya manusia, lalu mengirimkannya.
