# RandomBeast — Database Model

> **Version:** 0.1.0 (MVP)  
> **Last Updated:** 2026-01-22

---

## 1. Entity Relationship Diagram (Conceptual)

```
┌──────────┐       ┌───────────┐       ┌────────────────┐
│   User   │───────│  Channel  │       │  PostTemplate  │
└────┬─────┘       └───────────┘       └────────────────┘
     │                                         │
     │ 1:N                                     │ 1:1
     │                                         ▼
     │         ┌────────────────────────────────────────┐
     │         │              Giveaway                   │
     │         │  ┌─────────────────────────────────┐   │
     │         │  │     GiveawayConditions          │   │
     │         │  └─────────────────────────────────┘   │
     │         │  ┌─────────────────────────────────┐   │
     │         │  │     GiveawayPublication         │   │
     │         │  └─────────────────────────────────┘   │
     │         └────────────────┬───────────────────────┘
     │                          │
     │                          │ N:M
     │                          ▼
     │                ┌─────────────────┐
     └────────────────│  Participation  │
                      └─────────────────┘

┌──────────┐       ┌───────────┐       ┌─────────────┐
│ Product  │───────│ Purchase  │───────│ Entitlement │
└──────────┘       └───────────┘       └─────────────┘
```

---

## 2. Core Entities

### 2.1 User

Пользователь системы (владелец розыгрыша или участник).

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | UUID | PK | Internal ID |
| telegramUserId | BigInt | UNIQUE, NOT NULL | Telegram user ID |
| username | String? | - | Telegram username (может меняться) |
| firstName | String | NOT NULL | Имя из Telegram |
| lastName | String? | - | Фамилия |
| languageCode | String | DEFAULT 'ru' | Язык интерфейса (ru/en/kk) |
| isPremium | Boolean | DEFAULT false | Telegram Premium статус |
| createdAt | DateTime | DEFAULT now() | - |
| updatedAt | DateTime | @updatedAt | - |

**Индексы:**
- `telegramUserId` — unique index

---

### 2.2 Channel

Канал/группа, добавленная пользователем.

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | UUID | PK | Internal ID |
| telegramChatId | BigInt | UNIQUE, NOT NULL | Telegram chat ID |
| username | String? | - | @username канала |
| title | String | NOT NULL | Название канала |
| type | Enum | NOT NULL | CHANNEL \| GROUP \| SUPERGROUP |
| addedByUserId | UUID | FK → User | Кто добавил канал |
| botIsAdmin | Boolean | DEFAULT false | Бот — администратор |
| creatorIsAdmin | Boolean | DEFAULT false | Владелец бота — админ канала |
| permissionsSnapshot | JSON? | - | Снапшот прав бота |
| memberCount | Int? | - | Количество подписчиков |
| lastCheckedAt | DateTime? | - | Последняя проверка прав |
| createdAt | DateTime | DEFAULT now() | - |
| updatedAt | DateTime | @updatedAt | - |

**Бизнес-правила:**
- Проверка `botIsAdmin` через `getChatMember(bot_id)`
- Проверка `creatorIsAdmin` через `getChatMember(user_id)`
- `permissionsSnapshot` обновляется при каждой проверке

---

### 2.3 PostTemplate

Шаблон поста для розыгрыша (текст + медиа).

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | UUID | PK | Internal ID |
| ownerUserId | UUID | FK → User | Владелец шаблона |
| name | String? | - | Название шаблона (для списка) |
| text | String | NOT NULL, max 4096 | Текст поста (Telegram Markdown) |
| mediaType | Enum | DEFAULT NONE | NONE \| PHOTO \| VIDEO |
| telegramFileId | String? | - | file_id для отправки |
| telegramFileUniqueId | String? | - | Уникальный ID файла |
| mediaNeedsReupload | Boolean | DEFAULT false | Требуется перезагрузка медиа |
| createdAt | DateTime | DEFAULT now() | - |
| updatedAt | DateTime | @updatedAt | - |
| deletedAt | DateTime? | - | Soft delete |

**Media Strategy:**
```
┌─────────────────────────────────────────────────────────┐
│                    Send Media Flow                       │
├─────────────────────────────────────────────────────────┤
│  1. Try sending with telegramFileId                     │
│  2. On success → done                                   │
│  3. On error (file_id invalid/expired):                 │
│     a. Set mediaNeedsReupload = true                    │
│     b. Notify owner: "Пожалуйста, загрузите медиа заново"│
│     c. Store flag for UI to show upload prompt          │
└─────────────────────────────────────────────────────────┘
```

**Soft Delete & Undo:**
- При удалении: `deletedAt = now()`
- В течение 5 минут: кнопка "Отменить удаление"
- После 5 минут: запись остаётся, но недоступна

---

### 2.4 Giveaway

Основная сущность розыгрыша.

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | UUID | PK | Internal ID |
| ownerUserId | UUID | FK → User | Организатор |
| title | String | NOT NULL, max 255 | Название розыгрыша |
| description | String? | max 2000 | Описание (для каталога) |
| language | String | DEFAULT 'ru' | Язык розыгрыша |
| type | Enum | NOT NULL | См. GiveawayType |
| status | Enum | NOT NULL | См. GiveawayStatus |
| postTemplateId | UUID? | FK → PostTemplate | Шаблон поста |
| startAt | DateTime? | - | Дата начала |
| endAt | DateTime | NOT NULL | Дата завершения |
| timezone | String | DEFAULT 'Europe/Moscow' | Таймзона |
| winnersCount | Int | DEFAULT 1, min 1 | Количество победителей |
| reserveWinnersCount | Int | DEFAULT 0 | Запасные победители |
| buttonText | String | max 32 | Текст кнопки участия |
| publishResultsMode | Enum | DEFAULT SEPARATE_POSTS | Способ публикации |
| isPublicInCatalog | Boolean | DEFAULT false | Показывать в каталоге |
| totalParticipants | Int | DEFAULT 0 | Счётчик (денормализация) |
| createdAt | DateTime | DEFAULT now() | - |
| updatedAt | DateTime | @updatedAt | - |

**Индексы:**
- `ownerUserId` + `status` — для списка розыгрышей пользователя
- `status` + `endAt` — для планировщика завершения
- `isPublicInCatalog` + `status` — для каталога

---

### 2.5 GiveawayConditions

Условия участия в розыгрыше (1:1 с Giveaway).

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | UUID | PK | Internal ID |
| giveawayId | UUID | FK → Giveaway, UNIQUE | - |
| requiredChannelIds | UUID[] | FK → Channel[] | Обязательные подписки |
| boostChannelIds | UUID[] | FK → Channel[] | Каналы для буста |
| boostRequired | Boolean | DEFAULT false | Буст обязателен |
| inviteEnabled | Boolean | DEFAULT false | Включены инвайты |
| inviteMaxTickets | Int | DEFAULT 0 | Макс. доп. билетов за инвайты |
| storiesEnabled | Boolean | DEFAULT false | Репост в сторис |
| captchaMode | Enum | DEFAULT OFF | OFF \| SUSPICIOUS_ONLY \| ALL |
| livenessEnabled | Boolean | DEFAULT false | Проверка "живости" (платно) |
| customTasks | JSON | DEFAULT [] | Кастомные задания |

**Custom Tasks Schema:**
```typescript
interface CustomTask {
  id: string;           // UUID
  title: string;        // "Подпишись на YouTube"
  url: string;          // "https://youtube.com/..."
  bonusTickets: number; // 0 = обязательно, >0 = бонус
}
```

**⚠️ LIMITATIONS:**

| Condition | Verification | Notes |
|-----------|-------------|-------|
| Channel subscription | ✅ `getChatMember` | Надёжно |
| Channel boost | ✅ `getUserChatBoosts` | Бот должен быть админом |
| Stories repost | ❌ **НЕ ДОСТУПНО** | Нет API в Telegram |
| Custom tasks | ⚠️ По кнопке | Только факт клика |

---

### 2.6 GiveawayPublication

Настройки публикации розыгрыша.

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | UUID | PK | Internal ID |
| giveawayId | UUID | FK → Giveaway, UNIQUE | - |
| publishToChannelIds | UUID[] | FK → Channel[] | Куда опубликовать |
| resultsToChannelIds | UUID[] | FK → Channel[] | Куда отправить итоги |
| publishedMessages | JSON | DEFAULT [] | messageId постов |

**Published Messages Schema:**
```typescript
interface PublishedMessage {
  channelId: string;       // UUID
  telegramChatId: number;  // Telegram chat ID
  messageId: number;       // Telegram message ID
  publishedAt: string;     // ISO date
}
```

---

### 2.7 Participation

Участие пользователя в розыгрыше.

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | UUID | PK | Internal ID |
| giveawayId | UUID | FK → Giveaway | - |
| userId | UUID | FK → User | - |
| status | Enum | NOT NULL | См. ParticipationStatus |
| joinedAt | DateTime | DEFAULT now() | Дата участия |
| ticketsBase | Int | DEFAULT 1 | Базовые билеты |
| ticketsExtra | Int | DEFAULT 0 | Бонусные билеты |
| sourceTag | String? | max 64 | Откуда пришёл (utm/ref) |
| referrerUserId | UUID? | FK → User | Кто пригласил |
| conditionsSnapshot | JSON | - | Статус условий на момент участия |
| fraudScore | Int | DEFAULT 0, 0-100 | Оценка подозрительности |
| createdAt | DateTime | DEFAULT now() | - |
| updatedAt | DateTime | @updatedAt | - |

**Unique Constraint:** `giveawayId` + `userId`

**Conditions Snapshot Schema:**
```typescript
interface ConditionsSnapshot {
  subscriptions: { channelId: string; passed: boolean }[];
  boosts: { channelId: string; passed: boolean }[];
  captchaPassed: boolean;
  customTasks: { taskId: string; clicked: boolean }[];
}
```

---

### 2.8 Winner

Победители розыгрыша.

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | UUID | PK | Internal ID |
| giveawayId | UUID | FK → Giveaway | - |
| userId | UUID | FK → User | - |
| participationId | UUID | FK → Participation | - |
| position | Int | NOT NULL | Позиция (1, 2, 3...) |
| isReserve | Boolean | DEFAULT false | Запасной |
| isConfirmed | Boolean | DEFAULT false | Подтвердил участие |
| notifiedAt | DateTime? | - | Когда уведомлён |
| createdAt | DateTime | DEFAULT now() | - |

**Unique Constraint:** `giveawayId` + `userId`

---

## 3. Payment Entities

### 3.1 Product

Продукты/услуги для продажи.

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | UUID | PK | Internal ID |
| code | String | UNIQUE | Код продукта |
| title | String | NOT NULL | Название |
| description | String? | - | Описание |
| price | Decimal | NOT NULL | Цена в рублях |
| currency | String | DEFAULT 'RUB' | Валюта |
| periodDays | Int? | - | Срок действия (для подписок) |
| type | Enum | NOT NULL | SUBSCRIPTION \| ONE_TIME |
| entitlementCode | String | NOT NULL | Какое право даёт |
| isActive | Boolean | DEFAULT true | Доступен для покупки |
| createdAt | DateTime | DEFAULT now() | - |

**MVP Products:**
```
code: CATALOG_MONTHLY_1000
title: "Каталог розыгрышей (1 месяц)"
price: 1000.00
periodDays: 30
entitlementCode: catalog.access
```

---

### 3.2 Purchase

Покупки пользователей.

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | UUID | PK | Internal ID |
| userId | UUID | FK → User | Покупатель |
| productId | UUID | FK → Product | Что купил |
| status | Enum | NOT NULL | См. PurchaseStatus |
| provider | String | NOT NULL | YooKassa |
| externalId | String? | - | ID платежа в YooKassa |
| amount | Decimal | NOT NULL | Сумма |
| currency | String | DEFAULT 'RUB' | - |
| metadata | JSON? | - | Доп. данные |
| paidAt | DateTime? | - | Когда оплачено |
| createdAt | DateTime | DEFAULT now() | - |
| updatedAt | DateTime | @updatedAt | - |

---

### 3.3 Entitlement

Права доступа пользователей.

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | UUID | PK | Internal ID |
| userId | UUID | FK → User | - |
| code | String | NOT NULL | Код права |
| sourceType | String | NOT NULL | purchase \| promo \| manual |
| sourceId | String? | - | ID источника |
| expiresAt | DateTime? | - | Когда истекает (null = бессрочно) |
| metadata | JSON? | - | Доп. данные |
| createdAt | DateTime | DEFAULT now() | - |
| revokedAt | DateTime? | - | Когда отозвано |

**Index:** `userId` + `code` + `expiresAt`

**Entitlement Codes (MVP):**
- `catalog.access` — доступ к каталогу розыгрышей
- `liveness.check` — проверка "живости" участников
- `analytics.advanced` — расширенная аналитика

---

## 4. Audit & System Entities

### 4.1 AuditLog

Лог важных операций для безопасности.

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | UUID | PK | Internal ID |
| userId | UUID? | FK → User | Кто совершил |
| action | String | NOT NULL | Тип действия |
| entityType | String | NOT NULL | Тип сущности |
| entityId | String | NOT NULL | ID сущности |
| oldValue | JSON? | - | Было |
| newValue | JSON? | - | Стало |
| ipAddress | String? | - | IP адрес |
| userAgent | String? | - | User-Agent |
| createdAt | DateTime | DEFAULT now() | - |

**Actions:**
- `giveaway.created`, `giveaway.published`, `giveaway.finished`
- `payment.created`, `payment.completed`
- `entitlement.granted`, `entitlement.revoked`
- `user.banned`, `user.unbanned`

---

## 5. Enums Summary

```typescript
enum ChannelType {
  CHANNEL = 'CHANNEL',
  GROUP = 'GROUP',
  SUPERGROUP = 'SUPERGROUP',
}

enum MediaType {
  NONE = 'NONE',
  PHOTO = 'PHOTO',
  VIDEO = 'VIDEO',
}

enum GiveawayType {
  STANDARD = 'STANDARD',           // Только подписки
  BOOST_REQUIRED = 'BOOST_REQUIRED', // С обязательным бустом
  INVITE_REQUIRED = 'INVITE_REQUIRED', // С инвайтами
  CUSTOM = 'CUSTOM',               // Кастомные условия
}

enum GiveawayStatus {
  DRAFT = 'DRAFT',
  PENDING_CONFIRM = 'PENDING_CONFIRM',
  SCHEDULED = 'SCHEDULED',
  ACTIVE = 'ACTIVE',
  FINISHED = 'FINISHED',
  CANCELLED = 'CANCELLED',
  ERROR = 'ERROR',
}

enum PublishResultsMode {
  SEPARATE_POSTS = 'SEPARATE_POSTS',
  EDIT_START_POST = 'EDIT_START_POST',
}

enum CaptchaMode {
  OFF = 'OFF',
  SUSPICIOUS_ONLY = 'SUSPICIOUS_ONLY',
  ALL = 'ALL',
}

enum ParticipationStatus {
  JOINED = 'JOINED',
  FAILED_CAPTCHA = 'FAILED_CAPTCHA',
  FAILED_SUBSCRIPTION = 'FAILED_SUBSCRIPTION',
  BANNED = 'BANNED',
}

enum ProductType {
  SUBSCRIPTION = 'SUBSCRIPTION',
  ONE_TIME = 'ONE_TIME',
}

enum PurchaseStatus {
  PENDING = 'PENDING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  REFUNDED = 'REFUNDED',
}
```

---

## 6. Migration Strategy

1. Все миграции через Prisma Migrate
2. Именование: `YYYYMMDDHHMMSS_description`
3. Soft delete вместо hard delete для важных сущностей
4. Аудит изменений критичных данных

---

## 7. Performance Considerations

- Индексы на часто используемые запросы
- Денормализация `totalParticipants` в Giveaway
- Redis кеш для:
  - Проверки подписок (TTL 5 минут)
  - Данных пользователя (TTL 1 час)
  - Статуса розыгрыша (TTL 30 секунд)
