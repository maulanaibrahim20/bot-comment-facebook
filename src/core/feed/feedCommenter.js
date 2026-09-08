import { createAccountBrowserContext } from "../../browser.js";
import {
  getSettings,
  markAccountLimited,
  hasAccountCommentedOn,
  markCommentedHistory,
} from "../../config.js";
import { logger } from "../../utils/logger.js";
import { parseSpintax } from "../../utils/spintax.js";
import {
  randomDelay,
  sleep,
  typeHumanLike,
  humanMouseMove,
} from "../../utils/delay.js";
import { CommentGuard } from "../common/commentGuard.js";
import { CommentParser } from "../common/commentParser.js";
import { ProfileSwitcher } from "../profileSwitcher.js";

/**
 * Modul Komentar Beranda (Feed) Facebook
 * Menangani pencarian postingan beranda, pengetikan komentar, validasi postingan sendiri, dan kampanye feed.
 */
export class FeedCommenter {
  /**
   * Menemukan tombol komentar pada postingan baru di Beranda (Feed), mengetikkan teks, memvalidasi pengiriman, dan menutup modal
   */
  static async executeCommentOnNextFeedPost(
    page,
    commentText,
    processedSet,
    minDelay,
    maxDelay,
    onProgress,
    accountId = "",
    options = {},
  ) {
    await CommentGuard.closePostModalIfOpen(page);

    // Cek apakah akun terblokir
    if (await CommentGuard.checkIsActionBlocked(page)) {
      return { success: false, isBlocked: true };
    }

    // Cek apakah browser tersasar ke halaman Profil Sendiri
    const currentUrl = page.url();
    if (currentUrl.includes("/profile.php") || currentUrl.includes("/me")) {
      const isProfilePage = await page
        .evaluate(() => {
          return !!document.querySelector(
            '[aria-label*="Edit profil" i], [aria-label*="Edit profile" i], [aria-label*="Tambahkan ke cerita" i], [aria-label*="Add to story" i]',
          );
        })
        .catch(() => false);

      if (isProfilePage) {
        logger.warn(
          `[${accountId}] Browser terdeteksi berada di halaman Profil Sendiri. Mengarahkan kembali ke Beranda Facebook...`,
        );
        await page.goto("https://www.facebook.com/", {
          waitUntil: "domcontentloaded",
        });
        await randomDelay(3000, 5000);
        return { success: false, isBlocked: false };
      }
    }

    const minComments = options.minComments || 0;
    const maxComments = options.maxComments || 0;

    const commentTriggers = page.locator(
      [
        'div[role="button"]:has-text("Komentari")',
        'div[role="button"]:has-text("Comment")',
        'div[aria-label*="Tinggalkan komentar" i]',
        'div[aria-label*="Beri komentar" i]',
        'div[aria-label*="Leave a comment" i]',
        'div[aria-label*="Komentari" i]',
        'span:text-is("Komentari")',
        'span:text-is("Comment")',
      ].join(", "),
    );

    const triggerCount = await commentTriggers.count();
    let selectedTrigger = null;
    let selectedPostId = null;

    for (let i = 0; i < triggerCount; i++) {
      const trigger = commentTriggers.nth(i);
      const isVisible = await trigger.isVisible().catch(() => false);
      if (!isVisible) continue;

      const postInfo = await trigger
        .evaluate((el) => {
          const post = el.closest(
            '[role="article"], [data-pagelet*="FeedUnit"], div[role="feed"] > div',
          );
          if (!post)
            return {
              isTagged: false,
              id: null,
              hasOwnComment: false,
              isOwnPost: false,
              commentCountStr: null,
            };
          const isTagged = post.getAttribute("data-bot-commented") === "true";
          const textSample = post.innerText
            ? post.innerText.substring(0, 100).replace(/\s+/g, " ")
            : "";
          const hasOwnComment = !!(
            post.querySelector('span:has-text("komentar Anda")') ||
            post.querySelector('[aria-label*="Edit atau hapus" i]') ||
            post.querySelector('[aria-label*="Hapus pratinjau" i]') ||
            (post.innerText && post.innerText.includes("Hapus pratinjau"))
          );

          // Cek apakah postingan ini milik akun sendiri
          const isOwnPost = !!(
            post.querySelector('[aria-label*="Edit postingan" i]') ||
            post.querySelector('[aria-label*="Edit post" i]') ||
            post.querySelector('[aria-label*="Pindahkan ke sampah" i]') ||
            post.querySelector('[aria-label*="Move to trash" i]') ||
            post.querySelector('[aria-label*="Edit pemirsa" i]') ||
            post.querySelector('[aria-label*="Edit audience" i]')
          );

          let commentCountStr = null;
          const countMatch = post.innerText
            ? post.innerText.match(
                /([\d]+(?:[.,]\d+)?\s*(?:rb|k|jt|m|b)?)\s*(?:komentar|comments)/i,
              )
            : null;
          if (countMatch) {
            commentCountStr = countMatch[1];
          }

          return {
            isTagged,
            id: textSample,
            hasOwnComment,
            isOwnPost,
            commentCountStr,
          };
        })
        .catch(() => ({
          isTagged: false,
          id: null,
          hasOwnComment: false,
          isOwnPost: false,
          commentCountStr: null,
        }));

      // Lewati jika postingan adalah milik akun sendiri
      if (postInfo.isOwnPost) {
        logger.info(
          `⏩ [${accountId}] Postingan ini adalah postingan milik akun Anda sendiri. Melewati (skip)...`,
        );
        if (postInfo.id) processedSet.add(postInfo.id);
        continue;
      }

      // Lewati jika sudah pernah dikomentari di sesi ini atau dalam riwayat akun
      if (postInfo.isTagged || (postInfo.id && processedSet.has(postInfo.id))) {
        continue;
      }

      if (
        accountId &&
        postInfo.id &&
        (await hasAccountCommentedOn(accountId, postInfo.id))
      ) {
        logger.info(
          `⏩ [${accountId}] Postingan beranda ini sudah pernah Anda komentari. Melewati ke postingan lain...`,
        );
        if (postInfo.id) processedSet.add(postInfo.id);
        continue;
      }

      if (postInfo.hasOwnComment) {
        logger.info(
          `⏩ [${accountId}] Terdeteksi komentar milik akun Anda pada postingan beranda ini. Melewati...`,
        );
        if (postInfo.id) {
          processedSet.add(postInfo.id);
          if (accountId) await markCommentedHistory(accountId, postInfo.id);
        }
        continue;
      }

      // Filter jumlah komentar postingan
      if (minComments > 0 || maxComments > 0) {
        if (postInfo.commentCountStr) {
          const parsedCount = CommentParser.parseCommentCountString(
            postInfo.commentCountStr,
          );
          if (parsedCount !== null) {
            const isBelowMin = minComments > 0 && parsedCount < minComments;
            const isAboveMax = maxComments > 0 && parsedCount > maxComments;
            if (isBelowMin || isAboveMax) {
              const targetRangeStr =
                minComments > 0 && maxComments > 0
                  ? `${minComments} - ${maxComments}`
                  : minComments > 0
                    ? `>= ${minComments}`
                    : `<= ${maxComments}`;
              logger.info(
                `⏩ [${accountId}] Postingan ini dilewati: memiliki ${parsedCount} komentar (Di luar rentang target: ${targetRangeStr}).`,
              );
              if (onProgress) {
                await onProgress("SKIPPED_COMMENT_COUNT_FILTER", {
                  accountId,
                  currentCount: parsedCount,
                  minComments,
                  maxComments,
                });
              }
              if (postInfo.id) processedSet.add(postInfo.id);
              continue;
            }
          }
        }
      }

      selectedTrigger = trigger;
      selectedPostId = postInfo.id;
      if (postInfo.id) processedSet.add(postInfo.id);
      break;
    }

    if (selectedTrigger) {
      await selectedTrigger.scrollIntoViewIfNeeded().catch(() => {});
      await randomDelay(500, 1000);
      await humanMouseMove(page, selectedTrigger);
      await selectedTrigger.click({ force: true }).catch(() => {});
      await randomDelay(1200, 2200);
    }

    const commentBoxes = page.locator(
      'div[role="textbox"][contenteditable="true"], div[data-lexical-editor="true"], div[aria-label*="Tulis komentar" i], div[aria-label*="Write a comment" i], div[role="textbox"]',
    );
    const boxCount = await commentBoxes.count();
    let targetCommentBox = null;

    for (let i = 0; i < boxCount; i++) {
      const box = commentBoxes.nth(i);
      const isVisible = await box.isVisible().catch(() => false);
      if (!isVisible) continue;

      const isAlreadyCommented = await box
        .evaluate((el) => {
          const parent = el.closest('[data-bot-commented="true"]');
          return !!parent;
        })
        .catch(() => false);

      if (!isAlreadyCommented) {
        targetCommentBox = box;
        break;
      }
    }

    if (!targetCommentBox) {
      return { success: false, isBlocked: false };
    }

    // VALIDASI IDENTITAS HALAMAN (Jika mode Halaman dipilih)
    if (options.commentAs === "PAGE") {
      const pageEnforce = await ProfileSwitcher.enforcePageIdentityAtCommentBox(
        page,
        options.targetPageName,
      );
      if (!pageEnforce.valid) {
        logger.warn(
          `⚠️ [${accountId}] Postingan beranda ini tidak dapat dikomentari sebagai Halaman (terdeteksi akun biasa: "${pageEnforce.identityName}"). Melewati (skip) agar tidak salah menggunakan akun biasa...`,
        );
        if (selectedPostId) processedSet.add(selectedPostId);
        await CommentGuard.closePostModalIfOpen(page);
        return { success: false, skippedNotPage: true, isBlocked: false };
      }
    }

    await targetCommentBox.scrollIntoViewIfNeeded().catch(() => {});
    await randomDelay(500, 1000);
    await humanMouseMove(page, targetCommentBox);
    await targetCommentBox.click({ force: true });
    await randomDelay(800, 1500);

    logger.info(`Mengetikkan komentar: "${commentText}"`);
    if (onProgress) await onProgress("TYPING", { commentText });

    await typeHumanLike(
      page,
      targetCommentBox,
      commentText,
      minDelay,
      maxDelay,
    );
    await randomDelay(1500, 2500);

    await page.keyboard.press("Enter");
    await randomDelay(2500, 3500);

    let verifyResult = await CommentGuard.verifyCommentSubmitted(
      page,
      targetCommentBox,
      commentText,
    );
    if (verifyResult.isBlocked) {
      return { success: false, isBlocked: true };
    }

    if (!verifyResult.isConfirmed) {
      const sendBtn = page
        .locator(
          [
            'div[aria-label="Komentari" i]',
            'div[aria-label="Comment" i]',
            'div[aria-label="Kirim" i]',
            'div[aria-label*="Enter untuk mengirim" i]',
            'div[aria-label*="Press Enter to post" i]',
            'div[role="button"][aria-label*="Komentari" i]',
          ].join(", "),
        )
        .first();

      if (await sendBtn.isVisible().catch(() => false)) {
        await humanMouseMove(page, sendBtn);
        await sendBtn.click({ force: true }).catch(() => {});
        await randomDelay(2500, 4000);
      } else {
        await page.keyboard.press("Enter");
        await randomDelay(2000, 3500);
      }

      verifyResult = await CommentGuard.verifyCommentSubmitted(
        page,
        targetCommentBox,
        commentText,
      );
      if (verifyResult.isBlocked) {
        return { success: false, isBlocked: true };
      }
    }

    if (!verifyResult.isConfirmed) {
      logger.warn("Komentar belum terkonfirmasi terkirim pada postingan ini.");
      return { success: false, isBlocked: false };
    }

    await targetCommentBox
      .evaluate((el) => {
        const postContainer =
          el.closest(
            '[role="article"], [data-pagelet*="FeedUnit"], div[role="feed"] > div',
          ) || el.parentElement;
        if (postContainer) {
          postContainer.setAttribute("data-bot-commented", "true");
        }
      })
      .catch(() => {});

    if (accountId && selectedPostId) {
      await markCommentedHistory(accountId, selectedPostId);
    }

    await randomDelay(1200, 2000);
    await CommentGuard.closePostModalIfOpen(page);

    return { success: true, isBlocked: false };
  }

  /**
   * Menjalankan aksi komentar pada POSTINGAN ACAK di Beranda / Feed akun tersebut
   */
  static async postRandomFeedComments(account, options = {}) {
    const settings = await getSettings();
    const countToComment = options.count !== undefined ? options.count : 10;
    const isUnlimited = countToComment === 0 || countToComment === -1;
    const targetCountText = isUnlimited
      ? "🔥 Tanpa Batas (Non-Stop Loop)"
      : `${countToComment} komentar`;
    const template =
      options.commentTemplate ||
      "{Halo|Hai|Permisi} kak, {menarik sekali|luar biasa|bagus infonya}! {Salam sukses|Salam kenal ya}.";
    const shouldStop =
      typeof options.shouldStop === "function"
        ? options.shouldStop
        : () => false;
    const onProgress =
      typeof options.onProgress === "function" ? options.onProgress : null;

    logger.account(
      account.id,
      `Membuka Beranda Facebook untuk mencari postingan (Target: ${targetCountText})...`,
    );
    if (onProgress)
      await onProgress("START", {
        accountId: account.id,
        target: targetCountText,
      });

    let browserInstance;
    try {
      browserInstance = await createAccountBrowserContext(account, {
        headless:
          options.headless !== undefined
            ? options.headless
            : settings.browser.headless,
      });
    } catch (err) {
      logger.error(`[${account.id}] Gagal inisialisasi browser:`, err);
      return { success: false, error: err.message };
    }

    const { context, page, close } = browserInstance;
    const results = [];
    const processedSet = new Set();

    try {
      await page.goto("https://www.facebook.com/", {
        waitUntil: "domcontentloaded",
        timeout: 60000,
      });
      await randomDelay(4000, 6000);

      const isLogged = await CommentGuard.ensureLoggedIn(
        account,
        context,
        page,
      );
      if (!isLogged) {
        logger.warn(`[${account.id}] Akun belum berhasil login ke Facebook.`);
        await close();
        return { success: false, reason: "NOT_LOGGED_IN" };
      }

      logger.account(
        account.id,
        "Berhasil masuk ke Beranda Facebook. Mulai mencari postingan...",
      );
      if (onProgress) await onProgress("LOGGED_IN", { accountId: account.id });
      await randomDelay(2000, 4000);

      // Pastikan identitas yang digunakan sesuai pengaturan (Profil Pribadi atau Halaman)
      if (options.commentAs === "PAGE") {
        const switchRes = await ProfileSwitcher.ensureTargetProfile(
          page,
          "PAGE",
          options.targetPageName,
          onProgress,
          account.id,
        );
        if (!switchRes.success) {
          logger.error(
            `🛑 [${account.id}] Kampanye Beranda dibatalkan untuk akun ini karena tidak dapat beralih ke Halaman Facebook.`,
          );
          await close();
          return {
            success: false,
            reason: "PAGE_SWITCH_FAILED",
            totalCommented: 0,
          };
        }
        if (switchRes.name) {
          options.targetPageName = switchRes.name;
        }
      } else {
        await ProfileSwitcher.ensureTargetProfile(
          page,
          "PERSONAL",
          null,
          onProgress,
          account.id,
        );
      }

      // Pastikan kembali ke Beranda utama (facebook.com) setelah beralih peran
      await page.goto("https://www.facebook.com/", {
        waitUntil: "domcontentloaded",
        timeout: 45000,
      });
      await randomDelay(3000, 5000);

      let commentedCount = 0;
      let attempts = 0;
      let consecutiveFailures = 0;
      const MAX_CONSECUTIVE_FAILURES = 3;
      let isBlocked = false;
      let blockedReason = "";
      const maxAttempts = isUnlimited ? 999999 : countToComment * 25;

      while (
        (isUnlimited || commentedCount < countToComment) &&
        attempts < maxAttempts
      ) {
        if (shouldStop()) {
          logger.info(`[${account.id}] Bot dihentikan oleh pengguna (STOP).`);
          if (onProgress)
            await onProgress("STOPPED", {
              accountId: account.id,
              totalCommented: commentedCount,
            });
          break;
        }

        attempts++;
        await CommentGuard.closePostModalIfOpen(page);

        // Cek apakah akun terblokir
        if (await CommentGuard.checkIsActionBlocked(page)) {
          isBlocked = true;
          blockedReason = "Pop-up pembatasan / limit komentar Facebook";
          await markAccountLimited(account.id, blockedReason);
          logger.error(
            `🛑 [${account.id}] Terkena limit pembatasan komentar Facebook.`,
          );
          if (onProgress)
            await onProgress("ACTION_BLOCKED", {
              accountId: account.id,
              reason: blockedReason,
            });
          break;
        }

        const commentText = parseSpintax(template);
        const result = await FeedCommenter.executeCommentOnNextFeedPost(
          page,
          commentText,
          processedSet,
          settings.delays.minTypingDelayMs,
          settings.delays.maxTypingDelayMs,
          onProgress,
          account.id,
          {
            minComments: options.minComments || 0,
            maxComments: options.maxComments || 0,
            commentAs: options.commentAs,
            targetPageName: options.targetPageName,
          },
        );

        if (result.isBlocked) {
          isBlocked = true;
          blockedReason =
            "Terdeteksi pembatasan komentar Facebook: Tidak Ada Izin untuk Menambahkan Komentar / Limit Tercapai";
          await markAccountLimited(account.id, blockedReason);
          logger.error(`🛑 [${account.id}] ${blockedReason}.`);
          logger.error(
            `🛑 [${account.id}] Bot otomatis berhenti dan langsung menutup browser sekarang demi keamanan akun.`,
          );
          if (onProgress)
            await onProgress("ACTION_BLOCKED", {
              accountId: account.id,
              reason: blockedReason,
            });
          break;
        }

        if (result.skippedNotPage) {
          if (onProgress)
            await onProgress("SKIPPED_NOT_PAGE", { accountId: account.id });
          await randomDelay(2000, 3000);
          continue;
        }

        if (result.success) {
          consecutiveFailures = 0;
          commentedCount++;
          const progressText = isUnlimited
            ? `[${commentedCount} terkirim]`
            : `[${commentedCount}/${countToComment}]`;
          logger.success(
            `🎉 [${account.id}] ${progressText} [VALIDASI SUKSES] Komentar terkirim di feed: "${commentText}"`,
          );
          results.push({ success: true, comment: commentText });
          if (onProgress)
            await onProgress("COMMENT_SUCCESS", {
              accountId: account.id,
              progressText,
              commentText,
            });

          if (isUnlimited || commentedCount < countToComment) {
            const defaultPause = Math.floor(Math.random() * 8000) + 8000;
            const pauseMs = options.delaySeconds
              ? options.delaySeconds * 1000
              : defaultPause;
            logger.info(
              `Jeda aman ${Math.round(pauseMs / 1000)} detik sebelum postingan berikutnya...`,
            );
            if (onProgress)
              await onProgress("DELAY", {
                seconds: Math.round(pauseMs / 1000),
              });

            // Responsif terhadap stop signal setiap 500ms
            const step = 500;
            let waited = 0;
            while (waited < pauseMs) {
              if (shouldStop()) break;
              await sleep(step);
              waited += step;
            }
            if (shouldStop()) break;

            await page.evaluate(() => {
              window.scrollBy({
                top: Math.floor(window.innerHeight * 1.4),
                behavior: "smooth",
              });
            });
            await randomDelay(2500, 4500);
          }
        } else {
          consecutiveFailures++;
          logger.warn(
            `[${account.id}] Komentar pada postingan belum berhasil (Gagal ${consecutiveFailures}/${MAX_CONSECUTIVE_FAILURES}). Mencari postingan berikutnya...`,
          );
          if (onProgress)
            await onProgress("COMMENT_FAILED", {
              accountId: account.id,
              consecutiveFailures,
              maxFailures: MAX_CONSECUTIVE_FAILURES,
            });

          if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
            isBlocked = true;
            blockedReason = `Gagal mengirim komentar ${MAX_CONSECUTIVE_FAILURES}x berturut-turut di Beranda (Indikasi limit / shadowban Facebook)`;
            await markAccountLimited(account.id, blockedReason);
            logger.error(
              `🛑 [${account.id}] ${blockedReason}. Bot otomatis berhenti pada akun ini demi keamanan.`,
            );
            if (onProgress)
              await onProgress("ACTION_BLOCKED", {
                accountId: account.id,
                reason: blockedReason,
              });
            break;
          }

          await page.evaluate(() => {
            window.scrollBy({
              top: Math.floor(window.innerHeight * 0.9),
              behavior: "smooth",
            });
          });
          await randomDelay(2000, 3500);
        }
      }

      await close();
      return {
        success: commentedCount > 0 && !isBlocked,
        totalCommented: commentedCount,
        isBlocked,
        blockedReason,
        results,
      };
    } catch (err) {
      logger.error(`[${account.id}] Error saat komentar feed:`, err);
      await close().catch(() => {});
      return {
        success: false,
        error: err.message,
        isBlocked: false,
        totalCommented: 0,
      };
    }
  }

  /**
   * Menjalankan kampanye acak untuk semua akun di Beranda masing-masing
   */
  static async runRandomFeedCampaign(accounts, options = {}) {
    const settings = await getSettings();
    const activeAccounts = accounts.filter((acc) => acc.enabled !== false);
    const concurrency = options.concurrency || 1;

    logger.info(
      `🚀 Memulai kampanye komentar Beranda (${activeAccounts.length} akun, Concurrency: ${concurrency})...`,
    );
    const allResults = [];
    let currentIndex = 0;

    const worker = async (workerId) => {
      while (currentIndex < activeAccounts.length) {
        if (options.shouldStop && options.shouldStop()) break;

        const accIdx = currentIndex++;
        const account = activeAccounts[accIdx];
        logger.info(
          `[Worker ${workerId}] Memproses Akun: ${account.name || account.id}`,
        );

        const res = await FeedCommenter.postRandomFeedComments(account, {
          count: options.count,
          commentTemplate: options.commentTemplate,
          delaySeconds: options.delaySeconds,
          commentAs: options.commentAs,
          targetPageName: options.targetPageName,
          headless: options.headless,
          minComments: options.minComments,
          maxComments: options.maxComments,
          shouldStop: options.shouldStop,
          onProgress: options.onProgress,
        });

        allResults[accIdx] = { accountId: account.id, ...res };

        if (
          concurrency === 1 &&
          accIdx < activeAccounts.length - 1 &&
          (!options.shouldStop || !options.shouldStop())
        ) {
          const delayTime =
            Math.floor(
              Math.random() *
                (settings.delays.maxBetweenAccountsDelayMs -
                  settings.delays.minBetweenAccountsDelayMs +
                  1),
            ) + settings.delays.minBetweenAccountsDelayMs;
          logger.info(
            `Menunggu jeda keamanan ${Math.round(delayTime / 1000)} detik...`,
          );
          await sleep(delayTime);
        }
      }
    };

    const workerPromises = Array.from(
      { length: Math.min(concurrency, activeAccounts.length) },
      (_, i) => worker(i + 1),
    );
    await Promise.all(workerPromises);

    logger.success("\n🎉 Kampanye komentar Beranda selesai!");
    return allResults;
  }
}
