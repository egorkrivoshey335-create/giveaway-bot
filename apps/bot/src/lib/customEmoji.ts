/**
 * Custom Emoji & Button Styling Module
 *
 * Styled button builders with optional custom emoji icons
 * for Telegram Bot API 9.4+ (style + icon_custom_emoji_id).
 *
 * Emoji IDs are configured via EMOJI_* environment variables.
 * Admin commands: /emoji_id, /emoji_status, /emoji_enable, /emoji_disable
 */

import { createLogger } from './logger.js';

const log = createLogger('custom-emoji');

export type ButtonStyle = 'primary' | 'success' | 'danger';

export interface StyledButton {
  text: string;
  callback_data?: string;
  url?: string;
  web_app?: { url: string };
  style?: ButtonStyle;
  icon_custom_emoji_id?: string;
  /** Stored for fallback stripping — not sent to Telegram */
  _original_text?: string;
}

export const EMOJI_MAP: Record<string, string> = {
  app:       process.env.EMOJI_APP || '',
  create:    process.env.EMOJI_CREATE || '',
  channels:  process.env.EMOJI_CHANNELS || '',
  posts:     process.env.EMOJI_POSTS || '',
  settings:  process.env.EMOJI_SETTINGS || '',
  support:   process.env.EMOJI_SUPPORT || '',
  back:      process.env.EMOJI_BACK || '',
  home:      process.env.EMOJI_HOME || '',
  join:      process.env.EMOJI_JOIN || '',
  buy:       process.env.EMOJI_BUY || '',
  stats:     process.env.EMOJI_STATS || '',
  results:   process.env.EMOJI_RESULTS || '',
  confirm:   process.env.EMOJI_CONFIRM || '',
  reject:    process.env.EMOJI_REJECT || '',
  add:       process.env.EMOJI_ADD || '',
  delete:    process.env.EMOJI_DELETE || '',
  cancel:    process.env.EMOJI_CANCEL || '',
  undo:      process.env.EMOJI_UNDO || '',
  winners:   process.env.EMOJI_WINNERS || '',
  subscribe: process.env.EMOJI_SUBSCRIBE || '',
};

let _enabled = process.env.CUSTOM_EMOJI_ENABLED !== 'false';

export function isEnabled(): boolean { return _enabled; }
export function enable(): void { _enabled = true; }
export function disable(reason?: string): void {
  _enabled = false;
  if (reason) log.info({ reason }, 'Custom emoji disabled');
}

function getEmojiId(name: string): string | undefined {
  if (!_enabled) return undefined;
  return EMOJI_MAP[name] || undefined;
}

function stripLeadingEmoji(text: string): string {
  const m = text.match(/^[^\p{L}\p{N}]+/u);
  return m ? text.slice(m[0].length) : text;
}

// ── Inline-keyboard button builders ─────────────────────────────────────────

export function btn(
  text: string,
  callbackData: string,
  emojiName?: string,
  style?: ButtonStyle,
): StyledButton {
  const eid = emojiName ? getEmojiId(emojiName) : undefined;
  const b: StyledButton = {
    text: eid ? stripLeadingEmoji(text) : text,
    callback_data: callbackData,
  };
  if (style) b.style = style;
  if (eid) { b.icon_custom_emoji_id = eid; b._original_text = text; }
  return b;
}

export function urlBtn(
  text: string,
  url: string,
  emojiName?: string,
  style?: ButtonStyle,
): StyledButton {
  const eid = emojiName ? getEmojiId(emojiName) : undefined;
  const b: StyledButton = {
    text: eid ? stripLeadingEmoji(text) : text,
    url,
  };
  if (style) b.style = style;
  if (eid) { b.icon_custom_emoji_id = eid; b._original_text = text; }
  return b;
}

export function webAppBtn(
  text: string,
  webAppUrl: string,
  emojiName?: string,
  style?: ButtonStyle,
): StyledButton {
  const eid = emojiName ? getEmojiId(emojiName) : undefined;
  const b: StyledButton = {
    text: eid ? stripLeadingEmoji(text) : text,
    web_app: { url: webAppUrl },
  };
  if (style) b.style = style;
  if (eid) { b.icon_custom_emoji_id = eid; b._original_text = text; }
  return b;
}

/** Build a raw inline_keyboard reply_markup from rows of styled buttons. */
export function inlineKeyboard(...rows: StyledButton[][]): any {
  return { inline_keyboard: rows.filter(r => r.length > 0) };
}

// ── Reply-keyboard button builders ──────────────────────────────────────────

export function replyBtn(text: string, emojiName?: string, style?: ButtonStyle): any {
  const eid = emojiName ? getEmojiId(emojiName) : undefined;
  const b: any = { text };
  if (style) b.style = style;
  if (eid) b.icon_custom_emoji_id = eid;
  return b;
}

export function replyKb(
  rows: any[][],
  opts: { resize?: boolean; persistent?: boolean } = {},
): any {
  return {
    keyboard: rows,
    resize_keyboard: opts.resize !== false,
    is_persistent: opts.persistent !== false,
  };
}

// ── Fallback stripping (when API rejects custom emoji) ──────────────────────

export function stripIconFromButtons(rows: StyledButton[][]): StyledButton[][] {
  return rows.map(row =>
    row.map(b => {
      if (!b.icon_custom_emoji_id) return b;
      const { icon_custom_emoji_id: _, _original_text, ...rest } = b;
      if (_original_text) rest.text = _original_text;
      return rest;
    }),
  );
}

export function stripIconFromKeyboard(
  rm: { inline_keyboard: StyledButton[][] },
): { inline_keyboard: StyledButton[][] } {
  return { inline_keyboard: stripIconFromButtons(rm.inline_keyboard) };
}

async function safeSend<T>(
  primary: () => Promise<T>,
  fallback: () => Promise<T>,
): Promise<T> {
  try {
    return await primary();
  } catch (error: any) {
    const msg: string = error?.message || error?.description || '';
    if (
      msg.includes('BUTTON_ICON') ||
      msg.includes('custom_emoji') ||
      msg.includes('icon_custom_emoji_id')
    ) {
      log.warn({ error: msg }, 'Custom emoji error — retrying without icons');
      disable('API error');
      return fallback();
    }
    throw error;
  }
}

export async function safeReply(ctx: any, text: string, options: any): Promise<any> {
  return safeSend(
    () => ctx.reply(text, options),
    () => {
      const clean = { ...options };
      if (clean.reply_markup?.inline_keyboard) {
        clean.reply_markup = stripIconFromKeyboard(clean.reply_markup);
      }
      return ctx.reply(text, clean);
    },
  );
}

export async function safeEditMessageText(ctx: any, text: string, options: any): Promise<any> {
  return safeSend(
    () => ctx.editMessageText(text, options),
    () => {
      const clean = { ...options };
      if (clean.reply_markup?.inline_keyboard) {
        clean.reply_markup = stripIconFromKeyboard(clean.reply_markup);
      }
      return ctx.editMessageText(text, clean);
    },
  );
}
