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
      `*Menu Tombol Utama:*\n` +
      `• *🎬 Komentar Reels*: Komentar di Facebook Reels.\n` +
      `• *🎲 Komentar Beranda*: Komentar di Beranda / Feed Facebook.\n` +
      `• *🎯 Komentar Target URL*: Komentar ke link postingan target tertentu.\n` +
      `• *👥 Daftar Akun*: Manajemen akun, status limit, cek Fanspage, dan hapus akun.\n` +
      `• *✏️ Atur Komentar / Link*: Ubah teks spintax atau tautan default.\n` +
      `• *⏱️ Atur Jeda & Browser*: Atur delay dan mode tampilan jendela browser.\n` +
      `• *🎭 Identitas*: Berkomentar sebagai Profil Pribadi atau Halaman Facebook.\n` +
      `• *🧪 Preview Spintax*: Melihat 5 contoh variasi komentar dari template spintax aktif.\n` +
      `• *🩺 Cek Status Sesi*: Health check akun & verifikasi login Facebook.\n` +
      `• *🛑 Stop Kampanye*: Menghentikan bot secara aman.\n\n` +
      `*Perintah Cepat (Slash Commands):*\n` +
      `• \`/reels [jumlah]\` - Komentar Reels\n` +
      `• \`/feed [jumlah]\` - Komentar Beranda\n` +
      `• \`/target <url>\` - Komentar ke URL target langsung\n` +
      `• \`/spintax\` - Lihat 5 contoh variasi spintax\n` +
      `• \`/limited\` - Lihat daftar akun terkena limit\n` +
      `• \`/resetlimit\` - Reset status akun limit ke normal\n` +
      `• \`/resethistory\` - Reset riwayat konten yang sudah dikomentari\n` +
      `• \`/openbrowser <id>\` - Buka browser akun & kirim screenshot ke chat\n` +
      `• \`/filter <maks> [min]\` - Filter jumlah komentar target (misal: /filter 100 atau /filter 50 60)\n` +
      `• \`/setcomment <teks>\` - Atur komentar default\n` +
      `• \`/setdelay <detik>\` - Atur jeda waktu default\n` +
      `• \`/setidentity <personal|page>\` - Atur identitas komentar\n` +
      `• \`/deleteaccount <id>\` - Hapus akun\n` +
      `• \`/stop\` - Hentikan bot`;

    await ctx.replyWithMarkdown(helpText);
  });
}
