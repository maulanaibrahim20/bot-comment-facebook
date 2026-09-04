import { prisma, checkDatabaseConnection } from '../db/prisma.js';
import { 
  getAccounts, 
  addAccount, 
  updateAccount, 
  deleteAccount, 
  getTargets, 
  getSettings,
  hasAccountCommentedOn,
  markCommentedHistory,
  clearCommentHistory
} from '../config.js';
import { logger } from '../utils/logger.js';

async function runPrismaTests() {
  console.log('======================================================');
  console.log('  🧪 MENJALANKAN UJI KONEKSI & CRUD PRISMA MYSQL     ');
  console.log('======================================================\n');

  let passed = 0;
  let total = 0;

  function assert(name, condition, extra = '') {
    total++;
    if (condition) {
      passed++;
      logger.success(`[LULUS] ${name} ${extra}`);
    } else {
      logger.error(`[GAGAL] ${name} ${extra}`);
    }
  }

  // 1. Uji Koneksi
  const isConnected = await checkDatabaseConnection();
  assert('1. Koneksi Prisma ke MySQL', isConnected === true);

  // 2. Uji Baca Akun
  const accounts = await getAccounts();
  assert('2. getAccounts() dari Database', Array.isArray(accounts) && accounts.length > 0, `(Ditemukan ${accounts.length} akun)`);

  // 3. Uji Tambah Akun
  const testAccUsername = `test_prisma_${Date.now()}@example.com`;
  const newAccount = await addAccount({
    id: `test_acc_${Date.now()}`,
    name: 'Akun Uji Prisma',
    username: testAccUsername,
    password: 'SecurePassword123!',
    twoFactorSecret: 'JBSWY3DPEHPK3PXP',
    proxy: { server: 'http://127.0.0.1:8080' }
  });
  assert('3. addAccount()', newAccount && newAccount.username === testAccUsername, `(ID: ${newAccount.id})`);

  // 4. Uji Update Akun
  const updatedAccount = await updateAccount(newAccount.id, {
    note: 'Catatan pengujian berhasil diperbarui',
    isLimited: true,
    limitReason: 'Test limit reason'
  });
  assert('4. updateAccount()', updatedAccount && updatedAccount.isLimited === true && updatedAccount.note.includes('Catatan pengujian'));

  // 5. Uji Riwayat Komentar (Comment History)
  const testTargetKey = `post_test_${Date.now()}`;
  await markCommentedHistory(newAccount.id, testTargetKey);
  const hasCommented = await hasAccountCommentedOn(newAccount.id, testTargetKey);
  assert('5. markCommentedHistory & hasAccountCommentedOn', hasCommented === true);

  // 6. Uji Hapus Akun & Cascade
  await deleteAccount(newAccount.id, false);
  const accountsAfter = await getAccounts();
  const deletedStillExists = accountsAfter.some(a => a.id === newAccount.id);
  assert('6. deleteAccount()', deletedStillExists === false);

  // 7. Uji Targets & Settings
  const targets = await getTargets();
  const settings = await getSettings();
  assert('7. getTargets() & getSettings()', targets.length > 0 && settings.browser !== undefined);

  console.log('\n======================================================');
  if (passed === total) {
    console.log(`  🎉 SEMUA UJI PRISMA BERHASIL LULUS 100%! (${passed}/${total} Test) `);
  } else {
    console.log(`  ⚠️ SEBAGIAN UJI PRISMA GAGAL (${passed}/${total} Test) `);
  }
  console.log('======================================================\n');
}

runPrismaTests()
  .catch((err) => {
    logger.error('Terjadi error saat menjalankan test Prisma:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
