import { Markup } from "telegraf";

// 1. Menu Keyboard Standby (Saat Bot Menganggur)
export function getMainKeyboard() {
  return Markup.keyboard([
    ["🎲 Komentar Beranda", "🎬 Komentar Reels"],
    ["🎯 Komentar Target URL", "👥 Daftar Akun Facebook"],
    ["✏️ Atur Komentar / Link", "⏱️ Atur Jeda & Browser"],
    ["🎭 Identitas (Akun / Halaman)", "🧪 Preview Spintax"],
    ["🩺 Cek Status Sesi", "ℹ️ Bantuan"]
  ]).resize();
}

// 2. Menu Keyboard Running (Saat Bot Sedang Berjalan - HANYA STOP & STATUS)
export function getRunningKeyboard() {
  return Markup.keyboard([
    ["🛑 Stop Kampanye", "📊 Status Kampanye"]
  ]).resize();
}
