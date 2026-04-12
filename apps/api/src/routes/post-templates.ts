import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma, MediaType } from '@randombeast/database';
import { POST_LIMITS, POST_TEMPLATE_UNDO_WINDOW_MS } from '@randombeast/shared';
import { ErrorCode } from '@randombeast/shared';
import { requireUser } from '../plugins/auth.js';
import { config } from '../config.js';

interface PostTemplateResponse {
  id: string;
  text: string;
  mediaType: string;
  telegramFileId: string | null;
  hasMedia: boolean;
  createdAt: string;
}

function serializePostTemplate(template: {
  id: string;
  text: string;
  mediaType: MediaType;
  telegramFileId: string | null;
  createdAt: Date;
}): PostTemplateResponse {
  return {
    id: template.id,
    text: template.text,
    mediaType: template.mediaType,
    telegramFileId: template.telegramFileId,
    hasMedia: template.mediaType !== MediaType.NONE,
    createdAt: template.createdAt.toISOString(),
  };
}

export const postTemplatesRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * GET /post-templates
   * Returns all non-deleted post templates for the current user
   */
  fastify.get('/post-templates', async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;

    const templates = await prisma.postTemplate.findMany({
      where: {
        ownerUserId: user.id,
        deletedAt: null,
      },
      select: {
        id: true,
        text: true,
        mediaType: true,
        telegramFileId: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return reply.success({ templates: templates.map(serializePostTemplate) });
  });

  /**
   * GET /post-templates/:id
   * Returns a specific post template
   */
  fastify.get<{ Params: { id: string } }>('/post-templates/:id', async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;

    const { id } = request.params;

    const template = await prisma.postTemplate.findFirst({
      where: {
        id,
        ownerUserId: user.id,
        deletedAt: null,
      },
      select: {
        id: true,
        text: true,
        mediaType: true,
        telegramFileId: true,
        createdAt: true,
      },
    });

    if (!template) {
      return reply.status(404).send({
        ok: false,
        error: 'Post template not found',
      });
    }

    return reply.success({ template: serializePostTemplate(template) });
  });

  /**
   * DELETE /post-templates/:id
   * Soft deletes a post template
   * 🔒 ИСПРАВЛЕНО (2026-02-16): Защита от удаления если используется в активных розыгрышах
   */
  fastify.delete<{ Params: { id: string } }>('/post-templates/:id', async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;

    const { id } = request.params;

    const template = await prisma.postTemplate.findFirst({
      where: {
        id,
        ownerUserId: user.id,
        deletedAt: null,
      },
    });

    if (!template) {
      return reply.status(404).send({
        ok: false,
        error: 'Post template not found',
      });
    }

    // 🔒 ЗАЩИТА: Проверяем что шаблон не используется в активных розыгрышах
    const activeGiveaways = await prisma.giveaway.count({
      where: {
        postTemplateId: id,
        status: {
          in: ['ACTIVE', 'SCHEDULED', 'PENDING_CONFIRM'],
        },
      },
    });

    if (activeGiveaways > 0) {
      return reply.status(409).send({
        ok: false,
        error: `Невозможно удалить шаблон. Он используется в ${activeGiveaways} активных розыгрышах.`,
        code: 'TEMPLATE_IN_USE',
      });
    }

    const deletedAt = new Date();
    await prisma.postTemplate.update({
      where: { id },
      data: { deletedAt },
    });

    const undoUntil = new Date(deletedAt.getTime() + POST_TEMPLATE_UNDO_WINDOW_MS);

    fastify.log.info({ userId: user.id, templateId: id }, 'Post template soft deleted');

    return reply.success({ undoUntil: undoUntil.toISOString() });
  });

  /**
   * POST /post-templates/:id/undo-delete
   * Restores a soft-deleted post template (within 20s window)
   */
  fastify.post<{ Params: { id: string } }>('/post-templates/:id/undo-delete', async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;

    const { id } = request.params;

    const template = await prisma.postTemplate.findFirst({
      where: {
        id,
        ownerUserId: user.id,
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

    fastify.log.info({ userId: user.id, templateId: id }, 'Post template undo delete');

    return reply.success({ message: 'Success' });
  });

  /**
   * GET /post-templates/:id/media
   * Проксирует медиа файл из Telegram по telegramFileId.
   * Возвращает изображение/видео напрямую (для использования в <img src>).
   */
  fastify.get<{ Params: { id: string } }>('/post-templates/:id/media', async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;

    const { id } = request.params;

    const template = await prisma.postTemplate.findFirst({
      where: {
        id,
        ownerUserId: user.id,
        deletedAt: null,
      },
      select: {
        telegramFileId: true,
        mediaType: true,
      },
    });

    if (!template || !template.telegramFileId) {
      return reply.status(404).send({ ok: false, error: 'Media not found' });
    }

    const botToken = config.botToken;
    if (!botToken) {
      return reply.status(500).send({ ok: false, error: 'Bot not configured' });
    }

    try {
      // Step 1: Get file path from Telegram
      const getFileRes = await fetch(
        `https://api.telegram.org/bot${botToken}/getFile?file_id=${template.telegramFileId}`
      );
      const getFileData = await getFileRes.json() as { ok: boolean; result?: { file_path: string } };

      if (!getFileData.ok || !getFileData.result?.file_path) {
        return reply.status(404).send({ ok: false, error: 'File not found in Telegram' });
      }

      const filePath = getFileData.result.file_path;

      // Step 2: Download the file from Telegram
      const fileUrl = `https://api.telegram.org/file/bot${botToken}/${filePath}`;
      const fileRes = await fetch(fileUrl);

      if (!fileRes.ok) {
        return reply.status(502).send({ ok: false, error: 'Failed to fetch file from Telegram' });
      }

      // Determine content type
      const ext = filePath.split('.').pop()?.toLowerCase();
      const contentTypeMap: Record<string, string> = {
        jpg: 'image/jpeg',
        jpeg: 'image/jpeg',
        png: 'image/png',
        webp: 'image/webp',
        gif: 'image/gif',
        mp4: 'video/mp4',
        mov: 'video/quicktime',
      };
      const contentType = contentTypeMap[ext || ''] || 'application/octet-stream';

      reply.header('Content-Type', contentType);
      reply.header('Cache-Control', 'public, max-age=86400'); // Cache 24h
      reply.header('Access-Control-Allow-Origin', '*');

      const buffer = Buffer.from(await fileRes.arrayBuffer());
      return reply.send(buffer);
    } catch (err) {
      fastify.log.error({ err, templateId: id }, 'Failed to proxy media from Telegram');
      return reply.status(500).send({ ok: false, error: 'Failed to proxy media' });
    }
  });
};
