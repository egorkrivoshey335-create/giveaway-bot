import type { FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '@randombeast/database';
import { config } from '../config.js';
import { verifySessionToken, getSessionCookieOptions } from '../utils/session.js';

/**
 * User info attached to authenticated requests
 */
export interface AuthUser {
  id: string;
  telegramUserId: bigint;
  firstName: string | null;
  lastName: string | null;
  username: string | null;
  language: 'RU' | 'EN' | 'KK';
  isPremium: boolean;
  createdAt: Date;
}

/**
 * Extracts user from session cookie without throwing.
 * Returns null if not authenticated.
 * Does NOT check SystemBan — use requireUser() for that.
 */
export async function getUser(request: FastifyRequest): Promise<AuthUser | null> {
  const sessionToken = request.cookies[config.auth.cookieName];

  if (!sessionToken) {
    return null;
  }

  const userId = verifySessionToken(sessionToken);

  if (!userId) {
    return null;
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      telegramUserId: true,
      firstName: true,
      lastName: true,
      username: true,
      language: true,
      isPremium: true,
      createdAt: true,
    },
  });

  return user;
}

/**
 * Requires authenticated user.
 * Sends 401 if not authenticated.
 * Sends 403 with ACCOUNT_BANNED if user is in SystemBan.
 * Automatically clears expired bans.
 *
 * Returns user info or null (after sending response).
 */
export async function requireUser(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<AuthUser | null> {
  const user = await getUser(request);

  if (!user) {
    reply.clearCookie(config.auth.cookieName, getSessionCookieOptions());
    reply.status(401).send({ ok: false, error: 'Not authenticated' });
    return null;
  }

  // === 17.4 SystemBan: проверка на каждом авторизованном запросе ===
  const ban = await prisma.systemBan.findUnique({
    where: { userId: user.id },
  });

  if (ban) {
    // Проверяем не истёк ли бан (expiresAt = null → перманентный)
    if (ban.expiresAt && ban.expiresAt < new Date()) {
      // Бан истёк — автоматически удаляем
      await prisma.systemBan.delete({ where: { userId: user.id } }).catch(() => {});
    } else {
      // Бан активен
      reply.status(403).send({
        ok: false,
        error: 'ACCOUNT_BANNED',
        message: 'Ваш аккаунт заблокирован. Обратитесь в поддержку @Cosmolex_bot',
        expiresAt: ban.expiresAt?.toISOString() || null,
      });
      return null;
    }
  }

  return user;
}
