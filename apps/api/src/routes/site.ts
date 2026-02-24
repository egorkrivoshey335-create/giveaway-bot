import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { prisma } from '@randombeast/database';
import { ErrorCode } from '@randombeast/shared';
import { config } from '../config.js';
import { createSessionToken, verifySessionToken, getSessionCookieOptions } from '../utils/session.js';

// Имя cookie для site сессии (отличается от web app)
const SITE_SESSION_COOKIE = 'rb_site_session';

// Экранирование HTML для Telegram сообщений
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// ============================================================================
// Schemas
// ============================================================================

const telegramAuthSchema = z.object({
  telegramUserId: z.string(),
  username: z.string().optional(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  photoUrl: z.string().optional(),
});

// ============================================================================
// Helpers
// ============================================================================

/**
 * Получает userId из cookie site сессии
 */
function getUserIdFromSiteSession(request: FastifyRequest): string | null {
  const token = request.cookies[SITE_SESSION_COOKIE];
  if (!token) return null;
  return verifySessionToken(token);
}

/**
 * Проверяет internal API token
 */
function verifyInternalToken(request: FastifyRequest): boolean {
  const token = request.headers['x-internal-token'];
  return token === config.internalApiToken;
}

/**
 * Проверяет наличие entitlement у пользователя
 */
async function hasEntitlement(userId: string, code: string): Promise<boolean> {
  const entitlement = await prisma.entitlement.findFirst({
    where: {
      userId,
      code,
      revokedAt: null,
      OR: [
        { expiresAt: null },
        { expiresAt: { gt: new Date() } },
      ],
    },
  });
  return !!entitlement;
}

// ============================================================================
// Routes
// ============================================================================

export async function siteRoutes(fastify: FastifyInstance) {
  /**
   * POST /site/auth/telegram
   * Создаёт или обновляет пользователя по данным от Telegram Login Widget
   * Защищён X-Internal-Token (вызывается из apps/site)
   */
  fastify.post('/site/auth/telegram', async (request, reply) => {
    // Проверяем internal token
    if (!verifyInternalToken(request)) {
      return reply.unauthorized('Unauthorized');
    }

    // Валидируем данные
    const parseResult = telegramAuthSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        ok: false,
        error: 'Invalid request body',
        details: parseResult.error.issues,
      });
    }

    const { telegramUserId, username, firstName, lastName } = parseResult.data;

    try {
      // Создаём или обновляем пользователя
      const user = await prisma.user.upsert({
        where: {
          telegramUserId: BigInt(telegramUserId),
        },
        update: {
          username,
          firstName,
          lastName,
          updatedAt: new Date(),
        },
        create: {
          telegramUserId: BigInt(telegramUserId),
          username,
          firstName,
          lastName,
        },
      });

      // Создаём session token
      const sessionToken = createSessionToken(user.id);

      return reply.success({ sessionToken });
    } catch (error) {
      fastify.log.error(error);
      return reply.error(ErrorCode.INTERNAL_ERROR, 'Internal server error');
    }
  });

  /**
   * GET /site/me
   * Возвращает данные текущего пользователя и статус доступа к рандомайзеру
   */
  fastify.get('/site/me', async (request, reply) => {
    const userId = getUserIdFromSiteSession(request);

    if (!userId) {
      return reply.unauthorized('Unauthorized');
    }

    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
      });

      if (!user) {
        return reply.unauthorized('User not found');
      }

      // Проверяем доступ к рандомайзеру
      const hasRandomizerAccess = await hasEntitlement(userId, 'randomizer.access');

      return reply.success({
        user: {
          id: user.id,
          telegramUserId: user.telegramUserId.toString(),
          username: user.username,
          firstName: user.firstName,
          lastName: user.lastName,
          language: user.language,
          isPremium: user.isPremium,
          createdAt: user.createdAt.toISOString(),
        },
        hasRandomizerAccess,
      });
    } catch (error) {
      fastify.log.error(error);
      return reply.error(ErrorCode.INTERNAL_ERROR, 'Internal server error');
    }
  });

  /**
   * GET /site/giveaways
   * Возвращает список завершённых розыгрышей текущего пользователя
   */
  fastify.get('/site/giveaways', async (request, reply) => {
    const userId = getUserIdFromSiteSession(request);

    if (!userId) {
      return reply.unauthorized('Unauthorized');
    }

    try {
      const giveaways = await prisma.giveaway.findMany({
        where: {
          ownerUserId: userId,
          status: 'FINISHED',
        },
        orderBy: {
          updatedAt: 'desc',
        },
        include: {
          _count: {
            select: {
              winners: true,
              participations: {
                where: { status: 'JOINED' },
              },
            },
          },
        },
      });

      return reply.success({
        giveaways: giveaways.map((g) => ({
          id: g.id,
          title: g.title,
          winnersCount: g._count.winners,
          participantsCount: g._count.participations,
          finishedAt: g.updatedAt.toISOString(),
          publishResultsMode: g.publishResultsMode,
          winnersPublished: g.winnersPublished,
        })),
      });
    } catch (error) {
      fastify.log.error(error);
      return reply.error(ErrorCode.INTERNAL_ERROR, 'Internal server error');
    }
  });

  /**
   * GET /site/giveaways/:id/randomizer
   * Возвращает данные для рандомайзера (защищённый эндпоинт)
   * Включает участников для "живого" розыгрыша
   */
  fastify.get<{ Params: { id: string } }>(
    '/site/giveaways/:id/randomizer',
    async (request, reply) => {
      const userId = getUserIdFromSiteSession(request);

      if (!userId) {
        return reply.unauthorized('Unauthorized');
      }

      const { id } = request.params;

      try {
        // Проверяем доступ к рандомайзеру
        const hasRandomizerAccess = await hasEntitlement(userId, 'randomizer.access');
        if (!hasRandomizerAccess) {
          return reply.forbidden('Randomizer access required');
        }

        // Получаем розыгрыш с участниками и победителями
        const giveaway = await prisma.giveaway.findUnique({
          where: { id },
          include: {
            participations: {
              where: { status: 'JOINED' },
              include: {
                user: {
                  select: {
                    id: true,
                    telegramUserId: true,
                    username: true,
                    firstName: true,
                    lastName: true,
                  },
                },
              },
            },
            winners: {
              orderBy: { place: 'asc' },
              include: {
                user: {
                  select: {
                    id: true,
                    telegramUserId: true,
                    username: true,
                    firstName: true,
                    lastName: true,
                  },
                },
              },
            },
          },
        });

        if (!giveaway) {
          return reply.notFound('Giveaway not found');
        }

        // Проверяем, что розыгрыш принадлежит пользователю
        if (giveaway.ownerUserId !== userId) {
          return reply.forbidden('Access denied');
        }

        // Проверяем, что розыгрыш завершён
        if (giveaway.status !== 'FINISHED') {
          return reply.badRequest('Giveaway is not finished');
        }

        // Парсим JSON поля
        const randomizerPrizes = giveaway.randomizerPrizes as { place: number; title: string; description?: string }[] | null;
        const randomizerCustom = giveaway.randomizerCustom as { backgroundColor?: string; accentColor?: string; logoUrl?: string } | null;

        return reply.send({
          ok: true,
          giveaway: {
            id: giveaway.id,
            title: giveaway.title,
            winnersCount: giveaway.winnersCount,
            participantsCount: giveaway.participations.length,
            finishedAt: giveaway.updatedAt.toISOString(),
            publishResultsMode: giveaway.publishResultsMode,
            winnersPublished: giveaway.winnersPublished,
          },
          participants: giveaway.participations.map((p) => ({
            id: p.id,
            telegramUserId: p.user.telegramUserId.toString(),
            firstName: p.user.firstName,
            lastName: p.user.lastName,
            username: p.user.username,
            ticketsTotal: p.ticketsBase + p.ticketsExtra,
          })),
          winners: giveaway.winners.map((w) => ({
            place: w.place,
            odataUserId: w.user.id,
            telegramUserId: w.user.telegramUserId.toString(),
            firstName: w.user.firstName,
            lastName: w.user.lastName,
            username: w.user.username,
            ticketsUsed: w.ticketsUsed,
          })),
          prizes: randomizerPrizes || [],
          customization: randomizerCustom || {
            backgroundColor: '#0f0f23',
            accentColor: '#f2b6b6',
          },
        });
      } catch (error) {
        fastify.log.error(error);
        return reply.error(ErrorCode.INTERNAL_ERROR, 'Internal server error');
      }
    }
  );

  /**
   * POST /site/giveaways/:id/save-prizes
   * Сохраняет призы для рандомайзера
   */
  fastify.post<{ Params: { id: string }; Body: { prizes: { place: number; title: string; description?: string }[] } }>(
    '/site/giveaways/:id/save-prizes',
    async (request, reply) => {
      const userId = getUserIdFromSiteSession(request);

      if (!userId) {
        return reply.unauthorized('Unauthorized');
      }

      const { id } = request.params;
      const { prizes } = request.body;

      try {
        // Проверяем что розыгрыш принадлежит пользователю
        const giveaway = await prisma.giveaway.findUnique({
          where: { id },
          select: { ownerUserId: true },
        });

        if (!giveaway) {
          return reply.notFound('Giveaway not found');
        }

        if (giveaway.ownerUserId !== userId) {
          return reply.forbidden('Access denied');
        }

        // Сохраняем призы
        await prisma.giveaway.update({
          where: { id },
          data: { randomizerPrizes: prizes },
        });

        return reply.success({ message: 'Success' });
      } catch (error) {
        fastify.log.error(error);
        return reply.error(ErrorCode.INTERNAL_ERROR, 'Internal server error');
      }
    }
  );

  /**
   * POST /site/giveaways/:id/save-customization
   * Сохраняет кастомизацию рандомайзера (цвета, логотип)
   */
  fastify.post<{ Params: { id: string }; Body: { backgroundColor?: string; accentColor?: string; logoUrl?: string } }>(
    '/site/giveaways/:id/save-customization',
    async (request, reply) => {
      const userId = getUserIdFromSiteSession(request);

      if (!userId) {
        return reply.unauthorized('Unauthorized');
      }

      const { id } = request.params;
      const { backgroundColor, accentColor, logoUrl } = request.body;

      try {
        // Проверяем что розыгрыш принадлежит пользователю
        const giveaway = await prisma.giveaway.findUnique({
          where: { id },
          select: { ownerUserId: true },
        });

        if (!giveaway) {
          return reply.notFound('Giveaway not found');
        }

        if (giveaway.ownerUserId !== userId) {
          return reply.forbidden('Access denied');
        }

        // Сохраняем кастомизацию
        await prisma.giveaway.update({
          where: { id },
          data: {
            randomizerCustom: {
              backgroundColor: backgroundColor || '#0f0f23',
              accentColor: accentColor || '#f2b6b6',
              logoUrl: logoUrl || null,
            },
          },
        });

        return reply.success({ message: 'Success' });
      } catch (error) {
        fastify.log.error(error);
        return reply.error(ErrorCode.INTERNAL_ERROR, 'Internal server error');
      }
    }
  );

  /**
   * GET /site/giveaways/:id/results
   * Публичный эндпоинт для результатов розыгрыша
   */
  fastify.get<{ Params: { id: string } }>(
    '/site/giveaways/:id/results',
    async (request, reply) => {
      const { id } = request.params;

      try {
        const giveaway = await prisma.giveaway.findUnique({
          where: { id },
          include: {
            _count: {
              select: {
                participations: {
                  where: { status: 'JOINED' },
                },
              },
            },
            winners: {
              orderBy: { place: 'asc' },
              include: {
                user: {
                  select: {
                    username: true,
                    firstName: true,
                    lastName: true,
                  },
                },
              },
            },
          },
        });

        if (!giveaway) {
          return reply.notFound('Giveaway not found');
        }

        // Проверяем, что розыгрыш завершён
        if (giveaway.status !== 'FINISHED') {
          return reply.badRequest('Giveaway is not finished');
        }

        // Парсим JSON поля
        const randomizerPrizes = giveaway.randomizerPrizes as { place: number; title: string; description?: string }[] | null;
        const randomizerCustom = giveaway.randomizerCustom as { backgroundColor?: string; accentColor?: string; logoUrl?: string } | null;

        return reply.send({
          ok: true,
          giveaway: {
            id: giveaway.id,
            title: giveaway.title,
            winnersCount: giveaway.winners.length,
            participantsCount: giveaway._count.participations,
            finishedAt: giveaway.updatedAt.toISOString(),
          },
          winners: giveaway.winners.map((w) => ({
            place: w.place,
            firstName: w.user.firstName,
            lastName: w.user.lastName,
            username: w.user.username,
          })),
          prizes: randomizerPrizes || [],
          customization: randomizerCustom || {
            backgroundColor: '#0f0f23',
            accentColor: '#f2b6b6',
          },
        });
      } catch (error) {
        fastify.log.error(error);
        return reply.error(ErrorCode.INTERNAL_ERROR, 'Internal server error');
      }
    }
  );

  /**
   * POST /site/giveaways/:id/publish-winners
   * Публикует победителей в каналы (для RANDOMIZER режима)
   * Вызывается после того как создатель объявил победителей на сайте
   */
  fastify.post<{ Params: { id: string } }>(
    '/site/giveaways/:id/publish-winners',
    async (request, reply) => {
      const userId = getUserIdFromSiteSession(request);

      if (!userId) {
        return reply.unauthorized('Unauthorized');
      }

      const { id } = request.params;

      try {
        // Проверяем розыгрыш
        const giveaway = await prisma.giveaway.findUnique({
          where: { id },
          include: {
            winners: {
              orderBy: { place: 'asc' },
              include: {
                user: { select: { telegramUserId: true, firstName: true } },
              },
            },
            messages: true,
            resultsChannels: {
              include: {
                channel: { select: { id: true, telegramChatId: true, title: true } },
              },
            },
            _count: { select: { participations: { where: { status: 'JOINED' } } } },
          },
        });

        if (!giveaway) {
          return reply.notFound('Giveaway not found');
        }

        if (giveaway.ownerUserId !== userId) {
          return reply.forbidden('Access denied');
        }

        if (giveaway.status !== 'FINISHED') {
          return reply.badRequest('Giveaway is not finished');
        }

        if (giveaway.winnersPublished) {
          return reply.badRequest('Winners already published');
        }

        // Формируем текст с победителями
        const winnersLines = giveaway.winners.map(w => {
          const medal = w.place <= 3 ? ['🥇', '🥈', '🥉'][w.place - 1] : '🏅';
          const name = w.user.firstName || `User ${w.user.telegramUserId.toString().slice(-4)}`;
          const mention = `<a href="tg://user?id=${w.user.telegramUserId}">${escapeHtml(name)}</a>`;
          return `${medal} ${w.place}. ${mention}`;
        });

        const resultsText = `🎉 <b>Розыгрыш «${escapeHtml(giveaway.title)}» — победители определены!</b>\n\n🏆 <b>Победители:</b>\n\n${winnersLines.join('\n')}\n\nВсего участников: ${giveaway._count.participations}\n\nПоздравляем победителей! 🎊`;

        const resultsUrl = `https://t.me/${process.env.BOT_USERNAME || 'BeastRandomBot'}/participate?startapp=results_${giveaway.id}`;

        // Определяем каналы для публикации
        let channels = giveaway.resultsChannels.map(rc => rc.channel);

        if (channels.length === 0) {
          // Используем каналы из стартовых сообщений
          const channelIds = [...new Set(giveaway.messages.filter(m => m.kind === 'START').map(m => m.channelId))];
          if (channelIds.length > 0) {
            channels = await prisma.channel.findMany({
              where: { id: { in: channelIds } },
              select: { id: true, telegramChatId: true, title: true },
            });
          }
        }

        // Находим тизер-сообщения (RESULTS kind) для обновления
        const teaserMessages = giveaway.messages.filter(m => m.kind === 'RESULTS');

        if (teaserMessages.length > 0) {
          // Обновляем тизер-сообщения новым текстом с победителями
          for (const msg of teaserMessages) {
            const channel = await prisma.channel.findUnique({
              where: { id: msg.channelId },
              select: { telegramChatId: true },
            });

            if (!channel) continue;

            try {
              await fetch(`${config.apiUrl}/internal/edit-message`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'X-Internal-Token': config.internalApiToken,
                },
                body: JSON.stringify({
                  chatId: channel.telegramChatId.toString(),
                  messageId: msg.telegramMessageId,
                  text: resultsText,
                  parseMode: 'HTML',
                  replyMarkup: {
                    inline_keyboard: [[
                      { text: '🏆 Подробнее', url: resultsUrl }
                    ]]
                  },
                }),
              });
            } catch (error) {
              fastify.log.error(error, `Ошибка обновления тизера в канале`);
            }
          }
        } else if (channels.length > 0) {
          // Нет тизеров — отправляем новые посты
          for (const channel of channels) {
            try {
              await fetch(`${config.apiUrl}/internal/send-message`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'X-Internal-Token': config.internalApiToken,
                },
                body: JSON.stringify({
                  chatId: channel.telegramChatId.toString(),
                  text: resultsText,
                  parseMode: 'HTML',
                  replyMarkup: {
                    inline_keyboard: [[
                      { text: '🏆 Подробнее', url: resultsUrl }
                    ]]
                  },
                }),
              });
            } catch (error) {
              fastify.log.error(error, `Ошибка отправки результатов в канал`);
            }
          }
        }

        // Обновляем кнопки в стартовых постах
        const startMessages = giveaway.messages.filter(m => m.kind === 'START');
        for (const msg of startMessages) {
          const channel = await prisma.channel.findUnique({
            where: { id: msg.channelId },
            select: { telegramChatId: true },
          });

          if (!channel) continue;

          try {
            await fetch(`${config.apiUrl}/internal/edit-message-button`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'X-Internal-Token': config.internalApiToken,
              },
              body: JSON.stringify({
                chatId: channel.telegramChatId.toString(),
                messageId: msg.telegramMessageId,
                replyMarkup: {
                  inline_keyboard: [[
                    { text: '🏆 Результаты', url: resultsUrl }
                  ]]
                },
              }),
            });
          } catch (error) {
            fastify.log.error(error, `Ошибка обновления кнопки стартового поста`);
          }
        }

        // Отмечаем что победители опубликованы
        await prisma.giveaway.update({
          where: { id },
          data: { winnersPublished: true },
        });

        return reply.success({ message: 'Success' });
      } catch (error) {
        fastify.log.error(error);
        return reply.error(ErrorCode.INTERNAL_ERROR, 'Internal server error');
      }
    }
  );

  /**
   * POST /site/giveaways/:id/winner-show/reroll
   * Перевыбор победителя (замена одного победителя новым случайным)
   */
  fastify.post<{ Params: { id: string } }>(
    '/site/giveaways/:id/winner-show/reroll',
    async (request, reply) => {
      const userId = getUserIdFromSiteSession(request);
      if (!userId) {
        return reply.unauthorized('Not authenticated');
      }

      const { id } = request.params;

      const body = z.object({
        place: z.number().int().min(1),
      }).parse(request.body);

      // Проверяем владение
      const giveaway = await prisma.giveaway.findFirst({
        where: { id, ownerUserId: userId },
        select: { id: true, status: true },
      });

      if (!giveaway) {
        return reply.notFound('Розыгрыш не найден');
      }

      if (giveaway.status !== 'FINISHED') {
        return reply.badRequest('Reroll возможен только для завершённых розыгрышей');
      }

      // Находим текущего победителя на этом месте
      const currentWinner = await prisma.winner.findUnique({
        where: { giveawayId_place: { giveawayId: id, place: body.place } },
      });

      if (!currentWinner) {
        return reply.notFound(`Победитель на месте ${body.place} не найден`);
      }

      if (currentWinner.rerolled) {
        return reply.badRequest('Этот победитель уже был перевыбран');
      }

      // Находим участников, которые НЕ являются победителями
      const winnerUserIds = (
        await prisma.winner.findMany({
          where: { giveawayId: id },
          select: { userId: true },
        })
      ).map(w => w.userId);

      const eligibleParticipants = await prisma.participation.findMany({
        where: {
          giveawayId: id,
          userId: { notIn: winnerUserIds },
        },
        select: {
          userId: true,
          ticketsBase: true,
          ticketsExtra: true,
        },
      });

      if (eligibleParticipants.length === 0) {
        return reply.badRequest('Нет доступных участников для перевыбора');
      }

      // Взвешенный выбор по количеству билетов
      const totalTickets = eligibleParticipants.reduce(
        (sum, p) => sum + p.ticketsBase + p.ticketsExtra, 0
      );
      let random = Math.random() * totalTickets;
      let selectedParticipant = eligibleParticipants[0];

      for (const p of eligibleParticipants) {
        random -= (p.ticketsBase + p.ticketsExtra);
        if (random <= 0) {
          selectedParticipant = p;
          break;
        }
      }

      // Обновляем в транзакции
      await prisma.$transaction([
        // Помечаем старого победителя как rerolled
        prisma.winner.update({
          where: { id: currentWinner.id },
          data: { rerolled: true, rerolledAt: new Date() },
        }),
        // Создаём нового победителя
        prisma.winner.create({
          data: {
            giveawayId: id,
            userId: selectedParticipant.userId,
            place: body.place,
            ticketsUsed: selectedParticipant.ticketsBase + selectedParticipant.ticketsExtra,
            previousWinnerUserId: currentWinner.userId,
          },
        }),
      ]);

      // Загружаем данные нового победителя
      const newWinner = await prisma.user.findUnique({
        where: { id: selectedParticipant.userId },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          username: true,
          telegramUserId: true,
        },
      });

      fastify.log.info(
        { giveawayId: id, place: body.place, oldUserId: currentWinner.userId, newUserId: selectedParticipant.userId },
        'Winner rerolled'
      );

      return reply.success({
        place: body.place,
        previousWinnerId: currentWinner.userId,
        newWinner: newWinner ? {
          id: newWinner.id,
          firstName: newWinner.firstName,
          lastName: newWinner.lastName,
          username: newWinner.username,
          telegramUserId: newWinner.telegramUserId.toString(),
        } : null,
      });
    }
  );

  /**
   * POST /site/giveaways/:id/winner-show/select
   * Ручной выбор победителей (когда scheduler не сделал этого)
   */
  fastify.post<{ Params: { id: string } }>(
    '/site/giveaways/:id/winner-show/select',
    async (request, reply) => {
      const userId = getUserIdFromSiteSession(request);
      if (!userId) {
        return reply.unauthorized('Not authenticated');
      }

      const { id } = request.params;

      // Проверяем владение
      const giveaway = await prisma.giveaway.findFirst({
        where: { id, ownerUserId: userId },
        select: { id: true, status: true, winnersCount: true },
      });

      if (!giveaway) {
        return reply.notFound('Розыгрыш не найден');
      }

      if (giveaway.status !== 'FINISHED') {
        return reply.badRequest('Ручной выбор возможен только для завершённых розыгрышей');
      }

      // Проверяем нет ли уже победителей (не rerolled)
      const existingWinners = await prisma.winner.count({
        where: { giveawayId: id, rerolled: false },
      });

      if (existingWinners > 0) {
        return reply.conflict('Победители уже выбраны. Используйте reroll для перевыбора.');
      }

      // Получаем участников
      const participants = await prisma.participation.findMany({
        where: { giveawayId: id },
        select: {
          userId: true,
          ticketsBase: true,
          ticketsExtra: true,
        },
      });

      if (participants.length === 0) {
        return reply.badRequest('Нет участников для выбора победителей');
      }

      // Взвешенный случайный выбор
      const selectedWinners: { userId: string; tickets: number; place: number }[] = [];
      const remainingParticipants = [...participants];

      for (let place = 1; place <= Math.min(giveaway.winnersCount, remainingParticipants.length); place++) {
        const totalTickets = remainingParticipants.reduce(
          (sum, p) => sum + p.ticketsBase + p.ticketsExtra, 0
        );

        let random = Math.random() * totalTickets;
        let selectedIdx = 0;

        for (let i = 0; i < remainingParticipants.length; i++) {
          random -= (remainingParticipants[i].ticketsBase + remainingParticipants[i].ticketsExtra);
          if (random <= 0) {
            selectedIdx = i;
            break;
          }
        }

        const selected = remainingParticipants[selectedIdx];
        selectedWinners.push({
          userId: selected.userId,
          tickets: selected.ticketsBase + selected.ticketsExtra,
          place,
        });

        // Убираем выбранного из списка
        remainingParticipants.splice(selectedIdx, 1);
      }

      // Сохраняем победителей
      await prisma.winner.createMany({
        data: selectedWinners.map(w => ({
          giveawayId: id,
          userId: w.userId,
          place: w.place,
          ticketsUsed: w.tickets,
        })),
      });

      // Загружаем данные победителей
      const winnerUsers = await prisma.winner.findMany({
        where: { giveawayId: id, rerolled: false },
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              username: true,
              telegramUserId: true,
            },
          },
        },
        orderBy: { place: 'asc' },
      });

      fastify.log.info(
        { giveawayId: id, winnersCount: winnerUsers.length },
        'Winners manually selected'
      );

      return reply.success({
        winners: winnerUsers.map(w => ({
          place: w.place,
          user: {
            id: w.user.id,
            firstName: w.user.firstName,
            lastName: w.user.lastName,
            username: w.user.username,
            telegramUserId: w.user.telegramUserId.toString(),
          },
          ticketsUsed: w.ticketsUsed,
        })),
      });
    }
  );

  /**
   * GET /site/public-results
   * Список публичных завершённых розыгрышей для sitemap.xml
   * Без авторизации
   */
  fastify.get('/site/public-results', async (_request, reply) => {
    const giveaways = await prisma.giveaway.findMany({
      where: {
        status: 'FINISHED',
        winnersPublished: true,
        isPublicInCatalog: true,
      },
      select: {
        id: true,
        endAt: true,
      },
      orderBy: { endAt: 'desc' },
      take: 200,
    });

    return reply.success({
      giveaways: giveaways.map(g => ({
        id: g.id,
        finishedAt: g.endAt?.toISOString() ?? new Date().toISOString(),
      })),
    });
  });

  /**
   * POST /site/logout
   * Удаляет cookie сессии
   */
  fastify.post('/site/logout', async (request, reply) => {
    reply.clearCookie(SITE_SESSION_COOKIE, {
      path: '/',
      domain: config.auth.cookieDomain,
    });

    return reply.success({ message: 'Success' });
  });
}
