# RandomBeast — i18n Keys Reference

> Этот документ содержит список базовых ключей локализации.  
> Переводы добавляются в соответствующие JSON файлы.

---

## Namespace: `common`

Общие элементы интерфейса, используемые везде.

### Navigation
| Key | Description | Example (ru) |
|-----|-------------|--------------|
| `common.nav.home` | Home button | Главная |
| `common.nav.back` | Back button | Назад |
| `common.nav.menu` | Menu button | В меню |
| `common.nav.settings` | Settings | Настройки |
| `common.nav.help` | Help | Помощь |

### Actions
| Key | Description | Example (ru) |
|-----|-------------|--------------|
| `common.actions.save` | Save action | Сохранить |
| `common.actions.cancel` | Cancel action | Отмена |
| `common.actions.delete` | Delete action | Удалить |
| `common.actions.edit` | Edit action | Редактировать |
| `common.actions.create` | Create action | Создать |
| `common.actions.continue` | Continue action | Продолжить |
| `common.actions.confirm` | Confirm action | Подтвердить |
| `common.actions.close` | Close action | Закрыть |
| `common.actions.retry` | Retry action | Повторить |
| `common.actions.undo` | Undo action | Отменить |

### Status
| Key | Description | Example (ru) |
|-----|-------------|--------------|
| `common.status.loading` | Loading state | Загрузка... |
| `common.status.error` | Error state | Произошла ошибка |
| `common.status.success` | Success state | Готово! |
| `common.status.noData` | No data state | Нет данных |
| `common.status.saved` | Saved state | Сохранено |

### Time
| Key | Description | Params | Example (ru) |
|-----|-------------|--------|--------------|
| `common.time.today` | Today | - | Сегодня |
| `common.time.tomorrow` | Tomorrow | - | Завтра |
| `common.time.yesterday` | Yesterday | - | Вчера |
| `common.time.days` | Days count | `{count}` | {count} дн. |
| `common.time.hours` | Hours count | `{count}` | {count} ч. |
| `common.time.minutes` | Minutes count | `{count}` | {count} мин. |

### Validation
| Key | Description | Params | Example (ru) |
|-----|-------------|--------|--------------|
| `common.validation.required` | Required field | - | Обязательное поле |
| `common.validation.minLength` | Min length error | `{min}` | Минимум {min} символов |
| `common.validation.maxLength` | Max length error | `{max}` | Максимум {max} символов |
| `common.validation.invalidUrl` | Invalid URL | - | Некорректная ссылка |
| `common.validation.invalidDate` | Invalid date | - | Некорректная дата |

---

## Namespace: `bot`

Тексты для Telegram бота.

### Welcome
| Key | Description | Params |
|-----|-------------|--------|
| `bot.welcome.greeting` | Welcome message | `{name}` |
| `bot.welcome.start` | Start prompt | - |
| `bot.welcome.languageSelect` | Language selection | - |

### Menu
| Key | Description |
|-----|-------------|
| `bot.menu.createGiveaway` | Create giveaway button |
| `bot.menu.myGiveaways` | My giveaways button |
| `bot.menu.addChannel` | Add channel button |
| `bot.menu.myChannels` | My channels button |
| `bot.menu.catalog` | Catalog button |
| `bot.menu.help` | Help button |
| `bot.menu.settings` | Settings button |

### Giveaway
| Key | Description | Params |
|-----|-------------|--------|
| `bot.giveaway.created` | Created message | `{title}` |
| `bot.giveaway.published` | Published message | `{count}` |
| `bot.giveaway.finished` | Finished message | `{winners}` |
| `bot.giveaway.cancelled` | Cancelled message | - |

### Channel
| Key | Description | Params |
|-----|-------------|--------|
| `bot.channel.added` | Channel added | `{title}` |
| `bot.channel.notAdmin` | Bot not admin | - |
| `bot.channel.checkPermissions` | Check permissions | - |

### Errors
| Key | Description |
|-----|-------------|
| `bot.errors.generic` | Generic error |
| `bot.errors.notFound` | Not found error |
| `bot.errors.accessDenied` | Access denied |

---

## Namespace: `creator`

Интерфейс создателя розыгрышей.

### Wizard Steps
| Key | Description |
|-----|-------------|
| `creator.wizard.step1.title` | Step 1 title |
| `creator.wizard.step1.titleLabel` | Title field label |
| `creator.wizard.step1.titlePlaceholder` | Title placeholder |
| `creator.wizard.step1.descriptionLabel` | Description label |
| `creator.wizard.step1.winnersLabel` | Winners count label |
| `creator.wizard.step2.title` | Step 2 title |
| `creator.wizard.step2.subscriptions` | Subscriptions section |
| `creator.wizard.step2.addChannel` | Add channel button |
| `creator.wizard.step2.boost` | Boost section |
| `creator.wizard.step2.boostHint` | Boost hint text |
| `creator.wizard.step2.invites` | Invites section |
| `creator.wizard.step2.invitesHint` | Invites hint text |
| `creator.wizard.step3.title` | Step 3 title |
| `creator.wizard.step3.endDate` | End date label |
| `creator.wizard.step3.endTime` | End time label |
| `creator.wizard.step3.channels` | Publish channels |
| `creator.wizard.step3.resultsChannels` | Results channels |
| `creator.wizard.step4.title` | Step 4 title |
| `creator.wizard.step4.preview` | Preview text |
| `creator.wizard.step4.confirm` | Confirm button |

### My Giveaways
| Key | Description |
|-----|-------------|
| `creator.myGiveaways.title` | Page title |
| `creator.myGiveaways.empty` | Empty state |
| `creator.myGiveaways.createFirst` | Create first CTA |
| `creator.myGiveaways.filters.all` | All filter |
| `creator.myGiveaways.filters.active` | Active filter |
| `creator.myGiveaways.filters.finished` | Finished filter |
| `creator.myGiveaways.filters.draft` | Draft filter |

### Stats
| Key | Description |
|-----|-------------|
| `creator.stats.participants` | Participants label |
| `creator.stats.tickets` | Tickets label |
| `creator.stats.invites` | Invites label |
| `creator.stats.views` | Views label |

---

## Namespace: `participant`

Интерфейс участника розыгрышей.

### Join
| Key | Description |
|-----|-------------|
| `participant.join.title` | Join page title |
| `participant.join.button` | Join button |
| `participant.join.alreadyJoined` | Already joined state |
| `participant.join.checkConditions` | Checking conditions |
| `participant.join.success` | Success message |

### Conditions
| Key | Description | Params |
|-----|-------------|--------|
| `participant.conditions.title` | Section title | - |
| `participant.conditions.subscribe` | Subscribe condition | `{channel}` |
| `participant.conditions.boost` | Boost condition | `{channel}` |
| `participant.conditions.invite` | Invite condition | - |
| `participant.conditions.task` | Task condition | - |
| `participant.conditions.completed` | Completed status | - |
| `participant.conditions.pending` | Pending status | - |

### Tickets
| Key | Description | Params |
|-----|-------------|--------|
| `participant.tickets.title` | Section title | - |
| `participant.tickets.base` | Base ticket | - |
| `participant.tickets.bonus` | Bonus tickets | - |
| `participant.tickets.total` | Total tickets | `{count}` |
| `participant.tickets.inviteBonus` | Invite bonus | `{count}` |

### Results
| Key | Description |
|-----|-------------|
| `participant.results.title` | Results title |
| `participant.results.winner` | Winner message |
| `participant.results.notWinner` | Not winner message |
| `participant.results.winners` | Winners list title |
| `participant.results.tryAgain` | Try again message |

### Share
| Key | Description | Params |
|-----|-------------|--------|
| `participant.share.invite` | Invite button | - |
| `participant.share.copyLink` | Copy link button | - |
| `participant.share.linkCopied` | Link copied | - |
| `participant.share.shareText` | Share text | `{title}` |

---

## Namespace: `payments`

Платежи и подписки.

### Catalog
| Key | Description | Params |
|-----|-------------|--------|
| `payments.catalog.title` | Catalog title | - |
| `payments.catalog.description` | Description | - |
| `payments.catalog.price` | Price display | `{price}` |
| `payments.catalog.subscribe` | Subscribe button | - |

### Checkout
| Key | Description | Params |
|-----|-------------|--------|
| `payments.checkout.title` | Checkout title | - |
| `payments.checkout.summary` | Summary text | - |
| `payments.checkout.pay` | Pay button | `{amount}` |
| `payments.checkout.processing` | Processing state | - |
| `payments.checkout.success` | Success message | - |
| `payments.checkout.failed` | Failed message | - |

### Subscription
| Key | Description | Params |
|-----|-------------|--------|
| `payments.subscription.active` | Active until | `{date}` |
| `payments.subscription.expired` | Expired status | - |
| `payments.subscription.renew` | Renew button | - |
| `payments.subscription.cancel` | Cancel button | - |

### Errors
| Key | Description |
|-----|-------------|
| `payments.errors.paymentFailed` | Payment failed |
| `payments.errors.insufficientFunds` | Insufficient funds |
| `payments.errors.cardDeclined` | Card declined |

---

## Namespace: `faq`

Вопросы и ответы.

| Key | Description |
|-----|-------------|
| `faq.title` | FAQ page title |
| `faq.items` | Array of Q&A items |

### FAQ Item Structure
```typescript
interface FaqItem {
  question: string;
  answer: string;
}
```

---

## Key Naming Convention

1. **Namespace** — логическая группа (common, bot, creator, etc.)
2. **Section** — подгруппа внутри namespace (nav, actions, wizard, etc.)
3. **Key** — конкретный элемент

Format: `{namespace}.{section}.{key}`

Examples:
- `common.nav.back`
- `creator.wizard.step1.title`
- `participant.join.button`

---

## Interpolation Syntax

Используем синтаксис `{paramName}` для подстановки:

```json
{
  "greeting": "Привет, {name}!",
  "total": "Всего: {count} билетов"
}
```

---

## Pluralization (Russian)

Для русского языка используем ICU MessageFormat:

```json
{
  "participants": "{count, plural, one {# участник} few {# участника} many {# участников} other {# участников}}"
}
```

---

## Adding New Keys

1. Добавить ключ в этот документ с описанием
2. Добавить перевод в `ru.json`
3. Добавить перевод в `en.json`
4. Добавить перевод в `kk.json` (если доступен переводчик)
5. Проверить в контексте UI
