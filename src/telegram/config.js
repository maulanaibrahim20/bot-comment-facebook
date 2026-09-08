import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { paths, getDefaultCampaignOptions, updateDefaultCampaignOptions } from "../config.js";

dotenv.config();

export const telegramConfigFile = path.join(paths.configDir, "telegram.json");
export const telegramExampleFile = path.join(paths.configDir, "telegram.example.json");

export function loadTelegramConfig() {
  let loaded = {};
  if (fs.existsSync(telegramConfigFile)) {
    try {
      loaded = JSON.parse(fs.readFileSync(telegramConfigFile, "utf-8"));
    } catch (e) {}
  } else if (fs.existsSync(telegramExampleFile)) {
    try {
      loaded = JSON.parse(fs.readFileSync(telegramExampleFile, "utf-8"));
    } catch (e) {}
  }

  let systemDefaults = {
    commentTemplate: "https://whatsapp.com/channel/0029VbDanrVD38CMAgA7L91R",
    delaySeconds: 15,
    commentAs: "PERSONAL",
    targetPageName: "",
    headless: true,
    minComments: 0,
    maxComments: 0
  };
  if (fs.existsSync(paths.settingsFile)) {
    try {
      const s = JSON.parse(fs.readFileSync(paths.settingsFile, "utf-8"));
      if (s && s.defaults) systemDefaults = { ...systemDefaults, ...s.defaults };
    } catch (e) {}
  }

  return {
    botToken: loaded.botToken || "",
    allowedUsers: loaded.allowedUsers || [],
    defaultSettings: {
      customComment: loaded.defaultSettings?.customComment || systemDefaults.commentTemplate,
      defaultDelaySeconds: loaded.defaultSettings?.defaultDelaySeconds || systemDefaults.delaySeconds,
      concurrency: loaded.defaultSettings?.concurrency || 1,
      commentAs: loaded.defaultSettings?.commentAs || systemDefaults.commentAs,
      targetPageName: loaded.defaultSettings?.targetPageName || systemDefaults.targetPageName || "",
      headless: loaded.defaultSettings?.headless !== undefined ? loaded.defaultSettings.headless : systemDefaults.headless,
      minComments: loaded.defaultSettings?.minComments !== undefined ? loaded.defaultSettings.minComments : (systemDefaults.minComments || 0),
      maxComments: loaded.defaultSettings?.maxComments !== undefined ? loaded.defaultSettings.maxComments : (systemDefaults.maxComments || 0)
    }
  };
}

export function saveTelegramConfig(config) {
  try {
    fs.writeFileSync(telegramConfigFile, JSON.stringify(config, null, 2), "utf-8");
    if (config.defaultSettings) {
      updateDefaultCampaignOptions({
        commentTemplate: config.defaultSettings.customComment,
        delaySeconds: config.defaultSettings.defaultDelaySeconds,
        commentAs: config.defaultSettings.commentAs,
        targetPageName: config.defaultSettings.targetPageName,
        headless: config.defaultSettings.headless,
        minComments: config.defaultSettings.minComments,
        maxComments: config.defaultSettings.maxComments
      }).catch(() => {});
    }
  } catch (e) {}
}

export function getBotToken() {
  const config = loadTelegramConfig();
  return process.env.TELEGRAM_BOT_TOKEN || config.botToken || "";
}

export function validateBotToken(token) {
  if (!token || token.includes("MASUKKAN_BOT_TOKEN") || token.trim() === "") {
    console.log("\n======================================================");
    console.log("⚠️ TELEGRAM BOT TOKEN BELUM DIKONFIGURASI!");
    console.log("1. Buat bot baru di Telegram melalui @BotFather");
    console.log("2. Salin token bot Anda.");
    console.log("3. Masukkan ke file .env atau config/telegram.json");
    console.log("======================================================\n");
    return false;
  }
  return true;
}
