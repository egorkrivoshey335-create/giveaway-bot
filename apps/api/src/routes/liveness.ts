/**
 * Liveness Check Routes — Задача 10.19 из TASKS-10-api.md
 *
 * Проверка живости участника розыгрыша: участник загружает селфи,
 * создатель розыгрыша проверяет и одобряет/отклоняет.
 *
 * Поля в Participation:
 *   - livenessChecked:  Boolean  (true = проверено и одобрено)
 *   - livenessPhotoPath: String? (Telegram file_id)
 *   - livenessStatus:  String?  ('PENDING' | 'APPROVED' | 'REJECTED')
 */

import type { FastifyPluginAsync } from 'fastify';
import { prisma, GiveawayStatus } from '@randombeast/database';
import { requireUser } from '../plugins/auth.js';
import { config } from '../config.js';
import { ErrorCode } from '@randombeast/shared';

const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_LIVENESS_PHOTO_SIZE = 5 * 1024 * 1024; // 5MB

export const livenessRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * POST /giveaways/:id/liveness/photo
   * Участник загружает селфи-фото для проверки живости.
   * Только если giveaway.condition.livenessEnabled = true.
   * Фото отправляется в Telegram (admin chat или собственные сохранённые) и сохраняется file_id.
   */
  fastify.post<{ Params: { id: string } }>(
    '/giveaways/:id/liveness/photo',
    async (request, reply) => {
      const user = await requireUser(request, reply);
      if (!user) return;

      const { id } = request.params;

      // Проверяем розыгрыш
      const giveaway = await prisma.giveaway.findUnique({
        where: { id },
        include: { condition: true },
      });

      if (!giveaway) {
        return reply.notFound('Розыгрыш не найден');
      }

      if (!giveaway.condition?.livenessEnabled) {
        return reply.badRequest('Проверка живости не требуется для этого розыгрыша');
      }

      if (giveaway.status !== GiveawayStatus.ACTIVE) {
        return reply.badRequest('Розыгрыш неактивен');
      }

      // Проверяем что пользователь участвует
      const participation = await prisma.participation.findUnique({
        where: { giveawayId_userId: { giveawayId: id, userId: user.id } },
      });

      if (!participation) {
        return reply.badRequest('Вы не участвуете в этом розыгрыше');
      }

      // Уже одобрено — повторная загрузка не нужна
      if (participation.livenessStatus === 'APPROVED') {
        return reply.success({
          status: 'APPROVED',
          message: 'Ваша проверка уже одобрена',
        });
      }

      // Получаем файл
      const data = await request.file();
      if (!data) {
        return reply.badRequest('Файл не загружен');
      }

      const { mimetype, file } = data;

      if (!ALLOWED_IMAGE_TYPES.includes(mimetype)) {
        return reply.badRequest('Поддерживаются только JPEG, PNG, WebP');
      }

      const chunks: Buffer[] = [];
      for await (const chunk of file) {
        chunks.push(chunk);
      }
      const buffer = Buffer.concat(chunks);

      if (buffer.length > MAX_LIVENESS_PHOTO_SIZE) {
        return reply.badRequest('Файл слишком большой. Максимум 5MB');
      }

      // Загружаем фото в Telegram
      const botToken = config.botToken;
      if (!botToken) {
        return reply.error(ErrorCode.BOT_API_ERROR, 'Бот не настроен');
      }

      // Отправляем в admin chat или user's own chat как fallback
      const targetChatId = config.adminChatId || user.telegramUserId.toString();

      const formData = new FormData();
      formData.append('photo', new Blob([buffer], { type: mimetype }), 'liveness.jpg');
      formData.append('chat_id', targetChatId);
      formData.append(
        'caption',
        `🔍 Liveness check\nGiveaway: ${giveaway.title ?? id}\nUser: @${user.username ?? user.id} (${user.telegramUserId})`
      );

      const telegramResp = await fetch(
        `https://api.telegram.org/bot${botToken}/sendPhoto`,
        { method: 'POST', body: formData }
      );

      const telegramResult = (await telegramResp.json()) as {
        ok: boolean;
        result?: { photo?: Array<{ file_id: string }> };
        description?: string;
      };

      if (!telegramResult.ok || !telegramResult.result?.photo?.length) {
        fastify.log.error({ telegramResult }, 'Failed to upload liveness photo to Telegram');
        return reply.error(ErrorCode.BOT_API_ERROR, 'Не удалось загрузить фото');
      }

      const fileId = telegramResult.result.photo[telegramResult.result.photo.length - 1].file_id;

      // Обновляем participation
      await prisma.participation.update({
        where: { giveawayId_userId: { giveawayId: id, userId: user.id } },
        data: {
          livenessPhotoPath: fileId,
          livenessStatus: 'PENDING',
          livenessChecked: false,
        },
      });

      fastify.log.info(
        { userId: user.id, giveawayId: id, fileId },
        'Liveness photo submitted'
      );

      return reply.success({
        status: 'PENDING',
        message: 'Фото загружено. Ожидайте проверки создателя розыгрыша.',
      });
    }
  );

  /**
   * GET /giveaways/:id/liveness
   * Создатель розыгрыша получает список всех участников с liveness статусом.
   * Поддерживает фильтрацию по status=PENDING|APPROVED|REJECTED
   */
  fastify.get<{
    Params: { id: string };
    Querystring: { status?: string };
  }>('/giveaways/:id/liveness', async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;

    const { id } = request.params;
    const { status } = request.query;

    // Только создатель розыгрыша
    const giveaway = await prisma.giveaway.findFirst({
      where: { id, ownerUserId: user.id },
      select: { id: true, title: true, condition: { select: { livenessEnabled: true } } },
    });

    if (!giveaway) {
      return reply.notFound('Розыгрыш не найден или нет доступа');
    }

    if (!giveaway.condition?.livenessEnabled) {
      return reply.success({ checks: [], total: 0, livenessEnabled: false });
    }

    const whereStatus = status ? { livenessStatus: status } : { livenessPhotoPath: { not: null } };

    const participations = await prisma.participation.findMany({
      where: { giveawayId: id, ...whereStatus },
      select: {
        id: true,
        userId: true,
        livenessPhotoPath: true,
        livenessStatus: true,
        livenessChecked: true,
        joinedAt: true,
        user: {
          select: {
            id: true,
            username: true,
            firstName: true,
            lastName: true,
            telegramUserId: true,
          },
        },
      },
      orderBy: { joinedAt: 'asc' },
    });

    // Статистика
    const [pending, approved, rejected, notSubmitted] = await Promise.all([
      prisma.participation.count({ where: { giveawayId: id, livenessStatus: 'PENDING' } }),
      prisma.participation.count({ where: { giveawayId: id, livenessStatus: 'APPROVED' } }),
      prisma.participation.count({ where: { giveawayId: id, livenessStatus: 'REJECTED' } }),
      prisma.participation.count({ where: { giveawayId: id, livenessPhotoPath: null } }),
    ]);

    return reply.success({
      livenessEnabled: true,
      stats: { pending, approved, rejected, notSubmitted },
      checks: participations.map((p) => ({
        participationId: p.id,
        userId: p.userId,
        user: {
          ...p.user,
          telegramUserId: p.user.telegramUserId.toString(),
        },
        livenessStatus: p.livenessStatus ?? 'NOT_SUBMITTED',
        livenessChecked: p.livenessChecked,
        hasPhoto: !!p.livenessPhotoPath,
        photoUrl: p.livenessPhotoPath
          ? `/api/v1/giveaways/${id}/liveness/${p.userId}/photo`
          : null,
        joinedAt: p.joinedAt.toISOString(),
      })),
    });
  });

  /**
   * GET /giveaways/:id/liveness/:userId/photo
   * Создатель просматривает фото участника.
   * Проксирует файл из Telegram, не раскрывая токен бота клиенту.
   */
  fastify.get<{ Params: { id: string; userId: string } }>(
    '/giveaways/:id/liveness/:userId/photo',
    async (request, reply) => {
      const user = await requireUser(request, reply);
      if (!user) return;

      const { id, userId } = request.params;

      // Только создатель розыгрыша
      const giveaway = await prisma.giveaway.findFirst({
        where: { id, ownerUserId: user.id },
        select: { id: true },
      });

      if (!giveaway) {
        return reply.notFound('Розыгрыш не найден или нет доступа');
      }

      const participation = await prisma.participation.findUnique({
        where: { giveawayId_userId: { giveawayId: id, userId } },
        select: { livenessPhotoPath: true },
      });

      if (!participation?.livenessPhotoPath) {
        return reply.notFound('Фото не найдено');
      }

      const botToken = config.botToken;
      if (!botToken) {
        return reply.error(ErrorCode.BOT_API_ERROR, 'Бот не настроен');
      }

      // Получаем временный URL файла через Telegram API
      const fileInfoResp = await fetch(
        `https://api.telegram.org/bot${botToken}/getFile?file_id=${participation.livenessPhotoPath}`
      );
      const fileInfo = (await fileInfoResp.json()) as {
        ok: boolean;
        result?: { file_path: string };
      };

      if (!fileInfo.ok || !fileInfo.result?.file_path) {
        return reply.error(ErrorCode.BOT_API_ERROR, 'Не удалось получить файл');
      }

      const downloadUrl = `https://api.telegram.org/file/bot${botToken}/${fileInfo.result.file_path}`;

      // Проксируем содержимое файла
      const photoResp = await fetch(downloadUrl);
      if (!photoResp.ok) {
        return reply.error(ErrorCode.BOT_API_ERROR, 'Не удалось загрузить фото');
      }

      const photoBuffer = await photoResp.arrayBuffer();
      const contentType = photoResp.headers.get('content-type') || 'image/jpeg';

      reply.header('Content-Type', contentType);
      reply.header('Cache-Control', 'private, max-age=300');
      return reply.send(Buffer.from(photoBuffer));
    }
  );

  /**
   * POST /giveaways/:id/liveness/:userId/approve
   * Создатель одобряет проверку живости участника.
   */
  fastify.post<{ Params: { id: string; userId: string } }>(
    '/giveaways/:id/liveness/:userId/approve',
    async (request, reply) => {
      const user = await requireUser(request, reply);
      if (!user) return;

      const { id, userId } = request.params;

      const giveaway = await prisma.giveaway.findFirst({
        where: { id, ownerUserId: user.id },
        select: { id: true },
      });

      if (!giveaway) {
        return reply.notFound('Розыгрыш не найден или нет доступа');
      }

      const participation = await prisma.participation.findUnique({
        where: { giveawayId_userId: { giveawayId: id, userId } },
        select: { id: true, livenessStatus: true, livenessPhotoPath: true },
      });

      if (!participation) {
        return reply.notFound('Участник не найден');
      }

      if (!participation.livenessPhotoPath) {
        return reply.badRequest('Участник не загрузил фото');
      }

      await prisma.participation.update({
        where: { giveawayId_userId: { giveawayId: id, userId } },
        data: {
          livenessChecked: true,
          livenessStatus: 'APPROVED',
        },
      });

      fastify.log.info(
        { creatorId: user.id, giveawayId: id, participantUserId: userId },
        'Liveness check approved'
      );

      return reply.success({ status: 'APPROVED' });
    }
  );

  /**
   * POST /giveaways/:id/liveness/:userId/reject
   * Создатель отклоняет проверку живости участника.
   */
  fastify.post<{ Params: { id: string; userId: string } }>(
    '/giveaways/:id/liveness/:userId/reject',
    async (request, reply) => {
      const user = await requireUser(request, reply);
      if (!user) return;

      const { id, userId } = request.params;

      const giveaway = await prisma.giveaway.findFirst({
        where: { id, ownerUserId: user.id },
        select: { id: true },
      });

      if (!giveaway) {
        return reply.notFound('Розыгрыш не найден или нет доступа');
      }

      const participation = await prisma.participation.findUnique({
        where: { giveawayId_userId: { giveawayId: id, userId } },
        select: { id: true, livenessStatus: true },
      });

      if (!participation) {
        return reply.notFound('Участник не найден');
      }

      await prisma.participation.update({
        where: { giveawayId_userId: { giveawayId: id, userId } },
        data: {
          livenessChecked: false,
          livenessStatus: 'REJECTED',
        },
      });

      fastify.log.info(
        { creatorId: user.id, giveawayId: id, participantUserId: userId },
        'Liveness check rejected'
      );

      return reply.success({ status: 'REJECTED' });
    }
  );
};
