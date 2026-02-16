/**
 * RandomBeast — Standard API Response Types
 *
 * Стандартизованные типы для всех API ответов.
 * Используются в Fastify API и клиентских библиотеках.
 *
 * @packageDocumentation
 */

import { ErrorCode } from './types.js';

// ============================================================================
// Success Response
// ============================================================================

/**
 * Standard success response wrapper
 */
export interface ApiResponse<T = unknown> {
  /** Always true for successful responses */
  success: true;
  /** Response data */
  data: T;
  /** Optional metadata (pagination, deprecation warnings, etc.) */
  meta?: {
    /** Current page number */
    page?: number;
    /** Items per page */
    limit?: number;
    /** Total items count */
    total?: number;
    /** Cursor for cursor-based pagination */
    cursor?: string;
    /** Has more items */
    hasMore?: boolean;
    /** Deprecation warning */
    deprecated?: string;
    /** API version */
    version?: string;
  };
}

// ============================================================================
// Error Response
// ============================================================================

/**
 * Standard error response
 */
export interface ApiError {
  /** Always false for error responses */
  success: false;
  /** Error details */
  error: {
    /** Error code from ErrorCode enum */
    code: ErrorCode | string;
    /** Human-readable error message (i18n key or direct message) */
    message: string;
    /** Optional additional details (validation errors, etc.) */
    details?: Record<string, unknown> | Array<{ field: string; message: string }>;
  };
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Create a success response
 */
export function formatSuccess<T>(data: T, meta?: ApiResponse['meta']): ApiResponse<T> {
  return {
    success: true,
    data,
    ...(meta && { meta }),
  };
}

/**
 * Create an error response
 */
export function formatError(
  code: ErrorCode | string,
  message: string,
  details?: ApiError['error']['details']
): ApiError {
  return {
    success: false,
    error: {
      code,
      message,
      ...(details && { details }),
    },
  };
}

/**
 * Create a paginated success response
 */
export function formatPaginated<T>(
  data: T[],
  pagination: {
    page?: number;
    limit?: number;
    total: number;
    cursor?: string;
    hasMore?: boolean;
  }
): ApiResponse<T[]> {
  return {
    success: true,
    data,
    meta: {
      page: pagination.page,
      limit: pagination.limit,
      total: pagination.total,
      cursor: pagination.cursor,
      hasMore: pagination.hasMore,
    },
  };
}

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Check if response is successful
 */
export function isApiSuccess<T>(response: ApiResponse<T> | ApiError): response is ApiResponse<T> {
  return response.success === true;
}

/**
 * Check if response is an error
 */
export function isApiError(response: ApiResponse | ApiError): response is ApiError {
  return response.success === false;
}

// ============================================================================
// HTTP Status Codes (standard mapping)
// ============================================================================

export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  UNPROCESSABLE_ENTITY: 422,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_SERVER_ERROR: 500,
  SERVICE_UNAVAILABLE: 503,
} as const;

/**
 * Map ErrorCode to HTTP status code
 */
export function errorCodeToHttpStatus(code: ErrorCode): number {
  // Auth errors (1xxx) → 401
  if (code >= 1000 && code < 2000) {
    return HTTP_STATUS.UNAUTHORIZED;
  }
  
  // Validation errors (2xxx) → 400
  if (code >= 2000 && code < 3000) {
    return HTTP_STATUS.BAD_REQUEST;
  }
  
  // Business logic errors (3xxx) → 400/404/409
  if (code >= 3000 && code < 4000) {
    if (code === ErrorCode.GIVEAWAY_NOT_FOUND || code === ErrorCode.CHANNEL_NOT_FOUND) {
      return HTTP_STATUS.NOT_FOUND;
    }
    if (code === ErrorCode.ALREADY_PARTICIPATED) {
      return HTTP_STATUS.CONFLICT;
    }
    if (code === ErrorCode.ENTITLEMENT_REQUIRED) {
      return HTTP_STATUS.FORBIDDEN;
    }
    return HTTP_STATUS.BAD_REQUEST;
  }
  
  // External errors (4xxx) → 500/503
  if (code >= 4000 && code < 5000) {
    return HTTP_STATUS.SERVICE_UNAVAILABLE;
  }
  
  // Internal errors (5xxx) → 500
  return HTTP_STATUS.INTERNAL_SERVER_ERROR;
}
