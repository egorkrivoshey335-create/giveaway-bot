import { Bot, InlineKeyboard, Context } from 'grammy';
import { config } from '../config.js';
import { apiService } from '../services/api.js';
import { createLogger } from '../lib/logger.js';

const log = createLogger('handlers:giveaways');
import { buildMiniAppLink } from '@randombeast/shared';
import { getUserLocale, t, type Locale } from '../i18n/index.js';

// Helper functions for type/captcha labels
function getTypeLabel(locale: Locale, type: string): string {
  const key = type === 'STANDARD' ? 'typeStandard' :
              type === 'BOOST_REQUIRED' ? 'typeBoostRequired' :
              type === 'INVITE_REQUIRED' ? 'typeInviteRequired' :
              type === 'CUSTOM' ? 'typeCustom' : 'typeStandard';
  return t(locale, `giveawayConfirm.${key}`);
}

function getCaptchaLabel(locale: Locale, mode: string): string {
  const key = mode === 'OFF' ? 'captchaOff' :
              mode === 'SUSPICIOUS_ONLY' ? 'captchaSuspicious' :
              mode === 'ALL' ? 'captchaAll' : 'captchaSuspicious';
  return t(locale, `giveawayConfirm.${key}`);
}

const LANGUAGE_LABELS: Record<string, string> = {
  RU: '🇷🇺 Русский',
  EN: '🇬🇧 English',
  KK: '🇰🇿 Қазақша',
};

/**
 * Handle /start confirm_<giveawayId>
 */
export async function handleConfirmStart(ctx: Context, giveawayId: string): Promise<void> {
  const userId = ctx.from?.id;
  if (!userId) {
    const locale = 'ru';
    await ctx.reply(t(locale, 'giveawayConfirm.userNotIdentified'));
    return;
  }
  
  const locale = getUserLocale(userId);

  // Fetch full giveaway info
  const result = await apiService.getGiveawayFull(giveawayId);

  if (!result.ok || !result.giveaway || !result.owner) {
    await ctx.reply(`❌ ${result.error || t(locale, 'giveawayConfirm.notFound')}`);
    return;
  }

  // Verify ownership
  if (result.owner.telegramUserId !== userId.toString()) {
    await ctx.reply(`❌ ${t(locale, 'giveawayConfirm.wrongOwner')}`);
    return;
  }

  // Verify status
  if (result.giveaway.status !== 'PENDING_CONFIRM') {
    const statusKey = result.giveaway.status === 'DRAFT' ? 'statusDraft' :
                      result.giveaway.status === 'ACTIVE' ? 'statusActive' :
                      result.giveaway.status === 'SCHEDULED' ? 'statusScheduled' :
                      result.giveaway.status === 'FINISHED' ? 'statusFinished' :
                      result.giveaway.status === 'CANCELLED' ? 'statusCancelled' : 'invalidStatus';
    await ctx.reply(`⚠️ ${t(locale, `giveawayConfirm.${statusKey}`)}`);
    return;
  }

  const { giveaway, postTemplate, channels, protection } = result;

  // Send post preview
  const previewLabel = t(locale, 'giveawayConfirm.previewLabel');
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
    await ctx.reply(t(locale, 'giveawayConfirm.noTemplate'));
  }

  // Format channels info
  const formatChannels = (list: Array<{ title: string; username: string | null }>) =>
    list.length > 0
      ? list.map(c => `  • ${c.title}${c.username ? ` (${c.username})` : ''}`).join('\n')
      : `  ${t(locale, 'giveawayConfirm.notSelected')}`;

  // Send giveaway info
  const captchaModeLabel = getCaptchaLabel(locale, protection?.captchaMode || 'SUSPICIOUS_ONLY');
  const livenessLabel = protection?.livenessEnabled ? '✅' : '❌';
  
  // Дополнительные билеты
  const maxLabel = t(locale, 'giveawayConfirm.max');
  const inviteLabel = protection?.inviteEnabled 
    ? `✅ (${maxLabel} ${protection.inviteMax || 10})` 
    : '❌';
  const boostLabel = protection?.boostEnabled ? '✅' : '❌';
  const storiesLabel = protection?.storiesEnabled ? '✅' : '❌';

  const dateLocale = locale === 'kk' ? 'kk-KZ' : locale === 'en' ? 'en-US' : 'ru-RU';

  const infoMessage = `📋 <b>${t(locale, 'giveawayConfirm.info')}</b>

📝 <b>${t(locale, 'giveawayConfirm.title')}</b> ${giveaway.title}
🎲 <b>${t(locale, 'giveawayConfirm.type')}</b> ${getTypeLabel(locale, giveaway.type)}
🗣 <b>${t(locale, 'giveawayConfirm.language')}</b> ${LANGUAGE_LABELS[giveaway.language] || giveaway.language}
🏆 <b>${t(locale, 'giveawayConfirm.winners')}</b> ${giveaway.winnersCount}
📅 <b>${t(locale, 'giveawayConfirm.start')}</b> ${giveaway.startAt ? new Date(giveaway.startAt).toLocaleString(dateLocale) : t(locale, 'giveawayConfirm.afterConfirm')}
📅 <b>${t(locale, 'giveawayConfirm.end')}</b> ${giveaway.endAt ? new Date(giveaway.endAt).toLocaleString(dateLocale) : t(locale, 'giveawayConfirm.notSpecified')}

🔒 <b>${t(locale, 'giveawayConfirm.protection')}</b>
  ${t(locale, 'giveawayConfirm.captcha')} ${captchaModeLabel}
  Liveness: ${livenessLabel}

🎫 <b>${t(locale, 'giveawayConfirm.extraTickets')}</b>
  👥 ${t(locale, 'giveawayConfirm.invites')} ${inviteLabel}
  ⚡ ${t(locale, 'giveawayConfirm.boosts')} ${boostLabel}
  📺 ${t(locale, 'giveawayConfirm.stories')} ${storiesLabel}

📢 <b>${t(locale, 'giveawayConfirm.subscribeChannels')}</b>
${formatChannels(channels?.requiredSubscriptions || [])}

📣 <b>${t(locale, 'giveawayConfirm.publishIn')}</b>
${formatChannels(channels?.publish || [])}

🏁 <b>${t(locale, 'giveawayConfirm.resultsIn')}</b>
${formatChannels(channels?.results || [])}`;

  await ctx.reply(infoMessage, { parse_mode: 'HTML' });

  // Send confirmation prompt with buttons
  const confirmKeyboard = new InlineKeyboard()
    .text(t(locale, 'giveawayConfirm.acceptBtn'), `giveaway_accept:${giveawayId}`)
    .text(t(locale, 'giveawayConfirm.rejectBtn'), `giveaway_reject:${giveawayId}`);

  await ctx.reply(t(locale, 'giveawayConfirm.confirmMsg'), {
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
    try {
      await ctx.editMessageText(t(locale, 'giveawayConfirm.publishing'));
    } catch {
      // Message might not be editable
    }

    // Fetch giveaway info
    const result = await apiService.getGiveawayFull(giveawayId);

    if (!result.ok || !result.giveaway || !result.channels || !result.owner) {
      await ctx.editMessageText(`❌ ${result.error || t(locale, 'giveawayConfirm.loadError')}`);
      return;
    }

    // Verify ownership
    if (result.owner.telegramUserId !== userId.toString()) {
      await ctx.editMessageText(`❌ ${t(locale, 'giveawayConfirm.wrongOwner')}`);
      return;
    }

    // Verify status
    if (result.giveaway.status !== 'PENDING_CONFIRM') {
      await ctx.editMessageText(t(locale, 'giveawayConfirm.alreadyProcessed'));
      return;
    }

    const { giveaway, postTemplate, channels } = result;

    if (!postTemplate) {
      await ctx.editMessageText(`❌ ${t(locale, 'giveawayConfirm.noTemplate')}`);
      return;
    }

    if (channels.publish.length === 0) {
      await ctx.editMessageText(t(locale, 'giveawayConfirm.noChannels'));
      return;
    }

    // Кнопка участия (используем URL для каналов, web_app там не работает)
    // Прямой Mini App link: https://t.me/BeastRandomBot/participate?startapp=join_<id>
    const buttonText = giveaway.buttonText || t(locale, 'giveawayConfirm.buttonTextDefault');
    const joinUrl = buildMiniAppLink(`join_${giveawayId}`);
    
    const postKeyboard = new InlineKeyboard()
      .url(buttonText, joinUrl);

    // Publish to all channels
    const publishedMessages: Array<{ channelId: string; telegramMessageId: number }> = [];
    const errors: string[] = [];

    const noRightsMsg = t(locale, 'giveawayConfirm.noPostingRights');

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
      const errorText = `❌ ${t(locale, 'giveawayConfirm.failedToPublish')}\n\n${errors.join('\n')}`;
      await ctx.editMessageText(errorText);
      return;
    }

    // Accept giveaway
    const acceptResult = await apiService.acceptGiveaway(giveawayId, publishedMessages);

    if (!acceptResult.ok) {
      await ctx.editMessageText(`❌ ${t(locale, 'giveawayConfirm.saveError')} ${acceptResult.error}`);
      return;
    }

    // Success message
    let successText = `✅ <b>${t(locale, 'giveawayConfirm.published')}</b>\n\n`;
    successText += `📣 ${t(locale, 'giveawayConfirm.publishedInCount')} ${publishedMessages.length} ${t(locale, 'giveawayConfirm.of')} ${channels.publish.length} ${t(locale, 'giveawayConfirm.channelsCount')}\n`;
    successText += `📊 ${t(locale, 'giveawayConfirm.status')} <b>${acceptResult.status === 'ACTIVE' ? t(locale, 'giveawayConfirm.statusActiveLabel') : t(locale, 'giveawayConfirm.statusScheduledLabel')}</b>`;

    if (errors.length > 0) {
      successText += `\n\n⚠️ ${t(locale, 'giveawayConfirm.errorsLabel')}\n${errors.join('\n')}`;
    }

    const openAppKeyboard = new InlineKeyboard()
      .webApp(t(locale, 'giveawayConfirm.openApp'), config.webappUrl);

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
      await ctx.answerCallbackQuery({ text: `❌ ${t(locale, 'giveawayConfirm.notFound')}`, show_alert: true });
      return;
    }

    if (checkResult.owner.telegramUserId !== userId.toString()) {
      await ctx.answerCallbackQuery({ text: `❌ ${t(locale, 'giveawayConfirm.noAccess')}`, show_alert: true });
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
      .webApp(t(locale, 'giveawayConfirm.editInApp'), `${config.webappUrl}?startapp=edit_${giveawayId}`);

    await ctx.editMessageText(t(locale, 'giveawayConfirm.publicationCancelled'), {
      parse_mode: 'HTML',
      reply_markup: openAppKeyboard,
    });
  });
}
