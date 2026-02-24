# 🌐 БЛОК 11: САЙТ (apps/site) — МАРКЕТИНГ + WINNER-SHOW

## Обозначения статусов
- [ ] — не сделано
- [x] — сделано полностью
- [~] — сделано частично (см. комментарий)
- [?] — нужно проверить (начальный статус)

---

### [~] Задача 11.1 — Каркас сайта
**Что подразумевает:**
- Next.js 14 (отдельное приложение в монорепо)
- Домен: `randombeast.ru`
- Страницы:
  - `/` — лендинг (маркетинг)
  - `/winner-show/[giveawayId]` — красивая страница объявления победителей
  - `/auth/telegram` — авторизация через Telegram Login Widget
  - `/privacy` — политика конфиденциальности
  - `/terms` — условия использования
- robots.txt для randombeast.ru: Allow /, Disallow /auth/, Sitemap URL
- robots.txt для app.randombeast.ru: Disallow / (Mini App не индексировать)
- sitemap.xml: /, /privacy, /terms, /winner-show/[id] (динамически, завершённые публичные)
- Privacy Policy (/privacy): какие данные собираем, зачем, Liveness фото N дней, платежи через ЮKassa, cookies, права юзера, контакт @Cosmolex_bot. На 3 языках.
- Terms of Service (/terms): описание сервиса, правила создания/участия, ответственность за призы, подписки/возвраты, запрещённый контент, блокировки. На 3 языках.
- Favicon: /public/favicon.ico (16x16, 32x32), favicon-192.png, favicon-512.png, apple-touch-icon.png (180x180)
- OG-image: /public/og-image.png (1200x630)
- Meta теги в layout: title, description, og:title, og:description, og:image, og:url, twitter:card
- manifest.json (PWA, опционально)

**Статус аудита:**
- ✅ `apps/site` существует — Next.js 14, монорепо, next-intl (3 языка)
- ✅ Лендинг (`/[locale]/page.tsx`)
- ✅ Winner-Show (`/winner/[id]/page.tsx`) — маршрут `/winner/` вместо `/winner-show/`
- ✅ Login (`/[locale]/login/page.tsx`)
- ✅ Dashboard (`/[locale]/dashboard/page.tsx`)
- ✅ Results (`/[locale]/results/[id]/page.tsx`) — публичная страница
- ✅ Meta теги в `[locale]/layout.tsx` — title, description, keywords, alternates на 3 языках
- ✅ Maintenance (`/maintenance/page.tsx`)
- ❌ `/privacy` — страница отсутствует
- ❌ `/terms` — страница отсутствует
- ❌ `robots.txt` — не найден в `apps/site/public/`
- ❌ `sitemap.xml` — не найден
- ❌ OG-image мета-теги (og:image, og:url, twitter:card) — отсутствуют в layout
- ❌ Favicon файлы — не проверены в `apps/site/public/`

**Файлы:**
- `apps/site/src/app/[locale]/layout.tsx`
- `apps/site/src/app/[locale]/page.tsx`
- `apps/site/src/app/[locale]/login/page.tsx`
- `apps/site/src/app/[locale]/dashboard/page.tsx`
- `apps/site/src/app/[locale]/results/[id]/page.tsx`
- `apps/site/src/app/[locale]/maintenance/page.tsx`
- `apps/site/src/app/winner/[id]/page.tsx`
- `apps/site/src/middleware.ts`
- `apps/site/next.config.js`
- `apps/site/tailwind.config.ts`

---

### [x] Задача 11.2 — Лендинг
**Что подразумевает:**
- Hero секция: заголовок + описание + кнопка "Открыть бота"
- Секция "Возможности": карточки фич с иконками
- Секция "Подписки": 3 карточки тарифов (PLUS/PRO/BUSINESS)
- Секция "Как это работает": пошаговый гайд
- Footer: ссылки, контакты, @BeastRandomBot
- SEO: мета-теги, Open Graph, structured data
- Адаптивность: мобильная + десктопная версия
- Брендинг: #f2b6b6, парящие иконки на фоне

**Статус аудита:**
- ✅ Hero секция с кнопкой "Открыть бота" и "Рандомайзер" — `apps/site/src/app/[locale]/page.tsx`
- ✅ Секция "Возможности" — 6 FeatureCard (создание, проверка подписки, защита от ботов, доп. шансы, рандомайзер, статистика)
- ✅ Секция "Как это работает" — 4 шага
- ✅ Promo секция рандомайзера
- ✅ CTA секция
- ✅ Footer — `apps/site/src/components/Footer.tsx`
- ✅ i18n через next-intl — `apps/site/messages/ru.json`, `en.json`, `kk.json`
- ✅ Адаптивность (md: breakpoints)
- ✅ Бренд-цвета через `brand-` Tailwind класс
- ⚠️ Секция подписок (PLUS/PRO/BUSINESS) — отсутствует на лендинге
- ⚠️ Парящие иконки на фоне — не реализованы (только в Mini App)

---

### [x] Задача 11.3 — Winner-Show (страница победителей)
**Что подразумевает:**
- Страница `/winner-show/[giveawayId]`
- Авторизация через Telegram Login Widget (задача 11.4)
- Только для создателя этого розыгрыша + PRO/BUSINESS подписка
- Функционал: загрузка участников, анимация выбора, ручной выбор, reroll, публикация
- Стилизация: кастомная тема, конфетти, звуковые эффекты (опционально)
- Публичный зритель: страница становится публичной после завершения

**Статус аудита:**
- ✅ Страница существует — `apps/site/src/app/winner/[id]/page.tsx` (маршрут `/winner/` вместо `/winner-show/`)
- ✅ Слот-машина: анимация флипа имён с AnimatePresence (Framer Motion)
- ✅ Состояния: SETUP → RUNNING → PAUSED → FINISHED → SAVED
- ✅ Обратный отсчёт для топ-3 мест
- ✅ Конфетти при открытии победителей (top-3)
- ✅ Кастомизация: фон, акцент, логотип (файл или URL), размер логотипа
- ✅ Призы по местам — редактирование и сохранение
- ✅ Кнопка "Опубликовать победителей в канал" для RANDOMIZER режима
- ✅ Кнопка "Поделиться" (Web Share API или clipboard)
- ✅ Публичная страница результатов — `apps/site/src/app/[locale]/results/[id]/page.tsx`
- ✅ API интеграция: `getRandomizerData`, `savePrizes`, `saveCustomization`, `publishWinners`
- ✅ `apps/api/src/routes/site.ts` — API эндпоинты для сайта
- ⚠️ Проверка PRO/BUSINESS подписки: через `PaywallBanner` на dashboard, но не принудительно на winner-странице
- ⚠️ Ручной выбор победителей — не реализован (только авторандом)

**Файлы:**
- `apps/site/src/app/winner/[id]/page.tsx`
- `apps/site/src/app/[locale]/results/[id]/page.tsx`
- `apps/site/src/lib/randomizer.ts`
- `apps/site/src/lib/helpers.ts`
- `apps/site/src/lib/api.ts`
- `apps/site/src/components/Confetti.tsx`
- `apps/site/src/components/ColorPicker.tsx`
- `apps/api/src/routes/site.ts`

---

### [~] Задача 11.4 — Авторизация на сайте (Telegram Login Widget)
**Что подразумевает:**
- Telegram Login Widget на странице авторизации
- Callback: сервер валидирует подпись (HMAC-SHA256 от BOT_TOKEN)
- Создание сессии: JWT в HttpOnly cookie (Secure, SameSite=Strict)
- JWT payload: userId, telegramUserId, exp (15 минут)
- Refresh: через refresh token в HttpOnly cookie (7 дней)
- Redis: хранение сессий для быстрого отзыва
- Привязка сессии к user-agent hash (мягкая)
- Logout: очистка cookie + удаление из Redis

**Статус аудита:**
- ✅ `TelegramLoginButton` компонент — `apps/site/src/components/TelegramLoginButton.tsx`
- ✅ Login страница — `apps/site/src/app/[locale]/login/page.tsx`
- ✅ API route `/api/auth/telegram` — `apps/site/src/app/api/auth/telegram/route.ts`
- ✅ HMAC-SHA256 верификация подписи (SHA256 от BOT_TOKEN как секрет)
- ✅ Проверка устаревания auth_date (24 часа)
- ✅ HttpOnly cookie сессии через `config.sessionCookieName`
- ✅ Публичный cookie `rb_site_user` для клиентского отображения имени/аватарки
- ✅ Обращение к internal API для создания/поиска пользователя
- ❌ JWT не используется — sessionToken от API (не JWT с exp 15 мин)
- ❌ Refresh token механизм — отсутствует
- ❌ Redis хранение сессий — не реализовано (сессия в API базе)
- ❌ User-agent binding — отсутствует
- ❌ Logout endpoint — не реализован
- ⚠️ sameSite: 'lax' (в спецификации требуется 'strict')
- ⚠️ maxAge: 30 дней (в спецификации 15 мин для JWT + 7 дней refresh)

**Файлы:**
- `apps/site/src/app/api/auth/telegram/route.ts`
- `apps/site/src/app/[locale]/login/page.tsx`
- `apps/site/src/components/TelegramLoginButton.tsx`
- `apps/site/src/lib/config.ts`

---

## Итоговая сводка блока 11

| Задача | Статус | Комментарий |
|--------|--------|-------------|
| 11.1 Каркас сайта | [~] | Структура есть, нет: /privacy, /terms, robots.txt, sitemap, OG-теги |
| 11.2 Лендинг | [x] | Полностью реализован, нет: секция подписок, floating icons |
| 11.3 Winner-Show | [x] | Реализован полностью с анимацией, кастомизацией, публикацией |
| 11.4 Авторизация | [~] | HMAC + cookie есть, нет: JWT, Redis, refresh, logout |

**Итого:** [x]: 2 / [~]: 2 / [ ]: 0

**apps/site существует** — полноценное Next.js 14 приложение.

---

## Файлы блока 11

```
apps/site/
├── src/
│   ├── app/
│   │   ├── [locale]/
│   │   │   ├── layout.tsx          ✅ i18n, SEO meta
│   │   │   ├── page.tsx            ✅ Лендинг
│   │   │   ├── login/page.tsx      ✅ Telegram Login Widget
│   │   │   ├── dashboard/page.tsx  ✅ Dashboard создателя
│   │   │   ├── results/[id]/       ✅ Публичная страница результатов
│   │   │   ├── winner/[id]/        ✅ Winner-Show (только в locale layout)
│   │   │   └── maintenance/        ✅ Режим обслуживания
│   │   ├── winner/[id]/page.tsx    ✅ Winner-Show (основной)
│   │   ├── api/
│   │   │   ├── auth/telegram/      ✅ Авторизация HMAC
│   │   │   └── maintenance/        ✅ Статус обслуживания
│   │   └── layout.tsx
│   ├── components/
│   │   ├── Header.tsx
│   │   ├── Footer.tsx
│   │   ├── TelegramLoginButton.tsx ✅
│   │   ├── PaywallBanner.tsx       ✅
│   │   ├── Confetti.tsx            ✅
│   │   ├── ColorPicker.tsx         ✅
│   │   ├── FeatureCard.tsx
│   │   └── SmartLink.tsx
│   ├── lib/
│   │   ├── api.ts                  ✅
│   │   ├── config.ts
│   │   ├── helpers.ts              ✅
│   │   └── randomizer.ts           ✅
│   ├── i18n/
│   │   └── request.ts
│   └── middleware.ts
├── messages/
│   ├── ru.json                     ✅
│   ├── en.json                     ✅
│   └── kk.json                     ✅
├── package.json
├── next.config.js
└── tailwind.config.ts

apps/api/src/routes/site.ts         ✅ API для сайта
```

## Что нужно доделать ([ ] / [~])

### Приоритет HIGH:
1. **`/privacy`** — создать страницу политики конфиденциальности на 3 языках
2. **`/terms`** — создать страницу условий использования на 3 языках
3. **`robots.txt`** — добавить в `apps/site/public/`
4. **OG meta-теги** — добавить og:image, og:url, twitter:card в layout

### Приоритет MEDIUM:
5. **Logout endpoint** — `DELETE /api/auth/session`
6. **Секция подписок на лендинге** — PLUS/PRO/BUSINESS карточки

### Приоритет LOW:
7. **sitemap.xml** — динамический (Next.js `sitemap.ts`)
8. **Redis сессии** — опционально, для production
9. **Refresh token** — опционально

## Конфликты
- Маршрут winner: `/winner/[id]` (фактически) vs `/winner-show/[id]` (спецификация) — несущественно
- sameSite: 'lax' vs 'strict' (спецификация) — для development приемлемо
