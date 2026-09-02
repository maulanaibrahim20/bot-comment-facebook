import { Markup } from "telegraf";
import { loadTelegramConfig, saveTelegramConfig } from "../config.js";
import { userStates, campaignState } from "../state.js";
import { getRunningKeyboard } from "../keyboards.js";

export function registerSettingsHandlers(bot) {
  // Fitur Mengatur Komentar / Link Custom
  bot.hears("✏️ Atur Komentar / Link", async (ctx) => {
    if (campaignState.isRunning) {
      return ctx.reply(
        "⚠️ Bot sedang berjalan! Pengaturan komentar dikunci selama kampanye aktif. Tekan '🛑 Stop Kampanye' terlebih dahulu.",
        getRunningKeyboard()
      );
    }

    userStates.set(ctx.from.id, "AWAITING_CUSTOM_COMMENT");
    const config = loadTelegramConfig();
    const current = config.defaultSettings?.customComment || "Belum diatur";

    await ctx.replyWithMarkdown(
      `📝 *Pengaturan Komentar / Link Facebook*\n\n` +
        `*Komentar Aktif Saat Ini:*\n\`${current}\`\n\n` +
        `👉 *Silakan ketik atau kirim pesan baru sekarang*.\n` +
        `Bisa berupa link saja (misal: \`https://whatsapp.com/...\`) atau teks dengan spintax (misal: \`{Halo|Hai} kak cek https://...\`).`
    );
  });

  bot.command("setcomment", async (ctx) => {
    if (campaignState.isRunning) {
      return ctx.reply(
        "⚠️ Bot sedang berjalan! Pengaturan dikunci saat kampanye aktif.",
        getRunningKeyboard()
      );
    }

    const text = ctx.message.text.replace("/setcomment", "").trim();
    if (!text) {
      return ctx.reply("Format: /setcomment <teks atau link>");
    }
    let config = loadTelegramConfig();
    if (!config.defaultSettings) config.defaultSettings = {};
    config.defaultSettings.customComment = text;
    saveTelegramConfig(config);

    await ctx.replyWithMarkdown(
      `✅ *Komentar default berhasil diperbarui!*\n\nKomentar aktif:\n\`${text}\``
    );
  });

  // Fitur Mengatur Jeda Waktu (Delay)
  bot.hears("⏱️ Atur Jeda (Delay)", async (ctx) => {
    if (campaignState.isRunning) {
      return ctx.reply(
        "⚠️ Bot sedang berjalan! Jeda delay dikunci selama kampanye aktif. Tekan '🛑 Stop Kampanye' terlebih dahulu.",
        getRunningKeyboard()
      );
    }

    userStates.delete(ctx.from.id);
    const config = loadTelegramConfig();
    const currentDelay = config.defaultSettings?.defaultDelaySeconds || 15;

    await ctx.replyWithMarkdown(
      `⏱️ *Pengaturan Jeda Waktu Antar Komentar*\n\n` +
        `*Jeda Aktif Saat Ini:* *${currentDelay} detik*\n\n` +
        `_Tips: Gunakan minimal 15–30 detik agar akun aman dari limit Facebook._\n\n` +
        `Pilih durasi jeda yang diinginkan:`,
      Markup.inlineKeyboard([
        [
          Markup.button.callback("10 Detik", "DELAY_10"),
          Markup.button.callback("15 Detik (Normal)", "DELAY_15")
        ],
        [
          Markup.button.callback("20 Detik", "DELAY_20"),
          Markup.button.callback("30 Detik (Aman)", "DELAY_30")
        ],
        [
          Markup.button.callback("45 Detik", "DELAY_45"),
          Markup.button.callback("60 Detik (Sangat Aman)", "DELAY_60")
        ],
        [Markup.button.callback("✏️ Ketik Manual (Detik)", "DELAY_MANUAL")]
      ])
    );
  });

  bot.action(/DELAY_(\d+)/, async (ctx) => {
    if (campaignState.isRunning) {
      await ctx.answerCbQuery("Bot sedang berjalan!");
      return ctx.reply(
        "⚠️ Pengaturan jeda dikunci saat kampanye aktif.",
        getRunningKeyboard()
      );
    }

    const sec = parseInt(ctx.match[1], 10);
    await ctx.answerCbQuery();
    let config = loadTelegramConfig();
    if (!config.defaultSettings) config.defaultSettings = {};
    config.defaultSettings.defaultDelaySeconds = sec;
    saveTelegramConfig(config);

    await ctx.replyWithMarkdown(
      `✅ *Jeda waktu antar komentar berhasil diatur ke ${sec} detik!*`
    );
  });

  bot.action("DELAY_MANUAL", async (ctx) => {
    if (campaignState.isRunning) {
      await ctx.answerCbQuery("Bot sedang berjalan!");
      return ctx.reply(
        "⚠️ Pengaturan dikunci saat kampanye aktif.",
        getRunningKeyboard()
      );
    }

    await ctx.answerCbQuery();
    userStates.set(ctx.from.id, "AWAITING_DELAY_INPUT");
    await ctx.reply(
      "Silakan ketik angka durasi jeda yang Anda inginkan dalam detik (misal: 25):"
    );
  });

  bot.command("setdelay", async (ctx) => {
    if (campaignState.isRunning) {
      return ctx.reply(
        "⚠️ Pengaturan jeda dikunci saat kampanye aktif.",
        getRunningKeyboard()
      );
    }

    const parts = ctx.message.text.split(" ");
    const sec = parseInt(parts[1], 10);
    if (isNaN(sec) || sec < 2) {
      return ctx.reply(
        "Format: /setdelay <jumlah detik (minimal 3)>\nContoh: /setdelay 20"
      );
    }
    let config = loadTelegramConfig();
    if (!config.defaultSettings) config.defaultSettings = {};
    config.defaultSettings.defaultDelaySeconds = sec;
    saveTelegramConfig(config);

    await ctx.replyWithMarkdown(
      `✅ *Jeda waktu antar komentar berhasil diatur ke ${sec} detik!*`
    );
  });
}
