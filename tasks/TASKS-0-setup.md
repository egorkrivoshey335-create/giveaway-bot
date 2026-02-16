# 🏗️ БЛОК 0: ПОДГОТОВКА И АРХИТЕКТУРА

## Обозначения статусов
- [ ] — не сделано
- [x] — сделано полностью
- [~] — сделано частично (см. комментарий)
- [?] — нужно проверить (начальный статус)

---

### [x] Задача 0.1 — Конституция проекта (docs)
**Статус:** Полностью реализовано
**Файлы:**
- `docs/ARCHITECTURE.md` — компоненты, домены, стек, API, media strategy, draft management, deployment, security checklist
- `docs/DB_MODEL.md` — все основные сущности с полями, типами, связями, ER-диаграмма, enums
- `docs/SECURITY.md` — TMA initData валидация, rate limiting, CORS, CSP, YooKassa webhook, fraud detection, captcha strategy
- `docs/I18N.md` — 3 языка (ru/en/kk), namespaces, бот + web реализация, guidelines, workflow
- `docs/ROADMAP.md` — MVP план, фазы, success metrics, risk register

**⚠️ Мелкие расхождения с кодом (не блокирующие):**
- ARCHITECTURE.md ссылается на `apps/marketing/` — в реальности `apps/site/`
- ARCHITECTURE.md ссылается на `packages/db/` — в реальности `packages/database/`
- ARCHITECTURE.md упоминает `packages/queue/` и `packages/ui/` — этих папок нет
- Рекомендуется обновить doc в будущем

---

### [x] Задача 0.2 — Shared типы и константы
**Статус:** Полностью реализовано ✅ (дополнено в текущей итерации)

**Файлы:**
- `packages/shared/src/types.ts`:
  - Все enum: GiveawayStatus, GiveawayType, LanguageCode, MediaType, ParticipationStatus, ChannelType, CaptchaMode, PublishResultsMode, ProductType, PurchaseStatus, ErrorCode ✅
  - **ДОБАВЛЕНО:** SubscriptionTier enum (FREE, PLUS, PRO, BUSINESS) ✅
  - **ДОБАВЛЕНО:** PaymentProvider enum (YOOKASSA) ✅
  - **ДОБАВЛЕНО:** PrizeDeliveryMethod, CreatorNotificationMode, LivenessStatus, ReportStatus, BadgeCode, GiveawayErrorType, AuditAction types ✅
  - **ДОБАВЛЕНО:** isSubscriptionTier type guard ✅
  - Все интерфейсы: IGiveaway, IParticipation, IUser, IChannel, IProduct, IPurchase, IEntitlement и др. ✅
  - Wizard steps, draft payload типы ✅
  - TELEGRAM_API_LIMITATIONS ✅
  - Type guards ✅

- `packages/shared/src/constants.ts`:
  - Все лимиты: GIVEAWAY_LIMITS, EXTRAS_LIMITS, POST_LIMITS, CHANNEL_LIMITS, PARTICIPATION_LIMITS, FRAUD_THRESHOLDS, API_RATE_LIMITS, TELEGRAM_LIMITS ✅
  - PAYMENT_CONFIG, PRODUCT_CODES, ENTITLEMENT_CODES, DOMAINS, BOT_CONFIG ✅
  - CACHE_KEYS, PATTERNS, DEFAULTS ✅
  - URL утилиты: buildUrl, buildBotDeepLink, buildMiniAppLink ✅
  - **ДОБАВЛЕНО:** TIER_LIMITS (maxActiveGiveaways, maxChannels, maxPostTemplates, maxCustomTasks, postCharLimit, maxWinners, maxInvites, maxTrackingLinks, maxChannelsPerGiveaway — все по тарифам FREE/PLUS/PRO/BUSINESS) ✅

- `packages/shared/src/i18n/keys.md` — полный список i18n ключей ✅

- **СОЗДАНО:** `packages/shared/src/moderation.ts`:
  - Стоп-слова: ru (мат, спам, scam), en (profanity, spam), kk (базовый набор) ✅
  - `checkContent(text)` → `{ clean: boolean, flaggedWords: string[] }` ✅
  - Экспорт `STOP_WORDS` для расширения ✅

---

### [x] Задача 0.3 — Инициализация монорепо
**Статус:** Полностью реализовано ✅ (дополнено в текущей итерации)

**Файлы:**
- Turborepo + pnpm workspace ✅ (`turbo.json`, `pnpm-workspace.yaml`)
- Структура папок: `apps/bot/`, `apps/api/`, `apps/web/`, `apps/site/` + `packages/database/`, `packages/shared/`, `packages/config/` ✅
- ESLint, Prettier, TypeScript configs ✅
- Корневой `package.json` со всеми скриптами ✅

- `.env.example` — **ДОПОЛНЕНО** недостающими переменными:
  - BOT_USERNAME, BOT_MODE, BOT_WEBHOOK_SECRET ✅
  - API_PORT, WEB_PORT, SITE_PORT ✅
  - NEXT_PUBLIC_WEBAPP_URL ✅
  - YOOKASSA_WEBHOOK_SECRET ✅
  - SENTRY_DSN, SENTRY_ENVIRONMENT (закомментированы) ✅
  - ADMIN_CHAT_ID, ADMIN_USER_IDS (закомментированы) ✅
  - PROMO_CHANNEL_USERNAME, PROMO_CHANNEL_URL (закомментированы) ✅
  - MAX_FILE_SIZE_MB, CAPTCHA_TTL_SECONDS, CAPTCHA_MAX_ATTEMPTS, LIVENESS_PHOTO_RETENTION_DAYS ✅

**⚠️ Примечание по сессиям:**
- TMA initData валидация используется для Mini App (без JWT/Redis сессий) — валидный подход для MVP
- Redis-сессии могут понадобиться для сайта randombeast.ru (TODO: блок 10 — API)

---

### [x] Задача 0.4 — Docker + локальная инфраструктура
**Статус:** Полностью реализовано
**Файлы:**
- `docker-compose.yml`: PostgreSQL 16 + Redis 7 с volumes и healthcheck ✅
- Все скрипты: docker:up/down/logs, db:push/studio/seed/migrate/generate ✅

---

### [x] Задача 0.5 — Prisma схема (БД)
**Статус:** Полностью реализовано ✅ (дополнено в текущей итерации)
**Файл:** `packages/database/prisma/schema.prisma`

**Существующие модели (17) — дополнены новыми полями:**
- **User**: +notificationsEnabled, +notificationsBlocked, +creatorNotificationMode ✅
- **Channel**: +avatarFileId ✅
- **PostTemplate**: +entities (Json) ✅
- **Giveaway**: +mascotId, +promotionEnabled, +shortCode, +catalogApproved/At/RejectedReason, +prizeDescription/DeliveryMethod/Instruction, +minParticipants, +cancelIfNotEnough, +autoExtendDays, +isSandbox ✅
- **GiveawayCondition**: +inviteMin, +subscriptionRequired, +inviteRequired, +boostBonusEnabled, +inviteBonusEnabled, +storiesBonusEnabled ✅
- **GiveawayPublishChannel**: +originalText, +originalEntities ✅
- **Participation**: +captchaPassed, +subscriptionVerified, +boostVerified, +inviteCount, +storiesPosted, +customTasksCompleted, +displayName, +livenessChecked/PhotoPath/Status ✅
- **Winner**: +isReserve, +isConfirmed, +rerolled, +rerolledAt, +previousWinnerUserId ✅
- **Product**: +starsPrice ✅
- **Entitlement**: +autoRenew, +cancelledAt ✅

**Новые модели (13) — СОЗДАНЫ:**
1. TrackingLink (трекинг ссылки для статистики) ✅
2. Mascot (маскоты розыгрышей) ✅
3. GiveawayTheme (кастомизация темы Mini App) ✅
4. ReferralLink (реферальные ссылки) ✅
5. CreatorBanList (бан-лист создателя) ✅
6. UserBadge (бейджи пользователей) ✅
7. GiveawayErrorLog (лог ошибок розыгрышей) ✅
8. GiveawayReminder (напоминания) ✅
9. AuditLog (аудит-лог действий) ✅
10. SystemBan (системный бан) ✅
11. GiveawayView (просмотры для статистики) ✅
12. PrizeForm (форма получения приза) ✅
13. Report (жалобы на розыгрыши) ✅

**Seed скрипт** (`packages/database/prisma/seed.ts`):
- Продукт CATALOG_MONTHLY_1000 ✅
- Продукт RANDOMIZER_MONTHLY_500 ✅
- **ДОБАВЛЕНО:** Тестовый пользователь (только dev) ✅
- **ДОБАВЛЕНО:** Тестовый канал (только dev) ✅

**⚠️ Альтернативные решения (не конфликт):**
- GiveawayBoostChannel → `GiveawayCondition.boostChannelIds (String[])` — рабочий подход
- GiveawayDraft → `Giveaway.draftPayload/wizardStep/draftVersion` — рабочий подход

---

### [x] Задача 0.6 — Shared validation rules
**Статус:** Полностью реализовано ✅ (создано в текущей итерации)

**СОЗДАНО:** `packages/shared/src/validation.ts`:
- Zod установлен как dependency в `@randombeast/shared` ✅
- **Примитивные схемы:** uuidSchema, channelUsernameSchema, usernameWithoutAtSchema, urlSchema, languageCodeSchema ✅
- **Giveaway схемы:** giveawayTitleSchema, giveawayDescriptionSchema, winnersCountSchema, reserveWinnersCountSchema, buttonTextSchema, inviteMaxSchema, giveawayTypeSchema, giveawayStatusSchema, publishResultsModeSchema, captchaModeSchema ✅
- **Custom task:** customTaskSchema, customTasksArraySchema ✅
- **Post template:** postTextSchema, postCaptionSchema ✅
- **Дата:** futureDateSchema, optionalFutureDateSchema ✅
- **Channel:** channelIdsSchema, optionalChannelIdsSchema ✅
- **Payment:** createPaymentSchema ✅
- **Composite:** createGiveawaySchema, updateGiveawaySchema (partial) ✅
- **Pagination:** paginationSchema ✅
- **TypeScript типы:** CreateGiveawayInput, UpdateGiveawayInput, PaginationInput ✅

**Экспорт:** `packages/shared/src/index.ts` обновлён — экспортирует moderation.js и validation.js ✅

---

## 📊 Итоговая сводка (Блок 0)

| Статус | Кол-во | Задачи |
|--------|--------|--------|
| ✅ [x] | 6 | 0.1, 0.2, 0.3, 0.4, 0.5, 0.6 |
| 🟡 [~] | 0 | — |
| ❌ [ ] | 0 | — |

**Блок 0 завершён на 100%.**
