import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { logger } from './utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const configDir = path.join(rootDir, 'config');
const sessionsDir = path.join(rootDir, 'sessions');
const profilesDir = path.join(sessionsDir, 'profiles');
const logsDir = path.join(rootDir, 'logs');

// Pastikan direktori penting ada
[sessionsDir, profilesDir, logsDir, configDir].forEach((dir) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

function loadJson(filePath, defaultValue) {
  try {
    if (!fs.existsSync(filePath)) {
      return defaultValue;
    }
    const content = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(content);
  } catch (err) {
    logger.error(`Gagal membaca file konfigurasi di ${filePath}:`, err);
    return defaultValue;
  }
}

function saveJson(filePath, data) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
    return true;
  } catch (err) {
    logger.error(`Gagal menyimpan file di ${filePath}:`, err);
    return false;
  }
}

export const paths = {
  rootDir,
  configDir,
  sessionsDir,
  profilesDir,
  logsDir,
  accountsFile: path.join(configDir, 'accounts.json'),
  accountsExampleFile: path.join(configDir, 'accounts.example.json'),
  targetsFile: path.join(configDir, 'targets.json'),
  settingsFile: path.join(configDir, 'settings.json'),
  historyFile: path.join(configDir, 'comment_history.json'),
  getSessionFilePath: (accountId) => path.join(sessionsDir, `${accountId}.json`),
  getProfileDir: (accountId) => path.join(sessionsDir, 'profiles', accountId)
};


export function getAccounts() {
  let accounts = loadJson(paths.accountsFile, null);
  if (!accounts) {
    // Coba fallback ke accounts.example.json jika accounts.json belum ada
    accounts = loadJson(paths.accountsExampleFile, []);
  }
  return accounts;
}

export function saveAccounts(accounts) {
  return saveJson(paths.accountsFile, accounts);
}

export function addAccount(accountData) {
  const accounts = getAccounts();
  // Buat ID baru jika belum ada
  if (!accountData.id) {
    const nextIndex = accounts.length + 1;
    accountData.id = `acc_${String(nextIndex).padStart(2, '0')}`;
  }
  accounts.push(accountData);
  saveAccounts(accounts);
  return accountData;
}

export function bulkImportAccounts(textData) {
  const lines = textData.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);
  const accounts = getAccounts();
  const imported = [];

  for (const line of lines) {
    // Abaikan komentar atau baris kosong
    if (line.startsWith('#') || line.startsWith('//')) continue;

    // Pisahkan berdasarkan delimiter | atau :
    let parts = line.includes('|') ? line.split('|') : line.split(':');
    parts = parts.map((p) => p.trim());

    if (parts.length < 2) continue;

    const username = parts[0];
    const password = parts[1];
    const twoFactorSecret = parts[2] || '';
    let proxy = null;

    if (parts[3]) {
      proxy = { server: parts[3] };
    }

    const nextIndex = accounts.length + imported.length + 1;
    const newAcc = {
      id: `acc_${String(nextIndex).padStart(2, '0')}`,
      name: `Akun ${nextIndex}`,
      username,
      password,
      twoFactorSecret,
      proxy,
      enabled: true
    };

    imported.push(newAcc);
  }

  if (imported.length > 0) {
    accounts.push(...imported);
    saveAccounts(accounts);
  }

  return imported;
}

export function hasAccountSession(accountId) {
  const profileDir = paths.getProfileDir(accountId);
  const jsonPath = paths.getSessionFilePath(accountId);

  if (fs.existsSync(profileDir)) {
    try {
      const files = fs.readdirSync(profileDir);
      if (files.length > 0) return true;
    } catch (e) {}
  }
  return fs.existsSync(jsonPath);
}

export function deleteAccount(accountId, deleteSession = true) {
  let accounts = getAccounts();
  accounts = accounts.filter((a) => a.id !== accountId);
  saveAccounts(accounts);

  if (deleteSession) {
    // Hapus file json session dan direktori profile jika ada
    const sessionPath = paths.getSessionFilePath(accountId);
    if (fs.existsSync(sessionPath)) {
      try {
        fs.unlinkSync(sessionPath);
      } catch (e) {}
    }

    const profileDir = paths.getProfileDir(accountId);
    if (fs.existsSync(profileDir)) {
      try {
        fs.rmSync(profileDir, { recursive: true, force: true });
      } catch (e) {}
    }
  }

  return accounts;
}


export function updateAccount(accountId, updatedData) {
  const accounts = getAccounts();
  const idx = accounts.findIndex((a) => a.id === accountId);
  if (idx !== -1) {
    accounts[idx] = { ...accounts[idx], ...updatedData };
    saveAccounts(accounts);
    return accounts[idx];
  }
  return null;
}

/**
 * Mencatat akun yang terkena limit komentar Facebook beserta alasan dan waktunya
 */
export function markAccountLimited(accountId, reason = 'Limit komentar Facebook') {
  return updateAccount(accountId, {
    isLimited: true,
    limitedAt: new Date().toISOString(),
    limitReason: reason,
    note: `⚠️ Terkena Limit: ${reason}`
  });
}

/**
 * Menghapus / mereset status limit akun (agar bisa digunakan kembali normal)
 */
export function clearAccountLimit(accountId) {
  return updateAccount(accountId, {
    isLimited: false,
    limitedAt: null,
    limitReason: null,
    note: null
  });
}

/**
 * Mendapatkan daftar akun yang saat ini berstatus limit
 */
export function getLimitedAccounts() {
  const accounts = getAccounts();
  return accounts.filter((a) => a.isLimited === true);
}

export function getTargets() {
  return loadJson(paths.targetsFile, []);
}

export function saveTargets(targets) {
  return saveJson(paths.targetsFile, targets);
}

export function getSettings() {
  const defaultSettings = {
    browser: {
      headless: false,
      slowMo: 50,
      viewport: { width: 1280, height: 720 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      timeoutMs: 60000
    },
    delays: {
      minTypingDelayMs: 80,
      maxTypingDelayMs: 220,
      minActionDelayMs: 3000,
      maxActionDelayMs: 7000,
      minBetweenAccountsDelayMs: 20000,
      maxBetweenAccountsDelayMs: 45000
    },
    safety: {
      maxCommentsPerAccountPerDay: 10,
      stopOnError: false,
      screenshotOnError: true
    },
    defaults: {
      commentTemplate: "https://whatsapp.com/channel/0029VbDanrVD38CMAgA7L91R",
      delaySeconds: 15,
      commentAs: "PERSONAL",
      targetPageName: "",
      headless: false,
      minComments: 0,
      maxComments: 0
    }
  };

  const loaded = loadJson(paths.settingsFile, defaultSettings);
  return { 
    ...defaultSettings, 
    ...loaded, 
    defaults: { ...defaultSettings.defaults, ...(loaded.defaults || {}) } 
  };
}

export function saveSettings(settings) {
  return saveJson(paths.settingsFile, settings);
}

export function getDefaultCampaignOptions() {
  const settings = getSettings();
  return settings.defaults;
}

export function updateDefaultCampaignOptions(newDefaults) {
  const settings = getSettings();
  settings.defaults = { ...(settings.defaults || {}), ...newDefaults };
  saveSettings(settings);
  return settings.defaults;
}

/**
 * Memuat riwayat postingan / Reels yang sudah pernah dikomentari oleh masing-masing akun
 */
export function getCommentHistory() {
  return loadJson(paths.historyFile, {});
}

/**
 * Mengecek apakah akun tertentu sudah pernah mengomentari postingan / Reel ini
 */
export function hasAccountCommentedOn(accountId, targetKey) {
  if (!targetKey) return false;
  const history = getCommentHistory();
  const accountHistory = history[accountId];
  if (!Array.isArray(accountHistory)) return false;
  return accountHistory.includes(String(targetKey));
}

/**
 * Mencatat bahwa akun tertentu telah sukses mengomentari postingan / Reel ini
 */
export function markCommentedHistory(accountId, targetKey) {
  if (!targetKey) return;
  const history = getCommentHistory();
  if (!Array.isArray(history[accountId])) {
    history[accountId] = [];
  }
  const keyStr = String(targetKey);
  if (!history[accountId].includes(keyStr)) {
    history[accountId].push(keyStr);
    // Batasi riwayat maksimal 2500 entri per akun agar file tidak membengkak
    if (history[accountId].length > 2500) {
      history[accountId].shift();
    }
    saveJson(paths.historyFile, history);
  }
}

/**
 * Menghapus / mereset riwayat komentar
 */
export function clearCommentHistory(accountId = null) {
  const history = getCommentHistory();
  if (accountId) {
    delete history[accountId];
  } else {
    for (const key of Object.keys(history)) {
      delete history[key];
    }
  }
  saveJson(paths.historyFile, history);
}

