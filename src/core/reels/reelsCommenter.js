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
 * Modul Komentar Facebook Reels
 * Menangani navigasi antarmuka Reels, laci komentar Reels, transisi video berikutnya, deteksi kepemilikan, dan kampanye Reels.
 */
export class ReelsCommenter {
  /**
   * Memastikan drawer / panel komentar pada Facebook Reels dalam keadaan terbuka
   */
  static async ensureReelCommentDrawerOpen(page) {
    // 1. Cek apakah kotak input komentar sudah terlihat
    let commentBox = page
      .locator(
        'div[role="textbox"][contenteditable="true"], div[data-lexical-editor="true"], div[aria-label*="Tulis komentar" i], div[aria-label*="Write a comment" i]',
      )
      .first();
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
      'span:text-is("Comments")',
    ];

    for (const sel of triggerSelectors) {
      const btn = page.locator(sel).first();
      if (await btn.isVisible().catch(() => false)) {
        logger.info(`Membuka panel komentar Reels via tombol: ${sel}`);
        await humanMouseMove(page, btn);
        await btn.click({ force: true }).catch(() => {});
        await randomDelay(1500, 2500);

        commentBox = page
          .locator(
            'div[role="textbox"][contenteditable="true"], div[data-lexical-editor="true"], div[aria-label*="Tulis komentar" i], div[aria-label*="Write a comment" i]',
          )
          .first();
        if (await commentBox.isVisible().catch(() => false)) {
          return commentBox;
        }
      }
    }

    // 3. Fallback: Cari di tombol-tombol ikon di area player Reels
    const actionButtons = page.locator(
      'div[role="main"] div[role="button"]:has(svg)',
    );
    const count = await actionButtons.count();
    for (let i = 0; i < count; i++) {
      const btn = actionButtons.nth(i);
      if (await btn.isVisible().catch(() => false)) {
        const label =
          (await btn.getAttribute("aria-label").catch(() => "")) || "";
        if (
          label.toLowerCase().includes("komentar") ||
          label.toLowerCase().includes("comment") ||
          label === ""
        ) {
          await btn.click({ force: true }).catch(() => {});
          await randomDelay(1500, 2500);
          commentBox = page
            .locator(
              'div[role="textbox"][contenteditable="true"], div[data-lexical-editor="true"]',
            )
            .first();
          if (await commentBox.isVisible().catch(() => false)) {
            return commentBox;
          }
        }
      }
    }

    return null;
  }

  /**
   * Mengecek apakah akun / profil yang sedang aktif sudah pernah berkomentar di Reel ini
   */
  static async checkIfAlreadyCommentedOnReel(page) {
    try {
      // 1. Dapatkan nama profil yang sedang aktif dari kotak komentar / drawer
      let activeName = "";
      const commentAsLocators = [
        'div[aria-label*="Komentari sebagai" i]',
        'div[aria-label*="Comment as" i]',
        'span:has-text("Komentari sebagai")',
        'span:has-text("Comment as")',
        'div:has-text("Komentari sebagai ")',
        'div:has-text("Comment as ")',
      ];

      for (const sel of commentAsLocators) {
        const el = page.locator(sel).first();
        if (await el.isVisible().catch(() => false)) {
          const text =
            (await el.innerText().catch(() => "")) ||
            (await el.getAttribute("aria-label").catch(() => "")) ||
            "";
          const match = text.match(
            /(?:Komentari sebagai|Comment as)\s+([^\n\r•]+)/i,
          );
          if (match && match[1]) {
            activeName = match[1].trim();
            break;
          }
        }
      }

      // 2. Cek apakah nama profil aktif sudah ada di daftar komentar (penulis komentar)
      if (activeName && activeName.length >= 2) {
        const authorLocators = [
          `div[role="complementary"] a:text-is("${activeName}")`,
          `div[role="complementary"] span:text-is("${activeName}")`,
          `div[role="complementary"] a:has-text("${activeName}")`,
          `div[aria-label*="Komentar" i] a:has-text("${activeName}")`,
        ];

        for (const aSel of authorLocators) {
          const authorEl = page.locator(aSel).first();
          if (await authorEl.isVisible().catch(() => false)) {
            return {
              alreadyCommented: true,
              reason: `Ditemukan komentar dari profil aktif "${activeName}" pada Reel ini`,
            };
          }
        }
      }

      // 3. Cek indikator khusus yang HANYA muncul pada komentar milik akun sendiri
      const ownCommentIndicators = [
        'span:has-text("Hapus pratinjau")',
        'span:has-text("Remove preview")',
        'div[role="button"][aria-label*="Edit atau hapus ini" i]',
        'div[role="button"][aria-label*="Edit or delete this" i]',
        'div[role="button"][aria-label*="Tindakan pada komentar ini" i]',
        'div[role="button"][aria-label*="Actions for this comment" i]',
      ];

      for (const oSel of ownCommentIndicators) {
        const oEl = page.locator(oSel).first();
        if (await oEl.isVisible().catch(() => false)) {
          return {
            alreadyCommented: true,
            reason: "Ditemukan komentar milik akun sendiri pada Reel ini",
          };
        }
      }

      return { alreadyCommented: false };
    } catch (e) {
      return { alreadyCommented: false };
    }
  }

  /**
   * Mendeteksi perkiraan jumlah komentar pada Facebook Reels yang sedang aktif
   */
  static async getReelCommentCount(page) {
    try {
      const rawCount = await page
        .evaluate(() => {
          // 1. CARI LANGSUNG DARI TOMBOL / IKON BALON KOMENTAR DI BILAH SAMPING VIDEO (SESUAI SCREENSHOT)
          // Cari elemen dengan aria-label "Komentar" / "Comment"
          const candidates = document.querySelectorAll(
            '[aria-label*="komentar" i], [aria-label*="comment" i]',
          );

          for (const el of candidates) {
            // A. Cek aria-label jika memuat format "X komentar" (contoh: "37 komentar" atau "204 comments")
            const aria = el.getAttribute("aria-label") || "";
            const ariaMatch = aria.match(
              /([\d]+(?:[.,]\d+)?\s*(?:rb|k|jt|m|b)?)\s*(?:komentar|comments)/i,
            );
            if (ariaMatch) return ariaMatch[1];

            // B. Cek teks langsung di dalam atau di bawah tombol balon komentar (contoh: "37" atau "204")
            const text = el.innerText ? el.innerText.trim() : "";
            const directMatch = text.match(
              /^([\d]+(?:[.,]\d+)?\s*(?:rb|k|jt|m|b)?)$/i,
            );
            if (directMatch) return directMatch[1];

            // C. Cek jika angka berada di kontainer induk tombol
            if (el.parentElement) {
              const pText = el.parentElement.innerText
                ? el.parentElement.innerText.trim()
                : "";
              const pDirectMatch = pText.match(
                /^([\d]+(?:[.,]\d+)?\s*(?:rb|k|jt|m|b)?)$/i,
              );
              if (pDirectMatch) return pDirectMatch[1];
            }
          }

          // 2. METODE BILAH SAMPING REELS (Urutan tombol aksi samping: 1. Suka, 2. Komentar, 3. Bagikan)
          // Di samping video Reels terdapat tombol aksi vertikal. Tombol ke-2 adalah selalu Balon Komentar.
          const allActionButtons = document.querySelectorAll(
            'div[role="button"]:has(svg)',
          );
          for (let i = 0; i < allActionButtons.length; i++) {
            const btn = allActionButtons[i];
            const aria = (btn.getAttribute("aria-label") || "").toLowerCase();
            if (aria.includes("komentar") || aria.includes("comment")) {
              const btnText = btn.innerText ? btn.innerText.trim() : "";
              const m = btnText.match(
                /([\d]+(?:[.,]\d+)?\s*(?:rb|k|jt|m|b)?)/i,
              );
              if (m) return m[1];
              if (btn.parentElement) {
                const pm = btn.parentElement.innerText.match(
                  /([\d]+(?:[.,]\d+)?\s*(?:rb|k|jt|m|b)?)/i,
                );
                if (pm) return pm[1];
              }
            }
          }

          // 3. Cek tombol yang sedang aktif/biru (karena panel komentar terbuka seperti pada screenshot)
          const activeButtons = document.querySelectorAll(
            '[role="button"][aria-pressed="true"], div:has(> svg):has(+ span)',
          );
          for (const ab of activeButtons) {
            const txt = ab.innerText ? ab.innerText.trim() : "";
            const m = txt.match(/^([\d]+(?:[.,]\d+)?\s*(?:rb|k|jt|m|b)?)$/i);
            if (m) return m[1];
          }

          return null;
        })
        .catch(() => null);

      if (rawCount) {
        return CommentParser.parseCommentCountString(rawCount);
      }
      return null;
    } catch (e) {
      return null;
    }
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
      'div[role="button"][aria-label*="next" i]',
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
      await page.keyboard.press("PageDown");
      await randomDelay(1200, 2200);
    }

    if (page.url() === initialUrl) {
      await page.keyboard.press("ArrowDown");
      await randomDelay(1200, 2200);
    }

    // 4. Jika tetap belum berubah, scroll window secara halus
    if (page.url() === initialUrl) {
      await page.evaluate(() => {
        window.scrollBy({ top: window.innerHeight * 1.2, behavior: "smooth" });
      });
      await randomDelay(2000, 3000);
    }

    const changed = page.url() !== initialUrl;
    if (changed) {
      logger.info(`Berhasil berpindah ke Reel berikutnya: ${page.url()}`);
    } else {
      logger.account("Mencoba scroll paksa ke Reel berikutnya...");
      await page.mouse.wheel(0, 1600);
      await randomDelay(1500, 2500);
    }

    return changed;
  }

  /**
   * Menjalankan aksi komentar pada FACEBOOK REELS dengan step-by-step progress & interruptible stop
   */
  static async postRandomReelsComments(account, options = {}) {
    const settings = getSettings();
    const countToComment = options.count !== undefined ? options.count : 10;
    const isUnlimited = countToComment === 0 || countToComment === -1;
    const targetCountText = isUnlimited
      ? "🔥 Tanpa Batas (Non-Stop Loop)"
      : `${countToComment} Reels`;
    const template =
      options.commentTemplate ||
      "{Halo|Hai|Permisi} kak, {keren banget videonya|menarik sekali|suka videonya}! {Salam sukses ya}.";
    const shouldStop =
      typeof options.shouldStop === "function"
        ? options.shouldStop
        : () => false;
    const onProgress =
      typeof options.onProgress === "function" ? options.onProgress : null;

    logger.account(
      account.id,
      `Membuka Facebook Reels untuk menonton & mengomentari (Target: ${targetCountText})...`,
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
    const processedReels = new Set();

    try {
      await page.goto("https://www.facebook.com/reel/", {
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
            `🛑 [${account.id}] Kampanye Reels dibatalkan untuk akun ini karena tidak dapat beralih ke Halaman Facebook.`,
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

      // Selalu arahkan browser secara tegas ke URL Facebook Reels
      logger.account(account.id, "Membuka antarmuka Facebook Reels...");
      await page.goto("https://www.facebook.com/reel/", {
        waitUntil: "domcontentloaded",
        timeout: 45000,
      });
      await randomDelay(3000, 5000);

      logger.account(
        account.id,
        "Berhasil masuk ke Facebook Reels! Mulai memutar dan mengomentari Reels...",
      );
      if (onProgress) await onProgress("LOGGED_IN", { accountId: account.id });
      await randomDelay(2000, 4000);

      let commentedCount = 0;
      let reelIndex = 0;
      let consecutiveFailures = 0;
      const MAX_CONSECUTIVE_FAILURES = 3;
      let isBlocked = false;
      let blockedReason = "";
      const maxReelAttempts = isUnlimited ? 999999 : countToComment * 20;

      while (
        (isUnlimited || commentedCount < countToComment) &&
        reelIndex < maxReelAttempts
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

        reelIndex++;

        // 1. Validasi URL: Browser HARUS selalu berada di halaman video Facebook Reels!
        // Jika tersasar ke profil sendiri atau feed, segera kembalikan ke Reels!
        const currentUrl = page.url();
        if (!currentUrl.includes("/reel/") && !currentUrl.includes("/watch/")) {
          logger.warn(
            `[${account.id}] Browser tidak berada di URL Reels (URL saat ini: ${currentUrl}). Mengarahkan kembali ke Facebook Reels...`,
          );
          await page.goto("https://www.facebook.com/reel/", {
            waitUntil: "domcontentloaded",
            timeout: 45000,
          });
          await randomDelay(3000, 5000);
          continue;
        }

        // 2. Cek apakah ini video Reel milik akun/halaman sendiri (Jangan pernah mengomentari Reel sendiri)
        const isOwnReel = await page
          .evaluate(() => {
            return !!document.querySelector(
              '[aria-label*="Edit pemirsa" i], [aria-label*="Edit audience" i], [aria-label*="Hapus video" i], [aria-label*="Delete video" i]',
            );
          })
          .catch(() => false);

        if (isOwnReel) {
          logger.info(
            `⏩ [${account.id}] Ini adalah video Reel milik Anda sendiri. Melewati (skip) ke Reel berikutnya...`,
          );
          await ReelsCommenter.goToNextReel(page);
          continue;
        }

        const reelIdMatch =
          currentUrl.match(/reel\/(\d+)/i) ||
          currentUrl.match(/videos\/(\d+)/i);
        const reelKey = reelIdMatch ? reelIdMatch[1] : currentUrl.split("?")[0];

        logger.account(
          account.id,
          `Sedang menonton Reel #${reelIndex}: ${currentUrl}`,
        );
        if (onProgress)
          await onProgress("WATCHING_REEL", {
            accountId: account.id,
            url: currentUrl,
            reelIndex,
            reelKey,
          });

        // Cek apakah akun terblokir
        if (await CommentGuard.checkIsActionBlocked(page)) {
          isBlocked = true;
          blockedReason = "Pop-up pembatasan / limit komentar Facebook";
          markAccountLimited(account.id, blockedReason);
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

        // VALIDASI 1: Cek riwayat lokal apakah akun ini sudah pernah berkomentar di Reel ini
        if (hasAccountCommentedOn(account.id, reelKey)) {
          logger.info(
            `⏩ [${account.id}] Reel ini (${reelKey}) sudah pernah Anda komentari sebelumnya. Melewati (skip) ke Reel berikutnya...`,
          );
          if (onProgress)
            await onProgress("SKIPPED_ALREADY_COMMENTED", {
              accountId: account.id,
              url: currentUrl,
              reelKey,
            });
          await ReelsCommenter.goToNextReel(page);
          continue;
        }

        // VALIDASI 2: Filter rentang jumlah komentar pada Reel ini
        const minComments = options.minComments || 0;
        const maxComments = options.maxComments || 0;
        if (minComments > 0 || maxComments > 0) {
          const reelCommentCount =
            await ReelsCommenter.getReelCommentCount(page);
          if (reelCommentCount !== null) {
            const isBelowMin =
              minComments > 0 && reelCommentCount < minComments;
            const isAboveMax =
              maxComments > 0 && reelCommentCount > maxComments;
            if (isBelowMin || isAboveMax) {
              const targetRangeStr =
                minComments > 0 && maxComments > 0
                  ? `${minComments} - ${maxComments}`
                  : maxComments > 0
                    ? `maksimal ${maxComments}`
                    : `minimal ${minComments}`;
              logger.info(
                `⏩ [${account.id}] Reel ini memiliki ${reelCommentCount} komentar (Di luar target: ${targetRangeStr}). Melewati (skip) ke Reel berikutnya...`,
              );
              if (onProgress)
                await onProgress("SKIPPED_COMMENT_COUNT_FILTER", {
                  accountId: account.id,
                  currentCount: reelCommentCount,
                  minComments,
                  maxComments,
                  targetRangeStr,
                });
              await ReelsCommenter.goToNextReel(page);
              continue;
            }
          }
        }

        if (!processedReels.has(currentUrl)) {
          processedReels.add(currentUrl);

          // 1. Pastikan laci komentar terbuka
          const commentBox =
            await ReelsCommenter.ensureReelCommentDrawerOpen(page);

          // VALIDASI 3: Pastikan identitas yang berkomentar adalah Halaman (jika mode Halaman dipilih)
          if (options.commentAs === "PAGE") {
            const pageEnforce =
              await ProfileSwitcher.enforcePageIdentityAtCommentBox(
                page,
                options.targetPageName,
              );
            if (!pageEnforce.valid) {
              logger.warn(
                `⚠️ [${account.id}] Reel ini tidak dapat dikomentari sebagai Halaman (terdeteksi akun biasa: "${pageEnforce.identityName}"). Melewati (skip) agar tidak salah menggunakan akun biasa...`,
              );
              if (onProgress)
                await onProgress("SKIPPED_NOT_PAGE", {
                  accountId: account.id,
                  currentIdentity: pageEnforce.identityName,
                  targetPage: options.targetPageName,
                });
              await ReelsCommenter.goToNextReel(page);
              continue;
            }
          }

          // VALIDASI 4: Cek langsung di panel komentar apakah akun/profil aktif sudah pernah berkomentar
          const alreadyCheck =
            await ReelsCommenter.checkIfAlreadyCommentedOnReel(page);
          if (alreadyCheck.alreadyCommented) {
            logger.info(
              `⏩ [${account.id}] ${alreadyCheck.reason}. Melewati (skip) ke Reel berikutnya...`,
            );
            markCommentedHistory(account.id, reelKey);
            if (onProgress)
              await onProgress("SKIPPED_ALREADY_COMMENTED", {
                accountId: account.id,
                url: currentUrl,
                reelKey,
              });
            await ReelsCommenter.goToNextReel(page);
            continue;
          }

          // 2. Ketik dan kirim komentar pada Reel ini
          if (commentBox) {
            const commentText = parseSpintax(template);
            logger.info(`Mengetikkan komentar pada Reel: "${commentText}"`);
            if (onProgress)
              await onProgress("TYPING", {
                accountId: account.id,
                commentText,
              });

            await commentBox.scrollIntoViewIfNeeded().catch(() => {});
            await commentBox.click({ force: true });
            await randomDelay(600, 1200);

            await typeHumanLike(
              page,
              commentBox,
              commentText,
              settings.delays.minTypingDelayMs,
              settings.delays.maxTypingDelayMs,
            );
            await randomDelay(1200, 2200);

            if (shouldStop()) break;

            // Tekan Enter untuk submit
            await page.keyboard.press("Enter");
            await randomDelay(2500, 3500);

            // Cek tombol kirim jika teks masih tertinggal
            let verifyResult = await CommentGuard.verifyCommentSubmitted(
              page,
              commentBox,
              commentText,
            );
            if (verifyResult.isBlocked) {
              isBlocked = true;
              blockedReason =
                "Terdeteksi pembatasan komentar Facebook: Tidak Ada Izin untuk Menambahkan Komentar / Limit Tercapai";
              markAccountLimited(account.id, blockedReason);
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

            if (!verifyResult.isConfirmed) {
              const sendBtn = page
                .locator(
                  'div[aria-label="Komentari" i], div[aria-label="Comment" i], div[aria-label="Kirim" i], div[role="button"][aria-label*="Komentari" i]',
                )
                .first();
              if (await sendBtn.isVisible().catch(() => false)) {
                await sendBtn.click({ force: true }).catch(() => {});
                await randomDelay(2500, 3500);
              }
              verifyResult = await CommentGuard.verifyCommentSubmitted(
                page,
                commentBox,
                commentText,
              );
              if (verifyResult.isBlocked) {
                isBlocked = true;
                blockedReason =
                  "Terdeteksi pembatasan komentar Facebook: Tidak Ada Izin untuk Menambahkan Komentar / Limit Tercapai";
                markAccountLimited(account.id, blockedReason);
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
            }

            if (verifyResult.isConfirmed) {
              markCommentedHistory(account.id, reelKey);
              consecutiveFailures = 0;
              commentedCount++;
              const progressText = isUnlimited
                ? `[${commentedCount} terkirim]`
                : `[${commentedCount}/${countToComment}]`;
              logger.success(
                `🎉 [${account.id}] ${progressText} [VALIDASI SUKSES] Komentar di Reel: "${commentText}"`,
              );
              results.push({
                success: true,
                url: currentUrl,
                comment: commentText,
              });
              if (onProgress)
                await onProgress("COMMENT_SUCCESS", {
                  accountId: account.id,
                  progressText,
                  commentText,
                  url: currentUrl,
                });

              if (isUnlimited || commentedCount < countToComment) {
                const defaultPause = Math.floor(Math.random() * 8000) + 8000;
                const pauseMs = options.delaySeconds
                  ? options.delaySeconds * 1000
                  : defaultPause;
                logger.info(
                  `Jeda aman ${Math.round(pauseMs / 1000)} detik sebelum berpindah ke Reel berikutnya...`,
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
              }
            } else {
              consecutiveFailures++;
              logger.warn(
                `Komentar pada Reel ini belum terkonfirmasi terkirim (Gagal ${consecutiveFailures}/${MAX_CONSECUTIVE_FAILURES}).`,
              );
              if (onProgress)
                await onProgress("COMMENT_FAILED", {
                  accountId: account.id,
                  consecutiveFailures,
                  maxFailures: MAX_CONSECUTIVE_FAILURES,
                  reelIndex,
                });
            }
          } else {
            consecutiveFailures++;
            logger.warn(
              `Tombol atau laci komentar pada Reel ini tidak dapat ditemukan (Gagal ${consecutiveFailures}/${MAX_CONSECUTIVE_FAILURES}).`,
            );
            if (onProgress)
              await onProgress("COMMENT_FAILED", {
                accountId: account.id,
                consecutiveFailures,
                maxFailures: MAX_CONSECUTIVE_FAILURES,
                reelIndex,
              });
          }

          if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
            isBlocked = true;
            blockedReason = `Gagal mengirim komentar ${MAX_CONSECUTIVE_FAILURES}x berturut-turut di Reels (Indikasi limit / shadowban Facebook)`;
            markAccountLimited(account.id, blockedReason);
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
        }

        if (shouldStop()) break;

        // 3. PINDAH KE REEL BERIKUTNYA
        logger.account(
          account.id,
          "Berpindah ke video Reel berikutnya (Next Reel)...",
        );
        if (onProgress)
          await onProgress("NEXT_REEL", { accountId: account.id });
        await ReelsCommenter.goToNextReel(page);
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
      logger.error(
        `[${account.id}] Terjadi kesalahan saat komentar di Facebook Reels:`,
        err,
      );
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
   * Menjalankan kampanye acak untuk semua akun di Facebook Reels
   */
  static async runRandomReelsCampaign(accounts, options = {}) {
    const settings = getSettings();
    const activeAccounts = accounts.filter((acc) => acc.enabled !== false);
    const concurrency = options.concurrency || 1;

    logger.info(
      `🎬 Memulai kampanye komentar Facebook REELS (${activeAccounts.length} akun, Concurrency: ${concurrency})...`,
    );
    const allResults = [];
    let currentIndex = 0;

    const worker = async (workerId) => {
      while (currentIndex < activeAccounts.length) {
        if (options.shouldStop && options.shouldStop()) break;

        const accIdx = currentIndex++;
        const account = activeAccounts[accIdx];
        logger.info(
          `[Worker ${workerId}] Memproses Reels untuk Akun: ${account.name || account.id}`,
        );

        const res = await ReelsCommenter.postRandomReelsComments(account, {
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

    logger.success("\n🎉 Kampanye komentar Facebook Reels selesai!");
    return allResults;
  }
}
