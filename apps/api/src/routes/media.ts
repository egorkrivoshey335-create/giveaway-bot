/**
 * RandomBeast — Media Upload Routes
 *
 * Endpoints для загрузки и управления мультимедиа файлами.
 *
 * @packageDocumentation
 */

import type { FastifyPluginAsync } from 'fastify';
import { ErrorCode } from '@randombeast/shared';
import { requireUser } from '../plugins/auth.js';
import { config } from '../config.js';
import sharp from 'sharp';

// Допустимые MIME types
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const ALLOWED_VIDEO_TYPES = ['video/mp4', 'video/quicktime']; // mp4, mov
const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_VIDEO_SIZE = 50 * 1024 * 1024; // 50MB

export const mediaRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * POST /media/upload
   * Загрузка медиа файла (изображение или видео)
   * 
   * Для MVP используем Telegram Bot API для хранения файлов через file_id.
   * Клиент отправляет файл, мы загружаем его в Telegram через bot и возвращаем file_id.
   */
  fastify.post('/media/upload', async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;

    // Получаем файл из multipart
    const data = await request.file();

    if (!data) {
      return reply.badRequest('No file uploaded');
    }

    const { mimetype, file, filename } = data;

    // Определяем тип медиа
    let mediaType: 'photo' | 'video' | null = null;
    let maxSize = 0;

    if (ALLOWED_IMAGE_TYPES.includes(mimetype)) {
      mediaType = 'photo';
      maxSize = MAX_IMAGE_SIZE;
    } else if (ALLOWED_VIDEO_TYPES.includes(mimetype)) {
      mediaType = 'video';
      maxSize = MAX_VIDEO_SIZE;
    } else {
      return reply.badRequest(`Unsupported file type: ${mimetype}`);
    }

    // Читаем файл в буфер
    const chunks: Buffer[] = [];
    for await (const chunk of file) {
      chunks.push(chunk);
    }
    const buffer = Buffer.concat(chunks);

    // Проверяем размер
    if (buffer.length > maxSize) {
      return reply.badRequest(`File too large. Max size: ${maxSize / 1024 / 1024}MB`);
    }

    // Для изображений: оптимизируем если нужно
    let processedBuffer: Buffer<ArrayBufferLike> = buffer;
    if (mediaType === 'photo') {
      try {
        const image = sharp(buffer);
        const metadata = await image.metadata();

        // Если изображение больше 2048px по любой стороне - ресайзим
        if (metadata.width && metadata.width > 2048 || metadata.height && metadata.height > 2048) {
          processedBuffer = (await image
            .resize(2048, 2048, {
              fit: 'inside',
              withoutEnlargement: true,
            })
            .jpeg({ quality: 85 })
            .toBuffer()) as Buffer;
        }
      } catch (error) {
        fastify.log.warn({ error }, 'Failed to optimize image');
        // Continue with original buffer
      }
    }

    // Загружаем в Telegram через Bot API
    const botToken = config.botToken;
    if (!botToken) {
      return reply.error(ErrorCode.BOT_API_ERROR, 'Bot not configured');
    }

    try {
      // Создаем FormData для отправки в Telegram
      const formData = new FormData();
      
      if (mediaType === 'photo') {
        formData.append('photo', new Blob([processedBuffer], { type: 'image/jpeg' }), filename || 'image.jpg');
        // Отправляем самому себе (в saved messages)
        formData.append('chat_id', user.telegramUserId.toString());
      } else {
        formData.append('video', new Blob([processedBuffer], { type: mimetype }), filename || 'video.mp4');
        formData.append('chat_id', user.telegramUserId.toString());
      }

      const telegramEndpoint = mediaType === 'photo' 
        ? `https://api.telegram.org/bot${botToken}/sendPhoto`
        : `https://api.telegram.org/bot${botToken}/sendVideo`;

      const response = await fetch(telegramEndpoint, {
        method: 'POST',
        body: formData,
      });

      const result = await response.json() as {
        ok: boolean;
        result?: {
          photo?: Array<{ file_id: string }>;
          video?: { file_id: string };
        };
        description?: string;
      };

      if (!result.ok || !result.result) {
        fastify.log.error({ result }, 'Telegram API error');
        return reply.error(ErrorCode.BOT_API_ERROR, result.description || 'Failed to upload to Telegram');
      }

      // Извлекаем file_id
      let fileId: string;
      if (mediaType === 'photo' && result.result.photo) {
        // Берем последний (самый большой) вариант
        fileId = result.result.photo[result.result.photo.length - 1].file_id;
      } else if (mediaType === 'video' && result.result.video) {
        fileId = result.result.video.file_id;
      } else {
        return reply.error(ErrorCode.BOT_API_ERROR, 'No file_id in response');
      }

      fastify.log.info({ userId: user.id, fileId, mediaType }, 'Media uploaded');

      return reply.success({
        fileId,
        mediaType,
        originalFilename: filename,
        size: buffer.length,
      });
    } catch (error) {
      fastify.log.error({ error }, 'Media upload error');
      return reply.error(ErrorCode.BOT_API_ERROR, 'Failed to upload media');
    }
  });

  /**
   * POST /media/upload-theme-asset
   * Загрузка theme asset (логотип или фон) для кастомизации темы
   * 
   * Ограничения:
   * - Только изображения (PNG, JPEG, WebP)
   * - Макс размер: 2MB
   * - Авто-ресайз для логотипов: 512x512px
   * - Авто-оптимизация для фонов: 1920x1080px
   */
  fastify.post<{ Querystring: { type?: 'logo' | 'background' } }>(
    '/media/upload-theme-asset',
    async (request, reply) => {
      const user = await requireUser(request, reply);
      if (!user) return;

      const assetType = request.query.type || 'logo';

      // Получаем файл из multipart
      const data = await request.file();

      if (!data) {
        return reply.badRequest('No file uploaded');
      }

      const { mimetype, file, filename } = data;

      // Проверяем тип файла
      if (!ALLOWED_IMAGE_TYPES.includes(mimetype)) {
        return reply.badRequest(`Unsupported file type: ${mimetype}. Allowed: JPEG, PNG, WebP`);
      }

      // Читаем файл в буфер
      const chunks: Buffer[] = [];
      for await (const chunk of file) {
        chunks.push(chunk);
      }
      const buffer = Buffer.concat(chunks);

      // Проверяем размер (2MB для theme assets)
      const maxSize = 2 * 1024 * 1024;
      if (buffer.length > maxSize) {
        return reply.badRequest('File too large. Max size: 2MB');
      }

      // Обрабатываем изображение в зависимости от типа
      let processedBuffer: Buffer<ArrayBufferLike>;
      try {
        const image = sharp(buffer);
        const metadata = await image.metadata();

        if (assetType === 'logo') {
          // Логотип: ресайз до 512x512px, preserve aspect ratio
          processedBuffer = (await image
            .resize(512, 512, {
              fit: 'inside',
              withoutEnlargement: true,
              background: { r: 0, g: 0, b: 0, alpha: 0 }, // Transparent
            })
            .png({ quality: 90, compressionLevel: 9 })
            .toBuffer()) as Buffer;
        } else {
          // Фон: ресайз до 1920x1080px
          processedBuffer = (await image
            .resize(1920, 1080, {
              fit: 'cover',
              withoutEnlargement: true,
            })
            .jpeg({ quality: 85 })
            .toBuffer()) as Buffer;
        }
      } catch (error) {
        fastify.log.error({ error }, 'Failed to process theme asset');
        return reply.error(ErrorCode.BOT_API_ERROR, 'Failed to process image');
      }

      // Загружаем в Telegram через Bot API
      const botToken = config.botToken;
      if (!botToken) {
        return reply.error(ErrorCode.BOT_API_ERROR, 'Bot not configured');
      }

      try {
        const formData = new FormData();
        formData.append(
          'photo',
          new Blob([processedBuffer], { type: 'image/jpeg' }),
          filename || `theme-${assetType}.jpg`
        );
        formData.append('chat_id', user.telegramUserId.toString());

        const response = await fetch(`https://api.telegram.org/bot${botToken}/sendPhoto`, {
          method: 'POST',
          body: formData,
        });

        const result = (await response.json()) as {
          ok: boolean;
          result?: {
            photo?: Array<{ file_id: string }>;
          };
          description?: string;
        };

        if (!result.ok || !result.result?.photo) {
          fastify.log.error({ result }, 'Telegram API error');
          return reply.error(ErrorCode.BOT_API_ERROR, result.description || 'Failed to upload to Telegram');
        }

        // Берем последний (самый большой) вариант
        const fileId = result.result.photo[result.result.photo.length - 1].file_id;

        fastify.log.info({ userId: user.id, fileId, assetType }, 'Theme asset uploaded');

        return reply.success({
          fileId,
          assetType,
          originalFilename: filename,
          size: processedBuffer.length,
        });
      } catch (error) {
        fastify.log.error({ error }, 'Theme asset upload error');
        return reply.error(ErrorCode.BOT_API_ERROR, 'Failed to upload theme asset');
      }
    }
  );

  /**
   * DELETE /media/:fileId
   * Удаление медиа (опционально - Telegram не поддерживает удаление file_id)
   * Для MVP просто логируем и возвращаем success
   */
  fastify.delete<{ Params: { fileId: string } }>('/media/:fileId', async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;

    const { fileId } = request.params;

    // TODO: В будущем при использовании S3 - удалить файл
    // Для Telegram file_id удаление не поддерживается

    fastify.log.info({ userId: user.id, fileId }, 'Media deletion requested (no-op for Telegram)');

    return reply.success({ message: 'Media marked for deletion' });
  });
};
