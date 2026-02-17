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
import crypto from 'crypto';

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

/**
 * Проверка подписи YooKassa webhook
 * @see https://yookassa.ru/developers/using-api/webhooks#notification-auth
 */
function verifyYooKassaSignature(body: string, signature: string, secret: string): boolean {
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(body)
    .digest('hex');
  
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}

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
   * 🔒 ИСПРАВЛЕНО (2026-02-16): Signature verification добавлена
   * 
   * YooKassa отправляет уведомления о статусе платежей.
   */
  fastify.post('/webhooks/yookassa', async (request, reply) => {
    // 🔒 Проверяем подпись YooKassa webhook
    const webhookSecret = config.yookassa?.webhookSecret;
    if (!webhookSecret) {
      fastify.log.warn('YooKassa webhook secret not configured');
      return reply.error(ErrorCode.INTERNAL_ERROR, 'Webhook not configured');
    }

    // Получаем подпись из заголовка
    const signature = request.headers['x-yookassa-signature'] as string | undefined;
    if (!signature) {
      fastify.log.warn('Missing YooKassa signature header');
      return reply.status(401).send({
        success: false,
        error: {
          code: 'MISSING_SIGNATURE',
          message: 'Missing signature header',
        },
      });
    }

    // Получаем raw body для проверки подписи
    const rawBody = JSON.stringify(request.body);
    
    // 🔒 Проверяем подпись
    const isValid = verifyYooKassaSignature(rawBody, signature, webhookSecret);
    if (!isValid) {
      fastify.log.warn({ signature }, 'Invalid YooKassa signature');
      return reply.status(401).send({
        success: false,
        error: {
          code: 'INVALID_SIGNATURE',
          message: 'Invalid webhook signature',
        },
      });
    }

    // TODO: Валидировать и обработать payment notification
    // Для MVP просто логируем
    fastify.log.info({ body: request.body }, 'YooKassa webhook received and verified');

    // YooKassa ожидает 200 OK
    return reply.success({ ok: true });
  });
};
