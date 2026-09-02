import { Telegraf, Markup } from "telegraf";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { paths, getAccounts, hasAccountSession } from "../config.js";
import { Commenter } from "../core/commenter.js";
import { SessionManager } from "../core/sessionManager.js";
import { logger } from "../utils/logger.js";

dotenv.config();

const telegramConfigFile = path.join(paths.configDir, "telegram.json");
const telegramExampleFile = path.join(paths.configDir, "telegram.example.json");

function loadTelegramConfig() {
  if (fs.existsSync(telegramConfigFile)) {
    try {
      return JSON.parse(fs.readFileSync(telegramConfigFile, "utf-8"));
    } catch (e) {}
  }
  if (fs.existsSync(telegramExampleFile)) {
    try {
      return JSON.parse(fs.readFileSync(telegramExampleFile, "utf-8"));
    } catch (e) {}
  }
  return {
    botToken: "",
    allowedUsers: [],
    defaultSettings: {
      customComment: "https://whatsapp.com/channel/0029VbDanrVD38CMAgA7L91R",
      defaultDelaySeconds: 15,
      concurrency: 1
    }
  };
}

function saveTelegramConfig(config) {
  try {
    fs.writeFileSync(telegramConfigFile, JSON.stringify(config, null, 2), "utf-8");
  } catch (e) {}
}

const telegramConfig = loadTelegramConfig();
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || telegramConfig.botToken;

if (!BOT_TOKEN || BOT_TOKEN.includes("MASUKKAN_BOT_TOKEN")) {
  console.log("\n======================================================");
  console.log("⚠️ TELEGRAM BOT TOKEN BELUM DIKONFIGURASI!");
  console.log("1. Buat bot baru di Telegram melalui @BotFather");
  console.log("2. Salin token bot Anda.");
  console.log("3. Masukkan ke file .env atau config/telegram.json");
  console.log("======================================================\n");
}

export const bot = new Telegraf(BOT_TOKEN || "dummy_token");

let isCampaignRunning = false;
let currentCampaignInfo = { mode: "", target: 0, completed: 0, currentAccount: "" };
// Menyimpan state user (misal sedang menunggu input komentar custom atau delay)
const userStates = new Map();

// Middleware Keamanan: Pastikan hanya pemilik bot yang bisa mengakses
bot.use(async (ctx, next) => {
  const userId = ctx.from?.id;
  if (!userId) return;

  let config = loadTelegramConfig();
  if (process.env.TELEGRAM_ADMIN_ID) {
    const envAdmin = parseInt(process.env.TELEGRAM_ADMIN_ID.trim(), 10);
    if (envAdmin && !config.allowedUsers.includes(envAdmin)) {
      config.allowedUsers.push(envAdmin);
    }
  }

  if (!config.allowedUsers || config.allowedUsers.length === 0) {
    // Daftarkan user pertama yang mengirim pesan sebagai Admin
    config.allowedUsers = [userId];
    saveTelegramConfig(config);
    console.log(`[Telegram] User ID ${userId} (${ctx.from.first_name}) otomatis didaftarkan sebagai Admin.`);
  }

  if (config.allowedUsers.includes(userId)) {
    return next();
  } else {
    return ctx.reply("⛔ Akses ditolak. Anda bukan admin dari bot ini.");
  }
});

// 1. Menu Keyboard Standby (Saat Bot Menganggur)
function getMainKeyboard() {
  return Markup.keyboard([
    ["🎲 Komentar Beranda", "🎬 Komentar Reels"],
    ["✏️ Atur Komentar / Link", "⏱️ Atur Jeda (Delay)"],
    ["👥 Daftar Akun Facebook", "🩺 Cek Status Sesi"],
    ["ℹ️ Bantuan"]
  ]).resize();
}

// 2. Menu Keyboard Running (Saat Bot Sedang Berjalan - HANYA STOP & STATUS)
function getRunningKeyboard() {
  return Markup.keyboard([
    ["🛑 Stop Kampanye", "📊 Status Kampanye"]
  ]).resize();
}

bot.start(async (ctx) => {
  userStates.delete(ctx.from.id);
  const accounts = getAccounts();
  const config = loadTelegramConfig();
  const activeComment = config.defaultSettings?.customComment || "https://whatsapp.com/channel/0029VbDanrVD38CMAgA7L91R";
  const delaySec = config.defaultSettings?.defaultDelaySeconds || 15;

  if (isCampaignRunning) {
    return ctx.replyWithMarkdown(
      `🟢 *Bot Sedang Berjalan!*\n` +
      `Mode: *${currentCampaignInfo.mode}*\n` +
      `Target: *${currentCampaignInfo.target === 0 ? "Non-Stop" : currentCampaignInfo.target}*\n\n` +
      `Gunakan tombol di bawah untuk mengontrol:`,
      getRunningKeyboard()
    );
  }

  const welcomeText =
    `🤖 *Facebook Multi-Account Bot Controller*\n\n` +
    `Halo *${ctx.from.first_name}*! Bot siap menerima perintah untuk otomatisasi Facebook.\n\n` +
    `📊 *Status Sistem:*\n` +
    `- Total Akun: *${accounts.length} Akun*\n` +
    `- Status Bot: *⚪ Standby / Siap*\n` +
    `- Komentar Aktif: \`${activeComment}\`\n` +
    `- Jeda Delay: *${delaySec} detik*\n\n` +
    `Silakan pilih menu di bawah ini untuk memulai:`;

  await ctx.replyWithMarkdown(welcomeText, getMainKeyboard());
});

bot.hears("ℹ️ Bantuan", async (ctx) => {
  userStates.delete(ctx.from.id);
  if (isCampaignRunning) {
    return ctx.reply("⚠️ Bot sedang berjalan! Tekan '🛑 Stop Kampanye' jika ingin menghentikan.", getRunningKeyboard());
  }

  const helpText =
    `📖 *Panduan Penggunaan Bot Telegram:*\n\n` +
    `*Menu Tombol:*\n` +
    `• *🎬 Komentar Reels*: Menjalankan komentar di Facebook Reels step-by-step.\n` +
    `• *🎲 Komentar Beranda*: Menjalankan komentar di Beranda Facebook.\n` +
    `• *✏️ Atur Komentar / Link*: Ubah teks atau link yang akan dikomentari.\n` +
    `• *⏱️ Atur Jeda (Delay)*: Atur jeda istirahat antar video (detik).\n` +
    `• *👥 Daftar Akun*: Melihat status login akun Facebook Anda.\n` +
    `• *🩺 Cek Status Sesi*: Memeriksa apakah akun masih aktif di Facebook.\n` +
    `• *🛑 Stop*: Menghentikan bot seketika (responsif dalam 1 detik).\n\n` +
    `*Perintah Cepat:*\n` +
    `• \`/reels 10\` - Komentar di 10 Reels\n` +
    `• \`/reels 10 https://linkanda.com\` - Komentar di 10 Reels dengan link baru\n` +
    `• \`/feed 10\` - Komentar di 10 Postingan Beranda\n` +
    `• \`/setcomment <link/teks>\` - Atur komentar default\n` +
    `• \`/setdelay <detik>\` - Atur jeda waktu antar komentar\n` +
    `• \`/stop\` - Hentikan bot`;

  await ctx.replyWithMarkdown(helpText);
});

// Fitur Mengatur Komentar / Link Custom
bot.hears("✏️ Atur Komentar / Link", async (ctx) => {
  if (isCampaignRunning) {
    return ctx.reply("⚠️ Bot sedang berjalan! Pengaturan komentar dikunci selama kampanye aktif. Tekan '🛑 Stop Kampanye' terlebih dahulu.", getRunningKeyboard());
  }

  userStates.set(ctx.from.id, "AWAITING_CUSTOM_COMMENT");
  const config = loadTelegramConfig();
  const current = config.defaultSettings?.customComment || "Belum diatur";

  await ctx.replyWithMarkdown(
    `📝 *Pengaturan Komentar / Link Facebook*\n\n` +
    `*Komentar Aktif Saat Ini:*\n\`${current}\`\n\n` +
    `👉 *Silakan ketik atau kirim pesan baru sekarang*.\n` +
    `Bisa berupa link saja (misal: \`https://whatsapp.com/...\`) atau teks dengan spintax (misal: \`{Halo|Hai} kak cek https://...\`).`
  );
});

bot.command("setcomment", async (ctx) => {
  if (isCampaignRunning) {
    return ctx.reply("⚠️ Bot sedang berjalan! Pengaturan dikunci saat kampanye aktif.", getRunningKeyboard());
  }

  const text = ctx.message.text.replace("/setcomment", "").trim();
  if (!text) {
    return ctx.reply("Format: /setcomment <teks atau link>");
  }
  let config = loadTelegramConfig();
  if (!config.defaultSettings) config.defaultSettings = {};
  config.defaultSettings.customComment = text;
  saveTelegramConfig(config);

  await ctx.replyWithMarkdown(`✅ *Komentar default berhasil diperbarui!*\n\nKomentar aktif:\n\`${text}\``);
});

// Fitur Mengatur Jeda Waktu (Delay)
bot.hears("⏱️ Atur Jeda (Delay)", async (ctx) => {
  if (isCampaignRunning) {
    return ctx.reply("⚠️ Bot sedang berjalan! Jeda delay dikunci selama kampanye aktif. Tekan '🛑 Stop Kampanye' terlebih dahulu.", getRunningKeyboard());
  }

  userStates.delete(ctx.from.id);
  const config = loadTelegramConfig();
  const currentDelay = config.defaultSettings?.defaultDelaySeconds || 15;

  await ctx.replyWithMarkdown(
    `⏱️ *Pengaturan Jeda Waktu Antar Komentar*\n\n` +
    `*Jeda Aktif Saat Ini:* *${currentDelay} detik*\n\n` +
    `_Tips: Gunakan minimal 15–30 detik agar akun aman dari limit Facebook._\n\n` +
    `Pilih durasi jeda yang diinginkan:`,
    Markup.inlineKeyboard([
      [Markup.button.callback("10 Detik", "DELAY_10"), Markup.button.callback("15 Detik (Normal)", "DELAY_15")],
      [Markup.button.callback("20 Detik", "DELAY_20"), Markup.button.callback("30 Detik (Aman)", "DELAY_30")],
      [Markup.button.callback("45 Detik", "DELAY_45"), Markup.button.callback("60 Detik (Sangat Aman)", "DELAY_60")],
      [Markup.button.callback("✏️ Ketik Manual (Detik)", "DELAY_MANUAL")]
    ])
  );
});

bot.action(/DELAY_(\d+)/, async (ctx) => {
  if (isCampaignRunning) {
    await ctx.answerCbQuery("Bot sedang berjalan!");
    return ctx.reply("⚠️ Pengaturan jeda dikunci saat kampanye aktif.", getRunningKeyboard());
  }

  const sec = parseInt(ctx.match[1], 10);
  await ctx.answerCbQuery();
  let config = loadTelegramConfig();
  if (!config.defaultSettings) config.defaultSettings = {};
  config.defaultSettings.defaultDelaySeconds = sec;
  saveTelegramConfig(config);

  await ctx.replyWithMarkdown(`✅ *Jeda waktu antar komentar berhasil diatur ke ${sec} detik!*`);
});

bot.action("DELAY_MANUAL", async (ctx) => {
  if (isCampaignRunning) {
    await ctx.answerCbQuery("Bot sedang berjalan!");
    return ctx.reply("⚠️ Pengaturan dikunci saat kampanye aktif.", getRunningKeyboard());
  }

  await ctx.answerCbQuery();
  userStates.set(ctx.from.id, "AWAITING_DELAY_INPUT");
  await ctx.reply("Silakan ketik angka durasi jeda yang Anda inginkan dalam detik (misal: 25):");
});

bot.command("setdelay", async (ctx) => {
  if (isCampaignRunning) {
    return ctx.reply("⚠️ Pengaturan jeda dikunci saat kampanye aktif.", getRunningKeyboard());
  }

  const parts = ctx.message.text.split(" ");
  const sec = parseInt(parts[1], 10);
  if (isNaN(sec) || sec < 2) {
    return ctx.reply("Format: /setdelay <jumlah detik (minimal 3)>\nContoh: /setdelay 20");
  }
  let config = loadTelegramConfig();
  if (!config.defaultSettings) config.defaultSettings = {};
  config.defaultSettings.defaultDelaySeconds = sec;
  saveTelegramConfig(config);

  await ctx.replyWithMarkdown(`✅ *Jeda waktu antar komentar berhasil diatur ke ${sec} detik!*`);
});

bot.hears("👥 Daftar Akun Facebook", async (ctx) => {
  if (isCampaignRunning) {
    return ctx.reply("⚠️ Bot sedang berjalan! Gunakan menu ini saat bot dalam keadaan standby.", getRunningKeyboard());
  }

  userStates.delete(ctx.from.id);
  const accounts = getAccounts();
  if (accounts.length === 0) {
    return ctx.reply("⚠️ Belum ada akun terdaftar di sistem.");
  }

  let text = `👥 *Daftar Akun Facebook Terdaftar (${accounts.length}):*\n\n`;
  accounts.forEach((acc, i) => {
    const hasSession = hasAccountSession(acc.id);
    const sessionEmoji = hasSession ? "✅ Login Tersimpan" : "❌ Belum Login";
    text += `${i + 1}. *[${acc.id}]* ${acc.username}\n   └ Status: ${sessionEmoji} | 2FA: ${acc.twoFactorSecret ? "Ada" : "-"}\n\n`;
  });

  await ctx.replyWithMarkdown(text);
});

bot.hears("🩺 Cek Status Sesi", async (ctx) => {
  if (isCampaignRunning) {
    return ctx.reply("⚠️ Bot sedang berjalan! Cek status sesi hanya dapat dilakukan saat bot standby.", getRunningKeyboard());
  }

  userStates.delete(ctx.from.id);
  const accounts = getAccounts();
  if (accounts.length === 0) return ctx.reply("Belum ada akun terdaftar.");

  await ctx.reply("🔍 Sedang memverifikasi status sesi semua akun di Facebook (mohon tunggu)...");
  for (const acc of accounts) {
    const res = await SessionManager.verifySession(acc);
    const statusText = res.isValid ? "✅ Sesi AKTIF & Valid" : "❌ Sesi KADALUARSA / Checkpoint";
    await ctx.reply(`Account [${acc.id}] (${acc.username}):\n${statusText}`);
  }
});

// Menjalankan Komentar Beranda
bot.hears("🎲 Komentar Beranda", async (ctx) => {
  userStates.delete(ctx.from.id);
  if (isCampaignRunning) {
    return ctx.reply("⚠️ Bot sedang menjalankan kampanye. Tekan '🛑 Stop Kampanye' jika ingin membatalkan.", getRunningKeyboard());
  }

  const config = loadTelegramConfig();
  const current = config.defaultSettings?.customComment || "https://whatsapp.com/channel/0029VbDanrVD38CMAgA7L91R";
  const currentDelay = config.defaultSettings?.defaultDelaySeconds || 15;

  await ctx.replyWithMarkdown(
    `🎲 *Komentar di Beranda Facebook*\n\n` +
    `*Komentar:* \`${current}\`\n` +
    `*Jeda Delay:* *${currentDelay} detik*\n\n` +
    `Pilih target jumlah postingan:`,
    Markup.inlineKeyboard([
      [Markup.button.callback("5 Postingan", "FEED_5"), Markup.button.callback("10 Postingan", "FEED_10")],
      [Markup.button.callback("20 Postingan", "FEED_20"), Markup.button.callback("🔥 Non-Stop Loop", "FEED_0")],
      [Markup.button.callback("✏️ Ganti Komentar", "CHANGE_COMMENT_FEED"), Markup.button.callback("⏱️ Ubah Jeda", "DELAY_TRIGGER")]
    ])
  );
});

// Menjalankan Komentar Reels
bot.hears("🎬 Komentar Reels", async (ctx) => {
  userStates.delete(ctx.from.id);
  if (isCampaignRunning) {
    return ctx.reply("⚠️ Bot sedang menjalankan kampanye. Tekan '🛑 Stop Kampanye' jika ingin membatalkan.", getRunningKeyboard());
  }

  const config = loadTelegramConfig();
  const current = config.defaultSettings?.customComment || "https://whatsapp.com/channel/0029VbDanrVD38CMAgA7L91R";
  const currentDelay = config.defaultSettings?.defaultDelaySeconds || 15;

  await ctx.replyWithMarkdown(
    `🎬 *Komentar di Facebook REELS*\n\n` +
    `*Komentar:* \`${current}\`\n` +
    `*Jeda Delay:* *${currentDelay} detik*\n\n` +
    `Pilih target jumlah video Reels:`,
    Markup.inlineKeyboard([
      [Markup.button.callback("5 Reels", "REELS_5"), Markup.button.callback("10 Reels", "REELS_10")],
      [Markup.button.callback("20 Reels", "REELS_20"), Markup.button.callback("🔥 Non-Stop Loop", "REELS_0")],
      [Markup.button.callback("✏️ Ganti Komentar", "CHANGE_COMMENT_REELS"), Markup.button.callback("⏱️ Ubah Jeda", "DELAY_TRIGGER")]
    ])
  );
});

bot.action("DELAY_TRIGGER", async (ctx) => {
  if (isCampaignRunning) {
    await ctx.answerCbQuery("Bot sedang berjalan!");
    return ctx.reply("⚠️ Pengaturan dikunci saat kampanye aktif.", getRunningKeyboard());
  }

  await ctx.answerCbQuery();
  userStates.set(ctx.from.id, "AWAITING_DELAY_INPUT");
  await ctx.reply("Silakan ketik angka durasi jeda antar video yang Anda inginkan (dalam detik, misal: 20):");
});

bot.action("CHANGE_COMMENT_FEED", async (ctx) => {
  if (isCampaignRunning) {
    await ctx.answerCbQuery("Bot sedang berjalan!");
    return ctx.reply("⚠️ Pengaturan dikunci saat kampanye aktif.", getRunningKeyboard());
  }

  await ctx.answerCbQuery();
  userStates.set(ctx.from.id, "AWAITING_CUSTOM_COMMENT");
  await ctx.reply("Silakan kirimkan teks atau link komentar baru Anda:");
});

bot.action("CHANGE_COMMENT_REELS", async (ctx) => {
  if (isCampaignRunning) {
    await ctx.answerCbQuery("Bot sedang berjalan!");
    return ctx.reply("⚠️ Pengaturan dikunci saat kampanye aktif.", getRunningKeyboard());
  }

  await ctx.answerCbQuery();
  userStates.set(ctx.from.id, "AWAITING_CUSTOM_COMMENT");
  await ctx.reply("Silakan kirimkan teks atau link komentar baru Anda:");
});

bot.action(/FEED_(\d+)/, async (ctx) => {
  if (isCampaignRunning) {
    await ctx.answerCbQuery("Bot sedang berjalan!");
    return ctx.reply("⚠️ Kampanye lain sedang berjalan. Tekan '🛑 Stop Kampanye' terlebih dahulu.", getRunningKeyboard());
  }

  const count = parseInt(ctx.match[1], 10);
  await ctx.answerCbQuery();
  executeFeedCampaign(ctx, count);
});

bot.action(/REELS_(\d+)/, async (ctx) => {
  if (isCampaignRunning) {
    await ctx.answerCbQuery("Bot sedang berjalan!");
    return ctx.reply("⚠️ Kampanye lain sedang berjalan. Tekan '🛑 Stop Kampanye' terlebih dahulu.", getRunningKeyboard());
  }

  const count = parseInt(ctx.match[1], 10);
  await ctx.answerCbQuery();
  executeReelsCampaign(ctx, count);
});

// Command cepat: /reels 10 atau /reels 10 https://link...
bot.command("reels", async (ctx) => {
  if (isCampaignRunning) return ctx.reply("⚠️ Bot sedang berjalan. Ketik /stop untuk membatalkan.", getRunningKeyboard());
  const parts = ctx.message.text.split(" ");
  const count = parts[1] ? parseInt(parts[1], 10) : 10;
  let customComment = null;
  if (parts.length > 2) {
    customComment = parts.slice(2).join(" ");
  }
  executeReelsCampaign(ctx, isNaN(count) ? 10 : count, customComment);
});

// Command cepat: /feed 10 atau /feed 10 https://link...
bot.command("feed", async (ctx) => {
  if (isCampaignRunning) return ctx.reply("⚠️ Bot sedang berjalan. Ketik /stop untuk membatalkan.", getRunningKeyboard());
  const parts = ctx.message.text.split(" ");
  const count = parts[1] ? parseInt(parts[1], 10) : 10;
  let customComment = null;
  if (parts.length > 2) {
    customComment = parts.slice(2).join(" ");
  }
  executeFeedCampaign(ctx, isNaN(count) ? 10 : count, customComment);
});

// Eksekusi Komentar Reels dengan Pelaporan Step-by-Step ke Telegram
async function executeReelsCampaign(ctx, count, overrideComment = null) {
  const accounts = getAccounts();
  const config = loadTelegramConfig();
  const template = overrideComment || config.defaultSettings?.customComment || "https://whatsapp.com/channel/0029VbDanrVD38CMAgA7L91R";
  const delaySec = config.defaultSettings?.defaultDelaySeconds || 15;

  isCampaignRunning = true;
  currentCampaignInfo = { mode: "Facebook Reels", target: count, completed: 0, currentAccount: accounts[0]?.id || "" };

  // Ubah Keyboard ke RUNNING MODE (Hanya ada tombol STOP & STATUS)
  await ctx.replyWithMarkdown(
    `🎬 *Memulai Kampanye Facebook Reels*\n` +
    `- Target: *${count === 0 ? "🔥 Non-Stop Loop" : count + " Reels"}*\n` +
    `- Komentar: \`${template}\`\n` +
    `- Jeda Antar Video: *${delaySec} detik*\n\n` +
    `_Ketik /stop atau klik tombol Stop di bawah kapan saja untuk menghentikan._`,
    getRunningKeyboard()
  );

  try {
    for (const acc of accounts) {
      if (!isCampaignRunning) break;
      currentCampaignInfo.currentAccount = acc.id;

      const onProgress = async (type, data) => {
        if (!isCampaignRunning && type !== "STOPPED") return;
        try {
          switch (type) {
            case "START":
              await ctx.reply(`🌐 [${data.accountId}] Membuka Facebook Reels (Target: ${data.target})...`);
              break;
            case "LOGGED_IN":
              await ctx.reply(`🔑 [${data.accountId}] Berhasil masuk ke Facebook Reels!`);
              break;
            case "WATCHING_REEL":
              await ctx.reply(`👁️ [${data.accountId}] Menonton Reel #${data.reelIndex}\nURL: ${data.url}`);
              break;
            case "TYPING":
              await ctx.reply(`✍️ [${data.accountId}] Mengetik komentar: "${data.commentText}"`);
              break;
            case "COMMENT_SUCCESS":
              currentCampaignInfo.completed++;
              await ctx.replyWithMarkdown(`🎉 *[${data.accountId}] ${data.progressText} [VALIDASI SUKSES]*\nKomentar terkirim:\n\`${data.commentText}\``);
              break;
            case "DELAY":
              await ctx.reply(`⏳ Jeda aman ${data.seconds} detik sebelum video berikutnya...`);
              break;
            case "NEXT_REEL":
              await ctx.reply(`⏭️ [${data.accountId}] Berpindah ke video Reel berikutnya...`);
              break;
            case "ACTION_BLOCKED":
              await ctx.replyWithMarkdown(`🛑 *[${data.accountId}] PEMBATASAN SEMENTARA DARI FACEBOOK!*\nPesan: _Anda Tidak Dapat Menggunakan Fitur Ini Sekarang / Limit Komentar_.\nBot otomatis berhenti pada akun ini demi keamanan.`);
              break;
            case "STOPPED":
              await ctx.reply(`🛑 [${data.accountId}] Bot berhasil dihentikan atas permintaan Anda.`);
              break;
          }
        } catch (e) {}
      };

      const res = await Commenter.postRandomReelsComments(acc, {
        count,
        commentTemplate: template,
        delaySeconds: delaySec,
        headless: true,
        shouldStop: () => !isCampaignRunning,
        onProgress
      });

      if (res.success) {
        await ctx.replyWithMarkdown(`✅ *[${acc.id}] Selesai!* Total *${res.totalCommented} komentar* berhasil terkirim di Reels.`);
      }
    }
  } catch (err) {
    await ctx.reply(`❌ Terjadi error: ${err.message}`);
  } finally {
    isCampaignRunning = false;
    currentCampaignInfo = { mode: "", target: 0, completed: 0, currentAccount: "" };
    // Kembalikan Keyboard ke MAIN MODE (Semua tombol aktif kembali)
    await ctx.reply("🏁 Kampanye Facebook Reels selesai. Semua menu tombol utama telah kembali aktif!", getMainKeyboard());
  }
}

// Eksekusi Komentar Beranda dengan Pelaporan Step-by-Step ke Telegram
async function executeFeedCampaign(ctx, count, overrideComment = null) {
  const accounts = getAccounts();
  const config = loadTelegramConfig();
  const template = overrideComment || config.defaultSettings?.customComment || "https://whatsapp.com/channel/0029VbDanrVD38CMAgA7L91R";
  const delaySec = config.defaultSettings?.defaultDelaySeconds || 15;

  isCampaignRunning = true;
  currentCampaignInfo = { mode: "Beranda Facebook", target: count, completed: 0, currentAccount: accounts[0]?.id || "" };

  // Ubah Keyboard ke RUNNING MODE (Hanya ada tombol STOP & STATUS)
  await ctx.replyWithMarkdown(
    `🎲 *Memulai Kampanye Beranda Facebook*\n` +
    `- Target: *${count === 0 ? "🔥 Non-Stop Loop" : count + " Postingan"}*\n` +
    `- Komentar: \`${template}\`\n` +
    `- Jeda: *${delaySec} detik*\n\n` +
    `_Ketik /stop atau klik tombol Stop di bawah kapan saja untuk menghentikan._`,
    getRunningKeyboard()
  );

  try {
    for (const acc of accounts) {
      if (!isCampaignRunning) break;
      currentCampaignInfo.currentAccount = acc.id;

      const onProgress = async (type, data) => {
        if (!isCampaignRunning && type !== "STOPPED") return;
        try {
          switch (type) {
            case "START":
              await ctx.reply(`🌐 [${data.accountId}] Membuka Beranda Facebook (Target: ${data.target})...`);
              break;
            case "LOGGED_IN":
              await ctx.reply(`🔑 [${data.accountId}] Berhasil masuk ke Beranda!`);
              break;
            case "TYPING":
              await ctx.reply(`✍️ Mengetik komentar: "${data.commentText}"`);
              break;
            case "COMMENT_SUCCESS":
              currentCampaignInfo.completed++;
              await ctx.replyWithMarkdown(`🎉 *[${data.accountId}] ${data.progressText} [VALIDASI SUKSES]*\nKomentar terkirim:\n\`${data.commentText}\``);
              break;
            case "DELAY":
              await ctx.reply(`⏳ Jeda aman ${data.seconds} detik sebelum postingan berikutnya...`);
              break;
            case "ACTION_BLOCKED":
              await ctx.replyWithMarkdown(`🛑 *[${data.accountId}] PEMBATASAN SEMENTARA DARI FACEBOOK!*\nBot otomatis berhenti demi keamanan.`);
              break;
            case "STOPPED":
              await ctx.reply(`🛑 [${data.accountId}] Bot berhasil dihentikan.`);
              break;
          }
        } catch (e) {}
      };

      const res = await Commenter.postRandomFeedComments(acc, {
        count,
        commentTemplate: template,
        delaySeconds: delaySec,
        headless: true,
        shouldStop: () => !isCampaignRunning,
        onProgress
      });

      if (res.success) {
        await ctx.replyWithMarkdown(`✅ *[${acc.id}] Selesai!* Total *${res.totalCommented} komentar* berhasil terkirim di Beranda.`);
      }
    }
  } catch (err) {
    await ctx.reply(`❌ Terjadi error: ${err.message}`);
  } finally {
    isCampaignRunning = false;
    currentCampaignInfo = { mode: "", target: 0, completed: 0, currentAccount: "" };
    // Kembalikan Keyboard ke MAIN MODE (Semua tombol aktif kembali)
    await ctx.reply("🏁 Kampanye Beranda selesai. Semua menu tombol utama telah kembali aktif!", getMainKeyboard());
  }
}

// Handler Tombol Status Kampanye
bot.hears("📊 Status Kampanye", async (ctx) => {
  if (!isCampaignRunning) {
    return ctx.reply("⚪ Tidak ada kampanye yang sedang berjalan saat ini.", getMainKeyboard());
  }

  const targetText = currentCampaignInfo.target === 0 ? "Non-Stop Loop" : `${currentCampaignInfo.target} target`;
  await ctx.replyWithMarkdown(
    `📊 *Status Kampanye Berjalan:*\n` +
    `- Mode: *${currentCampaignInfo.mode}*\n` +
    `- Akun Aktif: *${currentCampaignInfo.currentAccount}*\n` +
    `- Progres: *${currentCampaignInfo.completed} terkirim* (Target: ${targetText})\n` +
    `- Status: 🟢 *Sedang Bekerja*\n\n` +
    `_Klik tombol '🛑 Stop Kampanye' di bawah jika ingin menghentikan._`,
    getRunningKeyboard()
  );
});

// Handler Tombol Stop
bot.hears("🛑 Stop Kampanye", async (ctx) => {
  if (!isCampaignRunning) {
    return ctx.reply("ℹ️ Tidak ada kampanye yang sedang berjalan saat ini.", getMainKeyboard());
  }
  isCampaignRunning = false;
  await ctx.reply("🛑 Perintah STOP diterima! Menghentikan bot dan menutup browser...", getMainKeyboard());
});

bot.command("stop", async (ctx) => {
  if (!isCampaignRunning) {
    return ctx.reply("ℹ️ Tidak ada kampanye yang sedang berjalan saat ini.", getMainKeyboard());
  }
  isCampaignRunning = false;
  await ctx.reply("🛑 Perintah STOP diterima! Menghentikan bot dan menutup browser...", getMainKeyboard());
});

// Handler Teks Masuk Umum (untuk menangani update komentar custom & delay manual)
bot.on("text", async (ctx, next) => {
  if (isCampaignRunning) {
    return ctx.reply("⚠️ Bot sedang berjalan aktif! Perintah ubah teks dikunci. Tekan '🛑 Stop Kampanye' jika ingin membatalkan.", getRunningKeyboard());
  }

  const state = userStates.get(ctx.from.id);
  if (state === "AWAITING_CUSTOM_COMMENT") {
    userStates.delete(ctx.from.id);
    const newComment = ctx.message.text.trim();

    let config = loadTelegramConfig();
    if (!config.defaultSettings) config.defaultSettings = {};
    config.defaultSettings.customComment = newComment;
    saveTelegramConfig(config);

    return ctx.replyWithMarkdown(
      `✅ *Komentar Berhasil Disimpan!*\n\n` +
      `Komentar aktif sekarang:\n\`${newComment}\`\n\n` +
      `Silakan pilih menu di bawah untuk menjalankan komentar:`,
      getMainKeyboard()
    );
  }

  if (state === "AWAITING_DELAY_INPUT") {
    userStates.delete(ctx.from.id);
    const sec = parseInt(ctx.message.text.trim(), 10);
    if (isNaN(sec) || sec < 2) {
      return ctx.reply("⚠️ Mohon masukkan angka detik yang valid (minimal 3 detik).");
    }

    let config = loadTelegramConfig();
    if (!config.defaultSettings) config.defaultSettings = {};
    config.defaultSettings.defaultDelaySeconds = sec;
    saveTelegramConfig(config);

    return ctx.replyWithMarkdown(
      `✅ *Jeda waktu antar video berhasil diatur ke ${sec} detik!*\n\n` +
      `Silakan pilih menu di bawah untuk mulai:`,
      getMainKeyboard()
    );
  }

  return next();
});

// Jalankan Bot Telegram jika dijalankan langsung
if (process.argv[1]?.includes("bot.js")) {
  if (
    BOT_TOKEN &&
    !BOT_TOKEN.includes("MASUKKAN_BOT_TOKEN") &&
    BOT_TOKEN.trim() !== ""
  ) {
    try {
      logger.info("🚀 Menghubungkan Telegram Bot Controller ke server Telegram...");
      const botInfo = await bot.telegram.getMe();
      logger.success(
        `✅ Telegram Bot @${botInfo.username} (${botInfo.first_name}) AKTIF!`,
      );
      console.log(
        `\n👉 Silakan buka aplikasi Telegram di HP Anda:\n   Cari: @${botInfo.username}\n   Ketik: /start\n`,
      );

      bot.launch();
    } catch (err) {
      logger.error("Gagal menghubungkan Telegram Bot:", err);
    }

    process.once("SIGINT", () => bot.stop("SIGINT"));
    process.once("SIGTERM", () => bot.stop("SIGTERM"));
  } else {
    process.exit(0);
  }
}
