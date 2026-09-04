import { Markup } from "telegraf";
import { getTargets } from "../../config.js";
import { loadTelegramConfig } from "../config.js";
import { campaignState, setCampaignRunning, userStates } from "../state.js";
import { getMainKeyboard, getRunningKeyboard } from "../keyboards.js";
import { executeReelsCampaign } from "../services/reelsService.js";
import { executeFeedCampaign } from "../services/feedService.js";
import { executeTargetCampaign } from "../services/targetService.js";

export function registerCampaignHandlers(bot) {
  // Menjalankan Komentar Target URL Spesifik
  bot.hears("🎯 Komentar Target URL", async (ctx) => {
    userStates.delete(ctx.from.id);
    if (campaignState.isRunning) {
      return ctx.reply(
        "⚠️ Bot sedang menjalankan kampanye. Tekan '🛑 Stop Kampanye' jika ingin membatalkan.",
        getRunningKeyboard()
      );
    }

    const targets = await getTargets();
    await ctx.replyWithMarkdown(
      `🎯 *Komentar ke URL Target Spesifik*\n\n` +
      `Pilih metode yang ingin digunakan:\n\n` +
      `1. *Kirim 1 Link Postingan Baru*: Masukkan link postingan Facebook yang ingin dikomentari.\n` +
      `2. *Gunakan Daftar Target Tersimpan*: Jalankan dari \`config/targets.json\` (${targets.length} target).`,
      Markup.inlineKeyboard([
        [Markup.button.callback("✍️ Kirim Link Postingan Baru", "TARGET_INPUT_LINK")],
        [Markup.button.callback(`📁 Gunakan Daftar Target (${targets.length})`, "TARGET_RUN_SAVED")],
        [Markup.button.callback("🔙 Batalkan", "CANCEL_CAMPAIGN")]
      ])
    );
  });

  bot.action("TARGET_INPUT_LINK", async (ctx) => {
    await ctx.answerCbQuery();
    userStates.set(ctx.from.id, "AWAITING_TARGET_URL");
    await ctx.reply(
      "Silakan kirimkan link URL postingan Facebook target sekarang (contoh: https://www.facebook.com/...):"
    );
  });

  bot.action("TARGET_RUN_SAVED", async (ctx) => {
    await ctx.answerCbQuery();
    await executeTargetCampaign(ctx);
  });

  bot.command("target", async (ctx) => {
    if (campaignState.isRunning) return ctx.reply("⚠️ Bot sedang berjalan.");
    const url = ctx.message.text.replace("/target", "").trim();
    if (!url || !url.startsWith("http")) {
      userStates.set(ctx.from.id, "AWAITING_TARGET_URL");
      return ctx.reply("Silakan kirimkan link URL postingan Facebook target (awali http/https):");
    }
    await executeTargetCampaign(ctx, url);
  });

  bot.command("targets", async (ctx) => {
    const targets = await getTargets();
    if (!targets || targets.length === 0) {
      return ctx.reply("📁 Belum ada target tersimpan di database/config.");
    }
    const list = targets
      .map((t, idx) => `${idx + 1}. \`${t.url}\`${t.comment ? `\n   💬 _"${t.comment}"_` : ""}`)
      .join("\n");
    return ctx.replyWithMarkdown(
      `🎯 *Daftar Target Tersimpan (${targets.length}):*\n\n${list}\n\n_Gunakan tombol '🎯 Komentar Target URL' atau '/target <url>' untuk menjalankan._`
    );
  });

  // Menjalankan Komentar Beranda
  bot.hears("🎲 Komentar Beranda", async (ctx) => {
    userStates.delete(ctx.from.id);
    if (campaignState.isRunning) {
      return ctx.reply(
        "⚠️ Bot sedang menjalankan kampanye. Tekan '🛑 Stop Kampanye' jika ingin membatalkan.",
        getRunningKeyboard()
      );
    }

    const config = loadTelegramConfig();
    const current =
      config.defaultSettings?.customComment ||
      "https://whatsapp.com/channel/0029VbDanrVD38CMAgA7L91R";
    const currentDelay = config.defaultSettings?.defaultDelaySeconds || 15;

    await ctx.replyWithMarkdown(
      `🎲 *Komentar di Beranda Facebook*\n\n` +
        `*Komentar:* \`${current}\`\n` +
        `*Jeda Delay:* *${currentDelay} detik*\n\n` +
        `Pilih target jumlah postingan:`,
      Markup.inlineKeyboard([
        [
          Markup.button.callback("5 Postingan", "FEED_5"),
          Markup.button.callback("10 Postingan", "FEED_10")
        ],
        [
          Markup.button.callback("20 Postingan", "FEED_20"),
          Markup.button.callback("🔥 Non-Stop Loop", "FEED_0")
        ],
        [
          Markup.button.callback("✏️ Ganti Komentar", "CHANGE_COMMENT_FEED"),
          Markup.button.callback("⏱️ Ubah Jeda", "DELAY_TRIGGER")
        ]
      ])
    );
  });

  // Menjalankan Komentar Reels
  bot.hears("🎬 Komentar Reels", async (ctx) => {
    userStates.delete(ctx.from.id);
    if (campaignState.isRunning) {
      return ctx.reply(
        "⚠️ Bot sedang menjalankan kampanye. Tekan '🛑 Stop Kampanye' jika ingin membatalkan.",
        getRunningKeyboard()
      );
    }

    const config = loadTelegramConfig();
    const current =
      config.defaultSettings?.customComment ||
      "https://whatsapp.com/channel/0029VbDanrVD38CMAgA7L91R";
    const currentDelay = config.defaultSettings?.defaultDelaySeconds || 15;

    await ctx.replyWithMarkdown(
      `🎬 *Komentar di Facebook REELS*\n\n` +
        `*Komentar:* \`${current}\`\n` +
        `*Jeda Delay:* *${currentDelay} detik*\n\n` +
        `Pilih target jumlah video Reels:`,
      Markup.inlineKeyboard([
        [
          Markup.button.callback("5 Reels", "REELS_5"),
          Markup.button.callback("10 Reels", "REELS_10")
        ],
        [
          Markup.button.callback("20 Reels", "REELS_20"),
          Markup.button.callback("🔥 Non-Stop Loop", "REELS_0")
        ],
        [
          Markup.button.callback("✏️ Ganti Komentar", "CHANGE_COMMENT_REELS"),
          Markup.button.callback("⏱️ Ubah Jeda", "DELAY_TRIGGER")
        ]
      ])
    );
  });

  bot.action("DELAY_TRIGGER", async (ctx) => {
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
      "Silakan ketik angka durasi jeda antar video yang Anda inginkan (dalam detik, misal: 20):"
    );
  });

  bot.action("CHANGE_COMMENT_FEED", async (ctx) => {
    if (campaignState.isRunning) {
      await ctx.answerCbQuery("Bot sedang berjalan!");
      return ctx.reply(
        "⚠️ Pengaturan dikunci saat kampanye aktif.",
        getRunningKeyboard()
      );
    }

    await ctx.answerCbQuery();
    userStates.set(ctx.from.id, "AWAITING_CUSTOM_COMMENT");
    await ctx.reply("Silakan kirimkan teks atau link komentar baru Anda:");
  });

  bot.action("CHANGE_COMMENT_REELS", async (ctx) => {
    if (campaignState.isRunning) {
      await ctx.answerCbQuery("Bot sedang berjalan!");
      return ctx.reply(
        "⚠️ Pengaturan dikunci saat kampanye aktif.",
        getRunningKeyboard()
      );
    }

    await ctx.answerCbQuery();
    userStates.set(ctx.from.id, "AWAITING_CUSTOM_COMMENT");
    await ctx.reply("Silakan kirimkan teks atau link komentar baru Anda:");
  });

  bot.action(/FEED_(\d+)/, async (ctx) => {
    if (campaignState.isRunning) {
      await ctx.answerCbQuery("Bot sedang berjalan!");
      return ctx.reply(
        "⚠️ Kampanye lain sedang berjalan. Tekan '🛑 Stop Kampanye' terlebih dahulu.",
        getRunningKeyboard()
      );
    }

    const count = parseInt(ctx.match[1], 10);
    await ctx.answerCbQuery();
    executeFeedCampaign(ctx, count);
  });

  bot.action(/REELS_(\d+)/, async (ctx) => {
    if (campaignState.isRunning) {
      await ctx.answerCbQuery("Bot sedang berjalan!");
      return ctx.reply(
        "⚠️ Kampanye lain sedang berjalan. Tekan '🛑 Stop Kampanye' terlebih dahulu.",
        getRunningKeyboard()
      );
    }

    const count = parseInt(ctx.match[1], 10);
    await ctx.answerCbQuery();
    executeReelsCampaign(ctx, count);
  });

  // Command cepat: /reels 10 atau /reels 10 https://link...
  bot.command("reels", async (ctx) => {
    if (campaignState.isRunning) {
      return ctx.reply(
        "⚠️ Bot sedang berjalan. Ketik /stop untuk membatalkan.",
        getRunningKeyboard()
      );
    }
    const parts = ctx.message.text.split(" ");
    const count = parts[1] ? parseInt(parts[1], 10) : 10;
    let customComment = null;
    if (parts.length > 2) {
      customComment = parts.slice(2).join(" ");
    }
    executeReelsCampaign(ctx, isNaN(count) ? 10 : count, customComment);
  });

  // Command cepat: /feed 10 atau /feed 10 https://link...
  bot.command("feed", async (ctx) => {
    if (campaignState.isRunning) {
      return ctx.reply(
        "⚠️ Bot sedang berjalan. Ketik /stop untuk membatalkan.",
        getRunningKeyboard()
      );
    }
    const parts = ctx.message.text.split(" ");
    const count = parts[1] ? parseInt(parts[1], 10) : 10;
    let customComment = null;
    if (parts.length > 2) {
      customComment = parts.slice(2).join(" ");
    }
    executeFeedCampaign(ctx, isNaN(count) ? 10 : count, customComment);
  });

  // Handler Tombol Status Kampanye
  bot.hears("📊 Status Kampanye", async (ctx) => {
    if (!campaignState.isRunning) {
      return ctx.reply(
        "⚪ Tidak ada kampanye yang sedang berjalan saat ini.",
        getMainKeyboard()
      );
    }

    const targetText =
      campaignState.info.target === 0
        ? "Non-Stop Loop"
        : `${campaignState.info.target} target`;
    await ctx.replyWithMarkdown(
      `📊 *Status Kampanye Berjalan:*\n` +
        `- Mode: *${campaignState.info.mode}*\n` +
        `- Akun Aktif: *${campaignState.info.currentAccount}*\n` +
        `- Progres: *${campaignState.info.completed} terkirim* (Target: ${targetText})\n` +
        `- Status: 🟢 *Sedang Bekerja*\n\n` +
        `_Klik tombol '🛑 Stop Kampanye' di bawah jika ingin menghentikan._`,
      getRunningKeyboard()
    );
  });

  // Handler Tombol Stop
  bot.hears("🛑 Stop Kampanye", async (ctx) => {
    if (!campaignState.isRunning) {
      return ctx.reply(
        "ℹ️ Tidak ada kampanye yang sedang berjalan saat ini.",
        getMainKeyboard()
      );
    }
    setCampaignRunning(false);
    await ctx.reply(
      "🛑 Perintah STOP diterima! Menghentikan bot dan menutup browser...",
      getMainKeyboard()
    );
  });

  bot.command("stop", async (ctx) => {
    if (!campaignState.isRunning) {
      return ctx.reply(
        "ℹ️ Tidak ada kampanye yang sedang berjalan saat ini.",
        getMainKeyboard()
      );
    }
    setCampaignRunning(false);
    await ctx.reply(
      "🛑 Perintah STOP diterima! Menghentikan bot dan menutup browser...",
      getMainKeyboard()
    );
  });
}
