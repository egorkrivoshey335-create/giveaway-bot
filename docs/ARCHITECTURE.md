# RandomBeast — Architecture Document

> **Version:** 0.1.0 (MVP Constitution)  
> **Last Updated:** 2026-01-22

---

## 1. Project Overview

**RandomBeast** — платформа для проведения розыгрышей в Telegram с поддержкой условий подписки, бустов, приглашений и кастомных заданий.

### 1.1 Naming & Domains

| Component | Value |
|-----------|-------|
| Bot Name | RandomBeast — Рандомайзер \| Конкурс бот |
| Bot Username | @BeastRandomBot |
| Marketing Site | randombeast.ru |
| Mini App | app.randombeast.ru |
| API | api.randombeast.ru |

---

## 2. Technology Stack

### 2.1 Monorepo Structure

```
/
├── apps/
│   ├── bot/              # Grammy Telegram Bot
│   ├── api/              # Fastify REST API
│   ├── web/              # Next.js 14 Mini App (app.randombeast.ru)
│   └── marketing/        # Next.js 14 Marketing Site (randombeast.ru)
├── packages/
│   ├── shared/           # Types, constants, i18n keys
│   ├── db/               # Prisma schema & client
│   ├── queue/            # BullMQ workers & jobs (skeleton)
│   └── ui/               # Shared React components
├── docs/                 # Project documentation
├── turbo.json
├── pnpm-workspace.yaml
└── package.json
```

### 2.2 Technology Choices

| Layer | Technology | Version | Notes |
|-------|------------|---------|-------|
| Monorepo | Turborepo + pnpm | latest | Caching, parallel builds |
| Backend API | Fastify | 4.x | Zod validation, TypeBox schemas |
| Telegram Bot | grammY | 1.x | TypeScript-first, middleware support |
| Web Apps | Next.js | 14+ | App Router, Server Components |
| Styling | Tailwind CSS | 3.x | + Framer Motion for animations |
| i18n (Web) | next-intl | 3.x | Namespaced translations |
| State (Client) | Zustand | 4.x | Lightweight, TypeScript-friendly |
| Database | PostgreSQL | 16 | Primary data store |
| ORM | Prisma | 5.x | Type-safe queries, migrations |
| Cache | Redis | 7 | Session cache, rate limiting |
| Queue | BullMQ | 5.x | Job scheduling, retries |
| Logging | Pino | 8.x | Structured JSON logs |
| Error Tracking | Sentry | TBD | Будет настроено позже |

---

## 3. Architecture Principles

### 3.1 Feature Development Flow

Любая фича реализуется в строгом порядке:

```
Types → DB Schema → API Endpoints → UI Components
```

1. **Types** — Описать интерфейсы/enum в `packages/shared`
2. **DB Schema** — Добавить модели в Prisma schema
3. **API** — Создать endpoints в Fastify
4. **UI** — Реализовать компоненты в Next.js/Bot

### 3.2 Media Strategy (MediaAdapter)

Для MVP медиа-файлы хранятся как Telegram `file_id`:

```typescript
interface MediaAdapter {
  sendMedia(chatId: number, media: MediaReference): Promise<Message>;
  handleMediaError(error: TelegramError, media: MediaReference): Promise<void>;
}

interface MediaReference {
  fileId: string;
  fileUniqueId: string;
  type: 'photo' | 'video';
  needsReupload: boolean;
}
```

**Стратегия отказоустойчивости:**
1. Попытка отправки через `file_id`
2. При ошибке `file_id expired/invalid` → установить `mediaNeedsReupload = true`
3. Уведомить владельца о необходимости перезагрузки медиа

### 3.3 Entitlements Model (Платный доступ)

Вместо прямой проверки "оплачен ли продукт X" используем модель прав доступа:

```typescript
// Пользователь имеет право, если:
const hasAccess = await entitlements.check(userId, 'catalog.access');

// Права создаются при:
// 1. Успешной оплате продукта
// 2. Промо-акции
// 3. Ручном назначении админом
```

### 3.4 Draft State Management

Черновики розыгрышей хранятся серверно:

- При создании — автосохранение каждые 30 сек + при уходе со страницы
- Черновик привязан к `userId` + `draftType`
- При возврате — предложение продолжить или начать заново
- Модалка при уходе: "Данные сохранены, продолжите позже"

---

## 4. API Design

### 4.1 REST API Structure

```
/api/v1
├── /auth
│   └── POST /telegram          # Validate TMA init data
├── /users
│   └── GET  /me                # Current user profile
├── /channels
│   ├── GET  /                  # List user's channels
│   ├── POST /                  # Add channel
│   └── GET  /:id/check         # Verify bot permissions
├── /giveaways
│   ├── GET  /                  # List user's giveaways
│   ├── POST /                  # Create giveaway
│   ├── GET  /:id               # Get giveaway details
│   ├── PATCH /:id              # Update giveaway
│   ├── POST /:id/publish       # Publish giveaway
│   └── POST /:id/finish        # Finish & draw winners
├── /participation
│   ├── POST /:giveawayId/join  # Join giveaway
│   └── GET  /:giveawayId/status # Check participation status
├── /drafts
│   ├── GET  /:type             # Get draft
│   └── PUT  /:type             # Save draft
└── /payments
    ├── POST /create            # Create payment (YooKassa)
    └── POST /webhook           # Payment webhook
```

### 4.2 Authentication

```typescript
// TMA Auth Header Format
Authorization: tma <init_data_raw>

// Validation via @telegram-apps/init-data-node
validate(initData, BOT_TOKEN, { expiresIn: 3600 });
```

---

## 5. Telegram API Limitations

### 5.1 Verified Capabilities

| Feature | API Method | Status | Notes |
|---------|-----------|--------|-------|
| Subscription check | `getChatMember` | ✅ Работает | Бот должен быть в канале |
| Boost check | `getUserChatBoosts` | ✅ Работает | Бот должен быть админом канала |
| Send media by file_id | `sendPhoto`, `sendVideo` | ✅ Работает | file_id может истечь |

### 5.2 Known Limitations

| Feature | Status | Workaround |
|---------|--------|------------|
| Stories verification | ❌ НЕ ДОСТУПНО | Нет API для проверки репостов в сторис |
| Invite tracking (точный) | ⚠️ Ограничено | Используем `startapp` параметр |
| Premium status check | ✅ Доступно | Поле `is_premium` в User объекте |

---

## 6. Error Handling & Logging

### 6.1 Error Codes

```typescript
enum ErrorCode {
  // Auth errors (1xxx)
  UNAUTHORIZED = 1001,
  INVALID_INIT_DATA = 1002,
  SESSION_EXPIRED = 1003,
  
  // Validation errors (2xxx)
  VALIDATION_ERROR = 2001,
  MISSING_REQUIRED_FIELD = 2002,
  
  // Business logic errors (3xxx)
  GIVEAWAY_NOT_FOUND = 3001,
  GIVEAWAY_NOT_ACTIVE = 3002,
  ALREADY_PARTICIPATED = 3003,
  CONDITIONS_NOT_MET = 3004,
  
  // External errors (4xxx)
  TELEGRAM_API_ERROR = 4001,
  PAYMENT_ERROR = 4002,
  
  // Internal errors (5xxx)
  INTERNAL_ERROR = 5001,
  DATABASE_ERROR = 5002,
}
```

### 6.2 Logging Format (Pino)

```typescript
logger.info({
  event: 'giveaway.created',
  userId: ctx.user.id,
  giveawayId: giveaway.id,
  data: { title: giveaway.title }
});
```

---

## 7. Deployment Architecture (Preview)

```
┌─────────────────────────────────────────────────────────┐
│                     Cloudflare CDN                       │
└─────────────────┬───────────────────┬───────────────────┘
                  │                   │
        ┌─────────▼─────────┐ ┌───────▼────────┐
        │   randombeast.ru  │ │ app.randombeast│
        │   (Marketing)     │ │   (Mini App)   │
        │   Next.js SSG     │ │   Next.js SSR  │
        └───────────────────┘ └────────┬───────┘
                                       │
                              ┌────────▼────────┐
                              │ api.randombeast │
                              │   Fastify API   │
                              └────────┬────────┘
                                       │
                    ┌──────────────────┼──────────────────┐
                    │                  │                  │
              ┌─────▼─────┐     ┌──────▼──────┐    ┌─────▼─────┐
              │PostgreSQL │     │    Redis    │    │  Bot Pod  │
              │    16     │     │      7      │    │  grammY   │
              └───────────┘     └─────────────┘    └───────────┘
```

---

## 8. Security Checklist

См. [SECURITY.md](./SECURITY.md) для полного описания.

- [ ] TMA init data validation на каждый запрос
- [ ] Rate limiting на API endpoints
- [ ] Input sanitization через Zod
- [ ] CORS whitelist для доменов
- [ ] Webhook signature verification (YooKassa)
- [ ] Audit log для критичных операций

---

## 9. References

- [grammY Documentation](https://grammy.dev/)
- [Telegram Mini Apps](https://core.telegram.org/bots/webapps)
- [Next.js 14 App Router](https://nextjs.org/docs)
- [Fastify Documentation](https://fastify.dev/)
- [Prisma Documentation](https://www.prisma.io/docs)
- [next-intl](https://next-intl-docs.vercel.app/)
