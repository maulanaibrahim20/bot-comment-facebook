import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { logger } from './utils/logger.js';
import { prisma } from './db/prisma.js';

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

export const DEFAULT_SETTINGS = {
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

/**
 * Mendapatkan daftar semua akun Facebook
 */
export async function getAccounts() {
  try {
    const accounts = await prisma.account.findMany({
      orderBy: { id: 'asc' }
    });
    if (accounts && accounts.length > 0) {
      return accounts;
    }
  } catch (err) {
    logger.warn(`Prisma getAccounts gagal, beralih ke file JSON: ${err.message}`);
  }

  // Fallback ke JSON jika database belum ada data atau gagal konek
  let accounts = loadJson(paths.accountsFile, null);
  if (!accounts) {
    accounts = loadJson(paths.accountsExampleFile, []);
  }
  return accounts;
}

/**
 * Menyimpan / memperbarui daftar akun Facebook
 */
export async function saveAccounts(accounts) {
  try {
    for (const acc of accounts) {
      if (!acc.username) continue;
      await prisma.account.upsert({
        where: { username: acc.username },
        update: {
          name: acc.name || '',
          password: acc.password,
          twoFactorSecret: acc.twoFactorSecret || null,
          proxy: acc.proxy || null,
          enabled: acc.enabled !== false,
          isLimited: Boolean(acc.isLimited),
          limitedAt: acc.limitedAt ? new Date(acc.limitedAt) : null,
          limitReason: acc.limitReason || null,
          note: acc.note || null
        },
        create: {
          id: acc.id,
          name: acc.name || '',
          username: acc.username,
          password: acc.password,
          twoFactorSecret: acc.twoFactorSecret || null,
          proxy: acc.proxy || null,
          enabled: acc.enabled !== false,
          isLimited: Boolean(acc.isLimited),
          limitedAt: acc.limitedAt ? new Date(acc.limitedAt) : null,
          limitReason: acc.limitReason || null,
          note: acc.note || null
        }
      });
    }
  } catch (err) {
    logger.warn(`Gagal menyimpan akun ke Prisma: ${err.message}`);
  }

  // Simpan juga ke file JSON sebagai cadangan
  return saveJson(paths.accountsFile, accounts);
}

/**
 * Menambahkan akun baru
 */
export async function addAccount(accountData) {
  try {
    if (!accountData.id) {
      const all = await prisma.account.findMany({ select: { id: true } }).catch(() => []);
      let maxNum = 0;
      for (const a of all) {
        const match = a.id.match(/^acc_(\d+)$/);
        if (match) {
          const num = parseInt(match[1], 10);
          if (num > maxNum) maxNum = num;
        }
      }
      accountData.id = `acc_${String(maxNum + 1).padStart(2, '0')}`;
    }

    const created = await prisma.account.upsert({
      where: { username: accountData.username },
      update: {
        name: accountData.name || '',
        password: accountData.password,
        twoFactorSecret: accountData.twoFactorSecret || null,
        proxy: accountData.proxy || null,
        enabled: accountData.enabled !== false,
        isLimited: Boolean(accountData.isLimited),
        limitedAt: accountData.limitedAt ? new Date(accountData.limitedAt) : null,
        limitReason: accountData.limitReason || null,
        note: accountData.note || null
      },
      create: {
        id: accountData.id,
        name: accountData.name || '',
        username: accountData.username,
        password: accountData.password,
        twoFactorSecret: accountData.twoFactorSecret || null,
        proxy: accountData.proxy || null,
        enabled: accountData.enabled !== false,
        isLimited: Boolean(accountData.isLimited),
        limitedAt: accountData.limitedAt ? new Date(accountData.limitedAt) : null,
        limitReason: accountData.limitReason || null,
        note: accountData.note || null
      }
    });

    // Sync JSON backup
    const jsonAccounts = await getAccounts();
    saveJson(paths.accountsFile, jsonAccounts);
    return created;
  } catch (err) {
    logger.warn(`Gagal menambah akun via Prisma, fallback ke JSON: ${err.message}`);
    const accounts = loadJson(paths.accountsFile, []) || [];
    if (!accountData.id) {
      accountData.id = `acc_${String(accounts.length + 1).padStart(2, '0')}`;
    }
    accounts.push(accountData);
    saveJson(paths.accountsFile, accounts);
    return accountData;
  }
}

/**
 * Mengimpor banyak akun sekaligus via teks
 */
export async function bulkImportAccounts(textData) {
  const lines = textData.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);
  const imported = [];

  const existingAccounts = await prisma.account.findMany({ select: { id: true } }).catch(() => []);
  let maxNum = 0;
  for (const a of existingAccounts) {
    const match = a.id.match(/^acc_(\d+)$/);
    if (match) {
      const num = parseInt(match[1], 10);
      if (num > maxNum) maxNum = num;
    }
  }

  for (const line of lines) {
    if (line.startsWith('#') || line.startsWith('//')) continue;

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

    maxNum++;
    const nextIndex = maxNum;
    const newAcc = {
      id: `acc_${String(nextIndex).padStart(2, '0')}`,
      name: `Akun ${nextIndex}`,
      username,
      password,
      twoFactorSecret,
      proxy,
      enabled: true
    };

    try {
      await prisma.account.upsert({
        where: { username: newAcc.username },
        update: {
          password: newAcc.password,
          twoFactorSecret: newAcc.twoFactorSecret || null,
          proxy: newAcc.proxy || null,
          enabled: true
        },
        create: {
          id: newAcc.id,
          name: newAcc.name,
          username: newAcc.username,
          password: newAcc.password,
          twoFactorSecret: newAcc.twoFactorSecret || null,
          proxy: newAcc.proxy || null,
          enabled: true
        }
      });
    } catch (err) {
      logger.warn(`Gagal upsert akun ${newAcc.username} di Prisma: ${err.message}`);
    }

    imported.push(newAcc);
  }

  // Sync snapshot JSON
  const allAccounts = await getAccounts();
  saveJson(paths.accountsFile, allAccounts);

  return imported;
}

/**
 * Menyimpan data sesi Playwright (cookies & localStorage) ke database MySQL
 */
export async function saveAccountSession(accountId, sessionData) {
  try {
    await prisma.account.update({
      where: { id: accountId },
      data: { sessionData: sessionData }
    });
  } catch (err) {
    logger.warn(`Gagal menyimpan sessionData ke Prisma untuk ${accountId}: ${err.message}`);
  }

  // Simpan juga ke file lokal sebagai cache Playwright
  const sessionPath = paths.getSessionFilePath(accountId);
  saveJson(sessionPath, sessionData);
  return true;
}

/**
 * Mengambil data sesi dari database MySQL atau file lokal
 */
export async function getAccountSession(accountId) {
  try {
    const acc = await prisma.account.findUnique({
      where: { id: accountId },
      select: { sessionData: true }
    });
    if (acc && acc.sessionData) {
      return acc.sessionData;
    }
  } catch (err) {
    // Fallback ke file lokal
  }

  const sessionPath = paths.getSessionFilePath(accountId);
  return loadJson(sessionPath, null);
}

export function hasAccountSession(accountId, account = null) {
  if (account && account.sessionData) {
    return true;
  }
  const jsonPath = paths.getSessionFilePath(accountId);
  if (fs.existsSync(jsonPath)) {
    try {
      const stat = fs.statSync(jsonPath);
      if (stat.size > 20) return true;
    } catch (e) {}
  }
  const profileDir = paths.getProfileDir(accountId);
  if (fs.existsSync(profileDir)) {
    try {
      const files = fs.readdirSync(profileDir);
      if (files.length > 0) return true;
    } catch (e) {}
  }
  return false;
}

/**
 * Menghapus akun dari database & sesi
 */
export async function deleteAccount(accountId, deleteSession = true) {
  try {
    await prisma.account.deleteMany({
      where: { id: accountId }
    });
  } catch (err) {
    logger.warn(`Gagal menghapus akun di Prisma: ${err.message}`);
  }

  // Hapus dari JSON backup
  let accounts = loadJson(paths.accountsFile, []);
  accounts = accounts.filter((a) => a.id !== accountId);
  saveJson(paths.accountsFile, accounts);

  if (deleteSession) {
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

  return await getAccounts();
}

/**
 * Memperbarui data akun tertentu
 */
export async function updateAccount(accountId, updatedData) {
  try {
    const dataToUpdate = {};
    if (updatedData.name !== undefined) dataToUpdate.name = updatedData.name;
    if (updatedData.username !== undefined) dataToUpdate.username = updatedData.username;
    if (updatedData.password !== undefined) dataToUpdate.password = updatedData.password;
    if (updatedData.twoFactorSecret !== undefined) dataToUpdate.twoFactorSecret = updatedData.twoFactorSecret || null;
    if (updatedData.proxy !== undefined) dataToUpdate.proxy = updatedData.proxy;
    if (updatedData.enabled !== undefined) dataToUpdate.enabled = updatedData.enabled;
    if (updatedData.isLimited !== undefined) dataToUpdate.isLimited = updatedData.isLimited;
    if (updatedData.limitedAt !== undefined) dataToUpdate.limitedAt = updatedData.limitedAt ? new Date(updatedData.limitedAt) : null;
    if (updatedData.limitReason !== undefined) dataToUpdate.limitReason = updatedData.limitReason;
    if (updatedData.note !== undefined) dataToUpdate.note = updatedData.note;
    if (updatedData.sessionData !== undefined) dataToUpdate.sessionData = updatedData.sessionData;

    const updated = await prisma.account.update({
      where: { id: accountId },
      data: dataToUpdate
    });
    return updated;
  } catch (err) {
    logger.warn(`Gagal update akun via Prisma: ${err.message}`);
    const accounts = loadJson(paths.accountsFile, []);
    const idx = accounts.findIndex((a) => a.id === accountId);
    if (idx !== -1) {
      accounts[idx] = { ...accounts[idx], ...updatedData };
      saveJson(paths.accountsFile, accounts);
      return accounts[idx];
    }
  }
  return null;
}

export async function markAccountLimited(accountId, reason = 'Limit komentar Facebook') {
  return await updateAccount(accountId, {
    isLimited: true,
    limitedAt: new Date().toISOString(),
    limitReason: reason,
    note: `⚠️ Terkena Limit: ${reason}`
  });
}

export async function clearAccountLimit(accountId) {
  return await updateAccount(accountId, {
    isLimited: false,
    limitedAt: null,
    limitReason: null,
    note: null
  });
}

export async function getLimitedAccounts() {
  try {
    return await prisma.account.findMany({
      where: { isLimited: true },
      orderBy: { id: 'asc' }
    });
  } catch (err) {
    const accounts = await getAccounts();
    return accounts.filter((a) => a.isLimited === true);
  }
}

/**
 * Mendapatkan daftar target URL postingan
 */
export async function getTargets() {
  try {
    const targets = await prisma.target.findMany({
      orderBy: { id: 'asc' }
    });
    if (targets && targets.length > 0) {
      return targets;
    }
  } catch (err) {
    logger.warn(`Prisma getTargets gagal: ${err.message}`);
  }
  return loadJson(paths.targetsFile, []);
}

/**
 * Menyimpan daftar target URL postingan
 */
export async function saveTargets(targets) {
  try {
    for (const t of targets) {
      if (!t.postUrl) continue;
      await prisma.target.upsert({
        where: { id: t.id },
        update: {
          postUrl: t.postUrl,
          commentTemplate: t.commentTemplate || '',
          description: t.description || null,
          active: t.active !== false
        },
        create: {
          id: t.id,
          postUrl: t.postUrl,
          commentTemplate: t.commentTemplate || '',
          description: t.description || null,
          active: t.active !== false
        }
      });
    }
  } catch (err) {
    logger.warn(`Gagal menyimpan targets ke Prisma: ${err.message}`);
  }
  return saveJson(paths.targetsFile, targets);
}

/**
 * Mendapatkan konfigurasi bot
 */
export async function getSettings() {
  try {
    const record = await prisma.botSetting.findUnique({
      where: { key: 'global_settings' }
    });
    if (record && record.value) {
      const val = typeof record.value === 'string' ? JSON.parse(record.value) : record.value;
      return {
        ...DEFAULT_SETTINGS,
        ...val,
        defaults: { ...DEFAULT_SETTINGS.defaults, ...(val.defaults || {}) }
      };
    }
  } catch (err) {
    // Abaikan error koneksi dan fallback
  }

  const loaded = loadJson(paths.settingsFile, DEFAULT_SETTINGS);
  return {
    ...DEFAULT_SETTINGS,
    ...loaded,
    defaults: { ...DEFAULT_SETTINGS.defaults, ...(loaded.defaults || {}) }
  };
}

/**
 * Menyimpan konfigurasi bot
 */
export async function saveSettings(settings) {
  try {
    await prisma.botSetting.upsert({
      where: { key: 'global_settings' },
      update: { value: settings },
      create: { key: 'global_settings', value: settings }
    });
  } catch (err) {
    logger.warn(`Gagal menyimpan settings ke Prisma: ${err.message}`);
  }
  return saveJson(paths.settingsFile, settings);
}

export async function getDefaultCampaignOptions() {
  const settings = await getSettings();
  return settings.defaults;
}

export async function updateDefaultCampaignOptions(newDefaults) {
  const settings = await getSettings();
  settings.defaults = { ...(settings.defaults || {}), ...newDefaults };
  await saveSettings(settings);
  return settings.defaults;
}

/**
 * Memuat riwayat postingan / Reels yang sudah pernah dikomentari
 */
export async function getCommentHistory() {
  try {
    const records = await prisma.commentHistory.findMany({
      orderBy: { createdAt: 'desc' }
    });
    const historyMap = {};
    for (const rec of records) {
      if (!historyMap[rec.accountId]) {
        historyMap[rec.accountId] = [];
      }
      historyMap[rec.accountId].push(rec.targetKey);
    }
    return historyMap;
  } catch (err) {
    logger.warn(`Prisma getCommentHistory gagal: ${err.message}`);
    return loadJson(paths.historyFile, {});
  }
}

/**
 * Mengecek apakah akun tertentu sudah pernah mengomentari postingan / Reel ini
 */
export async function hasAccountCommentedOn(accountId, targetKey) {
  if (!accountId || !targetKey) return false;
  try {
    const exists = await prisma.commentHistory.findFirst({
      where: {
        accountId: String(accountId),
        targetKey: String(targetKey)
      }
    });
    return Boolean(exists);
  } catch (err) {
    const history = loadJson(paths.historyFile, {});
    const accountHistory = history[accountId];
    if (!Array.isArray(accountHistory)) return false;
    return accountHistory.includes(String(targetKey));
  }
}

/**
 * Mencatat bahwa akun tertentu telah sukses mengomentari postingan / Reel ini
 */
export async function markCommentedHistory(accountId, targetKey) {
  if (!accountId || !targetKey) return;
  const keyStr = String(targetKey);

  try {
    await prisma.commentHistory.upsert({
      where: {
        account_target_unique: {
          accountId: String(accountId),
          targetKey: keyStr
        }
      },
      update: {},
      create: {
        accountId: String(accountId),
        targetKey: keyStr
      }
    });
  } catch (err) {
    logger.warn(`Gagal mencatat history ke Prisma: ${err.message}`);
  }

  // Backup ke JSON
  const history = loadJson(paths.historyFile, {});
  if (!Array.isArray(history[accountId])) {
    history[accountId] = [];
  }
  if (!history[accountId].includes(keyStr)) {
    history[accountId].push(keyStr);
    if (history[accountId].length > 2500) {
      history[accountId].shift();
    }
    saveJson(paths.historyFile, history);
  }
}

/**
 * Menghapus / mereset riwayat komentar
 */
export async function clearCommentHistory(accountId = null) {
  try {
    if (accountId) {
      await prisma.commentHistory.deleteMany({
        where: { accountId: String(accountId) }
      });
    } else {
      await prisma.commentHistory.deleteMany({});
    }
  } catch (err) {
    logger.warn(`Gagal menghapus comment history di Prisma: ${err.message}`);
  }

  const history = loadJson(paths.historyFile, {});
  if (accountId) {
    delete history[accountId];
  } else {
    for (const key of Object.keys(history)) {
      delete history[key];
    }
  }
  saveJson(paths.historyFile, history);
}
