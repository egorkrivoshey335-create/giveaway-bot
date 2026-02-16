import type { FastifyPluginAsync } from 'fastify';
import { prisma, GiveawayStatus } from '@randombeast/database';
import { ErrorCode } from '@randombeast/shared';
import { requireUser } from '../plugins/auth.js';
import { config } from '../config.js';
import { createAuditLog, AuditAction, AuditEntityType } from '../lib/audit.js';

function serializeChannel(channel: {
  id: string;
  telegramChatId: bigint;
  username: string | null;
  title: string;
  type: string;
  botIsAdmin: boolean;
  creatorIsAdmin: boolean;
  memberCount: number | null;
  lastCheckedAt: Date | null;
  createdAt: Date;
}) {
  return {
    id: channel.id,
    telegramChatId: channel.telegramChatId.toString(),
    username: channel.username,
    title: channel.title,
    type: channel.type,
    botIsAdmin: channel.botIsAdmin,
    creatorIsAdmin: channel.creatorIsAdmin,
    memberCount: channel.memberCount,
    lastCheckedAt: channel.lastCheckedAt?.toISOString() || null,
    createdAt: channel.createdAt.toISOString(),
  };
}

export const channelsRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * GET /channels
   * Returns all channels added by the current user
   */
  fastify.get('/channels', async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;

    const channels = await prisma.channel.findMany({
      where: { addedByUserId: user.id },
      select: {
        id: true,
        telegramChatId: true,
        username: true,
        title: true,
        type: true,
        botIsAdmin: true,
        creatorIsAdmin: true,
        memberCount: true,
        lastCheckedAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return reply.success(channels.map(serializeChannel));
  });

  /**
   * GET /channels/:id
   * Returns a specific channel by ID
   */
  fastify.get<{ Params: { id: string } }>('/channels/:id', async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;

    const { id } = request.params;

    const channel = await prisma.channel.findFirst({
      where: {
        id,
        addedByUserId: user.id,
      },
      select: {
        id: true,
        telegramChatId: true,
        username: true,
        title: true,
        type: true,
        botIsAdmin: true,
        creatorIsAdmin: true,
        memberCount: true,
        lastCheckedAt: true,
        createdAt: true,
      },
    });

    if (!channel) {
      return reply.notFound('Channel not found');
    }

    return reply.success(serializeChannel(channel));
  });

  /**
   * DELETE /channels/:id
   * Removes a channel from user's list
   */
  fastify.delete<{ Params: { id: string } }>('/channels/:id', async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;

    const { id } = request.params;

    const channel = await prisma.channel.findFirst({
      where: {
        id,
        addedByUserId: user.id,
      },
    });

    if (!channel) {
      return reply.notFound('Channel not found');
    }

    // 🔒 ЗАДАЧА 7.9: Проверяем активные розыгрыши с этим каналом
    const activeGiveaways = await prisma.giveaway.findMany({
      where: {
        ownerUserId: user.id,
        status: {
          in: [GiveawayStatus.ACTIVE, GiveawayStatus.SCHEDULED],
        },
        OR: [
          // Проверяем в draftPayload.publishToChannelIds
          {
            draftPayload: {
              path: ['publishToChannelIds'],
              array_contains: id,
            },
          },
          // Проверяем в draftPayload.requiredSubscriptionChannelIds
          {
            draftPayload: {
              path: ['requiredSubscriptionChannelIds'],
              array_contains: id,
            },
          },
          // Проверяем в draftPayload.resultsToChannelIds
          {
            draftPayload: {
              path: ['resultsToChannelIds'],
              array_contains: id,
            },
          },
        ],
      },
      select: {
        id: true,
        title: true,
        status: true,
      },
    });

    if (activeGiveaways.length > 0) {
      return reply.status(409).send({
        success: false,
        error: {
          code: ErrorCode.CHANNEL_IN_USE,
          message: '⚠️ Канал используется в активных розыгрышах. Удаление невозможно.',
          details: {
            giveaways: activeGiveaways.map(g => ({
              id: g.id,
              title: g.title,
              status: g.status,
            })),
          },
        },
      });
    }

    await prisma.channel.delete({
      where: { id },
    });

    fastify.log.info({ userId: user.id, channelId: id }, 'Channel deleted');

    // 🔒 ЗАДАЧА 7.10: Audit log - удаление канала
    await createAuditLog({
      userId: user.id,
      action: AuditAction.CHANNEL_DELETED,
      entityType: AuditEntityType.CHANNEL,
      entityId: id,
      metadata: {
        channelTitle: channel.title,
        telegramChatId: channel.telegramChatId.toString(),
      },
      request,
    });

    return reply.success({ message: 'Channel deleted successfully' });
  });

  /**
   * POST /channels/:id/recheck
   * Перепроверяет статус канала (права бота и пользователя)
   */
  fastify.post<{ Params: { id: string } }>('/channels/:id/recheck', async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;

    const { id } = request.params;

    const channel = await prisma.channel.findFirst({
      where: {
        id,
        addedByUserId: user.id,
      },
    });

    if (!channel) {
      return reply.notFound('Channel not found');
    }

    const botToken = config.botToken;
    if (!botToken) {
      return reply.error(ErrorCode.BOT_API_ERROR, 'Bot not configured');
    }

    const telegramChatId = channel.telegramChatId.toString();

    // Проверяем статус бота в канале
    let botIsAdmin = false;
    try {
      const botInfoUrl = `https://api.telegram.org/bot${botToken}/getMe`;
      const botInfoRes = await fetch(botInfoUrl);
      const botInfoData = await botInfoRes.json() as { ok: boolean; result?: { id: number } };
      
      if (botInfoData.ok && botInfoData.result) {
        const botId = botInfoData.result.id;
        
        const botMemberUrl = `https://api.telegram.org/bot${botToken}/getChatMember`;
        const botMemberRes = await fetch(botMemberUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: telegramChatId,
            user_id: botId,
          }),
        });
        
        const botMemberData = await botMemberRes.json() as { ok: boolean; result?: { status: string } };
        if (botMemberData.ok && botMemberData.result) {
          botIsAdmin = ['administrator', 'creator'].includes(botMemberData.result.status);
        }
      }
    } catch (error) {
      fastify.log.warn({ channelId: id, error }, 'Failed to check bot admin status');
    }

    // Проверяем статус создателя в канале
    let creatorIsAdmin = false;
    try {
      const creatorMemberUrl = `https://api.telegram.org/bot${botToken}/getChatMember`;
      const creatorMemberRes = await fetch(creatorMemberUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: telegramChatId,
          user_id: user.telegramUserId.toString(),
        }),
      });
      
      const creatorMemberData = await creatorMemberRes.json() as { ok: boolean; result?: { status: string } };
      if (creatorMemberData.ok && creatorMemberData.result) {
        creatorIsAdmin = ['administrator', 'creator'].includes(creatorMemberData.result.status);
      }
    } catch (error) {
      fastify.log.warn({ channelId: id, error }, 'Failed to check creator admin status');
    }

    // Обновляем данные канала
    const updatedChannel = await prisma.channel.update({
      where: { id },
      data: {
        botIsAdmin,
        creatorIsAdmin,
        lastCheckedAt: new Date(),
      },
      select: {
        id: true,
        telegramChatId: true,
        username: true,
        title: true,
        type: true,
        botIsAdmin: true,
        creatorIsAdmin: true,
        memberCount: true,
        lastCheckedAt: true,
        createdAt: true,
      },
    });

    fastify.log.info(
      { userId: user.id, channelId: id, botIsAdmin, creatorIsAdmin },
      'Channel rechecked'
    );

    return reply.success(serializeChannel(updatedChannel));
  });
};
