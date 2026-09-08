import fs from "fs";
import { Markup } from "telegraf";
import { 
  getAccounts, 
  hasAccountSession, 
  bulkImportAccounts, 
  deleteAccount, 
  getLimitedAccounts, 
  clearAccountLimit 
} from "../../config.js";
import { SessionManager, activeLoginSessions } from "../../core/sessionManager.js";
import { ProfileSwitcher } from "../../core/profileSwitcher.js";
import { createAccountBrowserContext } from "../../browser.js";
import { userStates, campaignState } from "../state.js";
import { getMainKeyboard, getRunningKeyboard } from "../keyboards.js";
import { executeLoginAccounts, buildVerificationKeyboard, buildRecaptchaGridKeyboard } from "../services/loginService.js";
import { safeReplyWithMarkdown, safeReplyWithPhoto, escapeMarkdown, formatDisplayUrl } from "../utils/safeMarkdown.js";

export function registerAccountHandlers(bot) {
  bot.hears("👥 Daftar Akun Facebook", async (ctx) => {
    try {
      if (campaignState.isRunning) {
        return ctx.reply(
          "⚠️ Bot sedang berjalan! Gunakan menu ini saat bot dalam keadaan standby.",
          getRunningKeyboard()
        );
      }

      userStates.delete(ctx.from.id);
      const accounts = await getAccounts();
      if (accounts.length === 0) {
        return safeReplyWithMarkdown(
          ctx,
          "⚠️ Belum ada akun terdaftar di sistem.\n\nKlik tombol di bawah atau ketik `/addaccount email|password` untuk menambah akun.",
          Markup.inlineKeyboard([
            [Markup.button.callback("➕ Tambah Akun Baru", "TRIGGER_ADD_ACCOUNT")]
          ])
        );
      }

      let text = `👥 *Daftar Akun Facebook Terdaftar (${accounts.length}):*\n\n`;
      accounts.forEach((acc, i) => {
        const hasSession = hasAccountSession(acc.id);
        const sessionEmoji = hasSession ? "✅ Login Tersimpan" : "❌ Belum Login";
        const limitNote = acc.isLimited
          ? `\n   └ 🛑 *STATUS: TERKENA LIMIT KOMENTAR*\n      • Alasan: _${escapeMarkdown(acc.limitReason || 'Limit Facebook')}_\n      • Waktu: _${acc.limitedAt ? new Date(acc.limitedAt).toLocaleString('id-ID') : '-'}_`
          : "";
        text += `${i + 1}. *[${escapeMarkdown(acc.id)}]* \`${acc.username}\`\n   └ Status: ${sessionEmoji} | 2FA: ${acc.twoFactorSecret ? "Ada" : "-"}${limitNote}\n\n`;
      });

      await safeReplyWithMarkdown(
        ctx,
        text,
        Markup.inlineKeyboard([
          [
            Markup.button.callback("➕ Tambah Akun", "TRIGGER_ADD_ACCOUNT"),
            Markup.button.callback("🔑 Login Akun", "TRIGGER_LOGIN_MENU")
          ],
          [
            Markup.button.callback("⚠️ Akun Limit", "TRIGGER_VIEW_LIMITED"),
            Markup.button.callback("🔄 Reset Limit", "TRIGGER_RESET_LIMIT")
          ],
          [
            Markup.button.callback("🚩 Cek Halaman (Fanspage)", "TRIGGER_CHECK_PAGES"),
            Markup.button.callback("🗑️ Hapus Akun", "TRIGGER_DELETE_MENU")
          ]
        ])
      );
    } catch (err) {
      console.error("[Telegram Accounts] Error:", err);
      return ctx.reply(`⚠️ Gagal memuat daftar akun: ${err.message}`);
    }
  });

  bot.action("TRIGGER_ADD_ACCOUNT", async (ctx) => {
    await ctx.answerCbQuery();
    userStates.set(ctx.from.id, "AWAITING_NEW_ACCOUNT");
    await ctx.replyWithMarkdown(
      `➕ *Tambah Akun Facebook Baru*\n\n` +
        `Silakan kirimkan data akun dengan format:\n` +
        `\`email|password\`\n` +
        `atau dengan 2FA secret (jika ada):\n` +
        `\`email|password|2FA_SECRET\`\n\n` +
        `_Bisa kirim banyak akun sekaligus (1 baris per akun)._`
    );
  });

  bot.action("TRIGGER_LOGIN_MENU", async (ctx) => {
    await ctx.answerCbQuery();
    const accounts = await getAccounts();
    if (accounts.length === 0) return ctx.reply("Belum ada akun terdaftar.");

    const buttons = [];

    if (accounts.length > 1) {
      buttons.push([
        Markup.button.callback("🚀 Login SEMUA Akun Sekaligus (Paralel)", "LOGIN_all")
      ]);
    }

    accounts.forEach((acc) => {
      const hasSession = hasAccountSession(acc.id);
      const sessionEmoji = hasSession ? "✅" : "🔑";
      buttons.push([
        Markup.button.callback(
          `${sessionEmoji} Login [${acc.id}] (${acc.username})`,
          `LOGIN_${acc.id}`
        )
      ]);
    });

    buttons.push([Markup.button.callback("🔙 Batalkan", "CANCEL_ACCOUNT_ACTION")]);

    await safeReplyWithMarkdown(
      ctx,
      `🔑 *Pilih Akun yang Ingin di-Login:*\n\n` +
        `• Pilih *'🚀 Login SEMUA Akun Sekaligus (Paralel)'* untuk membuka browser semua akun secara bersamaan.\n` +
        `• Atau pilih salah satu akun di bawah jika hanya ingin login akun tertentu:`,
      Markup.inlineKeyboard(buttons)
    );
  });

  bot.action(/LOGIN_(.+)/, async (ctx) => {
    const targetId = ctx.match[1];
    await ctx.answerCbQuery("Memulai login di latar belakang (Headless)...");
    executeLoginAccounts(ctx, targetId, { headless: true });
  });

  bot.action(/LOGINEXEC_(.+)_(visual|headless)/, async (ctx) => {
    const targetId = ctx.match[1];
    const mode = ctx.match[2];
    await ctx.answerCbQuery();
    const isHeadless = mode === "headless";
    executeLoginAccounts(ctx, targetId, { headless: isHeadless });
  });

  bot.action("CANCEL_LOGIN_PROMPT", async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.reply("❌ Pemilihan login dibatalkan.", getMainKeyboard());
  });

  bot.action(/SCREENSHOT_(.+)/, async (ctx) => {
    const accountId = ctx.match[1];
    await ctx.answerCbQuery("📸 Mengambil screenshot layar terbaru...");
    const res = await SessionManager.captureLoginScreenshot(accountId);
    if (res && res.screenshotPath && fs.existsSync(res.screenshotPath)) {
      const displayUrl = formatDisplayUrl(res.currentUrl);
      const isEncrypted2FA = res.currentUrl && (res.currentUrl.includes("encryptedcontext") || res.currentUrl.includes("twostepverification"));

      let statusNote = "";
      if (isEncrypted2FA) {
        statusNote = "\n\n🔐 *Status:* Layar 2FA Terbuka di Server.\n👉 _Silakan balas chat ini dengan 6-digit kode OTP Anda._";
      }

      await safeReplyWithPhoto(
        ctx,
        { source: res.screenshotPath },
        {
          caption: `📸 *[${escapeMarkdown(accountId)}] Layar Terkini Facebook*\n\n` +
            `🔗 *Halaman:* \`${displayUrl}\`\n` +
            `🕒 _Diambil: ${new Date().toLocaleTimeString('id-ID')}_${statusNote}`,
          parse_mode: "Markdown",
          ...buildVerificationKeyboard(accountId, res.currentUrl)
        }
      );
    } else {
      await ctx.reply(`⚠️ Tidak dapat mengambil screenshot untuk [${accountId}]. Kemungkinan browser sudah selesai atau sesi login telah tertutup.`);
    }
  });

  bot.action(/CLICK_RECAPTCHA_(.+)/, async (ctx) => {
    const accountId = ctx.match[1];
    await ctx.answerCbQuery("🤖 Mencoba mengeklik 'Saya bukan robot'...");
    const page = activeLoginSessions.get(accountId);
    if (!page || page.isClosed()) {
      return ctx.reply(`⚠️ Sesi browser untuk [${accountId}] tidak aktif atau sudah selesai.`);
    }

    try {
      const clicked = await SessionManager.handleRecaptcha(page);
      if (clicked) {
        await ctx.reply(`✅ Berhasil mengeklik 'Saya bukan robot' untuk [${accountId}]! Facebook sedang memproses... Tunggu sejenak lalu cek layar terkini.`);
      } else {
        await ctx.reply(`ℹ️ Checkbox reCAPTCHA tidak ditemukan atau sudah tercentang pada halaman [${accountId}].`);
      }
    } catch (err) {
      await ctx.reply(`⚠️ Gagal saat mencoba klik reCAPTCHA: ${err.message}`);
    }
  });

  bot.action(/OPEN_CAPTCHA_PAD_(.+)/, async (ctx) => {
    const accountId = ctx.match[1];
    await ctx.answerCbQuery("🧩 Membuka papan angka puzzle...");
    const res = await SessionManager.captureLoginScreenshot(accountId);
    if (res && res.screenshotPath && fs.existsSync(res.screenshotPath)) {
      await safeReplyWithPhoto(
        ctx,
        { source: res.screenshotPath },
        {
          caption: `🧩 *[${escapeMarkdown(accountId)}] Papan Bantuan Puzzle reCAPTCHA (1-9)*\n\n` +
            `Lihat susunan kotak gambar 3x3 pada gambar di atas:\n` +
            `• Baris Atas: 1️⃣, 2️⃣, 3️⃣\n` +
            `• Baris Tengah: 4️⃣, 5️⃣, 6️⃣\n` +
            `• Baris Bawah: 7️⃣, 8️⃣, 9️⃣\n\n` +
            `_Ketuk angka kotak yang ada objek yang diminta (misal Mobil), lalu ketuk [✅ Verifikasi]._`,
          parse_mode: "Markdown",
          ...buildRecaptchaGridKeyboard(accountId)
        }
      );
    } else {
      await ctx.reply(`⚠️ Browser untuk [${accountId}] sudah tidak aktif atau selesai.`);
    }
  });

  bot.action(/CAPTCHA_TILE_(.+)_(.+)/, async (ctx) => {
    const accountId = ctx.match[1];
    const tileNum = parseInt(ctx.match[2], 10);
    await ctx.answerCbQuery(`Mengetuk kotak nomor ${tileNum}...`);
    
    await SessionManager.clickRecaptchaTile(accountId, tileNum);
    const res = await SessionManager.captureLoginScreenshot(accountId);
    if (res && res.screenshotPath && fs.existsSync(res.screenshotPath)) {
      await safeReplyWithPhoto(
        ctx,
        { source: res.screenshotPath },
        {
          caption: `🎯 *[${escapeMarkdown(accountId)}] Kotak ${tileNum} diklik!*\n` +
            `_Pilih kotak lain jika masih ada, atau ketuk [✅ Verifikasi] jika objek sudah habis._`,
          parse_mode: "Markdown",
          ...buildRecaptchaGridKeyboard(accountId)
        }
      );
    }
  });

  bot.action(/CAPTCHA_VERIFY_(.+)/, async (ctx) => {
    const accountId = ctx.match[1];
    await ctx.answerCbQuery("Mengirim verifikasi...");
    await SessionManager.clickRecaptchaVerify(accountId);
    
    const res = await SessionManager.captureLoginScreenshot(accountId);
    if (res && res.screenshotPath && fs.existsSync(res.screenshotPath)) {
      await safeReplyWithPhoto(
        ctx,
        { source: res.screenshotPath },
        {
          caption: `🔎 *[${escapeMarkdown(accountId)}] Hasil Verifikasi:*\n` +
            `_Jika muncul gambar baru, pilih lagi kotaknya. Jika centang hijau sudah didapat, bot akan otomatis masuk._`,
          parse_mode: "Markdown",
          ...buildRecaptchaGridKeyboard(accountId)
        }
      );
    }
  });

  bot.action(/CAPTCHA_RELOAD_(.+)/, async (ctx) => {
    const accountId = ctx.match[1];
    await ctx.answerCbQuery("Meminta soal gambar baru...");
    await SessionManager.clickRecaptchaReload(accountId);

    const res = await SessionManager.captureLoginScreenshot(accountId);
    if (res && res.screenshotPath && fs.existsSync(res.screenshotPath)) {
      await safeReplyWithPhoto(
        ctx,
        { source: res.screenshotPath },
        {
          caption: `🔄 *[${escapeMarkdown(accountId)}] Soal gambar baru dimuat.*\n_Silakan pilih kotak yang sesuai._`,
          parse_mode: "Markdown",
          ...buildRecaptchaGridKeyboard(accountId)
        }
      );
    }
  });

  bot.action(/CANCEL_LOGIN_(.+)/, async (ctx) => {
    const accountId = ctx.match[1];
    await ctx.answerCbQuery("Membatalkan proses login...");
    campaignState.isRunning = false;
    userStates.delete(ctx.from.id);
    await ctx.reply(`🛑 Proses login untuk [${accountId}] telah dibatalkan.`, getMainKeyboard());
  });

  bot.command("addaccount", async (ctx) => {
    if (campaignState.isRunning) return ctx.reply("⚠️ Bot sedang berjalan.");
    const text = ctx.message.text.replace("/addaccount", "").trim();
    if (!text) {
      return ctx.reply(
        "Format: /addaccount email|password|2fa_secret\nContoh: /addaccount user@gmail.com|pass123|JBSWY3DPEHPK3PXP"
      );
    }
    const imported = await bulkImportAccounts(text);
    if (imported.length > 0) {
      await ctx.replyWithMarkdown(
        `✅ *Berhasil menambahkan ${imported.length} akun!*\n${imported
          .map((a) => `• *[${a.id}]* ${a.username}`)
          .join(
            "\n"
          )}\n\nKetik \`/login all\` atau klik menu '👥 Daftar Akun Facebook' untuk login.`
      );
    } else {
      await ctx.reply(
        "⚠️ Format tidak valid. Gunakan format: email|password atau email|password|2fa_secret"
      );
    }
  });

  bot.command("login", async (ctx) => {
    if (campaignState.isRunning) return ctx.reply("⚠️ Bot sedang berjalan.");
    const parts = ctx.message.text.split(" ");
    const targetId = parts[1]?.trim() || "all";
    const modeArg = parts[2]?.trim()?.toLowerCase();
    const isHeadless = modeArg === "visual" ? false : true;
    executeLoginAccounts(ctx, targetId, { headless: isHeadless });
  });

  bot.hears("🩺 Cek Status Sesi", async (ctx) => {
    if (campaignState.isRunning) {
      return ctx.reply(
        "⚠️ Bot sedang berjalan! Cek status sesi hanya dapat dilakukan saat bot standby.",
        getRunningKeyboard()
      );
    }

    userStates.delete(ctx.from.id);
    const accounts = await getAccounts();
    if (accounts.length === 0) return ctx.reply("Belum ada akun terdaftar.");

    await ctx.reply(
      "🔍 Sedang memverifikasi status sesi semua akun di Facebook (mohon tunggu)..."
    );
    for (const acc of accounts) {
      const res = await SessionManager.verifySession(acc);
      let statusText = "";
      if (res.isValid) {
        if (res.isRestricted) {
          statusText = `⚠️ *Sesi AKTIF tetapi TERKENA PEMBATASAN!*\n_Pesan: ${res.restrictionReason || "Akun terkena limit / pembatasan dari Facebook"}_`;
        } else {
          statusText = `✅ *Sesi AKTIF & Siap Berkomentar*`;
        }
      } else {
        statusText = `❌ *Sesi KADALUARSA / Checkpoint*`;
      }
      await ctx.replyWithMarkdown(`Account *[${acc.id}]* (${acc.username}):\n${statusText}`);
    }
  });

  // Menu Pemeriksaan Halaman Facebook (Fanspage)
  bot.action("TRIGGER_CHECK_PAGES", async (ctx) => {
    await ctx.answerCbQuery();
    if (campaignState.isRunning) {
      return ctx.reply("⚠️ Bot sedang berjalan! Cek halaman hanya dapat dilakukan saat bot standby.", getRunningKeyboard());
    }

    const accounts = await getAccounts();
    if (accounts.length === 0) return ctx.reply("Belum ada akun terdaftar.");

    await ctx.reply("🔍 Memeriksa daftar Halaman Facebook (Fanspage) untuk semua akun terdaftar (mohon tunggu)...");

    for (const acc of accounts) {
      if (!hasAccountSession(acc.id)) {
        await ctx.reply(`Account [${acc.id}] (${acc.username}):\n❌ Belum login. Silakan login terlebih dahulu.`);
        continue;
      }

      let browserInstance = null;
      try {
        browserInstance = await createAccountBrowserContext(acc, { headless: true });
        const pages = await ProfileSwitcher.getAccountPages(browserInstance.page);
        await browserInstance.close();

        if (pages.length > 0) {
          const listText = pages.map((p, idx) => `   ${idx + 1}. 🚩 *${p.name}*`).join("\n");
          await ctx.replyWithMarkdown(
            `Account *[${acc.id}]* (${acc.username}):\n` +
              `Ditemukan *${pages.length} Halaman Facebook:*\n${listText}\n\n` +
              `_Anda dapat menggunakan Halaman ini untuk berkomentar melalui menu '🎭 Identitas (Akun / Halaman)'._`
          );
        } else {
          await ctx.replyWithMarkdown(
            `Account *[${acc.id}]* (${acc.username}):\n` +
              `ℹ️ Tidak ditemukan Halaman Facebook pada akun ini (Hanya memiliki Profil Pribadi).`
          );
        }
      } catch (e) {
        if (browserInstance?.close) await browserInstance.close().catch(() => {});
        await ctx.reply(`Account [${acc.id}] (${acc.username}):\n⚠️ Gagal memeriksa Halaman: ${e.message}`);
      }
    }
  });

  // Menu Pemilihan Akun yang Ingin Dihapus
  bot.action("TRIGGER_DELETE_MENU", async (ctx) => {
    await ctx.answerCbQuery();
    if (campaignState.isRunning) {
      return ctx.reply("⚠️ Bot sedang berjalan! Hapus akun hanya dapat dilakukan saat bot standby.", getRunningKeyboard());
    }

    const accounts = await getAccounts();
    if (accounts.length === 0) return ctx.reply("Belum ada akun terdaftar.");

    const buttons = accounts.map((acc) => [
      Markup.button.callback(`🗑️ Hapus [${acc.id}] (${acc.username})`, `CONFIRM_DEL_${acc.id}`)
    ]);
    buttons.push([Markup.button.callback("🔙 Batalkan", "CANCEL_ACCOUNT_ACTION")]);

    await ctx.replyWithMarkdown(
      `🗑️ *Pilih Akun yang Ingin Dihapus:*\n\n` +
        `_Pilih salah satu akun di bawah untuk memilih opsi penghapusan (dengan atau tanpa sesi login Facebook):_`,
      Markup.inlineKeyboard(buttons)
    );
  });

  // Tampilkan Opsi Penghapusan (Dengan Sesi atau Tanpa Sesi)
  bot.action(/CONFIRM_DEL_(.+)/, async (ctx) => {
    const accountId = ctx.match[1];
    await ctx.answerCbQuery();
    if (campaignState.isRunning) {
      return ctx.reply("⚠️ Bot sedang berjalan!", getRunningKeyboard());
    }

    const accounts = await getAccounts();
    const target = accounts.find((a) => a.id === accountId);
    if (!target) return ctx.reply("⚠️ Akun tidak ditemukan.");

    const hasSession = hasAccountSession(accountId);

    await safeReplyWithMarkdown(
      ctx,
      `⚠️ *Konfirmasi Hapus Akun Facebook*\n\n` +
        `• *ID Akun:* \`${target.id}\`\n` +
        `• *Username:* \`${target.username}\`\n` +
        `• *Status Sesi:* ${hasSession ? "✅ Ada file sesi login tersimpan" : "❌ Tidak ada sesi"}\n\n` +
        `Silakan pilih opsi penghapusan:\n` +
        `1. *Hapus Akun + Sesi*: Menghapus akun dari sistem dan menghapus file sesi & profil browser secara permanen.\n` +
        `2. *Hapus Akun Saja*: Menghapus akun dari sistem tetapi file sesi profil browser tetap disimpan di server.`,
      Markup.inlineKeyboard([
        [
          Markup.button.callback("🗑️ Hapus Akun + Sesi Browser", `EXEC_DEL_${accountId}_WITH_SESSION`)
        ],
        [
          Markup.button.callback("📄 Hapus Akun Saja (Simpan Sesi)", `EXEC_DEL_${accountId}_NO_SESSION`)
        ],
        [
          Markup.button.callback("🔙 Batalkan", "CANCEL_ACCOUNT_ACTION")
        ]
      ])
    );
  });

  // Eksekusi Penghapusan Akun
  bot.action(/EXEC_DEL_(.+)_(WITH_SESSION|NO_SESSION)/, async (ctx) => {
    const accountId = ctx.match[1];
    const mode = ctx.match[2];
    const deleteSession = mode === "WITH_SESSION";

    await ctx.answerCbQuery();
    if (campaignState.isRunning) {
      return ctx.reply("⚠️ Bot sedang berjalan!", getRunningKeyboard());
    }

    const accounts = await getAccounts();
    const target = accounts.find((a) => a.id === accountId);
    const username = target ? target.username : accountId;

    await deleteAccount(accountId, deleteSession);

    if (deleteSession) {
      await ctx.replyWithMarkdown(
        `✅ *Akun [${accountId}] (${username}) BERHASIL DIHAPUS!*\n\n` +
          `File sesi dan direktori profil browser juga telah dibersihkan secara permanen.`
      );
    } else {
      await ctx.replyWithMarkdown(
        `✅ *Akun [${accountId}] (${username}) BERHASIL DIHAPUS!*\n\n` +
          `File sesi browser tetap tersimpan di server jika Anda ingin mendaftarkannya kembali nanti.`
      );
    }
  });

  // Batalkan Aksi Akun
  bot.action("CANCEL_ACCOUNT_ACTION", async (ctx) => {
    await ctx.answerCbQuery("Aksi dibatalkan");
    await ctx.reply("ℹ️ Aksi dibatalkan.");
  });

  // Command /deleteaccount <acc_id>
  bot.command("deleteaccount", async (ctx) => {
    if (campaignState.isRunning) return ctx.reply("⚠️ Bot sedang berjalan.");
    const parts = ctx.message.text.split(" ");
    const targetId = parts[1]?.trim();

    const accounts = await getAccounts();
    if (accounts.length === 0) return ctx.reply("Belum ada akun terdaftar.");

    if (!targetId) {
      const buttons = accounts.map((acc) => [
        Markup.button.callback(`🗑️ Hapus [${acc.id}] (${acc.username})`, `CONFIRM_DEL_${acc.id}`)
      ]);
      buttons.push([Markup.button.callback("🔙 Batalkan", "CANCEL_ACCOUNT_ACTION")]);

      return ctx.replyWithMarkdown(
        `🗑️ *Hapus Akun Facebook*\n\n` +
          `Silakan pilih akun yang ingin dihapus:\n` +
          `_(Atau ketik langsung: \`/deleteaccount <id_akun>\`)_`,
        Markup.inlineKeyboard(buttons)
      );
    }

    const target = accounts.find((a) => a.id === targetId || a.username === targetId);
    if (!target) {
      return ctx.reply(`⚠️ Akun "${targetId}" tidak ditemukan.`);
    }

    const hasSession = hasAccountSession(target.id);
    await safeReplyWithMarkdown(
      ctx,
      `⚠️ *Konfirmasi Hapus Akun Facebook*\n\n` +
        `• *ID Akun:* \`${target.id}\`\n` +
        `• *Username:* \`${target.username}\`\n` +
        `• *Status Sesi:* ${hasSession ? "✅ Ada file sesi login tersimpan" : "❌ Tidak ada sesi"}\n\n` +
        `Silakan pilih opsi penghapusan:`,
      Markup.inlineKeyboard([
        [
          Markup.button.callback("🗑️ Hapus Akun + Sesi Browser", `EXEC_DEL_${target.id}_WITH_SESSION`)
        ],
        [
          Markup.button.callback("📄 Hapus Akun Saja (Simpan Sesi)", `EXEC_DEL_${target.id}_NO_SESSION`)
        ],
        [
          Markup.button.callback("🔙 Batalkan", "CANCEL_ACCOUNT_ACTION")
        ]
      ])
    );
  });

  // Handler: Lihat Daftar Akun yang Terkena Limit
  const showLimitedAccountsTelegram = async (ctx) => {
    try {
      const limited = await getLimitedAccounts();
      if (limited.length === 0) {
        return safeReplyWithMarkdown(ctx, "🎉 *Semua Akun Normal!*\n\nTidak ada akun yang tercatat terkena limit komentar Facebook saat ini.");
      }

      let msg = `🛑 *Daftar Akun Terkena Limit Komentar (${limited.length}):*\n\n`;
      limited.forEach((acc, i) => {
        const dateStr = acc.limitedAt ? new Date(acc.limitedAt).toLocaleString("id-ID") : "-";
        msg += `${i + 1}. *[${escapeMarkdown(acc.id)}]* \`${acc.username}\`\n` +
               `   • Alasan: _${escapeMarkdown(acc.limitReason || "Limit komentar Facebook")}_\n` +
               `   • Waktu: _${dateStr}_\n\n`;
      });

      msg += `_Gunakan tombol di bawah jika masa limit sudah lewat untuk mereset statusnya ke normal._`;

      await safeReplyWithMarkdown(
        ctx,
        msg,
        Markup.inlineKeyboard([
          [Markup.button.callback("🔄 Reset Limit Akun", "TRIGGER_RESET_LIMIT")],
          [Markup.button.callback("🔙 Tutup", "CANCEL_ACCOUNT_ACTION")]
        ])
      );
    } catch (err) {
      console.error("[Telegram Limited Error]:", err);
      return ctx.reply(`⚠️ Gagal memuat akun limit: ${err.message}`);
    }
  };

  bot.action("TRIGGER_VIEW_LIMITED", async (ctx) => {
    await ctx.answerCbQuery();
    await showLimitedAccountsTelegram(ctx);
  });

  bot.command("limited", async (ctx) => {
    await showLimitedAccountsTelegram(ctx);
  });

  // Handler: Menu Reset Limit Akun
  const showResetLimitMenu = async (ctx) => {
    try {
      const limited = await getLimitedAccounts();
      if (limited.length === 0) {
        return safeReplyWithMarkdown(ctx, "🎉 *Tidak ada akun yang terkena limit untuk direset.*");
      }

      const buttons = limited.map((acc) => [
        Markup.button.callback(`🔄 Reset [${acc.id}] (${acc.username})`, `EXEC_RESET_LIMIT_${acc.id}`)
      ]);

      buttons.push([Markup.button.callback("✨ Reset SEMUA Akun ke Normal", "EXEC_RESET_LIMIT_ALL")]);
      buttons.push([Markup.button.callback("🔙 Batalkan", "CANCEL_ACCOUNT_ACTION")]);

      await safeReplyWithMarkdown(
        ctx,
        `🔄 *Reset Status Limit Komentar*\n\n` +
        `Pilih akun yang ingin dikembalikan statusnya ke Normal:`,
        Markup.inlineKeyboard(buttons)
      );
    } catch (err) {
      console.error("[Telegram Reset Limit Error]:", err);
      return ctx.reply(`⚠️ Gagal membuka menu reset limit: ${err.message}`);
    }
  };

  bot.action("TRIGGER_RESET_LIMIT", async (ctx) => {
    await ctx.answerCbQuery();
    await showResetLimitMenu(ctx);
  });

  bot.command("resetlimit", async (ctx) => {
    await showResetLimitMenu(ctx);
  });

  bot.action(/^EXEC_RESET_LIMIT_(.+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const targetId = ctx.match[1];

    if (targetId === "ALL") {
      const limited = await getLimitedAccounts();
      for (const acc of limited) {
        await clearAccountLimit(acc.id);
      }
      return ctx.replyWithMarkdown(`✅ *Sukses!* Status limit untuk *${limited.length} akun* telah direset ke Normal.`);
    } else {
      await clearAccountLimit(targetId);
      return ctx.replyWithMarkdown(`✅ *Sukses!* Akun *[${targetId}]* telah direset dan siap digunakan kembali.`);
    }
  });

  // Command /openbrowser <acc_id> atau /inspect <acc_id>
  bot.command(["openbrowser", "inspect", "screenshot"], async (ctx) => {
    if (campaignState.isRunning) return ctx.reply("⚠️ Bot sedang menjalankan kampanye.");
    const parts = ctx.message.text.split(" ");
    const targetId = parts[1]?.trim();

    const accounts = await getAccounts();
    if (accounts.length === 0) return ctx.reply("Belum ada akun terdaftar.");

    const target = targetId ? accounts.find(a => a.id === targetId || a.username === targetId) : accounts[0];
    if (!target) {
      return ctx.reply(`⚠️ Akun "${targetId}" tidak ditemukan. Contoh: /openbrowser ${accounts[0].id}`);
    }

    await ctx.reply(`🌐 Membuka browser akun [${target.id}] (${target.username}) dan mengambil tangkapan layar...`);

    let browserInstance = null;
    try {
      browserInstance = await createAccountBrowserContext(target, { headless: false });
      const { page, context, close } = browserInstance;

      await page.goto("https://www.facebook.com/", { waitUntil: "domcontentloaded", timeout: 45000 });
      await sleep(3000);

      const shotBuffer = await page.screenshot({ fullPage: false });
      const displayUrl = formatDisplayUrl(page.url());
      await safeReplyWithPhoto(ctx, { source: shotBuffer }, {
        caption: `🌐 *Tampilan Facebook Akun:* [${escapeMarkdown(target.id)}] (\`${target.username}\`)\nURL: \`${displayUrl}\``,
        parse_mode: "Markdown"
      });

      // Beri jeda 30 detik agar user bisa melihat jika di depan PC
      setTimeout(async () => {
        await close().catch(() => {});
      }, 30000);
    } catch (err) {
      if (browserInstance?.close) await browserInstance.close().catch(() => {});
      await ctx.reply(`❌ Gagal membuka browser akun: ${err.message}`);
    }
  });
}
