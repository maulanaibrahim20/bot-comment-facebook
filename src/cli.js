import inquirer from 'inquirer';
import Table from 'cli-table3';
import chalk from 'chalk';
import fs from 'fs';
import { 
  getAccounts, 
  getTargets, 
  getSettings, 
  paths, 
  addAccount, 
  bulkImportAccounts, 
  deleteAccount, 
  saveAccounts, 
  saveTargets,
  hasAccountSession,
  getLimitedAccounts,
  clearAccountLimit,
  getDefaultCampaignOptions,
  updateDefaultCampaignOptions,
  clearCommentHistory
} from './config.js';

import { SessionManager } from './core/sessionManager.js';
import { Commenter } from './core/commenter.js';
import { ProfileSwitcher } from './core/profileSwitcher.js';
import { createAccountBrowserContext } from './browser.js';
import { generateVariations } from './utils/spintax.js';
import { logger } from './utils/logger.js';

export async function showMainMenu() {
  console.clear();
  const accounts = getAccounts();
  const validAccounts = accounts.filter(a => !a.username.includes('email_atau_username'));
  const targets = getTargets();

  console.log(chalk.cyan.bold(`
=====================================================
    🤖 FACEBOOK MULTI-ACCOUNT COMMENT BOT 🤖
=====================================================
  Akun Terdaftar: ${chalk.yellow(accounts.length)} | Target URL: ${chalk.yellow(targets.length)}
=====================================================
`));

  const { action } = await inquirer.prompt([
    {
      type: 'list',
      name: 'action',
      message: 'Pilih menu yang ingin dijalankan:',
      choices: [
        { name: '1. 👥 Manajemen Akun Facebook (Tambah, Import, Hapus, Cek Fanspage)', value: 'ACCOUNT_MANAGEMENT' },
        { name: '2. 🔑 Login / Simpan Sesi Akun (Bisa Buka 10+ Browser Sekaligus)', value: 'LOGIN_ACCOUNTS' },
        { name: '3. 🩺 Verifikasi Status Sesi & Pembatasan Akun (Health Check)', value: 'CHECK_SESSIONS' },
        { name: '4. 🌐 Buka Browser Akun (Inspeksi Manual / Cek Tampilan Facebook)', value: 'OPEN_BROWSER' },
        { name: '5. 🎲 Komentar di Postingan Beranda / Feed (Foto & Teks)', value: 'RUN_RANDOM_FEED' },
        { name: '6. 🎬 Komentar di Facebook REELS (Video Pendek Non-Stop)', value: 'RUN_RANDOM_REELS' },
        { name: '7. 🎯 Komentar di URL Postingan Target Tertentu', value: 'RUN_TARGET_CAMPAIGN' },
        { name: '8. 🧪 Test & Preview Spintax Komentar', value: 'TEST_SPINTAX' },
        { name: '9. ⚙️ Pengaturan Bot & Default (Template, Jeda, Identitas, Browser, Reset Riwayat)', value: 'BOT_SETTINGS' },
        { name: '10. 📱 Jalankan Telegram Bot Controller (Kontrol via HP)', value: 'RUN_TELEGRAM' },
        { name: '11. ❌ Keluar', value: 'EXIT' }
      ]
    }
  ]);

  switch (action) {
    case 'ACCOUNT_MANAGEMENT':
      await handleAccountManagement();
      break;
    case 'LOGIN_ACCOUNTS':
      await handleLoginAccounts();
      break;
    case 'CHECK_SESSIONS':
      await handleCheckSessions();
      break;
    case 'OPEN_BROWSER':
      await handleOpenBrowser();
      break;
    case 'RUN_RANDOM_FEED':
      await handleRunRandomFeed();
      break;
    case 'RUN_RANDOM_REELS':
      await handleRunRandomReels();
      break;
    case 'RUN_TARGET_CAMPAIGN':
      await handleRunTargetCampaign();
      break;
    case 'TEST_SPINTAX':
      await handleTestSpintax();
      break;
    case 'BOT_SETTINGS':
      await handleBotSettings();
      break;
    case 'RUN_TELEGRAM':
      console.log(chalk.cyan('\n🚀 Menjalankan Telegram Bot Controller...'));
      console.log(chalk.gray('Tekan Ctrl + C untuk kembali/keluar.'));
      await import('./telegram/bot.js');
      return;
    case 'EXIT':
      console.log(chalk.green('Sampai jumpa!'));
      process.exit(0);
  }



  console.log('\n');
  await inquirer.prompt([{ type: 'input', name: 'continue', message: 'Tekan ENTER untuk kembali ke menu...' }]);
  return showMainMenu();
}

/**
 * Submenu Manajemen Akun
 */
async function handleAccountManagement() {
  const { accAction } = await inquirer.prompt([
    {
      type: 'list',
      name: 'accAction',
      message: 'Menu Manajemen Akun:',
      choices: [
        { name: '📋 Lihat Daftar Akun & Status Sesi', value: 'LIST' },
        { name: '⚠️ Lihat Daftar Akun Terkena Limit Komentar', value: 'LIST_LIMITED' },
        { name: '🔄 Reset Status Limit Akun (Kembalikan ke Normal)', value: 'RESET_LIMIT' },
        { name: '🚩 Cek Halaman Facebook (Fanspage yang Dikelola)', value: 'CHECK_PAGES' },
        { name: '➕ Tambah 1 Akun Baru (Input Manual)', value: 'ADD_SINGLE' },
        { name: '📥 Bulk Import Akun (Format: email|pass|2fa|proxy)', value: 'BULK_IMPORT' },
        { name: '🧹 Reset Riwayat Konten yang Sudah Dikomentari', value: 'RESET_HISTORY' },
        { name: '🗑️ Hapus Akun', value: 'DELETE' },
        { name: '🔙 Kembali ke Menu Utama', value: 'BACK' }
      ]
    }
  ]);

  if (accAction === 'LIST') {
    await renderAccountTable();
  } else if (accAction === 'LIST_LIMITED') {
    await handleViewLimitedAccounts();
  } else if (accAction === 'RESET_LIMIT') {
    await handleResetAccountLimit();
  } else if (accAction === 'CHECK_PAGES') {
    await handleCheckPages();
  } else if (accAction === 'ADD_SINGLE') {
    await handleAddSingleAccount();
  } else if (accAction === 'BULK_IMPORT') {
    await handleBulkImport();
  } else if (accAction === 'RESET_HISTORY') {
    const { confirm } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirm',
        message: 'Apakah Anda yakin ingin mereset riwayat postingan / Reels yang sudah dikomentari? (Akun akan bisa mengomentari kembali postingan lama):',
        default: false
      }
    ]);
    if (confirm) {
      clearCommentHistory();
      logger.success('🧹 Riwayat komentar berhasil direset! Semua akun dapat berkomentar lagi di postingan sebelumnya.');
    }
  } else if (accAction === 'DELETE') {
    await handleDeleteAccount();
  }
}

async function renderAccountTable() {
  const accounts = getAccounts();
  if (accounts.length === 0) {
    console.log(chalk.yellow('Belum ada akun terdaftar. Gunakan opsi Tambah / Import Akun.'));
    return;
  }

  const table = new Table({
    head: [
      chalk.cyan('ID'),
      chalk.cyan('Nama'),
      chalk.cyan('Username / Email'),
      chalk.cyan('Proxy'),
      chalk.cyan('2FA'),
      chalk.cyan('Session'),
      chalk.cyan('Status / Limit')
    ],
    colWidths: [10, 16, 26, 18, 8, 14, 25]
  });

  for (const acc of accounts) {
    const sessionExists = hasAccountSession(acc.id);
    const proxyText = acc.proxy?.server ? chalk.green(acc.proxy.server) : chalk.gray('Direct');
    const twoFaText = acc.twoFactorSecret ? chalk.green('Ada') : chalk.gray('-');
    const sessionText = sessionExists ? chalk.green('Tersimpan') : chalk.red('Belum Ada');

    let statusText = chalk.green('✅ Normal');
    if (acc.isLimited) {
      statusText = chalk.red.bold('🛑 LIMIT KOMENTAR');
    }

    table.push([acc.id, acc.name || '-', acc.username, proxyText, twoFaText, sessionText, statusText]);
  }

  console.log(table.toString());
}

/**
 * Menampilkan daftar rincian akun-akun yang saat ini berstatus limit komentar
 */
async function handleViewLimitedAccounts() {
  const limitedAccounts = getLimitedAccounts();
  console.log(chalk.bold.yellow('\n======================================================'));
  console.log(chalk.bold.yellow('   ⚠️ DAFTAR AKUN TERKENA LIMIT KOMENTAR FACEBOOK     '));
  console.log(chalk.bold.yellow('======================================================'));

  if (limitedAccounts.length === 0) {
    console.log(chalk.green('🎉 Tidak ada akun yang terkena limit! Semua akun berstatus Normal.\n'));
    return;
  }

  limitedAccounts.forEach((acc, idx) => {
    const dateFormatted = acc.limitedAt ? new Date(acc.limitedAt).toLocaleString('id-ID') : '-';
    console.log(`${chalk.cyan(idx + 1 + '.')} [${chalk.bold(acc.id)}] ${chalk.bold(acc.name || acc.username)} (${acc.username})`);
    console.log(`   ${chalk.red('• Alasan Limit:')} ${acc.limitReason || 'Limit komentar tercapai'}`);
    console.log(`   ${chalk.gray('• Waktu Terdeteksi:')} ${dateFormatted}`);
    console.log(`   ${chalk.yellow('• Catatan:')} ${acc.note || '-'}`);
    console.log(chalk.gray('------------------------------------------------------'));
  });
  console.log(chalk.cyan(`Total: ${limitedAccounts.length} akun dalam status pembatasan.\n`));
}

/**
 * Mereset status limit akun agar kembali normal
 */
async function handleResetAccountLimit() {
  const limitedAccounts = getLimitedAccounts();
  if (limitedAccounts.length === 0) {
    console.log(chalk.green('\n🎉 Tidak ada akun yang terkena limit untuk direset.\n'));
    return;
  }

  const choices = limitedAccounts.map((acc) => ({
    name: `[${acc.id}] ${acc.username} - ${acc.limitReason || 'Limit'}`,
    value: acc.id
  }));

  choices.push(new inquirer.Separator());
  choices.push({ name: '🔄 Reset SEMUA Akun yang Terkena Limit', value: 'ALL' });
  choices.push({ name: '🔙 Batal / Kembali', value: 'CANCEL' });

  const { targetToReset } = await inquirer.prompt([
    {
      type: 'list',
      name: 'targetToReset',
      message: 'Pilih akun yang ingin direset status limitnya ke Normal:',
      choices
    }
  ]);

  if (targetToReset === 'CANCEL') return;

  if (targetToReset === 'ALL') {
    for (const acc of limitedAccounts) {
      clearAccountLimit(acc.id);
    }
    logger.success(`🎉 Berhasil mereset status limit untuk ${limitedAccounts.length} akun! Semua kembali normal.`);
  } else {
    clearAccountLimit(targetToReset);
    logger.success(`🎉 Status limit untuk akun [${targetToReset}] berhasil direset ke Normal.`);
  }
}

async function handleAddSingleAccount() {
  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'name',
      message: 'Nama Panggilan Akun (opsional):',
      default: 'Akun FB'
    },
    {
      type: 'input',
      name: 'username',
      message: 'Username / Email / No. Handphone Facebook:',
      validate: (input) => input.trim().length > 0 ? true : 'Username/Email tidak boleh kosong!'
    },
    {
      type: 'input',
      name: 'password',
      message: 'Password Facebook:',
      validate: (input) => input.trim().length > 0 ? true : 'Password tidak boleh kosong!'
    },
    {
      type: 'input',
      name: 'twoFactorSecret',
      message: '2FA Secret Key (Base32, kosongkan jika tidak pakai 2FA):'
    },
    {
      type: 'input',
      name: 'proxyServer',
      message: 'Proxy Server (misal: http://ip:port, kosongkan jika tanpa proxy):'
    }
  ]);

  const newAccount = {
    name: answers.name,
    username: answers.username.trim(),
    password: answers.password.trim(),
    twoFactorSecret: answers.twoFactorSecret.trim(),
    proxy: answers.proxyServer.trim() ? { server: answers.proxyServer.trim() } : null,
    enabled: true
  };

  const added = addAccount(newAccount);
  logger.success(`Akun [${added.id}] "${added.username}" berhasil ditambahkan ke sistem!`);
}

async function handleBulkImport() {
  console.log(chalk.yellow(`
Format per baris:
  email|password|2fa_secret|proxy
  email|password|2fa_secret
  email|password
  email:password

Contoh:
  user1@gmail.com|pass123|JBSWY3DPEHPK3PXP|http://127.0.0.1:8080
  user2@gmail.com|pass456
`));

  const { rawText } = await inquirer.prompt([
    {
      type: 'editor',
      name: 'rawText',
      message: 'Tekan Enter untuk membuka editor dan paste daftar akun Anda, lalu simpan & tutup editor:'
    }
  ]);

  if (!rawText || rawText.trim().length === 0) {
    logger.warn('Tidak ada data akun yang dimasukkan.');
    return;
  }

  const imported = bulkImportAccounts(rawText);
  if (imported.length > 0) {
    logger.success(`Berhasil mengimpor ${imported.length} akun baru!`);
    await renderAccountTable();
  } else {
    logger.error('Format data tidak valid atau baris tidak terbaca.');
  }
}

async function handleDeleteAccount() {
  const accounts = getAccounts();
  if (accounts.length === 0) {
    logger.warn('Tidak ada akun untuk dihapus.');
    return;
  }

  const { accountId } = await inquirer.prompt([
    {
      type: 'list',
      name: 'accountId',
      message: 'Pilih akun yang ingin dihapus:',
      choices: [
        ...accounts.map((a) => ({ name: `${a.id} - ${a.username} (${a.name})`, value: a.id })),
        { name: '❌ Batalkan', value: 'CANCEL' }
      ]
    }
  ]);

  if (accountId === 'CANCEL') return;

  const { deleteSession } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'deleteSession',
      message: 'Hapus file sesi & direktori profil browser akun ini juga?',
      default: true
    }
  ]);

  deleteAccount(accountId, deleteSession);
  if (deleteSession) {
    logger.success(`Akun [${accountId}] dan file sesinya berhasil dihapus.`);
  } else {
    logger.success(`Akun [${accountId}] berhasil dihapus (file sesi tetap disimpan).`);
  }
}

/**
 * Login & Session Handler (Mendukung Paralel / Bersamaan)
 */
async function handleLoginAccounts() {
  let accounts = getAccounts();
  
  const isDefaultDummy = accounts.length === 1 && accounts[0].username.includes('email_atau_username');
  if (isDefaultDummy) {
    logger.warn('Akun yang ada saat ini masih data contoh (placeholder). Silakan tambahkan akun Facebook Anda terlebih dahulu.');
    const { tambahSekarang } = await inquirer.prompt([
      { type: 'confirm', name: 'tambahSekarang', message: 'Ingin menambahkan akun Facebook Anda sekarang?', default: true }
    ]);
    if (tambahSekarang) {
      await handleAddSingleAccount();
      accounts = getAccounts();
    } else {
      return;
    }
  }

  const { targetMode } = await inquirer.prompt([
    {
      type: 'list',
      name: 'targetMode',
      message: 'Pilih akun yang ingin di-login:',
      choices: [
        { name: `🚀 Semua Akun (${accounts.length} Akun)`, value: 'ALL' },
        ...accounts.map((acc) => ({ name: `${acc.id} - ${acc.username} (${acc.name || ''})`, value: acc.id }))
      ]
    }
  ]);

  const { headless } = await inquirer.prompt([
    {
      type: 'list',
      name: 'headless',
      message: 'Tampilan Jendela Web Browser saat Login:',
      choices: [
        { name: '🖥️ Buka Jendela Browser (Terlihat / Non-Headless) [Rekomendasi agar proses terlihat]', value: false },
        { name: '🕶️ Jalankan di Latar Belakang (Headless / Tanpa Jendela)', value: true }
      ],
      default: false
    }
  ]);

  const accountsToLogin = targetMode === 'ALL' ? accounts : accounts.filter((a) => a.id === targetMode);

  if (accountsToLogin.length > 1) {
    const { concurrency } = await inquirer.prompt([
      {
        type: 'number',
        name: 'concurrency',
        message: `Berapa browser yang ingin dibuka bersamaan (Paralel)? (1 - ${accountsToLogin.length}):`,
        default: accountsToLogin.length
      }
    ]);

    await SessionManager.loginAccountsParallel(accountsToLogin, {
      concurrency: Math.max(1, concurrency || 1),
      headless
    });
  } else {
    for (const acc of accountsToLogin) {
      logger.info(`\nMemproses Login Akun [${acc.id}]...`);
      await SessionManager.loginAccount(acc, { headless });
    }
  }
}

async function handleCheckSessions() {
  const accounts = getAccounts();
  if (accounts.length === 0) {
    logger.warn('Belum ada akun di sistem.');
    return;
  }

  logger.info('Mengecek status sesi dan pembatasan Facebook untuk semua akun...');
  for (const acc of accounts) {
    const res = await SessionManager.verifySession(acc);
    if (res.isValid) {
      if (res.isRestricted) {
        logger.warn(`[${acc.id}] ⚠️ Sesi AKTIF tetapi TERKENA PEMBATASAN: ${res.restrictionReason || 'Limit komentar Facebook'}`);
      } else {
        logger.success(`[${acc.id}] ✅ Sesi AKTIF & Siap Berkomentar (Tidak ada limit)`);
      }
    } else {
      logger.error(`[${acc.id}] ❌ Sesi KADALUARSA / Checkpoint`);
    }
  }
}

/**
 * Memeriksa daftar Halaman Facebook (Fanspage) yang dimiliki oleh akun
 */
async function handleCheckPages() {
  const accounts = getAccounts();
  if (accounts.length === 0) {
    logger.warn('Belum ada akun di sistem.');
    return;
  }

  const { targetMode } = await inquirer.prompt([
    {
      type: 'list',
      name: 'targetMode',
      message: 'Pilih akun yang ingin dicek Halaman Facebook-nya:',
      choices: [
        { name: `🚀 Semua Akun (${accounts.length} Akun)`, value: 'ALL' },
        ...accounts.map((acc) => ({ name: `${acc.id} - ${acc.username}`, value: acc.id }))
      ]
    }
  ]);

  const accountsToCheck = targetMode === 'ALL' ? accounts : accounts.filter((a) => a.id === targetMode);

  for (const acc of accountsToCheck) {
    if (!hasAccountSession(acc.id)) {
      logger.warn(`[${acc.id}] Akun belum login. Silakan login terlebih dahulu.`);
      continue;
    }

    logger.info(`\n🔍 [${acc.id}] Memeriksa daftar Halaman Facebook...`);
    let browserInstance = null;
    try {
      browserInstance = await createAccountBrowserContext(acc, { headless: true });
      const pages = await ProfileSwitcher.getAccountPages(browserInstance.page);
      await browserInstance.close();

      if (pages.length > 0) {
        logger.success(`[${acc.id}] Ditemukan ${pages.length} Halaman Facebook (Fanspage):`);
        pages.forEach((p, idx) => {
          console.log(chalk.cyan(`   ${idx + 1}. 🚩 ${p.name}`));
        });
      } else {
        logger.info(`[${acc.id}] ℹ️ Tidak ditemukan Halaman Facebook (Akun hanya memiliki Profil Pribadi).`);
      }
    } catch (e) {
      if (browserInstance?.close) await browserInstance.close().catch(() => {});
      logger.error(`[${acc.id}] Gagal memeriksa Halaman:`, e.message);
    }
  }
}

/**
 * Membuka jendela browser akun secara manual agar pengguna dapat melihat / memeriksa Facebook langsung
 */
async function handleOpenBrowser() {
  const accounts = getAccounts();
  if (accounts.length === 0) {
    logger.warn('Belum ada akun di sistem.');
    return;
  }

  const { accountId } = await inquirer.prompt([
    {
      type: 'list',
      name: 'accountId',
      message: 'Pilih akun yang ingin dibuka browser-nya:',
      choices: accounts.map((acc) => ({
        name: `${acc.id} - ${acc.username} (${hasAccountSession(acc.id) ? '✅ Sesi Tersimpan' : '❌ Belum Ada Sesi'})`,
        value: acc.id
      }))
    }
  ]);

  const account = accounts.find((a) => a.id === accountId);
  logger.info(`\n🌐 Membuka jendela web browser untuk [${account.id}] (${account.username})...`);
  logger.info(`Browser akan terbuka dengan sesi login Anda. Silakan cek profil, halaman, atau notifikasi Facebook.`);

  let browserInstance = null;
  try {
    browserInstance = await createAccountBrowserContext(account, { headless: false });
    await browserInstance.page.goto('https://www.facebook.com/', { waitUntil: 'domcontentloaded' });

    console.log(chalk.green('\n🖥️ Browser telah berhasil terbuka di layar Anda!'));
    await inquirer.prompt([
      {
        type: 'input',
        name: 'done',
        message: 'Tekan ENTER di terminal ini jika Anda sudah selesai untuk menutup browser...'
      }
    ]);

    await browserInstance.close();
    logger.success(`Browser untuk [${account.id}] telah ditutup dengan aman.`);
  } catch (e) {
    if (browserInstance?.close) await browserInstance.close().catch(() => {});
    logger.error(`Gagal membuka browser:`, e.message);
  }
}

/**
 * Helper interaktif untuk memilih filter jumlah komentar pada postingan / Reels
 */
async function promptCommentCountFilter(defaultOpts = {}) {
  const defaultMin = defaultOpts.minComments || 0;
  const defaultMax = defaultOpts.maxComments || 0;

  let initialChoice = 'ALL';
  if (defaultMin === 0 && defaultMax === 50) initialChoice = 'MAX_50';
  else if (defaultMin === 0 && defaultMax === 100) initialChoice = 'MAX_100';
  else if (defaultMin > 0 && defaultMax > 0) initialChoice = 'RANGE';
  else if (defaultMax > 0) initialChoice = 'CUSTOM_MAX';

  const { commentFilterMode } = await inquirer.prompt([
    {
      type: 'list',
      name: 'commentFilterMode',
      message: 'Filter Jumlah Komentar pada Postingan / Reels yang dituju:',
      choices: [
        { name: '🌐 Semua Postingan / Reels (Tanpa Batasan / Bebas)', value: 'ALL' },
        { name: '🎯 Maksimal 50 Komentar (Cari yang Masih Baru / Sepi)', value: 'MAX_50' },
        { name: '🎯 Maksimal 100 Komentar (Cari yang Sedang)', value: 'MAX_100' },
        { name: '🎯 Range Kustom (Contoh: 50 - 60 atau 10 - 50 komentar)', value: 'RANGE' },
        { name: '🎯 Maksimal Kustom (Contoh: Maksimal 150 komentar)', value: 'CUSTOM_MAX' }
      ],
      default: initialChoice
    }
  ]);

  let minComments = 0;
  let maxComments = 0;

  if (commentFilterMode === 'MAX_50') {
    maxComments = 50;
  } else if (commentFilterMode === 'MAX_100') {
    maxComments = 100;
  } else if (commentFilterMode === 'CUSTOM_MAX') {
    const { customMax } = await inquirer.prompt([
      {
        type: 'number',
        name: 'customMax',
        message: 'Masukkan batas maksimal jumlah komentar yang diinginkan (misal: 100):',
        default: defaultMax > 0 ? defaultMax : 100
      }
    ]);
    maxComments = customMax || 100;
  } else if (commentFilterMode === 'RANGE') {
    const { rangeMin, rangeMax } = await inquirer.prompt([
      {
        type: 'number',
        name: 'rangeMin',
        message: 'Masukkan jumlah komentar minimal (misal: 50):',
        default: defaultMin > 0 ? defaultMin : 50
      },
      {
        type: 'number',
        name: 'rangeMax',
        message: 'Masukkan jumlah komentar maksimal (misal: 60):',
        default: defaultMax > 0 ? defaultMax : 60
      }
    ]);
    minComments = rangeMin || 0;
    maxComments = rangeMax || 0;
  }

  return { minComments, maxComments };
}

/**
 * Kampanye Komentar Acak di Beranda (Feed) - Mendukung Paralel
 */
async function handleRunRandomFeed() {
  const accounts = getAccounts();
  if (accounts.length === 0) {
    logger.warn('Belum ada akun di sistem.');
    return;
  }

  const defaultOpts = getDefaultCampaignOptions();

  // 1. Pilih Identitas Pengirim Komentar (Pertanyaan Pertama)
  const { commentAs } = await inquirer.prompt([
    {
      type: 'list',
      name: 'commentAs',
      message: 'Pilih Identitas Pengirim Komentar:',
      choices: [
        { name: '👤 Profil Pribadi (Akun Utama Facebook)', value: 'PERSONAL' },
        { name: '🚩 Halaman Facebook (Fanspage yang Dikelola Akun)', value: 'PAGE' }
      ],
      default: defaultOpts.commentAs || 'PERSONAL'
    }
  ]);

  let targetPageName = '';
  if (commentAs === 'PAGE') {
    const { pageNameInput } = await inquirer.prompt([
      {
        type: 'input',
        name: 'pageNameInput',
        message: 'Nama Halaman Facebook yang dituju (Kosongkan / tekan ENTER untuk otomatis Halaman pertama):',
        default: defaultOpts.targetPageName || ''
      }
    ]);
    targetPageName = pageNameInput.trim();
  }

  // 2. Pilih Target Jumlah Komentar
  const { modeOption } = await inquirer.prompt([
    {
      type: 'list',
      name: 'modeOption',
      message: 'Pilih target jumlah komentar postingan per akun:',
      choices: [
        { name: '10 Postingan per Akun (Standar Aman)', value: 10 },
        { name: '20 Postingan per Akun', value: 20 },
        { name: '50 Postingan per Akun', value: 50 },
        { name: '🔥 Mode Terus-Menerus / Tanpa Batas (Non-Stop Loop)', value: 0 },
        { name: '✍️ Tentukan Jumlah Kustom Sendiri', value: 'CUSTOM' }
      ]
    }
  ]);

  let countPerAccount = modeOption;
  if (modeOption === 'CUSTOM') {
    const { customCount } = await inquirer.prompt([
      {
        type: 'number',
        name: 'customCount',
        message: 'Masukkan jumlah postingan yang ingin dikomentari (0 untuk tanpa batas):',
        default: 10
      }
    ]);
    countPerAccount = customCount !== undefined ? customCount : 10;
  }

  // 3. Filter Rentang Jumlah Komentar Postingan
  const { minComments, maxComments } = await promptCommentCountFilter(defaultOpts);

  // 4. Pengaturan Spintax, Jeda, Paralel, dan Tampilan Browser
  const { template, delaySeconds, concurrency, headless } = await inquirer.prompt([
    {
      type: 'input',
      name: 'template',
      message: 'Format Spintax Komentar / Link:',
      default: defaultOpts.commentTemplate || '{Halo|Hai|Permisi} kak, {menarik sekali informasinya|sangat bermanfaat|keren postingannya}! {Salam kenal ya kak|Semoga sehat selalu|Salam sukses}.'
    },
    {
      type: 'number',
      name: 'delaySeconds',
      message: 'Jeda waktu antar komentar di akun yang sama (detik) [Rekomendasi: 10-25 detik]:',
      default: defaultOpts.delaySeconds || 15
    },
    {
      type: 'number',
      name: 'concurrency',
      message: `Berapa akun/browser yang berjalan bersamaan (Paralel)? (1 - ${accounts.length}):`,
      default: Math.min(5, accounts.length)
    },
    {
      type: 'list',
      name: 'headless',
      message: 'Tampilan Jendela Web Browser:',
      choices: [
        { name: '🖥️ Buka Jendela Browser (Terlihat / Non-Headless) [Rekomendasi: bisa dipantau langsung]', value: false },
        { name: '🕶️ Jalankan di Latar Belakang (Headless / Tanpa Jendela)', value: true }
      ],
      default: defaultOpts.headless !== undefined ? defaultOpts.headless : false
    }
  ]);

  await Commenter.runRandomFeedCampaign(accounts, {
    count: countPerAccount,
    commentTemplate: template,
    delaySeconds: delaySeconds || 15,
    concurrency: Math.max(1, concurrency || 1),
    commentAs,
    targetPageName,
    headless,
    minComments,
    maxComments
  });
}

/**
 * Kampanye Komentar di Facebook REELS (Video Pendek) - Mendukung Paralel
 */
async function handleRunRandomReels() {
  const accounts = getAccounts();
  if (accounts.length === 0) {
    logger.warn('Belum ada akun di sistem.');
    return;
  }

  const defaultOpts = getDefaultCampaignOptions();

  // 1. Pilih Identitas Pengirim Komentar (Pertanyaan Pertama)
  const { commentAs } = await inquirer.prompt([
    {
      type: 'list',
      name: 'commentAs',
      message: 'Pilih Identitas Pengirim Komentar:',
      choices: [
        { name: '👤 Profil Pribadi (Akun Utama Facebook)', value: 'PERSONAL' },
        { name: '🚩 Halaman Facebook (Fanspage yang Dikelola Akun)', value: 'PAGE' }
      ],
      default: defaultOpts.commentAs || 'PERSONAL'
    }
  ]);

  let targetPageName = '';
  if (commentAs === 'PAGE') {
    const { pageNameInput } = await inquirer.prompt([
      {
        type: 'input',
        name: 'pageNameInput',
        message: 'Nama Halaman Facebook yang dituju (Kosongkan / tekan ENTER untuk otomatis Halaman pertama):',
        default: defaultOpts.targetPageName || ''
      }
    ]);
    targetPageName = pageNameInput.trim();
  }

  // 2. Pilih Target Jumlah Komentar Reels
  const { modeOption } = await inquirer.prompt([
    {
      type: 'list',
      name: 'modeOption',
      message: 'Pilih target jumlah komentar Facebook Reels per akun:',
      choices: [
        { name: '10 Reels per Akun (Standar Aman)', value: 10 },
        { name: '20 Reels per Akun', value: 20 },
        { name: '50 Reels per Akun', value: 50 },
        { name: '🔥 Mode Terus-Menerus / Tanpa Batas (Non-Stop Loop)', value: 0 },
        { name: '✍️ Tentukan Jumlah Kustom Sendiri', value: 'CUSTOM' }
      ]
    }
  ]);

  let countPerAccount = modeOption;
  if (modeOption === 'CUSTOM') {
    const { customCount } = await inquirer.prompt([
      {
        type: 'number',
        name: 'customCount',
        message: 'Masukkan jumlah video Reels yang ingin dikomentari (0 untuk tanpa batas):',
        default: 10
      }
    ]);
    countPerAccount = customCount !== undefined ? customCount : 10;
  }

  // 3. Filter Rentang Jumlah Komentar Reels
  const { minComments, maxComments } = await promptCommentCountFilter(defaultOpts);

  // 4. Pengaturan Spintax, Jeda, Paralel, dan Tampilan Browser
  const { template, delaySeconds, concurrency, headless } = await inquirer.prompt([
    {
      type: 'input',
      name: 'template',
      message: 'Format Spintax Komentar / Link untuk Reels:',
      default: defaultOpts.commentTemplate || '{Halo|Hai|Permisi} kak, {keren banget videonya|menarik sekali|suka videonya}! {Salam kenal ya kak|Semoga sehat selalu|Salam sukses}.'
    },
    {
      type: 'number',
      name: 'delaySeconds',
      message: 'Jeda waktu antar komentar di akun yang sama (detik) [Rekomendasi: 10-25 detik]:',
      default: defaultOpts.delaySeconds || 15
    },
    {
      type: 'number',
      name: 'concurrency',
      message: `Berapa akun/browser yang berjalan bersamaan (Paralel)? (1 - ${accounts.length}):`,
      default: Math.min(5, accounts.length)
    },
    {
      type: 'list',
      name: 'headless',
      message: 'Tampilan Jendela Web Browser:',
      choices: [
        { name: '🖥️ Buka Jendela Browser (Terlihat / Non-Headless) [Rekomendasi: bisa dipantau langsung]', value: false },
        { name: '🕶️ Jalankan di Latar Belakang (Headless / Tanpa Jendela)', value: true }
      ],
      default: defaultOpts.headless !== undefined ? defaultOpts.headless : false
    }
  ]);

  await Commenter.runRandomReelsCampaign(accounts, {
    count: countPerAccount,
    commentTemplate: template,
    delaySeconds: delaySeconds || 15,
    concurrency: Math.max(1, concurrency || 1),
    commentAs,
    targetPageName,
    headless,
    minComments,
    maxComments
  });
}

/**
 * Kampanye Komentar ke URL Target Tertentu - Mendukung Paralel
 */
async function handleRunTargetCampaign() {
  const accounts = getAccounts();
  let targets = getTargets();

  const { mode } = await inquirer.prompt([
    {
      type: 'list',
      name: 'mode',
      message: 'Pilih metode target:',
      choices: [
        { name: `🎯 Gunakan daftar target dari config/targets.json (${targets.length} Target)`, value: 'SAVED' },
        { name: '✍️ Masukkan 1 URL Postingan Target Secara Langsung', value: 'DIRECT' }
      ]
    }
  ]);

  if (mode === 'DIRECT') {
    const { postUrl, commentTemplate } = await inquirer.prompt([
      {
        type: 'input',
        name: 'postUrl',
        message: 'Masukkan URL Postingan Facebook:',
        validate: (input) => input.startsWith('http') ? true : 'URL harus diawali dengan http/https'
      },
      {
        type: 'input',
        name: 'commentTemplate',
        message: 'Format Spintax Komentar:',
        default: '{Halo|Hai|Permisi} kak, {keren banget|mantap sekali|luar biasa}! {Cek profil kami ya|Salam kenal ya kak}.'
      }
    ]);

    targets = [{ id: 'direct_target', postUrl, commentTemplate, active: true }];
  }

  const { concurrency, headless } = await inquirer.prompt([
    {
      type: 'number',
      name: 'concurrency',
      message: `Berapa browser yang berjalan bersamaan (Paralel)? (1 - ${accounts.length}):`,
      default: Math.min(5, accounts.length)
    },
    {
      type: 'list',
      name: 'headless',
      message: 'Tampilan Jendela Web Browser:',
      choices: [
        { name: '🖥️ Buka Jendela Browser (Terlihat / Non-Headless) [Rekomendasi: bisa dipantau langsung]', value: false },
        { name: '🕶️ Jalankan di Latar Belakang (Headless / Tanpa Jendela)', value: true }
      ],
      default: false
    }
  ]);

  await Commenter.runCampaign(accounts, targets, { 
    concurrency: Math.max(1, concurrency || 1),
    headless 
  });
}

async function handleTestSpintax() {
  const defaultTemplate = '{Halo|Hai|Permisi} kak, {terima kasih informasinya|kontennya bagus sekali|sangat menginspirasi}! {Cek bio kami ya|Salam kenal}.';

  const { template } = await inquirer.prompt([
    {
      type: 'input',
      name: 'template',
      message: 'Masukkan teks format Spintax yang ingin diuji:',
      default: defaultTemplate
    }
  ]);

  console.log(chalk.yellow('\n--- 5 Contoh Variasi Hasil Acak ---'));
  const variations = generateVariations(template, 5);
  variations.forEach((v, idx) => {
    console.log(chalk.cyan(`${idx + 1}. `) + chalk.white(v));
  });
}

/**
 * Pengaturan Bot & Default Kampanye (Sinkron dengan Telegram)
 */
async function handleBotSettings() {
  const currentDefaults = getDefaultCampaignOptions();

  const filterText = currentDefaults.minComments > 0 && currentDefaults.maxComments > 0 
    ? `${currentDefaults.minComments} - ${currentDefaults.maxComments} komentar` 
    : (currentDefaults.maxComments > 0 ? `Maksimal ${currentDefaults.maxComments} komentar` : (currentDefaults.minComments > 0 ? `Minimal ${currentDefaults.minComments} komentar` : 'Bebas (Tanpa Batas)'));

  console.log(chalk.cyan.bold('\n⚙️ PENGATURAN BOT & DEFAULT KAMPANYE:'));
  console.log(chalk.gray('Pengaturan ini tersinkronisasi langsung dengan bot Telegram & kampanye CLI.'));
  console.log(`• Template Komentar Default: ${chalk.yellow(currentDefaults.commentTemplate)}`);
  console.log(`• Jeda Waktu Default: ${chalk.yellow(currentDefaults.delaySeconds)} detik`);
  console.log(`• Identitas Default: ${chalk.yellow(currentDefaults.commentAs === 'PAGE' ? 'Halaman Facebook (Fanspage)' : 'Profil Pribadi')}`);
  console.log(`• Tampilan Browser Default: ${chalk.yellow(currentDefaults.headless ? 'Latar Belakang (Headless)' : 'Buka Jendela (Terlihat)')}`);
  console.log(`• Filter Komentar Target: ${chalk.yellow(filterText)}`);

  const { subAction } = await inquirer.prompt([
    {
      type: 'list',
      name: 'subAction',
      message: 'Pilih aksi pengaturan:',
      choices: [
        { name: '1. ✏️ Ubah Template Komentar Default (Spintax / Link)', value: 'EDIT_TEMPLATE' },
        { name: '2. ⏱️ Ubah Jeda Waktu Default (Detik)', value: 'EDIT_DELAY' },
        { name: '3. 🎭 Ubah Identitas Pengirim Default (Profil vs Halaman)', value: 'EDIT_IDENTITY' },
        { name: '4. 🖥️ Ubah Mode Tampilan Browser Default (Terlihat vs Headless)', value: 'EDIT_BROWSER_VIEW' },
        { name: '5. 🎯 Ubah Filter Jumlah Komentar Default (Maksimal / Range)', value: 'EDIT_COMMENT_FILTER' },
        { name: '6. 🧹 Reset Riwayat Postingan / Reels yang Sudah Dikomentari', value: 'RESET_HISTORY' },
        { name: '7. 🔙 Kembali ke Menu Utama', value: 'BACK' }
      ]
    }
  ]);

  if (subAction === 'EDIT_TEMPLATE') {
    const { newTemplate } = await inquirer.prompt([
      {
        type: 'input',
        name: 'newTemplate',
        message: 'Masukkan teks komentar baru atau link tautan:',
        default: currentDefaults.commentTemplate
      }
    ]);
    updateDefaultCampaignOptions({ commentTemplate: newTemplate });
    logger.success('✅ Template komentar default berhasil diperbarui!');
  } else if (subAction === 'EDIT_DELAY') {
    const { newDelay } = await inquirer.prompt([
      {
        type: 'number',
        name: 'newDelay',
        message: 'Masukkan jeda waktu antar komentar (dalam detik, misal: 15):',
        default: currentDefaults.delaySeconds
      }
    ]);
    updateDefaultCampaignOptions({ delaySeconds: newDelay || 15 });
    logger.success('✅ Jeda waktu default berhasil diperbarui!');
  } else if (subAction === 'EDIT_IDENTITY') {
    const { newIdentity } = await inquirer.prompt([
      {
        type: 'list',
        name: 'newIdentity',
        message: 'Pilih identitas pengirim default:',
        choices: [
          { name: '👤 Profil Pribadi (Akun Utama Facebook)', value: 'PERSONAL' },
          { name: '🚩 Halaman Facebook (Fanspage)', value: 'PAGE' }
        ],
        default: currentDefaults.commentAs
      }
    ]);
    updateDefaultCampaignOptions({ commentAs: newIdentity });
    logger.success('✅ Identitas pengirim default berhasil diperbarui!');
  } else if (subAction === 'EDIT_BROWSER_VIEW') {
    const { newHeadless } = await inquirer.prompt([
      {
        type: 'list',
        name: 'newHeadless',
        message: 'Pilih tampilan jendela browser default:',
        choices: [
          { name: '🖥️ Buka Jendela Browser (Terlihat / Non-Headless)', value: false },
          { name: '🕶️ Jalankan di Latar Belakang (Headless)', value: true }
        ],
        default: currentDefaults.headless
      }
    ]);
    updateDefaultCampaignOptions({ headless: newHeadless });
    logger.success('✅ Tampilan jendela browser default berhasil diperbarui!');
  } else if (subAction === 'EDIT_COMMENT_FILTER') {
    const filter = await promptCommentCountFilter(currentDefaults);
    updateDefaultCampaignOptions({ minComments: filter.minComments, maxComments: filter.maxComments });
    logger.success('✅ Filter jumlah komentar default berhasil diperbarui!');
  } else if (subAction === 'RESET_HISTORY') {
    const { confirm } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirm',
        message: 'Apakah Anda yakin ingin mereset riwayat postingan / Reels yang sudah dikomentari? (Akun akan bisa mengomentari kembali postingan lama):',
        default: false
      }
    ]);
    if (confirm) {
      clearCommentHistory();
      logger.success('🧹 Riwayat komentar berhasil direset! Semua akun dapat berkomentar lagi di postingan sebelumnya.');
    }
  }
}
