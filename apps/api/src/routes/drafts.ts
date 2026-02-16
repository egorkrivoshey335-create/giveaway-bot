import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma, GiveawayStatus, Prisma } from '@randombeast/database';
import { WIZARD_STEPS, type WizardStep } from '@randombeast/shared';
import { ErrorCode } from '@randombeast/shared';
import { requireUser } from '../plugins/auth.js';

// Zod schemas
const createDraftBodySchema = z.object({
  wizardStep: z.string().optional(),
}).optional();

// DraftPayload schema with partial fields allowed
// Language accepts both 'ru' and 'RU' formats, will be normalized on save
const draftPayloadSchema = z.object({
  type: z.enum(['STANDARD', 'BOOST_REQUIRED', 'INVITE_REQUIRED', 'CUSTOM']).optional(),
  title: z.string().optional(),
  language: z.string().optional().transform(val => val?.toLowerCase() as 'ru' | 'en' | 'kk' | undefined),
  postTemplateId: z.string().nullable().optional(),
  buttonText: z.string().optional(),
  winnersCount: z.number().min(1).max(100).optional(),
  requiredSubscriptionChannelIds: z.array(z.string()).optional(),
  publishChannelIds: z.array(z.string()).optional(),
  resultsChannelIds: z.array(z.string()).optional(),
  publishResultsMode: z.enum(['SEPARATE_POSTS', 'EDIT_START_POST', 'RANDOMIZER']).optional(),
}).passthrough();

/**
 * Normalize draft payload for consistent storage
 */
function normalizeDraftPayload(payload: Record<string, unknown>): Record<string, unknown> {
  const normalized = { ...payload };

  // Normalize language to lowercase
  if (typeof normalized.language === 'string') {
    normalized.language = normalized.language.toLowerCase();
  }

  return normalized;
}

const updateDraftBodySchema = z.object({
  wizardStep: z.enum(WIZARD_STEPS as unknown as [WizardStep, ...WizardStep[]]),
  draftPayload: draftPayloadSchema,
});

// Types
interface DraftResponse {
  id: string;
  wizardStep: string | null;
  draftPayload: unknown;
  draftVersion: number;
  createdAt: string;
  updatedAt: string;
}

function serializeDraft(draft: {
  id: string;
  wizardStep: string | null;
  draftPayload: unknown;
  draftVersion: number;
  createdAt: Date;
  updatedAt: Date;
}): DraftResponse {
  return {
    id: draft.id,
    wizardStep: draft.wizardStep,
    draftPayload: draft.draftPayload,
    draftVersion: draft.draftVersion,
    createdAt: draft.createdAt.toISOString(),
    updatedAt: draft.updatedAt.toISOString(),
  };
}

export const draftsRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * GET /drafts/giveaway
   * Returns current user's draft giveaway or null
   */
  fastify.get('/drafts/giveaway', async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;

    const draft = await prisma.giveaway.findFirst({
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
      orderBy: {
        updatedAt: 'desc',
      },
    });

    return reply.success({ draft: draft ? serializeDraft(draft) : null });
  });

  /**
   * POST /drafts/giveaway
   * Creates a new draft or returns existing one
   */
  fastify.post('/drafts/giveaway', async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;

    const body = createDraftBodySchema.parse(request.body);

    // Check if user already has a draft
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
      return reply.success({ draft: serializeDraft(existingDraft),
        created: false });
    }

    // Create new draft
    const newDraft = await prisma.giveaway.create({
      data: {
        ownerUserId: user.id,
        status: GiveawayStatus.DRAFT,
        wizardStep: body?.wizardStep || 'TYPE',
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

    fastify.log.info({ userId: user.id, draftId: newDraft.id }, 'Draft giveaway created');

    return reply.status(201).send({
      ok: true,
      draft: serializeDraft(newDraft),
      created: true,
    });
  });

  /**
   * PATCH /drafts/giveaway/:id
   * Updates draft payload and wizard step
   */
  fastify.patch<{ Params: { id: string } }>('/drafts/giveaway/:id', async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;

    const { id } = request.params;
    
    try {
      const body = updateDraftBodySchema.parse(request.body);

      // Find draft and verify ownership
      const draft = await prisma.giveaway.findFirst({
        where: {
          id,
          ownerUserId: user.id,
          status: GiveawayStatus.DRAFT,
        },
      });

      if (!draft) {
        return reply.status(404).send({
          ok: false,
          error: 'Draft not found or access denied',
        });
      }

      // Merge existing payload with new data and normalize
      const existingPayload = (draft.draftPayload as Record<string, unknown>) || {};
      const mergedPayload = normalizeDraftPayload({ ...existingPayload, ...body.draftPayload });

      // Update draft
      const updatedDraft = await prisma.giveaway.update({
        where: { id },
        data: {
          wizardStep: body.wizardStep,
          draftPayload: mergedPayload as Prisma.InputJsonValue,
          draftVersion: { increment: 1 },
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

      return reply.success({ draft: serializeDraft(updatedDraft) });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({
          ok: false,
          error: 'Invalid request body',
          details: error.errors,
        });
      }
      throw error;
    }
  });

  /**
   * POST /drafts/giveaway/:id/discard
   * Cancels (soft-deletes) a draft
   */
  fastify.post<{ Params: { id: string } }>('/drafts/giveaway/:id/discard', async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;

    const { id } = request.params;

    // Find draft and verify ownership
    const draft = await prisma.giveaway.findFirst({
      where: {
        id,
        ownerUserId: user.id,
        status: GiveawayStatus.DRAFT,
      },
    });

    if (!draft) {
      return reply.status(404).send({
        ok: false,
        error: 'Draft not found or access denied',
      });
    }

    // Soft delete by changing status to CANCELLED and clearing payload
    await prisma.giveaway.update({
      where: { id },
      data: {
        status: GiveawayStatus.CANCELLED,
        draftPayload: Prisma.DbNull,
        wizardStep: null,
      },
    });

    fastify.log.info({ userId: user.id, draftId: id }, 'Draft giveaway discarded');

    return reply.success({ message: 'Success' });
  });
};
