# Block 17: Moderation (Aудит + Реализация)

## Задача 17.1 [x] Модерация каталога

**Автоматическая модерация публичного каталога розыгрышей.**

### Реализовано:
- ✅ `packages/shared/src/moderation.ts` — функция `checkContent()` со стоп-словами (RU/EN/KK)
- ✅ Поля `catalogApproved`, `catalogApprovedAt` в схеме Prisma модели `Giveaway`
- ✅ `apps/api/src/scheduler/giveaway-lifecycle.ts` — добавлена функция `runCatalogAutoModeration()`:
  - Запускается каждую минуту вместе со scheduler
  - Находит кандидатов: `status=ACTIVE`, `isPublicInCatalog=true`, `totalParticipants >= 100`, `catalogApproved=false`
  - Проверяет **SystemBan** создателя (если создатель забанен — пропускает)
  - Проверяет **`checkContent()`** на заголовке + тексте поста (стоп-слова)
  - При прохождении всех проверок: устанавливает `catalogApproved=true`, `catalogApprovedAt=now()`
  - Отправляет уведомление администратору (`notifyCatalogApproved`)
- ✅ `apps/api/src/lib/admin-notify.ts` — `notifyCatalogApproved()`, `notifyCatalogCandidate()`

### Условия одобрения:
1. Розыгрыш активен (ACTIVE)
2. Создатель включил продвижение (`isPublicInCatalog: true`)
3. ≥ 100 участников
4. Создатель НЕ в SystemBan
5. Контент не содержит стоп-слов

---

## Задача 17.2 [x] Системные уведомления (для администратора)

**Проактивные уведомления в ADMIN_CHAT_ID через Telegram Bot API.**

### Реализовано:
- ✅ `apps/api/src/lib/admin-notify.ts` — централизованный модуль уведомлений:
  - `sendAdminNotification(html)` — базовая функция отправки
  - `notifyNewUserMilestone(total, username)` — рубежи регистраций (100, 500, 1000, ...)
  - `notifyNewPurchase(opts)` — новая покупка/подписка
  - `notifyCatalogCandidate(opts)` — розыгрыш достиг 100 участников
  - `notifyNewReport(opts)` — новая жалоба
  - `notifyCatalogRemoved(opts)` — автоснятие с каталога
  - `notifyCatalogApproved(opts)` — одобрение в каталог
- ✅ `apps/api/src/config.ts` — добавлены `adminChatId` и `adminUserIds` из env
- ✅ `.env.example` — добавлены `ADMIN_CHAT_ID` и `ADMIN_USER_IDS` с описанием
- ✅ Интеграция уведомлений:
  - `apps/api/src/routes/auth.ts` — milestone при регистрации нового пользователя
  - `apps/api/src/routes/webhooks.ts` — уведомление о покупке
  - `apps/api/src/routes/participation.ts` — уведомление при 100-м участнике (кандидат в каталог)
  - `apps/api/src/routes/reports.ts` — уведомление о новой жалобе / автоснятии
  - `apps/api/src/scheduler/giveaway-lifecycle.ts` — уведомление при одобрении в каталог
- ✅ `apps/api/src/routes/internal.ts` — добавлены endpoints для бот-команд:
  - `GET /internal/admin/stats` — платформенная статистика (users, giveaways, purchases, ...)
  - `GET /internal/admin/giveaways/:id` — инфо о конкретном розыгрыше
- ✅ `apps/bot/src/handlers/admin.ts` — исправлен заголовок `X-Internal-Secret` → `X-Internal-Token` (конфликт устранён)

---

## Задача 17.3 [x] Система жалоб

**Жалобы пользователей на розыгрыши.**

### Реализовано:
- ✅ Prisma модель `Report` со всеми полями
- ✅ `apps/api/src/routes/reports.ts` — полный API:
  - `POST /reports` — создание жалобы (проверка дублей, upsert запрещён)
  - `GET /reports/my` — список своих жалоб (пагинация)
  - `GET /reports/:id` — детали жалобы (только автор)
  - `GET /reports/about-giveaway/:giveawayId` — жалобы на розыгрыш (только владелец)
  - `PATCH /reports/:id` — обновление статуса (только via X-Internal-Token)
  - **Авто-снятие с каталога** при > 5 активных жалоб (`isPublicInCatalog=false`, `catalogApproved=false`)
  - **Уведомление администратора** о каждой новой жалобе
  - **Уведомление создателя** розыгрыша при автоснятии с каталога
- ✅ `apps/web/src/lib/api.ts` — функция `submitReport()`, типы `ReportReason`, `SubmitReportParams`
- ✅ `apps/web/src/app/giveaway/[id]/page.tsx` — **новая страница участника** с:
  - Информацией о розыгрыше (статус, участники, победители, дата)
  - Кнопкой перехода к результатам
  - Кнопкой `⚠️ Пожаловаться` (мелкая, внизу страницы)
  - BottomSheet с выбором причины жалобы и опциональным описанием
  - Защита от дублей (ошибка "уже отправляли")
- ✅ `apps/web/src/app/giveaway/[id]/results/page.tsx` — страница результатов (существовала)
- ✅ i18n ключи `report.*` добавлены в ru.json, en.json, kk.json
- ✅ `apps/api/src/routes/giveaways.ts` — добавлен `GET /giveaways/:id/public` (публичный, без авторизации)

### Причины жалоб:
- `SPAM` — Спам/реклама
- `FRAUD` — Мошенничество
- `INAPPROPRIATE_CONTENT` — Неприемлемый контент
- `FAKE_GIVEAWAY` — Не выдали приз
- `OTHER` — Другое

---

## Задача 17.4 [x] Системный бан-лист

**Полный цикл: бот-команда → API → middleware → уведомление.**

### Реализовано:
- ✅ Prisma модель `SystemBan` (userId unique, reason, bannedAt, expiresAt, bannedBy)
- ✅ `apps/api/src/plugins/auth.ts` — функция `requireUser()` обновлена:
  - Проверяет `SystemBan` при **каждом** авторизованном запросе
  - Если бан активен → HTTP 403 с `{ error: "ACCOUNT_BANNED", message: "Ваш аккаунт заблокирован..." }`
  - **Автоматическое снятие** истёкших банов (`expiresAt < now`)
  - `expiresAt = null` → перманентный бан
- ✅ `apps/api/src/routes/internal.ts` — добавлен endpoint:
  - `POST /internal/users/:telegramUserId/ban` — забанить (`banned: true`) или разбанить (`banned: false`)
    - Поддерживает `reason`, `adminId`, `expiresAt`
    - Upsert бана (создаёт или обновляет)
    - Уведомляет администратора через `sendAdminNotification`
- ✅ `apps/bot/src/handlers/admin.ts` — исправлены вызовы:
  - Заголовок исправлен `X-Internal-Secret` → `X-Internal-Token`
  - Добавлен `adminId: ctx.from?.id` в body бана
  - Исправлены вызовы `/internal/admin/stats` и `/internal/admin/giveaways/:id`

---

## Итог реализации

| Задача | Статус | Файлы |
|--------|--------|-------|
| 17.1 Модерация каталога | [x] **Готово** | `scheduler/giveaway-lifecycle.ts`, `shared/moderation.ts` |
| 17.2 Системные уведомления | [x] **Готово** | `lib/admin-notify.ts`, `routes/auth.ts`, `routes/webhooks.ts`, `routes/participation.ts`, `routes/internal.ts` |
| 17.3 Система жалоб | [x] **Готово** | `routes/reports.ts`, `web/giveaway/[id]/page.tsx`, `lib/api.ts`, i18n |
| 17.4 Системный бан | [x] **Готово** | `plugins/auth.ts`, `routes/internal.ts`, `bot/handlers/admin.ts` |

---

## Файлы блока 17

### Backend (API)
- `apps/api/src/lib/admin-notify.ts` ← **НОВЫЙ**
- `apps/api/src/plugins/auth.ts` ← обновлён (SystemBan middleware)
- `apps/api/src/routes/internal.ts` ← добавлены `/users/:id/ban`, `/admin/stats`, `/admin/giveaways/:id`
- `apps/api/src/routes/reports.ts` ← обновлён (уведомления, автоснятие)
- `apps/api/src/routes/giveaways.ts` ← добавлен `/giveaways/:id/public`
- `apps/api/src/routes/auth.ts` ← milestone уведомления
- `apps/api/src/routes/participation.ts` ← уведомление 100 участников
- `apps/api/src/routes/webhooks.ts` ← уведомление о покупке
- `apps/api/src/scheduler/giveaway-lifecycle.ts` ← `runCatalogAutoModeration()`
- `apps/api/src/config.ts` ← `adminChatId`, `adminUserIds`

### Bot
- `apps/bot/src/handlers/admin.ts` ← исправлен заголовок, добавлен adminId

### Frontend (Web)
- `apps/web/src/lib/api.ts` ← `submitReport()`
- `apps/web/src/app/giveaway/[id]/page.tsx` ← **НОВЫЙ** (страница розыгрыша + кнопка жалобы)
- `apps/web/messages/ru.json` ← ключи `report.*`
- `apps/web/messages/en.json` ← ключи `report.*`
- `apps/web/messages/kk.json` ← ключи `report.*`

### Database
- `packages/database/prisma/schema.prisma` — модели `SystemBan`, `Report`, поля `Giveaway`

### Config
- `.env.example` ← `ADMIN_CHAT_ID`, `ADMIN_USER_IDS` (с описанием, раскомментированы)

---

## Как проверить

### 17.4 Системный бан

```bash
# 1. Забанить пользователя через бот (только ADMIN_USER_IDS)
/admin_ban 123456789 Нарушение правил

# 2. Попробовать сделать запрос от забаненного пользователя
# → HTTP 403 { "error": "ACCOUNT_BANNED", "message": "Ваш аккаунт заблокирован..." }

# 3. Разбанить
/admin_unban 123456789

# 4. Прямой вызов через API
curl -X POST http://localhost:4000/internal/users/123456789/ban \
  -H "X-Internal-Token: dev_internal_token" \
  -H "Content-Type: application/json" \
  -d '{"banned": true, "reason": "Тест"}'
```

### 17.3 Система жалоб

```bash
# 1. Отправить жалобу (нужна авторизация)
curl -X POST http://localhost:4000/reports \
  -H "Content-Type: application/json" \
  --cookie "rb_session=YOUR_SESSION" \
  -d '{"targetType": "GIVEAWAY", "targetId": "UUID", "reason": "SPAM"}'

# 2. Открыть страницу участника: http://localhost:3000/giveaway/[ID]
# → Внизу кнопка "⚠️ Пожаловаться"
# → Откроется BottomSheet с выбором причины
```

### 17.1 Модерация каталога

```bash
# Scheduler запускается каждую минуту автоматически
# Для ручной проверки: создайте розыгрыш с isPublicInCatalog=true, 
# добавьте 100+ участников, убедитесь что нет стоп-слов в названии
# → Через ~1 минуту catalogApproved станет true
# → В ADMIN_CHAT_ID придёт уведомление
```

### 17.2 Системные уведомления

```bash
# В .env установите ADMIN_CHAT_ID и BOT_TOKEN
# Триггеры:
# - Новый пользователь достиг рубежа (100, 500, 1000, ...)
# - Новая покупка через YooKassa
# - Розыгрыш достиг 100 участников (кандидат в каталог)
# - Новая жалоба
# - Розыгрыш снят с каталога автоматически
# - /admin_stats в боте → GET /internal/admin/stats
# - /admin_giveaway <id> в боте → GET /internal/admin/giveaways/:id
```
