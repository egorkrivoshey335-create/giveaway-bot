import { describe, it, expect, vi, beforeEach } from 'vitest';

// Мокируем config до импорта session (config читает env)
vi.mock('../config.js', () => ({
  config: {
    auth: {
      sessionSecret: 'test_secret_at_least_32_characters_long_for_tests',
      cookieDomain: undefined,
      cookieName: 'rb_session',
      initDataExpiresIn: 3600,
    },
    isDev: true,
    port: 4000,
    host: '0.0.0.0',
  },
  isUserAllowed: () => true,
  requireTmaBotToken: () => 'test_bot_token',
}));

import { createSessionToken, verifySessionToken } from '../utils/session.js';

describe('Session tokens', () => {
  const TEST_USER_ID = 'user_abc123';

  describe('createSessionToken', () => {
    it('creates a token with two parts separated by dot', () => {
      const token = createSessionToken(TEST_USER_ID);
      const parts = token.split('.');
      expect(parts).toHaveLength(2);
      expect(parts[0].length).toBeGreaterThan(0);
      expect(parts[1].length).toBeGreaterThan(0);
    });

    it('creates different tokens on each call (different timestamps)', async () => {
      const t1 = createSessionToken(TEST_USER_ID);
      // Ждём 1мс чтобы timestamp отличался
      await new Promise(r => setTimeout(r, 1));
      const t2 = createSessionToken(TEST_USER_ID);
      // Payload будет немного другим (разный createdAt)
      // Сигнатуры тоже разные
      expect(t1).not.toBe(t2);
    });

    it('encodes userId in payload', () => {
      const token = createSessionToken(TEST_USER_ID);
      const [payloadB64] = token.split('.');
      const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf-8'));
      expect(payload.userId).toBe(TEST_USER_ID);
    });

    it('encodes createdAt timestamp in payload', () => {
      const before = Date.now();
      const token = createSessionToken(TEST_USER_ID);
      const after = Date.now();
      const [payloadB64] = token.split('.');
      const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf-8'));
      expect(payload.createdAt).toBeGreaterThanOrEqual(before);
      expect(payload.createdAt).toBeLessThanOrEqual(after);
    });
  });

  describe('verifySessionToken', () => {
    it('returns userId for a valid token', () => {
      const token = createSessionToken(TEST_USER_ID);
      const result = verifySessionToken(token);
      expect(result).toBe(TEST_USER_ID);
    });

    it('returns null for empty string', () => {
      expect(verifySessionToken('')).toBeNull();
    });

    it('returns null for token without dot separator', () => {
      expect(verifySessionToken('invalidtoken')).toBeNull();
    });

    it('returns null for tampered payload', () => {
      const token = createSessionToken(TEST_USER_ID);
      const [, signature] = token.split('.');
      // Создаём фейковый payload с другим userId
      const fakePayload = Buffer.from(
        JSON.stringify({ userId: 'attacker', createdAt: Date.now() })
      ).toString('base64url');
      const tamperedToken = `${fakePayload}.${signature}`;
      expect(verifySessionToken(tamperedToken)).toBeNull();
    });

    it('returns null for tampered signature', () => {
      const token = createSessionToken(TEST_USER_ID);
      const [payload] = token.split('.');
      const tamperedToken = `${payload}.fakesignaturexxx`;
      expect(verifySessionToken(tamperedToken)).toBeNull();
    });

    it('returns null for expired token (30+ days old)', async () => {
      const OLD_TIMESTAMP = Date.now() - 31 * 24 * 60 * 60 * 1000; // 31 day ago
      const { createHmac } = await import('node:crypto');
      const secret = 'test_secret_at_least_32_characters_long_for_tests';

      const oldPayload = Buffer.from(
        JSON.stringify({ userId: TEST_USER_ID, createdAt: OLD_TIMESTAMP })
      ).toString('base64url');
      const sig = createHmac('sha256', secret).update(oldPayload).digest('base64url');
      const expiredToken = `${oldPayload}.${sig}`;

      expect(verifySessionToken(expiredToken)).toBeNull();
    });

    it('returns null for completely invalid base64', () => {
      expect(verifySessionToken('!!!.!!!')).toBeNull();
    });

    it('returns null for valid structure but JSON parse failure', async () => {
      const { createHmac } = await import('node:crypto');
      const secret = 'test_secret_at_least_32_characters_long_for_tests';
      const notJson = Buffer.from('not-json').toString('base64url');
      const sig = createHmac('sha256', secret).update(notJson).digest('base64url');
      expect(verifySessionToken(`${notJson}.${sig}`)).toBeNull();
    });
  });

  describe('round-trip', () => {
    it('verify(create(userId)) === userId for various IDs', () => {
      const ids = [
        'user_123',
        'abc-def-ghi',
        'a'.repeat(100),
        '🔥emoji🔥',
      ];
      for (const id of ids) {
        const token = createSessionToken(id);
        expect(verifySessionToken(token)).toBe(id);
      }
    });
  });
});
