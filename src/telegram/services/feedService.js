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
export async function executeFeedCampaign(ctx, count, overrideComment = null, targetAccountId = "all") {
  const accounts = await getAccounts();

  // Jika user memilih 1 akun spesifik
  if (targetAccountId && targetAccountId !== "all") {
    const target = accounts.find(a => a.id === targetAccountId || a.username === targetAccountId);
    if (!target) {
      return ctx.reply("⚠️ Akun tidak ditemukan.");
    }
    if (target.isLimited) {
      return ctx.replyWithMarkdown(
        `🛑 *Akun [${target.id}] sedang terkena LIMIT KOMENTAR Facebook!*\n\n` +
        `• *Username:* \`${target.username}\`\n` +
        `• *Alasan:* _${target.limitReason || "Pembatasan limit komentar Facebook"}_\n` +
        `• *Waktu Limit:* _${target.limitedAt ? new Date(target.limitedAt).toLocaleString("id-ID") : "-"}\n\n` +
        `_Bot tidak akan membuka login/browser untuk akun ini demi mencegah pemblokiran. Jika masa limit sudah berakhir, gunakan menu '👥 Daftar Akun Facebook' -> '🔄 Reset Limit' atau ketik /resetlimit._`,
        getMainKeyboard()
      );
    }
  }

  const allTargetAccounts = targetAccountId && targetAccountId !== "all"
    ? accounts.filter(a => a.id === targetAccountId || a.username === targetAccountId)
    : accounts.filter(a => a.enabled !== false);

  const targetAccounts = allTargetAccounts.filter(a => !a.isLimited);
  const limitedAccounts = allTargetAccounts.filter(a => a.isLimited);

  if (targetAccounts.length === 0) {
    if (limitedAccounts.length > 0) {
      return ctx.replyWithMarkdown(
        `🛑 *Semua akun terpilih (${limitedAccounts.length} Akun) sedang berstatus LIMIT KOMENTAR Facebook!*\n\n` +
        `Bot tidak akan membuka browser untuk akun yang terlimit demi keamanan akun Anda.\n\n` +
        `_Silakan buka menu '👥 Daftar Akun Facebook' -> '🔄 Reset Limit' jika masa pembatasan sudah selesai._`,
        getMainKeyboard()
      );
    }
    return ctx.reply("⚠️ Akun tidak ditemukan atau tidak ada akun aktif.");
  }

  if (limitedAccounts.length > 0 && targetAccountId === "all") {
    await ctx.replyWithMarkdown(
      `ℹ️ *Perhatian:* Akun ${limitedAccounts.map(a => `*[${a.id}]*`).join(", ")} otomatis *dilewati* (tidak dibuka browser-nya) karena sedang berstatus limit komentar.`
    );
  }

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

  const accText = targetAccountId === "all"
    ? `Semua Akun Siap Komentar (${targetAccounts.length} Akun)`
    : `[${targetAccounts[0].id}] ${targetAccounts[0].username}`;

  const totalTarget = count === 0 ? 0 : count * targetAccounts.length;
  setCampaignRunning(true);
  setCampaignInfo({
    mode: "Beranda Facebook",
    target: totalTarget,
    completed: 0,
    currentAccount: targetAccounts.length > 1
      ? `Semua Akun (${targetAccounts.map(a => a.id).join(", ")})`
      : targetAccounts[0]?.id || ""
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
    `🎲 *Memulai Kampanye Beranda Facebook (PARALEL)*\n` +
      `- Akun: *${accText}*\n` +
      `- Target: *${count === 0 ? "🔥 Non-Stop Loop" : count + " Postingan per Akun"}*\n` +
      `- Komentar: \`${template}\`\n` +
      `- Identitas: ${identityText}\n` +
      `- Filter Komentar: *${filterText}*\n` +
      `- Jeda: *${delaySec} detik*\n` +
      `- Mode: *${targetAccounts.length > 1 ? `🚀 Simultan / Bersamaan (${targetAccounts.length} Akun)` : "1 Akun"}*\n\n` +
      `_Ketik /stop atau klik tombol Stop di bawah kapan saja untuk menghentikan._`,
    getRunningKeyboard()
  );

  try {
    const campaignPromises = targetAccounts.map(async (acc) => {
      if (!campaignState.isRunning) return null;

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
              await ctx.reply(`✍️ [${data.accountId}] Mengetik komentar: "${data.commentText}"`);
              break;
            case "COMMENT_SUCCESS":
              incrementCampaignCompleted();
              await ctx.replyWithMarkdown(
                `🎉 *[${data.accountId}] ${data.progressText} [VALIDASI SUKSES]*\nKomentar terkirim:\n\`${data.commentText}\``
              );
              break;
            case "DELAY":
              await ctx.reply(`⏳ [${data.accountId}] Jeda aman ${data.seconds} detik sebelum postingan berikutnya...`);
              break;
            case "SKIPPED_ALREADY_COMMENTED":
              await ctx.reply(`⏩ [${data.accountId}] Postingan ini sudah pernah dikomentari sebelumnya. Melewati ke postingan berikutnya...`);
              break;
            case "SKIPPED_NOT_PAGE":
              await ctx.reply(`⚠️ [${data.accountId}] Postingan ini tidak mengizinkan komentar sebagai Halaman. Melewati ke postingan berikutnya...`);
              break;
            case "ACCOUNT_LIMITED_SKIPPED":
              await ctx.reply(`🛑 [${data.accountId}] Dilewati otomatis: Akun sedang dalam masa limit komentar Facebook.`);
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

      try {
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
        return res;
      } catch (err) {
        await ctx.reply(`⚠️ [${acc.id}] Terjadi kesalahan: ${err.message}`);
        return { success: false, error: err.message };
      }
    });

    await Promise.all(campaignPromises);
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
