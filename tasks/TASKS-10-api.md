# 📊 БЛОК 10: BACKEND API (apps/api)

## Обозначения статусов
- [ ] — не сделано
- [x] — сделано полностью
- [~] — сделано частично (см. комментарий)
- [?] — нужно проверить (начальный статус)

---

### [~] Задача 10.1 — Каркас Fastify API
**Статус:** Частично реализовано

**✅ Что сделано:**
- Инициализация Fastify (`apps/api/src/server.ts`) ✅
- `@fastify/cors` с credentials, origins (dev + prod), methods, headers ✅
- `@fastify/cookie` (HttpOnly, Secure, SameSite=lax) ✅
- Auth middleware (`plugins/auth.ts` — `getUser()`, `requireUser()`) ✅
- Session tokens: HMAC-SHA256 подпись, 30 дней (`utils/session.ts`) ✅
- Request logging (Pino, pino-pretty в dev, warn в prod) ✅
- Zod валидация используется во всех роутах ✅
- Healthcheck `GET /health` ✅
- Graceful shutdown (SIGINT/SIGTERM) ✅
- Whitelist пользователей (`ALLOWED_USERS`) ✅
- Конфигурация из `.env` через Zod schema (`config.ts`) ✅
- 13 модулей маршрутов зарегистрировано ✅

**❌ Что НЕ сделано:**
1. `@fastify/rate-limit` — НЕ установлен, НЕ зарегистрирован
2. `@fastify/helmet` — НЕ установлен (security headers отсутствуют)
3. `@fastify/multipart` — НЕ установлен (нужен для загрузки файлов)
4. `@fastify/swagger` / OpenAPI — НЕ установлен
5. **Версионирование**: маршруты НЕ под `/api/v1/` — работают от корня (`/health`, `/auth/telegram`, и т.д.)
6. **Telegram Web App origins**: в CORS отсутствуют `web.telegram.org`, `webk.telegram.org`, `webz.telegram.org`
7. **Bot webhook route**: `POST /bot/webhook` НЕ реализован (бот работает через polling)
8. **Глобальный error handler**: ошибки обрабатываются try-catch в каждом роуте, нет единого `setErrorHandler`

**⚠️ Другой подход (не конфликт):**
- Auth: задача описывает «initData или JWT», реально — initData → сессионный токен (HMAC-SHA256 подпись) → HttpOnly cookie `rb_session`. Это валидный и безопасный подход. JWT не используется.
- Header `X-Telegram-Init-Data` в CORS `allowedHeaders` заменён на `X-Internal-Token` — initData передаётся в POST body, не в header.

**Файлы:**
- `apps/api/src/server.ts` — инициализация, регистрация плагинов и роутов
- `apps/api/src/config.ts` — Zod-валидация env, CORS origins, настройки
- `apps/api/src/plugins/auth.ts` — `getUser()`, `requireUser()`
- `apps/api/src/utils/session.ts` — `createSessionToken()`, `verifySessionToken()`, cookie options
- `apps/api/package.json` — зависимости

---

### [~] Задача 10.2 — API маршруты: Пользователи
**Статус:** Частично реализовано

**✅ Что сделано:**
- `GET /auth/me` — текущий юзер (id, telegramUserId, language, isPremium, createdAt) ✅
- `POST /auth/telegram` — аутентификация через initData ✅
- `POST /auth/logout` — выход ✅
- `POST /auth/dev` — dev-аутентификация (только dev) ✅

**❌ Что НЕ сделано:**
1. `PATCH /api/users/me` — обновление настроек (язык) — НЕТ публичного endpoint (есть `POST /internal/users/language` для бота)
2. `GET /api/users/me/entitlements` — список активных прав доступа — НЕТ

**⚠️ Другой подход:**
- Путь `/auth/me` вместо `/api/users/me` — по сути одно и то же, но без возможности обновления
- Username/firstName возвращаются НЕ из /auth/me (только id, telegramUserId, language, isPremium, createdAt)

**Файлы:**
- `apps/api/src/routes/auth.ts`

---

### [~] Задача 10.3 — API маршруты: Каналы
**Статус:** Частично реализовано

**✅ Что сделано:**
- `GET /channels` — список каналов юзера ✅
- `GET /channels/:id` — один канал ✅
- `DELETE /channels/:id` — удалить канал ✅
- `POST /channels/:id/recheck` — проверка прав бота и создателя через Telegram API ✅

**❌ Что НЕ сделано:**
1. `POST /channels` — добавить канал из Mini App (принимает username или chatId) — НЕТ
2. **Avatar**: при добавлении канала НЕТ вызова `getChat` для получения аватарки
3. **Avatar URL caching**: НЕТ Redis-кеша для avatar URL
4. **Avatar URL в ответе**: GET /channels НЕ возвращает avatarFileId/avatarUrl

**⚠️ Другой подход:**
- Каналы добавляются ТОЛЬКО через бота (`POST /internal/channels/upsert`) — из Mini App нет возможности добавить канал напрямую. Это архитектурный выбор: бот парсит форвард/ссылку, проверяет и добавляет.

**Файлы:**
- `apps/api/src/routes/channels.ts`
- `apps/api/src/routes/internal.ts` (POST /internal/channels/upsert)

---

### [~] Задача 10.4 — API маршруты: Посты (шаблоны)
**Статус:** Частично реализовано

**✅ Что сделано:**
- `GET /post-templates` — список (без soft-deleted) ✅
- `GET /post-templates/:id` — конкретный пост ✅
- `DELETE /post-templates/:id` — soft delete (установка deletedAt) ✅
- `POST /post-templates/:id/undo-delete` — восстановление в окне 20с ✅
- Использует `POST_TEMPLATE_UNDO_WINDOW_MS` из `@randombeast/shared` ✅

**❌ Что НЕ сделано:**
1. `POST /api/posts` — создание поста из Mini App — НЕТ (создаётся только через бота: `POST /internal/post-templates/create`)
2. `GET /api/posts/:id/media` — proxy endpoint для медиа — НЕТ

**Файлы:**
- `apps/api/src/routes/post-templates.ts`
- `apps/api/src/routes/internal.ts` (POST /internal/post-templates/create, delete, undo-delete)

---

### [~] Задача 10.5 — API маршруты: Розыгрыши (CRUD)
**Статус:** Частично реализовано

**✅ Что сделано:**
- `GET /giveaways` — список розыгрышей юзера (фильтры по статусу, пагинация offset/limit, counts по статусам) ✅
- `POST /giveaways/from-draft/:draftId/confirm` — подтверждение черновика → PENDING_CONFIRM (с Zod валидацией, нормализацией payload, создание GiveawayCondition) ✅
- `GET /giveaways/:id` — детали ✅
- `GET /giveaways/:id/full` — полная информация (condition, channels, winners, postTemplate) ✅
- `POST /giveaways/:id/finish` — ручное завершение (в lifecycle.ts) ✅
- `DELETE /giveaways/:id` — удаление (только DRAFT, PENDING_CONFIRM, CANCELLED) ✅
- `POST /giveaways/:id/duplicate` — дублирование (копия как DRAFT с "(копия)") ✅

**❌ Что НЕ сделано:**
1. `PATCH /giveaways/:id` — редактирование розыгрыша (с валидацией по статусу) — НЕТ
2. `POST /giveaways/:id/reject` — отклонение (только через internal API: `/internal/giveaways/:id/reject`)
3. `POST /giveaways/:id/start` — ручной запуск SCHEDULED → ACTIVE — НЕТ (scheduler делает это автоматически)
4. `POST /giveaways/:id/cancel` — отмена розыгрыша — НЕТ
5. **Проверка прав при confirm**: НЕТ проверки botIsAdmin/creatorIsAdmin/can_post_messages для publishChannels и resultChannels перед подтверждением

**⚠️ Другой подход:**
- `POST /api/giveaways` (прямое создание) → реализовано через draft flow: POST /drafts/giveaway + PATCH /drafts/giveaway/:id + POST /giveaways/from-draft/:draftId/confirm. Это более структурированный подход с пошаговым мастером.
- Reject/accept → через internal API (бот → API), потому что подтверждение публикации делается в боте.

**Файлы:**
- `apps/api/src/routes/giveaways.ts` (confirm, list, get, full, stats, participants, duplicate, delete, catalog toggle)
- `apps/api/src/routes/lifecycle.ts` (status, winners, finish, my-result)
- `apps/api/src/routes/internal.ts` (accept, reject)

---

### [~] Задача 10.6 — API маршруты: Участие
**Статус:** Частично реализовано

**✅ Что сделано:**
- `POST /giveaways/:id/join` — участие (проверка ACTIVE, duplicate check, server-side проверка подписок, капча, реферал + бонусный билет) ✅
- `POST /giveaways/:id/check-subscription` — проверка подписок ✅
- `GET /giveaways/:id/public` — публичная информация (включает participation если авторизован) ✅
- `GET /participations/my` — все мои участия (фильтры: all/active/finished/won/cancelled, пагинация, counts, isWinner) ✅
- Captcha: `GET /captcha/generate`, `POST /captcha/verify` — математическая, in-memory ✅

**❌ Что НЕ сделано:**
1. `GET /giveaways/:id/my-participation` — отдельный endpoint для статуса — НЕТ (данные доступны в /giveaways/:id/public, но нет отдельного endpoint)
2. **FraudScore вычисление**: при `join` всегда записывается `fraudScore: 0` — нет реальной формулы
3. Проверка endAt (не истёк) при join — НЕТ явной проверки

**Файлы:**
- `apps/api/src/routes/participation.ts`

---

### [x] Задача 10.7 — API маршруты: Инвайты и доп. билеты
**Статус:** Полностью реализовано

**✅ Все endpoints реализованы:**
- `GET /giveaways/:id/my-referral` — реферальная ссылка + статистика (link, code, invitedCount, inviteMax, inviteEnabled, ticketsFromInvites) ✅
- `GET /giveaways/:id/my-invites` — список приглашённых (userId, name, username, joinedAt) ✅
- `POST /giveaways/:id/verify-boost` — проверка бустов через Telegram API (с снапшотом, лимитом MAX_BOOSTS_PER_CHANNEL=10, обновление ticketsExtra) ✅
- `GET /giveaways/:id/my-boosts` — статус бустов (каналы, boostCount, ticketsFromBoosts) ✅
- `POST /giveaways/:id/submit-story` — заявка на сторис (PENDING → модерация) ✅
- `GET /giveaways/:id/my-story-request` — статус заявки ✅
- `GET /giveaways/:id/story-requests` — список заявок (только owner) ✅
- `POST /giveaways/:id/story-requests/:requestId/approve` — одобрение + билет ✅
- `POST /giveaways/:id/story-requests/:requestId/reject` — отклонение с причиной ✅

**⚠️ Мелкое отличие:** задача описывает POST /api/giveaways/:id/generate-invite, реально GET /giveaways/:id/my-referral (GET вместо POST). Функционально эквивалентно.

**Файлы:**
- `apps/api/src/routes/participation.ts` (реферралы, бусты, сторис — всё в одном файле)

---

### [x] Задача 10.8 — API маршруты: Черновики
**Статус:** Полностью реализовано

**✅ Все endpoints реализованы:**
- `GET /drafts/giveaway` — получить черновик (последний DRAFT текущего юзера) ✅
- `POST /drafts/giveaway` — создать черновик (или вернуть существующий) ✅
- `PATCH /drafts/giveaway/:id` — обновить (wizardStep + draftPayload merge) ✅
- `POST /drafts/giveaway/:id/discard` — отменить черновик (CANCELLED + очистка) ✅
- Zod валидация draftPayload с нормализацией (language lowercase) ✅
- DraftVersion инкремент при обновлении ✅
- Использование WIZARD_STEPS из @randombeast/shared ✅

**Файлы:**
- `apps/api/src/routes/drafts.ts`

---

### [~] Задача 10.9 — API маршруты: Платежи
**Статус:** Частично реализовано

**✅ Что сделано:**
- `POST /payments/create` — создание платежа через ЮKassa (проверка конфигурации, поиск продукта, проверка дубликата entitlement, создание Purchase, вызов YooKassa API) ✅
- `POST /webhooks/yookassa` — webhook (обработка payment.succeeded, идемпотентность, транзакция: Purchase→COMPLETED + создание Entitlement) ✅
- `GET /payments/status/:purchaseId` — проверка статуса (опционально polling YooKassa если PENDING) ✅
- `lib/yookassa.ts` — обёртка YooKassa API (createPayment, getPayment) ✅

**❌ Что НЕ сделано:**
1. `GET /api/products` — список доступных продуктов — НЕТ
2. `POST /api/subscriptions/cancel` — отмена подписки — НЕТ
3. **Webhook signature verification**: НЕТ проверки подписи ЮKassa (тело принимается as-is)

**Файлы:**
- `apps/api/src/routes/payments.ts`
- `apps/api/src/lib/yookassa.ts`

---

### [~] Задача 10.10 — API маршруты: Статистика
**Статус:** Частично реализовано

**✅ Что сделано:**
- `GET /giveaways/:id/stats` — статистика розыгрыша (participantsCount, participantsToday, participantsGrowth за 7 дней, tickets total/invites/boosts/stories, invitesCount, boostsCount, storiesApproved/Pending, channelStats) ✅
- `GET /giveaways/:id/participants` — список участников (пагинация, поиск по имени/username, invitedCount per user, storyRequestStatus) ✅

**❌ Что НЕ сделано:**
1. `GET /giveaways/:id/participants/export` — CSV экспорт — НЕТ
2. **Tier-based access control**: все создатели видят одинаковую статистику — НЕТ проверки подписки (FREE vs PRO)
3. **Views tracking**: НЕТ данных о просмотрах (conversionRate невозможно считать)
4. **Redis caching**: НЕТ кеширования статистики

**Файлы:**
- `apps/api/src/routes/giveaways.ts` (stats, participants)

---

### [~] Задача 10.11 — API маршруты: Каталог
**Статус:** Частично реализовано

**✅ Что сделано:**
- `GET /catalog` — список розыгрышей (проверка entitlement catalog.access, preview mode с PREVIEW_COUNT=3 без доступа, пагинация offset/limit, сортировка по популярности) ✅
- `GET /catalog/access` — проверка доступа (hasAccess, expiresAt, price) ✅
- `POST /giveaways/:id/catalog` — toggle isPublicInCatalog (для создателя) ✅

**❌ Что НЕ сделано:**
1. `GET /catalog/count` — ПУБЛИЧНЫЙ endpoint с Redis-кешем — НЕТ
2. **Фильтры**: ?type, ?sortBy, ?order, ?minParticipants — НЕТ (только базовая сортировка по totalParticipants)
3. **Cursor-based pagination**: используется offset, задача описывает cursor
4. **catalogApproved check**: фильтруется по `isPublicInCatalog` но НЕТ проверки `catalogApproved` (модерация)
5. **promotionEnabled check**: НЕТ

**Файлы:**
- `apps/api/src/routes/catalog.ts`

---

### [ ] Задача 10.12 — API маршруты: Трекинг-ссылки
**Статус:** НЕ реализовано

**Что требуется по задаче:**
- `POST /api/giveaways/:id/tracking-links` — создать ссылку
- `GET /api/giveaways/:id/tracking-links` — список ссылок
- `DELETE /api/giveaways/:id/tracking-links/:linkId` — удалить
- Лимиты по подписке: FREE=3, PLUS=10, PRO=50, BUSINESS=unlimited

**Примечание:** Prisma модель `TrackingLink` уже создана в блоке 0. TIER_LIMITS.maxTrackingLinks определены в constants.ts.

---

### [~] Задача 10.13 — Стандарт API ответов
**Статус:** Частично реализовано (другой формат)

**⚠️ ДРУГОЙ ПОДХОД (не конфликт, но несоответствие задаче):**

Задача описывает формат:
```json
{ "success": true, "data": { ... } }
{ "success": false, "error": { "code": "GIVEAWAY_NOT_FOUND", "message": "..." } }
```

Реальный формат:
```json
{ "ok": true, ...data_fields_directly... }
{ "ok": false, "error": "string message" }
```

**✅ Что работает правильно:**
- HTTP коды: 200, 201, 400, 401, 403, 404, 500 ✅
- Zod ошибки возвращают `details` ✅
- Консистентный формат во всех роутах ✅

**❌ Несоответствия задаче:**
1. `ok` вместо `success`
2. Data fields не обёрнуты в `data: { }` — лежат на верхнем уровне
3. Error — простая строка, не объект с `code`/`message`/`details`
4. Pagination: `{ total, hasMore }` вместо `{ cursor, hasMore, total }`
5. ErrorCode enum из shared types.ts НЕ используется в ответах

**Рекомендация:** Формат `{ ok: true, ... }` рабочий и консистентный. Решить — переделывать на `{ success: true, data: {} }` или оставить. Это затронет ВСЕ endpoints + фронтенд.

---

### [ ] Задача 10.14 — Endpoint /api/init
**Статус:** НЕ реализовано

**Что требуется по задаче:**
- `GET /api/init` — единый запрос при открытии Mini App:
  - user (id, name, language, subscription, badges)
  - draft (текущий черновик или null)
  - participantStats (activeCount, wonCount)
  - creatorStats (activeCount, channelCount, postCount)
  - config (limits по подписке, включённые фичи)

**Примечание:** Сейчас клиент должен делать 5-6 отдельных запросов при старте. Этот endpoint — оптимизация.

---

### [ ] Задача 10.15 — API маршруты: Подписки (управление)
**Статус:** НЕ реализовано

**Что требуется по задаче:**
- `GET /api/subscriptions/current` — текущая подписка
- `POST /api/subscriptions/change` — смена тарифа (upgrade/downgrade)

---

### [ ] Задача 10.16 — API маршруты: Бан-лист
**Статус:** НЕ реализовано

**Что требуется по задаче:**
- `POST /api/giveaways/:id/participants/:userId/ban`
- `POST /api/giveaways/:id/participants/:userId/unban`
- `GET /api/ban-list`
- `DELETE /api/ban-list/:id`

**Примечание:** Prisma модель `CreatorBanList` уже создана в блоке 0.

---

### [ ] Задача 10.17 — API маршруты: Бейджи
**Статус:** НЕ реализовано

**Что требуется по задаче:**
- `GET /api/users/me/badges`
- Серверная логика начисления бейджей
- `packages/shared/src/badges.ts` — функция проверки и начисления

**Примечание:** Prisma модель `UserBadge` и тип `BadgeCode` уже созданы в блоке 0.

---

### [ ] Задача 10.18 — API маршруты: Жалобы
**Статус:** НЕ реализовано

**Что требуется по задаче:**
- `POST /api/reports`
- `GET /api/reports` (только админ)
- `PATCH /api/reports/:id` (только админ)

**Примечание:** Prisma модель `Report` и тип `ReportStatus` уже созданы в блоке 0.

---

### [ ] Задача 10.19 — API маршруты: Liveness Check
**Статус:** НЕ реализовано

**Что требуется по задаче:**
- `POST /api/giveaways/:id/liveness/upload`
- `GET /api/giveaways/:id/liveness`
- `POST /api/giveaways/:id/liveness/:participantId/approve`
- `POST /api/giveaways/:id/liveness/:participantId/reject`

**Примечание:** Поля `livenessChecked`, `livenessPhotoPath`, `livenessStatus` уже добавлены в Prisma (Participation) в блоке 0. Потребуется `@fastify/multipart` для загрузки фото.

---

### [~] Задача 10.20 — API маршруты: Дублирование и Sandbox
**Статус:** Частично реализовано

**✅ Что сделано:**
- `POST /giveaways/:id/duplicate` — дублирование розыгрыша (копия как DRAFT, title + "(копия)", копирование conditions) ✅

**❌ Что НЕ сделано:**
1. `POST /api/giveaways/sandbox` — создание тестового розыгрыша (isSandbox=true, TTL 24h через BullMQ) — НЕТ

**Примечание:** Поле `isSandbox` уже добавлено в Prisma (Giveaway) в блоке 0.

**Файлы:**
- `apps/api/src/routes/giveaways.ts` (duplicate)

---

### [ ] Задача 10.21 — API маршруты: Загрузка файлов и медиа
**Статус:** НЕ реализовано

**Что требуется по задаче:**
- `POST /api/uploads/theme-asset` — загрузка логотипа/фона для темы (sharp для ресайза)
- `GET /api/giveaways/:id/participant-count` — количество участников (для polling, Redis кеш 5с)

**Примечание:** Prisma модель `GiveawayTheme` уже создана в блоке 0. Потребуется `@fastify/multipart` + `sharp`.

---

### [~] Задача 10.22 — API маршруты: Winner-Show
**Статус:** Частично реализовано (через site.ts)

**✅ Что сделано (в routes/site.ts):**
- `GET /site/giveaways/:id/randomizer` — данные для рандомайзера (giveaway, participants с билетами, winners, prizes, customization) — требует randomizer.access entitlement ✅
- `POST /site/giveaways/:id/save-prizes` — сохранение призов ✅
- `POST /site/giveaways/:id/save-customization` — кастомизация (colors, logo) ✅
- `GET /site/giveaways/:id/results` — публичные результаты (без авторизации) ✅
- `POST /site/giveaways/:id/publish-winners` — публикация победителей в каналы (с обновлением тизеров и кнопок стартовых постов) ✅

**❌ Что НЕ сделано:**
1. `POST /api/giveaways/:id/winner-show/select` — ручной выбор победителей — НЕТ (выбор только через scheduler/finishGiveaway)
2. `POST /api/giveaways/:id/winner-show/reroll` — перевыбор победителей — НЕТ

**⚠️ Другой подход:**
- Winner-show endpoints живут в `/site/*` с отдельной cookie `rb_site_session`, а не в `/api/giveaways/:id/winner-show/*`. Это связано с тем, что сайт randombeast.ru использует свою авторизацию (Telegram Login Widget).

**Файлы:**
- `apps/api/src/routes/site.ts`

---

### [ ] Задача 10.23 — API маршруты: Напоминания и уведомления
**Статус:** НЕ реализовано

**Что требуется по задаче:**
- `POST /api/giveaways/:id/remind-me` — подписка на напоминание
- `PATCH /api/users/me/notifications` — настройки уведомлений

**Примечание:** Prisma модель `GiveawayReminder` и поля `notificationsEnabled`/`creatorNotificationMode` в User уже созданы в блоке 0.

---

### [~] Задача 10.24 — API маршруты: Retry и системные
**Статус:** Частично реализовано

**✅ Что сделано:**
- `GET /health` — healthcheck (simple: `{ ok: true, service: 'api', timestamp }`) ✅
- `GET /db/ping` — проверка подключения к БД ✅

**❌ Что НЕ сделано:**
1. `POST /api/giveaways/:id/retry` — повторная попытка для ERROR розыгрышей — НЕТ
2. **Расширенный healthcheck**: нет проверки Redis, Bot API доступности; нет статуса `degraded`/`down`

**Файлы:**
- `apps/api/src/routes/health.ts`
- `apps/api/src/routes/db.ts`

---

### [~] Задача 10.25 — API маршруты: Аналитические события
**Статус:** Частично реализовано

**✅ Что сделано:**
- Статистика из существующих данных: COUNT(Participation), GROUP BY DATE(joinedAt), tickets breakdown, invites, boosts, stories — в `GET /giveaways/:id/stats` ✅

**❌ Что НЕ сделано:**
1. `POST /api/giveaways/:id/view` — трекинг открытий (GiveawayView) — НЕТ
2. **Conversion rate**: views → joins — невозможно без трекинга открытий
3. **bySource breakdown**: sourceTag из участий есть, но нет трекинга views по sourceTag
4. **captchaStats/subscriptionStats**: нет отдельных счётчиков (FAILED_CAPTCHA etc.)
5. **Redis caching**: нет кеширования статистики

**Примечание:** Prisma модель `GiveawayView` уже создана в блоке 0.

**Файлы:**
- `apps/api/src/routes/giveaways.ts` (stats)

---

## 📦 ДОПОЛНИТЕЛЬНО реализовано (сверх задач блока 10)

### Internal API (`/internal/*`)
Полноценный bot-to-API слой коммуникации (в `routes/internal.ts`):
- `POST /internal/drafts/giveaway` — создание черновика от имени юзера (из бота)
- `POST /internal/channels/upsert` — добавление/обновление канала
- `POST /internal/post-templates/create` — создание шаблона поста
- `POST /internal/post-templates/:id/delete` / `undo-delete`
- `GET /internal/giveaways/:id/full` — полная информация для бота
- `POST /internal/giveaways/:id/accept` — публикация розыгрыша (создание GiveawayMessage, отправка в каналы)
- `POST /internal/giveaways/:id/reject` — отклонение
- `POST /internal/check-subscription` — проверка подписки через Telegram API
- `POST /internal/notify-winner` — уведомление победителя
- `POST /internal/send-message` / `edit-message` / `edit-message-button` — отправка/редактирование Telegram сообщений
- `POST /internal/check-boosts` — проверка бустов
- `POST /internal/users/language` — обновление языка пользователя
- Защита: X-Internal-Token header

### Site API (`/site/*`)
Полноценный API для randombeast.ru (в `routes/site.ts`):
- Telegram Login Widget авторизация
- Отдельная cookie `rb_site_session`
- Список завершённых розыгрышей, рандомайзер, призы, кастомизация, публикация

### Scheduler
- `apps/api/src/scheduler/giveaway-lifecycle.ts` — каждые 60с проверяет:
  - SCHEDULED → ACTIVE (если startAt наступил)
  - ACTIVE → FINISHED (если endAt наступил)
  - Выбор победителей с весами билетов
  - Автопубликация итогов (SEPARATE_POSTS / EDIT_START_POST / RANDOMIZER тизер)

---

## 📊 Итоговая сводка (Блок 10)

| Статус | Кол-во | Задачи |
|--------|--------|--------|
| ✅ [x] | 2 | 10.7, 10.8 |
| 🟡 [~] | 14 | 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.9, 10.10, 10.11, 10.13, 10.20, 10.22, 10.24, 10.25 |
| ❌ [ ] | 9 | 10.12, 10.14, 10.15, 10.16, 10.17, 10.18, 10.19, 10.21, 10.23 |

**Итого: 2 полностью ✅ / 14 частично 🟡 / 9 не реализовано ❌**

---

## 📁 Список файлов блока 10

```
apps/api/
├── package.json
├── tsconfig.json
├── .eslintrc.cjs
└── src/
    ├── server.ts                         # Инициализация Fastify, регистрация плагинов/роутов
    ├── config.ts                         # Env конфигурация, CORS origins, auth settings
    ├── plugins/
    │   └── auth.ts                       # getUser(), requireUser()
    ├── utils/
    │   └── session.ts                    # createSessionToken(), verifySessionToken(), cookie options
    ├── lib/
    │   └── yookassa.ts                   # YooKassa API обёртка
    ├── routes/
    │   ├── health.ts                     # GET /health
    │   ├── db.ts                         # GET /db/ping
    │   ├── auth.ts                       # POST /auth/telegram, GET /auth/me, POST /auth/logout
    │   ├── drafts.ts                     # GET/POST/PATCH /drafts/giveaway, discard
    │   ├── channels.ts                   # GET/DELETE /channels, POST /channels/:id/recheck
    │   ├── post-templates.ts             # GET/DELETE /post-templates, undo-delete
    │   ├── giveaways.ts                  # CRUD, confirm, stats, participants, duplicate, catalog
    │   ├── participation.ts              # join, check-subscription, referral, boosts, stories, captcha, my participations
    │   ├── lifecycle.ts                  # status, winners, finish, my-result
    │   ├── catalog.ts                    # GET /catalog, GET /catalog/access
    │   ├── payments.ts                   # POST /payments/create, GET /payments/status, webhook
    │   ├── site.ts                       # Site auth, randomizer, prizes, customization, publish
    │   └── internal.ts                   # Bot-to-API: channels, posts, giveaways, subscriptions, messages
    └── scheduler/
        └── giveaway-lifecycle.ts         # SCHEDULED→ACTIVE, ACTIVE→FINISHED, winner selection
```

---

## ⚠️ Конфликты / расхождения с текущим кодом

1. **Формат ответов**: `{ ok: true }` вместо `{ success: true, data: {} }` — затрагивает ВСЕ endpoints + фронтенд. Нужно решение: оставить или рефакторить.
2. **Версионирование URL**: нет `/api/v1/` prefix — все роуты от корня. Добавление prefix затронет фронтенд.
3. **Каналы и посты**: добавляются ТОЛЬКО через бота (internal API), не через Mini App. Если нужно из Mini App — нужны публичные POST endpoints.
4. **Confirm flow**: `/giveaways/from-draft/:draftId/confirm` вместо отдельных POST/confirm/reject. Reject только через internal API.
5. **Winner-show**: живёт в `/site/*` с отдельной cookie, а не в `/api/giveaways/:id/winner-show/*`.

---

## 🔗 Зависимости от блока 0

| Что нужно | Статус в блоке 0 | Используется в API? |
|-----------|-----------------|-------------------|
| Prisma модели (core: User, Channel, Giveaway, etc.) | ✅ Есть | ✅ Да, активно |
| Prisma модели (new: TrackingLink, Report, UserBadge, etc.) | ✅ Создано | ❌ Нет (endpoints не реализованы) |
| Shared types (enums, interfaces) | ✅ Есть | ✅ Частично (GiveawayDraftPayload, WizardStep) |
| Shared constants (LIMITS, CACHE_KEYS) | ✅ Есть | ✅ Частично (POST_LIMITS, POST_TEMPLATE_UNDO_WINDOW_MS) |
| TIER_LIMITS | ✅ Есть | ❌ Нет (не используются для проверки доступа) |
| Shared validation.ts (Zod schemas) | ✅ Создано | ❌ Нет — каждый роут определяет свои inline schemas |
| Shared moderation.ts | ✅ Создано | ❌ Нет |
| ErrorCode enum | ✅ Есть | ❌ Нет — ошибки как строки |
| Docker (PostgreSQL, Redis) | ✅ Есть | ✅ PostgreSQL, ❌ Redis не используется |
