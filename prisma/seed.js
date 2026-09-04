import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const configDir = path.join(rootDir, 'config');

const prisma = new PrismaClient();

function loadJson(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    }
  } catch (err) {
    console.error(`Gagal membaca ${filePath}:`, err.message);
  }
  return null;
}

export async function seedDatabase() {
  console.log('🌱 Memulai proses seeding data dari file konfigurasi JSON...');

  // 1. Seed Accounts
  const accountCount = await prisma.account.count();
  if (accountCount === 0) {
    const accountsFile = path.join(configDir, 'accounts.json');
    const accountsExampleFile = path.join(configDir, 'accounts.example.json');
    let loaded = loadJson(accountsFile);
    if (!loaded || loaded.length === 0) {
      loaded = loadJson(accountsExampleFile) || [];
    }
    const accounts = [...loaded];

    const sessionsDir = path.join(rootDir, 'sessions');
    if (fs.existsSync(path.join(sessionsDir, 'acc_03.json')) && !accounts.some(a => a.id === 'acc_03')) {
      accounts.push({
        id: 'acc_03',
        name: 'Akun FB',
        username: 'adrianwalker@yopmail.com',
        password: '',
        enabled: true
      });
    }

    for (const acc of accounts) {
      if (!acc.username) continue;
      await prisma.account.upsert({
        where: { username: acc.username },
        update: {},
        create: {
          id: acc.id || `acc_${Date.now()}`,
          name: acc.name || 'Akun Facebook',
          username: acc.username,
          password: acc.password || '',
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
    console.log(`✅ ${accounts.length} akun berhasil di-seed ke database.`);
  } else {
    console.log(`ℹ️ Akun sudah ada (${accountCount} akun), melewati seeding akun.`);
  }

  // 1.1 Sync Session Files jika ada di folder sessions/
  const sessionsDir = path.join(rootDir, 'sessions');
  if (fs.existsSync(sessionsDir)) {
    const sessionFiles = fs.readdirSync(sessionsDir).filter(f => f.endsWith('.json'));
    for (const sFile of sessionFiles) {
      const accId = sFile.replace('.json', '');
      const sData = loadJson(path.join(sessionsDir, sFile));
      if (sData) {
        await prisma.account.updateMany({
          where: { id: accId },
          data: { sessionData: sData }
        });
      }
    }
  }

  // 2. Seed Targets
  const targetCount = await prisma.target.count();
  if (targetCount === 0) {
    const targetsFile = path.join(configDir, 'targets.json');
    const targets = loadJson(targetsFile) || [];

    for (const t of targets) {
      if (!t.postUrl) continue;
      await prisma.target.upsert({
        where: { id: t.id },
        update: {},
        create: {
          id: t.id || `target_${Date.now()}`,
          postUrl: t.postUrl,
          commentTemplate: t.commentTemplate || '',
          description: t.description || null,
          active: t.active !== false
        }
      });
    }
    console.log(`✅ ${targets.length} target postingan berhasil di-seed ke database.`);
  } else {
    console.log(`ℹ️ Target postingan sudah ada (${targetCount} target), melewati seeding target.`);
  }

  // 3. Seed Comment History
  const historyCount = await prisma.commentHistory.count();
  if (historyCount === 0) {
    const historyFile = path.join(configDir, 'comment_history.json');
    const history = loadJson(historyFile) || {};

    let totalInserted = 0;
    for (const [accountId, targetKeys] of Object.entries(history)) {
      // Pastikan akun ada sebelum insert riwayat
      const accountExists = await prisma.account.findUnique({ where: { id: accountId } });
      if (!accountExists) continue;

      if (Array.isArray(targetKeys)) {
        for (const key of targetKeys) {
          try {
            await prisma.commentHistory.create({
              data: {
                accountId,
                targetKey: String(key)
              }
            });
            totalInserted++;
          } catch (e) {
            // Abaikan duplicate
          }
        }
      }
    }
    console.log(`✅ ${totalInserted} riwayat komentar berhasil di-seed ke database.`);
  } else {
    console.log(`ℹ️ Riwayat komentar sudah ada (${historyCount} entri), melewati seeding riwayat.`);
  }

  // 4. Seed Settings
  const settingsFile = path.join(configDir, 'settings.json');
  const existingSettings = loadJson(settingsFile);
  if (existingSettings) {
    await prisma.botSetting.upsert({
      where: { key: 'global_settings' },
      update: {},
      create: {
        key: 'global_settings',
        value: existingSettings
      }
    });
    console.log(`✅ Pengaturan bot berhasil di-seed ke database.`);
  }

  // 5. Seed Telegram Config
  const tgFile = path.join(configDir, 'telegram.json');
  const tgExampleFile = path.join(configDir, 'telegram.example.json');
  const tgConfig = loadJson(tgFile) || loadJson(tgExampleFile);
  if (tgConfig) {
    await prisma.telegramConfig.upsert({
      where: { key: 'global_config' },
      update: {},
      create: {
        key: 'global_config',
        value: tgConfig
      }
    });
    console.log(`✅ Konfigurasi Telegram berhasil di-seed ke database.`);
  }

  console.log('🎉 Seeding database selesai!');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  seedDatabase()
    .catch((err) => {
      console.error('❌ Error saat seeding:', err);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
