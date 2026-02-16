/**
 * RandomBeast — Shared Types
 * 
 * Этот файл содержит все общие типы, enum и интерфейсы,
 * используемые в bot, api и web приложениях.
 * 
 * @packageDocumentation
 */

// ============================================================================
// Language & Localization
// ============================================================================

/**
 * Supported language codes (lowercase for API/display use).
 * 
 * Note: Prisma schema uses uppercase enum values (RU, EN, KK).
 * The API maps between lowercase (frontend) and uppercase (database)
 * when saving/loading data.
 */
export type LanguageCode = 'ru' | 'en' | 'kk';

/**
 * Default language for the application
 */
export const DEFAULT_LANGUAGE: LanguageCode = 'ru';

/**
 * All supported languages
 */
export const SUPPORTED_LANGUAGES: readonly LanguageCode[] = ['ru', 'en', 'kk'] as const;

// ============================================================================
// Channel Types
// ============================================================================

/**
 * Type of Telegram chat
 */
export enum ChannelType {
  CHANNEL = 'CHANNEL',
  GROUP = 'GROUP',
  SUPERGROUP = 'SUPERGROUP',
}

/**
 * Channel entity (simplified for shared usage)
 */
export interface IChannel {
  id: string;
  telegramChatId: number;
  username: string | null;
  title: string;
  type: ChannelType;
  addedByUserId: string;
  botIsAdmin: boolean;
  creatorIsAdmin: boolean;
  memberCount: number | null;
}

// ============================================================================
// Media Types
// ============================================================================

/**
 * Type of media attachment
 */
export enum MediaType {
  NONE = 'NONE',
  PHOTO = 'PHOTO',
  VIDEO = 'VIDEO',
}

/**
 * Media reference for sending via Telegram
 */
export interface IMediaReference {
  type: Exclude<MediaType, MediaType.NONE>;
  fileId: string;
  fileUniqueId: string;
  needsReupload: boolean;
}

// ============================================================================
// Giveaway Types
// ============================================================================

/**
 * Type of giveaway determining available conditions
 */
export enum GiveawayType {
  /** Basic giveaway with subscription requirements only */
  STANDARD = 'STANDARD',
  /** Requires channel boost */
  BOOST_REQUIRED = 'BOOST_REQUIRED',
  /** Rewards invites with extra tickets */
  INVITE_REQUIRED = 'INVITE_REQUIRED',
  /** Custom conditions and tasks */
  CUSTOM = 'CUSTOM',
}

/**
 * Giveaway lifecycle status
 */
export enum GiveawayStatus {
  /** Being created, not published yet */
  DRAFT = 'DRAFT',
  /** Awaiting creator confirmation before publishing */
  PENDING_CONFIRM = 'PENDING_CONFIRM',
  /** Scheduled for future start */
  SCHEDULED = 'SCHEDULED',
  /** Currently accepting participants */
  ACTIVE = 'ACTIVE',
  /** Winners selected, giveaway complete */
  FINISHED = 'FINISHED',
  /** Cancelled by creator */
  CANCELLED = 'CANCELLED',
  /** Error during processing */
  ERROR = 'ERROR',
}

/**
 * How to publish giveaway results
 */
export enum PublishResultsMode {
  /** Post results as separate messages */
  SEPARATE_POSTS = 'SEPARATE_POSTS',
  /** Edit the original giveaway post */
  EDIT_START_POST = 'EDIT_START_POST',
  /** Announce winners via randomizer on site */
  RANDOMIZER = 'RANDOMIZER',
}

/**
 * Captcha verification mode
 */
export enum CaptchaMode {
  /** No captcha */
  OFF = 'OFF',
  /** Show captcha only for suspicious accounts */
  SUSPICIOUS_ONLY = 'SUSPICIOUS_ONLY',
  /** Always show captcha */
  ALL = 'ALL',
}

/**
 * Custom task for giveaway participation
 */
export interface ICustomTask {
  /** Unique task identifier */
  id: string;
  /** Task title (e.g., "Subscribe to YouTube") */
  title: string;
  /** URL to open when clicking the task */
  url: string;
  /** 
   * Bonus tickets for completing this task.
   * 0 = mandatory task (must complete to participate)
   * >0 = optional bonus
   */
  bonusTickets: number;
}

/**
 * Giveaway conditions configuration
 */
export interface IGiveawayConditions {
  /** Channel IDs where subscription is required */
  requiredChannelIds: string[];
  /** Channel IDs where boost is required/gives bonus */
  boostChannelIds: string[];
  /** Whether boost is mandatory */
  boostRequired: boolean;
  /** Whether invite system is enabled */
  inviteEnabled: boolean;
  /** Maximum extra tickets from invites (0 = unlimited) */
  inviteMaxTickets: number;
  /** 
   * Whether stories repost is enabled.
   * ⚠️ LIMITATION: Cannot be verified via Telegram API!
   * This is honor-based only.
   */
  storiesEnabled: boolean;
  /** Captcha verification mode */
  captchaMode: CaptchaMode;
  /** Whether liveness check is enabled (paid feature) */
  livenessEnabled: boolean;
  /** Custom tasks for participants */
  customTasks: ICustomTask[];
}

/**
 * Published message reference
 */
export interface IPublishedMessage {
  /** Internal channel ID */
  channelId: string;
  /** Telegram chat ID */
  telegramChatId: number;
  /** Telegram message ID */
  messageId: number;
  /** When the message was published */
  publishedAt: string; // ISO date string
}

/**
 * Giveaway publication settings
 */
export interface IGiveawayPublication {
  /** Channels to publish the giveaway to */
  publishToChannelIds: string[];
  /** Channels to send results to */
  resultsToChannelIds: string[];
  /** Published messages (for editing later) */
  publishedMessages: IPublishedMessage[];
}

/**
 * Giveaway entity (simplified)
 */
export interface IGiveaway {
  id: string;
  ownerUserId: string;
  title: string;
  description: string | null;
  language: LanguageCode;
  type: GiveawayType;
  status: GiveawayStatus;
  startAt: string | null; // ISO date
  endAt: string; // ISO date
  timezone: string;
  winnersCount: number;
  reserveWinnersCount: number;
  buttonText: string;
  publishResultsMode: PublishResultsMode;
  isPublicInCatalog: boolean;
  totalParticipants: number;
  conditions: IGiveawayConditions;
  publication: IGiveawayPublication;
  createdAt: string;
  updatedAt: string;
}

// ============================================================================
// Participation Types
// ============================================================================

/**
 * Participation status
 */
export enum ParticipationStatus {
  /** Successfully joined */
  JOINED = 'JOINED',
  /** Failed captcha verification */
  FAILED_CAPTCHA = 'FAILED_CAPTCHA',
  /** Failed subscription check */
  FAILED_SUBSCRIPTION = 'FAILED_SUBSCRIPTION',
  /** Banned from participation */
  BANNED = 'BANNED',
}

/**
 * Condition check result
 */
export interface IConditionCheckResult {
  /** Condition identifier */
  id: string;
  /** Type of condition */
  type: 'subscription' | 'boost' | 'captcha' | 'task';
  /** Whether the condition is met */
  passed: boolean;
  /** Channel ID (for subscription/boost) */
  channelId?: string;
  /** Task ID (for custom tasks) */
  taskId?: string;
}

/**
 * Snapshot of conditions at participation time
 */
export interface IConditionsSnapshot {
  subscriptions: Array<{ channelId: string; passed: boolean }>;
  boosts: Array<{ channelId: string; passed: boolean }>;
  captchaPassed: boolean;
  customTasks: Array<{ taskId: string; clicked: boolean }>;
  checkedAt: string; // ISO date
}

/**
 * Participation entity
 */
export interface IParticipation {
  id: string;
  giveawayId: string;
  userId: string;
  status: ParticipationStatus;
  joinedAt: string;
  ticketsBase: number;
  ticketsExtra: number;
  sourceTag: string | null;
  referrerUserId: string | null;
  conditionsSnapshot: IConditionsSnapshot;
  fraudScore: number;
}

// ============================================================================
// Payment Types
// ============================================================================

/**
 * Product type
 */
export enum ProductType {
  /** Recurring subscription */
  SUBSCRIPTION = 'SUBSCRIPTION',
  /** One-time purchase */
  ONE_TIME = 'ONE_TIME',
}

/**
 * Purchase status
 */
export enum PurchaseStatus {
  /** Payment initiated, awaiting completion */
  PENDING = 'PENDING',
  /** Payment successful */
  COMPLETED = 'COMPLETED',
  /** Payment failed */
  FAILED = 'FAILED',
  /** Payment refunded */
  REFUNDED = 'REFUNDED',
}

/**
 * Product entity
 */
export interface IProduct {
  id: string;
  code: string;
  title: string;
  description: string | null;
  price: number; // in rubles
  currency: string;
  periodDays: number | null;
  type: ProductType;
  entitlementCode: string;
  isActive: boolean;
}

/**
 * Purchase entity
 */
export interface IPurchase {
  id: string;
  userId: string;
  productId: string;
  status: PurchaseStatus;
  provider: string;
  externalId: string | null;
  amount: number;
  currency: string;
  paidAt: string | null;
  createdAt: string;
}

/**
 * Entitlement entity (access right)
 */
export interface IEntitlement {
  id: string;
  userId: string;
  code: string;
  sourceType: 'purchase' | 'promo' | 'manual';
  sourceId: string | null;
  expiresAt: string | null; // null = permanent
  createdAt: string;
  revokedAt: string | null;
}

/**
 * Known entitlement codes
 */
export type EntitlementCode = 
  | 'catalog.access'      // Access to giveaway catalog
  | 'liveness.check'      // Liveness verification feature
  | 'analytics.advanced'; // Advanced analytics dashboard

// ============================================================================
// User Types
// ============================================================================

/**
 * User entity
 */
export interface IUser {
  id: string;
  telegramUserId: number;
  username: string | null;
  firstName: string;
  lastName: string | null;
  languageCode: LanguageCode;
  isPremium: boolean;
  createdAt: string;
  updatedAt: string;
}

// ============================================================================
// API Types
// ============================================================================

/**
 * API error codes
 */
export enum ErrorCode {
  // Auth errors (1xxx)
  UNAUTHORIZED = 1001,
  INVALID_INIT_DATA = 1002,
  SESSION_EXPIRED = 1003,
  FORBIDDEN = 1004,
  
  // Validation errors (2xxx)
  VALIDATION_ERROR = 2001,
  MISSING_REQUIRED_FIELD = 2002,
  INVALID_FORMAT = 2003,
  RATE_LIMIT_EXCEEDED = 2004,
  
  // Business logic errors (3xxx)
  GIVEAWAY_NOT_FOUND = 3001,
  GIVEAWAY_NOT_ACTIVE = 3002,
  ALREADY_PARTICIPATED = 3003,
  CONDITIONS_NOT_MET = 3004,
  CHANNEL_NOT_FOUND = 3005,
  BOT_NOT_ADMIN = 3006,
  ENTITLEMENT_REQUIRED = 3007,
  CHANNEL_IN_USE = 3008,
  
  // External errors (4xxx)
  TELEGRAM_API_ERROR = 4001,
  BOT_API_ERROR = 4001, // Alias for TELEGRAM_API_ERROR
  PAYMENT_ERROR = 4002,
  MEDIA_UPLOAD_ERROR = 4003,
  
  // Internal errors (5xxx)
  INTERNAL_ERROR = 5001,
  DATABASE_ERROR = 5002,
  QUEUE_ERROR = 5003,
}

/**
 * Standard API error response
 */
export interface IApiError {
  error: string;
  code: ErrorCode;
  details?: Record<string, unknown>;
}

/**
 * Standard API success response
 */
export interface IApiResponse<T> {
  data: T;
  meta?: {
    page?: number;
    limit?: number;
    total?: number;
  };
}

// ============================================================================
// Draft Types
// ============================================================================

/**
 * Draft type for wizard auto-save
 */
export type DraftType = 'giveaway' | 'post_template';

/**
 * Шаги wizard'а для создания розыгрыша
 */
export type WizardStep = 
  | 'TYPE' 
  | 'BASICS' 
  | 'SUBSCRIPTIONS' 
  | 'PUBLISH' 
  | 'RESULTS' 
  | 'DATES'       // Дата начала и окончания
  | 'WINNERS'     // Количество победителей
  | 'PROTECTION'  // Защита от ботов (капча, liveness)
  | 'EXTRAS'      // Дополнительные билеты (инвайты, бусты, сторис)
  | 'REVIEW';

/**
 * Все шаги wizard'а по порядку
 */
export const WIZARD_STEPS: readonly WizardStep[] = [
  'TYPE',
  'BASICS', 
  'SUBSCRIPTIONS',
  'PUBLISH',
  'RESULTS',
  'DATES',
  'WINNERS',
  'PROTECTION',
  'EXTRAS',
  'REVIEW',
] as const;

/**
 * Названия шагов wizard'а
 */
export const WIZARD_STEP_LABELS: Record<WizardStep, string> = {
  TYPE: 'Тип розыгрыша',
  BASICS: 'Основные настройки',
  SUBSCRIPTIONS: 'Подписки',
  PUBLISH: 'Публикация',
  RESULTS: 'Итоги',
  DATES: 'Даты',
  WINNERS: 'Победители',
  PROTECTION: 'Защита',
  EXTRAS: 'Доп. билеты',
  REVIEW: 'Проверка',
};

/**
 * Режим капчи для защиты от ботов
 */
export type CaptchaModeType = 'OFF' | 'SUSPICIOUS_ONLY' | 'ALL';

/**
 * Данные черновика розыгрыша, хранящиеся в JSON поле draftPayload
 */
export interface GiveawayDraftPayload {
  /** Тип розыгрыша */
  type?: GiveawayType;
  /** Название розыгрыша */
  title?: string;
  /** Язык розыгрыша */
  language?: LanguageCode;
  /** ID шаблона поста */
  postTemplateId?: string | null;
  /** Текст кнопки */
  buttonText?: string;
  /** Количество победителей */
  winnersCount?: number;
  /** Дата и время начала (ISO string или null = сразу) */
  startAt?: string | null;
  /** Дата и время окончания (ISO string или null = не указано) */
  endAt?: string | null;
  /** ID каналов для обязательной подписки */
  requiredSubscriptionChannelIds?: string[];
  /** ID каналов для публикации розыгрыша */
  publishChannelIds?: string[];
  /** ID каналов для публикации итогов */
  resultsChannelIds?: string[];
  /** Способ публикации итогов */
  publishResultsMode?: PublishResultsMode;
  /** Режим капчи: OFF, SUSPICIOUS_ONLY, ALL */
  captchaMode?: CaptchaModeType;
  /** Включена ли проверка Liveness (камера) — платная фича */
  livenessEnabled?: boolean;
  
  // === Дополнительные билеты ===
  
  /** Включены ли приглашения друзей */
  inviteEnabled?: boolean;
  /** Максимальное количество приглашений на участника */
  inviteMax?: number;
  
  /** Включены ли бусты каналов для доп. билетов */
  boostEnabled?: boolean;
  /** ID каналов для бустов */
  boostChannelIds?: string[];
  
  /** Включен ли постинг в сторис */
  storiesEnabled?: boolean;
}

/**
 * Giveaway draft data (partial giveaway for wizard)
 * @deprecated Use GiveawayDraftPayload instead
 */
export interface IGiveawayDraft {
  step: number;
  title?: string;
  description?: string;
  type?: GiveawayType;
  winnersCount?: number;
  endAt?: string;
  conditions?: Partial<IGiveawayConditions>;
  publication?: Partial<IGiveawayPublication>;
  postText?: string;
  mediaType?: MediaType;
  mediaFileId?: string;
  updatedAt: string;
}

// ============================================================================
// Telegram API Limitations Documentation
// ============================================================================

/**
 * Documentation of Telegram Bot API limitations
 * These limitations affect feature implementation.
 */
export const TELEGRAM_API_LIMITATIONS = {
  /**
   * Stories verification is NOT available.
   * There is no Bot API method to check if a user shared a story.
   * This feature can only be honor-based.
   */
  storiesVerification: {
    available: false,
    reason: 'No Bot API method to verify story reposts',
    workaround: 'Honor-based system or skip verification',
  },
  
  /**
   * Boost verification IS available.
   * Use getUserChatBoosts(chat_id, user_id) method.
   * Requires bot to be admin in the channel.
   */
  boostVerification: {
    available: true,
    method: 'getUserChatBoosts',
    requirements: ['Bot must be admin in the channel'],
  },
  
  /**
   * Subscription verification IS available.
   * Use getChatMember(chat_id, user_id) method.
   * Bot must be member of the channel/group.
   */
  subscriptionVerification: {
    available: true,
    method: 'getChatMember',
    requirements: ['Bot must be member of the chat'],
  },
  
  /**
   * Invite tracking is LIMITED.
   * Can only track invites via startapp parameter.
   * Cannot verify actual invites to channels.
   */
  inviteTracking: {
    available: true,
    limitation: 'Only via startapp deep link parameter',
    method: 'Parse startapp param for referrer ID',
  },
  
  /**
   * file_id can expire or become invalid.
   * Need to handle re-upload scenarios.
   */
  fileIdExpiration: {
    canExpire: true,
    handling: 'Set mediaNeedsReupload=true and notify owner',
  },
} as const;

// ============================================================================
// Type Guards
// ============================================================================

export const isLanguageCode = (value: unknown): value is LanguageCode => {
  return typeof value === 'string' && SUPPORTED_LANGUAGES.includes(value as LanguageCode);
};

export const isGiveawayStatus = (value: unknown): value is GiveawayStatus => {
  return typeof value === 'string' && Object.values(GiveawayStatus).includes(value as GiveawayStatus);
};

export const isParticipationStatus = (value: unknown): value is ParticipationStatus => {
  return typeof value === 'string' && Object.values(ParticipationStatus).includes(value as ParticipationStatus);
};

// ============================================================================
// Subscription & Payment Enums (Task 0.2)
// ============================================================================

/**
 * Creator subscription tiers
 */
export enum SubscriptionTier {
  FREE = 'FREE',
  PLUS = 'PLUS',
  PRO = 'PRO',
  BUSINESS = 'BUSINESS',
}

/**
 * Payment provider
 */
export enum PaymentProvider {
  YOOKASSA = 'YOOKASSA',
}

/**
 * Prize delivery method
 */
export type PrizeDeliveryMethod = 'CONTACT_CREATOR' | 'BOT_INSTRUCTION' | 'FORM';

/**
 * Creator notification mode
 */
export type CreatorNotificationMode = 'MILESTONE' | 'DAILY' | 'OFF';

/**
 * Liveness check status
 */
export type LivenessStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

/**
 * Report status
 */
export type ReportStatus = 'PENDING' | 'REVIEWED' | 'RESOLVED' | 'DISMISSED';

/**
 * Badge codes for user achievements
 */
export type BadgeCode =
  | 'newcomer'
  | 'activist'
  | 'veteran'
  | 'champion'
  | 'winner'
  | 'multi_winner'
  | 'friend'
  | 'patron';

/**
 * Giveaway error types for error logging
 */
export type GiveawayErrorType =
  | 'PUBLISH_FAILED'
  | 'FINISH_FAILED'
  | 'NOTIFICATION_FAILED'
  | 'RIGHTS_LOST';

/**
 * Audit log action types
 */
export type AuditAction =
  | 'GIVEAWAY_CREATED'
  | 'GIVEAWAY_STARTED'
  | 'GIVEAWAY_FINISHED'
  | 'PARTICIPANT_BANNED'
  | 'PAYMENT_CREATED'
  | 'CHANNEL_ADDED'
  | 'SETTINGS_CHANGED'
  | 'EXPORT_PARTICIPANTS';

// ============================================================================
// Subscription Tier Type Guard
// ============================================================================

export const isSubscriptionTier = (value: unknown): value is SubscriptionTier => {
  return typeof value === 'string' && Object.values(SubscriptionTier).includes(value as SubscriptionTier);
};
