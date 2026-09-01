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
  hasAccountSession
} from './config.js';

import { SessionManager } from './core/sessionManager.js';
import { Commenter } from './core/commenter.js';
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
        { name: '1. 👥 Manajemen Akun Facebook (Tambah, Import, Hapus, Lihat)', value: 'ACCOUNT_MANAGEMENT' },
        { name: '2. 🔑 Login / Simpan Sesi Akun (Bisa Buka 10+ Browser Sekaligus)', value: 'LOGIN_ACCOUNTS' },
        { name: '3. 🩺 Verifikasi Status Sesi Semua Akun (Health Check)', value: 'CHECK_SESSIONS' },
        { name: '4. 🎲 Komentar di Postingan Beranda / Feed (Foto & Teks)', value: 'RUN_RANDOM_FEED' },
        { name: '5. 🎬 Komentar di Facebook REELS (Video Pendek Non-Stop)', value: 'RUN_RANDOM_REELS' },
        { name: '6. 🎯 Komentar di URL Postingan Target Tertentu', value: 'RUN_TARGET_CAMPAIGN' },
        { name: '7. 🧪 Test & Preview Spintax Komentar', value: 'TEST_SPINTAX' },
        { name: '8. 📱 Jalankan Telegram Bot Controller (Kontrol via HP)', value: 'RUN_TELEGRAM' },
        { name: '9. ❌ Keluar', value: 'EXIT' }
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
        { name: '➕ Tambah 1 Akun Baru (Input Manual)', value: 'ADD_SINGLE' },
        { name: '📥 Bulk Import Akun (Format: email|pass|2fa|proxy)', value: 'BULK_IMPORT' },
        { name: '🗑️ Hapus Akun', value: 'DELETE' },
        { name: '🔙 Kembali ke Menu Utama', value: 'BACK' }
      ]
    }
  ]);

  if (accAction === 'LIST') {
    await renderAccountTable();
  } else if (accAction === 'ADD_SINGLE') {
    await handleAddSingleAccount();
  } else if (accAction === 'BULK_IMPORT') {
    await handleBulkImport();
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
    head: [chalk.cyan('ID'), chalk.cyan('Nama'), chalk.cyan('Username / Email'), chalk.cyan('Proxy'), chalk.cyan('2FA'), chalk.cyan('Session')],
    colWidths: [10, 18, 30, 22, 10, 15]
  });

  for (const acc of accounts) {
    const sessionExists = hasAccountSession(acc.id);
    const proxyText = acc.proxy?.server ? chalk.green(acc.proxy.server) : chalk.gray('Direct');
    const twoFaText = acc.twoFactorSecret ? chalk.green('Ada') : chalk.gray('-');
    const sessionText = sessionExists ? chalk.green('Tersimpan') : chalk.red('Belum Ada');

    table.push([acc.id, acc.name || '-', acc.username, proxyText, twoFaText, sessionText]);
  }


  console.log(table.toString());
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

  deleteAccount(accountId);
  logger.success(`Akun [${accountId}] dan file sesinya berhasil dihapus.`);
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
      type: 'confirm',
      name: 'headless',
      message: 'Jalankan browser di latar belakang (Headless Mode)? [Disarankan: No jika ingin melihat browser login]',
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

  logger.info('Mengecek status sesi untuk semua akun...');
  for (const acc of accounts) {
    await SessionManager.verifySession(acc);
  }
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

  const { template, delaySeconds, concurrency, headless } = await inquirer.prompt([
    {
      type: 'input',
      name: 'template',
      message: 'Format Spintax Komentar / Link:',
      default: '{Halo|Hai|Permisi} kak, {menarik sekali informasinya|sangat bermanfaat|keren postingannya}! {Salam kenal ya kak|Semoga sehat selalu|Salam sukses}.'
    },
    {
      type: 'number',
      name: 'delaySeconds',
      message: 'Jeda waktu antar komentar di akun yang sama (detik) [Rekomendasi: 10-25 detik]:',
      default: 15
    },
    {
      type: 'number',
      name: 'concurrency',
      message: `Berapa akun/browser yang berjalan bersamaan (Paralel)? (1 - ${accounts.length}):`,
      default: Math.min(5, accounts.length)
    },
    {
      type: 'confirm',
      name: 'headless',
      message: 'Jalankan browser di latar belakang (Headless Mode)?',
      default: false
    }
  ]);

  await Commenter.runRandomFeedCampaign(accounts, {
    count: countPerAccount,
    commentTemplate: template,
    delaySeconds: delaySeconds || 15,
    concurrency: Math.max(1, concurrency || 1),
    headless
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

  const { template, delaySeconds, concurrency, headless } = await inquirer.prompt([
    {
      type: 'input',
      name: 'template',
      message: 'Format Spintax Komentar / Link untuk Reels:',
      default: '{Halo|Hai|Permisi} kak, {keren banget videonya|menarik sekali|suka videonya}! {Salam kenal ya kak|Semoga sehat selalu|Salam sukses}.'
    },
    {
      type: 'number',
      name: 'delaySeconds',
      message: 'Jeda waktu antar komentar di akun yang sama (detik) [Rekomendasi: 10-25 detik]:',
      default: 15
    },
    {
      type: 'number',
      name: 'concurrency',
      message: `Berapa akun/browser yang berjalan bersamaan (Paralel)? (1 - ${accounts.length}):`,
      default: Math.min(5, accounts.length)
    },
    {
      type: 'confirm',
      name: 'headless',
      message: 'Jalankan browser di latar belakang (Headless Mode)?',
      default: false
    }
  ]);

  await Commenter.runRandomReelsCampaign(accounts, {
    count: countPerAccount,
    commentTemplate: template,
    delaySeconds: delaySeconds || 15,
    concurrency: Math.max(1, concurrency || 1),
    headless
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
      type: 'confirm',
      name: 'headless',
      message: 'Jalankan browser di latar belakang (Headless Mode)?',
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
