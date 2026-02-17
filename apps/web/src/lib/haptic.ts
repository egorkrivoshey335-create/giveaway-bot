/**
 * Haptic Feedback utility для Telegram WebApp
 * 
 * Добавляет тактильную обратную связь для улучшения UX
 */

type HapticType = 'light' | 'medium' | 'heavy' | 'rigid' | 'soft';
type NotificationType = 'error' | 'success' | 'warning';

/**
 * Проверка доступности Haptic API
 */
function isHapticAvailable(): boolean {
  return typeof window !== 'undefined' && 
         window.Telegram?.WebApp?.HapticFeedback !== undefined;
}

/**
 * Лёгкая вибрация (для кнопок, переключателей)
 */
export function hapticLight() {
  if (isHapticAvailable()) {
    window.Telegram?.WebApp?.HapticFeedback?.impactOccurred('light');
  }
}

/**
 * Средняя вибрация (для важных действий)
 */
export function hapticMedium() {
  if (isHapticAvailable()) {
    window.Telegram?.WebApp?.HapticFeedback?.impactOccurred('medium');
  }
}

/**
 * Сильная вибрация (для критичных действий)
 */
export function hapticHeavy() {
  if (isHapticAvailable()) {
    window.Telegram?.WebApp?.HapticFeedback?.impactOccurred('heavy');
  }
}

/**
 * Жёсткая вибрация
 */
export function hapticRigid() {
  if (isHapticAvailable()) {
    window.Telegram?.WebApp?.HapticFeedback?.impactOccurred('rigid');
  }
}

/**
 * Мягкая вибрация
 */
export function hapticSoft() {
  if (isHapticAvailable()) {
    window.Telegram?.WebApp?.HapticFeedback?.impactOccurred('soft');
  }
}

/**
 * Уведомление об ошибке
 */
export function hapticError() {
  if (isHapticAvailable()) {
    window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred('error');
  }
}

/**
 * Уведомление об успехе
 */
export function hapticSuccess() {
  if (isHapticAvailable()) {
    window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred('success');
  }
}

/**
 * Уведомление-предупреждение
 */
export function hapticWarning() {
  if (isHapticAvailable()) {
    window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred('warning');
  }
}

/**
 * Изменение выбора (для переключения между опциями)
 */
export function hapticSelectionChanged() {
  if (isHapticAvailable()) {
    window.Telegram?.WebApp?.HapticFeedback?.selectionChanged();
  }
}

/**
 * Универсальная функция для haptic feedback
 */
export function haptic(type: HapticType | NotificationType) {
  switch (type) {
    case 'light':
      hapticLight();
      break;
    case 'medium':
      hapticMedium();
      break;
    case 'heavy':
      hapticHeavy();
      break;
    case 'rigid':
      hapticRigid();
      break;
    case 'soft':
      hapticSoft();
      break;
    case 'error':
      hapticError();
      break;
    case 'success':
      hapticSuccess();
      break;
    case 'warning':
      hapticWarning();
      break;
  }
}

/**
 * Haptic для навигации (переход между экранами)
 */
export function hapticNavigation() {
  hapticLight();
}

/**
 * Haptic для подтверждения действия
 */
export function hapticConfirm() {
  hapticMedium();
}

/**
 * Haptic для отмены действия
 */
export function hapticCancel() {
  hapticSoft();
}

/**
 * Haptic для удаления
 */
export function hapticDelete() {
  hapticRigid();
}

/**
 * Haptic для создания нового элемента
 */
export function hapticCreate() {
  hapticMedium();
}

/**
 * Haptic для переключения toggle/checkbox
 */
export function hapticToggle() {
  hapticLight();
}

/**
 * Haptic для выбора из списка
 */
export function hapticSelect() {
  hapticSelectionChanged();
}
