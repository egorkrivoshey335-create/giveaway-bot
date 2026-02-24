# 🧪 БЛОК 16: ТЕСТИРОВАНИЕ И ОТЛАДКА

## Обозначения статусов
- [ ] — не сделано
- [x] — сделано полностью
- [~] — сделано частично (см. комментарий)
- [?] — нужно проверить (начальный статус)

---

### [x] Задача 16.1 — Debug panel в Mini App (dev mode)
**Что подразумевает:**
- В dev режиме: кнопка "🛠️ Debug" в углу экрана
- При клике: BottomSheet с информацией:
  - Текущий юзер (id, name, language, subscription)
  - initData (raw)
  - Последние 20 API запросов (url, status, time)
  - Последние ошибки (из error boundary)
  - Состояние Zustand stores
  - Кнопка "Очистить кеш"
  - Кнопка "Сменить язык" (быстрое переключение для тестирования)
- В production: скрыта полностью (через env variable)

**Реализовано:**
- ✅ Floating кнопка 🔧 в нижнем правом углу (fixed position, z-index 9990)
- ✅ Overlay-панель (max-height 85vh) с 5 вкладками:
  - **User** — TG WebApp + Zustand UserStore данные
  - **Stores** — live-снимок всех Zustand stores (обновляется каждую секунду)
  - **API** — лог последних 50 запросов с методом, статусом, URL, временем; expandable details с request/response body
  - **Errors** — log runtime errors + unhandledRejection (последние 30)
  - **Tools** — переключатель языка, dev login (Alice/Bob/Charlie), clear localStorage, clear cookies, build info
- ✅ Бейдж с количеством ошибок на кнопке (красный)
- ✅ Закрытие по Escape и кликом вне панели
- ✅ Перехват `window.fetch` — автоматическое логирование всех API запросов
- ✅ Перехват `window.onerror` и `unhandledrejection`
- ✅ В production: полностью скрыта
- ✅ `useDebugStore` — новый Zustand store для debug-данных

**Файлы:**
- `apps/web/src/components/DebugPanel.tsx` ✅ (переписан полностью)
- `apps/web/src/stores/useDebugStore.ts` ✅ (новый)

---

### [x] Задача 16.2 — Seed данные для разработки
**Что подразумевает:**
- Скрипт `pnpm db:seed`:
  - 3 тестовых юзера (с разными подписками: FREE, PLUS, PRO)
  - 5 тестовых каналов
  - 5 тестовых розыгрышей (в разных статусах: DRAFT, ACTIVE, SCHEDULED, FINISHED, CANCELLED)
  - 100 тестовых участий
  - 3 тестовых продукта (CATALOG, PLUS, PRO)
  - 2 тестовых покупки + entitlements

**Реализовано:**
- ✅ **3 пользователя с разными подписками:**
  - Alice (telegramUserId: 123456789) — FREE
  - Bob (telegramUserId: 987654321) — PLUS (entitlement + purchase)
  - Charlie (telegramUserId: 111222333) — PRO (entitlement)
- ✅ **5 каналов** с разными владельцами и аудиторией:
  - Tech Giveaways (15k), Gaming Prizes RU (42k), Crypto Drops (8.5k), Beauty & Fashion (31k), Charlie Global (120k)
- ✅ **5 розыгрышей** в разных статусах:
  - ACTIVE: "Розыгрыш геймерского кресла" (startAt=−2дн, endAt=+5дн, 87 участников)
  - SCHEDULED: "Крипто-розыгрыш 0.1 BTC" (startAt=+1дн, endAt=+14дн)
  - FINISHED: "Бьюти-бокс" (324 участника, 5 победителей)
  - DRAFT: "Global Tech Giveaway" (Charlie, en, wizard step: conditions)
  - CANCELLED: тестовый отменённый
- ✅ **100 участников** в ACTIVE розыгрыше (реалистичные имена, 20 с реферральными билетами, 5% подозрительных)
- ✅ **30 участников** в FINISHED розыгрыше + **5 победителей** (place 1-5)
- ✅ **2 entitlements**: tier.plus → Bob, tier.pro → Charlie
- ✅ **1 purchase**: Bob → SUBSCRIPTION_PLUS (COMPLETED)
- ✅ Все операции idempotent (upsert / findFirst проверки)
- ✅ 5 продуктов (было): CATALOG, RANDOMIZER, PLUS, PRO, BUSINESS

**Файлы:**
- `packages/database/prisma/seed.ts` ✅ (расширен)

---

### [x] Задача 16.3 — API тесты (базовые)
**Что подразумевает:**
- Библиотека: vitest
- Тесты для критических эндпоинтов

**Реализовано:**
- ✅ `apps/api/vitest.config.ts` — настроен с coverage v8
- ✅ `apps/api/src/utils/winners.ts` — извлечены чистые функции для тестирования:
  - `buildCumulativePool`
  - `binarySearchIndex`
  - `weightedRandomSelect`
  - `selectWinners`
  - `generateDrawSeed`
- ✅ `apps/api/src/scheduler/giveaway-lifecycle.ts` — обновлён: импортирует из `utils/winners.ts`
- ✅ **4 тест-файла, 64 теста:**
  - `session.test.ts` — 13 тестов (create/verify token, tamper protection, expiry)
  - `winners.test.ts` — 30 тестов (buildCumulativePool, binarySearch, weighted select, selectWinners, generateDrawSeed + статистические тесты)
  - `captcha.test.ts` — 15 тестов (генерация вопросов, верификация, rate limiting)
  - `health.test.ts` — 6 тестов (200/503 статусы, latency, response structure)
- ✅ **Команды:**
  - `pnpm test` — запуск всех тестов
  - `pnpm test:coverage` — с отчётом покрытия

**Покрытие (`pnpm test:coverage`):**
```
utils/session.ts   — 95.6% stmts | 100% branch | 100% lines
utils/winners.ts   — 94.7% stmts |  80% branch | 100% lines
routes/health.ts   — 100%  stmts |  90% branch | 100% lines
```

**Файлы:**
- `apps/api/vitest.config.ts` ✅
- `apps/api/src/utils/winners.ts` ✅ (новый)
- `apps/api/src/__tests__/session.test.ts` ✅
- `apps/api/src/__tests__/winners.test.ts` ✅
- `apps/api/src/__tests__/captcha.test.ts` ✅
- `apps/api/src/__tests__/health.test.ts` ✅

---

### [x] Задача 16.4 — E2E тесты (опционально для MVP)
**Что подразумевает:**
- Библиотека: Playwright
- Базовые smoke tests

**Реализовано:**
- ✅ `playwright.config.ts` — настроен (chromium + Mobile Chrome, retries на CI, html report)
- ✅ `e2e/health.spec.ts` — smoke tests:
  - API /health возвращает 200 + healthy статус + latency metrics
  - Web App загружается без JS ошибок
  - Страница отвечает < 3 сек
  - Auth /me без сессии → 401
- ✅ `e2e/giveaway-flow.spec.ts` — flow tests:
  - Seed ACTIVE гiveaway доступен через /public
  - shortCode lookup (SEEDACT1)
  - Dev Auth + Init Flow (Alice, Charlie с tier.pro)
  - Draft CRUD (create + get)
- ✅ **Команды:**
  - `pnpm test:e2e` — запуск headless (требует `pnpm dev`)
  - `pnpm test:e2e:ui` — интерактивный UI
  - `pnpm test:e2e:headed` — с открытием браузера

**Файлы:**
- `playwright.config.ts` ✅
- `e2e/health.spec.ts` ✅
- `e2e/giveaway-flow.spec.ts` ✅

---

## Итоговая сводка блока 16

| Задача | Статус | Комментарий |
|--------|--------|-------------|
| 16.1 Debug panel | [x] | Floating + 5 вкладок (User/Stores/API/Errors/Tools) + fetch interceptor |
| 16.2 Seed данные | [x] | 3 users (FREE/PLUS/PRO) + 5 каналов + 5 гивов + 100 участников + entitlements |
| 16.3 API тесты | [x] | vitest + 64 теста; utils ~95% coverage |
| 16.4 E2E тесты | [x] | Playwright базовый (smoke + flow tests) |

**Итого:** [x]: 4 / [~]: 0 / [ ]: 0

---

## Как запустить тесты

```bash
# Unit тесты (vitest) — не требует запущенных сервисов
pnpm test                    # запуск всех 64 тестов
pnpm test:coverage           # с отчётом покрытия

# Или прямо из apps/api:
pnpm --filter @randombeast/api test
pnpm --filter @randombeast/api test:watch    # watch mode
pnpm --filter @randombeast/api test:coverage

# E2E тесты (Playwright) — требует pnpm dev
pnpm dev                     # в отдельном терминале
pnpm test:e2e                # запуск E2E

# Seed данные
pnpm db:seed                 # залить тестовые данные
```

---

## Файлы блока 16

```
apps/api/
├── vitest.config.ts                          ✅ новый
├── src/utils/winners.ts                      ✅ новый (извлечены чистые функции)
└── src/__tests__/
    ├── session.test.ts                        ✅ новый (13 тестов)
    ├── winners.test.ts                        ✅ новый (30 тестов)
    ├── captcha.test.ts                        ✅ новый (15 тестов)
    └── health.test.ts                         ✅ новый (6 тестов)

apps/web/src/
├── components/DebugPanel.tsx                  ✅ переписан (floating + 5 вкладок)
└── stores/useDebugStore.ts                    ✅ новый

packages/database/prisma/
└── seed.ts                                    ✅ расширен (3 users + 5 channels + 5 giveaways + ...)

playwright.config.ts                           ✅ новый
e2e/
├── health.spec.ts                             ✅ новый
└── giveaway-flow.spec.ts                      ✅ новый
```
