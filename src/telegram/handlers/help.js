import { getAccounts } from "../../config.js";
import { loadTelegramConfig } from "../config.js";
import { userStates, campaignState } from "../state.js";
import { getMainKeyboard, getRunningKeyboard } from "../keyboards.js";

export function registerHelpHandlers(bot) {
  bot.start(async (ctx) => {
    userStates.delete(ctx.from.id);
    const accounts = getAccounts();
    const config = loadTelegramConfig();
    const activeComment =
      config.defaultSettings?.customComment ||
      "https://whatsapp.com/channel/0029VbDanrVD38CMAgA7L91R";
    const delaySec = config.defaultSettings?.defaultDelaySeconds || 15;

    if (campaignState.isRunning) {
      return ctx.replyWithMarkdown(
        `🟢 *Bot Sedang Berjalan!*\n` +
          `Mode: *${campaignState.info.mode}*\n` +
          `Target: *${campaignState.info.target === 0 ? "Non-Stop" : campaignState.info.target}*\n\n` +
          `Gunakan tombol di bawah untuk mengontrol:`,
        getRunningKeyboard()
      );
    }

    const welcomeText =
      `🤖 *Facebook Multi-Account Bot Controller*\n\n` +
      `Halo *${ctx.from.first_name}*! Bot siap menerima perintah untuk otomatisasi Facebook.\n\n` +
      `📊 *Status Sistem:*\n` +
      `- Total Akun: *${accounts.length} Akun*\n` +
      `- Status Bot: *⚪ Standby / Siap*\n` +
      `- Komentar Aktif: \`${activeComment}\`\n` +
      `- Jeda Delay: *${delaySec} detik*\n\n` +
      `Silakan pilih menu di bawah ini untuk memulai:`;

    await ctx.replyWithMarkdown(welcomeText, getMainKeyboard());
  });

  bot.hears("ℹ️ Bantuan", async (ctx) => {
    userStates.delete(ctx.from.id);
    if (campaignState.isRunning) {
      return ctx.reply(
        "⚠️ Bot sedang berjalan! Tekan '🛑 Stop Kampanye' jika ingin menghentikan.",
        getRunningKeyboard()
      );
    }

    const helpText =
      `📖 *Panduan Penggunaan Bot Telegram:*\n\n` +
      `*Menu Tombol:*\n` +
      `• *🎬 Komentar Reels*: Menjalankan komentar di Facebook Reels step-by-step.\n` +
      `• *🎲 Komentar Beranda*: Menjalankan komentar di Beranda Facebook.\n` +
      `• *✏️ Atur Komentar / Link*: Ubah teks atau link yang akan dikomentari.\n` +
      `• *⏱️ Atur Jeda (Delay)*: Atur jeda istirahat antar video (detik).\n` +
      `• *👥 Daftar Akun*: Melihat status login, tambah akun, atau hapus akun.\n` +
      `• *🩺 Cek Status Sesi*: Memeriksa apakah akun masih aktif di Facebook.\n` +
      `• *🛑 Stop*: Menghentikan bot seketika (responsif dalam 1 detik).\n\n` +
      `*Perintah Cepat:*\n` +
      `• \`/reels 10\` - Komentar di 10 Reels\n` +
      `• \`/reels 10 https://linkanda.com\` - Komentar di 10 Reels dengan link baru\n` +
      `• \`/feed 10\` - Komentar di 10 Postingan Beranda\n` +
      `• \`/setcomment <link/teks>\` - Atur komentar default\n` +
      `• \`/setdelay <detik>\` - Atur jeda waktu antar komentar\n` +
      `• \`/deleteaccount <id>\` - Hapus akun (opsi simpan/hapus sesi)\n` +
      `• \`/stop\` - Hentikan bot`;

    await ctx.replyWithMarkdown(helpText);
  });
}
