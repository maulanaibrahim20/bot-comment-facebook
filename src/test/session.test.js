import { describe, it, expect, afterAll } from 'vitest';
import { prisma } from '../db/prisma.js';
import {
  addAccount,
  deleteAccount,
  saveAccountSession,
  getAccountSession,
  hasAccountSession,
  paths
} from '../config.js';
import fs from 'fs';

describe('Account Session Persistence', () => {
  const testAccId = `test_sess_${Date.now()}`;
  const testUsername = `session_test_${Date.now()}@example.com`;

  afterAll(async () => {
    try {
      await deleteAccount(testAccId, true);
    } catch (e) {}
    await prisma.$disconnect();
  });

  it('should save session state to database and local cache file', async () => {
    // 1. Create test account
    await addAccount({
      id: testAccId,
      name: 'Session Test Account',
      username: testUsername,
      password: 'SamplePassword123!'
    });

    const mockSession = {
      cookies: [
        {
          name: 'c_user',
          value: '1000888999',
          domain: '.facebook.com',
          path: '/'
        },
        {
          name: 'xs',
          value: 'secret_session_token_123',
          domain: '.facebook.com',
          path: '/'
        }
      ],
      origins: [
        {
          origin: 'https://www.facebook.com',
          localStorage: [
            { name: 'hb_timestamp', value: '1725000000' }
          ]
        }
      ]
    };

    // 2. Save session
    const saved = await saveAccountSession(testAccId, mockSession);
    expect(saved).toBe(true);

    // 3. Verify in database
    const dbRecord = await prisma.account.findUnique({
      where: { id: testAccId },
      select: { sessionData: true }
    });
    expect(dbRecord).toBeDefined();
    expect(dbRecord.sessionData).toBeDefined();
    expect(dbRecord.sessionData.cookies).toHaveLength(2);
    expect(dbRecord.sessionData.cookies[0].name).toBe('c_user');

    // 4. Verify local cache file was written
    const sessionFilePath = paths.getSessionFilePath(testAccId);
    expect(fs.existsSync(sessionFilePath)).toBe(true);

    // 5. Verify getAccountSession retrieves the state
    const retrieved = await getAccountSession(testAccId);
    expect(retrieved).toBeDefined();
    expect(retrieved.cookies[1].value).toBe('secret_session_token_123');

    // 6. Verify hasAccountSession checks
    expect(hasAccountSession(testAccId)).toBe(true);
    expect(hasAccountSession(testAccId, { sessionData: mockSession })).toBe(true);
  });

  it('should clean up local session file when account is deleted with removeSessionFile = true', async () => {
    const sessionFilePath = paths.getSessionFilePath(testAccId);
    await deleteAccount(testAccId, true);

    expect(fs.existsSync(sessionFilePath)).toBe(false);

    const checkAcc = await prisma.account.findUnique({
      where: { id: testAccId }
    });
    expect(checkAcc).toBeNull();
  });
});
