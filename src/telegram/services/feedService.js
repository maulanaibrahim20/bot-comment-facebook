import { getAccounts } from "../../config.js";
import { Commenter } from "../../core/commenter.js";
import { loadTelegramConfig } from "../config.js";
import {
  campaignState,
  setCampaignRunning,
  setCampaignInfo,
  resetCampaignInfo,
  incrementCampaignCompleted
} from "../state.js";
import { getMainKeyboard, getRunningKeyboard } from "../keyboards.js";

// Eksekusi Komentar Beranda dengan Pelaporan Step-by-Step ke Telegram
export async function executeFeedCampaign(ctx, count, overrideComment = null) {
  const accounts = getAccounts();
  const config = loadTelegramConfig();
  const template =
    overrideComment ||
    config.defaultSettings?.customComment ||
    "https://whatsapp.com/channel/0029VbDanrVD38CMAgA7L91R";
  const delaySec = config.defaultSettings?.defaultDelaySeconds || 15;

  setCampaignRunning(true);
  setCampaignInfo({
    mode: "Beranda Facebook",
    target: count,
    completed: 0,
    currentAccount: accounts[0]?.id || ""
  });

  // Ubah Keyboard ke RUNNING MODE (Hanya ada tombol STOP & STATUS)
  await ctx.replyWithMarkdown(
    `🎲 *Memulai Kampanye Beranda Facebook*\n` +
      `- Target: *${count === 0 ? "🔥 Non-Stop Loop" : count + " Postingan"}*\n` +
      `- Komentar: \`${template}\`\n` +
      `- Jeda: *${delaySec} detik*\n\n` +
      `_Ketik /stop atau klik tombol Stop di bawah kapan saja untuk menghentikan._`,
    getRunningKeyboard()
  );

  try {
    for (const acc of accounts) {
      if (!campaignState.isRunning) break;
      setCampaignInfo({ currentAccount: acc.id });

      const onProgress = async (type, data) => {
        if (!campaignState.isRunning && type !== "STOPPED") return;
        try {
          switch (type) {
            case "START":
              await ctx.reply(`🌐 [${data.accountId}] Membuka Beranda Facebook (Target: ${data.target})...`);
              break;
            case "LOGGED_IN":
              await ctx.reply(`🔑 [${data.accountId}] Berhasil masuk ke Beranda!`);
              break;
            case "TYPING":
              await ctx.reply(`✍️ Mengetik komentar: "${data.commentText}"`);
              break;
            case "COMMENT_SUCCESS":
              incrementCampaignCompleted();
              await ctx.replyWithMarkdown(
                `🎉 *[${data.accountId}] ${data.progressText} [VALIDASI SUKSES]*\nKomentar terkirim:\n\`${data.commentText}\``
              );
              break;
            case "DELAY":
              await ctx.reply(`⏳ Jeda aman ${data.seconds} detik sebelum postingan berikutnya...`);
              break;
            case "ACTION_BLOCKED":
              await ctx.replyWithMarkdown(
                `🛑 *[${data.accountId}] PEMBATASAN SEMENTARA DARI FACEBOOK!*\nBot otomatis berhenti demi keamanan.`
              );
              break;
            case "STOPPED":
              await ctx.reply(`🛑 [${data.accountId}] Bot berhasil dihentikan.`);
              break;
          }
        } catch (e) {}
      };

      const res = await Commenter.postRandomFeedComments(acc, {
        count,
        commentTemplate: template,
        delaySeconds: delaySec,
        headless: true,
        shouldStop: () => !campaignState.isRunning,
        onProgress
      });

      if (res.success) {
        await ctx.replyWithMarkdown(
          `✅ *[${acc.id}] Selesai!* Total *${res.totalCommented} komentar* berhasil terkirim di Beranda.`
        );
      }
    }
  } catch (err) {
    await ctx.reply(`❌ Terjadi error: ${err.message}`);
  } finally {
    setCampaignRunning(false);
    resetCampaignInfo();
    // Kembalikan Keyboard ke MAIN MODE (Semua tombol aktif kembali)
    await ctx.reply(
      "🏁 Kampanye Beranda selesai. Semua menu tombol utama telah kembali aktif!",
      getMainKeyboard()
    );
  }
}
