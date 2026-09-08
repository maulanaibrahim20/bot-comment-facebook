import { describe, it, expect } from 'vitest';
import { getSettings, DEFAULT_SETTINGS } from '../config.js';
import { loadTelegramConfig } from '../telegram/config.js';
import { Commenter } from '../core/commenter.js';
import { SessionManager } from '../core/sessionManager.js';
import { ProfileSwitcher } from '../core/profileSwitcher.js';

describe('Feature Parity: CLI vs Telegram Bot', () => {
  it('should support core comment features in Commenter facade', () => {
    // Both CLI and Telegram rely on Commenter methods
    expect(typeof Commenter.postRandomReelsComments).toBe('function');
    expect(typeof Commenter.postRandomFeedComments).toBe('function');
    expect(typeof Commenter.postComment).toBe('function');
    expect(typeof Commenter.parseCommentCountString).toBe('function');
  });

  it('should support session management features used by CLI and Telegram', () => {
    expect(typeof SessionManager.loginAccount).toBe('function');
    expect(typeof SessionManager.loginAccountsParallel).toBe('function');
    expect(typeof SessionManager.verifySession).toBe('function');
    expect(typeof SessionManager.checkAccountRestrictions).toBe('function');
    expect(typeof SessionManager.checkIsLoggedIn).toBe('function');
    expect(typeof SessionManager.captureLoginScreenshot).toBe('function');
    expect(typeof SessionManager.getActiveLoginUrl).toBe('function');
  });

  it('should build verification keyboard with URL and action buttons in Telegram loginService', async () => {
    const { buildVerificationKeyboard } = await import('../telegram/services/loginService.js');
    expect(typeof buildVerificationKeyboard).toBe('function');

    const keyboard = buildVerificationKeyboard('acc_01', 'https://www.facebook.com/checkpoint/?next=feed');
    expect(keyboard).toBeDefined();
    expect(keyboard.reply_markup).toBeDefined();
    expect(keyboard.reply_markup.inline_keyboard).toBeDefined();

    const buttons = keyboard.reply_markup.inline_keyboard.flat();
    const urlButtons = buttons.filter(b => b.url);
    const callbackButtons = buttons.filter(b => b.callback_data);

    // Harus memiliki URL tombol ke halaman checkpoint dan notifikasi Facebook
    expect(urlButtons.some(b => b.url.includes('checkpoint'))).toBe(true);
    expect(urlButtons.some(b => b.url.includes('facebook.com/notifications'))).toBe(true);

    // Harus memiliki tombol screenshot dan batalkan
    expect(callbackButtons.some(b => b.callback_data === 'SCREENSHOT_acc_01')).toBe(true);
    expect(callbackButtons.some(b => b.callback_data === 'CANCEL_LOGIN_acc_01')).toBe(true);
  });

  it('should build account picker keyboard with option for all accounts and specific accounts', async () => {
    const { buildAccountPickerKeyboard } = await import('../telegram/handlers/campaigns.js');
    expect(typeof buildAccountPickerKeyboard).toBe('function');

    const accounts = [
      { id: 'acc_01', username: 'user1@gmail.com' },
      { id: 'acc_02', username: 'user2@gmail.com' }
    ];

    const keyboard = buildAccountPickerKeyboard('REELSACC', accounts);
    expect(keyboard.reply_markup.inline_keyboard).toBeDefined();

    const buttons = keyboard.reply_markup.inline_keyboard.flat();
    expect(buttons.some(b => b.callback_data === 'REELSACC_all')).toBe(true);
    expect(buttons.some(b => b.callback_data === 'REELSACC_acc_01')).toBe(true);
    expect(buttons.some(b => b.callback_data === 'REELSACC_acc_02')).toBe(true);
    expect(buttons.some(b => b.callback_data === 'CANCEL_CAMPAIGN')).toBe(true);
  });

  it('should support page/fanspage profile switching used by CLI and Telegram', () => {
    expect(typeof ProfileSwitcher.switchToPage).toBe('function');
    expect(typeof ProfileSwitcher.switchToPersonalProfile).toBe('function');
    expect(typeof ProfileSwitcher.getAccountPages).toBe('function');
    expect(typeof ProfileSwitcher.ensureTargetProfile).toBe('function');
  });

  it('should have parity in configuration keys between defaultSettings and Telegram config', () => {
    const telegramConfig = loadTelegramConfig();
    expect(telegramConfig).toHaveProperty('defaultSettings');

    // Key settings in Telegram defaultSettings
    const tgDefaults = telegramConfig.defaultSettings;
    expect(tgDefaults).toHaveProperty('defaultDelaySeconds');
    expect(tgDefaults).toHaveProperty('commentAs');
    expect(tgDefaults).toHaveProperty('targetPageName');
    expect(tgDefaults).toHaveProperty('headless');

    // Default settings in CLI config
    expect(DEFAULT_SETTINGS).toHaveProperty('defaults');
    expect(DEFAULT_SETTINGS.defaults).toHaveProperty('delaySeconds');
    expect(DEFAULT_SETTINGS.defaults).toHaveProperty('commentAs');
    expect(DEFAULT_SETTINGS.defaults).toHaveProperty('targetPageName');
  });

  it('should verify Telegram command handlers export necessary registration functions', async () => {
    const { registerHelpHandlers } = await import('../telegram/handlers/help.js');
    const { registerAccountHandlers } = await import('../telegram/handlers/accounts.js');
    const { registerCampaignHandlers } = await import('../telegram/handlers/campaigns.js');
    const { registerSettingsHandlers } = await import('../telegram/handlers/settings.js');
    const { registerTextInputHandler } = await import('../telegram/handlers/textInput.js');

    expect(typeof registerHelpHandlers).toBe('function');
    expect(typeof registerAccountHandlers).toBe('function');
    expect(typeof registerCampaignHandlers).toBe('function');
    expect(typeof registerSettingsHandlers).toBe('function');
    expect(typeof registerTextInputHandler).toBe('function');
  });

  it('should verify Telegram bot registers all essential slash commands', async () => {
    const { registerHelpHandlers } = await import('../telegram/handlers/help.js');
    const { registerCampaignHandlers } = await import('../telegram/handlers/campaigns.js');
    const { registerSettingsHandlers } = await import('../telegram/handlers/settings.js');
    const { registerAccountHandlers } = await import('../telegram/handlers/accounts.js');

    // Mock Telegraf bot instance to record registered commands and actions
    const registeredCommands = new Set();
    const registeredActions = new Set();
    const registeredHears = new Set();

    const mockBot = {
      command: (cmd, fn) => {
        if (Array.isArray(cmd)) {
          cmd.forEach((c) => registeredCommands.add(c));
        } else {
          registeredCommands.add(cmd);
        }
      },
      action: (act, fn) => {
        if (act instanceof RegExp) {
          registeredActions.add(act.toString());
        } else {
          registeredActions.add(act);
        }
      },
      hears: (text, fn) => {
        registeredHears.add(text);
      },
      start: () => {},
      on: () => {}
    };

    registerHelpHandlers(mockBot);
    registerCampaignHandlers(mockBot);
    registerSettingsHandlers(mockBot);
    registerAccountHandlers(mockBot);

    // Verify all parity commands exist in Telegram
    const expectedCommands = [
      'help',
      'status',
      'reels',
      'feed',
      'target',
      'targets',
      'spintax',
      'limited',
      'resetlimit',
      'resethistory',
      'openbrowser',
      'filter',
      'setcomment',
      'setdelay',
      'setidentity',
      'setpage',
      'page',
      'deleteaccount',
      'stop'
    ];

    for (const cmd of expectedCommands) {
      expect(
        registeredCommands.has(cmd),
        `Expected Telegram command /${cmd} to be registered`
      ).toBe(true);
    }
  });

  it('should execute multi-account Reels campaign in parallel', async () => {
    const { executeReelsCampaign } = await import('../telegram/services/reelsService.js');
    const { Commenter } = await import('../core/commenter.js');
    const { vi } = await import('vitest');

    const executedAccounts = [];
    const spy = vi.spyOn(Commenter, 'postRandomReelsComments').mockImplementation(async (account) => {
      executedAccounts.push(account.id);
      return { success: true, totalCommented: 1 };
    });

    const mockCtx = {
      reply: vi.fn(),
      replyWithMarkdown: vi.fn()
    };

    await executeReelsCampaign(mockCtx, 1, null, 'all');

    expect(spy).toHaveBeenCalled();
    // Harus memanggil untuk semua akun aktif
    expect(executedAccounts.length).toBeGreaterThan(0);
    spy.mockRestore();
  });

  it('should execute multi-account Feed campaign in parallel', async () => {
    const { executeFeedCampaign } = await import('../telegram/services/feedService.js');
    const { Commenter } = await import('../core/commenter.js');
    const { vi } = await import('vitest');

    const executedAccounts = [];
    const spy = vi.spyOn(Commenter, 'postRandomFeedComments').mockImplementation(async (account) => {
      executedAccounts.push(account.id);
      return { success: true, totalCommented: 1 };
    });

    const mockCtx = {
      reply: vi.fn(),
      replyWithMarkdown: vi.fn()
    };

    await executeFeedCampaign(mockCtx, 1, null, 'all');

    expect(spy).toHaveBeenCalled();
    expect(executedAccounts.length).toBeGreaterThan(0);
    spy.mockRestore();
  });

  it('should register REELSCUSTOM and FEEDCUSTOM actions and handle custom count input', async () => {
    const { registerCampaignHandlers } = await import('../telegram/handlers/campaigns.js');
    const { userStates } = await import('../telegram/state.js');
    const registeredActions = new Map();

    const mockBot = {
      action: (pattern, handler) => {
        registeredActions.set(pattern.toString(), handler);
      },
      hears: () => {},
      command: () => {}
    };

    registerCampaignHandlers(mockBot);

    // Verify regex actions exist
    const hasReelsCustom = Array.from(registeredActions.keys()).some(k => k.includes('REELSCUSTOM'));
    const hasFeedCustom = Array.from(registeredActions.keys()).some(k => k.includes('FEEDCUSTOM'));

    expect(hasReelsCustom).toBe(true);
    expect(hasFeedCustom).toBe(true);

    // Test invoking REELSCUSTOM handler
    const reelsCustomKey = Array.from(registeredActions.keys()).find(k => k.includes('REELSCUSTOM'));
    const reelsHandler = registeredActions.get(reelsCustomKey);

    const mockCtx = {
      match: ['REELSCUSTOM_acc_01', 'acc_01'],
      from: { id: 999999 },
      answerCbQuery: async () => {},
      reply: async () => {}
    };

    await reelsHandler(mockCtx);

    const state = userStates.get(999999);
    expect(state).toBeDefined();
    expect(state.state).toBe('AWAITING_REELS_CUSTOM_COUNT');
    expect(state.targetAccountId).toBe('acc_01');
    userStates.delete(999999);
  });

  it('should flag limited accounts with 🛑 in buildAccountPickerKeyboard', async () => {
    const { buildAccountPickerKeyboard } = await import('../telegram/handlers/campaigns.js');

    const accounts = [
      { id: 'acc_01', username: 'adrianwalker@yopmail.com', isLimited: true },
      { id: 'acc_02', username: 'ayusekar@yopmail.com', isLimited: false }
    ];

    const keyboard = buildAccountPickerKeyboard('REELSACC', accounts);
    const buttons = keyboard.reply_markup.inline_keyboard.flat();

    const limitedBtn = buttons.find(b => b.callback_data === 'REELSACC_acc_01');
    const normalBtn = buttons.find(b => b.callback_data === 'REELSACC_acc_02');

    expect(limitedBtn).toBeDefined();
    expect(limitedBtn.text).toContain('🛑');
    expect(limitedBtn.text).toContain('LIMIT KOMENTAR');

    expect(normalBtn).toBeDefined();
    expect(normalBtn.text).toContain('🟢');
  });
});
