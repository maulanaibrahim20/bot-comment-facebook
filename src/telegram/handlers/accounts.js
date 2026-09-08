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
import { SessionManager } from "../../core/sessionManager.js";
import { ProfileSwitcher } from "../../core/profileSwitcher.js";
import { createAccountBrowserContext } from "../../browser.js";
import { userStates, campaignState } from "../state.js";
import { getMainKeyboard, getRunningKeyboard } from "../keyboards.js";
import { executeLoginAccounts, buildVerificationKeyboard } from "../services/loginService.js";

export function registerAccountHandlers(bot) {
  bot.hears("👥 Daftar Akun Facebook", async (ctx) => {
    if (campaignState.isRunning) {
      return ctx.reply(
        "⚠️ Bot sedang berjalan! Gunakan menu ini saat bot dalam keadaan standby.",
        getRunningKeyboard()
      );
    }

    userStates.delete(ctx.from.id);
    const accounts = await getAccounts();
    if (accounts.length === 0) {
      return ctx.replyWithMarkdown(
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
        ? `\n   └ 🛑 *STATUS: TERKENA LIMIT KOMENTAR*\n      • Alasan: _${acc.limitReason || 'Limit Facebook'}_\n      • Waktu: _${acc.limitedAt ? new Date(acc.limitedAt).toLocaleString('id-ID') : '-'}_`
        : "";
      text += `${i + 1}. *[${acc.id}]* ${acc.username}\n   └ Status: ${sessionEmoji} | 2FA: ${acc.twoFactorSecret ? "Ada" : "-"}${limitNote}\n\n`;
    });

    await ctx.replyWithMarkdown(
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

    await ctx.replyWithMarkdown(
      `🔑 *Pilih Akun yang Ingin di-Login:*\n\n` +
        `• Pilih *'🚀 Login SEMUA Akun Sekaligus (Paralel)'* untuk membuka browser semua akun secara bersamaan.\n` +
        `• Atau pilih salah satu akun di bawah jika hanya ingin login akun tertentu:`,
      Markup.inlineKeyboard(buttons)
    );
  });

  bot.action(/LOGIN_(.+)/, async (ctx) => {
    const targetId = ctx.match[1];
    await ctx.answerCbQuery();

    await ctx.replyWithMarkdown(
      `🖥️ *Pilih Tampilan Browser untuk Login [${targetId}]:*\n\n` +
      `• *🖥️ Buka Jendela Browser di PC (Visual)*:\n` +
      `  Jendela browser Chrome akan muncul langsung di layar komputer Anda. Sangat disarankan jika ada verifikasi CAPTCHA, video selfie, atau konfirmasi tombol persetujuan di layar.\n\n` +
      `• *🕶️ Latar Belakang (Headless)*:\n` +
      `  Browser berjalan di background tanpa membuka jendela di PC. Tautan verifikasi, screenshot, dan kode OTP dikontrol via Telegram.`,
      Markup.inlineKeyboard([
        [
          Markup.button.callback("🖥️ Buka Jendela Browser di PC (Visual)", `LOGINEXEC_${targetId}_visual`)
        ],
        [
          Markup.button.callback("🕶️ Latar Belakang (Headless)", `LOGINEXEC_${targetId}_headless`)
        ],
        [
          Markup.button.callback("🔙 Batal", "CANCEL_LOGIN_PROMPT")
        ]
      ])
    );
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
      await ctx.replyWithPhoto(
        { source: res.screenshotPath },
        {
          caption: `📸 *[${accountId}] Layar Terkini Facebook*\n\n` +
            `🔗 *URL:* ${res.currentUrl || "https://facebook.com"}\n` +
            `🕒 _Diambil pada: ${new Date().toLocaleTimeString('id-ID')}_`,
          parse_mode: "Markdown",
          ...buildVerificationKeyboard(accountId, res.currentUrl)
        }
      );
    } else {
      await ctx.reply(`⚠️ Tidak dapat mengambil screenshot untuk [${accountId}]. Kemungkinan browser sudah selesai atau sesi login telah tertutup.`);
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

    if (modeArg === "visual" || modeArg === "headless") {
      executeLoginAccounts(ctx, targetId, { headless: modeArg === "headless" });
    } else {
      await ctx.replyWithMarkdown(
        `🖥️ *Pilih Tampilan Browser untuk Login [${targetId}]:*`,
        Markup.inlineKeyboard([
          [Markup.button.callback("🖥️ Buka Jendela Browser di PC (Visual)", `LOGINEXEC_${targetId}_visual`)],
          [Markup.button.callback("🕶️ Latar Belakang (Headless)", `LOGINEXEC_${targetId}_headless`)],
          [Markup.button.callback("🔙 Batal", "CANCEL_LOGIN_PROMPT")]
        ])
      );
    }
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

    await ctx.replyWithMarkdown(
      `⚠️ *Konfirmasi Hapus Akun Facebook*\n\n` +
        `• *ID Akun:* \`${target.id}\`\n` +
        `• *Username:* *${target.username}*\n` +
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
    await ctx.replyWithMarkdown(
      `⚠️ *Konfirmasi Hapus Akun Facebook*\n\n` +
        `• *ID Akun:* \`${target.id}\`\n` +
        `• *Username:* *${target.username}*\n` +
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
    const limited = await getLimitedAccounts();
    if (limited.length === 0) {
      return ctx.replyWithMarkdown("🎉 *Semua Akun Normal!*\n\nTidak ada akun yang tercatat terkena limit komentar Facebook saat ini.");
    }

    let msg = `🛑 *Daftar Akun Terkena Limit Komentar (${limited.length}):*\n\n`;
    limited.forEach((acc, i) => {
      const dateStr = acc.limitedAt ? new Date(acc.limitedAt).toLocaleString("id-ID") : "-";
      msg += `${i + 1}. *[${acc.id}]* \`${acc.username}\`\n` +
             `   • Alasan: _${acc.limitReason || "Limit komentar Facebook"}_\n` +
             `   • Waktu: _${dateStr}_\n\n`;
    });

    msg += `_Gunakan tombol di bawah jika masa limit sudah lewat untuk mereset statusnya ke normal._`;

    await ctx.replyWithMarkdown(
      msg,
      Markup.inlineKeyboard([
        [Markup.button.callback("🔄 Reset Limit Akun", "TRIGGER_RESET_LIMIT")],
        [Markup.button.callback("🔙 Tutup", "CANCEL_ACCOUNT_ACTION")]
      ])
    );
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
    const limited = await getLimitedAccounts();
    if (limited.length === 0) {
      return ctx.replyWithMarkdown("🎉 *Tidak ada akun yang terkena limit untuk direset.*");
    }

    const buttons = limited.map((acc) => [
      Markup.button.callback(`🔄 Reset [${acc.id}] (${acc.username})`, `EXEC_RESET_LIMIT_${acc.id}`)
    ]);

    buttons.push([Markup.button.callback("✨ Reset SEMUA Akun ke Normal", "EXEC_RESET_LIMIT_ALL")]);
    buttons.push([Markup.button.callback("🔙 Batalkan", "CANCEL_ACCOUNT_ACTION")]);

    await ctx.replyWithMarkdown(
      `🔄 *Reset Status Limit Komentar*\n\n` +
      `Pilih akun yang ingin dikembalikan statusnya ke Normal:`,
      Markup.inlineKeyboard(buttons)
    );
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
      await ctx.replyWithPhoto({ source: shotBuffer }, {
        caption: `🌐 *Tampilan Facebook Akun:* [${target.id}] (${target.username})\nURL: \`${page.url()}\``
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
