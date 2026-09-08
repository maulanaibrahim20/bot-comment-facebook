import fs from "fs";
import { Markup } from "telegraf";
import { getAccounts } from "../../config.js";
import { SessionManager } from "../../core/sessionManager.js";
import { campaignState, setCampaignRunning, userStates, manualOtpStore, waitingOtpAccounts } from "../state.js";
import { getMainKeyboard, getRunningKeyboard } from "../keyboards.js";

/**
 * Membuat inline keyboard interaktif untuk verifikasi login Facebook di Telegram
 */
export function buildVerificationKeyboard(accountId, currentUrl) {
  const inlineButtons = [];

  if (currentUrl && (currentUrl.startsWith("http://") || currentUrl.startsWith("https://"))) {
    inlineButtons.push([
      Markup.button.url("🌐 Buka Halaman Verifikasi di Browser", currentUrl)
    ]);
  }

  inlineButtons.push([
    Markup.button.url("🔔 Buka Notifikasi Facebook", "https://www.facebook.com/notifications")
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

  const isHeadless = options.headless !== undefined ? options.headless : false;
  const maxWaitSeconds = options.maxWaitSeconds || (isHeadless ? 120 : 300);

  setCampaignRunning(true);
  const modeText = isHeadless ? "🕶️ Latar Belakang (Headless)" : "🖥️ Jendela Browser di PC (Visual)";
  const parallelText = targetAccounts.length > 1 ? `🚀 Simultan / Bersamaan (${targetAccounts.length} Browser)` : "1 Browser";

  // Aktifkan state penerimaan OTP untuk semua akun yang sedang diproses
  userStates.set(ctx.from.id, { 
    state: "AWAITING_LOGIN_OTP", 
    accountIds: targetAccounts.map(a => a.id),
    accountId: targetAccounts[0]?.id || ""
  });

  await ctx.replyWithMarkdown(
    `🔑 *Memulai Proses Login (${targetAccounts.length} Akun - PARALEL)*\n\n` +
    `• *Mode Tampilan:* ${modeText}\n` +
    `• *Mode Eksekusi:* *${parallelText}*\n` +
    `• *Batas Waktu Tunggu:* ${maxWaitSeconds} detik\n\n` +
    `_Jika Facebook meminta verifikasi, link URL dan tangkapan layar akan langsung dikirimkan ke chat ini._`,
    getRunningKeyboard()
  );

  try {
    const loginPromises = targetAccounts.map(async (acc) => {
      if (!campaignState.isRunning) return null;
      await ctx.reply(`🌐 [${acc.id}] Membuka browser Facebook untuk ${acc.username}...`);

      const onProgress = async (type, data) => {
        try {
          if (type === "WAITING_APPROVAL") {
            waitingOtpAccounts.add(data.accountId);
            // Jika ada screenshot awal / verifikasi, kirimkan sebagai foto
            if (data.screenshotPath && fs.existsSync(data.screenshotPath)) {
              const caption = `🔐 *[${data.accountId}] Verifikasi / Persetujuan Diperlukan!*\n\n` +
                `Akun: *${acc.username}*\n` +
                `🔗 *Link Halaman Facebook:*\n${data.currentUrl || "https://www.facebook.com/"}\n\n` +
                `👉 *Petunjuk Langkah:*\n` +
                `1. Klik tombol *'🌐 Buka Halaman Verifikasi di Browser'* di bawah untuk membuka di browser Anda.\n` +
                `2. Atau buka aplikasi Facebook di HP Anda (Notifikasi) dan ketuk *"Ya, ini saya" / Approve*.\n` +
                `3. Jika Facebook meminta kode OTP / 2FA 6-digit, *langsung balas chat ini dengan angka OTP Anda* (misal: \`123456\` atau \`${data.accountId} 123456\`).\n\n` +
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
              await ctx.replyWithMarkdown(
                `⏳ *[${data.accountId}] Menunggu Persetujuan Login di HP...*\n\n` +
                `🔗 *Link Facebook:* ${data.currentUrl || "https://www.facebook.com/"}\n` +
                `⏱️ Sisa waktu tunggu: *${data.remainingSec} detik*\n\n` +
                `_Ketik kode OTP di chat jika diminta, atau ketuk persetujuan di aplikasi HP._`,
                buildVerificationKeyboard(data.accountId, data.currentUrl)
              );
            }
          } else if (type === "CHECKPOINT_SCREENSHOT") {
            waitingOtpAccounts.add(data.accountId);
            if (fs.existsSync(data.screenshotPath)) {
              await ctx.replyWithPhoto(
                { source: data.screenshotPath },
                {
                  caption: `⚠️ *[${data.accountId}] Layar Checkpoint / 2FA Terdeteksi!*\n\n` +
                    `🔗 *URL:* ${data.currentUrl || "https://www.facebook.com/"}\n\n` +
                    `1. Anda dapat membuka link di atas untuk menyelesaikan di browser.\n` +
                    `2. Atau jika diminta kode OTP 6-digit, *langsung ketik angka kode OTP di chat ini* (misal: \`123456\` atau \`${data.accountId} 123456\`).\n\n` +
                    `⏳ Tersisa waktu tunggu: *${data.remainingSec || 60}s*`,
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
          await ctx.replyWithMarkdown(`🎉 *[${acc.id}] LOGIN BERHASIL!*\nSesi profil telah tersimpan secara permanen.`);
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
