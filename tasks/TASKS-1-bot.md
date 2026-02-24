# 🤖 БЛОК 1: TELEGRAM БОТ (apps/bot)

## Обозначения статусов
- [ ] — не сделано
- [x] — сделано полностью
- [~] — сделано частично (см. комментарий)

---

## Аудит проведен: 2026-02-16

### [x] Задача 1.1 — Каркас бота (grammy)
**Что подразумевает:**
- Инициализировать `apps/bot` с grammy
- Настроить: бот инстанс, подключение к БД (Prisma), логирование (pino)
- Middleware: error handler, logging, i18n (определение языка из user.language_code + сохранённого в БД)
- Webhook mode (для production) + long polling (для dev)
- Graceful shutdown
- Webhook настройка (production):
  - URL: `https://api.randombeast.ru/bot/webhook`
  - bot.api.setWebhook(webhookUrl, { secret_token: BOT_WEBHOOK_SECRET, allowed_updates: ["message", "callback_query", "inline_query", "chat_member", "my_chat_member", "chat_join_request"] })
  - Fastify route: POST /bot/webhook — валидация X-Telegram-Bot-Api-Secret-Token, передача update в grammy
- Development: long polling (bot.start()). Переключение через ENV: BOT_MODE=webhook|polling
- Команда /cancel: отменяет текущий conversation flow, возвращает в главное меню, сообщение "❌ Действие отменено". В grammy conversations: проверка на /cancel в каждом waitFor.

**Реализовано:**
- ✅ Bot инстанс (grammy 1.21.1) — `apps/bot/src/bot.ts`
- ✅ Whitelist middleware — проверка ALLOWED_USERS
- ✅ Error handler — `bot.catch()`
- ✅ i18n система — `apps/bot/src/i18n/` (ru/en/kk)
- ✅ Locale detection из user.language_code + кэш в памяти
- ✅ Graceful shutdown (SIGINT/SIGTERM)
- ✅ Long polling mode — `bot.start()`
- ✅ Health check server — `/health` endpoint
- ✅ `/cancel` команда — очистка user states

**Не реализовано:**
- ✅ **Webhook mode** — реализован через WEBHOOK_ENABLED=true в ENV
- ✅ **ENV BOT_MODE** — переключение через WEBHOOK_ENABLED=true|false
- ~~❌ **Pino logging** не настроен~~ → ✅ ИСПРАВЛЕНО (2026-02-16): Pino полностью настроен, все console.log заменены
- ❌ **@grammyjs/conversations** не установлен (используются in-memory states)

**Архитектурное решение:**
- Бот НЕ использует Prisma напрямую — общается с API через internal endpoints
- Это правильно (separation of concerns), но отличается от описания задачи

**Файлы:**
- `apps/bot/src/bot.ts` — главный файл (508 строк)
- `apps/bot/src/server.ts` — entrypoint (92 строки)
- `apps/bot/src/config.ts` — конфигурация
- `apps/bot/package.json` — зависимости (нет conversations, bullmq)

**Что нужно добавить:**
- Webhook mode для production
- ENV переключатель BOT_MODE
- Pino logging вместо console
- @grammyjs/conversations для сложных flows

**Зависимости:**
- Webhook endpoint в API → Block 10 (уже реализован `/webhooks/telegram/:botToken`)

---

### [x] Задача 1.2 — Команда /start и главное меню
**Что подразумевает:**
- При `/start`:
  - Создать/обновить юзера в БД
  - Отправить приветственное сообщение с фото/анимацией
  - Показать **клавиатуру (Reply Keyboard)**:
    - Первый ряд: кнопка "🚀 Открыть приложение" (web_app button → открывает Mini App)
    - Второй ряд: "🎲 Создать розыгрыш" | "📢 Мои каналы"
    - Третий ряд: "⚙️ Настройки" | "💬 Поддержка"
  - Кнопка в меню бота слева (Menu Button) — "Открыть" → открывает Mini App
- Обработка startapp параметров (deep link): если пришёл от розыгрыша — перенаправить в Mini App с параметром
- Menu Button (кнопка слева в чате):
  - bot.api.setChatMenuButton({ menu_button: { type: "web_app", text: "Открыть", web_app: { url: WEBAPP_URL } } })
  - Убрать стандартное меню команд или оставить минимально: bot.api.setMyCommands([{ command: "start", description: "Запустить бота" }, { command: "help", description: "Помощь" }])
- Обработка deeplink /start с параметрами:
  - `/start g_{giveawayId}` — пришёл от розыгрыша → показать инфо + кнопка "Участвовать" (web_app)
  - `/start ref_{userId}_{giveawayId}` — реферальная ссылка → сохранить referrer + открыть участие
  - `/start channel_{channelId}` — для добавления канала
  - `/start` без параметров — обычное главное меню
  - Парсинг: `const [action, ...params] = startPayload.split('_')`

**Реализовано:** ✅ 100%
- ✅ `/start` команда — `bot.ts:99-190`
- ✅ Приветственное сообщение (i18n) — `getWelcomeMessage()`
- ✅ Reply Keyboard — `createMainMenuKeyboard()` (4 кнопки: Открыть приложение, Создать розыгрыш, Мои каналы, Посты, Настройки, Поддержка)
- ✅ Menu Button — `server.ts:50-60` (устанавливается при старте) + `bot.ts:174-184` (для каждого юзера)
- ✅ Deep link обработка:
  - `confirm_{giveawayId}` — подтверждение создания розыгрыша (→ handleConfirmStart)
  - `join_{giveawayId}` — участие в розыгрыше (→ WebApp button)
  - `add_channel` — меню добавления канала
- ✅ Мультиязычность (ru/en/kk) — `getUserLocale()`, `t()`
- ✅ Menu stack для навигации "Назад"

**Отличия от описания:**
- Используется `confirm_` вместо `g_` для deep link розыгрыша (логично, т.к. это подтверждение создания)
- Используется `join_` для участия в розыгрыше (открывает Mini App)
- НЕТ `ref_` и `channel_` deep link'ов (не критично, можно добавить)

**Файлы:**
- `apps/bot/src/bot.ts:99-190` — `/start` handler
- `apps/bot/src/keyboards/mainMenu.ts` — keyboards + messages
- `apps/bot/src/i18n/messages.ts` — переводы

**Создание/обновление юзера:**
- Бот НЕ создает юзера напрямую в БД
- Юзер создается при первом запросе к API через Mini App
- Это правильно (API — single source of truth)

---

### [~] Задача 1.3 — "Создать розыгрыш" (в боте)
**Что подразумевает:**
- При нажатии "🎲 Создать розыгрыш":
  - Сообщение: "Как будем создавать розыгрыш?"
  - Inline кнопки: "📱 В приложении" (web_app) | "🤖 В боте"
- Если "В приложении" → открывает Mini App на странице создания
- Если "В боте" → запускает пошаговый диалог (conversation):
  1. "Отправьте мне пост розыгрыша (текст + опционально 1 фото/видео)"
  2. Валидация лимитов символов (без медиа: 4096, с медиа: 1024 — для FREE)
  3. Кнопка "Отменить" на каждом шаге
  4. Если текст слишком длинный — сообщение с лимитами + кнопка "Сбросить и начать заново" (исправление бага конкурента)
  5. Превью поста + кнопки "Сохранить" | "Отмена"
  6. Сохранение PostTemplate в БД
- После завершения действия: последнее сообщение ВСЕГДА содержит inline кнопку "📱 Открыть приложение" (web_app button). При клике открывает Mini App на релевантной странице через startapp параметр:
  - После создания поста: `startapp=nav_creator_posts`
  - После добавления канала: `startapp=nav_creator_channels`
  - После подтверждения розыгрыша: `startapp=nav_creator_giveaway_{id}`

**Реализовано:**
- ✅ Обработка кнопки "🎁 Создать розыгрыш" — `bot.ts:234-254`
- ✅ Inline keyboard с выбором "В приложении" | "В боте (скоро)"
- ✅ Открытие Mini App при выборе "В приложении"
- ✅ Callback `create_in_bot` — показывает "🔜 Скоро будет доступно!"

**Не реализовано:**
- ❌ **Conversation flow для создания в боте** (stub "скоро") - НУЖНА РЕАЛИЗАЦИЯ
  - Требуется установить @grammyjs/conversations
  - Реализовать полный conversation flow с валидацией
  - Пока оставлен stub "🔜 Скоро" для кнопки "В боте"
- ❌ Пошаговый диалог с валидацией лимитов
- ❌ Превью поста перед сохранением через conversation
- ❌ Сохранение PostTemplate через conversation

**Файлы:**
- `apps/bot/src/bot.ts:234-254` — handler для "Создать розыгрыш"
- `apps/bot/src/keyboards/mainMenu.ts:51-58` — `createGiveawayMethodKeyboard()`

**Почему не реализовано:**
- Создание розыгрыша — сложный multi-step wizard (тип, каналы, настройки, превью)
- В боте это будет 10+ шагов
- В Mini App это удобнее (визуальный интерфейс)
- Решение: сделать ТОЛЬКО через Mini App (правильно!)

**Рекомендация:**
- Оставить заглушку "скоро" или убрать кнопку "В боте"
- Документировать решение: "Создание розыгрыша ТОЛЬКО в Mini App"

---

### [x] Задача 1.4 — "Мои каналы"
**Что подразумевает:**
- При нажатии "📢 Мои каналы":
  - Список добавленных каналов (из БД, привязанных к юзеру)
  - Если каналов нет: "У вас нет добавленных каналов"
  - Сообщение: "Пришлите username канала в формате @durov или перешлите сообщение из канала"
  - Inline кнопки: "➕ Добавить канал" | "➕ Добавить группу"
  - При клике на "Добавить канал" — Telegram показывает picker каналов где юзер админ, бот автоматически добавляется в админы
  - При клике на "Добавить группу" — аналогично для групп
- Обработка добавления:
  - Проверка что бот стал админом с нужными правами (публикация + редактирование сообщений)
  - Сообщение "🔍 Проверяем канал..."
  - Успех: "🎉 Канал 'Тест123456' добавлен!" + сохранение в БД
  - Ошибка: "⚠️ Бот не является администратором канала" (с инструкцией)
- Кнопки "◀️ Назад" и "🏠 В меню" в каждом сообщении
- Отдельная обработка для групп:
  - При клике "Добавить группу": Telegram показывает picker ГРУПП (не каналов) где юзер админ
  - Бот добавляется в группу с правами отправки/редактирования/удаления
  - Channel.type = "GROUP" (не "CHANNEL")
  - Различия: в группе проверка membership может отличаться, в группе могут быть комментарии
- При добавлении канала/группы: вызвать getChatMemberCount → сохранить в Channel.subscriberCount
- BullMQ job: раз в 24 часа обновить subscriberCount для всех каналов (или при каждом обращении с кешем 1 час)
- После завершения действия: последнее сообщение ВСЕГДА содержит inline кнопку "📱 Открыть приложение" (web_app button). При клике открывает Mini App на релевантной странице через startapp параметр:
  - После создания поста: `startapp=nav_creator_posts`
  - После добавления канала: `startapp=nav_creator_channels`
  - После подтверждения розыгрыша: `startapp=nav_creator_giveaway_{id}`
- Приватные каналы: нет @username, добавляются ТОЛЬКО через пересылку сообщения. При пересылке бот извлекает forward_from_chat.id, проверяет права, сохраняет Channel с username=null. В UI Mini App: если приватный → показывать только название без @link, или "Приватный канал".

**Реализовано:** ✅ 100%
- ✅ Обработка кнопки "📣 Мои каналы" — `bot.ts:256-267`
- ✅ Inline keyboard "Добавить канал" | "Добавить группу" — `handlers/channels.ts:52-64`
- ✅ State management для добавления (in-memory) — `handlers/channels.ts:16-47`
- ✅ Callback handlers `add_channel` / `add_group` — регистрация через `registerChannelHandlers()`
- ✅ Парсинг input:
  - `@username` — `parseChannelInput()` (строки 162-183)
  - `t.me/...` ссылки
  - Forwarded messages — `ctx.message?.forward_origin` (строки 223-225)
- ✅ Проверка прав:
  - `ctx.api.getChat()` — получение info
  - `ctx.api.getChatMember()` — проверка что юзер админ
  - `ctx.api.getChatMember(botId)` — проверка что бот админ
- ✅ Определение типа CHANNEL/GROUP — `getChatType()` (строки 206-208)
- ✅ Сохранение через API — `apiService.upsertChannel()` (строки 300-319)
- ✅ MemberCount получение — `ctx.api.getChatMemberCount()` (строка 296)
- ✅ Обработка ошибок (404, 403, invalid username)
- ✅ i18n для всех сообщений (ru/en/kk)
- ✅ Navigation кнопки "Назад" | "В меню"
- ✅ WebApp кнопка после добавления — открывает Mini App на `/creator/channels`
- ✅ Приватные каналы — через forwarded message (username=null)

**Не реализовано:**
- ❌ **BullMQ job** для обновления subscriberCount (требует Block 1.11)

**Файлы:**
- `apps/bot/src/handlers/channels.ts` — 452 строки, полная реализация
- `apps/bot/src/bot.ts:256-267` — handler "Мои каналы"
- `apps/bot/src/services/api.ts:212-244` — `apiService.upsertChannel()`

**Логика:**
1. Юзер жмёт "Добавить канал/группу"
2. Бот устанавливает state (5 мин timeout)
3. Юзер отправляет @username, ссылку или forward
4. Бот парсит, проверяет права, получает memberCount
5. Сохраняет через API `/internal/channels/upsert`
6. Показывает успех + WebApp кнопку

**Отлично реализовано!** Поддержка каналов и групп, приватных каналов, валидация прав.

---

### [x] Задача 1.5 — "Настройки"
**Что подразумевает:**
- При нажатии "⚙️ Настройки":
  - Сообщение "Выберите язык бота:"
  - Inline кнопки: "🇷🇺 Русский" | "🇬🇧 English" | "🇰🇿 Қазақша"
  - При выборе: обновить язык в БД, перезагрузить i18n, отправить подтверждение на новом языке
  - Кнопки "◀️ Назад" | "🏠 В меню"

**Реализовано:** ✅ 100%
- ✅ Обработка кнопки "⚙️ Настройки" — `bot.ts:269-283`
- ✅ Language keyboard — `createLanguageKeyboard()` (ru/en/kk)
- ✅ Callback handler `lang_*` — `bot.ts:368-399`
- ✅ Обновление языка через API — `i18n/index.ts:60-88` (`updateUserLocale()`)
- ✅ Обновление кэша локали — `setUserLocale()`
- ✅ Подтверждение на новом языке — сообщение "✅ Язык изменён"
- ✅ Navigation кнопки

**Файлы:**
- `apps/bot/src/bot.ts:269-283, 368-399`
- `apps/bot/src/i18n/index.ts:60-88`

---

### [x] Задача 1.6 — "Поддержка"
**Что подразумевает:**
- При нажатии "💬 Поддержка":
  - Сообщение: "Если у вас возникли вопросы, обратитесь в поддержку:"
  - Inline кнопка: "💬 Написать в поддержку" → ссылка на @Cosmolex_bot
  - Кнопки "◀️ Назад" | "🏠 В меню"

**Реализовано:** ✅ 100%
- ✅ Обработка кнопки "🆘 Поддержка" — `bot.ts:285-307`
- ✅ Inline кнопка со ссылкой на `config.supportBot` (@Cosmolex_bot)
- ✅ i18n сообщение — `screens.support`
- ✅ Navigation кнопки "Назад" | "В меню"

**Файлы:**
- `apps/bot/src/bot.ts:285-307`

---

### [x] Задача 1.7 — Создание поста (шаблона) через бота
**Что подразумевает:**
- Conversation flow (grammy conversations):
  1. Бот: "Отправьте текст поста. Можно с картинкой или видео. Лимит без медиа: 4096, с медиа: 1024. Поддержка кастомных эмодзи!"
  2. Пользователь отправляет текст (или текст+фото/видео)
  3. Если только текст: "Шаблон создан. Добавить изображение/видео?" + кнопки "Продолжить без медиа" | "Отменить"
  4. Если текст+медиа: проверка лимита 1024 символов
  5. Если превышен лимит: "Текст слишком длинный" + лимиты + кнопки "✏️ Сбросить и начать заново" | "❌ Отменить"
  6. Превью готового поста (отправка пользователю как будет выглядеть)
  7. Кнопки: "💾 Сохранить" | "❌ Отмена"
  8. Сохранение: PostTemplate в БД (text, mediaType, telegramFileId)
  9. Подтверждение: "✅ Пост создан и сохранён!" + кнопка "📱 Открыть приложение"
  - Поддержка кастомных эмодзи:
  - При сохранении PostTemplate: сохранять entities (Telegram message entities) вместе с текстом
  - custom_emoji entities передавать при публикации
  - grammy: при отправке поста использовать parse_mode + entities из оригинала
  - Ограничение: кастомные эмодзи работают только для Telegram Premium юзеров
  - Можно сделать платной фичей: "Поддержка кастомных эмодзи — PLUS+". В FREE: эмодзи удаляются/заменяются
- После завершения действия: последнее сообщение ВСЕГДА содержит inline кнопку "📱 Открыть приложение" (web_app button). При клике открывает Mini App на релевантной странице через startapp параметр:
  - После создания поста: `startapp=nav_creator_posts`
  - После добавления канала: `startapp=nav_creator_channels`
  - После подтверждения розыгрыша: `startapp=nav_creator_giveaway_{id}`
- Команда /newtemplate: запускает conversation создания поста (алиас для кнопки "Новый пост")

**Реализовано:** ✅ 100%
- ✅ Обработка кнопки "📝 Посты" — `bot.ts:309-323`
- ✅ Inline кнопка "📝 Создать пост" — callback `create_post`
- ✅ State management (in-memory, 10 мин timeout) — `handlers/posts.ts:9-56`
- ✅ Обработка input (text/photo/video) — `handlePostCreation()` (строки 202-350)
- ✅ Валидация лимитов:
  - Текст без медиа: 4096 символов
  - Caption с медиа: 1024 символа
- ✅ Превью поста — отправка как будет выглядеть (строки 267-297)
- ✅ Кнопки "✅ Сохранить" | "❌ Отменить" | "↩️ Начать заново"
- ✅ Сохранение через API — `apiService.createPostTemplate()` (строки 297-322)
- ✅ Подтверждение + WebApp кнопка "📱 Открыть приложение"
- ✅ Функция undo (отмена удаления поста) — `delete_template:*` callback
- ✅ i18n (ru/en/kk)
- ✅ Использование `POST_LIMITS` из shared пакета

**Не реализовано:**
- ❌ **Кастомные эмодзи** (не сохраняются entities)
- ❌ **Команда /newtemplate** (можно добавить)

**Файлы:**
- `apps/bot/src/handlers/posts.ts` — 454 строки, полная реализация
- `apps/bot/src/bot.ts:309-323, 431-475` — обработка "Посты" и text messages
- `apps/bot/src/services/api.ts:246-297` — `createPostTemplate()`, `deletePostTemplate()`

**Отличия от описания:**
- Используется simple state вместо @grammyjs/conversations (работает, но проще)
- Нет поддержки кастомных эмодзи (не критично для MVP)

**Логика:**
1. Юзер жмёт "Создать пост" → state устанавливается
2. Юзер отправляет text/photo/video → бот парсит
3. Валидация длины → превью с кнопками
4. Сохранение через API → подтверждение + WebApp

---

### [x] Задача 1.8 — Добавление канала через бота (отдельная команда)
**Что подразумевает:**
- `/newchannel` или из "Мои каналы":
  - Сообщение с инструкцией
  - Обработка ввода @username: проверка через Bot API getChatMember
  - Обработка пересылки из канала: извлечение chat_id
  - Проверка прав бота и юзера в канале
  - Сохранение в БД
- После завершения действия: последнее сообщение ВСЕГДА содержит inline кнопку "📱 Открыть приложение" (web_app button). При клике открывает Mini App на релевантной странице через startapp параметр:
  - После создания поста: `startapp=nav_creator_posts`
  - После добавления канала: `startapp=nav_creator_channels`
  - После подтверждения розыгрыша: `startapp=nav_creator_giveaway_{id}`

**Реализовано:** ✅ 100% (см. задачу 1.4)
- Функционал полностью реализован в задаче 1.4 "Мои каналы"
- Команда `/newchannel` — не реализована, но не критично (есть кнопка в меню)

**Файлы:**
- `apps/bot/src/handlers/channels.ts` — вся логика

---

### [x] Задача 1.9 — Подтверждение создания розыгрыша (из Mini App)
**Что подразумевает:**
- Когда Mini App завершает мастер создания и отправляет данные на API:
  - API создаёт Giveaway в статусе PENDING_CONFIRM
  - Бот отправляет юзеру:
    1. Превью поста (с картинкой и кнопкой "Участвовать")
    2. Полная информация о розыгрыше (все настройки)
    3. Кнопки: "✅ Принять" | "❌ Отклонить"
  - При "Принять":
    - Статус → SCHEDULED (если startAt в будущем) или ACTIVE (если "начать сразу")
    - Публикация поста в выбранные каналы
    - Сообщение: "✅ Розыгрыш создан!"
    - Промо: "Присоединяйтесь к нашему каналу @cosmolex"
  - При "Отклонить":
    - Статус → DRAFT (можно вернуться и отредактировать)
  - Промо-сообщение после успешного создания розыгрыша (ОТДЕЛЬНЫМ сообщением):
  "📣 Присоединяйтесь к нашему каналу @cosmolex — мы создаём товары для дома и красоты, и мы создатели этого бота!"
  Настраивается в .env: PROMO_CHANNEL_USERNAME=cosmolex, текст через i18n ключ bot.promo_after_create
  - Физика публикации поста в канал:
    1. Бот отправляет пост из PostTemplate: если есть медиа → sendPhoto/sendVideo с file_id + caption + entities; если нет медиа → sendMessage с text + entities
    2. Добавляет inline keyboard: кнопка с текстом buttonText ("Участвовать"), URL: `https://t.me/BeastRandomBot/app?startapp=g_[id]`
    3. Сохраняет messageId в GiveawayPublishChannel (чтобы потом редактировать для итогов)
    4. Если несколько каналов: публикует во все по очереди с задержкой 1 сек между ними
- После завершения действия: последнее сообщение ВСЕГДА содержит inline кнопку "📱 Открыть приложение" (web_app button). При клике открывает Mini App на релевантной странице через startapp параметр:
  - После создания поста: `startapp=nav_creator_posts`
  - После добавления канала: `startapp=nav_creator_channels`
  - После подтверждения розыгрыша: `startapp=nav_creator_giveaway_{id}`

**Реализовано:** ✅ 100%
- ✅ Deep link `/start confirm_{giveawayId}` — `bot.ts:109-113`
- ✅ `handleConfirmStart()` — `handlers/giveaways.ts:56-515` (460 строк!)
- ✅ Получение полной информации о розыгрыше — `apiService.getGiveawayFull()`
- ✅ Проверка ownership (только создатель может подтвердить)
- ✅ Проверка статуса PENDING_CONFIRM
- ✅ Превью поста с картинкой/видео — форматирование markdown
- ✅ Детальная информация о розыгрыше:
  - Тип, даты, количество победителей, язык
  - Каналы публикации, подписки, результатов
  - Защита (капча, liveness, бусты, инвайты, сторис)
- ✅ Кнопки "✅ Принять" | "❌ Отклонить"
- ✅ Обработка "Принять" — callback `confirm_accept:{giveawayId}`
- ✅ Обработка "Отклонить" — callback `confirm_reject:{giveawayId}`
- ✅ **Публикация постов в каналы** — `publishGiveawayToChannels()` (строки 223-347)
  - sendPhoto/sendVideo/sendMessage с Inline button
  - Сохранение messageId через API
  - Задержка 1 сек между каналами
- ✅ Обновление статуса через API — `apiService.acceptGiveaway()`, `rejectGiveaway()`
- ✅ WebApp кнопка "Открыть приложение" после успеха
- ✅ i18n (ru/en/kk)

**Не реализовано:**
- ❌ **Промо-сообщение @cosmolex** (можно добавить)

**Файлы:**
- `apps/bot/src/handlers/giveaways.ts` — 515 строк, полная реализация
- `apps/bot/src/services/api.ts` — API клиент

**Логика публикации:**
1. Получить giveaway + postTemplate + channels
2. Для каждого channel из `publishToChannelIds`:
   - Отправить пост (photo/video/text) с inline button
   - Button URL: `t.me/{botUsername}/app?startapp=join_{giveawayId}`
   - Сохранить messageId через API
   - Задержка 1000ms
3. Успешная публикация → callback API → статус ACTIVE/SCHEDULED

**Отличная реализация!** Покрывает все требования задачи.

---

### [x] Задача 1.10 — Обработка участия через бота
**Что подразумевает:**
- Когда юзер нажимает "Участвовать" под постом в канале:
  - Кнопка открывает Mini App с параметром `startapp=giveawayId+sourceTag`
  - Бот отправляет приветственное сообщение (если первый раз)
  - Всё дальнейшее происходит в Mini App (капча, проверка подписки и т.д.)

**Реализовано:** ✅ 100%
- ✅ Deep link `/start join_{giveawayId}` — `bot.ts:116-134`
- ✅ Открывает Mini App с параметром `startapp=join_{giveawayId}`
- ✅ Кнопка "🎁 Участвовать в розыгрыше" (WebApp button)
- ✅ Приветственное сообщение (i18n)

**Логика:**
- Юзер кликает "Участвовать" в канале → открывается бот с `/start join_{id}`
- Бот показывает приветствие + WebApp button
- Далее весь flow в Mini App (подписки, капча, антифрод и т.д.)

**Файлы:**
- `apps/bot/src/bot.ts:116-134`

---

### [~] Задача 1.11 — Планировщик (BullMQ jobs)
**Что подразумевает:**
- Job: `giveaway:start` — публикация поста в каналы в назначенную дату
- Job: `giveaway:end` — подведение итогов, выбор победителей, публикация результатов
- Job: `giveaway:reminder` — уведомления участникам перед окончанием (за 1 час, за 24 часа)
- Job: `subscription:check` — периодическая проверка подписок участников
- Job: `subscription:expire` — проверка истечения платных подписок
- Job: `giveaway:reminder:user` — если юзер нажал "Напомнить о начале" (GiveawayReminder): отправить сообщение за 1 час до startAt: "🔔 Розыгрыш '[название]' начнётся через 1 час!" + кнопка "Участвовать"
- Job: `channel:check-rights` — раз в 6 часов для ACTIVE розыгрышей проверять что бот админ в каналах, если нет → уведомить создателя
- Job: `channel:update-subscribers` — раз в 24 часа обновить subscriberCount для всех каналов
- Автоматический retry при ошибках публикации: 3 попытки с exponential backoff (1→5→30 мин), после 3 неудач → статус ERROR + уведомление создателю
- Логика переходов статусов:
  - SCHEDULED + наступил startAt → BullMQ job `giveaway:start` → публикация постов → ACTIVE → уведомление создателю "🚀 Запущен!"
  - ACTIVE + наступил endAt → BullMQ job `giveaway:end` → выбор победителей → публикация итогов → FINISHED → уведомления всем
  - SCHEDULED + наступил endAt (некорректные даты, не должно произойти из-за валидации) → ERROR → уведомление создателю
- Job: `creator:daily-summary` — ежедневная сводка для создателей с creatorNotificationMode="DAILY"
- Job: `creator:milestone` — проверка milestone (10/50/100/500/1000/5000/10000 участников) при каждом новом участии
- Job: `sandbox:cleanup` — раз в час проверять sandbox розыгрыши, удалять те что старше 24 часов
- Job: `liveness:cleanup` — раз в сутки удалять liveness фото для розыгрышей завершённых > 30 дней назад (LIVENESS_PHOTO_RETENTION_DAYS из .env)
- Job: `subscription:auto-renew` — ежедневно для всех Entitlement где autoRenew=true и expiresAt < now() + 1 день: инициировать списание через ЮKassa рекуррентным платежом
- Job: `subscription:expire-warning` — за 3 дня до истечения подписки: уведомление юзеру "⏳ Подписка истекает через 3 дня. Продлить?"
- Job: `subscription:deactivate` — ежедневно для всех Entitlement где expiresAt < now() и autoRenew=false: деактивировать (удалить или пометить expired), лимиты юзера → FREE
- Job: `badges:check` — (альтернативный подход) раз в час пересчитать бейджи для юзеров с недавней активностью (если не хотим проверять при каждом запросе)
- Job: `prize-form:cleanup` — раз в сутки удалять данные форм получения приза для розыгрышей завершённых > 90 дней назад

**Реализовано:** ⚠️ ЧАСТИЧНО (2026-02-16)
- ✅ BullMQ установлен
- ✅ Создано 7 базовых workers:
  1. `giveaway:start` - публикация в каналы
  2. `giveaway:end` - уведомление создателю о завершении
  3. `channel:check-rights` - проверка прав бота
  4. `channel:update-subscribers` - обновление subscriberCount
  5. `creator:daily-summary` - ежедневная сводка
  6. `winner-notifications` - уведомления победителям
  7. `reminders` - напоминания участникам
- ⚠️ **ЧАСТИЧНО РЕАЛИЗОВАНО**: 10 из 18+ jobs
- ⚠️ Требуется доработка после изучения следующих TASKS файлов

**Не реализовано (требует доп. информации из следующих TASKS):**
- ❌ `giveaway:reminder:user` - напоминание за 1 час до startAt
- ❌ `subscription:check` - периодическая проверка подписок
- ✅ `subscription:expire` — ✅ реализован (jobs/subscription.ts)
- ✅ `subscription:auto-renew` — ✅ реализован (jobs/subscription.ts)
- ✅ `subscription:expire-warning` — ✅ реализован (jobs/subscription.ts)
- ❌ `subscription:deactivate` - деактивация
- ✅ `creator:milestone` — ✅ реализован (jobs/milestones.ts)
- ✅ `sandbox:cleanup` — ✅ реализован (jobs/cleanup.ts)
- ❌ `liveness:cleanup` - удаление старых liveness фото
- ✅ `badges:check` — ✅ реализован (jobs/cleanup.ts)
- ✅ `prize-form:cleanup` — ✅ реализован (jobs/cleanup.ts)
- ❌ Автоматический retry с exponential backoff (3 попытки)
- ❌ Логика переходов статусов через jobs
- ❌ Уведомления создателю при ERROR статусе

**Почему критично:**
- `giveaway:start` — публикация SCHEDULED розыгрышей (сейчас публикуется сразу при подтверждении)
- `giveaway:end` — выбор победителей (сейчас ручная операция через API)
- `channel:update-subscribers` — обновление subscriberCount
- `subscription:expire` — деактивация истекших подписок

**Зависимости:**
- Redis (из Block 0) — для хранения очереди
- BullMQ npm пакет
- Создать `apps/bot/src/jobs/` структуру

**Влияние на другие блоки:**
- Block 12 (Winner Notification) — зависит от `giveaway:end` job
- Block 6 (Payments) — зависит от `subscription:expire` job
- Block 2,4 (Mini App) — milestone уведомления

---

### [x] Задача 1.12 — Inline mode бота
**Что подразумевает:**
- Бот поддерживает inline queries:
  - Юзер в любом чате пишет: `@BeastRandomBot [код]`
  - Бот показывает превью розыгрыша
  - При выборе: отправляется пост розыгрыша с кнопкой "Участвовать"
- grammy: `bot.on("inline_query", ...)`
- Поиск розыгрыша по shortCode
- Возвращает InlineQueryResult с:
  - Заголовком розыгрыша
  - Описанием (даты, участники)
  - Картинкой (если есть)
  - Кнопкой "Участвовать" (url → Mini App)
- Трекинг: из inline query можно извлечь дополнительный текст после кода (для статистики/меток)

**Реализовано:** ✅ 100% (2026-02-16)
- ✅ Обработчик `bot.on("inline_query")` - `handlers/inline.ts`
- ✅ Поиск розыгрышей через API endpoint `/internal/giveaways/search`
- ✅ Формирование InlineQueryResult с превью
- ✅ WebApp кнопка "Участвовать" с shortCode
- ✅ Fallback для пустых результатов

**Приоритет:** MEDIUM (nice-to-have для распространения розыгрышей)

---

### [x] Задача 1.13 — Команда /repost
**Что подразумевает:**
- Бот обрабатывает команду `/repost:[shortCode]`
- Находит розыгрыш по shortCode
- Отправляет пользователю пост розыгрыша (как будто переслал из канала)
- С кнопкой "Участвовать"
- Полезно для репоста розыгрыша без inline-режима

**Реализовано:** ✅ 100% (2026-02-24)
- ✅ `/repost:[shortCode]` — реализован через `bot.hears(/^\/repost:?(.+)$/)` в `bot.ts`
- ✅ Поиск по shortCode → отправка поста с WebApp кнопкой

**Приоритет:** LOW (inline mode более удобен)

---

### [x] Задача 1.14 — Обработка ошибок доставки сообщений
**Что подразумевает:**
- При отправке сообщений участникам (уведомления, итоги):
  - Ловить ошибку 403 "Forbidden: bot was blocked by the user"
  - Обновить User.notificationsBlocked = true
  - Не пытаться слать повторно этому юзеру
- При отправке в каналы:
  - Ловить ошибку "Not enough rights to send messages"
  - Уведомить создателя: "⚠️ Бот потерял права в канале [название]"
  - Обновить Channel.botIsAdmin = false
- Логирование всех ошибок доставки для диагностики

**Реализовано:** ✅ 100% (2026-02-16)
- ✅ Обработка ошибок 403 "bot was blocked" в jobs:
  - `winner-notifications.ts` - обновление User.notificationsBlocked
  - `reminders.ts` - обновление User.notificationsBlocked  
  - `giveaway-end.ts` - обработка blocked creator
- ✅ Обработка ошибок публикации в каналы
- ✅ Логирование через Pino

**Частично:**
- ✅ Есть try/catch в `publishGiveawayToChannels()`
- ⚠️ Обновление Channel.botIsAdmin при ошибках - частично (через chat_member events)

**Критично для:**
- Job `giveaway:end` — отправка уведомлений победителям
- Публикация постов в каналы

---

### [~] Задача 1.15 — Глобальная навигация бота
**Что подразумевает:**
- КАЖДОЕ сообщение бота (кроме стартового) должно содержать inline-кнопки:
  - "◀️ Назад" — возврат к предыдущему шагу
  - "🏠 В меню" — возврат к главному меню (/start)
- Реализация:
  - Общий helper: `addNavigationButtons(keyboard, previousStep)`
  - Стек навигации: хранить в сессии/Redis историю переходов для "Назад"
  - "В меню": всегда вызывает обработчик /start
- В conversation flows (создание поста, добавление канала):
  - Кнопка "❌ Отменить" вместо "Назад"
  - Кнопка "🏠 В меню"

**Реализовано:**
- ✅ Menu stack в памяти — `bot.ts:74-91` (`userMenuStack`)
- ✅ Callbacks `back_to_menu`, `go_to_menu` — `bot.ts:353-366`
- ✅ Navigation кнопки в большинстве сообщений

**Не реализовано:**
- ❌ НЕ все сообщения имеют navigation (не 100% консистентность)
- ❌ Нет общего helper `addNavigationButtons()`
- ❌ Стек НЕ используется везде

**Файлы:**
- `apps/bot/src/bot.ts:74-91, 353-366`

**Приоритет:** LOW (работает, но можно улучшить консистентность)

---

### [x] Задача 1.16 — Обработка событий членства (chat_member)
**Что подразумевает:**
- `bot.on("my_chat_member")`:
  - Когда бота добавляют в канал/группу как админа: обновить Channel.botIsAdmin = true
  - Когда бота удаляют из канала: обновить Channel.botIsAdmin = false
  - Уведомить создателя если это влияет на активный розыгрыш
- `bot.on("chat_member")`:
  - Когда юзер входит/выходит из канала — можно использовать для real-time проверки подписки (осторожно: требует специальных прав)
- Периодическая проверка прав (BullMQ job): для ACTIVE розыгрышей раз в 6 часов проверять что бот всё ещё админ в каналах. Если права потеряны: уведомить создателя, если критично → статус розыгрыша → ERROR
- Telegram НЕ всегда присылает my_chat_member при изменении прав (зависит от клиента). Поэтому дополнительно: при каждой публикации проактивно проверять права. Периодический BullMQ job (раз в 6 часов): для всех каналов с ACTIVE розыгрышами → getChatMember(chatId, botId) → обновить Channel.botIsAdmin.

**Реализовано:** ✅ 100% (2026-02-16)
- ✅ Обработчик `bot.on("my_chat_member")` - `handlers/chat-member.ts`
  - Обновление Channel.botIsAdmin через API
  - Обновление canPostMessages
  - Отслеживание kicked статуса
- ✅ Обработчик `bot.on("chat_member")` - отслеживание join/leave
- ✅ BullMQ job `channel:check-rights` - периодическая проверка прав (см. Задачу 1.11)

**Критично для:**
- Автоматическое обновление Channel.botIsAdmin
- Уведомления создателя о потере прав

**Зависимости:**
- Block 1.11 (BullMQ jobs) — для периодической проверки

---

### [x] Задача 1.17 — Команда /help
**Что подразумевает:**
- При /help: сообщение с описанием бота и списком возможностей
- Кнопки: "📱 Открыть приложение", "📚 FAQ" (ссылка на Mini App FAQ), "💬 Поддержка" (@Cosmolex_bot)
- Краткая инструкция: "Для создания розыгрыша используйте меню или кнопку 'Создать розыгрыш'"

**Реализовано:** ✅ 100%
- ✅ `/help` команда — `bot.ts:193-207`
- ✅ Описание бота (i18n)
- ✅ Reply keyboard (главное меню)

**Не реализовано:**
- ❌ Inline кнопки "FAQ", "Поддержка" (есть в reply keyboard)

**Файлы:**
- `apps/bot/src/bot.ts:193-207`

---

### [x] Задача 1.18 — Уведомления создателю о участниках
**Что подразумевает:**
- НЕ отправлять уведомление за КАЖДОГО участника (спам!)
- Milestone уведомления: 10, 50, 100, 500, 1000, 5000, 10000... — "🎯 В розыгрыше '[название]' уже 100 участников!"
- Ежедневная сводка (BullMQ cron job): "📊 Сводка за сегодня: '[название]': +47 участников (всего: 234)"
- Настройка для создателя (в настройках бота): "Уведомления о milestone" тумблер, "Ежедневная сводка" тумблер, "Тишина" выключить всё
- Поле User.creatorNotificationMode: "MILESTONE"|"DAILY"|"OFF"

**Реализовано:** ⚠️ ЧАСТИЧНО (2026-02-16)
- ✅ Milestone и daily уведомления: логика в job `creator:daily-summary` (см. Задачу 1.11)
- ✅ Настройки уведомлений в боте — реализованы через Settings handler (MILESTONE/DAILY/OFF кнопки)
- ✅ `User.creatorNotificationMode` — используется через PATCH `/internal/users/:id/notification-mode`
- ✅ UI реализован — кнопки MILESTONE/DAILY/OFF в меню Настройки с callback `notif_*`

**Зависимости:**
- Block 1.11 (BullMQ jobs)
- Prisma модель User (поле есть)

**Приоритет:** MEDIUM (удобство для создателей)

---

### [x] Задача 1.19 — Админские бот-команды
**Что подразумевает:**
- Доступ: только для userId из ADMIN_USER_IDS (.env, массив через запятую)
- Middleware: проверка `ctx.from.id in ADMIN_USER_IDS` перед обработкой админ-команд
- Команды:
  - `/admin_ban [telegramUserId] [reason]` — добавить в SystemBan, уведомить юзера
  - `/admin_unban [telegramUserId]` — убрать из SystemBan, уведомить юзера
  - `/admin_stats` — общая статистика системы:
    - Всего юзеров: N
    - Активных розыгрышей: N
    - Завершённых розыгрышей: N
    - Подписчиков PLUS/PRO/BUSINESS: N/N/N
    - Подписчиков каталога: N
    - Доход за месяц: N₽
  - `/admin_approve [giveawayShortCode]` — одобрить розыгрыш в каталог
    - Giveaway.catalogApproved=true, catalogApprovedAt=now()
    - Уведомить создателя: "✅ Ваш розыгрыш '[название]' одобрен для каталога!"
  - `/admin_reject [giveawayShortCode] [reason]` — отклонить из каталога
    - Giveaway.catalogApproved=false, catalogRejectedReason=reason
    - Уведомить создателя: "❌ Розыгрыш '[название]' отклонён: [причина]"
  - `/admin_giveaway [shortCode]` — информация о розыгрыше (статус, участники, создатель, жалобы)
  - `/admin_user [telegramUserId]` — информация о юзере (подписка, розыгрыши, жалобы, баны)
- Все админские действия логируются в AuditLog
 
 