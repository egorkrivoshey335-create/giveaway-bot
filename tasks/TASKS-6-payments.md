# Block 6: Payments & Subscriptions

## Статус: ✅ 100% ВЫПОЛНЕНО

| Задача | Статус | Описание |
|--------|--------|----------|
| 6.1 SubscriptionBottomSheet | ✅ | Глобальный компонент, 2 таба, 3 тарифа, Stars цены |
| 6.2 Каталог (платный) | ✅ | Фильтры UI, participants>=100, SubscriptionBottomSheet |
| 6.3 ЮKassa интеграция | ✅ | Единый webhook + IP whitelist + подпись, все события |
| 6.4 Telegram Stars | ✅ | pre_checkout_query, successful_payment, /buy команда |
| 6.5 Управление подпиской | ✅ | /creator/subscription, смена плана, scheduler |

---

## 6.1 — SubscriptionBottomSheet (UI) ✅

**Что реализовано:**
- `apps/web/src/components/SubscriptionBottomSheet.tsx` — глобальный переиспользуемый компонент
- Два таба: "Для создателей" | "Для участников"
- Три тарифа: PLUS (190₽/200⭐), PRO (490₽/500⭐), BUSINESS (1490₽/1500⭐)
- Кликабельные фичи с описанием (expand/collapse)
- Показ включённых/исключённых фич для выбранного тарифа
- Stars цены в UI (визуально)
- Интегрирован в: каталог (`/catalog`), профиль создателя (`/creator/profile`)
- i18n: ru/en/kk ключи в `subscription.*`

---

## 6.2 — Каталог розыгрышей (платный) ✅

**Что реализовано:**
- `apps/api/src/routes/catalog.ts`: добавлена проверка `totalParticipants >= 100`
- UI фильтры сортировки: по участникам / сроку / новизне (`CatalogFilters` компонент)
- Старая `SubscriptionModal` заменена на `SubscriptionBottomSheet` с табом "participants"
- Cursor-based pagination с поддержкой `sortBy` параметра
- Кнопка "Получить доступ" в header каталога для неавторизованных

---

## 6.3 — Интеграция ЮKassa ✅

**Что реализовано:**
- `apps/api/src/routes/webhooks.ts` — единый webhook endpoint (`POST /webhooks/yookassa`):
  - IP whitelist: 185.71.76.0/27, 185.71.77.0/27, 77.75.153.0/25
  - HMAC-SHA256 подпись (X-YooKassa-Signature, timing-safe сравнение)
  - Всегда возвращает 200 OK (чтобы ЮKassa не ретраила)
  - Обработка событий: `payment.succeeded`, `payment.canceled`, `payment.waiting_for_capture`, `refund.succeeded`
  - Атомарная транзакция: Purchase → COMPLETED + Entitlement
  - Идемпотентность по purchaseId (повторный вызов игнорируется)
  - Уведомление в боте после успешной оплаты
- `apps/api/src/routes/payments.ts` — убран дублирующий webhook endpoint
- `apps/api/src/config.ts` — отдельный `YOOKASSA_WEBHOOK_SECRET` (не путать с SECRET_KEY)
- Seed script: `packages/database/prisma/seed.ts` — Products PLUS/PRO/BUSINESS/CATALOG со Stars ценами
- **Конфликт устранён**: два webhook endpoint объединены в один защищённый

**Конфигурация ЮKassa для production:**
```
YOOKASSA_SHOP_ID=ваш_shop_id
YOOKASSA_SECRET_KEY=ваш_secret_key
YOOKASSA_WEBHOOK_SECRET=секрет_из_dashboard_юkassa
YOOKASSA_RETURN_URL=https://app.randombeast.ru/payments/return
```

---

## 6.4 — Telegram Stars (альтернативная оплата) ✅

**Что реализовано:**
- `apps/bot/src/handlers/payments.ts`:
  - `pre_checkout_query` handler — валидация и одобрение за < 10 сек
  - `message:successful_payment` handler — уведомление API через internal endpoint
  - `sendStarsInvoice()` — отправка инвойса с `currency: 'XTR'`
  - Команда `/buy [PRODUCT_CODE]` — меню или прямая оплата
  - Callback `stars_buy:PRODUCT_CODE` — оплата по кнопке
- `apps/api/src/routes/internal.ts` — `POST /internal/stars-payment`:
  - Идемпотентность по `telegramPaymentChargeId`
  - Атомарная транзакция Purchase (COMPLETED) + Entitlement
- DB: `PurchaseProvider.STARS` добавлен в enum
- Migration: `20260223_add_stars_and_subscription_fields/migration.sql`

**Stars цены продуктов (в БД):**
| Продукт | Stars |
|---------|-------|
| CATALOG_MONTHLY_1000 | 100 ⭐ |
| SUBSCRIPTION_PLUS | 200 ⭐ |
| SUBSCRIPTION_PRO | 500 ⭐ |
| SUBSCRIPTION_BUSINESS | 1500 ⭐ |

---

## 6.5 — Отмена и управление подпиской ✅

**Что реализовано:**
- `apps/web/src/app/creator/subscription/page.tsx` — полная страница управления:
  - Текущий план с иконкой и цветом
  - Дата истечения и статус autoRenew
  - Лимиты плана (победители, приглашения, розыгрыши)
  - Кнопки "Повысить план" / "Сменить план" → открывает SubscriptionBottomSheet
  - Кнопка "Отменить подписку" с подтверждением
  - История платежей
- `apps/api/src/routes/products.ts` — `POST /subscriptions/change`:
  - Апгрейд/даунгрейд плана
  - Автоотмена текущего Entitlement
  - Создание нового платежа ЮKassa
- `apps/api/src/routes/products.ts` — `GET /users/me/entitlements`:
  - Список всех активных прав доступа
- `apps/api/src/scheduler/subscription-lifecycle.ts` — планировщик:
  - Уведомление за 3 дня до истечения (warningSentAt)
  - Авто-деактивация (revokedAt) после истечения
  - Уведомление в боте при деактивации
- `apps/api/src/server.ts` — подключение scheduler (каждые 60 мин)
- DB: `Entitlement.warningSentAt` добавлено поле

---

## Файлы блока

### API
- `apps/api/src/routes/webhooks.ts` — ЮKassa webhook (IP + подпись + обработка)
- `apps/api/src/routes/payments.ts` — создание платежей, проверка статуса, история
- `apps/api/src/routes/products.ts` — продукты, подписки, смена плана, entitlements
- `apps/api/src/routes/catalog.ts` — каталог с participants>=100
- `apps/api/src/routes/internal.ts` — /internal/stars-payment
- `apps/api/src/scheduler/subscription-lifecycle.ts` — expiry scheduler
- `apps/api/src/config.ts` — YOOKASSA_WEBHOOK_SECRET

### Bot
- `apps/bot/src/handlers/payments.ts` — Stars: pre_checkout_query, successful_payment, /buy

### Web
- `apps/web/src/components/SubscriptionBottomSheet.tsx` — глобальный компонент
- `apps/web/src/app/creator/subscription/page.tsx` — страница управления
- `apps/web/src/app/catalog/page.tsx` — улучшен (фильтры, SubscriptionBottomSheet)
- `apps/web/src/lib/api.ts` — getCurrentSubscription, cancelSubscription, getMyEntitlements, changeSubscription, getPaymentHistory

### Database
- `packages/database/prisma/schema.prisma` — PurchaseProvider.STARS, Entitlement.warningSentAt
- `packages/database/prisma/seed.ts` — PLUS/PRO/BUSINESS продукты со Stars ценами
- `packages/database/prisma/migrations/20260223_.../migration.sql`

### i18n
- `apps/web/messages/ru.json` — subscription.*, creatorSubscription.*
- `apps/web/messages/en.json` — subscription.*, creatorSubscription.*
- `apps/web/messages/kk.json` — subscription.*, creatorSubscription.*

---

## Конфликты (устранены)

~~**[УСТРАНЁН]** Два webhook endpoint ЮKassa:~~
- ~~`POST /api/v1/webhooks/yookassa` (payments.ts) — логика без подписи~~
- ~~`POST /webhooks/yookassa` (webhooks.ts) — подпись без логики~~

**Решение:** Дублирующий endpoint удалён из `payments.ts`. Весь код перенесён в `webhooks.ts` с полной защитой.

---

## Зависимости

- **Блок 0:** Product/Purchase/Entitlement модели ✅
- **Блок 1 (бот):** Stars handlers, уведомления ✅  
- **Блок 2 (UI Kit):** BottomSheet компонент ✅
- **Блок 10 (API):** /payments/create, /payments/status ✅
- **Блок 17 (модерация):** catalogApproved флаг — зависимость сохраняется, TODO

---

## Как проверить (тестовый платёж)

### ЮKassa (тестовый режим)
1. Настроить `.env`:
   ```
   YOOKASSA_SHOP_ID=test_shop_id
   YOOKASSA_SECRET_KEY=test_live_xxxxx
   YOOKASSA_WEBHOOK_SECRET=webhook_secret
   YOOKASSA_RETURN_URL=http://localhost:3000/payments/return
   ```
2. Открыть мини-апп → `/catalog` → нажать "Получить доступ"
3. В ЮKassa тестовом режиме использовать карту `4111 1111 1111 1111`
4. Webhook будет вызван по `POST /webhooks/yookassa`
5. Entitlement создаётся автоматически
6. Уведомление приходит в бот

### Telegram Stars
1. В боте написать `/buy`
2. Выбрать продукт
3. Telegram покажет нативный checkout (работает только с реальными Stars)
4. После оплаты бот отправит подтверждение

### Подписка (управление)
1. Открыть `/creator/subscription` в мини-апп
2. Нажать "Повысить план" → выбрать тариф → оплатить
3. Тариф обновится, лимиты изменятся

---

## Настройка ЮKassa для production

1. В ЮKassa dashboard: Настройки → HTTP-уведомления
2. Добавить URL: `https://api.randombeast.ru/webhooks/yookassa`
3. Выбрать события: `payment.succeeded`, `payment.canceled`, `refund.succeeded`
4. Скопировать **Секретный ключ** → `YOOKASSA_WEBHOOK_SECRET`
5. Убедиться что IP ЮKassa разрешён (185.71.76.0/27, 185.71.77.0/27, 77.75.153.0/25)
6. Запустить `pnpm seed` для создания продуктов в БД
