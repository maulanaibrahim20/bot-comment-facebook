import { logger } from "../../utils/logger.js";

/**
 * Escape karakter khusus Telegram Markdown (v1)
 * Karakter: _, *, [, ], `, (, )
 */
export function escapeMarkdown(text) {
  if (!text) return "";
  return String(text).replace(/[_*[\]`]/g, "\\$&");
}

/**
 * Helper pengiriman pesan Telegram dengan proteksi Markdown error (400 Bad Request)
 * Jika parsing Markdown gagal, otomatis fallback ke plain text agar bot tidak error.
 */
export async function safeReplyWithMarkdown(ctx, text, extra = {}) {
  try {
    return await ctx.replyWithMarkdown(text, extra);
  } catch (err) {
    if (err.message && err.message.includes("can't parse entities")) {
      logger.warn(`[safeReply] Markdown parsing gagal: ${err.message}. Mengirim fallback plain text.`);
      const plainText = text.replace(/[*_`\[\]]/g, "");
      return await ctx.reply(plainText, extra);
    }
    // Jika error lain (misal chat not found), lempar error asli
    throw err;
  }
}
