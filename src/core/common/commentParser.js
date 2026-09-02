/**
 * Modul Parser Komentar Facebook
 * Mengurai berbagai format penulisan angka komentar (ID & EN) menjadi angka bulat murni
 */
export class CommentParser {
  /**
   * Mengurai teks jumlah komentar (misal: "56", "120 komentar", "1,5 rb", "2.3K") menjadi angka integer murni
   */
  static parseCommentCountString(str) {
    if (!str) return null;
    const clean = str.toLowerCase().replace(/\s+/g, ' ').trim();
    const match = clean.match(/^([\d]+(?:[.,]\d+)?)\s*(rb|ribu|jt|juta|k\b|m\b|b\b)?/i) ||
                  clean.match(/([\d]+(?:[.,]\d+)?)\s*(rb|ribu|jt|juta|k\b|m\b|b\b)?(?:\s*(?:komentar|comments))?/i);
    if (!match) return null;
    let num = parseFloat(match[1].replace(',', '.'));
    const unit = match[2]?.toLowerCase();
    if (unit === 'rb' || unit === 'ribu' || unit === 'k') num *= 1000;
    else if (unit === 'jt' || unit === 'juta' || unit === 'm') num *= 1000000;
    else if (unit === 'b') num *= 1000000000;
    return Math.round(num);
  }
}
