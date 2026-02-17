import { nanoid } from 'nanoid';

/**
 * Генерирует уникальный 8-символьный shortCode для розыгрыша
 * Использует nanoid для collision-resistant генерации
 * 
 * Формат: [a-zA-Z0-9], длина 8 символов
 * Collision вероятность: ~1% при 1M записей/час
 */
export function generateShortCode(): string {
  return nanoid(8);
}

/**
 * Валидация shortCode
 */
export function isValidShortCode(code: string): boolean {
  return /^[a-zA-Z0-9]{8}$/.test(code);
}

/**
 * Парсинг deep link параметра startapp
 * 
 * Форматы:
 * - g_[shortCode] — открыть розыгрыш
 * - g_[shortCode]_s_[tag] — с меткой источника
 * - g_[shortCode]_ref_[userId] — с рефералом
 * - g_[shortCode]_s_[tag]_ref_[userId] — комбинация
 * - r_[refShortCode] — реферальная ссылка
 * - nav_creator — навигация в раздел создателя
 * - nav_creator_channels — навигация к каналам
 * - nav_creator_giveaway_[shortCode] — к розыгрышу
 * - nav_participant — навигация к участнику
 * - results_[shortCode] — результаты розыгрыша
 */
export interface ParsedDeepLink {
  type: 'giveaway' | 'referral' | 'navigation' | 'results' | 'unknown';
  giveawayShortCode?: string;
  sourceTag?: string;
  referrerUserId?: string;
  navigationTarget?: string;
}

export function parseDeepLink(startParam: string | undefined): ParsedDeepLink | null {
  if (!startParam) return null;

  const parts = startParam.split('_');

  // g_[shortCode]...
  if (parts[0] === 'g' && parts[1]) {
    const result: ParsedDeepLink = {
      type: 'giveaway',
      giveawayShortCode: parts[1],
    };

    // Парсим дополнительные параметры
    for (let i = 2; i < parts.length; i++) {
      if (parts[i] === 's' && parts[i + 1]) {
        result.sourceTag = parts[i + 1];
        i++;
      } else if (parts[i] === 'ref' && parts[i + 1]) {
        result.referrerUserId = parts[i + 1];
        i++;
      }
    }

    return result;
  }

  // r_[refShortCode]
  if (parts[0] === 'r' && parts[1]) {
    return {
      type: 'referral',
      giveawayShortCode: parts[1], // ReferralLink.shortCode → Giveaway.shortCode
    };
  }

  // results_[shortCode]
  if (parts[0] === 'results' && parts[1]) {
    return {
      type: 'results',
      giveawayShortCode: parts[1],
    };
  }

  // nav_...
  if (parts[0] === 'nav') {
    const target = parts.slice(1).join('_');
    return {
      type: 'navigation',
      navigationTarget: target,
    };
  }

  return { type: 'unknown' };
}
