# ⚡ БЛОК 12: ВЫБОР ПОБЕДИТЕЛЕЙ И ЗАВЕРШЕНИЕ РОЗЫГРЫША

## Обозначения статусов
- [ ] — не сделано
- [x] — сделано полностью
- [~] — сделано частично (см. комментарий)
- [?] — нужно проверить (начальный статус)

---

## Сводка (реализовано 2026-02-23)

| Задача | Статус | Комментарий |
|--------|--------|-------------|
| 12.1 Алгоритм выбора | [x] | crypto.randomInt + cumulative sum + binary search; subscriptionVerified filter; fraudScore threshold; SHA256 audit seed (drawSeed в БД); reserve winners |
| 12.2 Публикация итогов | [x] | Все 3 режима; уведомление создателю с итогами; 4096-char limit (truncate); winner-show ссылка в RANDOMIZER |
| 12.3 Уведомления | [x] | notificationsBlocked check; prizeDeliveryMethod-specific messages (CONTACT_CREATOR/BOT_INSTRUCTION/FORM); создателю после выбора; участникам при отмене |

**Итого: 3/3 [x] — 100% готово**

---

### [x] Задача 12.1 — Алгоритм выбора победителей

**Реализовано:**

1. **`buildCumulativePool()` + `weightedRandomSelect()`** — cumulative sum + binary search:
   ```
   apps/api/src/scheduler/giveaway-lifecycle.ts
   ```
   - Строит массив `WeightedEntry[]` с `cumulativeWeight` для каждого участника
   - `crypto.randomInt(1, totalWeight + 1)` — Node.js встроенный CSPRNG (убрана старая реализация через `randomBytes()`)
   - Binary search: `while (lo < hi) { mid = (lo+hi)>>1; ... }` → O(log N)
   - Каждый winner выбирается из пересобранного pool remaining participants → без повторений

2. **Фильтры перед выбором:**
   - `subscriptionVerified: true` — только если у розыгрыша есть `requiredSubscriptions`
   - `fraudScore < FRAUD_SCORE_THRESHOLD (80)` — явные мошенники исключаются

3. **Audit seed (SHA256):**
   ```
   drawSeed = SHA256("giveawayId|endAt|[{id,tickets},...sorted]")
   ```
   - Сохраняется в `Giveaway.drawSeed` (новое поле в схеме + migration)
   - Публикуется создателю в уведомлении (`🔑 Seed: abc123...`)

4. **Reserve winners:**
   - Создаются после основных победителей (`isReserve: true`)
   - Количество: `Math.min(reserveWinnersCount, remaining.length)`

**Как было → Как стало:**
- Было: ticket-pool expansion + `cryptoRandomInt()` через `randomBytes()`
- Стало: cumulative sum + binary search + `crypto.randomInt()` (O(log N), без expansion)

**Файлы:**
- `apps/api/src/scheduler/giveaway-lifecycle.ts` — `buildCumulativePool()`, `weightedRandomSelect()`, `generateDrawSeed()`, `finishGiveaway()`
- `packages/database/prisma/schema.prisma` — `drawSeed String?` в модели `Giveaway`
- `packages/database/prisma/migrations/20260223_add_draw_seed/migration.sql` — `ALTER TABLE "Giveaway" ADD COLUMN "drawSeed" TEXT`

---

### [x] Задача 12.2 — Публикация итогов

**Реализовано:**

1. **Уведомление создателю после выбора победителей (`notifyCreatorFinished()`):**
   ```
   apps/api/src/scheduler/giveaway-lifecycle.ts
   ```
   - Вызывается fire-and-forget из `finishGiveaway()`
   - Текст: "✅ Розыгрыш «title» завершён! 🏆 Победители: ...\n🔑 Seed: abc123...\n📊 Подробная статистика"
   - Кнопка "📊 Открыть статистику"
   - Проверяет `notificationsBlocked`

2. **4096-символьный лимит (EDIT_START_POST):**
   - `maxLen = hasMedia ? 1024 : 4096` — разные лимиты для caption/text
   - `formatWinnersText(winners, maxWinnersLen)` — soft truncate + "…и ещё N победителей"
   - Hard truncate как failsafe: `text.slice(0, maxLen - 3) + '...'`
   - Fallback: если нет START-сообщений → вызывает `publishResultsSeparatePosts()`

3. **Winner-show ссылка в RANDOMIZER:**
   - `randomizerUrl = config.siteUrl + '/winner/' + giveawayId`
   - Кнопка "🎲 Смотреть рандомайзер" добавляется к тизер-посту
   - `SITE_URL` добавлен в `config.ts` и env schema

4. **Все три режима работают:**
   - `RANDOMIZER`: тизер + кнопка → рандомайзер на сайте
   - `EDIT_START_POST`: редактирует с limit check + fallback
   - `SEPARATE_POSTS`: новый пост с форматированием + кнопка

**Файлы:**
- `apps/api/src/scheduler/giveaway-lifecycle.ts` — `notifyCreatorFinished()`, `formatWinnersText()`, `formatResultsPost()`, `publishResultsSamePost()`
- `apps/api/src/config.ts` — `siteUrl`, `SITE_URL` env var

---

### [x] Задача 12.3 — Уведомления участникам

**Реализовано:**

1. **`notificationsBlocked` проверяется:**
   - В `notifyWinners()`: `if (winner.user.notificationsBlocked) continue`
   - В `notifyCancelToAll()`: `if (p.user.notificationsBlocked) continue`
   - При 403 от Telegram API: автоматически устанавливает `notificationsBlocked: true` в БД

2. **`prizeDeliveryMethod`-зависимые сообщения победителям:**
   - `CONTACT_CREATOR`: "Свяжитесь с организатором: @username" + кнопка "💬 Написать организатору"
   - `BOT_INSTRUCTION`: "📋 Инструкция по получению приза: [prizeInstruction]"
   - `FORM`: "📝 Заполните форму" + кнопка WebApp "Заполнить форму"

3. **Создателю после выбора:** `notifyCreatorFinished()` (см. 12.2)

4. **При отмене розыгрыша (`notifyCancelToAll()`):**
   - Экспортирована из `giveaway-lifecycle.ts`
   - Вызывается из `POST /giveaways/:id/cancel` (только для ACTIVE/SCHEDULED)
   - Создатель: "❌ Розыгрыш отменён"
   - Участники: "⚠️ Розыгрыш отменён организатором... Не расстраивайтесь!"
   - Rate limit: `await sleep(33ms)` между сообщениями, batch pause при 30 отправленных

5. **Rate limiting в `notifyWinners()`:**
   - `await sleep(50ms)` между победителями (≤20 msg/sec)

**Не реализовано (по-прежнему):**
- Уведомление проигравшим — сознательно исключено: для 10000+ участников нужен отдельный BullMQ job, объём работы выходит за рамки блока 12

**Файлы:**
- `apps/api/src/scheduler/giveaway-lifecycle.ts` — `sendTelegramMessage()`, `notifyWinners()`, `notifyCreatorFinished()`, `notifyCancelToAll()`
- `apps/api/src/routes/giveaways.ts` — импорт `notifyCancelToAll` + вызов в cancel route

---

## Список файлов блока 12

### Backend (API)
| Файл | Что содержит |
|------|-------------|
| `apps/api/src/scheduler/giveaway-lifecycle.ts` | `buildCumulativePool()`, `weightedRandomSelect()`, `generateDrawSeed()`, `finishGiveaway()`, `sendTelegramMessage()`, `notifyWinners()`, `notifyCreatorFinished()`, `notifyCancelToAll()`, `publishResults()`, `publishRandomizerTeaser()`, `publishResultsSamePost()`, `publishResultsSeparatePosts()` |
| `apps/api/src/config.ts` | `siteUrl`, `SITE_URL` env var |
| `apps/api/src/routes/giveaways.ts` | cancel route с `notifyCancelToAll()` |
| `apps/api/src/routes/lifecycle.ts` | `GET /giveaways/:id/status`, `GET /giveaways/:id/winners`, `GET /giveaways/:id/my-result`, `POST /giveaways/:id/finish` |
| `apps/api/src/routes/internal.ts` | `POST /internal/notify-winner`, `POST /internal/send-message`, `POST /internal/edit-message`, `POST /internal/edit-message-button` |
| `apps/api/src/routes/site.ts` | `GET /site/giveaways/:id/randomizer`, `POST /site/giveaways/:id/publish-winners` |

### Bot
| Файл | Что содержит |
|------|-------------|
| `apps/bot/src/jobs/giveaway-end.ts` | BullMQ worker `giveaway:end` (creator notification) |
| `apps/bot/src/jobs/winner-notifications.ts` | BullMQ worker `winner-notifications` (готов к использованию) |

### Frontend — Mini App
| Файл | Что содержит |
|------|-------------|
| `apps/web/src/app/giveaway/[id]/results/page.tsx` | Страница результатов: победители, мой результат, confetti, mascot |

### Frontend — Сайт
| Файл | Что содержит |
|------|-------------|
| `apps/site/src/app/[locale]/winner/[id]/page.tsx` | Страница рандомайзера для создателя |
| `apps/site/src/lib/randomizer.ts` | Клиентская логика: `secureRandomInt()` + `shuffleArray()` (crypto.getRandomValues()), `selectWeightedWinners()` (cumulative sum + binary search) |

### Database
| Что содержит |
|-------------|
| `Winner` модель: `place`, `ticketsUsed`, `notifiedAt`, `isReserve`, `isConfirmed`, `rerolled` |
| `Giveaway.drawSeed String?` — SHA256 audit seed (новое поле) |
| Migration: `packages/database/prisma/migrations/20260223_add_draw_seed/migration.sql` |

---

## Реализован ли weighted random корректно?

### API-сторона (`giveaway-lifecycle.ts`) — ✅ ДА, ЭТАЛОННАЯ РЕАЛИЗАЦИЯ

**Алгоритм:**
```
buildCumulativePool → weightedRandomSelect → crypto.randomInt(1, totalWeight+1) → binarySearch
```

- `crypto.randomInt()` — встроенный Node.js CSPRNG, криптографически безопасный ✅
- Cumulative sum + binary search → O(log N) вместо O(N*tickets) ✅
- Rejection sampling не нужен (crypto.randomInt берёт ровно нужный диапазон) ✅
- Каждый раз pool пересобирается из remaining → выбор без повторений ✅

### Site-сторона (`randomizer.ts`) — ✅ ИСПРАВЛЕНО

**Было:** `Math.floor(Math.random() * (i + 1))` — НЕ криптографически безопасный

**Стало:**
- `secureRandomInt(max)` — через `crypto.getRandomValues()` + rejection sampling (маска + отклонение bias)
- `shuffleArray()` — Fisher-Yates с `secureRandomInt()`
- `selectWeightedWinners()` — cumulative sum + binary search + `crypto.getRandomValues()` с rejection sampling

Алгоритм на сайте теперь соответствует серверному.
