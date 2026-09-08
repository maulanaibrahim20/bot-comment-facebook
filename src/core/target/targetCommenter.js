import path from 'path';
import { createAccountBrowserContext } from '../../browser.js';
import { paths, getSettings } from '../../config.js';
import { logger } from '../../utils/logger.js';
import { parseSpintax } from '../../utils/spintax.js';
import { randomDelay, sleep, humanScroll } from '../../utils/delay.js';
import { CommentGuard } from '../common/commentGuard.js';
import { FeedCommenter } from '../feed/feedCommenter.js';

/**
 * Modul Komentar Target URL Facebook
 * Menangani komentar ke tautan postingan / konten Facebook yang spesifik.
 */
export class TargetCommenter {
  /**
   * Menjalankan aksi komentar untuk 1 akun pada 1 target postingan spesifik (URL)
   */
  static async postComment(account, target, options = {}) {
    if (account.isLimited) {
      logger.warn(`🛑 [${account.id}] Akun sedang terkena LIMIT KOMENTAR Facebook (${account.limitReason || 'Limit Facebook'}). Dilewati otomatis.`);
      return { success: false, reason: 'ACTION_BLOCKED', error: account.limitReason || 'Akun sedang terkena limit komentar' };
    }

    const settings = await getSettings();
    const commentText = parseSpintax(target.commentTemplate);
    logger.account(account.id, `Mempersiapkan komentar target: "${commentText}"`);

    const { context, page, close } = await createAccountBrowserContext(account, {
      headless: options.headless !== undefined ? options.headless : settings.browser.headless
    });

    try {
      logger.account(account.id, `Membuka target postingan: ${target.postUrl}`);
      await page.goto(target.postUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await randomDelay(3000, 5000);

      await CommentGuard.ensureLoggedIn(account, context, page);
      await CommentGuard.closePostModalIfOpen(page);

      await humanScroll(page, 2);
      await randomDelay(1500, 3000);

      const processedSet = new Set();
      const result = await FeedCommenter.executeCommentOnNextFeedPost(
        page,
        commentText,
        processedSet,
        settings.delays.minTypingDelayMs,
        settings.delays.maxTypingDelayMs,
        options.onProgress,
        account.id,
        options
      );

      if (result.isBlocked) {
        logger.error(`[${account.id}] Akun terkena limit pembatasan komentar dari Facebook.`);
        await close();
        return { success: false, reason: 'ACTION_BLOCKED' };
      }

      if (!result.success) {
        throw new Error('Kotak komentar tidak ditemukan atau gagal tervalidasi pada postingan target.');
      }

      const successScreenshot = path.join(paths.logsDir, `success_${account.id}_${Date.now()}.png`);
      await page.screenshot({ path: successScreenshot }).catch(() => {});

      logger.success(`[${account.id}] [VALIDASI SUKSES] Berhasil mengirim komentar pada target: ${target.postUrl}`);
      await close();

      return {
        success: true,
        comment: commentText,
        targetUrl: target.postUrl
      };
    } catch (err) {
      logger.error(`[${account.id}] Gagal berkomentar pada target:`, err);
      const errorScreenshot = path.join(paths.logsDir, `error_comment_${account.id}_${Date.now()}.png`);
      await page.screenshot({ path: errorScreenshot }).catch(() => {});

      await close().catch(() => {});
      return {
        success: false,
        error: err.message
      };
    }
  }

  /**
   * Menjalankan kampanye batch ke target URL spesifik
   */
  static async runCampaign(accounts, targets, options = {}) {
    const settings = await getSettings();
    const activeAccounts = accounts.filter((acc) => acc.enabled !== false && !acc.isLimited);
    const limitedAccounts = accounts.filter((acc) => acc.enabled !== false && acc.isLimited);
    if (limitedAccounts.length > 0) {
      logger.warn(`ℹ️ ${limitedAccounts.length} akun terdeteksi sedang LIMIT KOMENTAR (${limitedAccounts.map(a => `[${a.id}]`).join(', ')}) dan otomatis dilewati.`);
    }
    const targetsList = Array.isArray(targets) ? targets : [targets];
    const activeTargets = targetsList.filter((t) => t.active !== false);
    const concurrency = options.concurrency || 1;

    if (activeAccounts.length === 0 || activeTargets.length === 0) {
      logger.warn('Tidak ada akun atau target aktif yang dapat digunakan.');
      return;
    }

    logger.info(`🚀 Memulai kampanye komentar (${activeAccounts.length} akun aktif ke ${activeTargets.length} target, Concurrency: ${concurrency})...`);
    const results = [];

    for (const target of activeTargets) {
      logger.info(`\n================== [TARGET: ${target.description || target.postUrl}] ==================`);
      let currentIndex = 0;

      const worker = async (workerId) => {
        while (currentIndex < activeAccounts.length) {
          const accIdx = currentIndex++;
          const account = activeAccounts[accIdx];
          logger.info(`[Worker ${workerId}] Akun: ${account.name || account.id}`);

          const res = await TargetCommenter.postComment(account, target, options);
          results.push({ accountId: account.id, targetUrl: target.postUrl, ...res });

          if (concurrency === 1 && accIdx < activeAccounts.length - 1) {
            const delayTime = Math.floor(
              Math.random() * (settings.delays.maxBetweenAccountsDelayMs - settings.delays.minBetweenAccountsDelayMs + 1)
            ) + settings.delays.minBetweenAccountsDelayMs;
            logger.info(`Menunggu jeda keamanan ${Math.round(delayTime / 1000)} detik...`);
            await sleep(delayTime);
          }
        }
      };

      const workerPromises = Array.from({ length: Math.min(concurrency, activeAccounts.length) }, (_, i) => worker(i + 1));
      await Promise.all(workerPromises);
    }

    logger.success('\n🎉 Kampanye komentar selesai dijalankan!');
    return results;
  }
}
