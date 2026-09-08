import { getAccounts, getTargets } from "../../config.js";
import { Commenter } from "../../core/commenter.js";
import { loadTelegramConfig } from "../config.js";
import { 
  campaignState, 
  setCampaignRunning, 
  resetCampaignInfo, 
  incrementCampaignCompleted 
} from "../state.js";
import { getRunningKeyboard, getMainKeyboard } from "../keyboards.js";

/**
 * Menjalankan komentar ke postingan target spesifik (URL)
 */
export async function executeTargetCampaign(ctx, postUrl = null, targetAccountId = "all") {
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
    : accounts.filter((acc) => acc.enabled !== false);

  const activeAccounts = allTargetAccounts.filter(a => !a.isLimited);
  const limitedAccounts = allTargetAccounts.filter(a => a.isLimited);

  if (activeAccounts.length === 0) {
    if (limitedAccounts.length > 0) {
      return ctx.replyWithMarkdown(
        `🛑 *Semua akun terpilih (${limitedAccounts.length} Akun) sedang berstatus LIMIT KOMENTAR Facebook!*\n\n` +
        `Bot tidak akan membuka browser untuk akun yang terlimit demi keamanan akun Anda.\n\n` +
        `_Silakan buka menu '👥 Daftar Akun Facebook' -> '🔄 Reset Limit' jika masa pembatasan sudah selesai._`,
        getMainKeyboard()
      );
    }
    return ctx.reply("⚠️ Belum ada akun aktif di sistem. Silakan tambah akun terlebih dahulu.");
  }

  if (limitedAccounts.length > 0 && targetAccountId === "all") {
    await ctx.replyWithMarkdown(
      `ℹ️ *Perhatian:* Akun ${limitedAccounts.map(a => `*[${a.id}]*`).join(", ")} otomatis *dilewati* karena sedang berstatus limit komentar.`
    );
  }

  const tgConfig = loadTelegramConfig();
  const template = tgConfig.defaultSettings?.customComment || "{Halo|Hai|Permisi} kak, {keren banget|menarik sekali}! {Salam kenal ya|Salam sukses}.";
  const headless = tgConfig.defaultSettings?.headless !== false;

  let targets = [];
  if (postUrl) {
    targets = [{ id: "direct_target", postUrl, commentTemplate: template, active: true }];
  } else {
    targets = (await getTargets()).filter(t => t.active !== false);
  }

  if (targets.length === 0) {
    return ctx.reply("⚠️ Belum ada URL target yang terdaftar. Kirim link postingan Facebook target terlebih dahulu.");
  }

  const accText = targetAccountId === "all"
    ? `Semua Akun Siap Komentar (${activeAccounts.length} Akun)`
    : `[${activeAccounts[0].id}] ${activeAccounts[0].username}`;

  const totalTarget = targets.length * activeAccounts.length;
  setCampaignRunning(true);
  campaignState.info = {
    mode: "Target URL",
    target: totalTarget,
    completed: 0,
    currentAccount: activeAccounts.length > 1
      ? `Semua Akun (${activeAccounts.map(a => a.id).join(", ")})`
      : activeAccounts[0]?.id || ""
  };

  await ctx.reply(
    `🎯 *Memulai Kampanye Komentar Target URL (PARALEL)*\n\n` +
    `• Akun: *${accText}*\n` +
    `• Target: *${targets.length} URL Postingan*\n` +
    `• Mode Tampilan: *${headless ? "🕶️ Latar Belakang" : "🖥️ Buka Jendela Browser"}*\n` +
    `• Mode: *${activeAccounts.length > 1 ? `🚀 Simultan / Bersamaan (${activeAccounts.length} Akun)` : "1 Akun"}*`,
    getRunningKeyboard()
  );

  try {
    for (const target of targets) {
      if (!campaignState.isRunning) break;
      await ctx.replyWithMarkdown(`🎯 *Target URL:* \`${target.postUrl}\``);

      const targetPromises = activeAccounts.map(async (acc) => {
        if (!campaignState.isRunning) return null;
        await ctx.reply(`👤 [${acc.id}] Memproses komentar...`);

        try {
          const res = await Commenter.postComment(acc, target, {
            headless,
            onProgress: async (type, data) => {
              if (type === "TYPING") {
                await ctx.reply(`⌨️ [${acc.id}] Mengetik komentar: "${data.commentText}"`);
              }
            }
          });

          if (res.success) {
            incrementCampaignCompleted();
            await ctx.replyWithMarkdown(`🎉 *[${acc.id}] [VALIDASI SUKSES]* Komentar terkirim pada postingan target!`);
          } else if (res.reason === "ACTION_BLOCKED") {
            await ctx.replyWithMarkdown(`🛑 *[${acc.id}] Terhenti karena Limit Pembatasan Facebook.*`);
          } else {
            await ctx.reply(`⚠️ [${acc.id}] Gagal: ${res.error || "Gagal berkomentar"}`);
          }
          return res;
        } catch (err) {
          await ctx.reply(`⚠️ [${acc.id}] Terjadi kesalahan: ${err.message}`);
          return { success: false, error: err.message };
        }
      });

      await Promise.all(targetPromises);
    }
  } catch (err) {
    await ctx.reply(`❌ Terjadi kesalahan: ${err.message}`);
  } finally {
    setCampaignRunning(false);
    resetCampaignInfo();
    await ctx.reply("🏁 Kampanye komentar Target URL telah selesai.", getMainKeyboard());
  }
}
