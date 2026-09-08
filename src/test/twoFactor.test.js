import { describe, it, expect } from 'vitest';
import { generate2FACode } from '../utils/twoFactor.js';

describe('Two-Factor Authentication (TOTP)', () => {
  const standardSecret = 'JBSWY3DPEHPK3PXP'; // Standard RFC 6238 Base32 test vector

  it('should generate a 6-digit numeric OTP code from a valid secret', () => {
    const code = generate2FACode(standardSecret);
    expect(code).toBeDefined();
    expect(code).toHaveLength(6);
    expect(/^\d{6}$/.test(code)).toBe(true);
  });

  it('should sanitize lowercase and spaces in secrets', () => {
    const dirtySecret = '  jbsw y3dp ehpk 3pxp  ';
    const code = generate2FACode(dirtySecret);
    expect(code).toBeDefined();
    expect(code).toHaveLength(6);
    expect(/^\d{6}$/.test(code)).toBe(true);
  });

  it('should return null when secret is empty, null, or undefined', () => {
    expect(generate2FACode('')).toBeNull();
    expect(generate2FACode(null)).toBeNull();
    expect(generate2FACode(undefined)).toBeNull();
  });

  it('should return null safely for invalid Base32 characters without throwing uncaught error', () => {
    const invalidSecret = '189192!@#$$%%!@#INVALID_BASE_32';
    const code = generate2FACode(invalidSecret);
    expect(code).toBeNull();
  });
});
