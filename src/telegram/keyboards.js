import { Markup } from "telegraf";

// 1. Menu Keyboard Standby (Saat Bot Menganggur)
export function getMainKeyboard() {
  return Markup.keyboard([
    ["🎲 Komentar Beranda", "🎬 Komentar Reels"],
    ["✏️ Atur Komentar / Link", "⏱️ Atur Jeda (Delay)"],
    ["👥 Daftar Akun Facebook", "🩺 Cek Status Sesi"],
    ["ℹ️ Bantuan"]
  ]).resize();
}

// 2. Menu Keyboard Running (Saat Bot Sedang Berjalan - HANYA STOP & STATUS)
export function getRunningKeyboard() {
  return Markup.keyboard([
    ["🛑 Stop Kampanye", "📊 Status Kampanye"]
  ]).resize();
}
