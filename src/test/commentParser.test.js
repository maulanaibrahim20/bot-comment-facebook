import { describe, it, expect } from 'vitest';
import { CommentParser } from '../core/common/commentParser.js';
import { Commenter } from '../core/commenter.js';

describe('CommentParser', () => {
  describe('CommentParser.parseCommentCountString', () => {
    it('should parse plain numbers', () => {
      expect(CommentParser.parseCommentCountString('0')).toBe(0);
      expect(CommentParser.parseCommentCountString('56')).toBe(56);
      expect(CommentParser.parseCommentCountString('120 komentar')).toBe(120);
      expect(CommentParser.parseCommentCountString('999 comments')).toBe(999);
    });

    it('should parse Indonesian abbreviations (rb, ribu, jt, juta)', () => {
      expect(CommentParser.parseCommentCountString('1,5 rb')).toBe(1500);
      expect(CommentParser.parseCommentCountString('1.5 rb')).toBe(1500);
      expect(CommentParser.parseCommentCountString('2 rb komentar')).toBe(2000);
      expect(CommentParser.parseCommentCountString('10 ribu komentar')).toBe(10000);
      expect(CommentParser.parseCommentCountString('1 jt')).toBe(1000000);
      expect(CommentParser.parseCommentCountString('2,5 juta')).toBe(2500000);
    });

    it('should parse English abbreviations (k, m, b)', () => {
      expect(CommentParser.parseCommentCountString('2.4k')).toBe(2400);
      expect(CommentParser.parseCommentCountString('10k comments')).toBe(10000);
      expect(CommentParser.parseCommentCountString('1.2m')).toBe(1200000);
      expect(CommentParser.parseCommentCountString('1b')).toBe(1000000000);
    });

    it('should return null for invalid or empty strings', () => {
      expect(CommentParser.parseCommentCountString('')).toBeNull();
      expect(CommentParser.parseCommentCountString(null)).toBeNull();
      expect(CommentParser.parseCommentCountString(undefined)).toBeNull();
      expect(CommentParser.parseCommentCountString('belum ada komentar')).toBeNull();
      expect(CommentParser.parseCommentCountString('abcd')).toBeNull();
    });
  });

  describe('Commenter facade', () => {
    it('should expose parseCommentCountString matching CommentParser', () => {
      expect(Commenter.parseCommentCountString('1,5 rb komentar')).toBe(1500);
      expect(Commenter.parseCommentCountString('2.4k')).toBe(2400);
      expect(Commenter.parseCommentCountString('85 komentar')).toBe(85);
    });

    it('should expose primary campaign execution methods', () => {
      expect(typeof Commenter.postRandomReelsComments).toBe('function');
      expect(typeof Commenter.postRandomFeedComments).toBe('function');
      expect(typeof Commenter.postComment).toBe('function');
    });
  });
});
