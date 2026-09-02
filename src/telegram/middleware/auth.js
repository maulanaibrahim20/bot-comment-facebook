import { loadTelegramConfig, saveTelegramConfig } from "../config.js";

// Middleware Keamanan: Pastikan hanya pemilik bot yang bisa mengakses
export async function authMiddleware(ctx, next) {
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
}
