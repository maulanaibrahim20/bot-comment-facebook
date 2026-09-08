import { bulkImportAccounts } from "../../config.js";
import { loadTelegramConfig, saveTelegramConfig } from "../config.js";
import { userStates, manualOtpStore, campaignState } from "../state.js";
import { getMainKeyboard, getRunningKeyboard } from "../keyboards.js";
import { executeTargetCampaign } from "../services/targetService.js";

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
      const inputOtp = ctx.message.text.trim();
      if (/^\d{4,8}$/.test(inputOtp)) {
        manualOtpStore.set(stateObj.accountId, inputOtp);
        await ctx.reply(
          `🔢 Menerima kode OTP: ${inputOtp}. Sedang memasukkan ke layar Facebook...`
        );
        return;
      } else {
        return ctx.reply(
          "⚠️ Kode OTP harus berupa angka (misal: 123456). Silakan ketik ulang:"
        );
      }
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
      return executeTargetCampaign(ctx, url);
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
