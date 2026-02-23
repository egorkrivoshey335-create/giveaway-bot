/**
 * Prize Form Routes — Задача 14.10 из TASKS-14-features.md
 *
 * Форма сбора данных победителя (ФИО, адрес, телефон и т.д.)
 * Данные шифруются на стороне клиента (AES-GCM через SubtleCrypto) и хранятся зашифрованными.
 * Создатель расшифровывает у себя на стороне через приватный ключ.
 *
 * Для MVP используем симметричное шифрование: giveawayId → ключ генерируется создателем и хранится
 * в draftPayload.formEncryptionKey (base64). Победитель получает publicKey через API.
 */

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma, GiveawayStatus } from '@randombeast/database';
import { requireUser } from '../plugins/auth.js';

const submitFormSchema = z.object({
  // encryptedData — JSON строка зашифрованная победителем через AES-GCM
  // Поле принимает произвольные данные (winner управляет структурой)
  encryptedData: z.string().min(1).max(10_000).optional(),
  // Открытые данные (если создатель не настроил шифрование)
  plainData: z
    .object({
      name: z.string().max(200).optional(),
      phone: z.string().max(50).optional(),
      email: z.string().email().max(200).optional(),
      address: z.string().max(500).optional(),
      telegram: z.string().max(100).optional(),
      extra: z.record(z.string(), z.string()).optional(),
    })
    .optional(),
});

const processFormSchema = z.object({
  processedAt: z.string().datetime().optional(),
  note: z.string().max(500).optional(),
});

export const prizeFormsRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * GET /giveaways/:id/prize-form/config
   * Конфигурация формы для победителя: поля, publicKey (если шифрование включено)
   */
  fastify.get<{ Params: { id: string } }>(
    '/giveaways/:id/prize-form/config',
    async (request, reply) => {
      const user = await requireUser(request, reply);
      if (!user) return;

      const { id } = request.params;

      const giveaway = await prisma.giveaway.findUnique({
        where: { id },
        select: {
          id: true,
          title: true,
          status: true,
          ownerUserId: true,
          draftPayload: true,
        },
      });

      if (!giveaway) {
        return reply.notFound('Розыгрыш не найден');
      }

      // Проверяем что пользователь — победитель
      const winner = await prisma.winner.findFirst({
        where: { giveawayId: id, userId: user.id, isReserve: false },
      });

      if (!winner) {
        return reply.forbidden('Вы не являетесь победителем этого розыгрыша');
      }

      const payload = (giveaway.draftPayload as Record<string, unknown>) || {};
      const formConfig = (payload.prizeFormConfig as Record<string, unknown>) || {};

      // Проверяем, не заполнена ли уже форма
      const existing = await prisma.prizeForm.findUnique({
        where: { giveawayId_winnerUserId: { giveawayId: id, winnerUserId: user.id } },
        select: { submittedAt: true, processedAt: true },
      });

      return reply.success({
        giveawayId: id,
        giveawayTitle: giveaway.title,
        formFields: (formConfig.fields as string[]) ?? ['name', 'phone', 'address'],
        encryptionEnabled: !!(formConfig as { encryptionEnabled?: boolean }).encryptionEnabled,
        publicKey: (formConfig as { publicKey?: string }).publicKey ?? null,
        alreadySubmitted: !!existing,
        submittedAt: existing?.submittedAt?.toISOString() ?? null,
        processedAt: existing?.processedAt?.toISOString() ?? null,
      });
    }
  );

  /**
   * POST /giveaways/:id/prize-form
   * Победитель отправляет данные
   */
  fastify.post<{ Params: { id: string } }>(
    '/giveaways/:id/prize-form',
    async (request, reply) => {
      const user = await requireUser(request, reply);
      if (!user) return;

      const { id } = request.params;
      const body = submitFormSchema.parse(request.body);

      if (!body.encryptedData && !body.plainData) {
        return reply.badRequest('Необходимо передать encryptedData или plainData');
      }

      const giveaway = await prisma.giveaway.findUnique({
        where: { id },
        select: { id: true, status: true, ownerUserId: true },
      });

      if (!giveaway) {
        return reply.notFound('Розыгрыш не найден');
      }

      if (giveaway.status !== GiveawayStatus.FINISHED) {
        return reply.badRequest('Форма доступна только для завершённых розыгрышей');
      }

      const winner = await prisma.winner.findFirst({
        where: { giveawayId: id, userId: user.id, isReserve: false },
      });

      if (!winner) {
        return reply.forbidden('Вы не являетесь победителем этого розыгрыша');
      }

      // Upsert — повторная отправка перезаписывает
      const formData = body.encryptedData
        ? { encrypted: body.encryptedData }
        : body.plainData ?? {};

      const form = await prisma.prizeForm.upsert({
        where: { giveawayId_winnerUserId: { giveawayId: id, winnerUserId: user.id } },
        create: {
          giveawayId: id,
          winnerUserId: user.id,
          formData,
        },
        update: {
          formData,
          submittedAt: new Date(),
          processedAt: null,
        },
      });

      fastify.log.info(
        { giveawayId: id, userId: user.id, formId: form.id },
        'Prize form submitted'
      );

      return reply.success({
        id: form.id,
        submittedAt: form.submittedAt.toISOString(),
        message: 'Данные успешно переданы создателю розыгрыша.',
      });
    }
  );

  /**
   * GET /giveaways/:id/prize-forms
   * Создатель получает список форм (все победители)
   */
  fastify.get<{ Params: { id: string } }>(
    '/giveaways/:id/prize-forms',
    async (request, reply) => {
      const user = await requireUser(request, reply);
      if (!user) return;

      const { id } = request.params;

      const giveaway = await prisma.giveaway.findFirst({
        where: { id, ownerUserId: user.id },
        select: { id: true },
      });

      if (!giveaway) {
        return reply.notFound('Розыгрыш не найден или недостаточно прав');
      }

      const forms = await prisma.prizeForm.findMany({
        where: { giveawayId: id },
        include: {
          winner: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              username: true,
              telegramUserId: true,
            },
          },
        },
        orderBy: { submittedAt: 'asc' },
      });

      return reply.success({
        forms: forms.map((f) => ({
          id: f.id,
          winnerUserId: f.winnerUserId,
          winner: {
            ...f.winner,
            telegramUserId: f.winner.telegramUserId.toString(),
          },
          formData: f.formData,
          submittedAt: f.submittedAt.toISOString(),
          processedAt: f.processedAt?.toISOString() ?? null,
        })),
      });
    }
  );

  /**
   * PATCH /giveaways/:id/prize-forms/:formId/process
   * Создатель отмечает форму как обработанную
   */
  fastify.patch<{ Params: { id: string; formId: string } }>(
    '/giveaways/:id/prize-forms/:formId/process',
    async (request, reply) => {
      const user = await requireUser(request, reply);
      if (!user) return;

      const { id, formId } = request.params;
      const body = processFormSchema.parse(request.body || {});

      const giveaway = await prisma.giveaway.findFirst({
        where: { id, ownerUserId: user.id },
        select: { id: true },
      });

      if (!giveaway) {
        return reply.notFound('Розыгрыш не найден или недостаточно прав');
      }

      const form = await prisma.prizeForm.update({
        where: { id: formId, giveawayId: id },
        data: {
          processedAt: body.processedAt ? new Date(body.processedAt) : new Date(),
        },
      });

      return reply.success({
        id: form.id,
        processedAt: form.processedAt?.toISOString(),
      });
    }
  );
};
