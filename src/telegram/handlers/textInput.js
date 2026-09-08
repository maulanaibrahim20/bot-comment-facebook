import { bulkImportAccounts, getAccounts } from "../../config.js";
import { loadTelegramConfig, saveTelegramConfig } from "../config.js";
import { userStates, manualOtpStore, waitingOtpAccounts, campaignState, pendingCampaigns } from "../state.js";
import { getMainKeyboard, getRunningKeyboard } from "../keyboards.js";
import { executeTargetCampaign } from "../services/targetService.js";
import { executeReelsCampaign } from "../services/reelsService.js";
import { executeFeedCampaign } from "../services/feedService.js";
import { buildAccountPickerKeyboard } from "./campaigns.js";

export function registerTextInputHandler(bot) {
  // Handler Teks Masuk Umum (untuk menangani update komentar custom, delay manual, dan OTP login)
  bot.on("text", async (ctx, next) => {
    const stateObj = userStates.get(ctx.from.id);

    // Jika sedang menunggu input kode OTP saat login
    if (
      stateObj &&
      typeof stateObj === "object" &&
      stateObj.state === "AWAITING_LOGIN_OTP"
    ) {
      const rawText = ctx.message.text.trim();
      const lower = rawText.toLowerCase();

      if (lower === "batal" || lower === "stop") {
        campaignState.isRunning = false;
        userStates.delete(ctx.from.id);
        waitingOtpAccounts.clear();
        return ctx.reply("🛑 Proses login dibatalkan.", getMainKeyboard());
      }

      // Format dengan spesifikasi akun: misal "acc_01 123456" atau "123456 acc_01"
      const matchWithAcc1 = rawText.match(/^([a-zA-Z0-9_-]+)\s+([\d\s-]+)$/);
      const matchWithAcc2 = rawText.match(/^([\d\s-]+)\s+([a-zA-Z0-9_-]+)$/);

      let targetAccId = null;
      let cleanOtp = null;

      if (matchWithAcc1) {
        targetAccId = matchWithAcc1[1];
        cleanOtp = matchWithAcc1[2].replace(/[\s-]/g, "");
      } else if (matchWithAcc2) {
        targetAccId = matchWithAcc2[2];
        cleanOtp = matchWithAcc2[1].replace(/[\s-]/g, "");
      } else {
        cleanOtp = rawText.replace(/[\s-]/g, "");
      }

      if (/^\d{4,8}$/.test(cleanOtp)) {
        if (targetAccId) {
          manualOtpStore.set(targetAccId, cleanOtp);
          waitingOtpAccounts.delete(targetAccId);
          await ctx.reply(
            `🔢 Menerima kode OTP untuk [${targetAccId}]: ${cleanOtp}. Sedang memasukkan ke Facebook...`
          );
        } else {
          // Jika tidak ada nama akun, set untuk semua akun yang sedang menunggu atau yang terdaftar
          const recipients = waitingOtpAccounts.size > 0
            ? Array.from(waitingOtpAccounts)
            : (stateObj.accountIds || [stateObj.accountId]);

          for (const accId of recipients) {
            manualOtpStore.set(accId, cleanOtp);
          }
          waitingOtpAccounts.clear();

          const targetLabel = recipients.length > 1 ? recipients.join(", ") : recipients[0];
          await ctx.reply(
            `🔢 Menerima kode OTP: ${cleanOtp} untuk [${targetLabel}]. Sedang memasukkan ke layar Facebook...`
          );
        }
        return;
      } else {
        return ctx.reply(
          "⚠️ Kode OTP harus berupa angka (misal: 123456 atau acc_01 123456). Silakan ketik ulang atau ketik 'batal' untuk berhenti:"
        );
      }
    }

    // Jika sedang menunggu input target reels kustom
    if (
      stateObj &&
      typeof stateObj === "object" &&
      stateObj.state === "AWAITING_REELS_CUSTOM_COUNT"
    ) {
      const rawText = ctx.message.text.trim();
      if (rawText.toLowerCase() === "batal" || rawText.toLowerCase() === "/cancel") {
        userStates.delete(ctx.from.id);
        return ctx.reply("❌ Input target Reels dibatalkan.", getMainKeyboard());
      }

      const count = parseInt(rawText, 10);
      if (isNaN(count) || count < 0) {
        return ctx.reply(
          "⚠️ Masukkan angka yang valid (contoh: 15, 25, 50, atau ketik 0 untuk non-stop loop, atau 'batal' untuk keluar):"
        );
      }
      const targetAccountId = stateObj.targetAccountId || "all";
      userStates.delete(ctx.from.id);
      executeReelsCampaign(ctx, count, null, targetAccountId);
      return;
    }

    // Jika sedang menunggu input target beranda feed kustom
    if (
      stateObj &&
      typeof stateObj === "object" &&
      stateObj.state === "AWAITING_FEED_CUSTOM_COUNT"
    ) {
      const rawText = ctx.message.text.trim();
      if (rawText.toLowerCase() === "batal" || rawText.toLowerCase() === "/cancel") {
        userStates.delete(ctx.from.id);
        return ctx.reply("❌ Input target Beranda dibatalkan.", getMainKeyboard());
      }

      const count = parseInt(rawText, 10);
      if (isNaN(count) || count < 0) {
        return ctx.reply(
          "⚠️ Masukkan angka yang valid (contoh: 15, 25, 50, atau ketik 0 untuk non-stop loop, atau 'batal' untuk keluar):"
        );
      }
      const targetAccountId = stateObj.targetAccountId || "all";
      userStates.delete(ctx.from.id);
      executeFeedCampaign(ctx, count, null, targetAccountId);
      return;
    }

    if (campaignState.isRunning) {
      return ctx.reply(
        "⚠️ Bot sedang berjalan aktif! Perintah ubah teks dikunci. Tekan '🛑 Stop Kampanye' jika ingin membatalkan.",
        getRunningKeyboard()
      );
    }

    const state = stateObj;

    if (state === "AWAITING_CUSTOM_COMMENT") {
      userStates.delete(ctx.from.id);
      const newComment = ctx.message.text.trim();

      let config = loadTelegramConfig();
      if (!config.defaultSettings) config.defaultSettings = {};
      config.defaultSettings.customComment = newComment;
      saveTelegramConfig(config);

      return ctx.replyWithMarkdown(
        `✅ *Komentar Berhasil Disimpan!*\n\n` +
          `Komentar aktif sekarang:\n\`${newComment}\`\n\n` +
          `Silakan pilih menu di bawah untuk menjalankan komentar:`,
        getMainKeyboard()
      );
    }

    if (state === "AWAITING_DELAY_INPUT") {
      userStates.delete(ctx.from.id);
      const sec = parseInt(ctx.message.text.trim(), 10);
      if (isNaN(sec) || sec < 2) {
        return ctx.reply(
          "⚠️ Mohon masukkan angka detik yang valid (minimal 3 detik)."
        );
      }

      let config = loadTelegramConfig();
      if (!config.defaultSettings) config.defaultSettings = {};
      config.defaultSettings.defaultDelaySeconds = sec;
      saveTelegramConfig(config);

      return ctx.replyWithMarkdown(
        `✅ *Jeda waktu antar video berhasil diatur ke ${sec} detik!*\n\n` +
          `Silakan pilih menu di bawah untuk mulai:`,
        getMainKeyboard()
      );
    }

    if (state === "AWAITING_TARGET_PAGE_NAME") {
      userStates.delete(ctx.from.id);
      const pageName = ctx.message.text.trim();
      let config = loadTelegramConfig();
      if (!config.defaultSettings) config.defaultSettings = {};

      if (!pageName || pageName === "-" || pageName === "0" || pageName.toLowerCase() === "bebas") {
        config.defaultSettings.targetPageName = "";
        saveTelegramConfig(config);
        return ctx.replyWithMarkdown(
          "✅ *Target nama Halaman Facebook direset ke bebas (halaman pertama akun).*",
          getMainKeyboard()
        );
      } else {
        config.defaultSettings.commentAs = "PAGE";
        config.defaultSettings.targetPageName = pageName;
        saveTelegramConfig(config);
        return ctx.replyWithMarkdown(
          `✅ *Target Halaman Facebook spesifik berhasil diatur ke:*\n🚩 \`${pageName}\`\n\n_(Identitas otomatis diaktifkan sebagai Halaman/Fanspage)_`,
          getMainKeyboard()
        );
      }
    }

    if (state === "AWAITING_TARGET_URL") {
      userStates.delete(ctx.from.id);
      const url = ctx.message.text.trim();
      if (!url.startsWith("http")) {
        return ctx.reply(
          "⚠️ URL tidak valid. Pastikan diawali dengan http:// atau https://",
          getMainKeyboard()
        );
      }
      pendingCampaigns.set(ctx.from.id, { type: "TARGET_DIRECT", url });
      const accounts = (await getAccounts()).filter(a => a.enabled !== false);
      if (accounts.length === 0) {
        return ctx.reply("⚠️ Belum ada akun aktif terdaftar.", getMainKeyboard());
      }
      return ctx.replyWithMarkdown(
        `🎯 *Target URL Diterima:*\n\`${url}\`\n\n` +
        `👥 *Pilih Akun Pengirim Komentar:*`,
        buildAccountPickerKeyboard("TARGETDIRACC", accounts)
      );
    }

    if (state === "AWAITING_COMMENT_FILTER") {
      userStates.delete(ctx.from.id);
      const raw = ctx.message.text.trim();
      const parts = raw.split(/[\s-]+/);
      let min = 0;
      let max = 0;

      if (parts.length === 1) {
        max = parseInt(parts[0], 10) || 0;
      } else if (parts.length >= 2) {
        min = parseInt(parts[0], 10) || 0;
        max = parseInt(parts[1], 10) || 0;
      }

      let config = loadTelegramConfig();
      if (!config.defaultSettings) config.defaultSettings = {};
      config.defaultSettings.minComments = min;
      config.defaultSettings.maxComments = max;
      saveTelegramConfig(config);

      const desc = min > 0 && max > 0 
        ? `${min} - ${max} komentar` 
        : (max > 0 ? `Maksimal ${max} komentar` : (min > 0 ? `Minimal ${min} komentar` : "Bebas (Semua)"));

      return ctx.replyWithMarkdown(
        `✅ *Filter jumlah komentar berhasil diatur ke:* *${desc}*`,
        getMainKeyboard()
      );
    }

    if (state === "AWAITING_NEW_ACCOUNT") {
      userStates.delete(ctx.from.id);
      const data = ctx.message.text.trim();
      const imported = await bulkImportAccounts(data);
      if (imported.length > 0) {
        return ctx.replyWithMarkdown(
          `✅ *Berhasil menambahkan ${imported.length} akun!*\n` +
            `${imported.map((a) => `• *[${a.id}]* ${a.username}`).join("\n")}\n\n` +
            `Ketik \`/login all\` untuk melakukan login otomatis, atau buka menu '👥 Daftar Akun Facebook'.`,
          getMainKeyboard()
        );
      } else {
        return ctx.reply(
          "⚠️ Format tidak valid. Gunakan format: email|password atau email|password|2fa_secret",
          getMainKeyboard()
        );
      }
    }

    return next();
  });
}
