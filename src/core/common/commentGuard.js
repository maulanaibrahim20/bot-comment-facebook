import { randomDelay, typeHumanLike } from '../../utils/delay.js';
import { logger } from '../../utils/logger.js';
import { SessionManager } from '../sessionManager.js';

/**
 * Modul Proteksi & Guard Komentar Facebook
 * Menangani deteksi pembatasan/limit komentar, verifikasi submit komentar, dan penutupan modal.
 */
export class CommentGuard {
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
      'text="Tidak Ada Izin untuk Menambahkan Komentar"',
      'text="tidak memiliki izin untuk menambahkan komentar"',
      'text="postingan yang telah dihapus"',
      'text="postingan asli mungkin telah dihapus"',
      'text="Anda Tidak Dapat Menggunakan Fitur Ini Sekarang"',
      'text="Kami membatasi seberapa sering Anda dapat memposting"',
      'text="Kami membatasi seberapa sering Anda dapat berkomentar"',
      'text="Kami membatasi seberapa sering Anda dapat melakukan hal tertentu"',
      'text="Kami membatasi seberapa sering"',
      'text="Tindakan Anda Dibatasi"',
      'text="Akun Anda Dibatasi"',
      'text="Akun Anda dibatasi"',
      'text="Tidak bisa memposting komentar"',
      'text="Tidak dapat memposting komentar"',
      'text="Komentar tidak dapat dikirim"',
      'text="Komentar dibatasi"',
      'text="Gagal memposting"',
      'text="Coba lagi nanti"',
      'text="Try again later"',
      'text="You Can\'t Use This Feature Right Now"',
      'text="You Don\'t Have Permission to Add Comments"',
      'text="You don\'t have permission to comment"',
      'text="permission to add this comment"',
      'text="We limit how often you can post"',
      'text="We limit how often you can comment"',
      'text="You’re Temporarily Blocked"',
      'text="You\'re Temporarily Blocked"',
      'text="Action Blocked"',
      'text="Your account is restricted"',
      'text="Comments are disabled"',
      'text="Your request couldn\'t be processed"',
      'div[role="dialog"]:has-text("Tidak Ada Izin")',
      'div[role="dialog"]:has-text("tidak memiliki izin")',
      'div[role="dialog"]:has-text("Anda Tidak Dapat Menggunakan Fitur Ini Sekarang")',
      'div[role="dialog"]:has-text("Dibatasi")',
      'div[role="dialog"]:has-text("Restricted")',
      'div[role="dialog"]:has-text("Temporarily Blocked")',
      'div[role="dialog"]:has-text("Peringatan")',
      'div[role="dialog"]:has-text("Permission")',
      'div[role="alert"]:has-text("dibatasi")',
      'div[role="alert"]:has-text("tidak dapat")',
      'div[role="alert"]:has-text("limit")',
      'div[role="alert"]:has-text("blocked")'
    ];

    for (const sel of blockSelectors) {
      const el = page.locator(sel).first();
      if (await el.isVisible().catch(() => false)) {
        // Klik tombol OK atau tombol X pada popup dialog pembatasan jika ada
        const okBtn = page.locator('div[role="dialog"] button:has-text("OK"), div[role="dialog"] div[role="button"]:has-text("OK"), button:has-text("OK"), div[role="dialog"] [aria-label="Tutup" i], div[role="dialog"] [aria-label="Close" i]').first();
        if (await okBtn.isVisible().catch(() => false)) {
          await okBtn.click({ force: true }).catch(() => {});
          await randomDelay(800, 1200);
        }
        return true;
      }
    }

    // Cek komprehensif: semua modal popup dialog yang muncul di layar
    try {
      const dialogs = page.locator('div[role="dialog"], div[role="alertdialog"]');
      const dCount = await dialogs.count().catch(() => 0);
      for (let i = 0; i < dCount; i++) {
        const d = dialogs.nth(i);
        if (await d.isVisible().catch(() => false)) {
          const text = (await d.innerText().catch(() => '')).toLowerCase();
          if (
            text.includes('izin') ||
            text.includes('permission') ||
            text.includes('dibatasi') ||
            text.includes('limit') ||
            text.includes('blocked') ||
            text.includes('peringatan') ||
            text.includes('maaf') ||
            text.includes('sorry') ||
            text.includes('tidak dapat') ||
            text.includes('tidak bisa') ||
            text.includes('gagal') ||
            text.includes('coba lagi nanti') ||
            text.includes('try again later')
          ) {
            const okBtn = d.locator('button:has-text("OK"), div[role="button"]:has-text("OK"), button, div[role="button"]').first();
            if (await okBtn.isVisible().catch(() => false)) {
              await okBtn.click({ force: true }).catch(() => {});
            }
            return true;
          }
        }
      }
    } catch (e) {}

    return false;
  }

  /**
   * Memvalidasi apakah komentar yang baru saja diketik telah berhasil disubmit / terkirim
   */
  static async verifyCommentSubmitted(page, targetCommentBox, commentText) {
    // 1. Cek sebelum validasi apakah ada popup pembatasan / tidak ada izin
    if (await CommentGuard.checkIsActionBlocked(page)) {
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
    const commentRendered = page.locator(`text="${searchSnippet}", span:has-text("${searchSnippet}"), div:has-text("Baru saja"), div:has-text("Just now")`).first();
    const isCommentVisible = await commentRendered.isVisible().catch(() => false);

    // 2. Cek kembali apakah popup pembatasan / tidak ada izin muncul setelah render
    if (await CommentGuard.checkIsActionBlocked(page)) {
      return { isConfirmed: false, isBlocked: true };
    }

    return {
      isConfirmed: isBoxCleared || isCommentVisible,
      isBlocked: false
    };
  }
}
