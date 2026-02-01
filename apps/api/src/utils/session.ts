import { createHmac, timingSafeEqual } from 'node:crypto';
import { config } from '../config.js';

interface SessionPayload {
  userId: string;
  createdAt: number;
}

/**
 * Creates a signed session token
 * Format: base64url(payload).base64url(signature)
 */
export function createSessionToken(userId: string): string {
  const payload: SessionPayload = {
    userId,
    createdAt: Date.now(),
  };

  const payloadBase64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = createHmac('sha256', config.auth.sessionSecret)
    .update(payloadBase64)
    .digest('base64url');

  return `${payloadBase64}.${signature}`;
}

/**
 * Verifies and decodes a session token
 * Returns the userId if valid, null otherwise
 */
export function verifySessionToken(token: string): string | null {
  try {
    const [payloadBase64, signature] = token.split('.');

    if (!payloadBase64 || !signature) {
      return null;
    }

    // Verify signature
    const expectedSignature = createHmac('sha256', config.auth.sessionSecret)
      .update(payloadBase64)
      .digest('base64url');

    const signatureBuffer = Buffer.from(signature, 'base64url');
    const expectedBuffer = Buffer.from(expectedSignature, 'base64url');

    if (signatureBuffer.length !== expectedBuffer.length) {
      return null;
    }

    if (!timingSafeEqual(signatureBuffer, expectedBuffer)) {
      return null;
    }

    // Decode payload
    const payloadJson = Buffer.from(payloadBase64, 'base64url').toString('utf-8');
    const payload: SessionPayload = JSON.parse(payloadJson);

    // Check if token is not too old (30 days max)
    const maxAge = 30 * 24 * 60 * 60 * 1000; // 30 days in ms
    if (Date.now() - payload.createdAt > maxAge) {
      return null;
    }

    return payload.userId;
  } catch {
    return null;
  }
}

/**
 * Cookie options for session cookie
 */
export function getSessionCookieOptions() {
  return {
    httpOnly: true,
    secure: !config.isDev,
    sameSite: 'lax' as const,
    path: '/',
    domain: config.auth.cookieDomain,
    maxAge: 30 * 24 * 60 * 60, // 30 days in seconds
  };
}
