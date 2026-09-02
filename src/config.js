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
    }
  };

  const loaded = loadJson(paths.settingsFile, defaultSettings);
  return { ...defaultSettings, ...loaded };
}

