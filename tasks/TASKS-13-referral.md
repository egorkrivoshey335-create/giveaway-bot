# 🔄 БЛОК 13: РЕФЕРАЛЬНАЯ СИСТЕМА

## Обозначения статусов
- [ ] — не сделано
- [x] — сделано полностью
- [~] — сделано частично (см. комментарий)
- [?] — нужно проверить (начальный статус)

---

## Сводка (2026-02-23 → реализовано 2026-02-23)

| Задача | Статус | Комментарий |
|--------|--------|-------------|
| 13.1 Генерация ссылок | [x] | nanoid shortCode, ReferralLink в БД, POST /generate-invite, GET /referral/resolve/:code с click tracking |
| 13.2 Трекинг рефералов | [x] | ReferralLink.conversions++, уведомление рефереру в боте, r_[code] парсинг в startapp |
| 13.3 UI приглашений | [x] | Прогресс-бар, даты + username, топ-10 для создателя |

**Итого: 3/3 [x] — 100% готово**

---

### [x] Задача 13.1 — Генерация реферальных ссылок

**Что реализовано:**
- `generateNanoid(8)` — криптографически стойкий 8-символьный код (A-Z, a-z, 0-9)
- `upsertReferralLink()` — создаёт или возвращает существующий `ReferralLink` (retry при коллизии кода)
- Формат ссылки: `https://t.me/${BOT_USERNAME}/participate?startapp=r_${refLink.code}`
- `GET /giveaways/:id/my-referral` — upsert ReferralLink, возвращает shortCode-based URL + `clicks`, `conversions`
- `POST /giveaways/:id/generate-invite` — новый endpoint по спецификации, то же самое через POST
- `GET /referral/resolve/:code` — публичный, декодирует shortCode → `giveawayId` + `referrerUserId`, инкрементирует `clicks`
- Backward compatibility: `join_{id}_ref_{userId}` формат по-прежнему поддерживается в `page.tsx`

**Файлы:**
- `apps/api/src/routes/participation.ts` — `generateNanoid()`, `upsertReferralLink()`, все три endpoint'а
- `apps/web/src/lib/api.ts` — `generateInvite()`, `resolveReferralCode()`, `getTopInviters()`

---

### [x] Задача 13.2 — Трекинг рефералов

**Что реализовано:**
- `ReferralLink.clicks` — инкрементируется при вызове `GET /referral/resolve/:code`
- `ReferralLink.conversions` — инкрементируется в join handler после `ticketsExtra: { increment: 1 }`
- `notifyReferrerJoined()` — после успешного инвайта отправляет Telegram сообщение рефереру через Bot API:
  - "🎉 @username вступил по вашей реферальной ссылке! +1 дополнительный билет в розыгрыше «...»."
  - Мультиязычность: ru/en/kk
  - Fire-and-forget (не блокирует join)
- Парсинг `r_[shortCode]` в `apps/web/src/app/page.tsx`:
  - Вызывает `resolveReferralCode(code)` → получает `giveawayId` + `referrerUserId`
  - Редиректит на `/join/${giveawayId}?ref=${referrerUserId}`
- Самоинвайт запрещён ✅, дубли запрещены ✅, лимит inviteMax ✅ (сохранено из предыдущей реализации)

**Файлы:**
- `apps/api/src/routes/participation.ts` — `notifyReferrerJoined()`, `conversions++` в join handler
- `apps/web/src/app/page.tsx` — парсинг `r_[shortCode]` в startapp

---

### [x] Задача 13.3 — Отображение рефералов в UI

**Что реализовано (участник):**
- **Прогресс-бар** с плавной анимацией: ширина = `(invitedCount / inviteMax) * 100%`
- Счётчик `N/M` справа от прогресс-бара
- Список приглашённых: `firstName` + `lastName` + `@username` (если есть) + **дата** в формате `DD.MM`
- Toast "✅ Ссылка скопирована!" отображается явно под полем ссылки
- Все остальные элементы сохранены: кнопки Share/Copy, лимит-сообщение

**Что реализовано (создатель):**
- `GET /giveaways/:id/top-inviters` — топ-10 участников по количеству приглашённых
  - Сортировка по убыванию
  - Медали: 🥇/🥈/🥉 для топ-3
  - Требует владения розыгрышем
- Секция "🏆 Топ пригласивших" в обзоре создателя:
  - Видна только если `inviteEnabled`
  - Загружается вместе с данными розыгрыша
  - Пустое состояние: "Приглашений пока нет"
- i18n ключи: `giveawayDetails.topInviters.{title, empty, invites}` для ru/en/kk

**Файлы:**
- `apps/web/src/app/join/[giveawayId]/page.tsx` — прогресс-бар + даты в invites tab
- `apps/web/src/app/creator/giveaway/[id]/page.tsx` — топ инвайтеров секция
- `apps/api/src/routes/giveaways.ts` — `GET /giveaways/:id/top-inviters`
- `apps/web/messages/ru.json`, `en.json`, `kk.json` — i18n ключи

---

## Список файлов блока 13

### Backend (API)
| Файл | Что содержит |
|------|-------------|
| `apps/api/src/routes/participation.ts` | `generateNanoid()`, `upsertReferralLink()`, `notifyReferrerJoined()`, `GET /my-referral`, `POST /generate-invite`, `GET /referral/resolve/:code`, трекинг в join handler |
| `apps/api/src/routes/giveaways.ts` | `invitesCount` в stats, `inviteCountMap` в participants, `GET /giveaways/:id/top-inviters` |
| `packages/database/prisma/schema.prisma` | `ReferralLink` модель, `Participation.referrerUserId` |

### Frontend (Web)
| Файл | Что содержит |
|------|-------------|
| `apps/web/src/app/page.tsx` | Парсинг `r_[shortCode]` и `join_{id}_ref_{referrer}` в startapp |
| `apps/web/src/app/join/[giveawayId]/page.tsx` | UI таба "Приглашения" с прогресс-баром, датами, username |
| `apps/web/src/app/creator/giveaway/[id]/page.tsx` | Секция топ пригласивших |
| `apps/web/src/lib/api.ts` | `getMyReferral()`, `generateInvite()`, `resolveReferralCode()`, `getTopInviters()`, `getMyInvites()` |
| `apps/web/messages/ru.json` | i18n ключи `extras.inviteProgress`, `topInviters.*` |
| `apps/web/messages/en.json` | То же, en |
| `apps/web/messages/kk.json` | То же, kk |

---

## Конфликты — РЕШЕНЫ

### ✅ 1. ReferralLink таблица теперь используется
- `upsertReferralLink()` создаёт запись при первом запросе ссылки
- `clicks++` при переходе по ссылке (`GET /referral/resolve/:code`)
- `conversions++` при успешном инвайте

### ✅ 2. Формат ссылки: теперь r_[shortCode]
- `generateNanoid(8)` — 8 символов, URL-safe
- Ссылка: `...?startapp=r_${code}` — короткая и безопасная
- Обратная совместимость с `join_{id}_ref_{userId}` сохранена

### ✅ 3. Уведомление рефереру реализовано
- `notifyReferrerJoined()` отправляет Telegram сообщение через Bot API
- Мультиязычность: ru/en/kk

---

## Зависимости

| Блок | Связь |
|------|-------|
| Блок 0 — `ReferralLink` модель | ✅ Используется |
| Блок 10 — `POST /giveaways/:id/generate-invite` (задача 10.7) | ✅ Реализован |
| Блок 3 — таб "Приглашения" в "Увеличить шансы" (задача 3.4) | ✅ Реализован с прогресс-баром и датами |
| Блок 2 — парсинг `startapp` (задача 2.2) | ✅ Поддерживает оба формата |
| Блок 5 — статистика инвайтов для создателя (задача 5.2) | ✅ Топ-10 + invitesCount |
| Блок 7 — антифрод по инвайтам (задача 7.3) | [ ] Не реализован (зависимость от блока 7) |
