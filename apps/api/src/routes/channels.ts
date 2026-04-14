import type { FastifyPluginAsync } from 'fastify';
import { prisma, GiveawayStatus, ChannelType } from '@randombeast/database';
import { ErrorCode, TIER_LIMITS } from '@randombeast/shared';
import { requireUser } from '../plugins/auth.js';
import { config } from '../config.js';
import { createAuditLog, AuditAction, AuditEntityType } from '../lib/audit.js';
import { getUserTier } from '../lib/subscription.js';
import { z } from 'zod';

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

const addChannelSchema = z.object({
  username: z.string().regex(/^@?[a-zA-Z0-9_]{4,}$/).optional(),
  chatId: z.union([z.string(), z.number()]).transform(String).optional(),
  type: z.enum(['CHANNEL', 'GROUP']).default('CHANNEL'),
}).refine((d) => d.username || d.chatId, {
  message: 'Either username or chatId is required',
});

export const channelsRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * POST /channels
   * Add a channel from the Mini App by username or chatId
   * Calls Telegram getChat to verify and fetch metadata
   */
  fastify.post('/channels', async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;

    const tier = await getUserTier(user.id);
    const maxChannels = TIER_LIMITS.maxChannels[tier];
    const currentCount = await prisma.channel.count({ where: { addedByUserId: user.id } });
    if (currentCount >= maxChannels) {
      return reply.forbidden(
        `Достигнут лимит каналов для тарифа ${tier}: ${maxChannels}. Повысьте подписку для увеличения лимита.`
      );
    }

    const parsed = addChannelSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.badRequest(parsed.error.errors[0]?.message || 'Invalid request');
    }

    const { username, chatId, type } = parsed.data;
    const botToken = config.botToken;
    if (!botToken) {
      return reply.error(ErrorCode.BOT_API_ERROR, 'Bot not configured');
    }

    const chatIdentifier = chatId || (username ? (username.startsWith('@') ? username : `@${username}`) : null);
    if (!chatIdentifier) {
      return reply.badRequest('Either username or chatId is required');
    }

    // Verify channel via Telegram API
    let chatData: {
      id: number;
      username?: string;
      title: string;
      type: string;
      members_count?: number;
    };

    try {
      const getChatRes = await fetch(`https://api.telegram.org/bot${botToken}/getChat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatIdentifier }),
      });
      const getChatJson = await getChatRes.json() as { ok: boolean; result?: typeof chatData; description?: string };

      if (!getChatJson.ok || !getChatJson.result) {
        return reply.status(422).send({
          success: false,
          error: {
            code: ErrorCode.CHANNEL_NOT_FOUND,
            message: getChatJson.description || 'Channel not found or bot is not a member',
          },
        });
      }
      chatData = getChatJson.result;
    } catch (err) {
      fastify.log.error({ err }, 'Failed to call Telegram getChat');
      return reply.error(ErrorCode.BOT_API_ERROR, 'Failed to verify channel with Telegram');
    }

    const telegramChatId = BigInt(chatData.id);

    // Check bot admin status
    let botIsAdmin = false;
    let botId: number | null = null;
    try {
      const getMeRes = await fetch(`https://api.telegram.org/bot${botToken}/getMe`);
      const getMeJson = await getMeRes.json() as { ok: boolean; result?: { id: number } };
      if (getMeJson.ok && getMeJson.result) {
        botId = getMeJson.result.id;
        const memberRes = await fetch(`https://api.telegram.org/bot${botToken}/getChatMember`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: chatData.id, user_id: botId }),
        });
        const memberJson = await memberRes.json() as { ok: boolean; result?: { status: string } };
        if (memberJson.ok && memberJson.result) {
          botIsAdmin = ['administrator', 'creator'].includes(memberJson.result.status);
        }
      }
    } catch {
      // Non-critical
    }

    // Check user admin status
    let creatorIsAdmin = false;
    try {
      const memberRes = await fetch(`https://api.telegram.org/bot${botToken}/getChatMember`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatData.id, user_id: user.telegramUserId.toString() }),
      });
      const memberJson = await memberRes.json() as { ok: boolean; result?: { status: string } };
      if (memberJson.ok && memberJson.result) {
        creatorIsAdmin = ['administrator', 'creator'].includes(memberJson.result.status);
      }
    } catch {
      // Non-critical
    }

    // Determine channel type
    const channelType: ChannelType = type === 'GROUP' ? ChannelType.GROUP : ChannelType.CHANNEL;

    // Upsert channel
    const channel = await prisma.channel.upsert({
      where: { telegramChatId },
      update: {
        title: chatData.title,
        username: chatData.username || null,
        botIsAdmin,
        creatorIsAdmin,
        memberCount: chatData.members_count || null,
        lastCheckedAt: new Date(),
      },
      create: {
        telegramChatId,
        title: chatData.title,
        username: chatData.username || null,
        type: channelType,
        botIsAdmin,
        creatorIsAdmin,
        memberCount: chatData.members_count || null,
        addedByUserId: user.id,
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

    fastify.log.info({ userId: user.id, channelId: channel.id, chatId: chatData.id }, 'Channel added from Mini App');

    await createAuditLog({
      userId: user.id,
      action: AuditAction.CHANNEL_ADDED,
      entityType: AuditEntityType.CHANNEL,
      entityId: channel.id,
      metadata: { title: channel.title, telegramChatId: chatData.id.toString() },
      request,
    });

    return reply.success(serializeChannel(channel));
  });

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

    return reply.success({ channels: channels.map(serializeChannel) });
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
