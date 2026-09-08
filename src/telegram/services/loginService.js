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

  const isSpecificUrl = currentUrl && 
    !currentUrl.endsWith("facebook.com/") && 
    !currentUrl.endsWith("facebook.com");

  if (isSpecificUrl && (currentUrl.startsWith("http://") || currentUrl.startsWith("https://"))) {
    inlineButtons.push([
      Markup.button.url("🌐 Buka Halaman Verifikasi di Browser", currentUrl)
    ]);
  }

  inlineButtons.push([
    Markup.button.url("🔔 Buka Notifikasi Facebook (Approve di HP)", "https://www.facebook.com/notifications")
  ]);

  inlineButtons.push([
    Markup.button.callback("📸 Cek Layar Terkini", `SCREENSHOT_${accountId}`),
    Markup.button.callback("🛑 Batalkan Login", `CANCEL_LOGIN_${accountId}`)
  ]);

  return Markup.inlineKeyboard(inlineButtons);
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
    `_Jika Facebook meminta verifikasi akun, link verifikasi dan tangkapan layar akan otomatis dikirimkan ke chat Telegram ini._`,
    getRunningKeyboard()
  );

  try {
    const loginPromises = targetAccounts.map(async (acc) => {
      if (!campaignState.isRunning) return null;
      await ctx.reply(`🌐 [${acc.id}] Memproses login Facebook untuk ${acc.username} di latar belakang...`);

      const onProgress = async (type, data) => {
        try {
          if (type === "WAITING_APPROVAL") {
            waitingOtpAccounts.add(data.accountId);
            const isSpecificUrl = data.currentUrl && 
              !data.currentUrl.endsWith("facebook.com/") && 
              !data.currentUrl.endsWith("facebook.com");

            const urlText = isSpecificUrl
              ? `🔗 *Link Verifikasi Khusus:*\n${data.currentUrl}\n\n`
              : `🔔 *Buka Notifikasi di HP Anda:*\nhttps://www.facebook.com/notifications\n\n`;

            // Jika ada screenshot awal / verifikasi, kirimkan sebagai foto
            if (data.screenshotPath && fs.existsSync(data.screenshotPath)) {
              const caption = `🔐 *[${escapeMarkdown(data.accountId)}] Verifikasi / Persetujuan Diperlukan!*\n\n` +
                `Akun: \`${acc.username}\`\n\n` +
                urlText +
                `👉 *Langkah Verifikasi:*\n` +
                `1. Facebook meminta persetujuan login dari aplikasi di HP Anda.\n` +
                `2. Buka aplikasi Facebook di HP Anda (Tab Notifikasi 🔔) atau klik tombol di bawah, lalu ketuk *"Ya, ini saya" (Approve)*.\n` +
                (isSpecificUrl ? `3. Atau Anda dapat membuka Link Verifikasi Khusus di atas melalui browser HP.\n` : "") +
                `4. Jika diminta kode OTP 6-digit, *langsung balas chat ini dengan angka OTP* (contoh: \`123456\`).\n\n` +
                `⏳ Tersisa waktu tunggu: *${data.remainingSec}s*`;

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
                `⏳ *[${escapeMarkdown(data.accountId)}] Menunggu Persetujuan Login di HP...*\n\n` +
                urlText +
                `⏱️ Sisa waktu tunggu: *${data.remainingSec} detik*\n\n` +
                `_Buka aplikasi Facebook di HP (Notifikasi 🔔) lalu ketuk "Ya, ini saya", atau ketik kode OTP di chat jika diminta._`,
                buildVerificationKeyboard(data.accountId, data.currentUrl)
              );
            }
          } else if (type === "CHECKPOINT_SCREENSHOT") {
            waitingOtpAccounts.add(data.accountId);
            if (fs.existsSync(data.screenshotPath)) {
              const caption = `⚠️ *[${escapeMarkdown(data.accountId)}] Layar Checkpoint / 2FA Terdeteksi!*\n\n` +
                `🔗 *Link Verifikasi:* ${data.currentUrl || "https://www.facebook.com/"}\n\n` +
                `1. Anda dapat membuka link di atas melalui browser HP untuk verifikasi.\n` +
                `2. Jika diminta kode OTP 6-digit, *langsung ketik angka kode OTP di chat ini* (contoh: \`123456\`).\n\n` +
                `⏳ Tersisa waktu tunggu: *${data.remainingSec || 60}s*`;

              await ctx.replyWithPhoto(
                { source: data.screenshotPath },
                {
                  caption,
                  parse_mode: "Markdown",
                  ...buildVerificationKeyboard(data.accountId, data.currentUrl)
                }
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
