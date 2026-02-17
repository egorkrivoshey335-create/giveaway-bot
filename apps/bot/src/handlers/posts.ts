import type { Context } from 'grammy';
import { InlineKeyboard } from 'grammy';
import { POST_LIMITS } from '@randombeast/shared';
import { config } from '../config.js';
import { apiService } from '../services/api.js';
import { createMainMenuKeyboard } from '../keyboards/mainMenu.js';
import { t, getUserLocale, type Locale } from '../i18n/index.js';
import { createLogger } from '../lib/logger.js';

const log = createLogger('handlers:posts');

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
export function createPostsKeyboard(locale: Locale = 'ru'): InlineKeyboard {
  const createPost = locale === 'ru' ? '📝 Создать пост' : locale === 'en' ? '📝 Create Post' : '📝 Жазба жасау';
  const back = locale === 'ru' ? '⬅️ Назад' : locale === 'en' ? '⬅️ Back' : '⬅️ Артқа';
  const toMenu = locale === 'ru' ? '🏠 В меню' : locale === 'en' ? '🏠 Menu' : '🏠 Мәзір';
  
  return new InlineKeyboard()
    .text(createPost, 'create_post')
    .row()
    .text(back, 'back_to_menu')
    .text(toMenu, 'go_to_menu');
}

/**
 * Create keyboard for cancel action during post creation
 */
export function createPostCancelKeyboard(locale: Locale = 'ru'): InlineKeyboard {
  const cancel = locale === 'ru' ? '❌ Отмена' : locale === 'en' ? '❌ Cancel' : '❌ Болдырмау';
  return new InlineKeyboard()
    .text(cancel, 'cancel_post_creation');
}

/**
 * Create keyboard after successful post creation
 */
export function createPostCreatedKeyboard(templateId: string, locale: Locale = 'ru'): InlineKeyboard {
  const openApp = locale === 'ru' ? '📱 Открыть приложение' : locale === 'en' ? '📱 Open App' : '📱 Қолданбаны ашу';
  const createMore = locale === 'ru' ? '📝 Создать ещё' : locale === 'en' ? '📝 Create More' : '📝 Тағы жасау';
  const deleteBtn = locale === 'ru' ? '🗑️ Удалить' : locale === 'en' ? '🗑️ Delete' : '🗑️ Жою';
  
  return new InlineKeyboard()
    .webApp(openApp, config.webappUrl)
    .row()
    .text(createMore, 'create_post')
    .text(deleteBtn, `delete_template:${templateId}`);
}

/**
 * Create undo keyboard
 */
export function createUndoKeyboard(templateId: string, locale: Locale = 'ru'): InlineKeyboard {
  const undo = locale === 'ru' ? '↩️ Вернуть (20s)' : locale === 'en' ? '↩️ Undo (20s)' : '↩️ Қайтару (20s)';
  return new InlineKeyboard()
    .text(undo, `undo_delete:${templateId}`);
}

/**
 * Get posts section message
 */
export function getPostsMessage(locale: Locale = 'ru'): string {
  if (locale === 'en') {
    return `📝 <b>Post Templates</b>

Here you can create a template for giveaway publication.

<b>Supported formats:</b>
• Text (up to ${POST_LIMITS.TEXT_MAX_LENGTH} characters)
• Photo with caption (up to ${POST_LIMITS.CAPTION_MAX_LENGTH} characters)
• Video with caption (up to ${POST_LIMITS.CAPTION_MAX_LENGTH} characters)`;
  }
  
  if (locale === 'kk') {
    return `📝 <b>Жазба үлгілері</b>

Мұнда ұтыс ойынына жариялау үшін үлгі жасай аласыз.

<b>Қолдау көрсетілетін форматтар:</b>
• Мәтін (${POST_LIMITS.TEXT_MAX_LENGTH} таңбаға дейін)
• Жазуы бар фото (${POST_LIMITS.CAPTION_MAX_LENGTH} таңбаға дейін)
• Жазуы бар бейне (${POST_LIMITS.CAPTION_MAX_LENGTH} таңбаға дейін)`;
  }
  
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
export function getWaitingForPostMessage(locale: Locale = 'ru'): string {
  if (locale === 'en') {
    return `📝 <b>Creating Template</b>

Send:
• Text message (up to ${POST_LIMITS.TEXT_MAX_LENGTH} characters)
• Photo with caption (up to ${POST_LIMITS.CAPTION_MAX_LENGTH} characters)
• Video with caption (up to ${POST_LIMITS.CAPTION_MAX_LENGTH} characters)

<i>Send /cancel to abort</i>`;
  }
  
  if (locale === 'kk') {
    return `📝 <b>Үлгі жасау</b>

Жіберіңіз:
• Мәтіндік хабар (${POST_LIMITS.TEXT_MAX_LENGTH} таңбаға дейін)
• Жазуы бар фото (${POST_LIMITS.CAPTION_MAX_LENGTH} таңбаға дейін)
• Жазуы бар бейне (${POST_LIMITS.CAPTION_MAX_LENGTH} таңбаға дейін)

<i>Бас тарту үшін /cancel жіберіңіз</i>`;
  }
  
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
  
  const locale = getUserLocale(userId);

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
    const msg = locale === 'ru' ? '❌ Неподдерживаемый тип сообщения.\n\nОтправьте текст, фото или видео.' :
                locale === 'en' ? '❌ Unsupported message type.\n\nSend text, photo, or video.' :
                '❌ Қолдау көрсетілмейтін хабар түрі.\n\nМәтін, фото немесе бейне жіберіңіз.';
    await ctx.reply(msg, { reply_markup: createPostCancelKeyboard(locale) });
    setUserAwaitingPost(userId);
    return;
  }

  // Validate text length
  const maxLength = mediaType === 'NONE' 
    ? POST_LIMITS.TEXT_MAX_LENGTH 
    : POST_LIMITS.CAPTION_MAX_LENGTH;

  if (text.length > maxLength) {
    const yourText = locale === 'ru' ? 'Ваш текст' : locale === 'en' ? 'Your text' : 'Сіздің мәтін';
    const maxLabel = locale === 'ru' ? 'Максимум' : locale === 'en' ? 'Maximum' : 'Максимум';
    const charsLabel = locale === 'ru' ? 'символов' : locale === 'en' ? 'characters' : 'таңба';
    const mediaNote = mediaType !== 'NONE' 
      ? (locale === 'ru' ? 'Для постов с медиа ограничение — 1024 символа.' :
         locale === 'en' ? 'For posts with media, the limit is 1024 characters.' :
         'Медиалы жазбалар үшін шек — 1024 таңба.')
      : '';
    const shortenMsg = locale === 'ru' ? 'Сократите текст и отправьте снова.' :
                       locale === 'en' ? 'Shorten the text and try again.' :
                       'Мәтінді қысқартып, қайта жіберіңіз.';
    const tooLong = locale === 'ru' ? 'Текст слишком длинный' : locale === 'en' ? 'Text is too long' : 'Мәтін тым ұзын';
    
    await ctx.reply(
      `❌ <b>${tooLong}</b>\n\n` +
      `${yourText}: ${text.length} ${charsLabel}\n` +
      `${maxLabel}: ${maxLength} ${charsLabel}\n\n` +
      `${mediaNote}\n\n` +
      shortenMsg,
      { 
        parse_mode: 'HTML',
        reply_markup: createPostCancelKeyboard(locale),
      }
    );
    setUserAwaitingPost(userId);
    return;
  }

  if (!text.trim()) {
    const msg = locale === 'ru' ? '❌ Текст не может быть пустым.\n\nДобавьте текст или подпись к медиа.' :
                locale === 'en' ? '❌ Text cannot be empty.\n\nAdd text or caption to media.' :
                '❌ Мәтін бос болуы мүмкін емес.\n\nМәтін немесе медиаға жазу қосыңыз.';
    await ctx.reply(msg, { reply_markup: createPostCancelKeyboard(locale) });
    setUserAwaitingPost(userId);
    return;
  }

  // Save to API
  const savingMsg = locale === 'ru' ? '⏳ Сохраняю шаблон...' : locale === 'en' ? '⏳ Saving template...' : '⏳ Үлгіні сақтаудамын...';
  await ctx.reply(savingMsg);

  const result = await apiService.createPostTemplate({
    telegramUserId: userId,
    text,
    mediaType,
    telegramFileId,
    telegramFileUniqueId,
  });

  if (!result.ok) {
    const errorPrefix = locale === 'ru' ? '❌ Ошибка сохранения:' : locale === 'en' ? '❌ Save error:' : '❌ Сақтау қатесі:';
    await ctx.reply(
      `${errorPrefix} ${result.error}`,
      { reply_markup: createPostCancelKeyboard(locale) }
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
  const savedMsg = locale === 'ru' ? 'Шаблон сохранён!' : locale === 'en' ? 'Template saved!' : 'Үлгі сақталды!';
  const typeLabel = locale === 'ru' 
    ? (mediaType === 'NONE' ? 'Текст' : mediaType === 'PHOTO' ? 'Фото' : 'Видео')
    : locale === 'en'
    ? (mediaType === 'NONE' ? 'Text' : mediaType === 'PHOTO' ? 'Photo' : 'Video')
    : (mediaType === 'NONE' ? 'Мәтін' : mediaType === 'PHOTO' ? 'Фото' : 'Бейне');
  const typeName = locale === 'ru' ? 'Тип' : locale === 'en' ? 'Type' : 'Түрі';
  const lengthLabel = locale === 'ru' ? 'Длина текста' : locale === 'en' ? 'Text length' : 'Мәтін ұзындығы';
  const charsLabel = locale === 'ru' ? 'символов' : locale === 'en' ? 'characters' : 'таңба';
  
  await ctx.reply(
    `✅ <b>${savedMsg}</b>\n\n` +
    `${typeName}: ${typeLabel}\n` +
    `${lengthLabel}: ${text.length} ${charsLabel}`,
    { parse_mode: 'HTML' }
  );

  // Send preview
  const previewLabel = locale === 'ru' ? 'Предпросмотр:' : locale === 'en' ? 'Preview:' : 'Алдын ала қарау:';
  await ctx.reply(`👁 <b>${previewLabel}</b>`, { parse_mode: 'HTML' });

  try {
    if (mediaType === 'NONE') {
      await ctx.reply(text);
    } else if (mediaType === 'PHOTO' && telegramFileId) {
      await ctx.replyWithPhoto(telegramFileId, { caption: text });
    } else if (mediaType === 'VIDEO' && telegramFileId) {
      await ctx.replyWithVideo(telegramFileId, { caption: text });
    }
  } catch (error) {
    log.error({ error }, 'Preview send error');
    const previewError = locale === 'ru' ? '⚠️ Не удалось показать предпросмотр, но шаблон сохранён.' :
                         locale === 'en' ? '⚠️ Could not show preview, but template is saved.' :
                         '⚠️ Алдын ала қарауды көрсету мүмкін болмады, бірақ үлгі сақталды.';
    await ctx.reply(previewError);
  }

  // Send action buttons
  const whatNext = locale === 'ru' ? 'Что дальше?' : locale === 'en' ? 'What\'s next?' : 'Келесі не?';
  await ctx.reply(
    whatNext,
    { reply_markup: createPostCreatedKeyboard(templateId, locale) }
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
    
    const locale = getUserLocale(userId);

    setUserAwaitingPost(userId);
    await ctx.answerCallbackQuery();
    await ctx.reply(getWaitingForPostMessage(locale), {
      parse_mode: 'HTML',
      reply_markup: createPostCancelKeyboard(locale),
    });
  });

  // Handle cancel post creation
  bot.callbackQuery('cancel_post_creation', async (ctx) => {
    const userId = ctx.from?.id;
    const locale = userId ? getUserLocale(userId) : 'ru';
    
    if (userId) {
      clearUserPostState(userId);
    }
    
    const cancelledNotif = locale === 'ru' ? 'Отменено' : locale === 'en' ? 'Cancelled' : 'Болдырылмады';
    const cancelledMsg = locale === 'ru' ? '❌ Создание отменено.' : locale === 'en' ? '❌ Creation cancelled.' : '❌ Жасау болдырылмады.';
    
    await ctx.answerCallbackQuery(cancelledNotif);
    await ctx.reply(cancelledMsg, {
      reply_markup: createMainMenuKeyboard(locale),
    });
  });

  // Handle delete template
  bot.callbackQuery(/^delete_template:/, async (ctx) => {
    const userId = ctx.from?.id;
    const locale = userId ? getUserLocale(userId) : 'ru';
    const templateId = ctx.callbackQuery.data.replace('delete_template:', '');
    
    const result = await apiService.deletePostTemplate(templateId);
    
    if (!result.ok) {
      const errorPrefix = locale === 'ru' ? 'Ошибка:' : locale === 'en' ? 'Error:' : 'Қате:';
      await ctx.answerCallbackQuery({
        text: `${errorPrefix} ${result.error}`,
        show_alert: true,
      });
      return;
    }

    const deletedNotif = locale === 'ru' ? 'Удалено' : locale === 'en' ? 'Deleted' : 'Жойылды';
    const deletedMsg = locale === 'ru' ? '🗑️ Шаблон удалён.' : locale === 'en' ? '🗑️ Template deleted.' : '🗑️ Үлгі жойылды.';
    
    await ctx.answerCallbackQuery(deletedNotif);
    await ctx.editMessageText(
      deletedMsg,
      { reply_markup: createUndoKeyboard(templateId, locale) }
    );
  });

  // Handle undo delete
  bot.callbackQuery(/^undo_delete:/, async (ctx) => {
    const userId = ctx.from?.id;
    const locale = userId ? getUserLocale(userId) : 'ru';
    const templateId = ctx.callbackQuery.data.replace('undo_delete:', '');
    
    const result = await apiService.undoDeletePostTemplate(templateId);
    
    if (!result.ok) {
      const errorMsg = locale === 'ru' ? 'Не удалось восстановить' : locale === 'en' ? 'Could not restore' : 'Қалпына келтіру мүмкін болмады';
      await ctx.answerCallbackQuery({
        text: result.error || errorMsg,
        show_alert: true,
      });
      return;
    }

    const restoredNotif = locale === 'ru' ? 'Восстановлено!' : locale === 'en' ? 'Restored!' : 'Қалпына келтірілді!';
    const restoredMsg = locale === 'ru' ? '✅ Шаблон восстановлен.' : locale === 'en' ? '✅ Template restored.' : '✅ Үлгі қалпына келтірілді.';
    
    await ctx.answerCallbackQuery(restoredNotif);
    await ctx.editMessageText(
      restoredMsg,
      { reply_markup: createPostCreatedKeyboard(templateId, locale) }
    );
  });
}
