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
  const commentAs = config.defaultSettings?.commentAs || "PERSONAL";
  const targetPageName = config.defaultSettings?.targetPageName || "";
  const minComments = config.defaultSettings?.minComments || 0;
  const maxComments = config.defaultSettings?.maxComments || 0;
  const isHeadless = config.defaultSettings?.headless !== false;

  setCampaignRunning(true);
  setCampaignInfo({
    mode: "Beranda Facebook",
    target: count,
    completed: 0,
    currentAccount: accounts[0]?.id || ""
  });

  const identityText =
    commentAs === "PAGE"
      ? `🚩 *Halaman Facebook (Fanspage)*${targetPageName ? ` (${targetPageName})` : ""}`
      : "👤 *Profil Pribadi*";

  const filterText = minComments > 0 && maxComments > 0 
    ? `${minComments} - ${maxComments} komentar` 
    : (maxComments > 0 ? `Maksimal ${maxComments} komentar` : (minComments > 0 ? `Minimal ${minComments} komentar` : "Bebas"));

  // Ubah Keyboard ke RUNNING MODE (Hanya ada tombol STOP & STATUS)
  await ctx.replyWithMarkdown(
    `🎲 *Memulai Kampanye Beranda Facebook*\n` +
      `- Target: *${count === 0 ? "🔥 Non-Stop Loop" : count + " Postingan"}*\n` +
      `- Komentar: \`${template}\`\n` +
      `- Identitas: ${identityText}\n` +
      `- Filter Komentar: *${filterText}*\n` +
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
            case "SWITCHED_PROFILE":
              await ctx.replyWithMarkdown(`🚩 [${data.accountId}] *Berhasil beralih ke Halaman:* \`${data.profileName}\` untuk berkomentar.`);
              break;
            case "FALLBACK_PROFILE":
              await ctx.reply(`ℹ️ [${data.accountId}] Tidak memiliki Halaman atau belum beralih. Melanjutkan dengan Profil Pribadi.`);
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
            case "SKIPPED_ALREADY_COMMENTED":
              await ctx.reply(`⏩ [${data.accountId}] Postingan ini sudah pernah Anda komentari sebelumnya. Melewati ke postingan berikutnya...`);
              break;
            case "SKIPPED_NOT_PAGE":
              await ctx.reply(`⚠️ [${data.accountId}] Postingan ini tidak mengizinkan komentar sebagai Halaman. Melewati ke postingan berikutnya...`);
              break;
            case "ACTION_BLOCKED":
              await ctx.replyWithMarkdown(
                `🛑 *[${data.accountId}] PEMBATASAN KOMENTAR DARI FACEBOOK!*\n` +
                  `Pesan: _${data.reason || "Anda Tidak Dapat Menggunakan Fitur Ini Sekarang / Limit Komentar"}_\n\n` +
                  `_Bot otomatis menghentikan komentar pada akun ini demi keamanan akun Anda._`
              );
              break;
            case "COMMENT_FAILED":
              await ctx.reply(
                `⚠️ [${data.accountId}] Komentar pada postingan belum berhasil (Gagal ${data.consecutiveFailures}/${data.maxFailures}). Mencari postingan berikutnya...`
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
        commentAs,
        targetPageName,
        headless: isHeadless,
        minComments,
        maxComments,
        shouldStop: () => !campaignState.isRunning,
        onProgress
      });

      if (res.isBlocked) {
        await ctx.replyWithMarkdown(
          `🛑 *[${acc.id}] Terhenti karena Limit Facebook!*\n` +
            `- Berhasil terkirim: *${res.totalCommented} komentar*\n` +
            `- Keterangan: _${res.blockedReason || "Pembatasan limit komentar Facebook"}_\n` +
            `_Akun ini tidak dapat berkomentar lagi untuk sementara waktu._`
        );
      } else if (res.success) {
        await ctx.replyWithMarkdown(
          `✅ *[${acc.id}] Selesai!* Total *${res.totalCommented} komentar* berhasil terkirim di Beranda.`
        );
      } else if (res.reason === "NOT_LOGGED_IN") {
        await ctx.replyWithMarkdown(
          `⚠️ *[${acc.id}] Dilewati:* Akun belum berhasil login ke Facebook atau sesi kadaluarsa / checkpoint.`
        );
      } else if (res.error) {
        await ctx.reply(`⚠️ [${acc.id}] Gagal: ${res.error}`);
      } else {
        await ctx.reply(`⚠️ [${acc.id}] Selesai. Tidak ada komentar yang berhasil terkirim.`);
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
