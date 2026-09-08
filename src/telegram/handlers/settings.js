import { Markup } from "telegraf";
import { loadTelegramConfig, saveTelegramConfig } from "../config.js";
import { clearCommentHistory } from "../../config.js";
import { generateVariations } from "../../utils/spintax.js";
import { userStates, campaignState } from "../state.js";
import { getRunningKeyboard, getMainKeyboard } from "../keyboards.js";

export function registerSettingsHandlers(bot) {
  // Fitur Mengatur Komentar / Link Custom
  bot.hears("✏️ Atur Komentar / Link", async (ctx) => {
    if (campaignState.isRunning) {
      return ctx.reply(
        "⚠️ Bot sedang berjalan! Pengaturan komentar dikunci selama kampanye aktif. Tekan '🛑 Stop Kampanye' terlebih dahulu.",
        getRunningKeyboard()
      );
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
    if (campaignState.isRunning) {
      return ctx.reply(
        "⚠️ Bot sedang berjalan! Pengaturan dikunci saat kampanye aktif.",
        getRunningKeyboard()
      );
    }

    const text = ctx.message.text.replace("/setcomment", "").trim();
    if (!text) {
      return ctx.reply("Format: /setcomment <teks atau link>");
    }
    let config = loadTelegramConfig();
    if (!config.defaultSettings) config.defaultSettings = {};
    config.defaultSettings.customComment = text;
    saveTelegramConfig(config);

    await ctx.replyWithMarkdown(
      `✅ *Komentar default berhasil diperbarui!*\n\nKomentar aktif:\n\`${text}\``
    );
  });

  // Fitur Mengatur Jeda Waktu (Delay) & Tampilan Browser
  bot.hears(["⏱️ Atur Jeda & Browser", "⏱️ Atur Jeda (Delay)"], async (ctx) => {
    if (campaignState.isRunning) {
      return ctx.reply(
        "⚠️ Bot sedang berjalan! Jeda delay dikunci selama kampanye aktif. Tekan '🛑 Stop Kampanye' terlebih dahulu.",
        getRunningKeyboard()
      );
    }

    userStates.delete(ctx.from.id);
    const config = loadTelegramConfig();
    const currentDelay = config.defaultSettings?.defaultDelaySeconds || 15;
    const isHeadless = config.defaultSettings?.headless !== false;
    const browserModeText = isHeadless ? "🕶️ Latar Belakang (Headless)" : "🖥️ Buka Jendela Browser (Terlihat)";
    const minC = config.defaultSettings?.minComments || 0;
    const maxC = config.defaultSettings?.maxComments || 0;
    const filterText = minC > 0 && maxC > 0 
      ? `${minC} - ${maxC} komentar` 
      : (maxC > 0 ? `Maksimal ${maxC} komentar` : (minC > 0 ? `Minimal ${minC} komentar` : "Bebas (Tanpa Batas)"));

    await ctx.replyWithMarkdown(
      `⏱️ *Pengaturan Jeda, Browser & Filter Komentar*\n\n` +
        `• *Jeda Aktif Saat Ini:* *${currentDelay} detik*\n` +
        `• *Tampilan Browser:* *${browserModeText}*\n` +
        `• *Filter Komentar Target:* *${filterText}*\n\n` +
        `Pilih opsi pengaturan yang ingin diubah:`,
      Markup.inlineKeyboard([
        [
          Markup.button.callback("10 Detik", "DELAY_10"),
          Markup.button.callback("15 Detik (Normal)", "DELAY_15")
        ],
        [
          Markup.button.callback("20 Detik", "DELAY_20"),
          Markup.button.callback("30 Detik (Aman)", "DELAY_30")
        ],
        [
          Markup.button.callback("45 Detik", "DELAY_45"),
          Markup.button.callback("60 Detik (Sangat Aman)", "DELAY_60")
        ],
        [
          Markup.button.callback("✏️ Ketik Jeda Manual (Detik)", "DELAY_MANUAL")
        ],
        [
          Markup.button.callback(
            isHeadless ? "🖥️ Ubah: Buka Jendela Browser" : "🕶️ Ubah: Latar Belakang",
            "TOGGLE_HEADLESS"
          )
        ],
        [
          Markup.button.callback("🎯 Atur Filter Komentar Target", "TRIGGER_FILTER_MENU")
        ]
      ])
    );
  });

  bot.action("TRIGGER_FILTER_MENU", async (ctx) => {
    await ctx.answerCbQuery();
    const config = loadTelegramConfig();
    const minC = config.defaultSettings?.minComments || 0;
    const maxC = config.defaultSettings?.maxComments || 0;
    const currentStr = minC > 0 && maxC > 0 
      ? `${minC} - ${maxC} komentar` 
      : (maxC > 0 ? `Maksimal ${maxC} komentar` : (minC > 0 ? `Minimal ${minC} komentar` : "Bebas"));

    await ctx.replyWithMarkdown(
      `🎯 *Filter Jumlah Komentar Postingan / Reels*\n\n` +
      `Hanya mengomentari postingan/Reels yang jumlah komentarnya sesuai kriteria.\n` +
      `• *Filter Aktif Saat Ini:* *${currentStr}*\n\n` +
      `Pilih filter yang diinginkan:`,
      Markup.inlineKeyboard([
        [Markup.button.callback("🌐 Bebas (Semua Postingan/Reels)", "SET_FILTER_0_0")],
        [Markup.button.callback("🎯 Maksimal 50 Komentar (Baru/Sepi)", "SET_FILTER_0_50")],
        [Markup.button.callback("🎯 Maksimal 100 Komentar (Sedang)", "SET_FILTER_0_100")],
        [Markup.button.callback("🎯 Range 50 - 60 Komentar", "SET_FILTER_50_60")],
        [Markup.button.callback("✏️ Ketik Range / Maksimal Manual", "SET_FILTER_MANUAL")]
      ])
    );
  });

  bot.action(/^SET_FILTER_(\d+)_(\d+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const min = parseInt(ctx.match[1], 10);
    const max = parseInt(ctx.match[2], 10);

    let config = loadTelegramConfig();
    if (!config.defaultSettings) config.defaultSettings = {};
    config.defaultSettings.minComments = min;
    config.defaultSettings.maxComments = max;
    saveTelegramConfig(config);

    const desc = min > 0 && max > 0 
      ? `${min} - ${max} komentar` 
      : (max > 0 ? `Maksimal ${max} komentar` : (min > 0 ? `Minimal ${min} komentar` : "Bebas (Semua Postingan / Reels)"));

    await ctx.replyWithMarkdown(`✅ *Filter jumlah komentar berhasil diatur ke:*\n*${desc}*`);
  });

  bot.action("SET_FILTER_MANUAL", async (ctx) => {
    await ctx.answerCbQuery();
    userStates.set(ctx.from.id, "AWAITING_COMMENT_FILTER");
    await ctx.reply(
      "Silakan ketik batas komentar yang Anda inginkan.\n\n" +
      "Contoh:\n" +
      "• Ketik `100` untuk maksimal 100 komentar\n" +
      "• Ketik `50-60` untuk range antara 50 sampai 60 komentar\n" +
      "• Ketik `0` untuk tanpa batas (bebas)"
    );
  });

  bot.command(["setfilter", "filter"], async (ctx) => {
    const raw = ctx.message.text.replace(/\/setfilter|\/filter/i, "").trim();
    if (!raw) {
      userStates.set(ctx.from.id, "AWAITING_COMMENT_FILTER");
      return ctx.reply("Format: /filter <maksimal> atau /filter <min> <max>\nContoh:\n/filter 100\n/filter 50 60\n/filter 0 (bebas)");
    }

    const parts = raw.split(/[\s-]+/);
    let min = 0;
    let max = 0;

    if (parts.length === 1) {
      max = parseInt(parts[0], 10) || 0;
    } else if (parts.length >= 2) {
      min = parseInt(parts[0], 10) || 0;
      max = parseInt(parts[1], 10) || 0;
    }

    let config = loadTelegramConfig();
    if (!config.defaultSettings) config.defaultSettings = {};
    config.defaultSettings.minComments = min;
    config.defaultSettings.maxComments = max;
    saveTelegramConfig(config);

    const desc = min > 0 && max > 0 
      ? `${min} - ${max} komentar` 
      : (max > 0 ? `Maksimal ${max} komentar` : (min > 0 ? `Minimal ${min} komentar` : "Bebas (Semua)"));

    await ctx.replyWithMarkdown(`✅ *Filter jumlah komentar berhasil diatur ke:* *${desc}*`);
  });

  bot.action("TOGGLE_HEADLESS", async (ctx) => {
    await ctx.answerCbQuery();
    let config = loadTelegramConfig();
    if (!config.defaultSettings) config.defaultSettings = {};
    const newHeadless = config.defaultSettings.headless === false;
    config.defaultSettings.headless = newHeadless;
    saveTelegramConfig(config);

    const modeText = newHeadless ? "🕶️ Latar Belakang (Headless / Tanpa Jendela)" : "🖥️ Buka Jendela Browser (Terlihat / Non-Headless)";
    await ctx.replyWithMarkdown(`✅ *Mode tampilan browser berhasil diubah ke:*\n*${modeText}*`);
  });

  // Fitur Preview Spintax Komentar
  bot.hears("🧪 Preview Spintax", async (ctx) => {
    const config = loadTelegramConfig();
    const template = config.defaultSettings?.customComment || "{Halo|Hai|Permisi} kak, {keren banget videonya|menarik sekali}! {Salam kenal ya|Salam sukses}.";
    const variations = generateVariations(template, 5);

    let text = `🧪 *Preview 5 Variasi Spintax Komentar:*\n\n`;
    variations.forEach((v, i) => {
      text += `${i + 1}. \`${v}\`\n\n`;
    });
    text += `_Template aktif:_\n\`${template}\``;

    await ctx.replyWithMarkdown(text);
  });

  bot.command("spintax", async (ctx) => {
    const config = loadTelegramConfig();
    const template = config.defaultSettings?.customComment || "{Halo|Hai|Permisi} kak, {keren banget videonya|menarik sekali}! {Salam kenal ya|Salam sukses}.";
    const variations = generateVariations(template, 5);

    let text = `🧪 *Preview 5 Variasi Spintax Komentar:*\n\n`;
    variations.forEach((v, i) => {
      text += `${i + 1}. \`${v}\`\n\n`;
    });
    text += `_Template aktif:_\n\`${template}\``;

    await ctx.replyWithMarkdown(text);
  });

  // Fitur Reset Riwayat Komentar (Hapus Riwayat Konten yang Pernah Dikomentari)
  bot.command("resethistory", async (ctx) => {
    if (campaignState.isRunning) return ctx.reply("⚠️ Bot sedang berjalan.");
    await clearCommentHistory();
    await ctx.replyWithMarkdown("🧹 *Riwayat komentar berhasil direset!*\n\nSemua akun sekarang dapat mengomentari kembali video Reels atau postingan yang sebelumnya pernah dikomentari.");
  });

  bot.action(/DELAY_(\d+)/, async (ctx) => {
    if (campaignState.isRunning) {
      await ctx.answerCbQuery("Bot sedang berjalan!");
      return ctx.reply(
        "⚠️ Pengaturan jeda dikunci saat kampanye aktif.",
        getRunningKeyboard()
      );
    }

    const sec = parseInt(ctx.match[1], 10);
    await ctx.answerCbQuery();
    let config = loadTelegramConfig();
    if (!config.defaultSettings) config.defaultSettings = {};
    config.defaultSettings.defaultDelaySeconds = sec;
    saveTelegramConfig(config);

    await ctx.replyWithMarkdown(
      `✅ *Jeda waktu antar komentar berhasil diatur ke ${sec} detik!*`
    );
  });

  bot.action("DELAY_MANUAL", async (ctx) => {
    if (campaignState.isRunning) {
      await ctx.answerCbQuery("Bot sedang berjalan!");
      return ctx.reply(
        "⚠️ Pengaturan dikunci saat kampanye aktif.",
        getRunningKeyboard()
      );
    }

    await ctx.answerCbQuery();
    userStates.set(ctx.from.id, "AWAITING_DELAY_INPUT");
    await ctx.reply(
      "Silakan ketik angka durasi jeda yang Anda inginkan dalam detik (misal: 25):"
    );
  });

  bot.command("setdelay", async (ctx) => {
    if (campaignState.isRunning) {
      return ctx.reply(
        "⚠️ Pengaturan jeda dikunci saat kampanye aktif.",
        getRunningKeyboard()
      );
    }

    const parts = ctx.message.text.split(" ");
    const sec = parseInt(parts[1], 10);
    if (isNaN(sec) || sec < 2) {
      return ctx.reply(
        "Format: /setdelay <jumlah detik (minimal 3)>\nContoh: /setdelay 20"
      );
    }
    let config = loadTelegramConfig();
    if (!config.defaultSettings) config.defaultSettings = {};
    config.defaultSettings.defaultDelaySeconds = sec;
    saveTelegramConfig(config);

    await ctx.replyWithMarkdown(
      `✅ *Jeda waktu antar komentar berhasil diatur ke ${sec} detik!*`
    );
  });

  // Fitur Mengatur Identitas Komentar (Profil Pribadi vs Halaman Fanspage)
  bot.hears("🎭 Identitas (Akun / Halaman)", async (ctx) => {
    if (campaignState.isRunning) {
      return ctx.reply(
        "⚠️ Bot sedang berjalan! Pengaturan identitas dikunci selama kampanye aktif. Tekan '🛑 Stop Kampanye' terlebih dahulu.",
        getRunningKeyboard()
      );
    }

    userStates.delete(ctx.from.id);
    const config = loadTelegramConfig();
    const currentIdentity = config.defaultSettings?.commentAs || "PERSONAL";
    const targetPage = config.defaultSettings?.targetPageName || "";

    const activeText =
      currentIdentity === "PAGE"
        ? `🚩 *Halaman Facebook (Fanspage)*${targetPage ? `\n• Target Halaman: \`${targetPage}\`` : " (Otomatis Halaman Pertama)"}`
        : "👤 *Profil Pribadi (Akun Utama)*";

    await ctx.replyWithMarkdown(
      `🎭 *Pengaturan Identitas Komentar*\n\n` +
        `Pilih identitas yang akan digunakan bot saat mengirim komentar di Reels & Beranda:\n\n` +
        `*Identitas Aktif Saat Ini:*\n${activeText}\n\n` +
        `_Pilih salah satu di bawah ini:_`,
      Markup.inlineKeyboard([
        [
          Markup.button.callback("👤 Profil Pribadi", "SET_IDENTITY_PERSONAL"),
          Markup.button.callback("🚩 Halaman (Fanspage)", "SET_IDENTITY_PAGE")
        ],
        [
          Markup.button.callback("🏷️ Atur Nama Halaman Spesifik", "SET_TARGET_PAGE")
        ]
      ])
    );
  });

  bot.action("SET_TARGET_PAGE", async (ctx) => {
    await ctx.answerCbQuery();
    if (campaignState.isRunning) {
      return ctx.reply("⚠️ Pengaturan dikunci saat kampanye aktif.", getRunningKeyboard());
    }
    userStates.set(ctx.from.id, "AWAITING_TARGET_PAGE_NAME");
    await ctx.reply(
      "Silakan ketik nama Halaman Facebook (Fanspage) spesifik yang ingin digunakan untuk berkomentar.\n\n" +
      "• Contoh: `Toko Online Sukses`\n" +
      "• Ketik `-` atau `0` jika ingin bebas (halaman pertama yang ditemukan)."
    );
  });

  bot.action("SET_IDENTITY_PERSONAL", async (ctx) => {
    if (campaignState.isRunning) {
      await ctx.answerCbQuery("Bot sedang berjalan!");
      return ctx.reply("⚠️ Pengaturan dikunci saat kampanye aktif.", getRunningKeyboard());
    }

    await ctx.answerCbQuery();
    let config = loadTelegramConfig();
    if (!config.defaultSettings) config.defaultSettings = {};
    config.defaultSettings.commentAs = "PERSONAL";
    saveTelegramConfig(config);

    await ctx.replyWithMarkdown(
      `✅ *Identitas komentar berhasil diatur ke:*\n` +
        `👤 *Profil Pribadi (Akun Utama)*\n\n` +
        `Semua komentar akan dikirim menggunakan nama & profil pribadi akun Anda.`
    );
  });

  bot.action("SET_IDENTITY_PAGE", async (ctx) => {
    if (campaignState.isRunning) {
      await ctx.answerCbQuery("Bot sedang berjalan!");
      return ctx.reply("⚠️ Pengaturan dikunci saat kampanye aktif.", getRunningKeyboard());
    }

    await ctx.answerCbQuery();
    let config = loadTelegramConfig();
    if (!config.defaultSettings) config.defaultSettings = {};
    config.defaultSettings.commentAs = "PAGE";
    saveTelegramConfig(config);

    const pageNote = config.defaultSettings?.targetPageName 
      ? `\n• Halaman target: \`${config.defaultSettings.targetPageName}\`` 
      : `\n• Halaman target: Otomatis halaman pertama`;

    await ctx.replyWithMarkdown(
      `✅ *Identitas komentar berhasil diatur ke:*\n` +
        `🚩 *Halaman Facebook (Fanspage)*${pageNote}\n\n` +
        `Bot akan otomatis beralih (*switch profile*) ke Halaman Facebook yang dikelola oleh akun sebelum berkomentar di Reels atau Beranda.`
    );
  });

  bot.command("setidentity", async (ctx) => {
    if (campaignState.isRunning) {
      return ctx.reply("⚠️ Pengaturan dikunci saat kampanye aktif.", getRunningKeyboard());
    }

    const parts = ctx.message.text.split(" ");
    const choice = parts[1]?.toLowerCase().trim();
    const specificPage = parts.slice(2).join(" ").trim();

    if (choice === "page" || choice === "halaman") {
      let config = loadTelegramConfig();
      if (!config.defaultSettings) config.defaultSettings = {};
      config.defaultSettings.commentAs = "PAGE";
      if (specificPage) {
        config.defaultSettings.targetPageName = specificPage;
      }
      saveTelegramConfig(config);
      const note = specificPage ? ` (Target: \`${specificPage}\`)` : "";
      return ctx.replyWithMarkdown(`✅ *Identitas berhasil diatur ke:* 🚩 *Halaman Facebook (Fanspage)*${note}`);
    } else if (choice === "personal" || choice === "profil" || choice === "akun") {
      let config = loadTelegramConfig();
      if (!config.defaultSettings) config.defaultSettings = {};
      config.defaultSettings.commentAs = "PERSONAL";
      saveTelegramConfig(config);
      return ctx.replyWithMarkdown(`✅ *Identitas berhasil diatur ke:* 👤 *Profil Pribadi*`);
    } else {
      return ctx.reply("Format: /setidentity <personal|page> [nama_halaman]\nContoh: /setidentity page\nContoh: /setidentity page Toko Baju Murah");
    }
  });

  bot.command(["setpage", "page"], async (ctx) => {
    if (campaignState.isRunning) {
      return ctx.reply("⚠️ Pengaturan dikunci saat kampanye aktif.", getRunningKeyboard());
    }

    const pageName = ctx.message.text.replace(/\/setpage|\/page/i, "").trim();
    let config = loadTelegramConfig();
    if (!config.defaultSettings) config.defaultSettings = {};

    if (!pageName || pageName === "-" || pageName === "0" || pageName.toLowerCase() === "bebas") {
      config.defaultSettings.targetPageName = "";
      saveTelegramConfig(config);
      return ctx.replyWithMarkdown("✅ *Target nama Halaman Facebook direset ke bebas (halaman pertama akun).*");
    } else {
      config.defaultSettings.commentAs = "PAGE";
      config.defaultSettings.targetPageName = pageName;
      saveTelegramConfig(config);
      return ctx.replyWithMarkdown(
        `✅ *Target Halaman Facebook spesifik berhasil diatur ke:*\n🚩 \`${pageName}\`\n\n_(Identitas otomatis diaktifkan sebagai Halaman/Fanspage)_`
      );
    }
  });

  bot.command("status", async (ctx) => {
    if (!campaignState.isRunning) {
      return ctx.reply("⚪ Tidak ada kampanye yang sedang berjalan saat ini (Bot Standby).", getMainKeyboard());
    }

    const targetText =
      campaignState.info.target === 0
        ? "Non-Stop Loop"
        : `${campaignState.info.target} target`;
    await ctx.replyWithMarkdown(
      `📊 *Status Kampanye Berjalan:*\n` +
        `- Mode: *${campaignState.info.mode}*\n` +
        `- Akun Aktif: *${campaignState.info.currentAccount}*\n` +
        `- Progres: *${campaignState.info.completed} terkirim* (Target: ${targetText})\n` +
        `- Status: 🟢 *Sedang Bekerja*\n\n` +
        `_Ketik /stop atau klik tombol Stop di bawah untuk menghentikan._`,
      getRunningKeyboard()
    );
  });
}
