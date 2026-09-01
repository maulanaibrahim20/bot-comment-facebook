import { chromium } from 'playwright-extra';
import stealthPlugin from 'puppeteer-extra-plugin-stealth';
import fs from 'fs';
import { paths, getSettings } from './config.js';
import { logger } from './utils/logger.js';

// Pasang plugin stealth untuk menyamarkan fingerprint browser
chromium.use(stealthPlugin());

// Menyimpan daftar context aktif untuk penutupan aman saat exit
const activeContexts = new Set();

process.on('SIGINT', async () => {
  for (const ctx of activeContexts) {
    try {
      await ctx.close();
    } catch (e) {}
  }
  process.exit(0);
});

/**
 * Membuat instance browser Playwright dengan Persistent Context terisolasi per akun
 */
export async function createAccountBrowserContext(account, options = {}) {
  const settings = getSettings();
  const sessionPath = paths.getSessionFilePath(account.id);
  const profileDir = paths.getProfileDir(account.id);

  if (!fs.existsSync(profileDir)) {
    fs.mkdirSync(profileDir, { recursive: true });
  }

  // Konfigurasi proxy jika akun memiliki setting proxy
  let proxyConfig = undefined;
  if (account.proxy && account.proxy.server) {
    proxyConfig = {
      server: account.proxy.server
    };
    if (account.proxy.username && account.proxy.password) {
      proxyConfig.username = account.proxy.username;
      proxyConfig.password = account.proxy.password;
    }
    logger.account(account.id, `Menggunakan Proxy: ${account.proxy.server}`);
  }

  const launchOptions = {
    headless: options.headless !== undefined ? options.headless : settings.browser.headless,
    slowMo: settings.browser.slowMo || 30,
    viewport: settings.browser.viewport || { width: 1280, height: 720 },
    userAgent: account.userAgent || settings.browser.userAgent,
    locale: 'id-ID',
    timezoneId: 'Asia/Jakarta',
    permissions: ['geolocation', 'notifications'],
    geolocation: { latitude: -6.2088, longitude: 106.8456 },
    proxy: proxyConfig,
    args: [
      '--disable-blink-features=AutomationControlled',
      '--disable-notifications',
      '--disable-infobars',
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-features=IsolateOrigins,site-per-process'
    ]
  };

  // Gunakan Persistent Context (Menyimpan seluruh profile, cookies, cache, dan session secara permanen)
  const context = await chromium.launchPersistentContext(profileDir, launchOptions);
  activeContexts.add(context);

  // Dapatkan halaman pertama atau buat baru
  const pages = context.pages();
  const page = pages.length > 0 ? pages[0] : await context.newPage();

  page.setDefaultTimeout(settings.browser.timeoutMs || 60000);

  let isClosed = false;
  const safeClose = async () => {
    if (isClosed) return;
    isClosed = true;
    activeContexts.delete(context);
    try {
      await context.storageState({ path: sessionPath }).catch(() => {});
      await context.close();
    } catch (e) {}
  };

  return {
    context,
    page,
    sessionPath,
    profileDir,
    close: safeClose
  };
}
