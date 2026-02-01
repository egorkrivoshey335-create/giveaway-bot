import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma, MediaType } from '@randombeast/database';
import { POST_LIMITS, POST_TEMPLATE_UNDO_WINDOW_MS } from '@randombeast/shared';
import { requireUser } from '../plugins/auth.js';

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

    return reply.send({
      ok: true,
      templates: templates.map(serializePostTemplate),
    });
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

    return reply.send({
      ok: true,
      template: serializePostTemplate(template),
    });
  });

  /**
   * DELETE /post-templates/:id
   * Soft deletes a post template
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

    const deletedAt = new Date();
    await prisma.postTemplate.update({
      where: { id },
      data: { deletedAt },
    });

    const undoUntil = new Date(deletedAt.getTime() + POST_TEMPLATE_UNDO_WINDOW_MS);

    fastify.log.info({ userId: user.id, templateId: id }, 'Post template soft deleted');

    return reply.send({
      ok: true,
      undoUntil: undoUntil.toISOString(),
    });
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

    return reply.send({ ok: true });
  });
};
