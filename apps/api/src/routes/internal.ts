import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma, GiveawayStatus, LanguageCode, ChannelType, MediaType, Prisma, GiveawayMessageKind } from '@randombeast/database';
import { POST_LIMITS, POST_TEMPLATE_UNDO_WINDOW_MS } from '@randombeast/shared';
import { ErrorCode } from '@randombeast/shared';
import { config } from '../config.js';
import { getCache, setCache } from '../lib/redis.js';
import { sendAdminNotification } from '../lib/admin-notify.js';

// Schema for giveaway accept
const internalGiveawayAcceptSchema = z.object({
  publishedMessages: z.array(z.object({
    channelId: z.string(),
    telegramMessageId: z.number(),
  })),
});

// Schema for internal draft creation
const internalCreateDraftSchema = z.object({
  telegramUserId: z.union([z.string(), z.number()]).transform((v) => BigInt(v)),
  wizardStep: z.string().optional(),
});

// Schema for channel upsert
const internalChannelUpsertSchema = z.object({
  telegramUserId: z.union([z.string(), z.number()]).transform((v) => BigInt(v)),
  telegramChatId: z.union([z.string(), z.number()]).transform((v) => BigInt(v)),
  username: z.string().nullable().optional(),
  title: z.string(),
  type: z.enum(['CHANNEL', 'GROUP']),
  botIsAdmin: z.boolean(),
  creatorIsAdmin: z.boolean(),
  permissionsSnapshot: z.any().optional(),
  memberCount: z.number().optional(),
});

// Schema for post template creation
const internalPostTemplateCreateSchema = z.object({
  telegramUserId: z.union([z.string(), z.number()]).transform((v) => BigInt(v)),
  text: z.string(),
  mediaType: z.enum(['NONE', 'PHOTO', 'VIDEO']),
  telegramFileId: z.string().optional(),
  telegramFileUniqueId: z.string().optional(),
});

/**
 * Find or create a user by telegram ID
 */
async function findOrCreateUser(telegramUserId: bigint) {
  let user = await prisma.user.findUnique({
    where: { telegramUserId },
  });

  if (!user) {
    user = await prisma.user.create({
      data: {
        telegramUserId,
        language: LanguageCode.RU,
      },
    });
  }

  return user;
}

/**
 * Internal routes for bot -> API communication
 * Protected by X-Internal-Token header
 */
export const internalRoutes: FastifyPluginAsync = async (fastify) => {
  // Verify internal token middleware
  fastify.addHook('preHandler', async (request, reply) => {
    const token = request.headers['x-internal-token'];
    
    if (!token) {
      return reply.unauthorized('Missing internal token');
    }

    // Verify token matches configured internal API token
    if (token !== config.internalApiToken) {
      // In development, also accept any non-empty token for convenience
      if (!config.isDev) {
        return reply.forbidden('Invalid internal token');
      }
    }
  });

  /**
   * POST /internal/drafts/giveaway
   * Creates or gets draft for a user by telegramUserId
   */
  fastify.post('/drafts/giveaway', async (request, reply) => {
    try {
      const body = internalCreateDraftSchema.parse(request.body);
      const user = await findOrCreateUser(body.telegramUserId);

      // Check for existing draft
      const existingDraft = await prisma.giveaway.findFirst({
        where: {
          ownerUserId: user.id,
          status: GiveawayStatus.DRAFT,
        },
        select: {
          id: true,
          wizardStep: true,
          draftPayload: true,
          draftVersion: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      if (existingDraft) {
      return reply.success({
        draft: {
          ...existingDraft,
          createdAt: existingDraft.createdAt.toISOString(),
          updatedAt: existingDraft.updatedAt.toISOString(),
        },
        created: false,
      });
      }

      // Create new draft
      const newDraft = await prisma.giveaway.create({
        data: {
          ownerUserId: user.id,
          status: GiveawayStatus.DRAFT,
          wizardStep: body.wizardStep || 'TYPE',
          draftPayload: {},
          draftVersion: 1,
        },
        select: {
          id: true,
          wizardStep: true,
          draftPayload: true,
          draftVersion: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      fastify.log.info(
        { telegramUserId: body.telegramUserId.toString(), draftId: newDraft.id },
        'Draft created via internal API'
      );

      return reply.success({
        draft: {
          ...newDraft,
          createdAt: newDraft.createdAt.toISOString(),
          updatedAt: newDraft.updatedAt.toISOString(),
        },
        created: true,
      });
    } catch (error) {
      fastify.log.error(error, 'Internal draft creation error');

      if (error instanceof z.ZodError) {
      return reply.badRequest('Invalid request body');
      }

      return reply.error(ErrorCode.INTERNAL_ERROR, 'Internal server error');
    }
  });

  /**
   * POST /internal/channels/upsert
   * Creates or updates a channel, used by bot after verifying permissions
   */
  fastify.post('/channels/upsert', async (request, reply) => {
    try {
      const body = internalChannelUpsertSchema.parse(request.body);
      const user = await findOrCreateUser(body.telegramUserId);

      // Upsert channel by telegramChatId
      const channel = await prisma.channel.upsert({
        where: { telegramChatId: body.telegramChatId },
        update: {
          username: body.username || null,
          title: body.title,
          type: body.type === 'CHANNEL' ? ChannelType.CHANNEL : ChannelType.GROUP,
          botIsAdmin: body.botIsAdmin,
          creatorIsAdmin: body.creatorIsAdmin,
          permissionsSnapshot: body.permissionsSnapshot as Prisma.InputJsonValue || undefined,
          memberCount: body.memberCount,
          lastCheckedAt: new Date(),
          // Note: addedByUserId is not updated on upsert - keeps original adder
        },
        create: {
          telegramChatId: body.telegramChatId,
          username: body.username || null,
          title: body.title,
          type: body.type === 'CHANNEL' ? ChannelType.CHANNEL : ChannelType.GROUP,
          addedByUserId: user.id,
          botIsAdmin: body.botIsAdmin,
          creatorIsAdmin: body.creatorIsAdmin,
          permissionsSnapshot: body.permissionsSnapshot as Prisma.InputJsonValue || undefined,
          memberCount: body.memberCount,
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
        },
      });

      fastify.log.info(
        {
          telegramUserId: body.telegramUserId.toString(),
          channelId: channel.id,
          telegramChatId: channel.telegramChatId.toString(),
        },
        'Channel upserted via internal API'
      );

      return reply.send({
        ok: true,
        channel: {
          ...channel,
          telegramChatId: channel.telegramChatId.toString(),
        },
      });
    } catch (error) {
      fastify.log.error(error, 'Internal channel upsert error');

      if (error instanceof z.ZodError) {
        return reply.status(400).send({
          ok: false,
          error: 'Invalid request body',
          details: error.errors,
        });
      }

      return reply.error(ErrorCode.INTERNAL_ERROR, 'Internal server error');
    }
  });

  /**
   * POST /internal/post-templates/create
   * Creates a new post template
   */
  fastify.post('/post-templates/create', async (request, reply) => {
    try {
      const body = internalPostTemplateCreateSchema.parse(request.body);
      const user = await findOrCreateUser(body.telegramUserId);

      // Validate text length based on media type
      const maxLength = body.mediaType === 'NONE' 
        ? POST_LIMITS.TEXT_MAX_LENGTH 
        : POST_LIMITS.CAPTION_MAX_LENGTH;

      if (body.text.length > maxLength) {
        return reply.status(400).send({
          ok: false,
          error: `Text exceeds ${maxLength} characters limit for ${body.mediaType === 'NONE' ? 'text-only' : 'media'} posts`,
          maxLength,
          currentLength: body.text.length,
        });
      }

      // Validate file_id presence for media posts
      if (body.mediaType !== 'NONE' && !body.telegramFileId) {
        return reply.status(400).send({
          ok: false,
          error: 'telegramFileId is required for media posts',
        });
      }

      // Create post template
      const mediaTypeEnum = body.mediaType === 'PHOTO' 
        ? MediaType.PHOTO 
        : body.mediaType === 'VIDEO' 
          ? MediaType.VIDEO 
          : MediaType.NONE;

      const template = await prisma.postTemplate.create({
        data: {
          ownerUserId: user.id,
          text: body.text,
          mediaType: mediaTypeEnum,
          telegramFileId: body.telegramFileId || null,
          telegramFileUniqueId: body.telegramFileUniqueId || null,
        },
        select: {
          id: true,
          text: true,
          mediaType: true,
          telegramFileId: true,
          createdAt: true,
        },
      });

      fastify.log.info(
        { 
          telegramUserId: body.telegramUserId.toString(), 
          templateId: template.id,
          mediaType: template.mediaType,
        },
        'Post template created via internal API'
      );

      return reply.status(201).send({
        ok: true,
        template: {
          id: template.id,
          mediaType: template.mediaType,
          createdAt: template.createdAt.toISOString(),
        },
      });
    } catch (error) {
      fastify.log.error(error, 'Internal post template creation error');

      if (error instanceof z.ZodError) {
        return reply.status(400).send({
          ok: false,
          error: 'Invalid request body',
          details: error.errors,
        });
      }

      return reply.error(ErrorCode.INTERNAL_ERROR, 'Internal server error');
    }
  });

  /**
   * POST /internal/post-templates/:id/delete
   * Soft deletes a post template (called by bot)
   */
  fastify.post<{ Params: { id: string } }>('/post-templates/:id/delete', async (request, reply) => {
    try {
      const { id } = request.params;

      const template = await prisma.postTemplate.findFirst({
        where: {
          id,
          deletedAt: null,
        },
      });

      if (!template) {
        return reply.status(404).send({
          ok: false,
          error: 'Post template not found',
        });
      }

      const deletedAt = new Date();
      await prisma.postTemplate.update({
        where: { id },
        data: { deletedAt },
      });

      const undoUntil = new Date(deletedAt.getTime() + POST_TEMPLATE_UNDO_WINDOW_MS);

      return reply.success({ undoUntil: undoUntil.toISOString() });
    } catch (error) {
      fastify.log.error(error, 'Internal post template delete error');

      return reply.error(ErrorCode.INTERNAL_ERROR, 'Internal server error');
    }
  });

  /**
   * POST /internal/post-templates/:id/undo-delete
   * Restores a soft-deleted post template (called by bot)
   */
  fastify.post<{ Params: { id: string } }>('/post-templates/:id/undo-delete', async (request, reply) => {
    try {
      const { id } = request.params;

      const template = await prisma.postTemplate.findFirst({
        where: {
          id,
          deletedAt: { not: null },
        },
      });

      if (!template) {
        return reply.status(404).send({
          ok: false,
          error: 'Post template not found or not deleted',
        });
      }

      // Check if within undo window
      const deletedAt = template.deletedAt!;
      const undoDeadline = new Date(deletedAt.getTime() + POST_TEMPLATE_UNDO_WINDOW_MS);

      if (new Date() > undoDeadline) {
        return reply.status(400).send({
          ok: false,
          error: 'Undo window expired (20 seconds)',
        });
      }

      await prisma.postTemplate.update({
        where: { id },
        data: { deletedAt: null },
      });

      return reply.success({ message: 'Success' });
    } catch (error) {
      fastify.log.error(error, 'Internal post template undo delete error');

      return reply.error(ErrorCode.INTERNAL_ERROR, 'Internal server error');
    }
  });

  /**
   * GET /internal/giveaways/:id/full
   * Returns full giveaway info for bot confirmation flow
   */
  fastify.get<{ Params: { id: string } }>('/giveaways/:id/full', async (request, reply) => {
    try {
      const { id } = request.params;

      const giveaway = await prisma.giveaway.findUnique({
        where: { id },
        include: {
          owner: {
            select: {
              id: true,
              telegramUserId: true,
            },
          },
          postTemplate: {
            select: {
              id: true,
              text: true,
              mediaType: true,
              telegramFileId: true,
            },
          },
          condition: {
            select: {
              captchaMode: true,
              livenessEnabled: true,
              // Дополнительные билеты
              inviteEnabled: true,
              inviteMax: true,
              boostEnabled: true,
              boostChannelIds: true,
              storiesEnabled: true,
            },
          },
        },
      });

      if (!giveaway) {
        return reply.status(404).send({
          ok: false,
          error: 'Giveaway not found',
        });
      }

      // Get channel IDs from draftPayload
      const draftPayload = (giveaway.draftPayload || {}) as {
        requiredSubscriptionChannelIds?: string[];
        publishChannelIds?: string[];
        resultsChannelIds?: string[];
      };

      const requiredSubIds = draftPayload.requiredSubscriptionChannelIds || [];
      const publishIds = draftPayload.publishChannelIds || [];
      const resultsIds = draftPayload.resultsChannelIds || [];

      // Fetch channels
      const allChannelIds = [...new Set([...requiredSubIds, ...publishIds, ...resultsIds])];
      const channels = allChannelIds.length > 0
        ? await prisma.channel.findMany({
            where: { id: { in: allChannelIds } },
            select: {
              id: true,
              telegramChatId: true,
              username: true,
              title: true,
            },
          })
        : [];

      const channelMap = new Map(channels.map(c => [c.id, c]));

      const formatChannel = (id: string) => {
        const ch = channelMap.get(id);
        return ch ? {
          id: ch.id,
          title: ch.title,
          username: ch.username ? `@${ch.username}` : null,
          telegramChatId: ch.telegramChatId.toString(),
        } : null;
      };

      return reply.send({
        ok: true,
        giveaway: {
          id: giveaway.id,
          title: giveaway.title,
          type: giveaway.type,
          status: giveaway.status,
          language: giveaway.language,
          buttonText: giveaway.buttonText,
          winnersCount: giveaway.winnersCount,
          startAt: giveaway.startAt?.toISOString() || null,
          endAt: giveaway.endAt?.toISOString() || null,
          publishResultsMode: giveaway.publishResultsMode,
        },
        postTemplate: giveaway.postTemplate ? {
          text: giveaway.postTemplate.text,
          mediaType: giveaway.postTemplate.mediaType,
          telegramFileId: giveaway.postTemplate.telegramFileId,
        } : null,
        channels: {
          requiredSubscriptions: requiredSubIds.map(formatChannel).filter(Boolean),
          publish: publishIds.map(formatChannel).filter(Boolean),
          results: resultsIds.map(formatChannel).filter(Boolean),
        },
        protection: {
          captchaMode: giveaway.condition?.captchaMode || 'SUSPICIOUS_ONLY',
          livenessEnabled: giveaway.condition?.livenessEnabled || false,
          // Дополнительные билеты
          inviteEnabled: giveaway.condition?.inviteEnabled || false,
          inviteMax: giveaway.condition?.inviteMax || null,
          boostEnabled: giveaway.condition?.boostEnabled || false,
          boostChannelIds: giveaway.condition?.boostChannelIds || [],
          storiesEnabled: giveaway.condition?.storiesEnabled || false,
        },
        owner: {
          telegramUserId: giveaway.owner.telegramUserId.toString(),
        },
      });
    } catch (error) {
      fastify.log.error(error, 'Internal giveaway full fetch error');

      return reply.error(ErrorCode.INTERNAL_ERROR, 'Internal server error');
    }
  });

  /**
   * POST /internal/giveaways/:id/accept
   * Accepts a PENDING_CONFIRM giveaway and creates GiveawayMessage records
   */
  fastify.post<{ Params: { id: string } }>('/giveaways/:id/accept', async (request, reply) => {
    try {
      const { id } = request.params;
      const body = internalGiveawayAcceptSchema.parse(request.body);

      const giveaway = await prisma.giveaway.findUnique({
        where: { id },
      });

      if (!giveaway) {
        return reply.status(404).send({
          ok: false,
          error: 'Giveaway not found',
        });
      }

      if (giveaway.status !== GiveawayStatus.PENDING_CONFIRM) {
        return reply.status(400).send({
          ok: false,
          error: `Cannot accept giveaway in status: ${giveaway.status}`,
        });
      }

      // Determine new status based on startAt
      const now = new Date();
      let newStatus: GiveawayStatus;
      
      if (!giveaway.startAt || giveaway.startAt <= now) {
        newStatus = GiveawayStatus.ACTIVE;
      } else {
        newStatus = GiveawayStatus.SCHEDULED;
      }

      // Update giveaway and create messages in a transaction
      await prisma.$transaction(async (tx) => {
        // Update giveaway status
        await tx.giveaway.update({
          where: { id },
          data: { status: newStatus },
        });

        // Create GiveawayMessage records for each published message
        if (body.publishedMessages.length > 0) {
          await tx.giveawayMessage.createMany({
            data: body.publishedMessages.map((msg) => ({
              giveawayId: id,
              channelId: msg.channelId,
              telegramMessageId: msg.telegramMessageId,
              kind: GiveawayMessageKind.START,
            })),
          });
        }
      });

      fastify.log.info(
        { giveawayId: id, newStatus, messagesCount: body.publishedMessages.length },
        'Giveaway accepted and published'
      );

      return reply.success({ status: newStatus });
    } catch (error) {
      fastify.log.error(error, 'Internal giveaway accept error');

      if (error instanceof z.ZodError) {
        return reply.status(400).send({
          ok: false,
          error: 'Invalid request body',
          details: error.errors,
        });
      }

      return reply.error(ErrorCode.INTERNAL_ERROR, 'Internal server error');
    }
  });

  /**
   * POST /internal/giveaways/:id/reject
   * Rejects a PENDING_CONFIRM giveaway and returns it to DRAFT status
   */
  fastify.post<{ Params: { id: string } }>('/giveaways/:id/reject', async (request, reply) => {
    try {
      const { id } = request.params;

      const giveaway = await prisma.giveaway.findUnique({
        where: { id },
      });

      if (!giveaway) {
        return reply.status(404).send({
          ok: false,
          error: 'Giveaway not found',
        });
      }

      if (giveaway.status !== GiveawayStatus.PENDING_CONFIRM) {
        return reply.status(400).send({
          ok: false,
          error: `Cannot reject giveaway in status: ${giveaway.status}`,
        });
      }

      // Return to DRAFT status
      await prisma.giveaway.update({
        where: { id },
        data: { status: GiveawayStatus.DRAFT },
      });

      fastify.log.info({ giveawayId: id }, 'Giveaway rejected, returned to draft');

      return reply.success({ message: 'Success' });
    } catch (error) {
      fastify.log.error(error, 'Internal giveaway reject error');

      return reply.error(ErrorCode.INTERNAL_ERROR, 'Internal server error');
    }
  });

  /**
   * POST /internal/check-subscription
   * Проверяет подписку пользователя на канал (вызывается из API, выполняется через бота)
   * 
   * Примечание: Этот endpoint является прокси. Реальная проверка происходит через бота.
   * Для MVP делаем HTTP запрос к боту или используем общую логику.
   */
  fastify.post('/check-subscription', async (request, reply) => {
    try {
      const body = z.object({
        telegramUserId: z.string(),
        telegramChatId: z.string(),
      }).parse(request.body);

      // Для проверки подписки нужен Telegram Bot API
      // Этот endpoint будет вызывать бота или использовать его API напрямую
      // 
      // Варианты реализации:
      // 1. Бот слушает HTTP endpoint и отвечает
      // 2. API использует тот же токен бота и вызывает Telegram напрямую
      // 
      // Для MVP: вызываем Telegram Bot API напрямую из API
      
      const botToken = config.botToken;
      if (!botToken) {
        fastify.log.warn('BOT_TOKEN not configured, cannot check subscription');
        return reply.send({
          ok: false,
          error: 'Bot not configured',
          isMember: false,
        });
      }

      // 🔒 ЗАДАЧА 7.4: Redis cache для subscription checks (30 секунд TTL)
      const cacheKey = `subscription:${body.telegramUserId}:${body.telegramChatId}`;
      const cached = await getCache<{ isMember: boolean; status: string }>(cacheKey);

      if (cached) {
        fastify.log.debug({ cacheKey }, 'Subscription check cache hit');
        return reply.success({ 
          isMember: cached.isMember,
          status: cached.status,
          cached: true,
        });
      }

      // Вызываем getChatMember через Telegram Bot API
      const telegramUrl = `https://api.telegram.org/bot${botToken}/getChatMember`;
      
      const response = await fetch(telegramUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: body.telegramChatId,
          user_id: body.telegramUserId,
        }),
      });

      const data = await response.json() as {
        ok: boolean;
        result?: { status: string };
        description?: string;
      };

      if (!data.ok || !data.result) {
        fastify.log.warn(
          { telegramUserId: body.telegramUserId, telegramChatId: body.telegramChatId, error: data.description },
          'Failed to check chat member'
        );
        return reply.success({ isMember: false,
          status: 'error',
          error: data.description });
      }

      const memberStatus = data.result.status;
      const isMember = ['member', 'administrator', 'creator'].includes(memberStatus);

      // Сохраняем в cache на 30 секунд
      await setCache(cacheKey, { isMember, status: memberStatus }, 30);

      return reply.success({ isMember,
        status: memberStatus });
    } catch (error) {
      fastify.log.error(error, 'Internal check-subscription error');

      if (error instanceof z.ZodError) {
      return reply.badRequest('Invalid request body');
      }

      return reply.error(ErrorCode.INTERNAL_ERROR, 'Internal server error');
    }
  });

  /**
   * POST /internal/notify-winner
   * Отправить уведомление победителю через Telegram Bot API
   */
  fastify.post('/notify-winner', async (request, reply) => {
    try {
      const body = z.object({
        telegramUserId: z.string(),
        giveawayTitle: z.string(),
        place: z.number(),
        totalWinners: z.number(),
      }).parse(request.body);

      const botToken = config.botToken;
      if (!botToken) {
        fastify.log.warn('BOT_TOKEN not configured, cannot send notification');
        return reply.send({
          ok: false,
          error: 'Bot not configured',
        });
      }

      // Формируем сообщение
      const message = `🎉 <b>Поздравляем! Вы выиграли!</b>

Вы победили в розыгрыше "<b>${body.giveawayTitle}</b>"!

🏆 Ваше место: <b>${body.place}</b> из ${body.totalWinners}

Свяжитесь с организатором для получения приза.`;

      // Отправляем через Telegram Bot API
      const telegramUrl = `https://api.telegram.org/bot${botToken}/sendMessage`;
      
      const response = await fetch(telegramUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: body.telegramUserId,
          text: message,
          parse_mode: 'HTML',
        }),
      });

      const data = await response.json() as { ok: boolean; description?: string };

      if (!data.ok) {
        fastify.log.warn(
          { telegramUserId: body.telegramUserId, error: data.description },
          'Failed to send winner notification'
        );
        return reply.send({
          ok: false,
          error: data.description,
        });
      }

      fastify.log.info(
        { telegramUserId: body.telegramUserId, place: body.place },
        'Winner notification sent'
      );

      return reply.success({ message: 'Success' });
    } catch (error) {
      fastify.log.error(error, 'Internal notify-winner error');

      if (error instanceof z.ZodError) {
      return reply.badRequest('Invalid request body');
      }

      return reply.error(ErrorCode.INTERNAL_ERROR, 'Internal server error');
    }
  });

  /**
   * POST /internal/send-message
   * Отправить сообщение в канал через Telegram Bot API
   */
  fastify.post('/send-message', async (request, reply) => {
    try {
      const body = z.object({
        chatId: z.string(),
        text: z.string(),
        parseMode: z.enum(['HTML', 'Markdown', 'MarkdownV2']).optional().default('HTML'),
        replyMarkup: z.any().optional(),
      }).parse(request.body);

      const botToken = config.botToken;
      if (!botToken) {
        return reply.badRequest('Bot not configured');
      }

      const telegramUrl = `https://api.telegram.org/bot${botToken}/sendMessage`;
      
      const payload: Record<string, unknown> = {
        chat_id: body.chatId,
        text: body.text,
        parse_mode: body.parseMode,
      };
      
      if (body.replyMarkup) {
        payload.reply_markup = body.replyMarkup;
      }

      const response = await fetch(telegramUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await response.json() as { 
        ok: boolean; 
        result?: { message_id: number }; 
        description?: string 
      };

      if (!data.ok) {
        fastify.log.warn({ chatId: body.chatId, error: data.description }, 'Failed to send message');
        return reply.error(ErrorCode.TELEGRAM_API_ERROR, data.description || 'Telegram API error');
      }

      return reply.success({ messageId: data.result?.message_id });
    } catch (error) {
      fastify.log.error(error, 'Internal send-message error');
      return reply.error(ErrorCode.INTERNAL_ERROR, 'Internal server error');
    }
  });

  /**
   * POST /internal/edit-message
   * Редактировать сообщение (текст + кнопки)
   */
  fastify.post('/edit-message', async (request, reply) => {
    try {
      const body = z.object({
        chatId: z.string(),
        messageId: z.number(),
        text: z.string().optional(),
        caption: z.string().optional(),
        parseMode: z.enum(['HTML', 'Markdown', 'MarkdownV2']).optional().default('HTML'),
        replyMarkup: z.any().optional(),
      }).parse(request.body);

      const botToken = config.botToken;
      if (!botToken) {
        return reply.badRequest('Bot not configured');
      }

      // Определяем метод: editMessageText или editMessageCaption
      const method = body.caption ? 'editMessageCaption' : 'editMessageText';
      const telegramUrl = `https://api.telegram.org/bot${botToken}/${method}`;
      
      const payload: Record<string, unknown> = {
        chat_id: body.chatId,
        message_id: body.messageId,
        parse_mode: body.parseMode,
      };
      
      if (body.caption) {
        payload.caption = body.caption;
      } else if (body.text) {
        payload.text = body.text;
      }
      
      if (body.replyMarkup) {
        payload.reply_markup = body.replyMarkup;
      }

      const response = await fetch(telegramUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await response.json() as { ok: boolean; description?: string };

      if (!data.ok) {
        fastify.log.warn({ chatId: body.chatId, messageId: body.messageId, error: data.description }, 'Failed to edit message');
        return reply.error(ErrorCode.TELEGRAM_API_ERROR, data.description || 'Telegram API error');
      }

      return reply.success({ message: 'Success' });
    } catch (error) {
      fastify.log.error(error, 'Internal edit-message error');
      return reply.error(ErrorCode.INTERNAL_ERROR, 'Internal server error');
    }
  });

  /**
   * POST /internal/edit-message-button
   * Редактировать только кнопки сообщения (reply_markup)
   */
  fastify.post('/edit-message-button', async (request, reply) => {
    try {
      const body = z.object({
        chatId: z.string(),
        messageId: z.number(),
        replyMarkup: z.any(),
      }).parse(request.body);

      const botToken = config.botToken;
      if (!botToken) {
        return reply.badRequest('Bot not configured');
      }

      const telegramUrl = `https://api.telegram.org/bot${botToken}/editMessageReplyMarkup`;
      
      const response = await fetch(telegramUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: body.chatId,
          message_id: body.messageId,
          reply_markup: body.replyMarkup,
        }),
      });

      const data = await response.json() as { ok: boolean; description?: string };

      if (!data.ok) {
        // Игнорируем ошибку если сообщение не изменилось
        if (data.description?.includes('message is not modified')) {
          return reply.success({ message: 'Success' });
        }
        fastify.log.warn({ chatId: body.chatId, messageId: body.messageId, error: data.description }, 'Failed to edit message button');
        return reply.error(ErrorCode.TELEGRAM_API_ERROR, data.description || 'Telegram API error');
      }

      return reply.success({ message: 'Success' });
    } catch (error) {
      fastify.log.error(error, 'Internal edit-message-button error');
      return reply.error(ErrorCode.INTERNAL_ERROR, 'Internal server error');
    }
  });

  /**
   * POST /internal/check-boosts
   * Проверить бусты пользователя в канале через Telegram Bot API
   * Метод: getUserChatBoosts
   */
  fastify.post('/check-boosts', async (request, reply) => {
    try {
      const body = z.object({
        telegramUserId: z.string(),
        telegramChatId: z.string(),
      }).parse(request.body);

      const botToken = config.botToken;
      if (!botToken) {
        return reply.error('BOT_NOT_CONFIGURED', 'Bot not configured', { boosts: [], count: 0 });
      }

      // Вызываем метод Telegram API getUserChatBoosts
      // https://core.telegram.org/bots/api#getuserchatboosts
      const telegramUrl = `https://api.telegram.org/bot${botToken}/getUserChatBoosts`;
      
      const response = await fetch(telegramUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: body.telegramChatId,
          user_id: body.telegramUserId,
        }),
      });

      interface TelegramBoost {
        boost_id: string;
        add_date: number;
        expiration_date: number;
        source: {
          source: string;
          user?: {
            id: number;
          };
        };
      }

      interface TelegramBoostsResponse {
        ok: boolean;
        result?: {
          boosts: TelegramBoost[];
        };
        description?: string;
      }

      const data = await response.json() as TelegramBoostsResponse;

      if (!data.ok || !data.result) {
        fastify.log.warn(
          { telegramUserId: body.telegramUserId, telegramChatId: body.telegramChatId, error: data.description },
          'Failed to get user chat boosts'
        );
        return reply.error('TELEGRAM_API_ERROR', data.description || 'Failed to fetch boosts', { boosts: [], count: 0 });
      }

      // Преобразуем данные бустов
      const boosts = data.result.boosts.map((b) => ({
        boostId: b.boost_id,
        addDate: b.add_date,
        expirationDate: b.expiration_date,
      }));

      fastify.log.info(
        { telegramUserId: body.telegramUserId, telegramChatId: body.telegramChatId, boostCount: boosts.length },
        'Got user chat boosts'
      );

      return reply.success({ boosts,
        count: boosts.length });
    } catch (error) {
      fastify.log.error(error, 'Internal check-boosts error');
      return reply.status(500).send({ ok: false, error: 'Internal server error', boosts: [], count: 0 });
    }
  });

  /**
   * POST /internal/users/language
   * Обновить язык пользователя (вызывается ботом при смене языка в настройках)
   */
  fastify.post('/users/language', async (request, reply) => {
    try {
      const body = z.object({
        telegramUserId: z.union([z.string(), z.number()]).transform((v) => BigInt(v)),
        language: z.enum(['RU', 'EN', 'KK']),
      }).parse(request.body);

      // Найти или создать пользователя
      const user = await findOrCreateUser(body.telegramUserId);

      // Преобразовать строку в enum LanguageCode
      const languageCode = body.language === 'RU' 
        ? LanguageCode.RU 
        : body.language === 'EN' 
          ? LanguageCode.EN 
          : LanguageCode.KK;

      // Обновить язык
      await prisma.user.update({
        where: { id: user.id },
        data: { language: languageCode },
      });

      fastify.log.info(
        { telegramUserId: body.telegramUserId.toString(), language: body.language },
        'User language updated via internal API'
      );

      return reply.success({ language: body.language });
    } catch (error) {
      fastify.log.error(error, 'Internal user language update error');

      if (error instanceof z.ZodError) {
        return reply.status(400).send({
          ok: false,
          error: 'Invalid request body',
          details: error.errors,
        });
      }

      return reply.error(ErrorCode.INTERNAL_ERROR, 'Internal server error');
    }
  });

  /**
   * POST /internal/stars-payment
   * Обработать успешную оплату Telegram Stars (вызывается ботом)
   * Создаёт Purchase + Entitlement для пользователя
   */
  fastify.post('/stars-payment', async (request, reply) => {
    const body = z.object({
      telegramUserId: z.number(),
      productCode: z.string().min(1),
      starsAmount: z.number(),
      telegramPaymentChargeId: z.string().min(1),
    }).parse(request.body);

    // Находим пользователя по Telegram ID
    const user = await prisma.user.findUnique({
      where: { telegramUserId: BigInt(body.telegramUserId) },
    });

    if (!user) {
      fastify.log.warn({ telegramUserId: body.telegramUserId }, 'Stars payment: user not found');
      return reply.status(404).send({ ok: false, error: 'User not found' });
    }

    // Находим продукт
    const product = await prisma.product.findFirst({
      where: { code: body.productCode, isActive: true },
    });

    if (!product) {
      fastify.log.warn({ productCode: body.productCode }, 'Stars payment: product not found');
      return reply.status(404).send({ ok: false, error: 'Product not found' });
    }

    // Проверяем идемпотентность по telegramPaymentChargeId
    const existingPurchase = await prisma.purchase.findFirst({
      where: { externalId: body.telegramPaymentChargeId },
    });

    if (existingPurchase) {
      fastify.log.info({ chargeId: body.telegramPaymentChargeId }, 'Stars payment already processed (idempotent)');
      return reply.success({ ok: true, alreadyProcessed: true });
    }

    // Вычисляем срок действия
    const expiresAt = product.periodDays
      ? new Date(Date.now() + product.periodDays * 24 * 60 * 60 * 1000)
      : null;

    // Атомарная транзакция: Purchase + Entitlement
    await prisma.$transaction(async (tx) => {
      const purchase = await tx.purchase.create({
        data: {
          userId: user.id,
          productId: product.id,
          amount: body.starsAmount,
          currency: 'XTR',
          status: 'COMPLETED',
          provider: 'STARS',
          externalId: body.telegramPaymentChargeId,
          paidAt: new Date(),
          metadata: { telegramPaymentChargeId: body.telegramPaymentChargeId },
        },
      });

      // Отзываем предыдущие entitlement того же типа
      await tx.entitlement.updateMany({
        where: {
          userId: user.id,
          code: product.entitlementCode,
          revokedAt: null,
        },
        data: { revokedAt: new Date() },
      });

      await tx.entitlement.create({
        data: {
          userId: user.id,
          code: product.entitlementCode,
          sourceType: 'purchase',
          sourceId: purchase.id,
          expiresAt,
          autoRenew: false, // Stars не поддерживает автопродление
        },
      });
    });

    fastify.log.info(
      { userId: user.id, productCode: body.productCode, chargeId: body.telegramPaymentChargeId },
      'Stars payment processed, entitlement created'
    );

    return reply.success({ ok: true });
  });

  // ============================================================================
  // 17.4 Системный бан: управление блокировками
  // ============================================================================

  /**
   * POST /internal/users/:telegramUserId/ban
   * Забанить или разбанить пользователя (вызывается из бота командами /admin_ban, /admin_unban)
   * Body: { banned: boolean, reason?: string, adminId?: number, expiresAt?: string }
   */
  fastify.post<{ Params: { telegramUserId: string } }>(
    '/users/:telegramUserId/ban',
    async (request, reply) => {
      const body = z.object({
        banned: z.boolean(),
        reason: z.string().optional(),
        adminId: z.number().optional(),
        expiresAt: z.string().datetime().optional(),
      }).parse(request.body);

      const telegramUserId = BigInt(request.params.telegramUserId);

      const user = await prisma.user.findUnique({
        where: { telegramUserId },
        select: { id: true, username: true, firstName: true },
      });

      if (!user) {
        return reply.status(404).send({ ok: false, error: 'User not found' });
      }

      if (body.banned) {
        // Создаём или обновляем бан (upsert)
        await prisma.systemBan.upsert({
          where: { userId: user.id },
          create: {
            userId: user.id,
            reason: body.reason || 'Заблокирован администратором',
            bannedBy: body.adminId?.toString() || null,
            expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
          },
          update: {
            reason: body.reason || 'Заблокирован администратором',
            bannedBy: body.adminId?.toString() || null,
            bannedAt: new Date(),
            expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
          },
        });

        fastify.log.info({ userId: user.id, telegramUserId: telegramUserId.toString() }, 'User banned');

        // Уведомляем администраторов
        const userStr = user.username ? `@${user.username}` : user.firstName || `ID:${telegramUserId}`;
        sendAdminNotification(
          `🔒 <b>Пользователь заблокирован</b>\n\n` +
          `👤 ${userStr}\n` +
          `📋 Причина: ${body.reason || 'не указана'}\n` +
          (body.expiresAt ? `⏰ До: ${new Date(body.expiresAt).toLocaleString('ru-RU')}` : '⏰ Бессрочно')
        ).catch(() => {});

        return reply.success({ ok: true, banned: true });
      } else {
        // Удаляем бан
        const existing = await prisma.systemBan.findUnique({ where: { userId: user.id } });
        if (existing) {
          await prisma.systemBan.delete({ where: { userId: user.id } });
          fastify.log.info({ userId: user.id }, 'User unbanned');
        }

        return reply.success({ ok: true, banned: false });
      }
    }
  );

  // ============================================================================
  // 17.2 Системные уведомления: admin endpoints для бот-команд
  // ============================================================================

  /**
   * GET /internal/admin/stats
   * Платформенная статистика для команды /admin_stats в боте
   */
  fastify.get('/admin/stats', async (_request, reply) => {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const [
      totalUsers,
      totalGiveaways,
      totalChannels,
      totalParticipations,
      newUsersToday,
      newGiveawaysToday,
      activeGiveaways,
      totalPurchases,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.giveaway.count({ where: { status: { not: GiveawayStatus.DRAFT } } }),
      prisma.channel.count(),
      prisma.participation.count(),
      prisma.user.count({ where: { createdAt: { gte: startOfDay } } }),
      prisma.giveaway.count({ where: { createdAt: { gte: startOfDay } } }),
      prisma.giveaway.count({ where: { status: GiveawayStatus.ACTIVE } }),
      prisma.purchase.count({ where: { status: 'COMPLETED' } }),
    ]);

    return reply.success({
      totalUsers,
      totalGiveaways,
      totalChannels,
      totalParticipations,
      newUsersToday,
      newGiveawaysToday,
      activeGiveaways,
      totalPurchases,
    });
  });

  /**
   * GET /internal/admin/giveaways/:id
   * Информация о конкретном розыгрыше для команды /admin_giveaway в боте
   */
  fastify.get<{ Params: { id: string } }>(
    '/admin/giveaways/:id',
    async (request, reply) => {
      const { id } = request.params;

      const giveaway = await prisma.giveaway.findUnique({
        where: { id },
        include: {
          owner: {
            select: { telegramUserId: true, username: true, firstName: true },
          },
          _count: { select: { participations: true } },
        },
      });

      if (!giveaway) {
        return reply.status(404).send({ ok: false, error: 'Giveaway not found' });
      }

      return reply.success({
        id: giveaway.id,
        title: giveaway.title,
        status: giveaway.status,
        creatorId: giveaway.owner.telegramUserId.toString(),
        creatorUsername: giveaway.owner.username,
        participantCount: giveaway._count.participations,
        endsAt: giveaway.endAt?.toISOString() || null,
        isSandbox: giveaway.isSandbox,
        catalogApproved: giveaway.catalogApproved,
      });
    }
  );

  // ============================================================================
  // Subscription lifecycle endpoints (used by BullMQ workers in bot)
  // ============================================================================

  /**
   * GET /internal/subscriptions/expiring
   * Returns subscriptions expiring within `days` days (default 4)
   * Used by subscription:check periodic job
   */
  fastify.get('/subscriptions/expiring', async (request, reply) => {
    const query = (request.query as { days?: string });
    const days = parseInt(query.days || '4', 10);
    const now = new Date();
    const cutoff = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

    const entitlements = await prisma.entitlement.findMany({
      where: {
        expiresAt: { not: null, lte: cutoff },
        revokedAt: null,
        cancelledAt: null,
      },
      include: {
        user: {
          select: {
            id: true,
            telegramUserId: true,
          },
        },
      },
    });

    const result = entitlements.map((e) => ({
      id: e.id,
      userId: e.user.id,
      telegramUserId: e.user.telegramUserId.toString(),
      code: e.code,
      expiresAt: e.expiresAt!.toISOString(),
      autoRenew: e.autoRenew,
      warningSentAt: e.warningSentAt?.toISOString() || null,
      isExpired: e.expiresAt! < now,
    }));

    return reply.success(result);
  });

  /**
   * POST /internal/subscriptions/:userId/deactivate
   * Deactivates all active entitlements for a user
   * Body: { reason?: string }
   */
  fastify.post(
    '/subscriptions/:userId/deactivate',
    async (request, reply) => {
      const { userId } = request.params as { userId: string };
      const body = (request.body as { reason?: string }) || {};

      const user = await prisma.user.findUnique({ where: { id: userId } });
      if (!user) {
        return reply.notFound('User not found');
      }

      await prisma.entitlement.updateMany({
        where: {
          userId,
          revokedAt: null,
          expiresAt: { lte: new Date() },
        },
        data: {
          revokedAt: new Date(),
          metadata: { reason: body.reason || 'expired' } as unknown as Prisma.InputJsonValue,
        },
      });

      fastify.log.info({ userId, reason: body.reason }, 'Subscription deactivated');
      return reply.success({ ok: true });
    }
  );

  /**
   * POST /internal/subscriptions/:userId/mark-warning-sent
   * Marks that an expiry warning was sent for a specific entitlement
   * Body: { entitlementId: string }
   */
  fastify.post(
    '/subscriptions/:userId/mark-warning-sent',
    async (request, reply) => {
      const { userId } = request.params as { userId: string };
      const body = request.body as { entitlementId: string };

      await prisma.entitlement.updateMany({
        where: {
          id: body.entitlementId,
          userId,
        },
        data: {
          warningSentAt: new Date(),
        },
      });

      return reply.success({ ok: true });
    }
  );

  /**
   * POST /internal/subscriptions/:userId/auto-renew
   * Placeholder for auto-renewal via YooKassa
   * Body: { entitlementId, productId, amount, currency }
   */
  fastify.post(
    '/subscriptions/:userId/auto-renew',
    async (request, reply) => {
      const { userId } = request.params as { userId: string };
      const body = request.body as {
        entitlementId: string;
        productId: string;
        amount: number;
        currency: string;
      };

      fastify.log.info({ userId, ...body }, 'Auto-renew requested (not yet implemented)');

      // Placeholder: real implementation would create a YooKassa payment
      return reply.success({
        ok: false,
        error: 'auto_renew_not_configured',
        message: 'Auto-renewal via YooKassa is not yet configured',
      });
    }
  );
};
