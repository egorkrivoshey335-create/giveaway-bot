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
 * Extracts user from session cookie without throwing
 * Returns null if not authenticated
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
 * Requires authenticated user, sends 401 if not authenticated
 * Returns user info or null (after sending response)
 */
export async function requireUser(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<AuthUser | null> {
  const user = await getUser(request);

  if (!user) {
    // Clear potentially invalid cookie
    reply.clearCookie(config.auth.cookieName, getSessionCookieOptions());
    reply.status(401).send({ ok: false, error: 'Not authenticated' });
    return null;
  }

  return user;
}
