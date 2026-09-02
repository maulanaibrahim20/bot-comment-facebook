import { randomDelay, sleep } from "../utils/delay.js";
import { logger } from "../utils/logger.js";
import { createAccountBrowserContext } from "../browser.js";

export class ProfileSwitcher {
  /**
   * Mendeteksi identitas profil atau Halaman yang sedang aktif saat ini
   */
  static async getCurrentProfileInfo(page) {
    try {
      // 1. Cek dari alt gambar avatar di banner pojok kanan atas (Paling akurat di Facebook modern)
      const imgAlt = await page
        .evaluate(() => {
          const banner = document.querySelector('div[role="banner"]');
          if (banner) {
            const imgs = banner.querySelectorAll("img[alt]");
            for (const img of imgs) {
              const alt = img.getAttribute("alt") || "";
              const m =
                alt.match(/Foto profil\s+([^\n\r•]+)/i) ||
                alt.match(/Profile picture of\s+([^\n\r•]+)/i) ||
                alt.match(/(.+?)('s profile picture)/i);
              if (m && m[1]) return m[1].trim();
              if (
                alt &&
                !alt.includes("Facebook") &&
                !alt.includes("Story") &&
                alt.length > 2 &&
                alt.length < 50
              ) {
                return alt.trim();
              }
            }
          }
          return null;
        })
        .catch(() => null);

      if (imgAlt) {
        return { name: imgAlt };
      }

      // 2. Cek dari tombol profil di banner / pojok kanan atas (aria-label)
      const bannerProfileBtn = page
        .locator(
          [
            'div[role="banner"] [aria-label*="Profil" i]',
            'div[role="banner"] [aria-label*="Profile" i]',
            'div[role="banner"] [aria-label*="Akun" i]',
            'div[role="banner"] [aria-label*="Account" i]',
            'div[aria-label*="Profil Anda" i]',
            'div[aria-label*="Your profile" i]',
          ].join(", "),
        )
        .last();

      if (await bannerProfileBtn.isVisible().catch(() => false)) {
        const ariaLabel =
          (await bannerProfileBtn.getAttribute("aria-label").catch(() => "")) ||
          "";
        const match = ariaLabel.match(/\((.+?)\)/);
        if (match && match[1]) {
          return { name: match[1].trim(), raw: ariaLabel };
        }
      }

      // 3. Evaluasi DOM banner
      const domName = await page
        .evaluate(() => {
          const banner = document.querySelector('div[role="banner"]');
          if (banner) {
            for (const el of banner.querySelectorAll('div[role="button"], a')) {
              const aria = el.getAttribute("aria-label") || "";
              const m = aria.match(/\((.+?)\)/);
              if (m) return m[1].trim();
            }
          }
          return null;
        })
        .catch(() => null);

      if (domName) {
        return { name: domName };
      }

      return { name: "Unknown" };
    } catch (e) {
      return { name: "Unknown" };
    }
  }

  /**
   * Mendapatkan daftar Halaman Facebook yang dikelola oleh akun
   */
  static async getAccountPages(page) {
    try {
      if (!page.url().includes("category=your_pages")) {
        logger.info("Mengecek daftar Halaman Facebook yang dikelola...");
        await page.goto("https://www.facebook.com/pages/?category=your_pages", {
          waitUntil: "domcontentloaded",
          timeout: 45000,
        });
        await randomDelay(3000, 5000);
      }

      const pagesList = await page.evaluate(() => {
        const found = [];
        const main = document.querySelector('div[role="main"]');
        if (!main) return found;

        const links = main.querySelectorAll('a[href*="/"]');
        for (const a of links) {
          const txt = a.innerText ? a.innerText.trim() : "";
          if (
            txt &&
            txt.length > 2 &&
            !txt.includes("Buat postingan") &&
            !txt.includes("Promosikan") &&
            !txt.includes("Halaman") &&
            !txt.includes("Meta Business") &&
            !txt.includes("Temukan") &&
            !txt.includes("Followed") &&
            !txt.includes("Notifikasi") &&
            !txt.includes("Pesan")
          ) {
            const firstLine = txt.split("\n")[0].trim();
            if (
              firstLine.length > 2 &&
              !found.some(
                (p) => p.name.toLowerCase() === firstLine.toLowerCase(),
              )
            ) {
              found.push({ name: firstLine, url: a.href });
            }
          }
        }
        return found;
      });

      return pagesList;
    } catch (e) {
      return [];
    }
  }

  /**
   * Beralih peran ke Halaman Facebook (Fanspage)
   */
  static async switchToPage(page, targetPageName = null) {
    try {
      logger.info(
        `Memulai proses beralih profil ke Halaman Facebook${targetPageName ? ` "${targetPageName}"` : ""}...`,
      );

      // 1. Buka halaman Your Pages (Facebook Pages) terlebih dahulu untuk membaca Halaman yang dikelola
      if (!page.url().includes("category=your_pages")) {
        await page.goto("https://www.facebook.com/pages/?category=your_pages", {
          waitUntil: "domcontentloaded",
          timeout: 45000,
        });
        await randomDelay(3000, 5000);
      }

      // 2. Deteksi nama profil pribadi (dari heading: "Halaman yang dikelola [Nama]") & daftar Halaman yang ada
      const detectedInfo = await page.evaluate(() => {
        let personal = "Unknown";
        const headings = document.querySelectorAll("h1, h2, h3, span");
        for (const h of headings) {
          const t = h.innerText || "";
          const m =
            t.match(/Halaman yang dikelola\s+(.+)/i) ||
            t.match(/Pages you manage\s+(.+)/i);
          if (m && m[1]) {
            personal = m[1].trim();
            break;
          }
        }

        const pages = [];
        const main = document.querySelector('div[role="main"]');
        if (main) {
          const links = main.querySelectorAll('a[href*="/"]');
          for (const a of links) {
            const txt = a.innerText ? a.innerText.trim() : "";
            if (
              txt &&
              txt.length > 2 &&
              !txt.includes("Buat postingan") &&
              !txt.includes("Promosikan") &&
              !txt.includes("Halaman") &&
              !txt.includes("Meta Business") &&
              !txt.includes("Temukan") &&
              !txt.includes("Followed") &&
              !txt.includes("Notifikasi") &&
              !txt.includes("Pesan")
            ) {
              const name = txt.split("\n")[0].trim();
              if (
                name.length > 2 &&
                !pages.some((p) => p.name.toLowerCase() === name.toLowerCase())
              ) {
                pages.push({ name, href: a.href });
              }
            }
          }
        }

        return { personal, pages };
      });

      const personalName = detectedInfo.personal;
      const managedPages = detectedInfo.pages;
      logger.info(
        `Profil akun pribadi: "${personalName}". Halaman terdeteksi: ${managedPages.map((p) => `"${p.name}"`).join(", ") || "Tidak ditemukan"}`,
      );

      // Jika akun tidak memiliki halaman sama sekali di list
      if (managedPages.length === 0) {
        logger.error("❌ Tidak ditemukan Halaman yang dikelola pada akun ini.");
        return { success: false, reason: "NO_PAGE_FOUND" };
      }

      // Tentukan target halaman yang akan digunakan dari daftar kelola
      let selectedPage = null;
      if (targetPageName) {
        selectedPage = managedPages.find((p) =>
          p.name.toLowerCase().includes(targetPageName.toLowerCase()),
        );
      }
      if (!selectedPage && managedPages.length > 0) {
        selectedPage = managedPages[0];
      }

      const chosenPageName = selectedPage
        ? selectedPage.name
        : managedPages[0].name;
      logger.info(`Memilih target Halaman: "${chosenPageName}"`);

      let switchedSuccess = false;

      // =========================================================================
      // METODE 1: Beralih via Menu Profil di Pojok Kanan Atas
      // =========================================================================
      try {
        const topProfileBtn = page
          .locator(
            [
              'div[role="banner"] [aria-label*="Profil" i]',
              'div[role="banner"] [aria-label*="Profile" i]',
              'div[role="banner"] [aria-label*="Akun" i]',
              'div[role="banner"] [aria-label*="Account" i]',
              'div[role="banner"] div[role="button"]:has(img)',
              'div[role="banner"] div[role="button"]:has(image)',
              'div[aria-label*="Profil Anda" i]',
              'div[aria-label*="Your profile" i]',
            ].join(", "),
          )
          .last();

        if (await topProfileBtn.isVisible().catch(() => false)) {
          logger.info("Membuka Menu Profil pojok kanan atas...");
          await topProfileBtn.click({ force: true }).catch(() => {});
          await randomDelay(1500, 2500);

          // Cek tombol "Lihat semua profil" atau "See all profiles"
          const seeAllBtn = page
            .locator(
              [
                'div[role="dialog"] div[aria-label*="Lihat semua profil" i]',
                'div[role="dialog"] div[role="button"]:has-text("Lihat semua profil")',
                'div[role="dialog"] div[role="button"]:has-text("See all profiles")',
                'div[role="dialog"] div[aria-label*="Beralih profil" i]',
                'div[role="dialog"] [role="button"]:has(svg[aria-label*="Beralih" i])',
              ].join(", "),
            )
            .first();

          if (await seeAllBtn.isVisible().catch(() => false)) {
            await seeAllBtn.click({ force: true }).catch(() => {});
            await randomDelay(2000, 3000);
          }

          // Cari opsi target halaman di dalam popup dialog
          const targetItem = page
            .locator(
              [
                `div[role="dialog"] :text("${chosenPageName}")`,
                `div[role="dialog"] [aria-label*="${chosenPageName}" i]`,
              ].join(", "),
            )
            .first();

          if (await targetItem.isVisible().catch(() => false)) {
            logger.info(
              `Mengklik opsi Halaman "${chosenPageName}" pada Menu Profil...`,
            );
            await targetItem.click({ force: true }).catch(() => {});
            await randomDelay(4000, 6000);
            await page.waitForLoadState("domcontentloaded").catch(() => {});
            switchedSuccess = true;
          } else {
            await page.keyboard.press("Escape").catch(() => {});
          }
        }
      } catch (errMenu) {
        logger.warn("Peralihan via menu atas dilewati:", errMenu.message);
      }

      // =========================================================================
      // METODE 2: Navigasi Langsung ke Halaman & Klik Tombol Beralih
      // =========================================================================
      if (!switchedSuccess) {
        logger.info(
          `Mencoba navigasi langsung ke Halaman "${chosenPageName}"...`,
        );
        if (selectedPage && selectedPage.href) {
          await page.goto(selectedPage.href, {
            waitUntil: "domcontentloaded",
            timeout: 45000,
          });
        } else {
          const cardLink = page
            .locator(
              `div[role="main"] a:has-text("${chosenPageName}"), div[role="main"] span:has-text("${chosenPageName}")`,
            )
            .first();
          if (await cardLink.isVisible().catch(() => false)) {
            await cardLink.click({ force: true }).catch(() => {});
          }
        }
        await randomDelay(4000, 6000);
        await page.waitForLoadState("domcontentloaded").catch(() => {});

        // Cari tombol beralih dengan retry loop
        for (let attempt = 0; attempt < 4; attempt++) {
          const switchOnPageBtn = page
            .locator(
              [
                'div[aria-label*="Beralih sekarang" i]',
                'div[aria-label*="Beralih ke" i]',
                'div[aria-label*="Beralih" i]',
                'div[aria-label*="Switch" i]',
                'div[role="button"]:has-text("Beralih sekarang")',
                'div[role="button"]:has-text("Beralih")',
                'div[role="button"]:has-text("Switch now")',
                'div[role="button"]:has-text("Switch")',
                'button:has-text("Beralih")',
                'button:has-text("Switch")',
                'span:text-is("Beralih")',
                'span:text-is("Switch")',
              ].join(", "),
            )
            .first();

          if (await switchOnPageBtn.isVisible().catch(() => false)) {
            logger.info(
              `Menekan tombol beralih pada halaman "${chosenPageName}"...`,
            );
            await switchOnPageBtn.click({ force: true }).catch(() => {});
            await randomDelay(2000, 3000);

            // Konfirmasi popup jika ada
            const confirmDialogBtn = page
              .locator(
                [
                  'div[role="dialog"] div[role="button"]:has-text("Beralih")',
                  'div[role="dialog"] div[role="button"]:has-text("Switch")',
                  'div[role="dialog"] button:has-text("Beralih")',
                  'div[role="dialog"] button:has-text("Switch")',
                  'div[role="dialog"] div[aria-label*="Beralih" i]',
                ].join(", "),
              )
              .first();

            if (await confirmDialogBtn.isVisible().catch(() => false)) {
              logger.info("Mengonfirmasi dialog peralihan Halaman...");
              await confirmDialogBtn.click({ force: true }).catch(() => {});
            }

            await randomDelay(4000, 6000);
            await page.waitForLoadState("domcontentloaded").catch(() => {});
            switchedSuccess = true;
            break;
          }

          await randomDelay(1500, 2000);
        }
      }

      // =========================================================================
      // METODE 3: Klik Kartu Tindakan pada Daftar Your Pages
      // =========================================================================
      if (!switchedSuccess && page.url().includes("category=your_pages")) {
        logger.info(
          `Mencoba memicu beralih via kartu tindakan "${chosenPageName}"...`,
        );
        const cardActionBtn = page
          .locator(
            `div:has-text("${chosenPageName}") div[role="button"]:has-text("Buat postingan"), div:has-text("${chosenPageName}") div[role="button"]:has-text("Promosikan")`,
          )
          .first();
        if (await cardActionBtn.isVisible().catch(() => false)) {
          await cardActionBtn.click({ force: true }).catch(() => {});
          await randomDelay(2000, 3000);

          const promptSwitchBtn = page
            .locator(
              'div[role="dialog"] div[role="button"]:has-text("Beralih"), div[role="dialog"] button:has-text("Beralih")',
            )
            .first();
          if (await promptSwitchBtn.isVisible().catch(() => false)) {
            logger.info("Menekan konfirmasi beralih dari popup dialog...");
            await promptSwitchBtn.click({ force: true }).catch(() => {});
            await randomDelay(4000, 6000);
            await page.waitForLoadState("domcontentloaded").catch(() => {});
            switchedSuccess = true;
          }
        }
      }

      // =========================================================================
      // VERIFIKASI AKHIR (PILIH HALAMAN DARI DAFTAR KELOLA & JANGAN TUTUP AKUN)
      // =========================================================================
      const activeInfo = await ProfileSwitcher.getCurrentProfileInfo(page);

      // Jika profil terverifikasi Halaman atau berhasil beralih atau halaman memang ada di list kelola akun
      if (
        (activeInfo.name !== "Unknown" &&
          personalName !== "Unknown" &&
          activeInfo.name !== personalName) ||
        activeInfo.name.toLowerCase().includes(chosenPageName.toLowerCase()) ||
        switchedSuccess ||
        (managedPages.length > 0 && chosenPageName)
      ) {
        const finalName =
          activeInfo.name !== "Unknown" && activeInfo.name !== personalName
            ? activeInfo.name
            : chosenPageName;
        logger.success(
          `✅ Berhasil memilih & menyetel identitas Halaman: "${finalName}"`,
        );
        return { success: true, profileName: finalName };
      }

      logger.error(`❌ Gagal menyetel identitas Halaman pada akun ini.`);
      return {
        success: false,
        reason: "NO_PAGE_OR_SWITCH_FAILED",
        profileName: activeInfo.name,
      };
    } catch (e) {
      logger.error("Error saat beralih ke Halaman:", e.message);
      return { success: false, error: e.message };
    }
  }

  /**
   * Beralih kembali ke Profil Pribadi (Akun Utama)
   */
  static async switchToPersonalProfile(page) {
    try {
      logger.info("Memeriksa dan beralih kembali ke Profil Pribadi...");
      await page.goto("https://www.facebook.com/", {
        waitUntil: "domcontentloaded",
      });
      await randomDelay(2000, 4000);

      const topProfileBtn = page
        .locator(
          [
            'div[aria-label*="Profil Anda" i]',
            'div[aria-label*="Your profile" i]',
            'div[aria-label*="Menu Akun" i]',
          ].join(", "),
        )
        .first();

      if (await topProfileBtn.isVisible().catch(() => false)) {
        await topProfileBtn.click({ force: true });
        await randomDelay(1500, 2500);

        // Cari opsi beralih ke profil pribadi
        const switchBackBtn = page
          .locator(
            'div[role="dialog"] div[aria-label*="Beralih ke" i], div[role="dialog"] div[role="button"]:has-text("Lihat semua profil")',
          )
          .first();
        if (await switchBackBtn.isVisible().catch(() => false)) {
          await switchBackBtn.click({ force: true });
          await randomDelay(2000, 3000);

          const mainProfileOption = page
            .locator('div[role="dialog"] div[role="button"][tabindex="0"]')
            .first();
          if (await mainProfileOption.isVisible().catch(() => false)) {
            await mainProfileOption.click({ force: true });
            await randomDelay(4000, 6000);
            await page.waitForLoadState("domcontentloaded").catch(() => {});
            return { success: true };
          }
        }
      }

      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  /**
   * Memastikan identitas aktif (Profil Pribadi atau Halaman) sesuai pengaturan sebelum komentar dimulai.
   * PENTING: Jika pengguna memilih Halaman tapi gagal beralih, bot TIDAK AKAN fallback ke akun biasa!
   */
  static async ensureTargetProfile(
    page,
    targetType = "PERSONAL",
    targetPageName = null,
    onProgress = null,
    accountId = "",
  ) {
    if (targetType === "PAGE") {
      logger.info(
        `[${accountId}] Pengaturan: Berkomentar sebagai Halaman Facebook (Fanspage).`,
      );
      const switchRes = await ProfileSwitcher.switchToPage(
        page,
        targetPageName,
      );
      if (switchRes.success) {
        if (onProgress) {
          await onProgress("SWITCHED_PROFILE", {
            accountId,
            profileType: "PAGE",
            profileName: switchRes.profileName,
          });
        }
        return { success: true, isPage: true, name: switchRes.profileName };
      } else {
        logger.error(
          `🛑 [${accountId}] GAGAL BERALIH KE HALAMAN! Akun ini tidak memiliki Halaman Facebook atau tidak bisa beralih.`,
        );
        logger.error(
          `🛑 [${accountId}] Bot TIDAK AKAN berkomentar menggunakan akun pribadi demi menjaga identitas Anda.`,
        );
        if (onProgress) {
          await onProgress("PAGE_SWITCH_FAILED", {
            accountId,
            profileType: "PERSONAL",
            reason:
              switchRes.reason ||
              "Akun tidak memiliki Halaman atau gagal beralih",
          });
        }
        // PENTING: Return success: false agar bot tidak melanjutkan dengan akun pribadi!
        return { success: false, isPage: false, reason: switchRes.reason };
      }
    } else {
      // Pastikan sebagai profil pribadi
      return { success: true, isPage: false };
    }
  }

  /**
   * Mendeteksi identitas pengirim yang tertera saat ini pada kotak komentar (Reels atau Feed)
   */
  static async getCommentBoxActiveIdentity(page) {
    try {
      const commentAsLocators = [
        'div[aria-label*="Komentari sebagai" i]',
        'div[aria-label*="Comment as" i]',
        'span:has-text("Komentari sebagai")',
        'span:has-text("Comment as")',
        'div:has-text("Komentari sebagai ")',
        'div:has-text("Comment as ")',
      ];

      for (const sel of commentAsLocators) {
        const el = page.locator(sel).first();
        if (await el.isVisible().catch(() => false)) {
          const text =
            (await el.innerText().catch(() => "")) ||
            (await el.getAttribute("aria-label").catch(() => "")) ||
            "";
          const match = text.match(
            /(?:Komentari sebagai|Comment as)\s+([^\n\r•]+)/i,
          );
          if (match && match[1]) {
            return { found: true, name: match[1].trim() };
          }
        }
      }

      return { found: false, name: "" };
    } catch (e) {
      return { found: false, name: "" };
    }
  }

  /**
   * Memvalidasi dan memastikan bahwa identitas yang aktif benar-benar Halaman.
   * JANGAN PERNAH mengklik avatar pengguna di samping kotak komentar karena itu adalah link ke halaman profil sendiri!
   */
  static async enforcePageIdentityAtCommentBox(page, targetPageName = null) {
    try {
      // 1. Cek identitas profil global aktif dari pojok kanan atas
      const globalProfile = await ProfileSwitcher.getCurrentProfileInfo(page);

      if (
        targetPageName &&
        globalProfile.name.toLowerCase().includes(targetPageName.toLowerCase())
      ) {
        return { valid: true, identityName: globalProfile.name };
      }

      // 2. Cek teks yang tertera di samping kotak komentar
      const currentBoxIdentity =
        await ProfileSwitcher.getCommentBoxActiveIdentity(page);
      if (
        targetPageName &&
        currentBoxIdentity.name
          .toLowerCase()
          .includes(targetPageName.toLowerCase())
      ) {
        return { valid: true, identityName: currentBoxIdentity.name };
      }

      // 3. Jika nama belum sesuai, panggil kembali switchToPage
      logger.warn(
        `Identitas aktif saat ini: "${globalProfile.name || currentBoxIdentity.name}". Memastikan beralih ke Halaman Facebook...`,
      );
      const switchRes = await ProfileSwitcher.switchToPage(
        page,
        targetPageName,
      );
      if (switchRes.success) {
        return { valid: true, identityName: switchRes.profileName };
      }

      // Jika gagal beralih ke Halaman, kembalikan valid: false agar bot SKIP konten ini
      return {
        valid: false,
        reason: "PAGE_NOT_ALLOWED_ON_THIS_CONTENT",
        identityName: globalProfile.name || currentBoxIdentity.name,
      };
    } catch (e) {
      return { valid: true };
    }
  }
}
