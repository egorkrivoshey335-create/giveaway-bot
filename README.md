# RandomBeast — Рандомайзер | Конкурс бот

> Платформа для проведения честных розыгрышей в Telegram

## 🏗 Структура проекта

```
randombeast/
├── apps/
│   ├── api/          # Fastify REST API (порт 4000)
│   ├── bot/          # Grammy Telegram Bot (health: 4001)
│   ├── web/          # Next.js Mini App (порт 3000)
│   └── site/         # Next.js Marketing Site (порт 3001)
├── packages/
│   ├── shared/       # Общие типы и константы
│   └── config/       # Конфигурации ESLint, TypeScript, Prettier
├── docs/             # Документация проекта
└── docker-compose.yml
```

## 🚀 Быстрый старт

### Требования

- Node.js 20 LTS
- pnpm (установка: `npm install -g pnpm`)
- Docker Desktop

### Установка

```bash
# Клонировать репозиторий
git clone https://github.com/your-org/randombeast.git
cd randombeast

# Установить зависимости
pnpm install

# Скопировать переменные окружения
cp env.example .env
# Отредактировать .env и добавить BOT_TOKEN
```

### Запуск инфраструктуры

```bash
# Поднять PostgreSQL и Redis
pnpm docker:up

# Проверить статус
docker-compose ps
```

### Запуск в режиме разработки

```bash
# Запустить все приложения
pnpm dev
```

После запуска:
- Mini App: http://localhost:3000
- Marketing Site: http://localhost:3001
- API Health: http://localhost:4000/health
- Bot Health: http://localhost:4001/health

### Проверка работоспособности

```bash
# API
curl http://localhost:4000/health

# Bot health server
curl http://localhost:4001/health
```

## 📜 Скрипты

| Команда | Описание |
|---------|----------|
| `pnpm dev` | Запуск всех приложений в dev режиме |
| `pnpm build` | Сборка всех приложений |
| `pnpm lint` | Проверка кода ESLint |
| `pnpm typecheck` | Проверка типов TypeScript |
| `pnpm format` | Форматирование кода Prettier |
| `pnpm docker:up` | Запуск Docker контейнеров |
| `pnpm docker:down` | Остановка Docker контейнеров |
| `pnpm clean` | Очистка build артефактов |

## 📚 Документация

- [Архитектура](./docs/ARCHITECTURE.md)
- [Модель данных](./docs/DB_MODEL.md)
- [Безопасность](./docs/SECURITY.md)
- [Локализация](./docs/I18N.md)
- [Roadmap](./docs/ROADMAP.md)

## 🔧 Технологии

- **Monorepo**: Turborepo + pnpm
- **Backend API**: Fastify + Zod
- **Telegram Bot**: grammY
- **Web Apps**: Next.js 14 (App Router) + Tailwind CSS
- **Database**: PostgreSQL 16 + Prisma
- **Cache/Queue**: Redis 7 + BullMQ
- **Logging**: Pino

## 📝 Лицензия

MIT
