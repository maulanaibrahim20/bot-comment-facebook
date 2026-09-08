import { describe, it, expect, vi } from 'vitest';
import { CommentGuard } from '../core/common/commentGuard.js';

describe('CommentGuard', () => {
  describe('checkIsActionBlocked', () => {
    it('should return false when no block dialogs or alerts are present', async () => {
      const mockPage = {
        locator: vi.fn().mockReturnValue({
          first: vi.fn().mockReturnValue({
            isVisible: vi.fn().mockResolvedValue(false),
            click: vi.fn().mockResolvedValue(undefined)
          })
        }),
        $$: vi.fn().mockResolvedValue([])
      };

      const isBlocked = await CommentGuard.checkIsActionBlocked(mockPage);
      expect(isBlocked).toBe(false);
    });

    it('should return true when a known block selector is visible', async () => {
      const mockPage = {
        locator: vi.fn().mockImplementation((selector) => {
          const isTarget = selector.includes('Tindakan Anda Dibatasi') || selector.includes('Action Blocked');
          return {
            first: vi.fn().mockReturnValue({
              isVisible: vi.fn().mockResolvedValue(isTarget),
              click: vi.fn().mockResolvedValue(undefined)
            })
          };
        }),
        $$: vi.fn().mockResolvedValue([])
      };

      const isBlocked = await CommentGuard.checkIsActionBlocked(mockPage);
      expect(isBlocked).toBe(true);
    });

    it('should detect block text inside dialog elements', async () => {
      const mockDialogItem = {
        isVisible: vi.fn().mockResolvedValue(true),
        innerText: vi.fn().mockResolvedValue('Akun Anda dibatasi sementara dari mengirim komentar.'),
        locator: vi.fn().mockReturnValue({
          first: vi.fn().mockReturnValue({
            isVisible: vi.fn().mockResolvedValue(false),
            click: vi.fn().mockResolvedValue(undefined)
          })
        })
      };

      const mockDialogs = {
        count: vi.fn().mockResolvedValue(1),
        nth: vi.fn().mockReturnValue(mockDialogItem)
      };

      const mockPage = {
        locator: vi.fn().mockImplementation((selector) => {
          if (selector === 'div[role="dialog"], div[role="alertdialog"]') {
            return mockDialogs;
          }
          return {
            first: vi.fn().mockReturnValue({
              isVisible: vi.fn().mockResolvedValue(false),
              click: vi.fn().mockResolvedValue(undefined)
            })
          };
        })
      };

      const isBlocked = await CommentGuard.checkIsActionBlocked(mockPage);
      expect(isBlocked).toBe(true);
    });
  });

  describe('closePostModalIfOpen', () => {
    it('should press Escape and click close button if dialog is visible', async () => {
      const mockCloseBtn = {
        isVisible: vi.fn().mockResolvedValue(true),
        click: vi.fn().mockResolvedValue(undefined)
      };

      const mockDialog = {
        isVisible: vi.fn().mockResolvedValue(true)
      };

      const pressMock = vi.fn().mockResolvedValue(undefined);

      const mockPage = {
        locator: vi.fn().mockImplementation((selector) => {
          if (selector === 'div[role="dialog"]') {
            return { first: vi.fn().mockReturnValue(mockDialog) };
          }
          return { first: vi.fn().mockReturnValue(mockCloseBtn) };
        }),
        keyboard: {
          press: pressMock
        }
      };

      await CommentGuard.closePostModalIfOpen(mockPage);
      expect(pressMock).toHaveBeenCalledWith('Escape');
    });

    it('should do nothing if no dialog is visible', async () => {
      const mockDialog = {
        isVisible: vi.fn().mockResolvedValue(false)
      };

      const pressMock = vi.fn().mockResolvedValue(undefined);

      const mockPage = {
        locator: vi.fn().mockReturnValue({
          first: vi.fn().mockReturnValue(mockDialog)
        }),
        keyboard: {
          press: pressMock
        }
      };

      await CommentGuard.closePostModalIfOpen(mockPage);
      expect(pressMock).not.toHaveBeenCalled();
    });
  });
});
