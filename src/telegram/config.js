import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { paths } from "../config.js";

dotenv.config();

export const telegramConfigFile = path.join(paths.configDir, "telegram.json");
export const telegramExampleFile = path.join(paths.configDir, "telegram.example.json");

export function loadTelegramConfig() {
  if (fs.existsSync(telegramConfigFile)) {
    try {
      return JSON.parse(fs.readFileSync(telegramConfigFile, "utf-8"));
    } catch (e) {}
  }
  if (fs.existsSync(telegramExampleFile)) {
    try {
      return JSON.parse(fs.readFileSync(telegramExampleFile, "utf-8"));
    } catch (e) {}
  }
  return {
    botToken: "",
    allowedUsers: [],
    defaultSettings: {
      customComment: "https://whatsapp.com/channel/0029VbDanrVD38CMAgA7L91R",
      defaultDelaySeconds: 15,
      concurrency: 1
    }
  };
}

export function saveTelegramConfig(config) {
  try {
    fs.writeFileSync(telegramConfigFile, JSON.stringify(config, null, 2), "utf-8");
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
