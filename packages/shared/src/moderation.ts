/**
 * RandomBeast — Content Moderation
 *
 * Базовый модуль модерации контента.
 * Используется при создании поста, модерации каталога, создании розыгрыша.
 * Не блокирует действие, а помечает контент для ручной модерации.
 *
 * @packageDocumentation
 */

// ============================================================================
// Stop-word lists (basic set — расширять по мере необходимости)
// ============================================================================

/**
 * Русские стоп-слова: мат, спам, scam-паттерны.
 * Минимальный набор — добавлять по ходу модерации.
 */
const STOP_WORDS_RU: readonly string[] = [
  // Мат (корни, чтобы ловить словоформы)
  'блят', 'бляд', 'ебат', 'ебан', 'ёбан', 'хуй', 'хуя', 'хуе', 'хуё',
  'пизд', 'пизж', 'сука', 'суки', 'сучк', 'мудак', 'мудач', 'мудил',
  'залуп', 'гандон', 'пидор', 'пидар',
  // Спам / scam
  'заработок без вложений', 'казино', 'ставки на спорт', 'быстрый заработок',
  'гарантированный доход', 'схема заработка', 'лёгкие деньги', 'легкие деньги',
  'перевод на карту', 'кинули', 'обман', 'развод на деньги',
  'бесплатные деньги', 'криптовалюта бесплатно',
] as const;

/**
 * English stop-words: profanity, spam, scam patterns
 */
const STOP_WORDS_EN: readonly string[] = [
  // Profanity
  'fuck', 'shit', 'bitch', 'asshole', 'bastard', 'dick', 'cunt',
  // Spam / scam
  'make money fast', 'free bitcoin', 'guaranteed profit', 'no investment',
  'click here to win', 'easy money', 'free crypto', 'double your money',
  'send me your', 'wire transfer', 'nigerian prince',
] as const;

/**
 * Kazakh stop-words: profanity, spam patterns
 */
const STOP_WORDS_KK: readonly string[] = [
  // Ненормативная лексика (базовый набор)
  'сиқтір', 'қотақ', 'жынды',
  // Спам
  'тегін ақша', 'жеңіл табыс', 'тез ақша',
] as const;

/**
 * All stop-words combined and lowercased for matching
 */
const ALL_STOP_WORDS: string[] = [
  ...STOP_WORDS_RU,
  ...STOP_WORDS_EN,
  ...STOP_WORDS_KK,
].map(w => w.toLowerCase());

// ============================================================================
// Content Check
// ============================================================================

export interface ContentCheckResult {
  /** true if no stop-words found */
  clean: boolean;
  /** List of flagged words/phrases found in the text */
  flaggedWords: string[];
}

/**
 * Проверяет текст на наличие стоп-слов.
 * Не блокирует — только помечает для ручной модерации.
 *
 * @param text - Текст для проверки
 * @returns Результат проверки с флагом и списком найденных слов
 *
 * @example
 * ```typescript
 * const result = checkContent('Обычный текст розыгрыша');
 * // { clean: true, flaggedWords: [] }
 *
 * const result2 = checkContent('Казино и быстрый заработок');
 * // { clean: false, flaggedWords: ['казино', 'быстрый заработок'] }
 * ```
 */
export function checkContent(text: string): ContentCheckResult {
  const lowerText = text.toLowerCase();
  const flaggedWords: string[] = [];

  for (const word of ALL_STOP_WORDS) {
    if (lowerText.includes(word)) {
      flaggedWords.push(word);
    }
  }

  return {
    clean: flaggedWords.length === 0,
    flaggedWords,
  };
}

/**
 * Экспорт списков стоп-слов для возможности расширения
 */
export const STOP_WORDS = {
  ru: STOP_WORDS_RU,
  en: STOP_WORDS_EN,
  kk: STOP_WORDS_KK,
} as const;
