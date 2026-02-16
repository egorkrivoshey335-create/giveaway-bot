import type { User, Giveaway } from '@randombeast/database';

/**
 * Вычисляет fraud score для участника (0-100)
 * 
 * Критерии:
 * - +20: аккаунт создан менее 30 дней назад (если данные доступны)
 * - +15: нет фото профиля (проверяется через Bot API отдельно)
 * - +15: нет username
 * - +10: имя содержит спам-паттерны (цифры, спецсимволы)
 * - +20: множественные участия с одного IP (если трекаем)
 * - +10: слишком быстрое прохождение (< 5 секунд от открытия до участия)
 * - +10: язык/timezone не совпадает (будущая фича)
 * 
 * Пороги:
 * - 0-30: нормальный участник
 * - 31-60: подозрительный → автоматическая капча
 * - 61-100: высокий риск → ручная модерация
 */
export function calculateFraudScore(params: {
  user: Pick<User, 'username' | 'firstName' | 'lastName' | 'createdAt'>;
  giveaway?: Pick<Giveaway, 'id'>;
  timeSinceOpen?: number; // milliseconds
  ipAddress?: string;
  previousParticipationsCount?: number;
}): number {
  let score = 0;
  const { user, timeSinceOpen, previousParticipationsCount } = params;

  // +20: новый аккаунт (создан менее 30 дней назад)
  // Примечание: createdAt в User — это дата создания записи в нашей БД, 
  // а не дата создания аккаунта в Telegram (такие данные недоступны через Bot API)
  const accountAgeDays = Math.floor((Date.now() - user.createdAt.getTime()) / (1000 * 60 * 60 * 24));
  if (accountAgeDays < 30) {
    score += 20;
  }

  // +15: нет username
  if (!user.username) {
    score += 15;
  }

  // +10: имя содержит спам-паттерны
  // Паттерны: много цифр, много спецсимволов, только цифры, типичные боты
  const fullName = `${user.firstName || ''} ${user.lastName || ''}`.trim();
  if (fullName) {
    const digitCount = (fullName.match(/\d/g) || []).length;
    const specialCharCount = (fullName.match(/[^a-zA-Zа-яА-ЯёЁ0-9\s]/g) || []).length;
    const totalChars = fullName.length;

    // Много цифр (>30% от имени)
    if (digitCount > totalChars * 0.3) {
      score += 5;
    }

    // Много спецсимволов (>20%)
    if (specialCharCount > totalChars * 0.2) {
      score += 5;
    }

    // Подозрительные паттерны
    const suspiciousPatterns = [
      /bot$/i,
      /\d{4,}/, // 4+ цифр подряд
      /^[0-9]+$/, // только цифры
    ];

    if (suspiciousPatterns.some(pattern => pattern.test(fullName))) {
      score += 5;
    }
  }

  // +10: слишком быстрое прохождение (< 5 секунд)
  if (timeSinceOpen !== undefined && timeSinceOpen < 5000) {
    score += 10;
  }

  // +20: множественные участия (подозрение на фарминг)
  // Если пользователь участвует в >10 розыгрышах за последние 24ч
  if (previousParticipationsCount !== undefined && previousParticipationsCount > 10) {
    score += 20;
  }

  return Math.min(score, 100); // Cap at 100
}

/**
 * Проверяет требуется ли капча для пользователя на основе fraud score
 */
export function requiresCaptcha(fraudScore: number, giveawayCaptchaMode: string): boolean {
  // Если создатель включил капчу для всех
  if (giveawayCaptchaMode === 'ALL') {
    return true;
  }

  // Если создатель выключил капчу
  if (giveawayCaptchaMode === 'OFF') {
    return false;
  }

  // SUSPICIOUS_ONLY: автоматическая капча для подозрительных
  if (giveawayCaptchaMode === 'SUSPICIOUS_ONLY') {
    return fraudScore >= 31; // 31-60 = подозрительный, 61+ = высокий риск
  }

  return false;
}

/**
 * Определяет требуется ли ручная модерация
 */
export function requiresManualModeration(fraudScore: number): boolean {
  return fraudScore >= 61;
}
