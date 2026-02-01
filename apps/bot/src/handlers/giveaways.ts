import { Bot, InlineKeyboard, Context } from 'grammy';
import { config } from '../config.js';
import { apiService } from '../services/api.js';
import { buildMiniAppLink } from '@randombeast/shared';

// Названия для отображения
const TYPE_LABELS: Record<string, string> = {
  STANDARD: '🎁 Стандартный',
  BOOST_REQUIRED: '🚀 С бустами',
  INVITE_REQUIRED: '👥 С инвайтами',
  CUSTOM: '⚙️ Кастомный',
};

const LANGUAGE_LABELS: Record<string, string> = {
  RU: '🇷🇺 Русский',
  EN: '🇬🇧 English',
  KK: '🇰🇿 Қазақша',
};

const CAPTCHA_MODE_LABELS: Record<string, string> = {
  OFF: 'Выключена',
  SUSPICIOUS_ONLY: 'Для подозрительных',
  ALL: 'Для всех',
};

/**
 * Handle /start confirm_<giveawayId>
 */
export async function handleConfirmStart(ctx: Context, giveawayId: string): Promise<void> {
  const userId = ctx.from?.id;
  if (!userId) {
    await ctx.reply('❌ Не удалось определить пользователя');
    return;
  }

  // Fetch full giveaway info
  const result = await apiService.getGiveawayFull(giveawayId);

  if (!result.ok || !result.giveaway || !result.owner) {
    await ctx.reply(`❌ ${result.error || 'Розыгрыш не найден'}`);
    return;
  }

  // Verify ownership
  if (result.owner.telegramUserId !== userId.toString()) {
    await ctx.reply('❌ Этот розыгрыш принадлежит другому пользователю');
    return;
  }

  // Verify status
  if (result.giveaway.status !== 'PENDING_CONFIRM') {
    const statusMessages: Record<string, string> = {
      DRAFT: 'Розыгрыш ещё в черновике. Завершите настройку в приложении.',
      ACTIVE: 'Розыгрыш уже опубликован и активен.',
      SCHEDULED: 'Розыгрыш уже запланирован.',
      FINISHED: 'Розыгрыш завершён.',
      CANCELLED: 'Розыгрыш отменён.',
    };
    await ctx.reply(`⚠️ ${statusMessages[result.giveaway.status] || 'Некорректный статус розыгрыша'}`);
    return;
  }

  const { giveaway, postTemplate, channels, protection } = result;

  // Send post preview
  if (postTemplate) {
    try {
      if (postTemplate.mediaType === 'PHOTO' && postTemplate.telegramFileId) {
        await ctx.replyWithPhoto(postTemplate.telegramFileId, {
          caption: `📝 <b>Превью поста:</b>\n\n${postTemplate.text}`,
          parse_mode: 'HTML',
        });
      } else if (postTemplate.mediaType === 'VIDEO' && postTemplate.telegramFileId) {
        await ctx.replyWithVideo(postTemplate.telegramFileId, {
          caption: `📝 <b>Превью поста:</b>\n\n${postTemplate.text}`,
          parse_mode: 'HTML',
        });
      } else {
        await ctx.reply(`📝 <b>Превью поста:</b>\n\n${postTemplate.text}`, {
          parse_mode: 'HTML',
        });
      }
    } catch (error) {
      console.error('Error sending preview:', error);
      await ctx.reply(`📝 <b>Превью поста:</b>\n\n${postTemplate.text}`, {
        parse_mode: 'HTML',
      });
    }
  } else {
    await ctx.reply('⚠️ Шаблон поста не найден');
  }

  // Format channels info
  const formatChannels = (list: Array<{ title: string; username: string | null }>) =>
    list.length > 0
      ? list.map(c => `  • ${c.title}${c.username ? ` (${c.username})` : ''}`).join('\n')
      : '  — не выбрано';

  // Send giveaway info
  const captchaModeLabel = CAPTCHA_MODE_LABELS[protection?.captchaMode || 'SUSPICIOUS_ONLY'] || protection?.captchaMode;
  const livenessLabel = protection?.livenessEnabled ? '✅' : '❌';
  
  // Дополнительные билеты
  const inviteLabel = protection?.inviteEnabled 
    ? `✅ (макс. ${protection.inviteMax || 10})` 
    : '❌';
  const boostLabel = protection?.boostEnabled ? '✅' : '❌';
  const storiesLabel = protection?.storiesEnabled ? '✅' : '❌';

  const infoMessage = `📋 <b>Информация о розыгрыше:</b>

📝 <b>Название:</b> ${giveaway.title}
🎲 <b>Тип:</b> ${TYPE_LABELS[giveaway.type] || giveaway.type}
🗣 <b>Язык:</b> ${LANGUAGE_LABELS[giveaway.language] || giveaway.language}
🏆 <b>Победителей:</b> ${giveaway.winnersCount}
📅 <b>Начало:</b> ${giveaway.startAt ? new Date(giveaway.startAt).toLocaleString('ru-RU') : 'Сразу после подтверждения'}
📅 <b>Окончание:</b> ${giveaway.endAt ? new Date(giveaway.endAt).toLocaleString('ru-RU') : 'Не указано'}

🔒 <b>Защита:</b>
  Капча: ${captchaModeLabel}
  Liveness: ${livenessLabel}

🎫 <b>Дополнительные билеты:</b>
  👥 Приглашения: ${inviteLabel}
  ⚡ Бусты: ${boostLabel}
  📺 Сторис: ${storiesLabel}

📢 <b>Каналы для подписки:</b>
${formatChannels(channels?.requiredSubscriptions || [])}

📣 <b>Публикация в:</b>
${formatChannels(channels?.publish || [])}

🏁 <b>Итоги в:</b>
${formatChannels(channels?.results || [])}`;

  await ctx.reply(infoMessage, { parse_mode: 'HTML' });

  // Send confirmation prompt with buttons
  const confirmKeyboard = new InlineKeyboard()
    .text('✅ Принять', `giveaway_accept:${giveawayId}`)
    .text('❌ Отклонить', `giveaway_reject:${giveawayId}`);

  await ctx.reply(
    `🔔 <b>Всё верно?</b> Нажмите "Принять" для публикации.

⚠️ Убедитесь что бот имеет права на публикацию в выбранных каналах!`,
    {
      parse_mode: 'HTML',
      reply_markup: confirmKeyboard,
    }
  );
}

/**
 * Register giveaway handlers
 */
export function registerGiveawayHandlers(bot: Bot): void {
  // Handle giveaway accept callback
  bot.callbackQuery(/^giveaway_accept:/, async (ctx) => {
    const giveawayId = ctx.callbackQuery.data.replace('giveaway_accept:', '');
    const userId = ctx.from?.id;

    if (!userId) {
      await ctx.answerCallbackQuery({ text: '❌ Ошибка', show_alert: true });
      return;
    }

    // Answer callback immediately
    await ctx.answerCallbackQuery();

    // Edit message to show progress
    try {
      await ctx.editMessageText('⏳ Публикуем розыгрыш...');
    } catch {
      // Message might not be editable
    }

    // Fetch giveaway info
    const result = await apiService.getGiveawayFull(giveawayId);

    if (!result.ok || !result.giveaway || !result.channels || !result.owner) {
      await ctx.editMessageText(`❌ ${result.error || 'Ошибка загрузки розыгрыша'}`);
      return;
    }

    // Verify ownership
    if (result.owner.telegramUserId !== userId.toString()) {
      await ctx.editMessageText('❌ Этот розыгрыш принадлежит другому пользователю');
      return;
    }

    // Verify status
    if (result.giveaway.status !== 'PENDING_CONFIRM') {
      await ctx.editMessageText('❌ Розыгрыш уже был обработан');
      return;
    }

    const { giveaway, postTemplate, channels } = result;

    if (!postTemplate) {
      await ctx.editMessageText('❌ Шаблон поста не найден');
      return;
    }

    if (channels.publish.length === 0) {
      await ctx.editMessageText('❌ Не выбраны каналы для публикации');
      return;
    }

    // Кнопка участия (используем URL для каналов, web_app там не работает)
    // Прямой Mini App link: https://t.me/BeastRandomBot/participate?startapp=join_<id>
    const buttonText = giveaway.buttonText || '🎁 Участвовать';
    const joinUrl = buildMiniAppLink(`join_${giveawayId}`);
    
    const postKeyboard = new InlineKeyboard()
      .url(buttonText, joinUrl);

    // Publish to all channels
    const publishedMessages: Array<{ channelId: string; telegramMessageId: number }> = [];
    const errors: string[] = [];

    for (const channel of channels.publish) {
      try {
        const chatId = channel.telegramChatId;
        let messageId: number;

        if (postTemplate.mediaType === 'PHOTO' && postTemplate.telegramFileId) {
          const sent = await ctx.api.sendPhoto(chatId, postTemplate.telegramFileId, {
            caption: postTemplate.text,
            reply_markup: postKeyboard,
            parse_mode: 'HTML',
          });
          messageId = sent.message_id;
        } else if (postTemplate.mediaType === 'VIDEO' && postTemplate.telegramFileId) {
          const sent = await ctx.api.sendVideo(chatId, postTemplate.telegramFileId, {
            caption: postTemplate.text,
            reply_markup: postKeyboard,
            parse_mode: 'HTML',
          });
          messageId = sent.message_id;
        } else {
          const sent = await ctx.api.sendMessage(chatId, postTemplate.text, {
            reply_markup: postKeyboard,
            parse_mode: 'HTML',
          });
          messageId = sent.message_id;
        }

        publishedMessages.push({
          channelId: channel.id,
          telegramMessageId: messageId,
        });
      } catch (error) {
        console.error(`Failed to publish to channel ${channel.title}:`, error);
        const errMsg = error instanceof Error ? error.message : String(error);
        errors.push(`${channel.title}: ${errMsg.includes('not enough rights') ? 'нет прав на публикацию' : errMsg}`);
      }
    }

    // If all failed, don't update status
    if (publishedMessages.length === 0) {
      const errorText = `❌ Не удалось опубликовать ни в один канал:\n\n${errors.join('\n')}`;
      await ctx.editMessageText(errorText);
      return;
    }

    // Accept giveaway
    const acceptResult = await apiService.acceptGiveaway(giveawayId, publishedMessages);

    if (!acceptResult.ok) {
      await ctx.editMessageText(`❌ Ошибка сохранения: ${acceptResult.error}`);
      return;
    }

    // Success message
    let successText = `✅ <b>Розыгрыш опубликован!</b>\n\n`;
    successText += `📣 Опубликовано в ${publishedMessages.length} из ${channels.publish.length} каналов\n`;
    successText += `📊 Статус: <b>${acceptResult.status === 'ACTIVE' ? 'Активен' : 'Запланирован'}</b>`;

    if (errors.length > 0) {
      successText += `\n\n⚠️ Ошибки:\n${errors.join('\n')}`;
    }

    const openAppKeyboard = new InlineKeyboard()
      .webApp('📱 Открыть приложение', config.webappUrl);

    await ctx.editMessageText(successText, {
      parse_mode: 'HTML',
      reply_markup: openAppKeyboard,
    });
  });

  // Handle giveaway reject callback
  bot.callbackQuery(/^giveaway_reject:/, async (ctx) => {
    const giveawayId = ctx.callbackQuery.data.replace('giveaway_reject:', '');
    const userId = ctx.from?.id;

    if (!userId) {
      await ctx.answerCallbackQuery({ text: '❌ Ошибка', show_alert: true });
      return;
    }

    // Verify ownership first
    const checkResult = await apiService.getGiveawayFull(giveawayId);
    if (!checkResult.ok || !checkResult.owner) {
      await ctx.answerCallbackQuery({ text: '❌ Розыгрыш не найден', show_alert: true });
      return;
    }

    if (checkResult.owner.telegramUserId !== userId.toString()) {
      await ctx.answerCallbackQuery({ text: '❌ Нет доступа', show_alert: true });
      return;
    }

    // Reject giveaway
    const result = await apiService.rejectGiveaway(giveawayId);

    if (!result.ok) {
      await ctx.answerCallbackQuery({ text: `❌ ${result.error}`, show_alert: true });
      return;
    }

    await ctx.answerCallbackQuery();

    const openAppKeyboard = new InlineKeyboard()
      .webApp('📱 Редактировать в приложении', `${config.webappUrl}?startapp=edit_${giveawayId}`);

    await ctx.editMessageText(
      '❌ <b>Публикация отменена</b>\n\nРозыгрыш возвращён в черновики. Вы можете отредактировать его в приложении.',
      {
        parse_mode: 'HTML',
        reply_markup: openAppKeyboard,
      }
    );
  });
}
