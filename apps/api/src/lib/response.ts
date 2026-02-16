/**
 * RandomBeast — Response Helpers
 *
 * Утилиты для форматирования API ответов в стандартном формате.
 * Добавляет decorators в Fastify reply для удобного использования.
 *
 * @packageDocumentation
 */

import type { FastifyReply } from 'fastify';
import {
  ApiResponse,
  ApiError,
  formatSuccess,
  formatError,
  formatPaginated,
  HTTP_STATUS,
  errorCodeToHttpStatus,
  ErrorCode,
} from '@randombeast/shared';

// ============================================================================
// Reply Decorators
// ============================================================================

declare module 'fastify' {
  interface FastifyReply {
    /**
     * Send successful response with data
     * @example reply.success({ id: '123' })
     */
    success<T>(data: T, statusCode?: number): FastifyReply;

    /**
     * Send successful response with pagination
     * @example reply.paginated(items, { page: 1, limit: 20, total: 100 })
     */
    paginated<T>(
      data: T[],
      pagination: {
        page?: number;
        limit?: number;
        total: number;
        cursor?: string;
        hasMore?: boolean;
      },
      statusCode?: number
    ): FastifyReply;

    /**
     * Send error response
     * @example reply.error(ErrorCode.VALIDATION_ERROR, 'Invalid input', { field: 'email' })
     */
    error(code: ErrorCode | string, message: string, details?: ApiError['error']['details']): FastifyReply;

    /**
     * Send unauthorized error (401)
     * @example reply.unauthorized('Invalid token')
     */
    unauthorized(message?: string, details?: ApiError['error']['details']): FastifyReply;

    /**
     * Send forbidden error (403)
     * @example reply.forbidden('Access denied')
     */
    forbidden(message?: string, details?: ApiError['error']['details']): FastifyReply;

    /**
     * Send not found error (404)
     * @example reply.notFound('Giveaway not found')
     */
    notFound(message?: string, details?: ApiError['error']['details']): FastifyReply;

    /**
     * Send validation error (400)
     * @example reply.badRequest('Invalid input', [{ field: 'email', message: 'Required' }])
     */
    badRequest(message?: string, details?: ApiError['error']['details']): FastifyReply;

    /**
     * Send conflict error (409)
     * @example reply.conflict('User already exists')
     */
    conflict(message?: string, details?: ApiError['error']['details']): FastifyReply;
  }
}

// ============================================================================
// Implementation
// ============================================================================

/**
 * Register response helpers as Fastify decorators
 */
export function registerResponseHelpers(reply: FastifyReply): void {
  // Success response
  reply.success = function <T>(data: T, statusCode: number = HTTP_STATUS.OK) {
    const response: ApiResponse<T> = formatSuccess(data);
    return this.code(statusCode).send(response);
  };

  // Paginated response
  reply.paginated = function <T>(
    data: T[],
    pagination: {
      page?: number;
      limit?: number;
      total: number;
      cursor?: string;
      hasMore?: boolean;
    },
    statusCode: number = HTTP_STATUS.OK
  ) {
    const response = formatPaginated(data, pagination);
    return this.code(statusCode).send(response);
  };

  // Generic error response
  reply.error = function (
    code: ErrorCode | string,
    message: string,
    details?: ApiError['error']['details']
  ) {
    const response = formatError(code, message, details);
    const statusCode = typeof code === 'number' ? errorCodeToHttpStatus(code) : HTTP_STATUS.BAD_REQUEST;
    return this.code(statusCode).send(response);
  };

  // Unauthorized (401)
  reply.unauthorized = function (message = 'Unauthorized', details?: ApiError['error']['details']) {
    const response = formatError(ErrorCode.UNAUTHORIZED, message, details);
    return this.code(HTTP_STATUS.UNAUTHORIZED).send(response);
  };

  // Forbidden (403)
  reply.forbidden = function (message = 'Forbidden', details?: ApiError['error']['details']) {
    const response = formatError(ErrorCode.FORBIDDEN, message, details);
    return this.code(HTTP_STATUS.FORBIDDEN).send(response);
  };

  // Not Found (404)
  reply.notFound = function (message = 'Not found', details?: ApiError['error']['details']) {
    const response = formatError(ErrorCode.GIVEAWAY_NOT_FOUND, message, details);
    return this.code(HTTP_STATUS.NOT_FOUND).send(response);
  };

  // Bad Request (400)
  reply.badRequest = function (message = 'Bad request', details?: ApiError['error']['details']) {
    const response = formatError(ErrorCode.VALIDATION_ERROR, message, details);
    return this.code(HTTP_STATUS.BAD_REQUEST).send(response);
  };

  // Conflict (409)
  reply.conflict = function (message = 'Conflict', details?: ApiError['error']['details']) {
    const response = formatError(ErrorCode.ALREADY_PARTICIPATED, message, details);
    return this.code(HTTP_STATUS.CONFLICT).send(response);
  };
}

// ============================================================================
// Fastify Plugin
// ============================================================================

import fp from 'fastify-plugin';

export default fp(async (fastify) => {
  fastify.decorateReply('success', null);
  fastify.decorateReply('paginated', null);
  fastify.decorateReply('error', null);
  fastify.decorateReply('unauthorized', null);
  fastify.decorateReply('forbidden', null);
  fastify.decorateReply('notFound', null);
  fastify.decorateReply('badRequest', null);
  fastify.decorateReply('conflict', null);

  fastify.addHook('onRequest', async (request, reply) => {
    registerResponseHelpers(reply);
  });
});
