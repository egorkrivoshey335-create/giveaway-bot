import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma } from '@randombeast/database';
import { TIER_LIMITS } from '@randombeast/shared';
import { requireUser } from '../plugins/auth.js';
import { config } from '../config.js';

/**
 * Определяем tier пользователя по его entitlements
 * Простой подход: проверяем наличие entitlement с кодом tier.*
 */
async function getUserTier(userId: string): Promise<'FREE' | 'PLUS' | 'PRO' | 'BUSINESS'> {
  const entitlements = await prisma.entitlement.findMany({
    where: {
      userId,
      revokedAt: null,
      cancelledAt: null,
      OR: [
        { expiresAt: null },
        { expiresAt: { gt: new Date() } },
      ],
    },
    select: { code: true },
  });

  const codes = entitlements.map(e => e.code);

  if (codes.includes('tier.business')) return 'BUSINESS';
  if (codes.includes('tier.pro')) return 'PRO';
  if (codes.includes('tier.plus')) return 'PLUS';
  return 'FREE';
}

export const trackingLinksRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * POST /giveaways/:id/tracking-links
   * Создать трекинг-ссылку для розыгрыша
   */
  fastify.post<{ Params: { id: string } }>(
    '/giveaways/:id/tracking-links',
    async (request, reply) => {
      const user = await requireUser(request, reply);
      if (!user) return;

      const { id: giveawayId } = request.params;

      const bodySchema = z.object({
        tag: z.string()
          .min(1, 'Тег обязателен')
          .max(50, 'Максимум 50 символов')
          .regex(/^[a-zA-Z0-9_-]+$/, 'Только латиница, цифры, _ и -'),
      });

      const parsed = bodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.badRequest('Ошибка валидации', parsed.error.errors.map(e => ({
          field: e.path.join('.'),
          message: e.message,
        })));
      }

      const { tag } = parsed.data;

      // Проверяем владение розыгрышем
      const giveaway = await prisma.giveaway.findFirst({
        where: { id: giveawayId, ownerUserId: user.id },
        select: { id: true, shortCode: true, status: true },
      });

      if (!giveaway) {
        return reply.notFound('Розыгрыш не найден');
      }

      // Проверяем лимит по тиру
      const tier = await getUserTier(user.id);
      const maxLinks = TIER_LIMITS.maxTrackingLinks[tier];

      const currentCount = await prisma.trackingLink.count({
        where: { giveawayId },
      });

      if (currentCount >= maxLinks) {
        return reply.forbidden(
          `Достигнут лимит трекинг-ссылок для тарифа ${tier}: ${maxLinks}`
        );
      }

      // Проверяем уникальность тега для этого розыгрыша
      const existing = await prisma.trackingLink.findUnique({
        where: { giveawayId_tag: { giveawayId, tag } },
      });

      if (existing) {
        return reply.conflict(`Тег "${tag}" уже используется для этого розыгрыша`);
      }

      // Генерируем URL (используем webappUrl из конфига)
      const baseUrl = config.webappUrl;
      const url = giveaway.shortCode
        ? `${baseUrl}/g/${giveaway.shortCode}?src=${tag}`
        : `${baseUrl}/giveaway/${giveawayId}?src=${tag}`;

      const trackingLink = await prisma.trackingLink.create({
        data: {
          giveawayId,
          tag,
          url,
        },
      });

      return reply.success({
        id: trackingLink.id,
        tag: trackingLink.tag,
        url: trackingLink.url,
        clicks: trackingLink.clicks,
        joins: trackingLink.joins,
        createdAt: trackingLink.createdAt.toISOString(),
      });
    }
  );

  /**
   * GET /giveaways/:id/tracking-links
   * Список трекинг-ссылок розыгрыша
   */
  fastify.get<{ Params: { id: string } }>(
    '/giveaways/:id/tracking-links',
    async (request, reply) => {
      const user = await requireUser(request, reply);
      if (!user) return;

      const { id: giveawayId } = request.params;

      // Проверяем владение
      const giveaway = await prisma.giveaway.findFirst({
        where: { id: giveawayId, ownerUserId: user.id },
        select: { id: true },
      });

      if (!giveaway) {
        return reply.notFound('Розыгрыш не найден');
      }

      const links = await prisma.trackingLink.findMany({
        where: { giveawayId },
        orderBy: { createdAt: 'desc' },
      });

      return reply.success({
        items: links.map(link => ({
          id: link.id,
          tag: link.tag,
          url: link.url,
          clicks: link.clicks,
          joins: link.joins,
          conversionRate: link.clicks > 0 ? Number((link.joins / link.clicks * 100).toFixed(1)) : 0,
          createdAt: link.createdAt.toISOString(),
        })),
        total: links.length,
      });
    }
  );

  /**
   * DELETE /giveaways/:id/tracking-links/:linkId
   * Удалить трекинг-ссылку
   */
  fastify.delete<{ Params: { id: string; linkId: string } }>(
    '/giveaways/:id/tracking-links/:linkId',
    async (request, reply) => {
      const user = await requireUser(request, reply);
      if (!user) return;

      const { id: giveawayId, linkId } = request.params;

      // Проверяем владение розыгрышем
      const giveaway = await prisma.giveaway.findFirst({
        where: { id: giveawayId, ownerUserId: user.id },
        select: { id: true },
      });

      if (!giveaway) {
        return reply.notFound('Розыгрыш не найден');
      }

      // Проверяем существование ссылки
      const link = await prisma.trackingLink.findFirst({
        where: { id: linkId, giveawayId },
      });

      if (!link) {
        return reply.notFound('Трекинг-ссылка не найдена');
      }

      await prisma.trackingLink.delete({
        where: { id: linkId },
      });

      fastify.log.info({ giveawayId, linkId, tag: link.tag }, 'Tracking link deleted');

      return reply.success({ deleted: true });
    }
  );
};
