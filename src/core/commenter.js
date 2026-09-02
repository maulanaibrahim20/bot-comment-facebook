import path from 'path';
import chalk from 'chalk';
import { createAccountBrowserContext } from '../browser.js';
import { paths, getSettings } from '../config.js';
import { logger } from '../utils/logger.js';
import { parseSpintax } from '../utils/spintax.js';
import { randomDelay, sleep, typeHumanLike, humanMouseMove, humanScroll } from '../utils/delay.js';
import { SessionManager } from './sessionManager.js';

export class Commenter {
  /**
   * Memastikan browser dalam keadaan login. Jika belum, lakukan login otomatis di tempat.
   */
  static async ensureLoggedIn(account, context, page) {
    const isLoggedIn = await SessionManager.checkIsLoggedIn(context, page);
    if (isLoggedIn) return true;

    logger.account(account.id, 'Sesi belum login atau logout. Melakukan login otomatis sekarang...');

    // Tangani cookie popup jika ada
    const cookieButtons = [
      'button[data-cookiebanner="accept_button"]',
      'button[title="Only allow essential cookies"]',
      'button[title="Izinkan semua cookie"]',
      'button[title="Allow all cookies"]',
      'button:has-text("Izinkan semua cookie")',
      'button:has-text("Allow all cookies")'
    ];
    for (const btnSelector of cookieButtons) {
      const btn = page.locator(btnSelector).first();
      if (await btn.isVisible().catch(() => false)) {
        await btn.click({ force: true }).catch(() => {});
        await randomDelay(1000, 2000);
        break;
      }
    }

    const emailInput = page.locator('input[name="email"], input[id="email"], input[type="text"]').first();
    if (await emailInput.isVisible().catch(() => false)) {
      await emailInput.click({ force: true });
      await emailInput.fill('');
      await typeHumanLike(page, emailInput, account.username);
      await randomDelay(500, 1000);

      const passInput = page.locator('input[name="pass"], input[id="pass"], input[type="password"]').first();
      await passInput.click({ force: true });
      await passInput.fill('');
      await typeHumanLike(page, passInput, account.password);
      await randomDelay(600, 1200);

      const loginBtn = page.locator('button[name="login"], button[type="submit"], input[type="submit"], button:has-text("Masuk"), button:has-text("Log In")').first();
      if (await loginBtn.isVisible().catch(() => false)) {
        await loginBtn.click({ force: true }).catch(() => {});
      } else {
        await passInput.press('Enter');
      }

      await randomDelay(5000, 8000);
    }

    return await SessionManager.checkIsLoggedIn(context, page);
  }

  /**
   * Menutup otomatis popup modal postingan / lightbox dialog jika terbuka saat scrolling feed
   */
  static async closePostModalIfOpen(page) {
    try {
      const dialog = page.locator('div[role="dialog"]').first();
      const isDialogVisible = await dialog.isVisible().catch(() => false);

      if (isDialogVisible) {
        const closeButtons = [
          'div[role="dialog"] div[aria-label*="Tutup" i]',
          'div[role="dialog"] div[aria-label*="Close" i]',
          'div[aria-label="Tutup"]',
          'div[aria-label="Close"]',
          'div[aria-label="Kembali"]',
          'div[role="button"][aria-label*="Tutup"]'
        ];

        for (const sel of closeButtons) {
          const btn = page.locator(sel).first();
          if (await btn.isVisible().catch(() => false)) {
            await btn.click({ force: true }).catch(() => {});
            await randomDelay(600, 1200);
            break;
          }
        }

        await page.keyboard.press('Escape');
        await randomDelay(600, 1200);
      }
    } catch (e) {}
  }

  /**
   * Mendeteksi jika akun terkena pembatasan sementara / spam block dari Facebook
   */
  static async checkIsActionBlocked(page) {
    const blockSelectors = [
      'text="Anda Tidak Dapat Menggunakan Fitur Ini Sekarang"',
      'text="Kami membatasi seberapa sering Anda dapat memposting"',
      'text="You Can\'t Use This Feature Right Now"',
      'text="Tidak bisa memposting komentar"',
      'text="Tindakan Anda Dibatasi"',
      'text="You’re Temporarily Blocked"',
      'text="Your request couldn\'t be processed"',
      'div[role="dialog"]:has-text("Anda Tidak Dapat Menggunakan Fitur Ini Sekarang")'
    ];

    for (const sel of blockSelectors) {
      const el = page.locator(sel).first();
      if (await el.isVisible().catch(() => false)) {
        // Klik tombol OK pada popup dialog pembatasan jika ada
        const okBtn = page.locator('div[role="dialog"] button:has-text("OK"), div[role="dialog"] div[role="button"]:has-text("OK"), button:has-text("OK")').first();
        if (await okBtn.isVisible().catch(() => false)) {
          await okBtn.click({ force: true }).catch(() => {});
          await randomDelay(1000, 1500);
        }
        return true;
      }
    }

    return false;
  }

  /**
   * Memastikan drawer / panel komentar pada Facebook Reels dalam keadaan terbuka
   */
  static async ensureReelCommentDrawerOpen(page) {
    // 1. Cek apakah kotak input komentar sudah terlihat
    let commentBox = page.locator('div[role="textbox"][contenteditable="true"], div[data-lexical-editor="true"], div[aria-label*="Tulis komentar" i], div[aria-label*="Write a comment" i]').first();
    if (await commentBox.isVisible().catch(() => false)) {
      return commentBox;
    }

    // 2. Cari tombol pemicu komentar di bilah aksi samping video Reels
    const triggerSelectors = [
      'div[role="button"][aria-label*="Komentar" i]',
      'div[role="button"][aria-label*="Comment" i]',
      'div[aria-label*="Komentar" i][role="button"]',
      'div[aria-label*="Comment" i][role="button"]',
      'div[aria-label*="Lihat komentar" i]',
      'div[aria-label*="View comments" i]',
      'div[aria-label="Komentar"]',
      'div[aria-label="Comments"]',
      'div[aria-label="Beri komentar"]',
      'div[aria-label="Tulis komentar"]',
      'div[role="button"]:has(span:has-text("Komentar"))',
      'span:text-is("Komentar")',
      'span:text-is("Comments")'
    ];

    for (const sel of triggerSelectors) {
      const btn = page.locator(sel).first();
      if (await btn.isVisible().catch(() => false)) {
        logger.info(`Membuka panel komentar Reels via tombol: ${sel}`);
        await humanMouseMove(page, btn);
        await btn.click({ force: true }).catch(() => {});
        await randomDelay(1500, 2500);

        commentBox = page.locator('div[role="textbox"][contenteditable="true"], div[data-lexical-editor="true"], div[aria-label*="Tulis komentar" i], div[aria-label*="Write a comment" i]').first();
        if (await commentBox.isVisible().catch(() => false)) {
          return commentBox;
        }
      }
    }

    // 3. Fallback: Cari di tombol-tombol ikon di area player Reels
    const actionButtons = page.locator('div[role="main"] div[role="button"]:has(svg)');
    const count = await actionButtons.count();
    for (let i = 0; i < count; i++) {
      const btn = actionButtons.nth(i);
      if (await btn.isVisible().catch(() => false)) {
        const label = (await btn.getAttribute('aria-label').catch(() => '')) || '';
        if (label.toLowerCase().includes('komentar') || label.toLowerCase().includes('comment') || label === '') {
          await btn.click({ force: true }).catch(() => {});
          await randomDelay(1500, 2500);
          commentBox = page.locator('div[role="textbox"][contenteditable="true"], div[data-lexical-editor="true"]').first();
          if (await commentBox.isVisible().catch(() => false)) {
            return commentBox;
          }
        }
      }
    }

    return null;
  }

  /**
   * Berpindah secara pasti ke video Reel berikutnya (Next Reel Transition)
   */
  static async goToNextReel(page) {
    const initialUrl = page.url();

    // 1. Klik area video sebelah kiri untuk melepaskan fokus dari textbox (JANGAN tekan Escape agar panel komentar tetap terbuka)
    await page.mouse.click(300, 350).catch(() => {});
    await randomDelay(500, 1000);

    // 2. Coba klik tombol "Reel berikutnya" / "Next Reel" jika ada di UI
    const nextButtons = [
      'div[aria-label*="Reel berikutnya" i]',
      'div[aria-label*="Next Reel" i]',
      'div[aria-label*="Video berikutnya" i]',
      'div[aria-label*="Next card" i]',
      'div[aria-label*="Kartu berikutnya" i]',
      'div[role="button"][aria-label*="berikutnya" i]',
      'div[role="button"][aria-label*="next" i]'
    ];

    for (const sel of nextButtons) {
      const btn = page.locator(sel).first();
      if (await btn.isVisible().catch(() => false)) {
        await humanMouseMove(page, btn);
        await btn.click({ force: true }).catch(() => {});
        await randomDelay(1500, 2500);
        break;
      }
    }

    // 3. Gunakan Wheel Scroll & Keyboard di video player
    if (page.url() === initialUrl) {
      await page.mouse.move(400, 400);
      await page.mouse.wheel(0, 1200);
      await randomDelay(1200, 2200);
    }

    if (page.url() === initialUrl) {
      await page.keyboard.press('PageDown');
      await randomDelay(1200, 2200);
    }

    if (page.url() === initialUrl) {
      await page.keyboard.press('ArrowDown');
      await randomDelay(1200, 2200);
    }

    // 4. Jika tetap belum berubah, scroll window secara halus
    if (page.url() === initialUrl) {
      await page.evaluate(() => {
        window.scrollBy({ top: window.innerHeight * 1.2, behavior: 'smooth' });
      });
      await randomDelay(2000, 3000);
    }

    const changed = page.url() !== initialUrl;
    if (changed) {
      logger.info(`Berhasil berpindah ke Reel berikutnya: ${page.url()}`);
    } else {
      logger.account('Mencoba scroll paksa ke Reel berikutnya...');
      await page.mouse.wheel(0, 1600);
      await randomDelay(1500, 2500);
    }

    return changed;
  }

  /**
   * Validasi apakah komentar BENAR-BENAR telah terkirim dan diterima oleh Facebook
   */
  static async verifyCommentSubmitted(page, targetCommentBox, commentText) {
    if (await Commenter.checkIsActionBlocked(page)) {
      return { isConfirmed: false, isBlocked: true };
    }

    let isBoxCleared = false;
    if (targetCommentBox) {
      const remainingText = await targetCommentBox.innerText().catch(() => '');
      const sampleSnippet = commentText.length > 15 ? commentText.substring(0, 15) : commentText;
      if (!remainingText || remainingText.trim() === '' || !remainingText.includes(sampleSnippet)) {
        isBoxCleared = true;
      }
    }

    const searchSnippet = commentText.length > 25 ? commentText.substring(0, 25) : commentText;
    const commentRendered = page.locator(`text="${searchSnippet}", span:has-text("${searchSnippet}"), a[href*="whatsapp.com"], div:has-text("Baru saja"), div:has-text("Just now")`).first();
    const isCommentVisible = await commentRendered.isVisible().catch(() => false);

    return {
      isConfirmed: isBoxCleared || isCommentVisible,
      isBlocked: false
    };
  }

  /**
   * Menemukan tombol komentar pada postingan baru di Beranda (Feed), mengetikkan teks, memvalidasi pengiriman, dan menutup modal
   */
  static async executeCommentOnNextFeedPost(page, commentText, processedSet, minDelay, maxDelay, onProgress) {
    await Commenter.closePostModalIfOpen(page);

    // Cek apakah akun terblokir
    if (await Commenter.checkIsActionBlocked(page)) {
      return { success: false, isBlocked: true };
    }

    const commentTriggers = page.locator([
      'div[role="button"]:has-text("Komentari")',
      'div[role="button"]:has-text("Comment")',
      'div[aria-label*="Tinggalkan komentar" i]',
      'div[aria-label*="Beri komentar" i]',
      'div[aria-label*="Leave a comment" i]',
      'div[aria-label*="Komentari" i]',
      'span:text-is("Komentari")',
      'span:text-is("Comment")'
    ].join(', '));

    const triggerCount = await commentTriggers.count();
    let selectedTrigger = null;

    for (let i = 0; i < triggerCount; i++) {
      const trigger = commentTriggers.nth(i);
      const isVisible = await trigger.isVisible().catch(() => false);
      if (!isVisible) continue;

      const postInfo = await trigger.evaluate((el) => {
        const post = el.closest('[role="article"], [data-pagelet*="FeedUnit"], div[role="feed"] > div');
        if (!post) return { isTagged: false, id: null };
        const isTagged = post.getAttribute('data-bot-commented') === 'true';
        const textSample = post.innerText ? post.innerText.substring(0, 100).replace(/\s+/g, ' ') : '';
        return { isTagged, id: textSample };
      }).catch(() => ({ isTagged: false, id: null }));

      if (postInfo.isTagged || (postInfo.id && processedSet.has(postInfo.id))) {
        continue;
      }

      selectedTrigger = trigger;
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

    const commentBoxes = page.locator('div[role="textbox"][contenteditable="true"], div[data-lexical-editor="true"], div[aria-label*="Tulis komentar" i], div[aria-label*="Write a comment" i], div[role="textbox"]');
    const boxCount = await commentBoxes.count();
    let targetCommentBox = null;

    for (let i = 0; i < boxCount; i++) {
      const box = commentBoxes.nth(i);
      const isVisible = await box.isVisible().catch(() => false);
      if (!isVisible) continue;

      const isAlreadyCommented = await box.evaluate((el) => {
        const parent = el.closest('[data-bot-commented="true"]');
        return !!parent;
      }).catch(() => false);

      if (!isAlreadyCommented) {
        targetCommentBox = box;
        break;
      }
    }

    if (!targetCommentBox) {
      return { success: false, isBlocked: false };
    }

    await targetCommentBox.scrollIntoViewIfNeeded().catch(() => {});
    await randomDelay(500, 1000);
    await humanMouseMove(page, targetCommentBox);
    await targetCommentBox.click({ force: true });
    await randomDelay(800, 1500);

    logger.info(`Mengetikkan komentar: "${commentText}"`);
    if (onProgress) await onProgress('TYPING', { commentText });

    await typeHumanLike(page, targetCommentBox, commentText, minDelay, maxDelay);
    await randomDelay(1500, 2500);

    await page.keyboard.press('Enter');
    await randomDelay(2500, 3500);

    let verifyResult = await Commenter.verifyCommentSubmitted(page, targetCommentBox, commentText);
    if (verifyResult.isBlocked) {
      return { success: false, isBlocked: true };
    }

    if (!verifyResult.isConfirmed) {
      const sendBtn = page.locator([
        'div[aria-label="Komentari" i]',
        'div[aria-label="Comment" i]',
        'div[aria-label="Kirim" i]',
        'div[aria-label*="Enter untuk mengirim" i]',
        'div[aria-label*="Press Enter to post" i]',
        'div[role="button"][aria-label*="Komentari" i]'
      ].join(', ')).first();

      if (await sendBtn.isVisible().catch(() => false)) {
        await humanMouseMove(page, sendBtn);
        await sendBtn.click({ force: true }).catch(() => {});
        await randomDelay(2500, 4000);
      } else {
        await page.keyboard.press('Enter');
        await randomDelay(2000, 3500);
      }

      verifyResult = await Commenter.verifyCommentSubmitted(page, targetCommentBox, commentText);
      if (verifyResult.isBlocked) {
        return { success: false, isBlocked: true };
      }
    }

    if (!verifyResult.isConfirmed) {
      logger.warn('Komentar belum terkonfirmasi terkirim pada postingan ini.');
      return { success: false, isBlocked: false };
    }

    await targetCommentBox.evaluate((el) => {
      const postContainer = el.closest('[role="article"], [data-pagelet*="FeedUnit"], div[role="feed"] > div') || el.parentElement;
      if (postContainer) {
        postContainer.setAttribute('data-bot-commented', 'true');
      }
    }).catch(() => {});

    await randomDelay(1200, 2000);
    await Commenter.closePostModalIfOpen(page);

    return { success: true, isBlocked: false };
  }

  /**
   * Menjalankan aksi komentar pada POSTINGAN ACAK di Beranda / Feed akun tersebut
   */
  static async postRandomFeedComments(account, options = {}) {
    const settings = getSettings();
    const countToComment = options.count !== undefined ? options.count : 10;
    const isUnlimited = (countToComment === 0 || countToComment === -1);
    const targetCountText = isUnlimited ? '🔥 Tanpa Batas (Non-Stop Loop)' : `${countToComment} komentar`;
    const template = options.commentTemplate || '{Halo|Hai|Permisi} kak, {menarik sekali|luar biasa|bagus infonya}! {Salam sukses|Salam kenal ya}.';
    const shouldStop = typeof options.shouldStop === 'function' ? options.shouldStop : () => false;
    const onProgress = typeof options.onProgress === 'function' ? options.onProgress : null;

    logger.account(account.id, `Membuka Beranda Facebook untuk mencari postingan (Target: ${targetCountText})...`);
    if (onProgress) await onProgress('START', { accountId: account.id, target: targetCountText });

    let browserInstance;
    try {
      browserInstance = await createAccountBrowserContext(account, {
        headless: options.headless !== undefined ? options.headless : settings.browser.headless
      });
    } catch (err) {
      logger.error(`[${account.id}] Gagal inisialisasi browser:`, err);
      return { success: false, error: err.message };
    }

    const { context, page, close } = browserInstance;
    const results = [];
    const processedSet = new Set();

    try {
      await page.goto('https://www.facebook.com/', { waitUntil: 'domcontentloaded', timeout: 60000 });
      await randomDelay(4000, 6000);

      const isLogged = await Commenter.ensureLoggedIn(account, context, page);
      if (!isLogged) {
        logger.warn(`[${account.id}] Akun belum berhasil login ke Facebook.`);
        await close();
        return { success: false, reason: 'NOT_LOGGED_IN' };
      }

      logger.account(account.id, 'Berhasil masuk ke Beranda Facebook. Mulai mencari postingan...');
      if (onProgress) await onProgress('LOGGED_IN', { accountId: account.id });
      await randomDelay(2000, 4000);

      let commentedCount = 0;
      let attempts = 0;
      const maxAttempts = isUnlimited ? 999999 : (countToComment * 25);

      while ((isUnlimited || commentedCount < countToComment) && attempts < maxAttempts) {
        if (shouldStop()) {
          logger.info(`[${account.id}] Bot dihentikan oleh pengguna (STOP).`);
          if (onProgress) await onProgress('STOPPED', { accountId: account.id, totalCommented: commentedCount });
          break;
        }

        attempts++;
        await Commenter.closePostModalIfOpen(page);

        // Cek apakah akun terblokir
        if (await Commenter.checkIsActionBlocked(page)) {
          logger.error(`🛑 [${account.id}] Terkena limit pembatasan komentar Facebook.`);
          if (onProgress) await onProgress('ACTION_BLOCKED', { accountId: account.id });
          break;
        }

        const commentText = parseSpintax(template);
        const result = await Commenter.executeCommentOnNextFeedPost(
          page,
          commentText,
          processedSet,
          settings.delays.minTypingDelayMs,
          settings.delays.maxTypingDelayMs,
          onProgress
        );

        if (result.isBlocked) {
          logger.error(`🛑 [${account.id}] Terkena limit pembatasan komentar Facebook.`);
          if (onProgress) await onProgress('ACTION_BLOCKED', { accountId: account.id });
          break;
        }

        if (result.success) {
          commentedCount++;
          const progressText = isUnlimited ? `[${commentedCount} terkirim]` : `[${commentedCount}/${countToComment}]`;
          logger.success(`🎉 [${account.id}] ${progressText} [VALIDASI SUKSES] Komentar terkirim di feed: "${commentText}"`);
          results.push({ success: true, comment: commentText });
          if (onProgress) await onProgress('COMMENT_SUCCESS', { accountId: account.id, progressText, commentText });

          if (isUnlimited || commentedCount < countToComment) {
            const defaultPause = Math.floor(Math.random() * 8000) + 8000;
            const pauseMs = options.delaySeconds ? (options.delaySeconds * 1000) : defaultPause;
            logger.info(`Jeda aman ${Math.round(pauseMs / 1000)} detik sebelum postingan berikutnya...`);
            if (onProgress) await onProgress('DELAY', { seconds: Math.round(pauseMs / 1000) });

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
              window.scrollBy({ top: Math.floor(window.innerHeight * 1.4), behavior: 'smooth' });
            });
            await randomDelay(2500, 4500);
          }
        } else {
          logger.account(account.id, 'Mencari postingan berikutnya di feed...');
          await page.evaluate(() => {
            window.scrollBy({ top: Math.floor(window.innerHeight * 0.9), behavior: 'smooth' });
          });
          await randomDelay(2000, 3500);
        }
      }

      await close();
      return { success: commentedCount > 0, totalCommented: commentedCount, results };
    } catch (err) {
      logger.error(`[${account.id}] Error saat komentar feed:`, err);
      await close().catch(() => {});
      return { success: false, error: err.message };
    }
  }

  /**
   * Menjalankan aksi komentar pada FACEBOOK REELS dengan step-by-step progress & interruptible stop
   */
  static async postRandomReelsComments(account, options = {}) {
    const settings = getSettings();
    const countToComment = options.count !== undefined ? options.count : 10;
    const isUnlimited = (countToComment === 0 || countToComment === -1);
    const targetCountText = isUnlimited ? '🔥 Tanpa Batas (Non-Stop Loop)' : `${countToComment} Reels`;
    const template = options.commentTemplate || '{Halo|Hai|Permisi} kak, {keren banget videonya|menarik sekali|suka videonya}! {Salam sukses ya}.';
    const shouldStop = typeof options.shouldStop === 'function' ? options.shouldStop : () => false;
    const onProgress = typeof options.onProgress === 'function' ? options.onProgress : null;

    logger.account(account.id, `Membuka Facebook Reels untuk berkomentar (Target: ${targetCountText})...`);
    if (onProgress) await onProgress('START', { accountId: account.id, target: targetCountText });

    let browserInstance;
    try {
      browserInstance = await createAccountBrowserContext(account, {
        headless: options.headless !== undefined ? options.headless : settings.browser.headless
      });
    } catch (err) {
      logger.error(`[${account.id}] Gagal inisialisasi browser:`, err);
      return { success: false, error: err.message };
    }

    const { context, page, close } = browserInstance;
    const results = [];
    const processedReels = new Set();

    try {
      await page.goto('https://www.facebook.com/reel/', { waitUntil: 'domcontentloaded', timeout: 60000 });
      await randomDelay(4000, 6000);

      const isLogged = await Commenter.ensureLoggedIn(account, context, page);
      if (!isLogged) {
        logger.warn(`[${account.id}] Akun belum berhasil login ke Facebook.`);
        await close();
        return { success: false, reason: 'NOT_LOGGED_IN' };
      }

      if (!page.url().includes('/reel/')) {
        await page.goto('https://www.facebook.com/reel/', { waitUntil: 'domcontentloaded' });
        await randomDelay(3000, 5000);
      }

      logger.account(account.id, 'Berhasil masuk ke Facebook Reels! Mulai memutar dan mengomentari Reels...');
      if (onProgress) await onProgress('LOGGED_IN', { accountId: account.id });
      await randomDelay(2000, 4000);

      let commentedCount = 0;
      let reelIndex = 0;
      const maxReelAttempts = isUnlimited ? 999999 : (countToComment * 20);

      while ((isUnlimited || commentedCount < countToComment) && reelIndex < maxReelAttempts) {
        if (shouldStop()) {
          logger.info(`[${account.id}] Bot dihentikan oleh pengguna (STOP).`);
          if (onProgress) await onProgress('STOPPED', { accountId: account.id, totalCommented: commentedCount });
          break;
        }

        reelIndex++;
        const currentUrl = page.url();
        logger.account(account.id, `Sedang menonton Reel #${reelIndex}: ${currentUrl}`);
        if (onProgress) await onProgress('WATCHING_REEL', { accountId: account.id, url: currentUrl, reelIndex });

        // Cek apakah akun terblokir
        if (await Commenter.checkIsActionBlocked(page)) {
          logger.error(`🛑 [${account.id}] Terkena limit pembatasan komentar Facebook.`);
          if (onProgress) await onProgress('ACTION_BLOCKED', { accountId: account.id });
          break;
        }

        if (!processedReels.has(currentUrl)) {
          processedReels.add(currentUrl);

          // 1. Pastikan laci komentar terbuka
          const commentBox = await Commenter.ensureReelCommentDrawerOpen(page);

          // 2. Ketik dan kirim komentar pada Reel ini
          if (commentBox) {
            const commentText = parseSpintax(template);
            logger.info(`Mengetikkan komentar pada Reel: "${commentText}"`);
            if (onProgress) await onProgress('TYPING', { accountId: account.id, commentText });

            await commentBox.scrollIntoViewIfNeeded().catch(() => {});
            await commentBox.click({ force: true });
            await randomDelay(600, 1200);

            await typeHumanLike(page, commentBox, commentText, settings.delays.minTypingDelayMs, settings.delays.maxTypingDelayMs);
            await randomDelay(1200, 2200);

            if (shouldStop()) break;

            // Tekan Enter untuk submit
            await page.keyboard.press('Enter');
            await randomDelay(2500, 3500);

            // Cek tombol kirim jika teks masih tertinggal
            let verifyResult = await Commenter.verifyCommentSubmitted(page, commentBox, commentText);
            if (verifyResult.isBlocked) {
              logger.error(`🛑 [${account.id}] Terkena limit pembatasan komentar Facebook.`);
              if (onProgress) await onProgress('ACTION_BLOCKED', { accountId: account.id });
              break;
            }

            if (!verifyResult.isConfirmed) {
              const sendBtn = page.locator('div[aria-label="Komentari" i], div[aria-label="Comment" i], div[aria-label="Kirim" i], div[role="button"][aria-label*="Komentari" i]').first();
              if (await sendBtn.isVisible().catch(() => false)) {
                await sendBtn.click({ force: true }).catch(() => {});
                await randomDelay(2500, 3500);
              }
              verifyResult = await Commenter.verifyCommentSubmitted(page, commentBox, commentText);
              if (verifyResult.isBlocked) {
                logger.error(`🛑 [${account.id}] Terkena limit pembatasan komentar Facebook.`);
                if (onProgress) await onProgress('ACTION_BLOCKED', { accountId: account.id });
                break;
              }
            }

            if (verifyResult.isConfirmed) {
              commentedCount++;
              const progressText = isUnlimited ? `[${commentedCount} terkirim]` : `[${commentedCount}/${countToComment}]`;
              logger.success(`🎉 [${account.id}] ${progressText} [VALIDASI SUKSES] Komentar di Reel: "${commentText}"`);
              results.push({ success: true, url: currentUrl, comment: commentText });
              if (onProgress) await onProgress('COMMENT_SUCCESS', { accountId: account.id, progressText, commentText, url: currentUrl });

              if (isUnlimited || commentedCount < countToComment) {
                const defaultPause = Math.floor(Math.random() * 8000) + 8000;
                const pauseMs = options.delaySeconds ? (options.delaySeconds * 1000) : defaultPause;
                logger.info(`Jeda aman ${Math.round(pauseMs / 1000)} detik sebelum berpindah ke Reel berikutnya...`);
                if (onProgress) await onProgress('DELAY', { seconds: Math.round(pauseMs / 1000) });

                // Responsif terhadap stop signal setiap 500ms
                const step = 500;
                let waited = 0;
                while (waited < pauseMs) {
                  if (shouldStop()) break;
                  await sleep(step);
                  waited += step;
                }
                if (shouldStop()) break;
              }
            } else {
              logger.warn(`Komentar pada Reel ini belum terkonfirmasi terkirim.`);
            }
          } else {
            logger.warn('Tombol atau laci komentar pada Reel ini tidak dapat ditemukan.');
          }
        }

        if (shouldStop()) break;

        // 3. PINDAH KE REEL BERIKUTNYA
        logger.account(account.id, 'Berpindah ke video Reel berikutnya (Next Reel)...');
        if (onProgress) await onProgress('NEXT_REEL', { accountId: account.id });
        await Commenter.goToNextReel(page);
      }

      await close();
      return { success: commentedCount > 0, totalCommented: commentedCount, results };
    } catch (err) {
      logger.error(`[${account.id}] Terjadi kesalahan saat komentar di Facebook Reels:`, err);
      await close().catch(() => {});
      return { success: false, error: err.message };
    }
  }

  /**
   * Menjalankan kampanye acak untuk semua akun di Facebook Reels
   */
  static async runRandomReelsCampaign(accounts, options = {}) {
    const settings = getSettings();
    const activeAccounts = accounts.filter((acc) => acc.enabled !== false);
    const concurrency = options.concurrency || 1;

    logger.info(`🎬 Memulai kampanye komentar Facebook REELS (${activeAccounts.length} akun, Concurrency: ${concurrency})...`);
    const allResults = [];
    let currentIndex = 0;

    const worker = async (workerId) => {
      while (currentIndex < activeAccounts.length) {
        if (options.shouldStop && options.shouldStop()) break;

        const accIdx = currentIndex++;
        const account = activeAccounts[accIdx];
        logger.info(`[Worker ${workerId}] Memproses Reels untuk Akun: ${account.name || account.id}`);

        const res = await Commenter.postRandomReelsComments(account, {
          count: options.count,
          commentTemplate: options.commentTemplate,
          delaySeconds: options.delaySeconds,
          headless: options.headless,
          shouldStop: options.shouldStop,
          onProgress: options.onProgress
        });

        allResults[accIdx] = { accountId: account.id, ...res };

        if (concurrency === 1 && accIdx < activeAccounts.length - 1 && (!options.shouldStop || !options.shouldStop())) {
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

    logger.success('\n🎉 Kampanye komentar Facebook Reels selesai!');
    return allResults;
  }

  /**
   * Menjalankan kampanye acak untuk semua akun di Beranda masing-masing
   */
  static async runRandomFeedCampaign(accounts, options = {}) {
    const settings = getSettings();
    const activeAccounts = accounts.filter((acc) => acc.enabled !== false);
    const concurrency = options.concurrency || 1;

    logger.info(`🚀 Memulai kampanye komentar Beranda (${activeAccounts.length} akun, Concurrency: ${concurrency})...`);
    const allResults = [];
    let currentIndex = 0;

    const worker = async (workerId) => {
      while (currentIndex < activeAccounts.length) {
        if (options.shouldStop && options.shouldStop()) break;

        const accIdx = currentIndex++;
        const account = activeAccounts[accIdx];
        logger.info(`[Worker ${workerId}] Memproses Akun: ${account.name || account.id}`);

        const res = await Commenter.postRandomFeedComments(account, {
          count: options.count,
          commentTemplate: options.commentTemplate,
          delaySeconds: options.delaySeconds,
          headless: options.headless,
          shouldStop: options.shouldStop,
          onProgress: options.onProgress
        });

        allResults[accIdx] = { accountId: account.id, ...res };

        if (concurrency === 1 && accIdx < activeAccounts.length - 1 && (!options.shouldStop || !options.shouldStop())) {
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

    logger.success('\n🎉 Kampanye komentar Beranda selesai!');
    return allResults;
  }

  /**
   * Menjalankan aksi komentar untuk 1 akun pada 1 target postingan spesifik (URL)
   */
  static async postComment(account, target, options = {}) {
    const settings = getSettings();
    const commentText = parseSpintax(target.commentTemplate);
    logger.account(account.id, `Mempersiapkan komentar: "${commentText}"`);

    const { context, page, close } = await createAccountBrowserContext(account, {
      headless: options.headless !== undefined ? options.headless : settings.browser.headless
    });

    try {
      logger.account(account.id, `Membuka target postingan: ${target.postUrl}`);
      await page.goto(target.postUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await randomDelay(3000, 5000);

      await Commenter.ensureLoggedIn(account, context, page);
      await Commenter.closePostModalIfOpen(page);

      await humanScroll(page, 2);
      await randomDelay(1500, 3000);

      const processedSet = new Set();
      const result = await Commenter.executeCommentOnNextFeedPost(
        page,
        commentText,
        processedSet,
        settings.delays.minTypingDelayMs,
        settings.delays.maxTypingDelayMs,
        options.onProgress
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
    const settings = getSettings();
    const activeAccounts = accounts.filter((acc) => acc.enabled !== false);
    const targetsList = Array.isArray(targets) ? targets : [targets];
    const activeTargets = targetsList.filter((t) => t.active !== false);
    const concurrency = options.concurrency || 1;

    if (activeAccounts.length === 0 || activeTargets.length === 0) {
      logger.warn('Tidak ada akun atau target aktif yang ditemukan.');
      return;
    }

    logger.info(`🚀 Memulai kampanye komentar (${activeAccounts.length} akun ke ${activeTargets.length} target, Concurrency: ${concurrency})...`);
    const results = [];

    for (const target of activeTargets) {
      logger.info(`\n================== [TARGET: ${target.description || target.postUrl}] ==================`);
      let currentIndex = 0;

      const worker = async (workerId) => {
        while (currentIndex < activeAccounts.length) {
          const accIdx = currentIndex++;
          const account = activeAccounts[accIdx];
          logger.info(`[Worker ${workerId}] Akun: ${account.name || account.id}`);

          const res = await Commenter.postComment(account, target, options);
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
