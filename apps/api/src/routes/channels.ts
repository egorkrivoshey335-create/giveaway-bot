import type { FastifyPluginAsync } from 'fastify';
import { prisma } from '@randombeast/database';
import { requireUser } from '../plugins/auth.js';
import { config } from '../config.js';

interface ChannelResponse {
  id: string;
  telegramChatId: string;
  username: string | null;
  title: string;
  type: string;
  botIsAdmin: boolean;
  creatorIsAdmin: boolean;
  memberCount: number | null;
  lastCheckedAt: string | null;
  createdAt: string;
}

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
}): ChannelResponse {
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

    return reply.send({
      ok: true,
      channels: channels.map(serializeChannel),
    });
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
      return reply.status(404).send({
        ok: false,
        error: 'Channel not found',
      });
    }

    return reply.send({
      ok: true,
      channel: serializeChannel(channel),
    });
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
      return reply.status(404).send({
        ok: false,
        error: 'Channel not found',
      });
    }

    await prisma.channel.delete({
      where: { id },
    });

    fastify.log.info({ userId: user.id, channelId: id }, 'Channel deleted');

    return reply.send({ ok: true });
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
      return reply.status(404).send({
        ok: false,
        error: 'Channel not found',
      });
    }

    const botToken = config.botToken;
    if (!botToken) {
      return reply.status(500).send({
        ok: false,
        error: 'Bot not configured',
      });
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

    return reply.send({
      ok: true,
      channel: serializeChannel(updatedChannel),
    });
  });
};
