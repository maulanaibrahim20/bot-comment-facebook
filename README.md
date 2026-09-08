# Facebook Multi-Account Comment Bot 🤖

Bot otomatisasi komentar Facebook untuk multi-akun (>20 akun) berbasis **Node.js** dan **Playwright Stealth**. Dilengkapi dengan manajemen akun via CLI, Bulk Import, manajemen sesi (cookie & storageState), generator variasi komentar (Spintax), generator 2FA otomatis, dukungan proxy per-akun, serta emulasi ketikan manusia untuk mencegah checkpoint/banned.

---

## 🌟 Fitur Utama

- 🗄️ **Database MySQL & Prisma ORM**: Penyimpanan persisten untuk data akun, target URL, riwayat komentar (anti-duplikat), dan konfigurasi sistem dengan dukungan **Prisma Studio** (Web GUI).
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

---

### 4. Manajemen Basis Data (Prisma ORM & MySQL) 🗄️

Sistem telah terintegrasi dengan **MySQL** dan **Prisma ORM**. Seluruh data akun, riwayat komentar, dan target tersimpan di database.

- **Buka Prisma Studio (Web GUI di Browser)**:
  ```bash
  npm run db:studio
  ```
  Otomatis membuka web visual di `http://localhost:5555` untuk melihat, menambah, atau mengedit data akun dan riwayat.

- **Sinkronisasi Skema Database**:
  ```bash
  npm run db:push
  ```

- **Seeding Ulang Data dari File JSON**:
  ```bash
  npm run db:seed
  ```

---

### 5. Telegram Bot Controller & Sinkronisasi Fitur 📱

Bot dapat dikontrol penuh melalui Telegram dengan sinkronisasi fitur 100% antara mode CLI (`npm start`) dan Telegram Bot (`npm run telegram`):

```bash
npm run telegram
```

Fitur Telegram:
- **🎬 Reels & 🎲 Beranda & 🎯 Target URL**: Eksekusi kampanye komentar langsung dari smartphone.
- **🎭 Identitas Komentar**: Beralih profil komentar antara Akun Pribadi atau Halaman Facebook (Fanspage spesifik dengan `/setpage <nama_halaman>`).
- **👥 Manajemen Akun**: Cek sesi, cek fanspage, hapus akun, dan lihat akun terlimit.
- **🌐 Buka Browser & Screenshot**: Kirim tangkapan layar browser akun langsung ke Telegram dengan `/openbrowser <id>`.
- **🧪 Spintax Preview**: Preview variasi komentar spintax dengan `/spintax`.
- **📊 Status Kampanye**: Monitoring status live & progres dengan `/status`.
- **Daftar Perintah Slash**: `/status`, `/reels`, `/feed`, `/target`, `/targets`, `/spintax`, `/limited`, `/resetlimit`, `/resethistory`, `/openbrowser`, `/filter`, `/setcomment`, `/setdelay`, `/setidentity`, `/setpage`, `/deleteaccount`, `/stop`, `/help`.

---

### 6. Pengujian Sistem Otomatis (Vitest) 🧪

Semua modul unit test & integration test dijalankan menggunakan **Vitest**:

```bash
# Menjalankan seluruh test suite Vitest
npm test

# Mode interaktif watch
npm run test:watch
```

Cakupan pengujian (8 test files, 44 tests):
1. `spintax.test.js`: Parser spintax standar, nested spintax, generator variasi, dan edge cases.
2. `twoFactor.test.js`: Generator OTP RFC 6238, sanitasi secret key, dan validasi Base32.
3. `delay.test.js`: Helper sleep dan pembatasan rentang random delay.
4. `commentParser.test.js`: Parsing format angka komentar Facebook (Indonesia & Inggris: `1,5 rb`, `2.4k`, `85`) dan facade Commenter.
5. `commentGuard.test.js`: Deteksi pop-up pembatasan Facebook, spam block guard, dan lightbox auto-close.
6. `database.test.js`: Konektivitas Prisma MySQL, CRUD akun, CRUD target, pengaturan bot, dan riwayat komentar (anti-duplikasi).
7. `session.test.js`: Penyimpanan session state Playwright ke database (`session_data`) dan cache file lokal.
8. `parity.test.js`: Verifikasi sinkronisasi 100% antara opsi CLI dan Telegram Bot command handler.

