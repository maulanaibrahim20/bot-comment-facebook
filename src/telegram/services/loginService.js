import fs from "fs";
import { Markup } from "telegraf";
import { getAccounts } from "../../config.js";
import { SessionManager } from "../../core/sessionManager.js";
import { campaignState, setCampaignRunning, userStates, manualOtpStore, waitingOtpAccounts } from "../state.js";
import { getMainKeyboard, getRunningKeyboard } from "../keyboards.js";
import { safeReplyWithMarkdown, escapeMarkdown } from "../utils/safeMarkdown.js";

/**
 * Membuat inline keyboard interaktif untuk verifikasi login Facebook di Telegram
 */
export function buildVerificationKeyboard(accountId, currentUrl) {
  const inlineButtons = [];

  const isEncrypted2FA = currentUrl && (currentUrl.includes("encryptedcontext") || currentUrl.includes("twostepverification"));
  const isSpecificUrl = currentUrl && 
    !currentUrl.endsWith("facebook.com/") && 
    !currentUrl.endsWith("facebook.com") &&
    !isEncrypted2FA;

  if (isSpecificUrl && (currentUrl.startsWith("http://") || currentUrl.startsWith("https://"))) {
    inlineButtons.push([
      Markup.button.url("🌐 Buka Halaman Verifikasi di Browser", currentUrl)
    ]);
  }

  inlineButtons.push([
    Markup.button.callback("🤖 Klik 'Saya Bukan Robot'", `CLICK_RECAPTCHA_${accountId}`),
    Markup.button.callback("🧩 Papan Puzzle (1-9)", `OPEN_CAPTCHA_PAD_${accountId}`)
  ]);

  inlineButtons.push([
    Markup.button.url("🔔 Buka Notifikasi Facebook (Approve di HP)", "https://www.facebook.com/notifications"),
    Markup.button.callback("📸 Cek Layar Terkini", `SCREENSHOT_${accountId}`)
  ]);

  inlineButtons.push([
    Markup.button.callback("🛑 Batalkan Login", `CANCEL_LOGIN_${accountId}`)
  ]);

  return Markup.inlineKeyboard(inlineButtons);
}

/**
 * Papan keypad 3x3 untuk memecahkan puzzle gambar Google reCAPTCHA dari Telegram
 */
export function buildRecaptchaGridKeyboard(accountId) {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback("1️⃣", `CAPTCHA_TILE_${accountId}_1`),
      Markup.button.callback("2️⃣", `CAPTCHA_TILE_${accountId}_2`),
      Markup.button.callback("3️⃣", `CAPTCHA_TILE_${accountId}_3`)
    ],
    [
      Markup.button.callback("4️⃣", `CAPTCHA_TILE_${accountId}_4`),
      Markup.button.callback("5️⃣", `CAPTCHA_TILE_${accountId}_5`),
      Markup.button.callback("6️⃣", `CAPTCHA_TILE_${accountId}_6`)
    ],
    [
      Markup.button.callback("7️⃣", `CAPTCHA_TILE_${accountId}_7`),
      Markup.button.callback("8️⃣", `CAPTCHA_TILE_${accountId}_8`),
      Markup.button.callback("9️⃣", `CAPTCHA_TILE_${accountId}_9`)
    ],
    [
      Markup.button.callback("🔄 Ganti Soal", `CAPTCHA_RELOAD_${accountId}`),
      Markup.button.callback("✅ Verifikasi", `CAPTCHA_VERIFY_${accountId}`)
    ],
    [
      Markup.button.callback("📸 Cek Layar Terkini", `SCREENSHOT_${accountId}`),
      Markup.button.callback("🛑 Batalkan Login", `CANCEL_LOGIN_${accountId}`)
    ]
  ]);
}

export async function executeLoginAccounts(ctx, targetId = "all", options = {}) {
  const accounts = await getAccounts();
  const targetAccounts = targetId && targetId !== "all"
    ? accounts.filter(a => a.id === targetId || a.username === targetId)
    : accounts;

  if (targetAccounts.length === 0) {
    return ctx.reply("Akun tidak ditemukan. Gunakan /login acc_01 atau /login all");
  }

  const isHeadless = options.headless !== undefined ? options.headless : true;
  const maxWaitSeconds = options.maxWaitSeconds || 300;

  setCampaignRunning(true);
  const modeText = isHeadless ? "🕶️ Latar Belakang (Headless / Tanpa Buka Jendela)" : "🖥️ Jendela Browser di PC (Visual)";
  const parallelText = targetAccounts.length > 1 ? `🚀 Simultan / Bersamaan (${targetAccounts.length} Akun)` : "1 Akun";

  // Aktifkan state penerimaan OTP untuk semua akun yang sedang diproses
  userStates.set(ctx.from.id, { 
    state: "AWAITING_LOGIN_OTP", 
    accountIds: targetAccounts.map(a => a.id),
    accountId: targetAccounts[0]?.id || ""
  });

  await safeReplyWithMarkdown(
    ctx,
    `🔑 *Memulai Proses Login Latar Belakang (${targetAccounts.length} Akun)*\n\n` +
    `• *Mode Tampilan:* ${modeText}\n` +
    `• *Mode Eksekusi:* *${parallelText}*\n` +
    `• *Batas Waktu Tunggu:* ${maxWaitSeconds} detik\n\n` +
    `_Jika Facebook meminta verifikasi akun, tangkapan layar dan tombol bantuan akan otomatis dikirimkan ke chat Telegram ini._`,
    getRunningKeyboard()
  );

  try {
    const loginPromises = targetAccounts.map(async (acc) => {
      if (!campaignState.isRunning) return null;
      await ctx.reply(`🌐 [${acc.id}] Memproses login Facebook untuk ${acc.username} di latar belakang...`);

      const onProgress = async (type, data) => {
        try {
          if (type === "WAITING_APPROVAL" || type === "CHECKPOINT_SCREENSHOT") {
            waitingOtpAccounts.add(data.accountId);
            const isEncrypted2FA = data.currentUrl && (data.currentUrl.includes("encryptedcontext") || data.currentUrl.includes("twostepverification"));
            const isSpecificUrl = data.currentUrl && 
              !data.currentUrl.endsWith("facebook.com/") && 
              !data.currentUrl.endsWith("facebook.com") &&
              !isEncrypted2FA;

            let urlText = "";
            if (isEncrypted2FA) {
              urlText = `🔐 *Status:* Halaman Autentikasi / Keamanan Terbuka di Browser Bot\n` +
                `_(Tautan ini terenkripsi sesi browser server dan tidak dapat dibuka dari HP/PC lain)_\n\n`;
            } else if (isSpecificUrl) {
              urlText = `🔗 *Link Verifikasi Khusus:*\n${data.currentUrl}\n\n`;
            } else {
              urlText = `🔔 *Buka Notifikasi di HP Anda:*\nhttps://www.facebook.com/notifications\n\n`;
            }

            const stepInstructions = `👉 *Cara Menyelesaikan:*\n` +
              `1. **Jika Muncul "Saya Bukan Robot"**: Tekan tombol **[🤖 Klik 'Saya Bukan Robot']** di bawah agar bot mengekliknya.\n` +
              `2. **Ketik Kode OTP 6-Digit**: Cek aplikasi Authenticator / SMS di HP Anda, lalu *langsung balas chat ini dengan angka OTP* (contoh: \`123456\`). Bot akan langsung mengetikkannya ke layar login!\n` +
              `3. **Atau Setujui di HP**: Buka aplikasi Facebook di HP Anda (Tab Notifikasi 🔔), lalu ketuk pemberitahuan masuk dan pilih *"Ya, ini saya" (Approve)*.\n` +
              (isSpecificUrl ? `4. Atau buka tautan verifikasi khusus di atas melalui browser HP Anda.\n` : "") +
              `\n⏳ Tersisa waktu tunggu: *${data.remainingSec}s*`;

            // Jika ada screenshot awal / verifikasi, kirimkan sebagai foto
            if (data.screenshotPath && fs.existsSync(data.screenshotPath)) {
              const caption = `🔐 *[${escapeMarkdown(data.accountId)}] Verifikasi / 2FA Diperlukan!*\n\n` +
                `Akun: \`${acc.username}\`\n\n` +
                urlText +
                stepInstructions;

              await ctx.replyWithPhoto(
                { source: data.screenshotPath },
                {
                  caption,
                  parse_mode: "Markdown",
                  ...buildVerificationKeyboard(data.accountId, data.currentUrl)
                }
              );
            } else {
              // Notifikasi status berkala setiap interval polling
              await safeReplyWithMarkdown(
                ctx,
                `⏳ *[${escapeMarkdown(data.accountId)}] Menunggu Persetujuan Login / Kode OTP...*\n\n` +
                urlText +
                `⏱️ Sisa waktu tunggu: *${data.remainingSec} detik*\n\n` +
                `_Ketik angka kode OTP di chat ini, atau setujui notifikasi masuk di aplikasi HP Anda._`,
                buildVerificationKeyboard(data.accountId, data.currentUrl)
              );
            }
          }
        } catch (e) {
          // Abaikan error transient pengiriman pesan Telegram
        }
      };

      try {
        const res = await SessionManager.loginAccount(acc, {
          headless: isHeadless,
          maxWaitSeconds,
          shouldStop: () => !campaignState.isRunning,
          onProgress,
          getManualOtp: (accId) => {
            if (manualOtpStore.has(accId)) {
              const otp = manualOtpStore.get(accId);
              manualOtpStore.delete(accId);
              waitingOtpAccounts.delete(accId);
              return otp;
            }
            return null;
          }
        });

        waitingOtpAccounts.delete(acc.id);
        manualOtpStore.delete(acc.id);

        if (res.success) {
          await safeReplyWithMarkdown(ctx, `🎉 *[${escapeMarkdown(acc.id)}] LOGIN BERHASIL!*\nSesi profil telah tersimpan secara permanen.`);
        } else {
          await ctx.reply(`⚠️ [${acc.id}] Login belum berhasil: ${res.reason || "Waktu tunggu habis atau dibatalkan"}`);
        }
        return res;
      } catch (err) {
        waitingOtpAccounts.delete(acc.id);
        manualOtpStore.delete(acc.id);
        await ctx.reply(`⚠️ [${acc.id}] Terjadi kesalahan saat login: ${err.message}`);
        return { success: false, error: err.message };
      }
    });

    await Promise.all(loginPromises);
  } catch (err) {
    await ctx.reply(`❌ Terjadi error saat login: ${err.message}`);
  } finally {
    setCampaignRunning(false);
    userStates.delete(ctx.from.id);
    waitingOtpAccounts.clear();
    await ctx.reply("🏁 Proses login selesai.", getMainKeyboard());
  }
}
