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
});
