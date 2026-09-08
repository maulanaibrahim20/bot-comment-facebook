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
 * Memendekkan URL panjang agar aman ditampilkan di chat dan tidak melebihi batas karakter
 */
export function formatDisplayUrl(url, maxLength = 80) {
  if (!url) return "https://www.facebook.com/";
  if (url.length <= maxLength) return url;
  try {
    const parsed = new URL(url);
    const domainAndPath = `${parsed.origin}${parsed.pathname}`;
    if (domainAndPath.length > maxLength) {
      return domainAndPath.slice(0, maxLength - 3) + "...";
    }
    const querySample = parsed.search ? `?${parsed.search.slice(1, 25)}...` : "...";
    return `${domainAndPath}${querySample}`;
  } catch (e) {
    return url.slice(0, maxLength - 3) + "...";
  }
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
    throw err;
  }
}

/**
 * Helper pengiriman foto Telegram dengan proteksi limit caption (max 1024 karakter) dan Markdown error
 */
export async function safeReplyWithPhoto(ctx, photo, extra = {}) {
  let safeExtra = { ...extra };

  // Batasi caption agar tidak melebihi batas 1024 karakter foto Telegram
  if (safeExtra.caption && safeExtra.caption.length > 950) {
    safeExtra.caption = safeExtra.caption.slice(0, 900) + "\n\n_...[Keterangan dipotong karena batas caption Telegram]_";
  }

  try {
    return await ctx.replyWithPhoto(photo, safeExtra);
  } catch (err) {
    logger.warn(`[safeReplyWithPhoto] Gagal kirim foto: ${err.message}. Mencoba fallback caption aman.`);
    try {
      // Fallback 1: Kirim foto dengan caption ringkas tanpa markdown
      const cleanCaption = (safeExtra.caption || "")
        .replace(/[*_`\[\]]/g, "")
        .slice(0, 450);
      return await ctx.replyWithPhoto(photo, {
        caption: cleanCaption,
        reply_markup: safeExtra.reply_markup
      });
    } catch (err2) {
      // Fallback 2: Jika masih gagal, kirim foto tanpa caption
      logger.warn(`[safeReplyWithPhoto] Fallback caption gagal: ${err2.message}. Kirim foto tanpa caption.`);
      return await ctx.replyWithPhoto(photo, { reply_markup: safeExtra.reply_markup });
    }
  }
}
