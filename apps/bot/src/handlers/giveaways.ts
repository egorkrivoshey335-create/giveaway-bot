import { Bot, InlineKeyboard, Context } from 'grammy';
import { config } from '../config.js';
import { apiService } from '../services/api.js';
import { createLogger } from '../lib/logger.js';

const log = createLogger('handlers:giveaways');
import { buildMiniAppLink } from '@randombeast/shared';
import { getUserLocale, type Locale } from '../i18n/index.js';

// Названия для отображения
const TYPE_LABELS: Record<Locale, Record<string, string>> = {
  ru: {
    STANDARD: '🎁 Стандартный',
    BOOST_REQUIRED: '🚀 С бустами',
    INVITE_REQUIRED: '👥 С инвайтами',
    CUSTOM: '⚙️ Кастомный',
  },
  en: {
    STANDARD: '🎁 Standard',
    BOOST_REQUIRED: '🚀 With boosts',
    INVITE_REQUIRED: '👥 With invites',
    CUSTOM: '⚙️ Custom',
  },
  kk: {
    STANDARD: '🎁 Стандартты',
    BOOST_REQUIRED: '🚀 Бусттармен',
    INVITE_REQUIRED: '👥 Шақырулармен',
    CUSTOM: '⚙️ Арнаулы',
  },
};

const LANGUAGE_LABELS: Record<string, string> = {
  RU: '🇷🇺 Русский',
  EN: '🇬🇧 English',
  KK: '🇰🇿 Қазақша',
};

const CAPTCHA_MODE_LABELS: Record<Locale, Record<string, string>> = {
  ru: {
    OFF: 'Выключена',
    SUSPICIOUS_ONLY: 'Для подозрительных',
    ALL: 'Для всех',
  },
  en: {
    OFF: 'Off',
    SUSPICIOUS_ONLY: 'For suspicious',
    ALL: 'For all',
  },
  kk: {
    OFF: 'Өшірулі',
    SUSPICIOUS_ONLY: 'Күдікті үшін',
    ALL: 'Барлығы үшін',
  },
};

/**
 * Handle /start confirm_<giveawayId>
 */
export async function handleConfirmStart(ctx: Context, giveawayId: string): Promise<void> {
  const userId = ctx.from?.id;
  if (!userId) {
    const locale = 'ru';
    const msg = locale === 'ru' ? '❌ Не удалось определить пользователя' : 
                locale === 'en' ? '❌ Could not identify user' : '❌ Пайдаланушыны анықтау мүмкін болмады';
    await ctx.reply(msg);
    return;
  }
  
  const locale = getUserLocale(userId);

  // Fetch full giveaway info
  const result = await apiService.getGiveawayFull(giveawayId);

  if (!result.ok || !result.giveaway || !result.owner) {
    const notFound = locale === 'ru' ? 'Розыгрыш не найден' : locale === 'en' ? 'Giveaway not found' : 'Ұтыс ойыны табылмады';
    await ctx.reply(`❌ ${result.error || notFound}`);
    return;
  }

  // Verify ownership
  if (result.owner.telegramUserId !== userId.toString()) {
    const wrongOwner = locale === 'ru' ? 'Этот розыгрыш принадлежит другому пользователю' :
                       locale === 'en' ? 'This giveaway belongs to another user' :
                       'Бұл ұтыс ойыны басқа пайдаланушыға тиесілі';
    await ctx.reply(`❌ ${wrongOwner}`);
    return;
  }

  // Verify status
  if (result.giveaway.status !== 'PENDING_CONFIRM') {
    const statusMessages: Record<Locale, Record<string, string>> = {
      ru: {
        DRAFT: 'Розыгрыш ещё в черновике. Завершите настройку в приложении.',
        ACTIVE: 'Розыгрыш уже опубликован и активен.',
        SCHEDULED: 'Розыгрыш уже запланирован.',
        FINISHED: 'Розыгрыш завершён.',
        CANCELLED: 'Розыгрыш отменён.',
      },
      en: {
        DRAFT: 'Giveaway is still a draft. Complete setup in the app.',
        ACTIVE: 'Giveaway is already published and active.',
        SCHEDULED: 'Giveaway is already scheduled.',
        FINISHED: 'Giveaway is finished.',
        CANCELLED: 'Giveaway is cancelled.',
      },
      kk: {
        DRAFT: 'Ұтыс ойыны әлі жоба. Қолданбада баптауды аяқтаңыз.',
        ACTIVE: 'Ұтыс ойыны жарияланып, белсенді.',
        SCHEDULED: 'Ұтыс ойыны жоспарланған.',
        FINISHED: 'Ұтыс ойыны аяқталды.',
        CANCELLED: 'Ұтыс ойыны болдырылмады.',
      },
    };
    const defaultMsg = locale === 'ru' ? 'Некорректный статус розыгрыша' : 
                       locale === 'en' ? 'Invalid giveaway status' : 'Ұтыс ойынының жарамсыз мәртебесі';
    await ctx.reply(`⚠️ ${statusMessages[locale][result.giveaway.status] || defaultMsg}`);
    return;
  }

  const { giveaway, postTemplate, channels, protection } = result;

  // Send post preview
  const previewLabel = locale === 'ru' ? 'Превью поста:' : locale === 'en' ? 'Post preview:' : 'Жазба алдын ала қарауы:';
  if (postTemplate) {
    try {
      if (postTemplate.mediaType === 'PHOTO' && postTemplate.telegramFileId) {
        await ctx.replyWithPhoto(postTemplate.telegramFileId, {
          caption: `📝 <b>${previewLabel}</b>\n\n${postTemplate.text}`,
          parse_mode: 'HTML',
        });
      } else if (postTemplate.mediaType === 'VIDEO' && postTemplate.telegramFileId) {
        await ctx.replyWithVideo(postTemplate.telegramFileId, {
          caption: `📝 <b>${previewLabel}</b>\n\n${postTemplate.text}`,
          parse_mode: 'HTML',
        });
      } else {
        await ctx.reply(`📝 <b>${previewLabel}</b>\n\n${postTemplate.text}`, {
          parse_mode: 'HTML',
        });
      }
    } catch (error) {
      log.error({ error }, 'Error sending preview');
      await ctx.reply(`📝 <b>${previewLabel}</b>\n\n${postTemplate.text}`, {
        parse_mode: 'HTML',
      });
    }
  } else {
    const noTemplate = locale === 'ru' ? '⚠️ Шаблон поста не найден' : 
                       locale === 'en' ? '⚠️ Post template not found' : '⚠️ Жазба үлгісі табылмады';
    await ctx.reply(noTemplate);
  }

  // Format channels info
  const notSelected = locale === 'ru' ? '— не выбрано' : locale === 'en' ? '— not selected' : '— таңдалмаған';
  const formatChannels = (list: Array<{ title: string; username: string | null }>) =>
    list.length > 0
      ? list.map(c => `  • ${c.title}${c.username ? ` (${c.username})` : ''}`).join('\n')
      : `  ${notSelected}`;

  // Send giveaway info
  const captchaModeLabel = CAPTCHA_MODE_LABELS[locale][protection?.captchaMode || 'SUSPICIOUS_ONLY'] || protection?.captchaMode;
  const livenessLabel = protection?.livenessEnabled ? '✅' : '❌';
  
  // Дополнительные билеты
  const maxLabel = locale === 'ru' ? 'макс.' : locale === 'en' ? 'max.' : 'макс.';
  const inviteLabel = protection?.inviteEnabled 
    ? `✅ (${maxLabel} ${protection.inviteMax || 10})` 
    : '❌';
  const boostLabel = protection?.boostEnabled ? '✅' : '❌';
  const storiesLabel = protection?.storiesEnabled ? '✅' : '❌';

  // Локализованные метки
  const labels = {
    ru: {
      info: 'Информация о розыгрыше:',
      title: 'Название:',
      type: 'Тип:',
      language: 'Язык:',
      winners: 'Победителей:',
      start: 'Начало:',
      end: 'Окончание:',
      protection: 'Защита:',
      captcha: 'Капча:',
      extraTickets: 'Дополнительные билеты:',
      invites: 'Приглашения:',
      boosts: 'Бусты:',
      stories: 'Сторис:',
      subscribeChannels: 'Каналы для подписки:',
      publishIn: 'Публикация в:',
      resultsIn: 'Итоги в:',
      afterConfirm: 'Сразу после подтверждения',
      notSpecified: 'Не указано',
    },
    en: {
      info: 'Giveaway Info:',
      title: 'Title:',
      type: 'Type:',
      language: 'Language:',
      winners: 'Winners:',
      start: 'Start:',
      end: 'End:',
      protection: 'Protection:',
      captcha: 'Captcha:',
      extraTickets: 'Extra Tickets:',
      invites: 'Invites:',
      boosts: 'Boosts:',
      stories: 'Stories:',
      subscribeChannels: 'Required subscriptions:',
      publishIn: 'Publish in:',
      resultsIn: 'Results in:',
      afterConfirm: 'Right after confirmation',
      notSpecified: 'Not specified',
    },
    kk: {
      info: 'Ұтыс ойыны туралы ақпарат:',
      title: 'Атауы:',
      type: 'Түрі:',
      language: 'Тілі:',
      winners: 'Жеңімпаздар:',
      start: 'Басталуы:',
      end: 'Аяқталуы:',
      protection: 'Қорғау:',
      captcha: 'Капча:',
      extraTickets: 'Қосымша билеттер:',
      invites: 'Шақырулар:',
      boosts: 'Бусттар:',
      stories: 'Сторис:',
      subscribeChannels: 'Жазылу арналары:',
      publishIn: 'Жариялау:',
      resultsIn: 'Нәтижелер:',
      afterConfirm: 'Растаудан кейін бірден',
      notSpecified: 'Көрсетілмеген',
    },
  };
  const l = labels[locale];

  const dateLocale = locale === 'kk' ? 'kk-KZ' : locale === 'en' ? 'en-US' : 'ru-RU';

  const infoMessage = `📋 <b>${l.info}</b>

📝 <b>${l.title}</b> ${giveaway.title}
🎲 <b>${l.type}</b> ${TYPE_LABELS[locale][giveaway.type] || giveaway.type}
🗣 <b>${l.language}</b> ${LANGUAGE_LABELS[giveaway.language] || giveaway.language}
🏆 <b>${l.winners}</b> ${giveaway.winnersCount}
📅 <b>${l.start}</b> ${giveaway.startAt ? new Date(giveaway.startAt).toLocaleString(dateLocale) : l.afterConfirm}
📅 <b>${l.end}</b> ${giveaway.endAt ? new Date(giveaway.endAt).toLocaleString(dateLocale) : l.notSpecified}

🔒 <b>${l.protection}</b>
  ${l.captcha} ${captchaModeLabel}
  Liveness: ${livenessLabel}

🎫 <b>${l.extraTickets}</b>
  👥 ${l.invites} ${inviteLabel}
  ⚡ ${l.boosts} ${boostLabel}
  📺 ${l.stories} ${storiesLabel}

📢 <b>${l.subscribeChannels}</b>
${formatChannels(channels?.requiredSubscriptions || [])}

📣 <b>${l.publishIn}</b>
${formatChannels(channels?.publish || [])}

🏁 <b>${l.resultsIn}</b>
${formatChannels(channels?.results || [])}`;

  await ctx.reply(infoMessage, { parse_mode: 'HTML' });

  // Send confirmation prompt with buttons
  const acceptBtn = locale === 'ru' ? '✅ Принять' : locale === 'en' ? '✅ Accept' : '✅ Қабылдау';
  const rejectBtn = locale === 'ru' ? '❌ Отклонить' : locale === 'en' ? '❌ Reject' : '❌ Қабылдамау';
  
  const confirmKeyboard = new InlineKeyboard()
    .text(acceptBtn, `giveaway_accept:${giveawayId}`)
    .text(rejectBtn, `giveaway_reject:${giveawayId}`);

  const confirmMsg = locale === 'ru' 
    ? '🔔 <b>Всё верно?</b> Нажмите "Принять" для публикации.\n\n⚠️ Убедитесь что бот имеет права на публикацию в выбранных каналах!'
    : locale === 'en'
    ? '🔔 <b>Is everything correct?</b> Click "Accept" to publish.\n\n⚠️ Make sure the bot has posting permissions in the selected channels!'
    : '🔔 <b>Бәрі дұрыс па?</b> Жариялау үшін "Қабылдау" түймесін басыңыз.\n\n⚠️ Боттың таңдалған арналарда жариялау құқықтары бар екеніне көз жеткізіңіз!';

  await ctx.reply(confirmMsg, {
    parse_mode: 'HTML',
    reply_markup: confirmKeyboard,
  });
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
      await ctx.answerCallbackQuery({ text: '❌ Error', show_alert: true });
      return;
    }
    
    const locale = getUserLocale(userId);

    // Answer callback immediately
    await ctx.answerCallbackQuery();

    // Edit message to show progress
    const publishingMsg = locale === 'ru' ? '⏳ Публикуем розыгрыш...' : 
                          locale === 'en' ? '⏳ Publishing giveaway...' : '⏳ Ұтыс ойынын жариялаудамыз...';
    try {
      await ctx.editMessageText(publishingMsg);
    } catch {
      // Message might not be editable
    }

    // Fetch giveaway info
    const result = await apiService.getGiveawayFull(giveawayId);

    if (!result.ok || !result.giveaway || !result.channels || !result.owner) {
      const loadError = locale === 'ru' ? 'Ошибка загрузки розыгрыша' : 
                        locale === 'en' ? 'Failed to load giveaway' : 'Ұтыс ойынын жүктеу қатесі';
      await ctx.editMessageText(`❌ ${result.error || loadError}`);
      return;
    }

    // Verify ownership
    if (result.owner.telegramUserId !== userId.toString()) {
      const wrongOwner = locale === 'ru' ? '❌ Этот розыгрыш принадлежит другому пользователю' :
                         locale === 'en' ? '❌ This giveaway belongs to another user' :
                         '❌ Бұл ұтыс ойыны басқа пайдаланушыға тиесілі';
      await ctx.editMessageText(wrongOwner);
      return;
    }

    // Verify status
    if (result.giveaway.status !== 'PENDING_CONFIRM') {
      const alreadyProcessed = locale === 'ru' ? '❌ Розыгрыш уже был обработан' :
                               locale === 'en' ? '❌ Giveaway has already been processed' :
                               '❌ Ұтыс ойыны өңделген';
      await ctx.editMessageText(alreadyProcessed);
      return;
    }

    const { giveaway, postTemplate, channels } = result;

    if (!postTemplate) {
      const noTemplate = locale === 'ru' ? '❌ Шаблон поста не найден' :
                         locale === 'en' ? '❌ Post template not found' :
                         '❌ Жазба үлгісі табылмады';
      await ctx.editMessageText(noTemplate);
      return;
    }

    if (channels.publish.length === 0) {
      const noChannels = locale === 'ru' ? '❌ Не выбраны каналы для публикации' :
                         locale === 'en' ? '❌ No channels selected for publishing' :
                         '❌ Жариялау үшін арналар таңдалмаған';
      await ctx.editMessageText(noChannels);
      return;
    }

    // Кнопка участия (используем URL для каналов, web_app там не работает)
    // Прямой Mini App link: https://t.me/BeastRandomBot/participate?startapp=join_<id>
    const defaultButtonText = locale === 'ru' ? '🎁 Участвовать' : locale === 'en' ? '🎁 Join' : '🎁 Қатысу';
    const buttonText = giveaway.buttonText || defaultButtonText;
    const joinUrl = buildMiniAppLink(`join_${giveawayId}`);
    
    const postKeyboard = new InlineKeyboard()
      .url(buttonText, joinUrl);

    // Publish to all channels
    const publishedMessages: Array<{ channelId: string; telegramMessageId: number }> = [];
    const errors: string[] = [];

    const noRightsMsg = locale === 'ru' ? 'нет прав на публикацию' : 
                        locale === 'en' ? 'no posting rights' : 'жариялау құқықтары жоқ';

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
        log.error({ error, channel: channel.title }, 'Failed to publish to channel');
        const errMsg = error instanceof Error ? error.message : String(error);
        errors.push(`${channel.title}: ${errMsg.includes('not enough rights') ? noRightsMsg : errMsg}`);
      }
    }

    // If all failed, don't update status
    if (publishedMessages.length === 0) {
      const failedPrefix = locale === 'ru' ? 'Не удалось опубликовать ни в один канал:' :
                           locale === 'en' ? 'Failed to publish to any channel:' :
                           'Ешбір арнаға жариялау мүмкін болмады:';
      const errorText = `❌ ${failedPrefix}\n\n${errors.join('\n')}`;
      await ctx.editMessageText(errorText);
      return;
    }

    // Accept giveaway
    const acceptResult = await apiService.acceptGiveaway(giveawayId, publishedMessages);

    if (!acceptResult.ok) {
      const saveError = locale === 'ru' ? 'Ошибка сохранения:' : locale === 'en' ? 'Save error:' : 'Сақтау қатесі:';
      await ctx.editMessageText(`❌ ${saveError} ${acceptResult.error}`);
      return;
    }

    // Success message
    const publishedLabel = locale === 'ru' ? 'Розыгрыш опубликован!' :
                           locale === 'en' ? 'Giveaway published!' :
                           'Ұтыс ойыны жарияланды!';
    const publishedIn = locale === 'ru' ? 'Опубликовано в' : locale === 'en' ? 'Published in' : 'Жарияланды';
    const ofLabel = locale === 'ru' ? 'из' : locale === 'en' ? 'of' : 'ішінен';
    const channelsLabel = locale === 'ru' ? 'каналов' : locale === 'en' ? 'channels' : 'арна';
    const statusLabel = locale === 'ru' ? 'Статус:' : locale === 'en' ? 'Status:' : 'Мәртебесі:';
    const activeLabel = locale === 'ru' ? 'Активен' : locale === 'en' ? 'Active' : 'Белсенді';
    const scheduledLabel = locale === 'ru' ? 'Запланирован' : locale === 'en' ? 'Scheduled' : 'Жоспарланған';
    const errorsLabel = locale === 'ru' ? 'Ошибки:' : locale === 'en' ? 'Errors:' : 'Қателер:';
    
    let successText = `✅ <b>${publishedLabel}</b>\n\n`;
    successText += `📣 ${publishedIn} ${publishedMessages.length} ${ofLabel} ${channels.publish.length} ${channelsLabel}\n`;
    successText += `📊 ${statusLabel} <b>${acceptResult.status === 'ACTIVE' ? activeLabel : scheduledLabel}</b>`;

    if (errors.length > 0) {
      successText += `\n\n⚠️ ${errorsLabel}\n${errors.join('\n')}`;
    }

    const openAppLabel = locale === 'ru' ? '📱 Открыть приложение' : locale === 'en' ? '📱 Open App' : '📱 Қолданбаны ашу';
    const openAppKeyboard = new InlineKeyboard()
      .webApp(openAppLabel, config.webappUrl);

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
      await ctx.answerCallbackQuery({ text: '❌ Error', show_alert: true });
      return;
    }
    
    const locale = getUserLocale(userId);

    // Verify ownership first
    const checkResult = await apiService.getGiveawayFull(giveawayId);
    if (!checkResult.ok || !checkResult.owner) {
      const notFound = locale === 'ru' ? 'Розыгрыш не найден' : locale === 'en' ? 'Giveaway not found' : 'Ұтыс ойыны табылмады';
      await ctx.answerCallbackQuery({ text: `❌ ${notFound}`, show_alert: true });
      return;
    }

    if (checkResult.owner.telegramUserId !== userId.toString()) {
      const noAccess = locale === 'ru' ? 'Нет доступа' : locale === 'en' ? 'No access' : 'Қатынас жоқ';
      await ctx.answerCallbackQuery({ text: `❌ ${noAccess}`, show_alert: true });
      return;
    }

    // Reject giveaway
    const result = await apiService.rejectGiveaway(giveawayId);

    if (!result.ok) {
      await ctx.answerCallbackQuery({ text: `❌ ${result.error}`, show_alert: true });
      return;
    }

    await ctx.answerCallbackQuery();

    const editInApp = locale === 'ru' ? '📱 Редактировать в приложении' : 
                      locale === 'en' ? '📱 Edit in app' : '📱 Қолданбада өңдеу';
    const openAppKeyboard = new InlineKeyboard()
      .webApp(editInApp, `${config.webappUrl}?startapp=edit_${giveawayId}`);

    const cancelledMsg = locale === 'ru' 
      ? '❌ <b>Публикация отменена</b>\n\nРозыгрыш возвращён в черновики. Вы можете отредактировать его в приложении.'
      : locale === 'en'
      ? '❌ <b>Publication cancelled</b>\n\nGiveaway returned to drafts. You can edit it in the app.'
      : '❌ <b>Жариялау болдырылмады</b>\n\nҰтыс ойыны жобаларға қайтарылды. Оны қолданбада өңдей аласыз.';

    await ctx.editMessageText(cancelledMsg, {
      parse_mode: 'HTML',
      reply_markup: openAppKeyboard,
    });
  });
}
