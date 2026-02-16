import type { FastifyRequest } from 'fastify';
import { prisma } from '@randombeast/database';

/**
 * Типы действий для аудита
 */
export enum AuditAction {
  // Giveaway actions
  GIVEAWAY_CREATED = 'GIVEAWAY_CREATED',
  GIVEAWAY_UPDATED = 'GIVEAWAY_UPDATED',
  GIVEAWAY_DELETED = 'GIVEAWAY_DELETED',
  GIVEAWAY_STARTED = 'GIVEAWAY_STARTED',
  GIVEAWAY_FINISHED = 'GIVEAWAY_FINISHED',
  GIVEAWAY_CANCELLED = 'GIVEAWAY_CANCELLED',
  
  // Channel actions
  CHANNEL_ADDED = 'CHANNEL_ADDED',
  CHANNEL_DELETED = 'CHANNEL_DELETED',
  CHANNEL_UPDATED = 'CHANNEL_UPDATED',
  
  // Participation actions
  PARTICIPANT_JOINED = 'PARTICIPANT_JOINED',
  PARTICIPANT_BANNED = 'PARTICIPANT_BANNED',
  PARTICIPANT_UNBANNED = 'PARTICIPANT_UNBANNED',
  
  // Payment actions
  PAYMENT_INITIATED = 'PAYMENT_INITIATED',
  PAYMENT_COMPLETED = 'PAYMENT_COMPLETED',
  PAYMENT_FAILED = 'PAYMENT_FAILED',
  
  // Data export
  DATA_EXPORTED = 'DATA_EXPORTED',
  
  // Security events
  AUTH_FAILED = 'AUTH_FAILED',
  SUSPICIOUS_ACTIVITY = 'SUSPICIOUS_ACTIVITY',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
}

/**
 * Типы сущностей
 */
export enum AuditEntityType {
  GIVEAWAY = 'giveaway',
  USER = 'user',
  CHANNEL = 'channel',
  PARTICIPATION = 'participation',
  PAYMENT = 'payment',
  SYSTEM = 'system',
}

/**
 * Создает запись в audit log
 */
export async function createAuditLog(params: {
  userId?: string;
  action: AuditAction | string;
  entityType: AuditEntityType | string;
  entityId: string;
  metadata?: Record<string, any>;
  request?: FastifyRequest;
}): Promise<void> {
  try {
    const metadata: Record<string, any> = {
      ...params.metadata,
    };

    // Добавляем данные из request если есть
    if (params.request) {
      metadata.ip = params.request.ip;
      metadata.userAgent = params.request.headers['user-agent'];
      metadata.method = params.request.method;
      metadata.url = params.request.url;
    }

    await prisma.auditLog.create({
      data: {
        userId: params.userId || null,
        action: params.action,
        entityType: params.entityType,
        entityId: params.entityId,
        metadata,
      },
    });
  } catch (error) {
    // Не падаем если audit log не удалось записать
    // Логируем ошибку но продолжаем работу
    console.error('Failed to create audit log:', error);
  }
}

/**
 * Helper для bulk audit logs (для batch операций)
 */
export async function createAuditLogBulk(
  logs: Array<{
    userId?: string;
    action: AuditAction | string;
    entityType: AuditEntityType | string;
    entityId: string;
    metadata?: Record<string, any>;
  }>
): Promise<void> {
  try {
    await prisma.auditLog.createMany({
      data: logs.map(log => ({
        userId: log.userId || null,
        action: log.action,
        entityType: log.entityType,
        entityId: log.entityId,
        metadata: log.metadata || {},
      })),
      skipDuplicates: true,
    });
  } catch (error) {
    console.error('Failed to create audit logs (bulk):', error);
  }
}
