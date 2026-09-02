import { CommentGuard } from './common/commentGuard.js';
import { CommentParser } from './common/commentParser.js';
import { ReelsCommenter } from './reels/reelsCommenter.js';
import { FeedCommenter } from './feed/feedCommenter.js';
import { TargetCommenter } from './target/targetCommenter.js';

/**
 * Façade Utama Commenter Facebook
 * Menyediakan antarmuka terpadu untuk CLI dan Telegram Bot,
 * mendelegasikan tugas ke modul spesifik (Reels, Feed, Target, Guard, Parser).
 */
export class Commenter {
  // ================= Common & Guard =================
  static async ensureLoggedIn(account, context, page) {
    return CommentGuard.ensureLoggedIn(account, context, page);
  }

  static async closePostModalIfOpen(page) {
    return CommentGuard.closePostModalIfOpen(page);
  }

  static async checkIsActionBlocked(page) {
    return CommentGuard.checkIsActionBlocked(page);
  }

  static async verifyCommentSubmitted(page, targetCommentBox, commentText) {
    return CommentGuard.verifyCommentSubmitted(page, targetCommentBox, commentText);
  }

  static parseCommentCountString(str) {
    return CommentParser.parseCommentCountString(str);
  }

  // ================= Facebook Reels =================
  static async ensureReelCommentDrawerOpen(page) {
    return ReelsCommenter.ensureReelCommentDrawerOpen(page);
  }

  static async checkIfAlreadyCommentedOnReel(page) {
    return ReelsCommenter.checkIfAlreadyCommentedOnReel(page);
  }

  static async getReelCommentCount(page) {
    return ReelsCommenter.getReelCommentCount(page);
  }

  static async goToNextReel(page) {
    return ReelsCommenter.goToNextReel(page);
  }

  static async postRandomReelsComments(account, options = {}) {
    return ReelsCommenter.postRandomReelsComments(account, options);
  }

  static async runRandomReelsCampaign(accounts, options = {}) {
    return ReelsCommenter.runRandomReelsCampaign(accounts, options);
  }

  // ================= Beranda / Feed =================
  static async executeCommentOnNextFeedPost(page, commentText, processedSet, minDelay, maxDelay, onProgress, accountId = '', options = {}) {
    return FeedCommenter.executeCommentOnNextFeedPost(page, commentText, processedSet, minDelay, maxDelay, onProgress, accountId, options);
  }

  static async postRandomFeedComments(account, options = {}) {
    return FeedCommenter.postRandomFeedComments(account, options);
  }

  static async runRandomFeedCampaign(accounts, options = {}) {
    return FeedCommenter.runRandomFeedCampaign(accounts, options);
  }

  // ================= Target URL Spesifik =================
  static async postComment(account, target, options = {}) {
    return TargetCommenter.postComment(account, target, options);
  }

  static async runCampaign(accounts, targets, options = {}) {
    return TargetCommenter.runCampaign(accounts, targets, options);
  }
}

// Re-export semua modul modular untuk impor langsung
export {
  CommentGuard,
  CommentParser,
  ReelsCommenter,
  FeedCommenter,
  TargetCommenter
};
