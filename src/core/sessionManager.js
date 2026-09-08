import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import { createAccountBrowserContext } from '../browser.js';
import { paths, getSettings, markAccountLimited, clearAccountLimit } from '../config.js';
import { logger } from '../utils/logger.js';
import { randomDelay, sleep, typeHumanLike } from '../utils/delay.js';
import { generate2FACode } from '../utils/twoFactor.js';

export const activeLoginSessions = new Map();

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
   * Mendeteksi apakah akun sedang terkena pembatasan / peringatan akun di Facebook
   */
  static async checkAccountRestrictions(page) {
    try {
      const restrictionSelectors = [
        'text="Anda Tidak Dapat Menggunakan Fitur Ini Sekarang"',
        'text="Kami membatasi seberapa sering Anda dapat memposting"',
        'text="Kami membatasi seberapa sering Anda dapat berkomentar"',
        'text="Kami membatasi seberapa sering Anda dapat melakukan"',
        'text="Tindakan Anda Dibatasi"',
        'text="Akun Anda Dibatasi"',
        'text="Akun Anda dibatasi"',
        'text="Peringatan Akun"',
        'text="Account Warning"',
        'text="Your account is restricted"',
        'text="You’re Temporarily Blocked"',
        'text="You\'re Temporarily Blocked"',
        'text="You Can\'t Use This Feature Right Now"',
        'text="Action Blocked"',
        'div[role="dialog"]:has-text("Dibatasi")',
        'div[role="dialog"]:has-text("Restricted")',
        'div[role="dialog"]:has-text("Peringatan")',
        'div[role="alert"]:has-text("dibatasi")',
        'div[role="alert"]:has-text("restricted")'
      ];

      for (const sel of restrictionSelectors) {
        const el = page.locator(sel).first();
        if (await el.isVisible().catch(() => false)) {
          const text = (await el.innerText().catch(() => '')).trim();
          return {
            isRestricted: true,
            message: text.length > 0 && text.length < 150 ? text : 'Terkena Pembatasan / Limit Facebook'
          };
        }
      }
      return { isRestricted: false };
    } catch (e) {
      return { isRestricted: false };
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
      let isRestricted = false;
      let restrictionMessage = '';

      if (loggedIn) {
        const restrictionCheck = await SessionManager.checkAccountRestrictions(page);
        if (restrictionCheck.isRestricted) {
          isRestricted = true;
          restrictionMessage = restrictionCheck.message;
        }
      }

      await close();

      if (loggedIn) {
        if (isRestricted) {
          await markAccountLimited(account.id, restrictionMessage);
          logger.warn(`[${account.id}] Sesi AKTIF tetapi TERKENA PEMBATASAN: ${restrictionMessage}`);
          return { isValid: true, isRestricted: true, restrictionReason: restrictionMessage };
        }
        if (account.isLimited) {
          await clearAccountLimit(account.id);
        }
        logger.account(account.id, 'Sesi AKTIF dan valid (Terverifikasi Login).');
        return { isValid: true, isRestricted: false };
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
    const headless = options.headless !== undefined ? options.headless : true;
    const maxWaitSeconds = options.maxWaitSeconds || 300; // 5 menit agar leluasa verifikasi di HP

    let browserInstance;
    try {
      browserInstance = await createAccountBrowserContext(account, { headless });
    } catch (err) {
      logger.error(`[${account.id}] Gagal inisialisasi browser/proxy:`, err);
      return { success: false, error: err.message };
    }

    const { context, page, close, sessionPath } = browserInstance;
    activeLoginSessions.set(account.id, page);

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
        activeLoginSessions.delete(account.id);
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

      // Beri jeda agar Facebook memproses autentikasi (3-4 detik)
      await randomDelay(3000, 4500);

      // Coba klik Google reCAPTCHA jika langsung muncul
      await SessionManager.handleRecaptcha(page);

      // 6. Loop Pemantauan Persetujuan Login (Polling c_user & Checkpoint Removal)
      logger.account(account.id, 'Memantau status login (menunggu persetujuan HP / 2FA)...');
      let isSuccess = false;
      let hasSentCheckpointScreenshot = false;
      const startTime = Date.now();
      let lastLogTime = 0;

      // Cek apakah langsung login berhasil atau butuh verifikasi
      if (await SessionManager.checkIsLoggedIn(context, page)) {
        isSuccess = true;
      } else {
        // Ambil screenshot awal segera setelah submit form login (halaman checkpoint / verifikasi)
        const initialScreenshot = path.join(paths.logsDir, `verification_${account.id}_${Date.now()}.png`);
        await page.screenshot({ path: initialScreenshot }).catch(() => {});
        if (options.onProgress) {
          await options.onProgress('WAITING_APPROVAL', {
            accountId: account.id,
            remainingSec: maxWaitSeconds,
            currentUrl: page.url(),
            screenshotPath: initialScreenshot,
            isInitial: true
          });
        }
      }

      while (!isSuccess && (Date.now() - startTime) < maxWaitSeconds * 1000) {
        if (options.shouldStop && options.shouldStop()) {
          logger.info(`[${account.id}] Proses login dihentikan oleh pengguna.`);
          break;
        }

        await randomDelay(2000, 3000);

        // Coba deteksi dan klik reCAPTCHA jika halaman menampilkan verifikasi bot
        await SessionManager.handleRecaptcha(page);

        // Log info berkala setiap 45 detik agar tidak membanjiri chat Telegram
        if (Date.now() - lastLogTime > 45000) {
          const remainingSec = Math.round((maxWaitSeconds * 1000 - (Date.now() - startTime)) / 1000);
          logger.account(account.id, `Sedang menunggu persetujuan di HP... (Tersisa waktu tunggu: ${remainingSec}s)`);
          
          let currentUrl = page.url();
          if (currentUrl.endsWith('facebook.com/') || currentUrl.endsWith('facebook.com')) {
            const subUrl = await page.evaluate(() => {
              const checkpointLink = document.querySelector('a[href*="checkpoint"], a[href*="challenge"]');
              if (checkpointLink) return checkpointLink.href;
              const iframe = document.querySelector('iframe[src*="checkpoint"], iframe[src*="facebook.com/login"]');
              if (iframe) return iframe.src;
              return null;
            }).catch(() => null);
            if (subUrl) currentUrl = subUrl;
          }

          if (options.onProgress) {
            await options.onProgress('WAITING_APPROVAL', {
              accountId: account.id,
              remainingSec,
              currentUrl
            });
          }
          lastLogTime = Date.now();
        }

        // Cek jika ada layar 2FA / Checkpoint / Two-Step Verification
        const is2FA = page.url().includes('checkpoint') || 
          page.url().includes('twostepverification') ||
          page.url().includes('two_step_verification') ||
          await page.locator('input[name="approvals_code"], input[id="approvals_code"], input[placeholder*="Code" i], input[placeholder*="Kode" i], input[autocomplete="one-time-code"]').first().isVisible().catch(() => false);

        // Kirim screenshot checkpoint sekali ke Telegram agar user bisa melihat langsung
        if (is2FA && !hasSentCheckpointScreenshot) {
          hasSentCheckpointScreenshot = true;
          const checkpointScreenshot = path.join(paths.logsDir, `checkpoint_${account.id}_${Date.now()}.png`);
          await page.screenshot({ path: checkpointScreenshot }).catch(() => {});
          if (options.onProgress) {
            await options.onProgress('CHECKPOINT_SCREENSHOT', {
              accountId: account.id,
              screenshotPath: checkpointScreenshot,
              currentUrl: page.url(),
              remainingSec: Math.round((maxWaitSeconds * 1000 - (Date.now() - startTime)) / 1000)
            });
          }
        }

        // Cek jika ada input kode OTP manual yang dikirimkan user via Telegram
        if (options.getManualOtp) {
          const manualOtp = options.getManualOtp(account.id);
          if (manualOtp) {
            logger.account(account.id, `Memasukkan kode OTP manual (${manualOtp})...`);
            const otpInput = page.locator('input[name="approvals_code"], input[id="approvals_code"], input[name*="code" i], input[autocomplete="one-time-code"], input[placeholder*="Code" i], input[placeholder*="Kode" i], input[type="number"], input[type="text"]').first();
            if (await otpInput.isVisible().catch(() => false)) {
              await otpInput.click({ force: true });
              await typeHumanLike(page, otpInput, manualOtp);
              await randomDelay(800, 1500);

              const submitOtpBtn = page.locator('button[type="submit"], button#checkpointSubmitButton, button:has-text("Continue"), button:has-text("Lanjutkan"), button:has-text("Kirim"), button:has-text("Konfirmasi"), button:has-text("Confirm")').first();
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
            const otpInput = page.locator('input[name="approvals_code"], input[id="approvals_code"], input[name*="code" i], input[autocomplete="one-time-code"], input[placeholder*="Code" i], input[placeholder*="Kode" i], input[type="number"], input[type="text"]').first();
            if (await otpInput.isVisible().catch(() => false)) {
              await otpInput.click({ force: true });
              await typeHumanLike(page, otpInput, otpCode);
              await randomDelay(800, 1500);

              const submitOtpBtn = page.locator('button[type="submit"], button#checkpointSubmitButton, button:has-text("Continue"), button:has-text("Lanjutkan"), button:has-text("Kirim"), button:has-text("Konfirmasi"), button:has-text("Confirm")').first();
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

      activeLoginSessions.delete(account.id);

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
      activeLoginSessions.delete(account.id);
      logger.error(`[${account.id}] Gagal saat proses login:`, err);
      const errorScreenshotPath = path.join(paths.logsDir, `error_login_${account.id}_${Date.now()}.png`);
      await page.screenshot({ path: errorScreenshotPath }).catch(() => {});
      await close().catch(() => {});
      return { success: false, error: err.message };
    }
  }

  /**
   * Mengambil screenshot layar browser yang sedang aktif saat login (on-demand)
   */
  static async captureLoginScreenshot(accountId) {
    const page = activeLoginSessions.get(accountId);
    if (!page || page.isClosed()) return null;
    try {
      const screenshotPath = path.join(paths.logsDir, `live_${accountId}_${Date.now()}.png`);
      await page.screenshot({ path: screenshotPath });
      return { screenshotPath, currentUrl: page.url() };
    } catch (err) {
      logger.warn(`Gagal capture live screenshot untuk [${accountId}]: ${err.message}`);
      return null;
    }
  }

  /**
   * Mendapatkan URL aktif browser saat proses login
   */
  static getActiveLoginUrl(accountId) {
    const page = activeLoginSessions.get(accountId);
    if (!page || page.isClosed()) return null;
    try {
      return page.url();
    } catch {
      return null;
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

  /**
   * Mendeteksi dan mencoba menyelesaikan reCAPTCHA Google secara otomatis jika muncul
   */
  static async handleRecaptcha(page) {
    if (!page || page.isClosed()) return false;
    try {
      // 1. Periksa iframe Google reCAPTCHA
      const frames = page.frames();
      for (const frame of frames) {
        const frameUrl = frame.url();
        if (
          frameUrl.includes('google.com/recaptcha') || 
          frameUrl.includes('recaptcha/enterprise') || 
          frameUrl.includes('recaptcha/api2')
        ) {
          const checkbox = frame.locator('#recaptcha-anchor, .recaptcha-checkbox, div[role="checkbox"]').first();
          if (await checkbox.isVisible({ timeout: 1000 }).catch(() => false)) {
            const ariaChecked = await checkbox.getAttribute('aria-checked').catch(() => 'false');
            if (ariaChecked !== 'true') {
              logger.info('Mendeteksi Google reCAPTCHA ("Saya bukan robot"), mencoba klik otomatis...');
              await checkbox.click({ force: true }).catch(() => {});
              await randomDelay(3000, 4500);

              // Cek apakah ada tombol Submit / Lanjutkan di halaman utama setelah dicentang
              const submitSelectors = [
                'button[type="submit"]',
                'button:has-text("Lanjutkan")',
                'button:has-text("Continue")',
                'button:has-text("Kirim")',
                'button:has-text("Submit")',
                'input[type="submit"]'
              ];
              for (const sel of submitSelectors) {
                const btn = page.locator(sel).first();
                if (await btn.isVisible({ timeout: 1000 }).catch(() => false)) {
                  await btn.click({ force: true }).catch(() => {});
                  break;
                }
              }
              return true;
            }
          }
        }
      }

      // 2. Periksa elemen langsung jika reCAPTCHA tidak dalam iframe standar
      const directCheckbox = page.locator('#recaptcha-anchor, .recaptcha-checkbox').first();
      if (await directCheckbox.isVisible({ timeout: 1000 }).catch(() => false)) {
        await directCheckbox.click({ force: true }).catch(() => {});
        await randomDelay(2000, 3000);
        return true;
      }
    } catch (e) {
      // Abaikan error pengecekan recaptcha
    }
    return false;
  }

  /**
   * Mendapatkan frame tantangan reCAPTCHA (bframe yang berisi puzzle gambar)
   */
  static getRecaptchaChallengeFrame(page) {
    if (!page || page.isClosed()) return null;
    const frames = page.frames();

    // 1. Cari frame yang secara spesifik memiliki 'bframe' di URL
    const bframe = frames.find(f => {
      const url = f.url();
      return url.includes('bframe');
    });
    if (bframe) return bframe;

    // 2. Jika tidak ada 'bframe', cari frame recaptcha yang BUKAN frame anchor (checkbox)
    for (const f of frames) {
      const url = f.url();
      if ((url.includes('google.com/recaptcha') || url.includes('recaptcha')) && !url.includes('anchor')) {
        return f;
      }
    }
    return null;
  }

  /**
   * Mengecek apakah ada tantangan puzzle gambar reCAPTCHA yang sedang terbuka
   */
  static async isRecaptchaChallengeVisible(page) {
    if (!page || page.isClosed()) return false;
    try {
      const frame = SessionManager.getRecaptchaChallengeFrame(page);
      if (!frame) return false;
      const verifyBtn = frame.locator('#recaptcha-verify-button, button:has-text("VERIFIKASI"), button:has-text("VERIFY")').first();
      return await verifyBtn.isVisible({ timeout: 1000 }).catch(() => false);
    } catch {
      return false;
    }
  }

  /**
   * Mengklik tile nomor 1-9 pada puzzle gambar reCAPTCHA (1-indexed, dari kiri ke kanan, atas ke bawah)
   */
  static async clickRecaptchaTile(accountId, tileNumber) {
    const page = activeLoginSessions.get(accountId);
    if (!page || page.isClosed()) return false;
    try {
      const frame = SessionManager.getRecaptchaChallengeFrame(page);
      if (!frame) {
        logger.warn(`[${accountId}] Frame puzzle reCAPTCHA (bframe) tidak ditemukan.`);
        return false;
      }

      // Hanya ambil elemen <td> sel tabel utama (persis 9 kotak: 3 baris x 3 kolom)
      let tiles = frame.locator('td.rc-imageselect-tile');
      let count = await tiles.count();

      // Fallback jika class rc-imageselect-tile berbeda
      if (count === 0) {
        tiles = frame.locator('table[class*="rc-imageselect-table"] td');
        count = await tiles.count();
      }

      logger.info(`[${accountId}] Ditemukan ${count} sel kotak gambar di reCAPTCHA challenge.`);

      if (count >= tileNumber && tileNumber >= 1) {
        const targetTile = tiles.nth(tileNumber - 1);
        
        // Klik langsung pada kotak target (Playwright mengklik titik tengah kotak secara presisi)
        await targetTile.click({ force: true });
        logger.info(`[${accountId}] Berhasil klik kotak nomor ${tileNumber}.`);

        // Beri jeda agar animasi fading / gambar baru sempat termuat
        await randomDelay(1800, 2500);
        return true;
      } else {
        logger.warn(`[${accountId}] Nomor kotak ${tileNumber} di luar rentang (Total kotak: ${count}).`);
      }
    } catch (err) {
      logger.warn(`[${accountId}] Gagal klik tile reCAPTCHA ${tileNumber}: ${err.message}`);
    }
    return false;
  }

  /**
   * Menekan tombol VERIFIKASI pada puzzle reCAPTCHA
   */
  static async clickRecaptchaVerify(accountId) {
    const page = activeLoginSessions.get(accountId);
    if (!page || page.isClosed()) return false;
    try {
      const frame = SessionManager.getRecaptchaChallengeFrame(page);
      if (!frame) {
        logger.warn(`[${accountId}] Frame puzzle reCAPTCHA tidak ditemukan saat verifikasi.`);
        return false;
      }

      const verifyBtn = frame.locator('#recaptcha-verify-button, button:has-text("VERIFIKASI"), button:has-text("VERIFY")').first();
      if (await verifyBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await verifyBtn.click({ force: true });
        logger.info(`[${accountId}] Tombol VERIFIKASI reCAPTCHA ditekan.`);
        await randomDelay(3000, 4500);
        return true;
      }
    } catch (err) {
      logger.warn(`[${accountId}] Gagal verifikasi reCAPTCHA: ${err.message}`);
    }
    return false;
  }

  /**
   * Menekan tombol Reload / Ganti Soal pada puzzle reCAPTCHA
   */
  static async clickRecaptchaReload(accountId) {
    const page = activeLoginSessions.get(accountId);
    if (!page || page.isClosed()) return false;
    try {
      const frame = SessionManager.getRecaptchaChallengeFrame(page);
      if (!frame) return false;

      const reloadBtn = frame.locator('#recaptcha-reload-button').first();
      if (await reloadBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await reloadBtn.click({ force: true });
        logger.info(`[${accountId}] Tombol Ganti Soal reCAPTCHA ditekan.`);
        await randomDelay(2500, 3500);
        return true;
      }
    } catch (err) {
      logger.warn(`[${accountId}] Gagal reload reCAPTCHA: ${err.message}`);
    }
    return false;
  }
}
