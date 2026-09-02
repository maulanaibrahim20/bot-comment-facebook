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

// Eksekusi Komentar Reels dengan Pelaporan Step-by-Step ke Telegram
export async function executeReelsCampaign(ctx, count, overrideComment = null) {
  const accounts = getAccounts();
  const config = loadTelegramConfig();
  const template =
    overrideComment ||
    config.defaultSettings?.customComment ||
    "https://whatsapp.com/channel/0029VbDanrVD38CMAgA7L91R";
  const delaySec = config.defaultSettings?.defaultDelaySeconds || 15;

  setCampaignRunning(true);
  setCampaignInfo({
    mode: "Facebook Reels",
    target: count,
    completed: 0,
    currentAccount: accounts[0]?.id || ""
  });

  // Ubah Keyboard ke RUNNING MODE (Hanya ada tombol STOP & STATUS)
  await ctx.replyWithMarkdown(
    `🎬 *Memulai Kampanye Facebook Reels*\n` +
      `- Target: *${count === 0 ? "🔥 Non-Stop Loop" : count + " Reels"}*\n` +
      `- Komentar: \`${template}\`\n` +
      `- Jeda Antar Video: *${delaySec} detik*\n\n` +
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
              await ctx.reply(`🌐 [${data.accountId}] Membuka Facebook Reels (Target: ${data.target})...`);
              break;
            case "LOGGED_IN":
              await ctx.reply(`🔑 [${data.accountId}] Berhasil masuk ke Facebook Reels!`);
              break;
            case "WATCHING_REEL":
              await ctx.reply(`👁️ [${data.accountId}] Menonton Reel #${data.reelIndex}\nURL: ${data.url}`);
              break;
            case "TYPING":
              await ctx.reply(`✍️ [${data.accountId}] Mengetik komentar: "${data.commentText}"`);
              break;
            case "COMMENT_SUCCESS":
              incrementCampaignCompleted();
              await ctx.replyWithMarkdown(
                `🎉 *[${data.accountId}] ${data.progressText} [VALIDASI SUKSES]*\nKomentar terkirim:\n\`${data.commentText}\``
              );
              break;
            case "DELAY":
              await ctx.reply(`⏳ Jeda aman ${data.seconds} detik sebelum video berikutnya...`);
              break;
            case "NEXT_REEL":
              await ctx.reply(`⏭️ [${data.accountId}] Berpindah ke video Reel berikutnya...`);
              break;
            case "ACTION_BLOCKED":
              await ctx.replyWithMarkdown(
                `🛑 *[${data.accountId}] PEMBATASAN SEMENTARA DARI FACEBOOK!*\nPesan: _Anda Tidak Dapat Menggunakan Fitur Ini Sekarang / Limit Komentar_.\nBot otomatis berhenti pada akun ini demi keamanan.`
              );
              break;
            case "STOPPED":
              await ctx.reply(`🛑 [${data.accountId}] Bot berhasil dihentikan atas permintaan Anda.`);
              break;
          }
        } catch (e) {}
      };

      const res = await Commenter.postRandomReelsComments(acc, {
        count,
        commentTemplate: template,
        delaySeconds: delaySec,
        headless: true,
        shouldStop: () => !campaignState.isRunning,
        onProgress
      });

      if (res.success) {
        await ctx.replyWithMarkdown(
          `✅ *[${acc.id}] Selesai!* Total *${res.totalCommented} komentar* berhasil terkirim di Reels.`
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
      "🏁 Kampanye Facebook Reels selesai. Semua menu tombol utama telah kembali aktif!",
      getMainKeyboard()
    );
  }
}
