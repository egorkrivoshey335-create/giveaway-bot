/**
 * RandomBeast — Shared Constants
 * 
 * Этот файл содержит все константы, лимиты и настройки по умолчанию.
 * 
 * @packageDocumentation
 */

// ============================================================================
// Time & Timezone
// ============================================================================

/**
 * Default timezone for giveaways
 */
export const DEFAULT_TIMEZONE = 'Europe/Moscow';

/**
 * Supported timezones for giveaway scheduling
 */
export const SUPPORTED_TIMEZONES = [
  'Europe/Moscow',      // UTC+3
  'Europe/Kaliningrad', // UTC+2
  'Asia/Yekaterinburg', // UTC+5
  'Asia/Omsk',          // UTC+6
  'Asia/Krasnoyarsk',   // UTC+7
  'Asia/Irkutsk',       // UTC+8
  'Asia/Yakutsk',       // UTC+9
  'Asia/Vladivostok',   // UTC+10
  'Asia/Almaty',        // UTC+6 (Kazakhstan)
  'Europe/London',      // UTC+0/+1
  'America/New_York',   // UTC-5/-4
] as const;

/**
 * Draft auto-save interval in milliseconds
 */
export const DRAFT_AUTOSAVE_INTERVAL_MS = 30_000; // 30 seconds

/**
 * Soft delete undo window in milliseconds (default)
 */
export const SOFT_DELETE_UNDO_WINDOW_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Post template undo window in milliseconds
 */
export const POST_TEMPLATE_UNDO_WINDOW_MS = 20 * 1000; // 20 seconds

/**
 * TMA init data expiration in seconds
 */
export const TMA_INIT_DATA_EXPIRATION_SECONDS = 3600; // 1 hour

// ============================================================================
// Giveaway Limits
// ============================================================================

export const GIVEAWAY_LIMITS = {
  /** Минимальная длина названия */
  TITLE_MIN_LENGTH: 3,
  /** Максимальная длина названия */
  TITLE_MAX_LENGTH: 255,
  /** Максимальная длина описания */
  DESCRIPTION_MAX_LENGTH: 2000,
  
  // Лимиты победителей по подпискам
  /** Минимальное количество победителей */
  MIN_WINNERS: 1,
  /** Максимум победителей (бесплатный аккаунт) */
  MAX_WINNERS_FREE: 10,
  /** Максимум победителей (PLUS подписка) */
  MAX_WINNERS_PLUS: 50,
  /** Максимум победителей (PRO подписка) */
  MAX_WINNERS_PRO: 100,
  /** Максимум победителей (BUSINESS подписка) */
  MAX_WINNERS_BUSINESS: 200,
  
  /** @deprecated Используйте MAX_WINNERS_FREE/PLUS/PRO/BUSINESS */
  WINNERS_MIN: 1,
  /** @deprecated Используйте MAX_WINNERS_FREE/PLUS/PRO/BUSINESS */
  WINNERS_MAX: 100,
  
  /** Максимальное количество резервных победителей */
  RESERVE_WINNERS_MAX: 50,
  
  // Лимиты длительности
  /** Минимальная длительность в часах */
  MIN_DURATION_HOURS: 1,
  /** Максимальная длительность в днях */
  MAX_DURATION_DAYS: 90,
  /** @deprecated Используйте MAX_DURATION_DAYS = 90 */
  MAX_DURATION_DAYS_OLD: 365,
  
  /** Максимальное количество каналов для подписки */
  MAX_REQUIRED_CHANNELS: 10,
  /** Максимальное количество каналов для бустов */
  MAX_BOOST_CHANNELS: 5,
  /** Максимальное количество кастомных заданий */
  MAX_CUSTOM_TASKS: 10,
  /** Максимум бонусных билетов за инвайты */
  MAX_INVITE_TICKETS: 100,
  /** Максимальная длина текста кнопки */
  BUTTON_TEXT_MAX_LENGTH: 32,
} as const;

// ============================================================================
// Лимиты дополнительных билетов (EXTRAS)
// ============================================================================

export const EXTRAS_LIMITS = {
  /** Минимальное количество приглашений */
  MIN_INVITES: 1,
  /** Максимум приглашений (бесплатный аккаунт) */
  MAX_INVITES_FREE: 10,
  /** Максимум приглашений (PLUS подписка) */
  MAX_INVITES_PLUS: 100,
  /** Максимум приглашений (PRO подписка) */
  MAX_INVITES_PRO: 500,
  
  /** Максимальное количество каналов для бустов */
  MAX_BOOST_CHANNELS: 5,
  /** Максимум билетов за один буст */
  MAX_TICKETS_PER_BOOST: 10,
} as const;

// ============================================================================
// Post & Media Limits
// ============================================================================

export const POST_LIMITS = {
  /** Maximum post text length (Telegram limit) */
  TEXT_MAX_LENGTH: 4096,
  /** Maximum caption length for media (Telegram limit) */
  CAPTION_MAX_LENGTH: 1024,
  /** Maximum photo size in bytes (10 MB) */
  PHOTO_MAX_SIZE_BYTES: 10 * 1024 * 1024,
  /** Maximum video size in bytes (50 MB) */
  VIDEO_MAX_SIZE_BYTES: 50 * 1024 * 1024,
  /** Allowed photo MIME types */
  ALLOWED_PHOTO_TYPES: ['image/jpeg', 'image/png', 'image/gif'] as const,
  /** Allowed video MIME types */
  ALLOWED_VIDEO_TYPES: ['video/mp4', 'video/quicktime'] as const,
} as const;

// ============================================================================
// Channel Limits
// ============================================================================

export const CHANNEL_LIMITS = {
  /** Maximum channels per user */
  MAX_CHANNELS_PER_USER: 50,
  /** Cache TTL for channel data in seconds */
  CHANNEL_CACHE_TTL_SECONDS: 300, // 5 minutes
  /** Permissions check interval in hours */
  PERMISSIONS_CHECK_INTERVAL_HOURS: 24,
} as const;

// ============================================================================
// Participation Limits
// ============================================================================

export const PARTICIPATION_LIMITS = {
  /** Base tickets per participant */
  BASE_TICKETS: 1,
  /** Maximum tickets from invites */
  MAX_INVITE_TICKETS: 100,
  /** Maximum participations per minute (rate limit) */
  MAX_PARTICIPATIONS_PER_MINUTE: 50,
  /** Subscription check cache TTL in seconds */
  SUBSCRIPTION_CHECK_CACHE_TTL_SECONDS: 300, // 5 minutes
} as const;

// ============================================================================
// Fraud Detection Thresholds
// ============================================================================

export const FRAUD_THRESHOLDS = {
  /** Account age considered suspicious (days) */
  SUSPICIOUS_ACCOUNT_AGE_DAYS: 7,
  /** Fraud score threshold for simple captcha */
  SIMPLE_CAPTCHA_THRESHOLD: 30,
  /** Fraud score threshold for complex captcha */
  COMPLEX_CAPTCHA_THRESHOLD: 50,
  /** Fraud score threshold for auto-ban */
  AUTO_BAN_THRESHOLD: 90,
  /** Max participations from same IP per hour */
  MAX_SAME_IP_PARTICIPATIONS_PER_HOUR: 10,
  /** Suspicious join time (instant = likely bot) in milliseconds */
  INSTANT_JOIN_THRESHOLD_MS: 1000,
} as const;

// ============================================================================
// API Rate Limits
// ============================================================================

export const API_RATE_LIMITS = {
  /** Default requests per minute */
  DEFAULT_RPM: 100,
  /** Giveaway creation per hour */
  GIVEAWAY_CREATE_PER_HOUR: 10,
  /** Participation joins per minute */
  PARTICIPATION_JOIN_PER_MINUTE: 50,
  /** Payment creation per hour */
  PAYMENT_CREATE_PER_HOUR: 5,
} as const;

// ============================================================================
// Telegram Bot API Limits
// ============================================================================

export const TELEGRAM_LIMITS = {
  /** Messages per second (global) */
  MESSAGES_PER_SECOND: 30,
  /** Messages per chat per minute */
  MESSAGES_PER_CHAT_PER_MINUTE: 20,
  /** Bulk messages per second */
  BULK_MESSAGES_PER_SECOND: 1,
  /** Inline keyboard buttons per row */
  INLINE_BUTTONS_PER_ROW: 8,
  /** Maximum inline keyboard rows */
  MAX_INLINE_ROWS: 100,
  /** Maximum callback data length */
  CALLBACK_DATA_MAX_LENGTH: 64,
} as const;

// ============================================================================
// Payment & Products
// ============================================================================

export const PAYMENT_CONFIG = {
  /** Default currency */
  DEFAULT_CURRENCY: 'RUB',
  /** Minimum payment amount in rubles */
  MIN_AMOUNT_RUB: 100,
  /** Maximum payment amount in rubles */
  MAX_AMOUNT_RUB: 100_000,
  /** Payment provider */
  PROVIDER: 'yookassa',
} as const;

/**
 * MVP Product codes
 */
export const PRODUCT_CODES = {
  /** Monthly catalog access subscription */
  CATALOG_MONTHLY: 'CATALOG_MONTHLY_1000',
} as const;

/**
 * Entitlement codes
 */
export const ENTITLEMENT_CODES = {
  /** Access to giveaway catalog */
  CATALOG_ACCESS: 'catalog.access',
  /** Liveness check feature */
  LIVENESS_CHECK: 'liveness.check',
  /** Advanced analytics */
  ANALYTICS_ADVANCED: 'analytics.advanced',
} as const;

// ============================================================================
// URLs & Domains
// ============================================================================

export const DOMAINS = {
  /** Marketing website */
  MARKETING: 'randombeast.ru',
  /** Mini App domain */
  APP: 'app.randombeast.ru',
  /** API domain */
  API: 'api.randombeast.ru',
} as const;

/**
 * Build full URL for a domain
 */
export const buildUrl = (domain: keyof typeof DOMAINS, path = ''): string => {
  return `https://${DOMAINS[domain]}${path}`;
};

// ============================================================================
// Bot Configuration
// ============================================================================

export const BOT_CONFIG = {
  /** Название бота */
  NAME: 'RandomBeast — Рандомайзер | Конкурс бот',
  /** Username бота (без @) */
  USERNAME: 'BeastRandomBot',
  /** Базовый deep link */
  DEEP_LINK_BASE: 'https://t.me/BeastRandomBot',
  /** Short name Mini App для участия (настраивается в BotFather) */
  MINI_APP_SHORT_NAME: 'participate',
} as const;

/**
 * Создать deep link на бота с параметром start
 */
export const buildBotDeepLink = (startParam?: string): string => {
  if (!startParam) return BOT_CONFIG.DEEP_LINK_BASE;
  return `${BOT_CONFIG.DEEP_LINK_BASE}?start=${encodeURIComponent(startParam)}`;
};

/**
 * Создать прямой link на Mini App с параметром startapp
 * Формат: https://t.me/BeastRandomBot/participate?startapp=join_<id>
 */
export const buildMiniAppLink = (startappParam?: string): string => {
  const base = `${BOT_CONFIG.DEEP_LINK_BASE}/${BOT_CONFIG.MINI_APP_SHORT_NAME}`;
  if (!startappParam) return base;
  return `${base}?startapp=${encodeURIComponent(startappParam)}`;
};

// ============================================================================
// Cache Keys
// ============================================================================

export const CACHE_KEYS = {
  /** User data cache key prefix */
  USER: (userId: string) => `user:${userId}`,
  /** Channel data cache key prefix */
  CHANNEL: (channelId: string) => `channel:${channelId}`,
  /** Giveaway data cache key prefix */
  GIVEAWAY: (giveawayId: string) => `giveaway:${giveawayId}`,
  /** Subscription check cache key */
  SUBSCRIPTION_CHECK: (userId: string, channelId: string) => 
    `sub_check:${userId}:${channelId}`,
  /** Rate limit key */
  RATE_LIMIT: (identifier: string, action: string) => 
    `rate:${action}:${identifier}`,
  /** Draft cache key */
  DRAFT: (userId: string, type: string) => 
    `draft:${type}:${userId}`,
} as const;

// ============================================================================
// Regex Patterns
// ============================================================================

export const PATTERNS = {
  /** Telegram username pattern (without @) */
  TELEGRAM_USERNAME: /^[a-zA-Z][a-zA-Z0-9_]{4,31}$/,
  /** UUID v4 pattern */
  UUID: /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
  /** URL pattern (simple) */
  URL: /^https?:\/\/[^\s/$.?#].[^\s]*$/i,
  /** Safe URL protocols */
  SAFE_URL_PROTOCOLS: /^https?:\/\//i,
} as const;

// ============================================================================
// Default Values
// ============================================================================

export const DEFAULTS = {
  /** Default giveaway values */
  GIVEAWAY: {
    winnersCount: 1,
    reserveWinnersCount: 0,
    timezone: DEFAULT_TIMEZONE,
    buttonText: '🎁 Участвовать',
    language: 'ru' as const,
  },
  /** Default participation values */
  PARTICIPATION: {
    ticketsBase: 1,
    ticketsExtra: 0,
    fraudScore: 0,
  },
  /** Default pagination */
  PAGINATION: {
    page: 1,
    limit: 20,
    maxLimit: 100,
  },
} as const;

// ============================================================================
// Tier-based Limits (Task 0.2)
// ============================================================================

/**
 * Лимиты по тарифным планам.
 * Используются для проверки доступа при создании розыгрышей,
 * каналов, постов и прочих сущностей.
 */
export const TIER_LIMITS = {
  /** Максимум одновременно активных розыгрышей */
  maxActiveGiveaways: {
    FREE: 3,
    PLUS: 5,
    PRO: 10,
    BUSINESS: Infinity,
  },
  /** Максимум каналов у создателя */
  maxChannels: {
    FREE: 3,
    PLUS: 5,
    PRO: 10,
    BUSINESS: Infinity,
  },
  /** Максимум шаблонов постов */
  maxPostTemplates: {
    FREE: 5,
    PLUS: 10,
    PRO: 20,
    BUSINESS: Infinity,
  },
  /** Максимум кастомных заданий в одном розыгрыше */
  maxCustomTasks: {
    FREE: 1,
    PLUS: 3,
    PRO: 5,
    BUSINESS: 10,
  },
  /** Максимальная длина текста поста (с медиа) */
  postCharLimit: {
    FREE: 1024,
    PLUS: 2048,
    PRO: 4096,
    BUSINESS: 4096,
  },
  /** Максимум победителей */
  maxWinners: {
    FREE: 5,
    PLUS: 10,
    PRO: 20,
    BUSINESS: 200,
  },
  /** Максимум приглашений на участника */
  maxInvites: {
    FREE: 3,
    PLUS: 10,
    PRO: 20,
    BUSINESS: 10000,
  },
  /** Максимум трекинг-ссылок */
  maxTrackingLinks: {
    FREE: 1,
    PLUS: 1,
    PRO: 5,
    BUSINESS: Infinity,
  },
  /** Максимум каналов на один розыгрыш */
  maxChannelsPerGiveaway: {
    FREE: 1,
    PLUS: 3,
    PRO: 5,
    BUSINESS: Infinity,
  },
  /** Максимум мин. участников */
  maxMinParticipants: {
    FREE: 1000,
    PLUS: 3000,
    PRO: 5000,
    BUSINESS: Infinity,
  },
  /** Максимум каналов для бустов */
  maxBoostChannels: {
    FREE: 1,
    PLUS: 3,
    PRO: 5,
    BUSINESS: 10,
  },
} as const;
