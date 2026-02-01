import type { FastifyPluginAsync } from 'fastify';
import { prisma } from '@randombeast/database';
import { requireUser } from '../plugins/auth.js';

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
};
