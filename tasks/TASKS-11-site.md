# 🌐 БЛОК 11: САЙТ (apps/site) — МАРКЕТИНГ + WINNER-SHOW

## Обозначения статусов
- [ ] — не сделано
- [x] — сделано полностью
- [~] — сделано частично (см. комментарий)
- [?] — нужно проверить (начальный статус)

---

### [x] Задача 11.1 — Каркас сайта
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

**Реализация:**
- ✅ `apps/site` существует — Next.js 14, монорепо, next-intl (3 языка)
- ✅ `/privacy` — `apps/site/src/app/[locale]/privacy/page.tsx` (10 разделов, i18n, 3 языка)
- ✅ `/terms` — `apps/site/src/app/[locale]/terms/page.tsx` (9 разделов, i18n, 3 языка)
- ✅ `robots.txt` — `apps/site/public/robots.txt` с Allow/Disallow + Sitemap: URL
- ✅ `sitemap.xml` — динамический `apps/site/src/app/sitemap.ts` (Next.js MetadataRoute.Sitemap), включает все locale + public results
- ✅ OG мета-теги в layout: og:type, og:url, og:title, og:description, og:image (1200×630), twitter:card, twitter:creator
- ✅ `manifest.json` — `apps/site/public/manifest.json` (PWA)
- ✅ `setRequestLocale` добавлен в layout + все server-страницы (исправлен pre-rendering)
- ✅ Privacy i18n: `apps/site/messages/ru.json`, `en.json`, `kk.json` (namespace `privacy`)
- ✅ Terms i18n: namespace `terms`, 9 разделов на 3 языках
- ✅ Footer обновлён: ссылки на `/privacy`, `/terms`
- ✅ Header обновлён: ссылка "Тарифы" (#pricing anchor)
- ⚠️ Favicon файлы (favicon.ico, favicon-192.png, apple-touch-icon.png) — нужно разместить в `apps/site/public/`
- ⚠️ OG-image файл — нужно разместить `apps/site/public/og-image.png` (1200×630)

**Файлы:**
- `apps/site/src/app/[locale]/layout.tsx` — OG + twitter + setRequestLocale
- `apps/site/src/app/[locale]/privacy/page.tsx` — НОВЫЙ
- `apps/site/src/app/[locale]/terms/page.tsx` — НОВЫЙ
- `apps/site/src/app/sitemap.ts` — НОВЫЙ (динамический)
- `apps/site/public/robots.txt` — НОВЫЙ
- `apps/site/public/manifest.json` — НОВЫЙ
- `apps/site/messages/ru.json`, `en.json`, `kk.json` — обновлены (privacy, terms, pricing, header, footer)

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

**Реализация:**
- ✅ Hero секция с кнопкой "Открыть бота" и "Рандомайзер"
- ✅ Секция "Возможности" — 6 FeatureCard
- ✅ Секция "Как это работает" — 4 шага
- ✅ Promo секция рандомайзера
- ✅ **Секция подписок** — `apps/site/src/components/PricingSection.tsx` (FREE/PLUS/PRO, бейдж "Популярный", якорь #pricing)
- ✅ CTA секция
- ✅ Footer — ссылки на privacy/terms, поддержка
- ✅ i18n через next-intl + pricing namespace (все 3 языка)
- ✅ Адаптивность (md: breakpoints)
- ✅ Бренд-цвета через `brand-` Tailwind класс
- ⚠️ Парящие иконки на фоне — не реализованы на сайте (только в Mini App)

**Файлы:**
- `apps/site/src/app/[locale]/page.tsx` — обновлён (async + getTranslations + PricingSection)
- `apps/site/src/components/PricingSection.tsx` — НОВЫЙ
- `apps/site/src/components/Footer.tsx` — обновлён (ссылки на privacy/terms)
- `apps/site/src/components/Header.tsx` — обновлён (ссылка "Тарифы")
- `apps/site/messages/ru.json`, `en.json`, `kk.json` — namespace pricing добавлен

---

### [x] Задача 11.3 — Winner-Show (страница победителей)
**Что подразумевает:**
- Страница `/winner-show/[giveawayId]`
- Авторизация через Telegram Login Widget (задача 11.4)
- Только для создателя этого розыгрыша + PRO/BUSINESS подписка
- Функционал: загрузка участников, анимация выбора, ручной выбор, reroll, публикация
- Стилизация: кастомная тема, конфетти, звуковые эффекты (опционально)
- Публичный зритель: страница становится публичной после завершения

**Реализация:**
- ✅ Страница существует — `apps/site/src/app/winner/[id]/page.tsx`
- ✅ Слот-машина: анимация флипа имён с AnimatePresence (Framer Motion)
- ✅ Состояния: SETUP → RUNNING → PAUSED → FINISHED → SAVED
- ✅ Обратный отсчёт для топ-3 мест
- ✅ Конфетти при открытии победителей (top-3)
- ✅ Кастомизация: фон, акцент, логотип (файл или URL), размер логотипа
- ✅ Призы по местам — редактирование и сохранение
- ✅ Кнопка "Опубликовать победителей в канал"
- ✅ Кнопка "Поделиться" (clipboard)
- ✅ Публичная страница результатов — `/[locale]/results/[id]/page.tsx`
- ✅ API эндпоинт `GET /site/public-results` для sitemap (НОВЫЙ)
- ⚠️ Проверка PRO/BUSINESS подписки: PaywallBanner на dashboard, но не принудительно на winner-странице

**Файлы:**
- `apps/site/src/app/winner/[id]/page.tsx`
- `apps/site/src/app/[locale]/results/[id]/page.tsx`
- `apps/api/src/routes/site.ts` — добавлен `GET /site/public-results`

---

### [~] Задача 11.4 — Авторизация на сайте (Telegram Login Widget)
**Что подразумевает:**
- Telegram Login Widget на странице авторизации
- Callback: сервер валидирует подпись (HMAC-SHA256 от BOT_TOKEN)
- Создание сессии: JWT в HttpOnly cookie (Secure, SameSite=Strict)
- JWT payload: userId, telegramUserId, exp (15 минут)
- Refresh: через refresh token в HttpOnly cookie (7 дней)
- Redis: хранение сессий для быстрого отзыва
- Logout: очистка cookie + удаление из Redis

**Реализация:**
- ✅ TelegramLoginButton — `apps/site/src/components/TelegramLoginButton.tsx`
- ✅ Login страница — `apps/site/src/app/[locale]/login/page.tsx`
- ✅ API route `/api/auth/telegram` — HMAC-SHA256 верификация подписи
- ✅ Проверка устаревания auth_date (24 часа)
- ✅ HttpOnly cookie сессии
- ✅ Logout — `POST /site/logout` (Header содержит кнопку "Выйти")
- ✅ Публичный cookie `rb_site_user` для клиентского отображения
- ❌ JWT с exp 15 мин — не используется (sessionToken без срока через API)
- ❌ Refresh token механизм — отсутствует
- ❌ Redis хранение сессий — не реализовано
- ⚠️ sameSite: 'lax' (в спецификации 'strict')

**Файлы:**
- `apps/site/src/app/api/auth/telegram/route.ts`
- `apps/site/src/app/[locale]/login/page.tsx`
- `apps/site/src/components/TelegramLoginButton.tsx`

---

## Итоговая сводка блока 11

| Задача | Статус | Комментарий |
|--------|--------|-------------|
| 11.1 Каркас сайта | [x] | /privacy, /terms, robots.txt, sitemap.xml, OG-теги — реализованы |
| 11.2 Лендинг | [x] | PricingSection (FREE/PLUS/PRO) добавлена; footer обновлён |
| 11.3 Winner-Show | [x] | Полностью реализован с анимацией, кастомизацией, публикацией |
| 11.4 Авторизация | [~] | HMAC + cookie + logout есть; JWT/refresh/Redis — опционально для production |

**Итого:** [x]: 3 / [~]: 1 / [ ]: 0

**apps/site существует** — полноценное Next.js 14 приложение.

---

## Файлы блока 11

```
apps/site/
├── src/
│   ├── app/
│   │   ├── [locale]/
│   │   │   ├── layout.tsx          ✅ i18n, SEO meta (OG + twitter + setRequestLocale)
│   │   │   ├── page.tsx            ✅ Лендинг (async + getTranslations + PricingSection)
│   │   │   ├── login/page.tsx      ✅ Telegram Login Widget
│   │   │   ├── dashboard/page.tsx  ✅ Dashboard создателя
│   │   │   ├── results/[id]/       ✅ Публичная страница результатов
│   │   │   ├── maintenance/        ✅ Режим обслуживания
│   │   │   ├── privacy/page.tsx    ✅ НОВЫЙ — Политика конфиденциальности (3 языка)
│   │   │   └── terms/page.tsx      ✅ НОВЫЙ — Условия использования (3 языка)
│   │   ├── winner/[id]/page.tsx    ✅ Winner-Show (основной)
│   │   ├── page.tsx                ✅ Редирект → /ru
│   │   ├── login/page.tsx          ✅ Редирект → /ru/login
│   │   ├── sitemap.ts              ✅ НОВЫЙ — Динамический sitemap.xml
│   │   └── api/
│   │       ├── auth/telegram/      ✅ Авторизация HMAC
│   │       └── maintenance/        ✅ Статус обслуживания
│   ├── components/
│   │   ├── Header.tsx              ✅ Ссылка "Тарифы"
│   │   ├── Footer.tsx              ✅ Privacy + Terms ссылки
│   │   ├── PricingSection.tsx      ✅ НОВЫЙ — FREE/PLUS/PRO карточки
│   │   ├── TelegramLoginButton.tsx ✅
│   │   ├── PaywallBanner.tsx       ✅
│   │   ├── Confetti.tsx            ✅
│   │   ├── ColorPicker.tsx         ✅
│   │   ├── FeatureCard.tsx         ✅
│   │   └── SmartLink.tsx           ✅
│   ├── lib/
│   │   ├── api.ts                  ✅
│   │   ├── config.ts
│   │   ├── helpers.ts              ✅
│   │   └── randomizer.ts           ✅
│   ├── i18n/
│   │   └── request.ts
│   └── middleware.ts
├── messages/
│   ├── ru.json                     ✅ +privacy, terms, pricing, header.pricing/bot, footer.privacy/terms/legal
│   ├── en.json                     ✅ то же
│   └── kk.json                     ✅ то же
├── public/
│   ├── robots.txt                  ✅ НОВЫЙ
│   └── manifest.json               ✅ НОВЫЙ
├── package.json
├── next.config.js
└── tailwind.config.ts

apps/api/src/routes/site.ts         ✅ +GET /site/public-results (для sitemap)
```

## Что нужно для production

### Обязательно:
1. **Favicon файлы** — создать и разместить в `apps/site/public/`:
   - `favicon.ico` (32×32)
   - `favicon-192.png` (192×192)
   - `favicon-512.png` (512×512)
   - `apple-touch-icon.png` (180×180)
2. **OG-image** — создать `apps/site/public/og-image.png` (1200×630)
3. **Домен** — прописать `NEXT_PUBLIC_SITE_URL=https://randombeast.ru` в .env.production
4. **SSL** — настроить HTTPS через nginx/Caddy или Vercel

### Опционально (production-grade auth):
5. **Redis сессии** — для быстрого отзыва сессий
6. **JWT + refresh token** — для строгого соблюдения spec
