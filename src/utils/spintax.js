/**
 * Spintax Generator Utility
 * Mendukung Spintax sederhana maupun bertingkat (nested), misal:
 * "{Halo {kak|gan}|Hai {bro|sis}}, {keren|mantap}!"
 */

export function parseSpintax(template) {
  if (!template || typeof template !== 'string') {
    return '';
  }

  let result = template;
  const spintaxRegex = /\{([^{}]+)\}/g;
  let hasMatch = true;
  let safetyCounter = 0;

  // Lakukan iterasi dari dalam ke luar untuk mendukung nested spintax
  while (hasMatch && safetyCounter < 50) {
    safetyCounter++;
    hasMatch = false;

    result = result.replace(spintaxRegex, (match, p1) => {
      hasMatch = true;
      const options = p1.split('|');
      const chosen = options[Math.floor(Math.random() * options.length)];
      return chosen !== undefined ? chosen : '';
    });
  }

  return result.replace(/\s+/g, ' ').trim();
}

/**
 * Menghasilkan beberapa variasi contoh dari template spintax untuk preview
 */
export function generateVariations(template, count = 5) {
  if (!template) return [];
  const variations = new Set();
  let attempts = 0;
  const maxAttempts = count * 20;

  while (variations.size < count && attempts < maxAttempts) {
    variations.add(parseSpintax(template));
    attempts++;
  }

  return Array.from(variations);
}
