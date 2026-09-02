import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import { createAccountBrowserContext } from '../browser.js';
import { paths, getSettings } from '../config.js';
import { logger } from '../utils/logger.js';
import { randomDelay, sleep, typeHumanLike } from '../utils/delay.js';
import { generate2FACode } from '../utils/twoFactor.js';

export class SessionManager {
  /**
   * Cek apakah akun BENAR-BENAR dalam status login aktif di Facebook (bukan di layar Checkpoint / Verifikasi)
   */
  static async checkIsLoggedIn(context, page) {
    try {
      const cookies = await context.cookies();
      const hasCUser = cookies.some((c) => c.name === 'c_user' && c.value && c.value.length > 0);
      const hasCheckpointCookie = cookies.some((c) => c.name === 'checkpoint');

      // 1. Jika masih ada cookie checkpoint, pasti BELUM login selesai
      if (hasCheckpointCookie) {
        return false;
      }

      // 2. Cek apakah ada teks checkpoint di halaman
      const currentUrl = page.url();
      const isCheckpointPage = currentUrl.includes('checkpoint') || currentUrl.includes('/login');
      if (isCheckpointPage) {
        return false;
      }

      const checkpointElement = page.locator('text="Periksa perangkat Anda", text="Menunggu persetujuan", text="Coba cara lain", input[name="approvals_code"], input[id="approvals_code"]').first();
      const hasCheckpointText = await checkpointElement.isVisible().catch(() => false);
      if (hasCheckpointText) {
        return false;
      }

      // 3. Jika c_user ada dan tidak ada checkpoint, berarti SUDAH login valid
      if (hasCUser) {
        return true;
      }

      // 4. Cek elemen Beranda yang HANYA muncul jika sudah login
      const hasStoriesOrFeed = await page.locator('[role="feed"], [data-pagelet="Stories"], [aria-label*="Profil Anda"], [aria-label*="Your profile"], [aria-label*="Menu Akun"]').first().isVisible().catch(() => false);
      const isLoggedOutForm = await page.locator('input[name="email"], input[id="email"], button[name="login"]').first().isVisible().catch(() => false);

      return hasStoriesOrFeed && !isLoggedOutForm;
    } catch (e) {
      return false;
    }
  }

  /**
   * Verifikasi apakah sesi akun masih aktif
   */
  static async verifySession(account) {
    let browserInstance = null;
    try {
      logger.account(account.id, 'Memverifikasi status sesi di Facebook...');
      browserInstance = await createAccountBrowserContext(account, { headless: true });
      const { page, context, close } = browserInstance;

      await page.goto('https://www.facebook.com/', { waitUntil: 'domcontentloaded', timeout: 45000 });
      await randomDelay(2500, 4500);

      const loggedIn = await SessionManager.checkIsLoggedIn(context, page);
      await close();

      if (loggedIn) {
        logger.account(account.id, 'Sesi AKTIF dan valid (Terverifikasi Login).');
        return { isValid: true };
      } else {
        logger.account(account.id, 'Sesi KADALUARSA / Masih di Checkpoint.');
        return { isValid: false, reason: 'EXPIRED_OR_CHECKPOINT' };
      }
    } catch (err) {
      if (browserInstance?.close) {
        await browserInstance.close().catch(() => {});
      }
      logger.error(`Gagal verifikasi sesi [${account.id}]:`, err);
      return { isValid: false, reason: 'ERROR', error: err.message };
    }
  }

  /**
   * Melakukan proses login lengkap dengan toleransi waktu persetujuan di HP
   */
  static async loginAccount(account, options = {}) {
    logger.account(account.id, `Memulai proses login untuk ${account.username}...`);
    const headless = options.headless !== undefined ? options.headless : false;
    const maxWaitSeconds = options.maxWaitSeconds || (headless ? 60 : 300); // 5 menit jika mode visual

    let browserInstance;
    try {
      browserInstance = await createAccountBrowserContext(account, { headless });
    } catch (err) {
      logger.error(`[${account.id}] Gagal inisialisasi browser/proxy:`, err);
      return { success: false, error: err.message };
    }

    const { context, page, close, sessionPath } = browserInstance;

    try {
      await page.goto('https://www.facebook.com/', { waitUntil: 'domcontentloaded', timeout: 60000 });
      await randomDelay(2000, 4000);

      // 1. Tangani popup cookie jika ada
      const cookieButtons = [
        'button[data-cookiebanner="accept_button"]',
        'button[title="Only allow essential cookies"]',
        'button[title="Izinkan semua cookie"]',
        'button[title="Allow all cookies"]',
        'button:has-text("Izinkan semua cookie")',
        'button:has-text("Allow all cookies")',
        'button:has-text("Decline optional cookies")',
        'div[aria-label*="Izinkan"]'
      ];
      for (const btnSelector of cookieButtons) {
        const btn = page.locator(btnSelector).first();
        if (await btn.isVisible().catch(() => false)) {
          await btn.click({ force: true }).catch(() => {});
          await randomDelay(1000, 2000);
          break;
        }
      }

      // 2. Cek apakah sudah login dari Persistent Profile
      if (await SessionManager.checkIsLoggedIn(context, page)) {
        logger.success(`[${account.id}] Akun sudah terverifikasi dalam keadaan Login!`);
        await close();
        return { success: true };
      }

      // 3. Masukkan Username / Email jika ada form login
      const emailInput = page.locator('input[name="email"], input[id="email"], input[type="text"]').first();
      const isEmailVisible = await emailInput.isVisible().catch(() => false);

      if (isEmailVisible) {
        logger.account(account.id, 'Mengetikkan email/username...');
        await emailInput.click({ force: true });
        await randomDelay(300, 600);
        await emailInput.fill('');
        await typeHumanLike(page, emailInput, account.username);
        await randomDelay(600, 1200);

        // 4. Masukkan Password
        const passInput = page.locator('input[name="pass"], input[id="pass"], input[type="password"]').first();
        logger.account(account.id, 'Mengetikkan password...');
        await passInput.click({ force: true });
        await randomDelay(300, 600);
        await passInput.fill('');
        await typeHumanLike(page, passInput, account.password);
        await randomDelay(800, 1500);

        // 5. Submit Form Login
        logger.account(account.id, 'Menekan tombol login / Submit...');
        let submitted = false;
        const loginBtnSelectors = [
          'button[name="login"]',
          'button[data-testid="royal_login_button"]',
          'button[type="submit"]',
          'input[type="submit"]',
          'button:has-text("Masuk")',
          'button:has-text("Log In")'
        ];

        for (const selector of loginBtnSelectors) {
          const btn = page.locator(selector).first();
          if (await btn.isVisible().catch(() => false)) {
            await btn.click({ force: true }).catch(() => {});
            submitted = true;
            break;
          }
        }

        if (!submitted) {
          await passInput.press('Enter');
        }
      }

      if (!headless) {
        console.log(chalk.cyan.bold(`
=============================================================================
  🔔 [${account.id}] Jendela Browser Terbuka & Menunggu Persetujuan Anda!
  📱 Silakan buka notifikasi Facebook di HP Anda dan ketuk angka persetujuan.
  ⏳ Browser TETAP TERBUKA sampai Anda selesai menyetujui di HP Anda.
=============================================================================
`));
      }

      // 6. Loop Pemantauan Persetujuan Login (Polling c_user & Checkpoint Removal)
      logger.account(account.id, 'Memantau status login (menunggu persetujuan HP / 2FA)...');
      let isSuccess = false;
      let hasSentCheckpointScreenshot = false;
      const startTime = Date.now();
      let lastLogTime = 0;

      while ((Date.now() - startTime) < maxWaitSeconds * 1000) {
        if (options.shouldStop && options.shouldStop()) {
          logger.info(`[${account.id}] Proses login dihentikan oleh pengguna.`);
          break;
        }

        await randomDelay(2000, 3000);

        // Log info berkala setiap 15 detik agar user tahu bot masih menunggu
        if (Date.now() - lastLogTime > 15000) {
          const remainingSec = Math.round((maxWaitSeconds * 1000 - (Date.now() - startTime)) / 1000);
          logger.account(account.id, `Sedang menunggu persetujuan di HP... (Tersisa waktu tunggu: ${remainingSec}s)`);
          if (options.onProgress) {
            await options.onProgress('WAITING_APPROVAL', { accountId: account.id, remainingSec });
          }
          lastLogTime = Date.now();
        }

        // Cek jika ada layar 2FA / Checkpoint
        const is2FA = page.url().includes('checkpoint') || 
          await page.locator('input[name="approvals_code"], input[id="approvals_code"], input[placeholder*="Code"], input[placeholder*="Kode"]').first().isVisible().catch(() => false);

        // Kirim screenshot checkpoint sekali ke Telegram agar user bisa melihat langsung
        if (is2FA && !hasSentCheckpointScreenshot) {
          hasSentCheckpointScreenshot = true;
          const checkpointScreenshot = path.join(paths.logsDir, `checkpoint_${account.id}_${Date.now()}.png`);
          await page.screenshot({ path: checkpointScreenshot }).catch(() => {});
          if (options.onProgress) {
            await options.onProgress('CHECKPOINT_SCREENSHOT', {
              accountId: account.id,
              screenshotPath: checkpointScreenshot
            });
          }
        }

        // Cek jika ada input kode OTP manual yang dikirimkan user via Telegram
        if (options.getManualOtp) {
          const manualOtp = options.getManualOtp(account.id);
          if (manualOtp) {
            logger.account(account.id, `Memasukkan kode OTP manual (${manualOtp})...`);
            const otpInput = page.locator('input[name="approvals_code"], input[id="approvals_code"], input[type="number"], input[type="text"]').first();
            if (await otpInput.isVisible().catch(() => false)) {
              await otpInput.click({ force: true });
              await typeHumanLike(page, otpInput, manualOtp);
              await randomDelay(800, 1500);

              const submitOtpBtn = page.locator('button[type="submit"], button#checkpointSubmitButton, button:has-text("Continue"), button:has-text("Lanjutkan")').first();
              if (await submitOtpBtn.isVisible().catch(() => false)) {
                await submitOtpBtn.click({ force: true });
              } else {
                await otpInput.press('Enter');
              }
              await randomDelay(3000, 5000);
            }
          }
        }

        if (is2FA && account.twoFactorSecret) {
          const otpCode = generate2FACode(account.twoFactorSecret);
          if (otpCode) {
            logger.account(account.id, `Memasukkan kode 2FA otomatis (${otpCode})...`);
            const otpInput = page.locator('input[name="approvals_code"], input[id="approvals_code"], input[type="number"], input[type="text"]').first();
            if (await otpInput.isVisible().catch(() => false)) {
              await otpInput.click({ force: true });
              await typeHumanLike(page, otpInput, otpCode);
              await randomDelay(800, 1500);

              const submitOtpBtn = page.locator('button[type="submit"], button#checkpointSubmitButton, button:has-text("Continue"), button:has-text("Lanjutkan")').first();
              if (await submitOtpBtn.isVisible().catch(() => false)) {
                await submitOtpBtn.click({ force: true });
              } else {
                await otpInput.press('Enter');
              }
              await randomDelay(3000, 5000);
            }
          }
        }


        // Auto klik dialog "Lain Kali / Not Now / Simpan Info Login"
        const notNowButtons = [
          'div[role="button"]:has-text("Lain Kali")',
          'div[role="button"]:has-text("Bukan Sekarang")',
          'div[role="button"]:has-text("Not Now")',
          'button:has-text("Lain Kali")',
          'button:has-text("Not Now")',
          'button:has-text("Simpan")',
          'button:has-text("Save")'
        ];
        for (const btnSelector of notNowButtons) {
          const btn = page.locator(btnSelector).first();
          if (await btn.isVisible().catch(() => false)) {
            await btn.click({ force: true }).catch(() => {});
            await randomDelay(1000, 2000);
            break;
          }
        }

        // Cek apakah login sudah BENAR-BENAR sukses
        if (await SessionManager.checkIsLoggedIn(context, page)) {
          isSuccess = true;
          break;
        }
      }

      if (isSuccess) {
        logger.success(`🎉 [${account.id}] Login BERHASIL! Beranda Facebook terdeteksi dan profil tersimpan persisten.`);
        await randomDelay(2000, 3000);
        await close();
        return { success: true, sessionPath };
      } else {
        logger.warn(`[${account.id}] Waktu tunggu habis (5 menit) atau belum disetujui di HP.`);
        await close();
        return { success: false, reason: 'TIMEOUT_OR_CHECKPOINT' };
      }
    } catch (err) {
      logger.error(`[${account.id}] Gagal saat proses login:`, err);
      const errorScreenshotPath = path.join(paths.logsDir, `error_login_${account.id}_${Date.now()}.png`);
      await page.screenshot({ path: errorScreenshotPath }).catch(() => {});
      await close().catch(() => {});
      return { success: false, error: err.message };
    }
  }

  /**
   * Menjalankan login multi-akun secara PARALEL
   */
  static async loginAccountsParallel(accounts, options = {}) {
    const concurrency = options.concurrency || accounts.length;
    logger.info(`🚀 Menjalankan login PARALEL untuk ${accounts.length} akun (Membuka hingga ${concurrency} browser bersamaan)...`);

    const results = [];
    let currentIndex = 0;

    const worker = async (workerId) => {
      while (currentIndex < accounts.length) {
        const accIndex = currentIndex++;
        const account = accounts[accIndex];
        logger.info(`[Worker ${workerId}] Memulai login untuk ${account.id} (${account.username})...`);
        const res = await SessionManager.loginAccount(account, options);
        results[accIndex] = { accountId: account.id, ...res };
      }
    };

    const workerPromises = Array.from({ length: Math.min(concurrency, accounts.length) }, (_, i) => worker(i + 1));
    await Promise.all(workerPromises);

    logger.success(`\n🎉 Proses login selesai! Total akun diproses: ${results.length}`);
    return results;
  }
}
