/**
 * RandomBeast — Webhooks Routes
 *
 * Endpoints для webhook интеграций (YooKassa, Telegram Bot).
 *
 * @packageDocumentation
 */

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { ErrorCode } from '@randombeast/shared';
import { config } from '../config.js';

// Schemas
const telegramUpdateSchema = z.object({
  update_id: z.number(),
  message: z.object({
    message_id: z.number(),
    from: z.object({
      id: z.number(),
      first_name: z.string(),
      last_name: z.string().optional(),
      username: z.string().optional(),
    }),
    chat: z.object({
      id: z.number(),
      type: z.string(),
    }),
    text: z.string().optional(),
  }).optional(),
  // ... другие поля telegram update
}).passthrough(); // Allow additional fields

export const webhooksRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * POST /webhooks/telegram/:botToken
   * Webhook endpoint для Telegram Bot
   * 
   * Telegram отправляет updates на этот URL.
   * TODO: Интегрировать с ботом для обработки команд и сообщений.
   */
  fastify.post<{ Params: { botToken: string } }>(
    '/webhooks/telegram/:botToken',
    async (request, reply) => {
      const { botToken } = request.params;

      // Проверяем что токен совпадает с нашим
      if (botToken !== config.botToken) {
        return reply.forbidden('Invalid bot token');
      }

      // Валидируем update
      const update = telegramUpdateSchema.parse(request.body);

      // TODO: Отправить update в очередь для обработки ботом
      // Для MVP просто логируем
      fastify.log.info({ updateId: update.update_id }, 'Telegram update received');

      // Telegram ожидает 200 OK для подтверждения получения
      return reply.success({ ok: true });
    }
  );

  /**
   * POST /webhooks/yookassa
   * Webhook endpoint для YooKassa payment notifications
   * 
   * YooKassa отправляет уведомления о статусе платежей.
   */
  fastify.post('/webhooks/yookassa', async (request, reply) => {
    // TODO: Проверить подпись YooKassa webhook
    const webhookSecret = config.yookassa?.webhookSecret;
    if (!webhookSecret) {
      fastify.log.warn('YooKassa webhook secret not configured');
      return reply.error(ErrorCode.INTERNAL_ERROR, 'Webhook not configured');
    }

    // TODO: Валидировать и обработать payment notification
    // Для MVP просто логируем
    fastify.log.info({ body: request.body }, 'YooKassa webhook received');

    // YooKassa ожидает 200 OK
    return reply.success({ ok: true });
  });
};
