import fs from "fs";
import { getAccounts } from "../../config.js";
import { SessionManager } from "../../core/sessionManager.js";
import { campaignState, setCampaignRunning, userStates, manualOtpStore } from "../state.js";
import { getMainKeyboard, getRunningKeyboard } from "../keyboards.js";

export async function executeLoginAccounts(ctx, targetId = "all") {
  const accounts = getAccounts();
  const targetAccounts = targetId && targetId !== "all"
    ? accounts.filter(a => a.id === targetId || a.username === targetId)
    : accounts;

  if (targetAccounts.length === 0) {
    return ctx.reply("Akun tidak ditemukan. Gunakan /login acc_01 atau /login all");
  }

  setCampaignRunning(true);
  await ctx.replyWithMarkdown(
    `🔑 *Memulai Proses Login (${targetAccounts.length} Akun)*\n\n` +
    `_Jika Facebook meminta kode OTP atau persetujuan HP, bot akan mengirimkan screenshot foto layar Facebook langsung ke chat ini._`,
    getRunningKeyboard()
  );

  try {
    for (const acc of targetAccounts) {
      if (!campaignState.isRunning) break;
      await ctx.reply(`🌐 [${acc.id}] Membuka browser Facebook untuk ${acc.username}...`);

      const onProgress = async (type, data) => {
        try {
          if (type === "WAITING_APPROVAL") {
            await ctx.reply(`📱 [${data.accountId}] Menunggu persetujuan di HP... (${data.remainingSec}s tersisa)`);
          } else if (type === "CHECKPOINT_SCREENSHOT") {
            userStates.set(ctx.from.id, { state: "AWAITING_LOGIN_OTP", accountId: data.accountId });
            if (fs.existsSync(data.screenshotPath)) {
              await ctx.replyWithPhoto(
                { source: data.screenshotPath },
                {
                  caption: `📱 *[${data.accountId}] Layar Verifikasi Facebook*\n\n` +
                    `1. Buka aplikasi Facebook di HP Anda dan klik 'Ya, ini saya'.\n` +
                    `2. Atau jika ada kode OTP 6-digit, *langsung balas chat ini dengan angka OTP Anda* (misal: \`123456\`).\n\n` +
                    `_Bot sedang menunggu persetujuan Anda..._`,
                  parse_mode: "Markdown"
                }
              );
            }
          }
        } catch (e) {}
      };

      const res = await SessionManager.loginAccount(acc, {
        headless: true,
        maxWaitSeconds: 90,
        shouldStop: () => !campaignState.isRunning,
        onProgress,
        getManualOtp: (accId) => {
          if (manualOtpStore.has(accId)) {
            const otp = manualOtpStore.get(accId);
            manualOtpStore.delete(accId);
            return otp;
          }
          return null;
        }
      });

      userStates.delete(ctx.from.id);

      if (res.success) {
        await ctx.replyWithMarkdown(`🎉 *[${acc.id}] LOGIN BERHASIL!*\nSesi profil telah tersimpan secara permanen.`);
      } else {
        await ctx.reply(`⚠️ [${acc.id}] Login belum berhasil: ${res.reason || "Waktu tunggu habis"}`);
      }
    }
  } catch (err) {
    await ctx.reply(`❌ Terjadi error: ${err.message}`);
  } finally {
    setCampaignRunning(false);
    await ctx.reply("🏁 Proses login selesai.", getMainKeyboard());
  }
}
