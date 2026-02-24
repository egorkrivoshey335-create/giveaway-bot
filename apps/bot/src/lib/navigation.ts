/**
 * RandomBeast Bot — Navigation Helper
 *
 * 🔒 ЗАДАЧА 1.15: Consistent navigation buttons for all bot handlers
 *
 * Provides a helper to append ◀️ Back and 🏠 Main Menu buttons to any InlineKeyboard.
 */

import { InlineKeyboard } from 'grammy';
import type { Locale } from '../i18n/index.js';

const BACK_LABELS: Record<Locale, string> = {
  ru: '◀️ Назад',
  en: '◀️ Back',
  kk: '◀️ Артқа',
};

const MAIN_MENU_LABELS: Record<Locale, string> = {
  ru: '🏠 Главное меню',
  en: '🏠 Main Menu',
  kk: '🏠 Басты мәзір',
};

export interface NavigationOptions {
  /** Show ◀️ Back button (default: true) */
  back?: boolean;
  /** Callback data for Back button (default: 'nav_back') */
  backCallback?: string;
  /** Back button label override */
  backLabel?: string;
  /** Show 🏠 Main Menu button (default: true) */
  mainMenu?: boolean;
  /** Whether to put navigation on a new row (default: true) */
  newRow?: boolean;
}

/**
 * Appends navigation buttons to an existing InlineKeyboard.
 * @param keyboard - The keyboard to append to
 * @param locale - User locale for button labels
 * @param options - Navigation options
 */
export function addNavigationButtons(
  keyboard: InlineKeyboard,
  locale: Locale = 'ru',
  options: NavigationOptions = {}
): InlineKeyboard {
  const {
    back = true,
    backCallback = 'nav_back',
    backLabel,
    mainMenu = true,
    newRow = true,
  } = options;

  if (!back && !mainMenu) return keyboard;

  if (newRow) {
    keyboard.row();
  }

  if (back) {
    const label = backLabel || BACK_LABELS[locale] || BACK_LABELS.ru;
    keyboard.text(label, backCallback);
  }

  if (mainMenu) {
    const label = MAIN_MENU_LABELS[locale] || MAIN_MENU_LABELS.ru;
    keyboard.text(label, 'nav_main_menu');
  }

  return keyboard;
}

/**
 * Creates a new InlineKeyboard with navigation buttons.
 * @param locale - User locale
 * @param options - Navigation options
 */
export function createNavigationKeyboard(
  locale: Locale = 'ru',
  options: NavigationOptions = {}
): InlineKeyboard {
  const keyboard = new InlineKeyboard();
  return addNavigationButtons(keyboard, locale, options);
}

/**
 * Navigation callback action constants
 */
export const NAV_CALLBACKS = {
  BACK: 'nav_back',
  MAIN_MENU: 'nav_main_menu',
} as const;
