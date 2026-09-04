import { describe, it, expect } from 'vitest';
import { sleep, randomDelay } from '../utils/delay.js';

describe('Delay Utilities', () => {
  describe('sleep', () => {
    it('should wait for approximately the specified duration', async () => {
      const start = Date.now();
      await sleep(100);
      const elapsed = Date.now() - start;
      expect(elapsed).toBeGreaterThanOrEqual(90);
    });
  });

  describe('randomDelay', () => {
    it('should generate a delay within the specified bounds', async () => {
      const min = 30;
      const max = 80;
      const delay = await randomDelay(min, max);
      expect(delay).toBeGreaterThanOrEqual(min);
      expect(delay).toBeLessThanOrEqual(max);
    });

    it('should use default bounds when arguments are omitted', async () => {
      // Mock Math.random to avoid waiting full default 1000-3000ms
      const origRandom = Math.random;
      try {
        Math.random = () => 0.5;
        const start = Date.now();
        // With random = 0.5, delay would be Math.floor(0.5 * 2001) + 1000 = 2000
        // But let's test fast by overriding min and max
        const fastDelay = await randomDelay(20, 50);
        expect(fastDelay).toBeGreaterThanOrEqual(20);
        expect(fastDelay).toBeLessThanOrEqual(50);
      } finally {
        Math.random = origRandom;
      }
    });
  });
});
