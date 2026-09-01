import { Telegraf, Markup } from 'telegraf';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { paths, getAccounts, hasAccountSession } from '../config.js';
import { Commenter } from '../core/commenter.js';
import { SessionManager } from '../core/sessionManager.js';
import { logger } from '../utils/logger.js';

dotenv.config();

const telegramConfigFile = path.join(paths.configDir, 'telegram.json');
const telegramExampleFile = path.join(paths.configDir, 'telegram.example.json');

function loadTelegramConfig() {
  if (fs.existsSync(telegramConfigFile)) {
    try {
      return JSON.parse(fs.readFileSync(telegramConfigFile, 'utf-8'));
    } catch (e) {}
  }
  if (fs.existsSync(telegramExampleFile)) {
    try {
      return JSON.parse(fs.readFileSync(telegramExampleFile, 'utf-8'));
    } catch (e) {}
  }
  return { botToken: '', allowedUsers: [], defaultSettings: {} };
}

function saveTelegramConfig(config) {
  try {
    fs.writeFileSync(telegramConfigFile, JSON.stringify(config, null, 2), 'utf-8');
  } catch (e) {}
}

const telegramConfig = loadTelegramConfig();
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || telegramConfig.botToken;

if (!BOT_TOKEN || BOT_TOKEN.includes('MASUKKAN_BOT_TOKEN')) {
  console.log('\n======================================================');
  console.log('⚠️ TELEGRAM BOT TOKEN BELUM DIKONFIGURASI!');
  console.log('1. Buat bot baru di Telegram melalui @BotFather');
  console.log('2. Salin token bot Anda.');
  console.log('3. Buat file config/telegram.json atau set TELEGRAM_BOT_TOKEN di .env');
  console.log('======================================================\n');
}

export const bot = new Telegraf(BOT_TOKEN || 'dummy_token');

let isCampaignRunning = false;
let currentAbortController = null;

// Middleware Keamanan: Pastikan hanya pemilik bot yang bisa mengakses
bot.use(async (ctx, next) => {
  const userId = ctx.from?.id;
  if (!userId) return;

  let config = loadTelegramConfig();
  if (!config.allowedUsers || config.allowedUsers.length === 0) {
    // Daftarkan user pertama yang mengirim pesan sebagai Admin
    config.allowedUsers = [userId];
    saveTelegramConfig(config);
    console.log(`[Telegram] User ID ${userId} (${ctx.from.first_name}) otomatis didaftarkan sebagai Admin Bot.`);
  }

  if (config.allowedUsers.includes(userId)) {
    return next();
  } else {
    return ctx.reply('⛔ Akses ditolak. Anda bukan admin dari bot ini.');
  }
});

// Menu Utama Telegram
function getMainKeyboard() {
  return Markup.keyboard([
    ['🎲 Komentar Beranda', '🎬 Komentar Reels'],
    ['👥 Daftar Akun Facebook', '🩺 Cek Status Sesi'],
    ['🛑 Stop Kampanye', 'ℹ️ Bantuan']
  ]).resize();
}

bot.start(async (ctx) => {
  const accounts = getAccounts();
  const welcomeText = `🤖 *Facebook Multi-Account Bot Controller*\n\n` +
    `Halo *${ctx.from.first_name}*! Bot siap menerima perintah untuk otomatisasi Facebook.\n\n` +
    `📊 *Status Sistem:*\n` +
    `- Total Akun: *${accounts.length} Akun*\n` +
    `- Status Bot: *${isCampaignRunning ? '🟢 Sedang Berjalan' : '⚪ Standby / Siap'}*\n\n` +
    `Silakan pilih menu di bawah ini untuk memulai:`;

  await ctx.replyWithMarkdown(welcomeText, getMainKeyboard());
});

bot.hears('ℹ️ Bantuan', async (ctx) => {
  const helpText = `📖 *Panduan Perintah Telegram Bot:*\n\n` +
    `*Menu Tombol:*\n` +
    `• *🎲 Komentar Beranda*: Menjalankan komentar di timeline feed.\n` +
    `• *🎬 Komentar Reels*: Menjalankan komentar di video Facebook Reels.\n` +
    `• *👥 Daftar Akun*: Melihat daftar akun FB & status profil sesi.\n` +
    `• *🩺 Cek Status Sesi*: Memeriksa apakah akun masih login di FB.\n` +
    `• *🛑 Stop*: Menghentikan kampanye yang sedang berjalan.\n\n` +
    `*Perintah Cepat (Commands):*\n` +
    `• \`/reels 10\` - Komentar di 10 Reels\n` +
    `• \`/feed 10\` - Komentar di 10 Postingan Beranda\n` +
    `• \`/stop\` - Hentikan bot`;

  await ctx.replyWithMarkdown(helpText);
});

bot.hears('👥 Daftar Akun Facebook', async (ctx) => {
  const accounts = getAccounts();
  if (accounts.length === 0) {
    return ctx.reply('⚠️ Belum ada akun terdaftar di sistem.');
  }

  let text = `👥 *Daftar Akun Facebook Terdaftar (${accounts.length}):*\n\n`;
  accounts.forEach((acc, i) => {
    const hasSession = hasAccountSession(acc.id);
    const sessionEmoji = hasSession ? '✅ Login Tersimpan' : '❌ Belum Login';
    text += `${i + 1}. *[${acc.id}]* ${acc.username}\n   └ Status: ${sessionEmoji} | 2FA: ${acc.twoFactorSecret ? 'Ada' : '-'}\n\n`;
  });

  await ctx.replyWithMarkdown(text);
});

bot.hears('🩺 Cek Status Sesi', async (ctx) => {
  const accounts = getAccounts();
  if (accounts.length === 0) return ctx.reply('Belum ada akun terdaftar.');

  await ctx.reply('🔍 Sedang memverifikasi status sesi semua akun di Facebook (mohon tunggu)...');
  for (const acc of accounts) {
    const res = await SessionManager.verifySession(acc);
    const statusText = res.isValid ? '✅ Sesi AKTIF & Valid' : '❌ Sesi KADALUARSA / Checkpoint';
    await ctx.reply(`Account [${acc.id}] (${acc.username}):\n${statusText}`);
  }
});

// Menjalankan Komentar Beranda
bot.hears('🎲 Komentar Beranda', async (ctx) => {
  if (isCampaignRunning) {
    return ctx.reply('⚠️ Bot sedang menjalankan kampanye lain. Ketik /stop jika ingin membatalkan.');
  }

  await ctx.reply('Berapa jumlah postingan beranda yang ingin dikomentari per akun?', 
    Markup.inlineKeyboard([
      [Markup.button.callback('5 Postingan', 'FEED_5'), Markup.button.callback('10 Postingan', 'FEED_10')],
      [Markup.button.callback('20 Postingan', 'FEED_20'), Markup.button.callback('🔥 Non-Stop', 'FEED_0')]
    ])
  );
});

// Menjalankan Komentar Reels
bot.hears('🎬 Komentar Reels', async (ctx) => {
  if (isCampaignRunning) {
    return ctx.reply('⚠️ Bot sedang menjalankan kampanye lain. Ketik /stop jika ingin membatalkan.');
  }

  await ctx.reply('Berapa jumlah video Reels yang ingin dikomentari per akun?', 
    Markup.inlineKeyboard([
      [Markup.button.callback('5 Reels', 'REELS_5'), Markup.button.callback('10 Reels', 'REELS_10')],
      [Markup.button.callback('20 Reels', 'REELS_20'), Markup.button.callback('🔥 Non-Stop', 'REELS_0')]
    ])
  );
});

bot.action(/FEED_(\d+)/, async (ctx) => {
  const count = parseInt(ctx.match[1], 10);
  await ctx.answerCbQuery();
  await ctx.reply(`🚀 Memulai kampanye komentar Beranda (*Target: ${count === 0 ? 'Non-Stop' : count + ' postingan'}*)...`);
  runFeedFromTelegram(ctx, count);
});

bot.action(/REELS_(\d+)/, async (ctx) => {
  const count = parseInt(ctx.match[1], 10);
  await ctx.answerCbQuery();
  await ctx.reply(`🎬 Memulai kampanye komentar Facebook Reels (*Target: ${count === 0 ? 'Non-Stop' : count + ' Reels'}*)...`);
  runReelsFromTelegram(ctx, count);
});

// Handler Eksekusi Reels dari Telegram
async function runReelsFromTelegram(ctx, count) {
  const accounts = getAccounts();
  const config = loadTelegramConfig();
  const template = config.defaultSettings?.reelsCommentTemplate || '{Halo|Hai|Permisi} kak, {keren banget videonya|menarik sekali}! {Salam sukses ya}: https://whatsapp.com/channel/0029VbDanrVD38CMAgA7L91R';

  isCampaignRunning = true;
  try {
    for (const acc of accounts) {
      if (!isCampaignRunning) break;
      await ctx.reply(`[${acc.id}] Membuka Reels Facebook...`);

      const res = await Commenter.postRandomReelsComments(acc, {
        count,
        commentTemplate: template,
        delaySeconds: config.defaultSettings?.defaultDelaySeconds || 15,
        headless: true
      });

      if (res.success) {
        await ctx.reply(`🎉 [${acc.id}] Berhasil mengirim *${res.totalCommented} komentar* pada Facebook Reels!`);
      } else {
        await ctx.reply(`⚠️ [${acc.id}] Selesai / Terhenti: ${res.reason || 'Selesai'}`);
      }
    }
  } catch (err) {
    await ctx.reply(`❌ Terjadi error: ${err.message}`);
  } finally {
    isCampaignRunning = false;
    await ctx.reply('🏁 Kampanye Reels telah selesai dijalankan.');
  }
}

// Handler Eksekusi Feed dari Telegram
async function runFeedFromTelegram(ctx, count) {
  const accounts = getAccounts();
  const config = loadTelegramConfig();
  const template = config.defaultSettings?.feedCommentTemplate || '{Halo|Hai|Permisi} kak, {keren infonya|menarik sekali}! {Salam sukses}: https://whatsapp.com/channel/0029VbDanrVD38CMAgA7L91R';

  isCampaignRunning = true;
  try {
    for (const acc of accounts) {
      if (!isCampaignRunning) break;
      await ctx.reply(`[${acc.id}] Membuka Beranda Facebook...`);

      const res = await Commenter.postRandomFeedComments(acc, {
        count,
        commentTemplate: template,
        delaySeconds: config.defaultSettings?.defaultDelaySeconds || 15,
        headless: true
      });

      if (res.success) {
        await ctx.reply(`🎉 [${acc.id}] Berhasil mengirim *${res.totalCommented} komentar* pada Beranda Facebook!`);
      } else {
        await ctx.reply(`⚠️ [${acc.id}] Selesai / Terhenti: ${res.reason || 'Selesai'}`);
      }
    }
  } catch (err) {
    await ctx.reply(`❌ Terjadi error: ${err.message}`);
  } finally {
    isCampaignRunning = false;
    await ctx.reply('🏁 Kampanye Beranda telah selesai dijalankan.');
  }
}

bot.hears('🛑 Stop Kampanye', async (ctx) => {
  if (!isCampaignRunning) {
    return ctx.reply('Tidak ada kampanye yang sedang berjalan saat ini.');
  }
  isCampaignRunning = false;
  await ctx.reply('🛑 Perintah stop diterima. Bot akan berhenti setelah proses saat ini selesai.');
});

bot.command('stop', async (ctx) => {
  isCampaignRunning = false;
  await ctx.reply('🛑 Kampanye dihentikan.');
});

// Jalankan Bot Telegram jika dijalankan langsung
if (process.argv[1]?.includes('bot.js')) {
  if (BOT_TOKEN && !BOT_TOKEN.includes('MASUKKAN_BOT_TOKEN')) {
    logger.info('🚀 Menghubungkan Telegram Bot Controller ke server Telegram...');
    bot.launch().then(() => {
      logger.success('✅ Telegram Bot Controller AKTIF dan siap menerima perintah dari HP Anda!');
    }).catch((err) => {
      logger.error('Gagal menjalankan Telegram Bot:', err);
    });

    process.once('SIGINT', () => bot.stop('SIGINT'));
    process.once('SIGTERM', () => bot.stop('SIGTERM'));
  }
}
