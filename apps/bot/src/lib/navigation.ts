/**
 * RandomBeast Bot — Navigation Helper
 *
 * Provides a row of styled navigation buttons (Back / Main Menu)
 * to append to any inline keyboard.
 */

import type { Locale } from '../i18n/index.js';
import { btn, type StyledButton } from './customEmoji.js';

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
  back?: boolean;
  backCallback?: string;
  backLabel?: string;
  mainMenu?: boolean;
}

/**
 * Returns a row of navigation buttons for use in `inlineKeyboard(...)`.
 */
export function navigationRow(
  locale: Locale = 'ru',
  options: NavigationOptions = {},
): StyledButton[] {
  const { back = true, backCallback = 'nav_back', backLabel, mainMenu = true } = options;
  const row: StyledButton[] = [];

  if (back) {
    const label = backLabel || BACK_LABELS[locale] || BACK_LABELS.ru;
    row.push(btn(label, backCallback, 'back', 'danger'));
  }

  if (mainMenu) {
    const label = MAIN_MENU_LABELS[locale] || MAIN_MENU_LABELS.ru;
    row.push(btn(label, 'nav_main_menu', 'home', 'danger'));
  }

  return row;
}

export const NAV_CALLBACKS = {
  BACK: 'nav_back',
  MAIN_MENU: 'nav_main_menu',
} as const;
