/**
 * Human Simulation, Natural Delays, and Anti-Bot Mouse/Typing Emulation
 */

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Menunggu dalam rentang waktu acak (milidetik)
 */
export async function randomDelay(minMs = 1000, maxMs = 3000) {
  const delay = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
  await sleep(delay);
  return delay;
}

/**
 * Simulasi gerakan kursor mouse alami dengan kurva dan langkah halus
 */
export async function humanMouseMove(page, targetLocator) {
  if (!page || !targetLocator || typeof targetLocator.boundingBox !== 'function') return;
  try {
    const box = await targetLocator.boundingBox();
    if (!box) return;

    // Koordinat acak di dalam kotak elemen
    const targetX = box.x + (box.width * (0.3 + Math.random() * 0.4));
    const targetY = box.y + (box.height * (0.3 + Math.random() * 0.4));

    const steps = Math.floor(Math.random() * 8) + 6;
    await page.mouse.move(targetX, targetY, { steps });
    await sleep(Math.floor(Math.random() * 120) + 60);
  } catch (e) {}
}

/**
 * Simulasi pengetikan karakter demi karakter yang ramah untuk Lexical Editor Facebook
 * Mendukung pemanggilan polymorphic (2 atau 3 argumen)
 */
export async function typeHumanLike(pageOrLocator, locatorOrText, maybeText, minDelay = 40, maxDelay = 120) {
  let page, locator, text;

  if (typeof locatorOrText === 'string') {
    // typeHumanLike(locator, text, minDelay, maxDelay)
    locator = pageOrLocator;
    text = locatorOrText;
    page = (locator && typeof locator.page === 'function') ? locator.page() : null;
    if (typeof maybeText === 'number') minDelay = maybeText;
  } else {
    // typeHumanLike(page, locator, text, minDelay, maxDelay)
    page = pageOrLocator;
    locator = locatorOrText;
    text = maybeText;
  }

  if (!text || typeof text !== 'string') return;

  try {
    // 1. Arahkan mouse dan fokus ke elemen
    if (page && locator) {
      await humanMouseMove(page, locator);
    }
    if (locator && typeof locator.click === 'function') {
      await locator.click({ force: true }).catch(() => {});
    }
    await sleep(Math.floor(Math.random() * 200) + 150);

    // 2. Ketik teks menggunakan page.keyboard atau insertText untuk URL panjang
    if (page && page.keyboard) {
      // Jika teks adalah URL sangat panjang, gunakan pengetikan cepat atau insertText
      if (text.startsWith('http') && text.length > 35) {
        await page.keyboard.insertText(text);
        await sleep(Math.floor(Math.random() * 300) + 200);
      } else {
        for (let i = 0; i < text.length; i++) {
          const char = text[i];
          await page.keyboard.type(char, { delay: Math.floor(Math.random() * (maxDelay - minDelay + 1)) + minDelay });
          // Simulasi jeda berpikir manusia (5% probabilitas)
          if (Math.random() < 0.05) {
            await sleep(Math.floor(Math.random() * 250) + 80);
          }
        }
      }

      // 3. Pastikan teks terisi di input/contenteditable
      if (locator && typeof locator.inputValue === 'function') {
        const val = await locator.inputValue().catch(() => '');
        if (!val || val.length === 0) {
          await locator.fill(text).catch(() => {});
        }
      } else if (locator && typeof locator.innerText === 'function') {
        const inner = await locator.innerText().catch(() => '');
        if (!inner || inner.trim().length === 0) {
          await page.keyboard.insertText(text).catch(() => {});
        }
      }
    } else if (locator && typeof locator.pressSequentially === 'function') {
      await locator.pressSequentially(text, { delay: minDelay }).catch(() => {});
    }
  } catch (err) {
    if (locator && typeof locator.fill === 'function') {
      await locator.fill(text).catch(() => {});
    } else if (page && page.keyboard) {
      await page.keyboard.insertText(text).catch(() => {});
    }
  }
}

/**
 * Simulasi scroll beranda manusia alami
 */
export async function humanScroll(page, times = 2) {
  if (!page || !page.mouse) return;
  for (let i = 0; i < times; i++) {
    const scrollAmount = Math.floor(Math.random() * 350) + 250;
    const steps = 5;
    for (let s = 0; s < steps; s++) {
      await page.mouse.wheel(0, Math.floor(scrollAmount / steps));
      await sleep(40);
    }

    await randomDelay(1200, 2500);

    // 20% kemungkinan scroll sedikit ke atas (seperti membaca sekilas)
    if (Math.random() < 0.2) {
      await page.mouse.wheel(0, -Math.floor(scrollAmount * 0.25));
      await randomDelay(600, 1200);
    }
  }
}
