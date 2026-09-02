import { bulkImportAccounts } from "../../config.js";
import { loadTelegramConfig, saveTelegramConfig } from "../config.js";
import { userStates, manualOtpStore, campaignState } from "../state.js";
import { getMainKeyboard, getRunningKeyboard } from "../keyboards.js";

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

    if (state === "AWAITING_NEW_ACCOUNT") {
      userStates.delete(ctx.from.id);
      const data = ctx.message.text.trim();
      const imported = bulkImportAccounts(data);
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
