/**
 * RandomBeast — Shared Validation Schemas (Zod)
 *
 * Используются на фронте для предвалидации и на бэке как обязательная валидация.
 * Фронту не доверяем — бэк всегда перевалидирует.
 *
 * @packageDocumentation
 */

import { z } from 'zod';
import { GIVEAWAY_LIMITS, POST_LIMITS, PATTERNS } from './constants.js';

// ============================================================================
// Primitive Schemas
// ============================================================================

/** UUID v4 */
export const uuidSchema = z.string().uuid();

/** Telegram username (с @) */
export const channelUsernameSchema = z
  .string()
  .regex(/^@[a-zA-Z][a-zA-Z0-9_]{3,}$/, 'Формат: @username (минимум 4 символа после @)');

/** Telegram username (без @) */
export const usernameWithoutAtSchema = z
  .string()
  .regex(PATTERNS.TELEGRAM_USERNAME, 'Некорректный Telegram username');

/** URL (только https/http) */
export const urlSchema = z
  .string()
  .url('Некорректная ссылка')
  .regex(PATTERNS.SAFE_URL_PROTOCOLS, 'Допускаются только http/https ссылки');

/** Language code */
export const languageCodeSchema = z.enum(['ru', 'en', 'kk']);

// ============================================================================
// Giveaway Schemas
// ============================================================================

/** Название розыгрыша */
export const giveawayTitleSchema = z
  .string()
  .trim()
  .min(GIVEAWAY_LIMITS.TITLE_MIN_LENGTH, `Минимум ${GIVEAWAY_LIMITS.TITLE_MIN_LENGTH} символа`)
  .max(GIVEAWAY_LIMITS.TITLE_MAX_LENGTH, `Максимум ${GIVEAWAY_LIMITS.TITLE_MAX_LENGTH} символов`);

/** Описание розыгрыша */
export const giveawayDescriptionSchema = z
  .string()
  .trim()
  .max(GIVEAWAY_LIMITS.DESCRIPTION_MAX_LENGTH, `Максимум ${GIVEAWAY_LIMITS.DESCRIPTION_MAX_LENGTH} символов`)
  .optional()
  .nullable();

/** Количество победителей */
export const winnersCountSchema = z
  .number()
  .int('Должно быть целым числом')
  .min(GIVEAWAY_LIMITS.MIN_WINNERS, `Минимум ${GIVEAWAY_LIMITS.MIN_WINNERS}`)
  .max(GIVEAWAY_LIMITS.MAX_WINNERS_BUSINESS, `Максимум ${GIVEAWAY_LIMITS.MAX_WINNERS_BUSINESS}`);

/** Количество резервных победителей */
export const reserveWinnersCountSchema = z
  .number()
  .int()
  .min(0)
  .max(GIVEAWAY_LIMITS.RESERVE_WINNERS_MAX, `Максимум ${GIVEAWAY_LIMITS.RESERVE_WINNERS_MAX}`);

/** Текст кнопки участия */
export const buttonTextSchema = z
  .string()
  .trim()
  .min(1, 'Введите текст кнопки')
  .max(GIVEAWAY_LIMITS.BUTTON_TEXT_MAX_LENGTH, `Максимум ${GIVEAWAY_LIMITS.BUTTON_TEXT_MAX_LENGTH} символов`);

/** Максимум приглашений */
export const inviteMaxSchema = z
  .number()
  .int()
  .min(1, 'Минимум 1')
  .max(10000, 'Максимум 10000');

/** Тип розыгрыша */
export const giveawayTypeSchema = z.enum([
  'STANDARD',
  'BOOST_REQUIRED',
  'INVITE_REQUIRED',
  'CUSTOM',
]);

/** Статус розыгрыша */
export const giveawayStatusSchema = z.enum([
  'DRAFT',
  'PENDING_CONFIRM',
  'SCHEDULED',
  'ACTIVE',
  'FINISHED',
  'CANCELLED',
  'ERROR',
]);

/** Режим публикации итогов */
export const publishResultsModeSchema = z.enum([
  'SEPARATE_POSTS',
  'EDIT_START_POST',
  'RANDOMIZER',
]);

/** Режим капчи */
export const captchaModeSchema = z.enum(['OFF', 'SUSPICIOUS_ONLY', 'ALL']);

// ============================================================================
// Custom Task Schema
// ============================================================================

/** Кастомное задание */
export const customTaskSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, 'Введите описание задания')
    .max(200, 'Максимум 200 символов'),
  url: urlSchema,
});

/** Массив кастомных заданий */
export const customTasksArraySchema = z
  .array(customTaskSchema)
  .max(GIVEAWAY_LIMITS.MAX_CUSTOM_TASKS, `Максимум ${GIVEAWAY_LIMITS.MAX_CUSTOM_TASKS} заданий`);

// ============================================================================
// Post Template Schemas
// ============================================================================

/** Текст поста (без медиа) */
export const postTextSchema = z
  .string()
  .trim()
  .min(1, 'Введите текст поста')
  .max(POST_LIMITS.TEXT_MAX_LENGTH, `Максимум ${POST_LIMITS.TEXT_MAX_LENGTH} символов`);

/** Текст поста (с медиа — caption) */
export const postCaptionSchema = z
  .string()
  .trim()
  .min(1, 'Введите текст поста')
  .max(POST_LIMITS.CAPTION_MAX_LENGTH, `Максимум ${POST_LIMITS.CAPTION_MAX_LENGTH} символов`);

// ============================================================================
// Date Schemas
// ============================================================================

/** Дата в будущем (ISO string) */
export const futureDateSchema = z
  .string()
  .datetime({ message: 'Некорректный формат даты' })
  .refine(
    (date) => new Date(date) > new Date(),
    { message: 'Дата должна быть в будущем' }
  );

/** Дата в будущем (опциональная) */
export const optionalFutureDateSchema = futureDateSchema.optional().nullable();

// ============================================================================
// Channel Schemas
// ============================================================================

/** Массив ID каналов */
export const channelIdsSchema = z
  .array(uuidSchema)
  .min(1, 'Выберите хотя бы один канал');

/** Массив ID каналов (опционально пустой) */
export const optionalChannelIdsSchema = z.array(uuidSchema);

// ============================================================================
// Payment Schemas
// ============================================================================

/** Создание платежа */
export const createPaymentSchema = z.object({
  productCode: z.string().min(1, 'Укажите код продукта'),
});

// ============================================================================
// Composite Schemas: Create Giveaway
// ============================================================================

/**
 * Схема создания розыгрыша (финальная валидация при подтверждении).
 * Wizard шаги могут быть частичными — эта схема для полного объекта.
 */
export const createGiveawaySchema = z.object({
  title: giveawayTitleSchema,
  description: giveawayDescriptionSchema,
  type: giveawayTypeSchema,
  language: languageCodeSchema,
  postTemplateId: uuidSchema.optional().nullable(),
  buttonText: buttonTextSchema,
  winnersCount: winnersCountSchema,
  startAt: optionalFutureDateSchema,
  endAt: futureDateSchema,
  publishResultsMode: publishResultsModeSchema,
  requiredSubscriptionChannelIds: optionalChannelIdsSchema,
  publishChannelIds: channelIdsSchema,
  resultsChannelIds: optionalChannelIdsSchema,
  captchaMode: captchaModeSchema,
  livenessEnabled: z.boolean().default(false),
  inviteEnabled: z.boolean().default(false),
  inviteMax: inviteMaxSchema.optional().nullable(),
  boostEnabled: z.boolean().default(false),
  boostChannelIds: optionalChannelIdsSchema.optional(),
  storiesEnabled: z.boolean().default(false),
  customTasks: customTasksArraySchema.optional(),
});

/** Тип для результата парсинга createGiveawaySchema */
export type CreateGiveawayInput = z.infer<typeof createGiveawaySchema>;

/**
 * Схема обновления розыгрыша (все поля опциональные).
 */
export const updateGiveawaySchema = createGiveawaySchema.partial();

/** Тип для результата парсинга updateGiveawaySchema */
export type UpdateGiveawayInput = z.infer<typeof updateGiveawaySchema>;

// ============================================================================
// Pagination Schema
// ============================================================================

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type PaginationInput = z.infer<typeof paginationSchema>;
