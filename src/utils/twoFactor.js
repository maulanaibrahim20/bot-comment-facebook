import { authenticator } from 'otplib';
import { logger } from './logger.js';

/**
 * Menghasilkan 6-digit TOTP Token dari 2FA Secret Key
 */
export function generate2FACode(secret) {
  if (!secret) return null;
  try {
    const cleanSecret = secret.replace(/\s+/g, '').toUpperCase();
    return authenticator.generate(cleanSecret);
  } catch (err) {
    logger.error(`Gagal menghasilkan kode 2FA untuk secret "${secret}":`, err);
    return null;
  }
}
