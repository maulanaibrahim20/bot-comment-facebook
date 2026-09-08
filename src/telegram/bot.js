import { Telegraf } from "telegraf";
import { getBotToken, validateBotToken } from "./config.js";
import { authMiddleware } from "./middleware/auth.js";
import { registerHandlers } from "./handlers/index.js";
import { logger } from "../utils/logger.js";

const BOT_TOKEN = getBotToken();
validateBotToken(BOT_TOKEN);

export const bot = new Telegraf(BOT_TOKEN || "dummy_token", {
  handlerTimeout: 9_000_000
});

// Tangani error update Telegram agar proses bot tidak crash
bot.catch((err, ctx) => {
  const detail = err.response?.description || err.message;
  logger.warn(`[Telegram Error] Terjadi error pada update ${ctx?.updateType || 'unknown'}: ${detail}`);
});

// Middleware Keamanan: Pastikan hanya pemilik bot yang bisa mengakses
bot.use(authMiddleware);

// Registrasi semua handler (commands, hear, actions, text)
registerHandlers(bot);

export async function launchBot() {
  if (
    BOT_TOKEN &&
    !BOT_TOKEN.includes("MASUKKAN_BOT_TOKEN") &&
    BOT_TOKEN.trim() !== ""
  ) {
    try {
      logger.info("🚀 Menghubungkan Telegram Bot Controller ke server Telegram...");
      const botInfo = await bot.telegram.getMe();
      logger.success(
        `✅ Telegram Bot @${botInfo.username} (${botInfo.first_name}) AKTIF!`
      );
      console.log(
        `\n👉 Silakan buka aplikasi Telegram di HP Anda:\n   Cari: @${botInfo.username}\n   Ketik: /start\n`
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

// Jalankan Bot Telegram jika dijalankan langsung atau dipanggil dari CLI
if (
  process.argv[1]?.includes("bot.js") ||
  process.argv[1]?.includes("cli.js") ||
  process.argv[1]?.includes("index.js")
) {
  await launchBot();
}
