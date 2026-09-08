import { Markup } from "telegraf";
import { getTargets, getAccounts } from "../../config.js";
import { loadTelegramConfig } from "../config.js";
import { campaignState, setCampaignRunning, userStates, pendingCampaigns } from "../state.js";
import { getMainKeyboard, getRunningKeyboard } from "../keyboards.js";
import { executeReelsCampaign } from "../services/reelsService.js";
import { executeFeedCampaign } from "../services/feedService.js";
import { executeTargetCampaign } from "../services/targetService.js";

/**
 * Helper inline keyboard untuk memilih akun (Semua Akun atau Akun Tertentu)
 */
export function buildAccountPickerKeyboard(prefix, accounts) {
  const buttons = [];
  const normalAccounts = accounts.filter(a => !a.isLimited);

  if (normalAccounts.length > 1) {
    buttons.push([
      Markup.button.callback(`🚀 Semua Akun Siap Komentar (${normalAccounts.length} Akun)`, `${prefix}_all`)
    ]);
  }

  for (const acc of accounts) {
    if (acc.isLimited) {
      buttons.push([
        Markup.button.callback(`🛑 [${acc.id}] ${acc.username} (LIMIT KOMENTAR)`, `${prefix}_${acc.id}`)
      ]);
    } else {
      buttons.push([
        Markup.button.callback(`🟢 [${acc.id}] ${acc.username}`, `${prefix}_${acc.id}`)
      ]);
    }
  }
  buttons.push([Markup.button.callback("🔙 Batalkan", "CANCEL_CAMPAIGN")]);
  return Markup.inlineKeyboard(buttons);
}

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
    const accounts = (await getAccounts()).filter(a => a.enabled !== false);
    if (accounts.length === 0) {
      return ctx.reply("⚠️ Belum ada akun aktif terdaftar.");
    }
    await ctx.replyWithMarkdown(
      `🎯 *Pilih Akun untuk Komentar Target Tersimpan:*\n\n` +
      `Silakan pilih akun yang ingin digunakan atau jalankan untuk semua akun:`,
      buildAccountPickerKeyboard("TARGETSAVEDACC", accounts)
    );
  });

  bot.action(/TARGETSAVEDACC_(.+)/, async (ctx) => {
    const targetAccountId = ctx.match[1];
    await ctx.answerCbQuery();
    await executeTargetCampaign(ctx, null, targetAccountId);
  });

  bot.action(/TARGETDIRACC_(.+)/, async (ctx) => {
    const targetAccountId = ctx.match[1];
    await ctx.answerCbQuery();
    const pending = pendingCampaigns.get(ctx.from.id);
    const postUrl = pending?.url || null;
    pendingCampaigns.delete(ctx.from.id);
    await executeTargetCampaign(ctx, postUrl, targetAccountId);
  });

  bot.command("target", async (ctx) => {
    if (campaignState.isRunning) return ctx.reply("⚠️ Bot sedang berjalan.");
    const parts = ctx.message.text.split(" ");
    const url = parts[1]?.trim();
    const targetAccountId = parts[2]?.trim() || "all";

    if (!url || !url.startsWith("http")) {
      userStates.set(ctx.from.id, "AWAITING_TARGET_URL");
      return ctx.reply("Silakan kirimkan link URL postingan Facebook target (awali http/https):");
    }
    await executeTargetCampaign(ctx, url, targetAccountId);
  });

  bot.command("targets", async (ctx) => {
    const targets = await getTargets();
    if (!targets || targets.length === 0) {
      return ctx.reply("📁 Belum ada target tersimpan di database/config.");
    }
    const list = targets
      .map((t, idx) => `${idx + 1}. \`${t.url || t.postUrl}\`${t.comment || t.commentTemplate ? `\n   💬 _"${t.comment || t.commentTemplate}"_` : ""}`)
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

    const accounts = (await getAccounts()).filter(a => a.enabled !== false);
    if (accounts.length === 0) {
      return ctx.reply("⚠️ Belum ada akun aktif terdaftar. Silakan tambahkan akun terlebih dahulu di menu Daftar Akun.");
    }

    await ctx.replyWithMarkdown(
      `🎲 *Komentar di Beranda Facebook*\n\n` +
      `👥 *Langkah 1: Pilih Akun Pengirim Komentar*\n` +
      `Pilih akun tertentu atau jalankan untuk semua akun sekaligus:`,
      buildAccountPickerKeyboard("FEEDACC", accounts)
    );
  });

  bot.action(/FEEDACC_(.+)/, async (ctx) => {
    const targetAccountId = ctx.match[1];
    await ctx.answerCbQuery();

    const config = loadTelegramConfig();
    const current =
      config.defaultSettings?.customComment ||
      "https://whatsapp.com/channel/0029VbDanrVD38CMAgA7L91R";
    const currentDelay = config.defaultSettings?.defaultDelaySeconds || 15;

    const accLabel = targetAccountId === "all" ? "🚀 Semua Akun Sekaligus" : `👤 Akun [${targetAccountId}]`;

    await ctx.replyWithMarkdown(
      `🎲 *Komentar di Beranda Facebook*\n\n` +
        `• *Akun Dipilih:* ${accLabel}\n` +
        `• *Komentar:* \`${current}\`\n` +
        `• *Jeda Delay:* *${currentDelay} detik*\n\n` +
        `📊 *Langkah 2: Pilih target jumlah postingan:*`,
      Markup.inlineKeyboard([
        [
          Markup.button.callback("5 Postingan", `FEEDRUN_${targetAccountId}_5`),
          Markup.button.callback("10 Postingan", `FEEDRUN_${targetAccountId}_10`),
          Markup.button.callback("20 Postingan", `FEEDRUN_${targetAccountId}_20`)
        ],
        [
          Markup.button.callback("🔥 Non-Stop Loop", `FEEDRUN_${targetAccountId}_0`),
          Markup.button.callback("✍️ Target Kustom", `FEEDCUSTOM_${targetAccountId}`)
        ],
        [
          Markup.button.callback("✏️ Ganti Komentar", "CHANGE_COMMENT_FEED"),
          Markup.button.callback("⏱️ Ubah Jeda", "DELAY_TRIGGER")
        ],
        [
          Markup.button.callback("🔙 Ganti Pilihan Akun", "FEED_BACK_TO_ACC")
        ]
      ])
    );
  });

  bot.action(/FEEDCUSTOM_(.+)/, async (ctx) => {
    if (campaignState.isRunning) {
      await ctx.answerCbQuery("Bot sedang berjalan!");
      return ctx.reply("⚠️ Kampanye lain sedang berjalan. Tekan '🛑 Stop Kampanye' terlebih dahulu.", getRunningKeyboard());
    }
    const targetAccountId = ctx.match[1];
    await ctx.answerCbQuery();
    userStates.set(ctx.from.id, { state: "AWAITING_FEED_CUSTOM_COUNT", targetAccountId });
    await ctx.reply(
      `✍️ *Target Jumlah Postingan Beranda Kustom*\n\n` +
      `Silakan ketik angka target postingan yang ingin dikomentari (contoh: 15, 30, atau 50):\n` +
      `_(Atau ketik 0 untuk loop tanpa batas, atau 'batal' untuk membatalkan)_`
    );
  });

  bot.action("FEED_BACK_TO_ACC", async (ctx) => {
    await ctx.answerCbQuery();
    const accounts = (await getAccounts()).filter(a => a.enabled !== false);
    await ctx.replyWithMarkdown(
      `🎲 *Pilih Akun untuk Komentar Beranda:*`,
      buildAccountPickerKeyboard("FEEDACC", accounts)
    );
  });

  bot.action(/FEEDRUN_(.+)_(.+)/, async (ctx) => {
    if (campaignState.isRunning) {
      await ctx.answerCbQuery("Bot sedang berjalan!");
      return ctx.reply(
        "⚠️ Kampanye lain sedang berjalan. Tekan '🛑 Stop Kampanye' terlebih dahulu.",
        getRunningKeyboard()
      );
    }

    const targetAccountId = ctx.match[1];
    const count = parseInt(ctx.match[2], 10);
    await ctx.answerCbQuery();
    executeFeedCampaign(ctx, count, null, targetAccountId);
  });

  // Kompatibilitas untuk callback lama FEED_(\d+)
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
    executeFeedCampaign(ctx, count, null, "all");
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

    const accounts = (await getAccounts()).filter(a => a.enabled !== false);
    if (accounts.length === 0) {
      return ctx.reply("⚠️ Belum ada akun aktif terdaftar. Silakan tambahkan akun terlebih dahulu di menu Daftar Akun.");
    }

    await ctx.replyWithMarkdown(
      `🎬 *Komentar di Facebook REELS*\n\n` +
      `👥 *Langkah 1: Pilih Akun Pengirim Komentar*\n` +
      `Silakan pilih akun tertentu atau jalankan untuk semua akun sekaligus:`,
      buildAccountPickerKeyboard("REELSACC", accounts)
    );
  });

  bot.action(/REELSACC_(.+)/, async (ctx) => {
    const targetAccountId = ctx.match[1];
    await ctx.answerCbQuery();

    const config = loadTelegramConfig();
    const current =
      config.defaultSettings?.customComment ||
      "https://whatsapp.com/channel/0029VbDanrVD38CMAgA7L91R";
    const currentDelay = config.defaultSettings?.defaultDelaySeconds || 15;

    const accLabel = targetAccountId === "all" ? "🚀 Semua Akun Sekaligus" : `👤 Akun [${targetAccountId}]`;

    await ctx.replyWithMarkdown(
      `🎬 *Komentar di Facebook REELS*\n\n` +
        `• *Akun Dipilih:* ${accLabel}\n` +
        `• *Komentar:* \`${current}\`\n` +
        `• *Jeda Delay:* *${currentDelay} detik*\n\n` +
        `📊 *Langkah 2: Pilih target jumlah video Reels per akun:*`,
      Markup.inlineKeyboard([
        [
          Markup.button.callback("5 Reels", `REELSRUN_${targetAccountId}_5`),
          Markup.button.callback("10 Reels", `REELSRUN_${targetAccountId}_10`),
          Markup.button.callback("20 Reels", `REELSRUN_${targetAccountId}_20`)
        ],
        [
          Markup.button.callback("🔥 Non-Stop Loop", `REELSRUN_${targetAccountId}_0`),
          Markup.button.callback("✍️ Target Kustom", `REELSCUSTOM_${targetAccountId}`)
        ],
        [
          Markup.button.callback("✏️ Ganti Komentar", "CHANGE_COMMENT_REELS"),
          Markup.button.callback("⏱️ Ubah Jeda", "DELAY_TRIGGER")
        ],
        [
          Markup.button.callback("🔙 Ganti Pilihan Akun", "REELS_BACK_TO_ACC")
        ]
      ])
    );
  });

  bot.action(/REELSCUSTOM_(.+)/, async (ctx) => {
    if (campaignState.isRunning) {
      await ctx.answerCbQuery("Bot sedang berjalan!");
      return ctx.reply("⚠️ Kampanye lain sedang berjalan. Tekan '🛑 Stop Kampanye' terlebih dahulu.", getRunningKeyboard());
    }
    const targetAccountId = ctx.match[1];
    await ctx.answerCbQuery();
    userStates.set(ctx.from.id, { state: "AWAITING_REELS_CUSTOM_COUNT", targetAccountId });
    await ctx.reply(
      `✍️ *Target Jumlah Video Reels Kustom*\n\n` +
      `Silakan ketik angka target jumlah video Reels yang ingin dikomentari (contoh: 15, 30, atau 50):\n` +
      `_(Atau ketik 0 untuk loop tanpa batas, atau 'batal' untuk membatalkan)_`
    );
  });

  bot.action("REELS_BACK_TO_ACC", async (ctx) => {
    await ctx.answerCbQuery();
    const accounts = (await getAccounts()).filter(a => a.enabled !== false);
    await ctx.replyWithMarkdown(
      `🎬 *Pilih Akun untuk Komentar Reels:*`,
      buildAccountPickerKeyboard("REELSACC", accounts)
    );
  });

  bot.action(/REELSRUN_(.+)_(.+)/, async (ctx) => {
    if (campaignState.isRunning) {
      await ctx.answerCbQuery("Bot sedang berjalan!");
      return ctx.reply(
        "⚠️ Kampanye lain sedang berjalan. Tekan '🛑 Stop Kampanye' terlebih dahulu.",
        getRunningKeyboard()
      );
    }
    const targetAccountId = ctx.match[1];
    const count = parseInt(ctx.match[2], 10);
    await ctx.answerCbQuery();
    executeReelsCampaign(ctx, count, null, targetAccountId);
  });

  // Kompatibilitas untuk callback lama REELS_(\d+)
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
    executeReelsCampaign(ctx, count, null, "all");
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

  bot.action("CANCEL_CAMPAIGN", async (ctx) => {
    await ctx.answerCbQuery();
    userStates.delete(ctx.from.id);
    pendingCampaigns.delete(ctx.from.id);
    await ctx.reply("❌ Kampanye dibatalkan.", getMainKeyboard());
  });

  // Command cepat: /reels 10 atau /reels 10 acc_01
  bot.command("reels", async (ctx) => {
    if (campaignState.isRunning) {
      return ctx.reply(
        "⚠️ Bot sedang berjalan. Ketik /stop untuk membatalkan.",
        getRunningKeyboard()
      );
    }
    const parts = ctx.message.text.split(" ");
    const count = parts[1] ? parseInt(parts[1], 10) : 10;
    const targetAccountId = parts[2]?.trim() || "all";
    executeReelsCampaign(ctx, isNaN(count) ? 10 : count, null, targetAccountId);
  });

  // Command cepat: /feed 10 atau /feed 10 acc_01
  bot.command("feed", async (ctx) => {
    if (campaignState.isRunning) {
      return ctx.reply(
        "⚠️ Bot sedang berjalan. Ketik /stop untuk membatalkan.",
        getRunningKeyboard()
      );
    }
    const parts = ctx.message.text.split(" ");
    const count = parts[1] ? parseInt(parts[1], 10) : 10;
    const targetAccountId = parts[2]?.trim() || "all";
    executeFeedCampaign(ctx, isNaN(count) ? 10 : count, null, targetAccountId);
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
