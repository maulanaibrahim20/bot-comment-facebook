import { describe, it, expect, afterAll } from 'vitest';
import { prisma, checkDatabaseConnection } from '../db/prisma.js';
import {
  getAccounts,
  addAccount,
  updateAccount,
  deleteAccount,
  getTargets,
  saveTargets,
  getSettings,
  updateDefaultCampaignOptions,
  hasAccountCommentedOn,
  markCommentedHistory,
  clearCommentHistory
} from '../config.js';

describe('Database & Prisma Persistence', () => {
  const testAccId = `test_vt_${Date.now()}`;
  const testUsername = `test_user_${Date.now()}@example.com`;

  afterAll(async () => {
    // Cleanup any remaining test artifacts
    try {
      await prisma.commentHistory.deleteMany({ where: { accountId: testAccId } });
      await prisma.account.deleteMany({ where: { id: testAccId } });
    } catch (e) {}
    await prisma.$disconnect();
  });

  it('should successfully establish connection to MySQL via Prisma', async () => {
    const isConnected = await checkDatabaseConnection();
    expect(isConnected).toBe(true);
  });

  describe('Account CRUD', () => {
    it('should create a new account in the database', async () => {
      const created = await addAccount({
        id: testAccId,
        name: 'Vitest Test User',
        username: testUsername,
        password: 'TestPassword123!',
        twoFactorSecret: 'JBSWY3DPEHPK3PXP',
        proxy: { server: 'http://127.0.0.1:8888' },
        note: 'Initial note'
      });

      expect(created).toBeDefined();
      expect(created.id).toBe(testAccId);
      expect(created.username).toBe(testUsername);

      const accounts = await getAccounts();
      const found = accounts.find((a) => a.id === testAccId);
      expect(found).toBeDefined();
      expect(found.name).toBe('Vitest Test User');
    });

    it('should update account details in the database', async () => {
      const updated = await updateAccount(testAccId, {
        note: 'Updated vitest note',
        isLimited: true,
        limitReason: 'Testing limit flag'
      });

      expect(updated).toBeDefined();
      expect(updated.isLimited).toBe(true);
      expect(updated.note).toBe('Updated vitest note');
      expect(updated.limitReason).toBe('Testing limit flag');

      const accounts = await getAccounts();
      const found = accounts.find((a) => a.id === testAccId);
      expect(found.isLimited).toBe(true);
      expect(found.note).toBe('Updated vitest note');
    });

    it('should record and verify comment history for the account', async () => {
      const targetPostKey = `post_vt_${Date.now()}`;
      expect(await hasAccountCommentedOn(testAccId, targetPostKey)).toBe(false);

      await markCommentedHistory(testAccId, targetPostKey);
      expect(await hasAccountCommentedOn(testAccId, targetPostKey)).toBe(true);

      // Test clearing history for this account
      await clearCommentHistory(testAccId);
      expect(await hasAccountCommentedOn(testAccId, targetPostKey)).toBe(false);
    });

    it('should delete the test account from the database without removing session files', async () => {
      await deleteAccount(testAccId, false);
      const accounts = await getAccounts();
      const found = accounts.find((a) => a.id === testAccId);
      expect(found).toBeUndefined();
    });
  });

  describe('Targets & Settings Persistence', () => {
    it('should read targets from database', async () => {
      const targets = await getTargets();
      expect(Array.isArray(targets)).toBe(true);
      expect(targets.length).toBeGreaterThan(0);
      expect(targets[0]).toHaveProperty('postUrl');
    });

    it('should read settings from database with default fallbacks', async () => {
      const settings = await getSettings();
      expect(settings).toBeDefined();
      expect(settings.browser).toBeDefined();
      expect(settings.browser.viewport).toHaveProperty('width');
      expect(settings.browser.viewport).toHaveProperty('height');
    });

    it('should update and persist default campaign options', async () => {
      const newDefaults = await updateDefaultCampaignOptions({
        testOptionKey: 'vitest_val_' + Date.now()
      });
      expect(newDefaults).toHaveProperty('testOptionKey');

      const settingsAfter = await getSettings();
      expect(settingsAfter.defaults.testOptionKey).toBe(newDefaults.testOptionKey);
    });
  });
});
