# 🎨 БЛОК 9: ДИЗАЙН И АНИМАЦИИ

## Обозначения статусов
- [ ] — не сделано
- [x] — сделано полностью
- [~] — сделано частично (см. комментарий)
- [?] — нужно проверить (начальный статус)

---

### [?] Задача 9.1 — Дизайн-токены и тема
**Что подразумевает:**
- Tailwind конфиг с кастомными цветами:
  ```js
  colors: {
    brand: {
      50: '#fef2f2',
      100: '#fde6e6',
      200: '#f9c4c4',
      300: '#f2b6b6',   // primary (#f2b6b6)
      400: '#ec8f8f',
      500: '#e06666',
      600: '#d44040',
      700: '#b33030',
      800: '#922727',
      900: '#782222',
    }
  }
- Поддержка Telegram theme:
  - var(--tg-theme-bg-color) для фона
  - var(--tg-theme-text-color) для текста
  - var(--tg-theme-button-color) для кнопок
  - var(--tg-theme-secondary-bg-color) для карточек
  - Автоматическое переключение light/dark на основе Telegram темы
  - Шрифт: системный (как в Telegram) или Inter/Roboto
- Тёмная/светлая тема:
  - Определение: `Telegram.WebApp.colorScheme` → "light"|"dark"
  - CSS variables из Telegram: --tg-theme-bg-color, --tg-theme-text-color, --tg-theme-hint-color, --tg-theme-link-color, --tg-theme-button-color, --tg-theme-button-text-color, --tg-theme-secondary-bg-color, --tg-theme-header-bg-color, --tg-theme-section-bg-color, --tg-theme-accent-text-color, --tg-theme-destructive-text-color
  - Tailwind dark mode через class strategy: класс "dark" на `<html>` если colorScheme === "dark"
  - Brand цвет: light mode — #f2b6b6 как есть, dark mode — ярче (#e89999). Кнопки: контрастный текст

---

### [?] Задача 9.2 — Анимации переходов страниц
**Что подразумевает:**
- Framer Motion AnimatePresence для маршрутов
- Анимация входа: slide-in-right (при переходе вперёд)
- Анимация выхода: slide-out-left (при переходе назад)
- Длительность: 200-300ms, ease-in-out
- BottomSheet: анимация slide-up + fade overlay, spring animation
- Модалки: scale + fade
- Загрузка: skeleton shimmer эффект

---

### [?] Задача 9.3 — Загрузочный экран
**Что подразумевает:**
- При открытии Mini App: полноэкранный loading screen
- Анимированный логотип RandomBeast (Lottie или CSS)
- Прогресс-бар или пульсирующая анимация
- Минимальное время показа: 800ms (чтобы не мелькал)
- После загрузки: плавный fade-out → основной контент

---

### [?] Задача 9.4 — Анимированные стикеры (маскоты)
**Что подразумевает:**
- Компонент `LottiePlayer` для показа анимированных файлов в Mini App
- Формат: Lottie JSON (скачивать с lottiefiles.com)
- В Telegram Mini App нельзя использовать TG стикеры напрямую — только Lottie JSON

**Структура папки `apps/web/public/mascots/`:**

- **wizard/** — анимации для каждого этапа мастера создания:
  - `wizard-type.json` — выбор типа (поиск: "choose option", "select category", "menu selection")
  - `wizard-settings.json` — настройки (поиск: "settings gear", "configuration", "customize")
  - `wizard-channels.json` — каналы (поиск: "social media", "broadcast", "megaphone")
  - `wizard-publish.json` — публикация (поиск: "send message", "publish", "rocket launch")
  - `wizard-results.json` — итоги (поиск: "trophy", "podium", "results")
  - `wizard-calendar.json` — даты (поиск: "calendar date", "schedule", "date picker")
  - `wizard-winners.json` — победители (поиск: "trophy winner", "gold medal", "champion")
  - `wizard-boost.json` — бусты (поиск: "lightning bolt", "energy boost", "power up")
  - `wizard-invite.json` — приглашения (поиск: "invite friends", "add people", "team")
  - `wizard-stories.json` — сторис (поиск: "story share", "mobile phone share", "social share")
  - `wizard-protection.json` — защита (поиск: "security shield", "protection", "lock shield")
  - `wizard-mascot.json` — маскот (поиск: "cute character", "kawaii animal", "mascot wave")
  - `wizard-promotion.json` — продвижение (поиск: "marketing promotion", "advertising", "loudspeaker")
  - `wizard-tasks.json` — задания (поиск: "checklist", "task list", "todo list")
  - `wizard-review.json` — проверка (поиск: "document review", "checklist approve", "verify document")

- **states/** — анимации по состояниям:
  - `state-success.json` — успех (поиск: "success checkmark", "celebration", "confetti success")
  - `state-error.json` — ошибка (поиск: "error sad", "oops", "something went wrong")
  - `state-empty.json` — пусто (поиск: "empty box", "no data", "empty state")
  - `state-loading.json` — загрузка (поиск: "loading cute", "waiting", "hourglass")
  - `state-captcha.json` — капча (поиск: "robot check", "bot detection", "are you human")
  - `state-locked.json` — заблокировано (поиск: "locked premium", "padlock", "unlock feature")

- **participant/** — анимации для участника:
  - `participant-joined.json` — успешное участие (поиск: "party celebration", "congratulations", "hooray")
  - `participant-winner.json` — победа (поиск: "winner celebration", "gold trophy", "fireworks")
  - `participant-lost.json` — не выиграл (поиск: "better luck", "try again", "sad but hopeful")

- **characters/** — маскоты-персонажи для розыгрышей:
  - `mascot-free-default.json` — бесплатный (поиск: "cute cat wave", "friendly mascot", "happy character")
  - `mascot-paid-1.json` — платный собака (поиск: "cool dog", "sunglasses dog", "puppy dance")
  - `mascot-paid-2.json` — платный единорог (поиск: "unicorn", "magical unicorn", "rainbow unicorn")
  - `mascot-paid-3.json` — платный панда (поиск: "panda cute", "panda wave", "baby panda")
  - `mascot-paid-4.json` — платный лиса (поиск: "fox cute", "smart fox", "fox mascot")
  - `mascot-paid-5.json` — платный космонавт (поиск: "astronaut", "space cat", "cosmonaut cute")

- Маппинг маскотов: таблица Mascot в БД (id, name, fileName, isPaid, sortOrder) или массив в constants.ts
- Стикеры показываются:
  - На каждом этапе мастера создания
  - При успешном участии (конфетти + маскот)
  - При ошибке (грустный маскот)
  - В пустых состояниях
  - На загрузочном экране

---

### [?] Задача 9.5 — Фоновые парящие иконки
**Что подразумевает:**
- Декоративные иконки (те что сгенерируем) парят на фоне с parallax-эффектом
- CSS animation: медленное движение вверх/вниз + легкое вращение
- Opacity: 0.05-0.1 (чтобы не отвлекали)
- Рандомное расположение при каждой загрузке
- Можно выключить в настройках (если тормозит)
- Performance: transform + opacity только (GPU-ускорение), не более 10-15 элементов

---

### [?] Задача 9.6 — Кастомизация темы создателем (платная)
**Что подразумевает:**
- Доступно для PRO/BUSINESS подписки
- Настройки темы для розыгрыша:
  - Primary color — color picker
  - Background type: solid color / gradient preset (5-10 пресетов) / upload image
  - Logo — загрузка PNG/SVG (128x128, автообрезка)
  - Button style — rounded level (8px12px/16px), filled/outline
- При кастомной теме:
  - Брендовые иконки (variant="brand") заменяются на Lucide (variant="lucide")
  - Цвет Lucide иконок: автовыбор (белый/чёрный) на основе контрастности фона, или ручной выбор создателем
- Компонент AppIcon:
<AppIcon
  name="home"
  variant={theme.useCustom ? "lucide" : "brand"}
  color={theme.useCustom ? theme.iconColor : "auto"}
/>
- Превью: создатель видит как будет выглядеть розыгрыш с его темой
- Сохранение: GiveawayTheme в БД (primaryColor, bgType, bgValue, logoFileId, buttonRadius, iconVariant, iconColor)

---

### [?] Задача 9.7 — Иконки: структура, папка, интеграция
**Что подразумевает:**
- Создать папку `apps/web/public/icons/brand/` со структурой подпапок:
  - `navigation/` — icon-home, icon-back, icon-menu, icon-close, icon-settings, icon-support
  - `actions/` — icon-create, icon-edit, icon-delete, icon-share, icon-copy, icon-view, icon-save, icon-cancel
  - `giveaway/` — icon-giveaway, icon-winner, icon-participant, icon-ticket, icon-boost, icon-invite, icon-story, icon-calendar
  - `status/` — icon-active, icon-pending, icon-completed, icon-cancelled, icon-error, icon-success
  - `premium/` — icon-crown, icon-star, icon-diamond, icon-lock
  - `channels/` — icon-channel, icon-group, icon-add-channel, icon-subscribers
  - `protection/` — icon-captcha, icon-camera, icon-shield, icon-verify
  - `stats/` — icon-chart, icon-analytics, icon-export, icon-filter
  - `misc/` — icon-faq, icon-info, icon-language, icon-theme, icon-notification, icon-refresh
- Аналогичная папка для `apps/site/public/icons/brand/` (или symlink через packages)
- Установить `lucide-react` как fallback-библиотеку
- Создать маппинг icon-name → lucide-name:
  - icon-home→Home, icon-back→ArrowLeft, icon-menu→Menu, icon-close→X, icon-settings→Settings, icon-support→Headset
  - icon-create→Plus, icon-edit→Pencil, icon-delete→Trash2, icon-share→Share2, icon-copy→Copy, icon-view→Eye, icon-save→Bookmark, icon-cancel→Ban
  - icon-giveaway→Gift, icon-winner→Trophy, icon-participant→User, icon-ticket→Ticket, icon-boost→Zap, icon-invite→UserPlus, icon-story→Sparkles, icon-calendar→Calendar
  - icon-active→CircleCheck, icon-pending→Clock, icon-completed→CheckCircle2, icon-cancelled→XCircle, icon-error→AlertCircle, icon-success→CheckCircle
  - icon-crown→Crown, icon-star→Star, icon-diamond→Diamond, icon-lock→Lock
  - icon-channel→Radio, icon-group→Users, icon-add-channel→PlusCircle, icon-subscribers→Users
  - icon-captcha→ShieldCheck, icon-camera→Camera, icon-shield→Shield, icon-verify→BadgeCheck
  - icon-chart→BarChart3, icon-analytics→TrendingUp, icon-export→Download, icon-filter→Filter
  - icon-faq→HelpCircle, icon-info→Info, icon-language→Globe, icon-theme→Wand2, icon-notification→Bell, icon-refresh→RefreshCw
- Компонент `<AppIcon>`:
  - Props: name, variant ("brand"|"lucide"), color ("auto"|string), size (number)
  - Если variant="brand": рендерить SVG из `/icons/brand/[category]/[name].svg`
  - Если variant="lucide": рендерить из lucide-react с указанным цветом
  - Контекст темы: если создатель настроил кастомную тему → автоматически variant="lucide" + color=creatorTheme.iconColor
- Документация: `docs/ICONS.md` — список всех иконок, как добавлять новые

---

### [?] Задача 9.8 — Хранение медиа создателей (логотипы, фоны)
**Что подразумевает:**
- Папка на сервере: `/storage/uploads/themes/[userId]/` (logo.png, background.jpg)
- API endpoint: `POST /api/uploads/theme-asset`
  - Принимает multipart файл
  - Валидация: тип (png/jpg/svg), размер (< 2MB), размеры (лого: 128x128, фон: 1920x1080 max)
  - Автообрезка через `sharp` (Node.js библиотека)
  - Сохранение на диск + путь в БД (GiveawayTheme)
- В production: Nginx отдаёт статику из `/storage/uploads/` или отдельный поддомен `cdn.randombeast.ru`
- Безопасность:
  - Файлы не исполняемые
  - Content-Disposition: attachment
  - Рандомные имена файлов (uuid)
  - Проверка MIME type на сервере (не доверять расширению)

---

### [?] Задача 9.9 — Звуковые эффекты (опционально)
**Что подразумевает:**
- Тумблер в настройках: "Звуковые эффекты" (по умолчанию ВЫКЛЮЧЕНЫ)
- Звуки: успешное участие (ding), победа (фанфары), ошибка (boop), конфетти
- Реализация: Web Audio API или `<audio>` с preload
- Файлы: `/public/sounds/*.mp3` (маленькие, <50KB каждый)
- Хранение настройки: localStorage (не в БД)