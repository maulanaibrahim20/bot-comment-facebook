import { describe, it, expect } from 'vitest';
import { parseSpintax, generateVariations } from '../utils/spintax.js';

describe('Spintax Generator', () => {
  describe('parseSpintax', () => {
    it('should parse simple spintax options correctly', () => {
      const template = '{Halo|Hai|Permisi} kak!';
      const result = parseSpintax(template);
      expect(['Halo kak!', 'Hai kak!', 'Permisi kak!']).toContain(result);
      expect(result).not.toContain('{');
      expect(result).not.toContain('}');
      expect(result).not.toContain('|');
    });

    it('should parse nested spintax correctly without leaving braces', () => {
      const template = '{Halo {kak|gan}|Hai {bro|sis}}, {mantap {banget|sekali}|luar biasa}!';
      for (let i = 0; i < 20; i++) {
        const result = parseSpintax(template);
        expect(result).not.toMatch(/[{}]/);
        expect(result).not.toContain('|');
        expect(result.length).toBeGreaterThan(0);
      }
    });

    it('should handle deeply nested spintax', () => {
      const template = '{A|{B|{C|D}}}';
      const possible = ['A', 'B', 'C', 'D'];
      const result = parseSpintax(template);
      expect(possible).toContain(result);
    });

    it('should return plain text as-is when no spintax is present', () => {
      const plain = 'Halo selamat pagi dunia!';
      expect(parseSpintax(plain)).toBe(plain);
    });

    it('should handle empty or whitespace string', () => {
      expect(parseSpintax('')).toBe('');
      expect(parseSpintax('   ')).toBe('');
    });

    it('should handle null or undefined safely', () => {
      expect(parseSpintax(null)).toBe('');
      expect(parseSpintax(undefined)).toBe('');
    });
  });

  describe('generateVariations', () => {
    it('should generate the specified number of variations', () => {
      const template = '{Halo|Hai|Permisi} kak, {keren|mantap|hebat}!';
      const variations = generateVariations(template, 3);
      expect(variations).toHaveLength(3);
      variations.forEach((v) => {
        expect(v).not.toMatch(/[{}]/);
        expect(v.length).toBeGreaterThan(0);
      });
    });

    it('should return unique variations when possible', () => {
      const template = '{Halo|Hai|Permisi|Selamat pagi|Salam kenal} dunia!';
      const variations = generateVariations(template, 4);
      expect(new Set(variations).size).toBeGreaterThan(1);
    });

    it('should handle count of 0 or negative gracefully', () => {
      const template = '{Halo|Hai}';
      expect(generateVariations(template, 0)).toEqual([]);
      expect(generateVariations(template, -1)).toEqual([]);
    });

    it('should handle empty template', () => {
      expect(generateVariations('', 3)).toEqual([]);
    });
  });
});
