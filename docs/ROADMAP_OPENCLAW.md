# 🗺️ Roadmap & Arsitektur Integrasi OpenClaw AI Gateway

Dokumen ini mencatat rencana integrasi **OpenClaw** sebagai asisten cerdas berbasis bahasa alami (*Natural Language Processing*) untuk mengontrol Bot Facebook Multi-Akun melalui aplikasi perpesanan (**WhatsApp, Telegram, Discord, Slack**).

---

## 🎯 Visi & Konsep Utama
Dengan OpenClaw, pengguna tidak perlu mengetik perintah teknis atau memilih menu kaku. Pengguna cukup mengirim pesan teks atau *voice note* melalui WhatsApp / Telegram pribadi, dan AI Agent akan mengeksekusi otomatis di server VPS.

```
+-------------------+        +--------------------+        +-------------------------------+
|  WhatsApp / HP    | <----> |  OpenClaw Gateway  | <----> |  Facebook Commenter Bot Core  |
|  (User di HP)     |        |  (AI Tool Caller)  |        |  (Playwright / Chromium)      |
+-------------------+        +--------------------+        +-------------------------------+
```

---

## 🛠️ Modul Skill / Tools yang Akan Didaftarkan ke OpenClaw

### 1. `facebook_comment_reels`
- **Deskripsi**: Menjalankan aksi komentar otomatis pada video Facebook Reels.
- **Parameter**:
  - `count` (number): Jumlah video Reels yang ingin dikomentari (0 = non-stop).
  - `message` (string): Format template spintax atau link WhatsApp/Website.
  - `delay` (number): Jeda aman antar komentar (detik).
  - `accounts` (array opsional): ID akun tertentu yang ingin digunakan.

### 2. `facebook_comment_feed`
- **Deskripsi**: Menjalankan komentar pada postingan beranda / timeline orang lain.
- **Parameter**:
  - `count` (number): Jumlah postingan.
  - `message` (string): Format template spintax.
  - `delay` (number): Jeda antar komentar.

### 3. `facebook_check_status`
- **Deskripsi**: Memeriksa status kesehatan akun (apakah aktif login, limit sementara, atau checkpoint).

### 4. `facebook_stop_campaign`
- **Deskripsi**: Menghentikan proses kampanye yang sedang berjalan secara seketika.

---

## 🚀 Panduan Setup Singkat (Ketika Siap Diimplementasikan)

1. **Instalasi OpenClaw di Server**:
   ```bash
   npm install -g openclaw@latest
   openclaw onboard
   ```
2. **Koneksi WhatsApp Gateway**:
   - Pindai QR Code WhatsApp menggunakan fitur *Linked Devices* di HP.
3. **Hubungkan Custom Skill**:
   - Masukkan file konfigurasi tool `bot_facebook` ke direktori skill OpenClaw (`~/.openclaw/skills/`).
4. **Jalankan Daemon**:
   ```bash
   openclaw start --daemon
   ```

---
*Dokumen ini disimpan sebagai referensi implementasi masa depan.*
