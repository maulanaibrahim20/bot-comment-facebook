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
export async function executeTargetCampaign(ctx, postUrl = null) {
  const accounts = getAccounts();
  const activeAccounts = accounts.filter((acc) => acc.enabled !== false);
  if (activeAccounts.length === 0) {
    return ctx.reply("⚠️ Belum ada akun aktif di sistem. Silakan tambah akun terlebih dahulu.");
  }

  const tgConfig = loadTelegramConfig();
  const template = tgConfig.defaultSettings?.customComment || "{Halo|Hai|Permisi} kak, {keren banget|menarik sekali}! {Salam kenal ya|Salam sukses}.";
  const headless = tgConfig.defaultSettings?.headless !== false;

  let targets = [];
  if (postUrl) {
    targets = [{ id: "direct_target", postUrl, commentTemplate: template, active: true }];
  } else {
    targets = getTargets().filter(t => t.active !== false);
  }

  if (targets.length === 0) {
    return ctx.reply("⚠️ Belum ada URL target yang terdaftar. Kirim link postingan Facebook target terlebih dahulu.");
  }

  setCampaignRunning(true);
  campaignState.info = {
    mode: "Target URL",
    target: targets.length
  };

  await ctx.reply(
    `🎯 *Memulai Kampanye Komentar Target URL*\n\n` +
    `• Jumlah Akun: *${activeAccounts.length} Akun*\n` +
    `• Target: *${targets.length} URL Postingan*\n` +
    `• Mode Tampilan: *${headless ? "🕶️ Latar Belakang" : "🖥️ Buka Jendela Browser"}*`,
    getRunningKeyboard()
  );

  try {
    for (const target of targets) {
      if (!campaignState.isRunning) break;
      await ctx.replyWithMarkdown(`🎯 *Target URL:* \`${target.postUrl}\``);

      for (const acc of activeAccounts) {
        if (!campaignState.isRunning) break;
        await ctx.reply(`👤 [${acc.id}] Memproses komentar...`);

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
      }
    }
  } catch (err) {
    await ctx.reply(`❌ Terjadi kesalahan: ${err.message}`);
  } finally {
    setCampaignRunning(false);
    resetCampaignInfo();
    await ctx.reply("🏁 Kampanye komentar Target URL telah selesai.", getMainKeyboard());
  }
}
