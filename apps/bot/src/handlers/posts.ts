import type { Context } from 'grammy';
import { InlineKeyboard } from 'grammy';
import { POST_LIMITS } from '@randombeast/shared';
import { config } from '../config.js';
import { apiService } from '../services/api.js';
import { createMainMenuKeyboard } from '../keyboards/mainMenu.js';

// Simple in-memory state for post creation flow
interface PostCreateState {
  awaitingPost: boolean;
  expiresAt: number;
}

const userPostState = new Map<number, PostCreateState>();
const STATE_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

// Store recently created templates for preview/delete
interface RecentTemplate {
  id: string;
  text: string;
  mediaType: 'NONE' | 'PHOTO' | 'VIDEO';
  telegramFileId?: string;
  createdAt: number;
}

const userRecentTemplates = new Map<number, RecentTemplate>();

/**
 * Set user state for awaiting post input
 */
export function setUserAwaitingPost(userId: number) {
  userPostState.set(userId, {
    awaitingPost: true,
    expiresAt: Date.now() + STATE_TIMEOUT_MS,
  });
}

/**
 * Check if user is awaiting post input
 */
export function isUserAwaitingPost(userId: number): boolean {
  const state = userPostState.get(userId);
  if (!state || state.expiresAt < Date.now()) {
    userPostState.delete(userId);
    return false;
  }
  return state.awaitingPost;
}

/**
 * Clear user post state
 */
export function clearUserPostState(userId: number) {
  userPostState.delete(userId);
}

/**
 * Store recent template for user
 */
function storeRecentTemplate(userId: number, template: RecentTemplate) {
  userRecentTemplates.set(userId, template);
  // Auto-clear after 5 minutes
  setTimeout(() => {
    const stored = userRecentTemplates.get(userId);
    if (stored && stored.id === template.id) {
      userRecentTemplates.delete(userId);
    }
  }, 5 * 60 * 1000);
}

/**
 * Get recent template for user
 */
export function getRecentTemplate(userId: number): RecentTemplate | null {
  return userRecentTemplates.get(userId) || null;
}

/**
 * Create inline keyboard for posts management
 */
export function createPostsKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text('📝 Создать пост', 'create_post')
    .row()
    .text('⬅️ Назад', 'back_to_menu')
    .text('🏠 В меню', 'go_to_menu');
}

/**
 * Create keyboard for cancel action during post creation
 */
export function createPostCancelKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text('❌ Отмена', 'cancel_post_creation');
}

/**
 * Create keyboard after successful post creation
 */
export function createPostCreatedKeyboard(templateId: string): InlineKeyboard {
  return new InlineKeyboard()
    .webApp('📱 Открыть приложение', config.webappUrl)
    .row()
    .text('📝 Создать ещё', 'create_post')
    .text('🗑️ Удалить', `delete_template:${templateId}`);
}

/**
 * Create undo keyboard
 */
export function createUndoKeyboard(templateId: string): InlineKeyboard {
  return new InlineKeyboard()
    .text('↩️ Вернуть (20s)', `undo_delete:${templateId}`);
}

/**
 * Get posts section message
 */
export function getPostsMessage(): string {
  return `📝 <b>Шаблоны постов</b>

Здесь вы можете создать шаблон для публикации в розыгрыше.

<b>Поддерживаемые форматы:</b>
• Текст (до ${POST_LIMITS.TEXT_MAX_LENGTH} символов)
• Фото с подписью (до ${POST_LIMITS.CAPTION_MAX_LENGTH} символов)
• Видео с подписью (до ${POST_LIMITS.CAPTION_MAX_LENGTH} символов)`;
}

/**
 * Get waiting for post message
 */
export function getWaitingForPostMessage(): string {
  return `📝 <b>Создание шаблона</b>

Отправьте:
• Текстовое сообщение (до ${POST_LIMITS.TEXT_MAX_LENGTH} символов)
• Фото с подписью (до ${POST_LIMITS.CAPTION_MAX_LENGTH} символов)
• Видео с подписью (до ${POST_LIMITS.CAPTION_MAX_LENGTH} символов)

<i>Отправьте /cancel для отмены</i>`;
}

/**
 * Handle post creation from user message
 */
export async function handlePostCreation(ctx: Context) {
  const userId = ctx.from?.id;
  if (!userId) return;

  clearUserPostState(userId);

  let text = '';
  let mediaType: 'NONE' | 'PHOTO' | 'VIDEO' = 'NONE';
  let telegramFileId: string | undefined;
  let telegramFileUniqueId: string | undefined;

  // Check message type
  if (ctx.message?.photo) {
    // Photo message - take largest size
    const photos = ctx.message.photo;
    const largest = photos[photos.length - 1];
    telegramFileId = largest.file_id;
    telegramFileUniqueId = largest.file_unique_id;
    mediaType = 'PHOTO';
    text = ctx.message.caption || '';
  } else if (ctx.message?.video) {
    telegramFileId = ctx.message.video.file_id;
    telegramFileUniqueId = ctx.message.video.file_unique_id;
    mediaType = 'VIDEO';
    text = ctx.message.caption || '';
  } else if (ctx.message?.text) {
    text = ctx.message.text;
    mediaType = 'NONE';
  } else {
    await ctx.reply(
      '❌ Неподдерживаемый тип сообщения.\n\n' +
      'Отправьте текст, фото или видео.',
      { reply_markup: createPostCancelKeyboard() }
    );
    setUserAwaitingPost(userId);
    return;
  }

  // Validate text length
  const maxLength = mediaType === 'NONE' 
    ? POST_LIMITS.TEXT_MAX_LENGTH 
    : POST_LIMITS.CAPTION_MAX_LENGTH;

  if (text.length > maxLength) {
    await ctx.reply(
      `❌ <b>Текст слишком длинный</b>\n\n` +
      `Ваш текст: ${text.length} символов\n` +
      `Максимум: ${maxLength} символов\n\n` +
      `${mediaType !== 'NONE' ? 'Для постов с медиа ограничение — 1024 символа.' : ''}\n\n` +
      `Сократите текст и отправьте снова.`,
      { 
        parse_mode: 'HTML',
        reply_markup: createPostCancelKeyboard(),
      }
    );
    setUserAwaitingPost(userId);
    return;
  }

  if (!text.trim()) {
    await ctx.reply(
      '❌ Текст не может быть пустым.\n\n' +
      'Добавьте текст или подпись к медиа.',
      { reply_markup: createPostCancelKeyboard() }
    );
    setUserAwaitingPost(userId);
    return;
  }

  // Save to API
  await ctx.reply('⏳ Сохраняю шаблон...');

  const result = await apiService.createPostTemplate({
    telegramUserId: userId,
    text,
    mediaType,
    telegramFileId,
    telegramFileUniqueId,
  });

  if (!result.ok) {
    await ctx.reply(
      `❌ Ошибка сохранения: ${result.error}`,
      { reply_markup: createPostCancelKeyboard() }
    );
    setUserAwaitingPost(userId);
    return;
  }

  const templateId = result.template!.id;

  // Store for later use
  storeRecentTemplate(userId, {
    id: templateId,
    text,
    mediaType,
    telegramFileId,
    createdAt: Date.now(),
  });

  // Send success message
  await ctx.reply(
    `✅ <b>Шаблон сохранён!</b>\n\n` +
    `Тип: ${mediaType === 'NONE' ? 'Текст' : mediaType === 'PHOTO' ? 'Фото' : 'Видео'}\n` +
    `Длина текста: ${text.length} символов`,
    { parse_mode: 'HTML' }
  );

  // Send preview
  await ctx.reply('👁 <b>Предпросмотр:</b>', { parse_mode: 'HTML' });

  try {
    if (mediaType === 'NONE') {
      await ctx.reply(text);
    } else if (mediaType === 'PHOTO' && telegramFileId) {
      await ctx.replyWithPhoto(telegramFileId, { caption: text });
    } else if (mediaType === 'VIDEO' && telegramFileId) {
      await ctx.replyWithVideo(telegramFileId, { caption: text });
    }
  } catch (error) {
    console.error('Preview send error:', error);
    await ctx.reply('⚠️ Не удалось показать предпросмотр, но шаблон сохранён.');
  }

  // Send action buttons
  await ctx.reply(
    'Что дальше?',
    { reply_markup: createPostCreatedKeyboard(templateId) }
  );
}

/**
 * Register post-related handlers
 */
export function registerPostHandlers(bot: import('grammy').Bot) {
  // Handle "Create post" button
  bot.callbackQuery('create_post', async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) return;

    setUserAwaitingPost(userId);
    await ctx.answerCallbackQuery();
    await ctx.reply(getWaitingForPostMessage(), {
      parse_mode: 'HTML',
      reply_markup: createPostCancelKeyboard(),
    });
  });

  // Handle cancel post creation
  bot.callbackQuery('cancel_post_creation', async (ctx) => {
    const userId = ctx.from?.id;
    if (userId) {
      clearUserPostState(userId);
    }
    await ctx.answerCallbackQuery('Отменено');
    await ctx.reply('❌ Создание отменено.', {
      reply_markup: createMainMenuKeyboard(),
    });
  });

  // Handle delete template
  bot.callbackQuery(/^delete_template:/, async (ctx) => {
    const templateId = ctx.callbackQuery.data.replace('delete_template:', '');
    
    const result = await apiService.deletePostTemplate(templateId);
    
    if (!result.ok) {
      await ctx.answerCallbackQuery({
        text: `Ошибка: ${result.error}`,
        show_alert: true,
      });
      return;
    }

    await ctx.answerCallbackQuery('Удалено');
    await ctx.editMessageText(
      '🗑️ Шаблон удалён.',
      { reply_markup: createUndoKeyboard(templateId) }
    );
  });

  // Handle undo delete
  bot.callbackQuery(/^undo_delete:/, async (ctx) => {
    const templateId = ctx.callbackQuery.data.replace('undo_delete:', '');
    
    const result = await apiService.undoDeletePostTemplate(templateId);
    
    if (!result.ok) {
      await ctx.answerCallbackQuery({
        text: result.error || 'Не удалось восстановить',
        show_alert: true,
      });
      return;
    }

    await ctx.answerCallbackQuery('Восстановлено!');
    await ctx.editMessageText(
      '✅ Шаблон восстановлен.',
      { reply_markup: createPostCreatedKeyboard(templateId) }
    );
  });
}
