# RandomBeast — Security Document

> **Version:** 0.1.0 (MVP)  
> **Last Updated:** 2026-01-22

---

## 1. Overview

Этот документ описывает правила безопасности для проекта RandomBeast.

**Принципы:**
- Defense in depth (эшелонированная защита)
- Principle of least privilege
- Fail securely
- Security by design

---

## 2. Authentication

### 2.1 Telegram Mini App Authentication

```typescript
// Формат заголовка авторизации
Authorization: tma <init_data_raw>

// Серверная валидация через @telegram-apps/init-data-node
import { validate, parse } from '@telegram-apps/init-data-node';

const authMiddleware = async (req, res, next) => {
  const [authType, authData] = (req.headers.authorization || '').split(' ');
  
  if (authType !== 'tma') {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  try {
    validate(authData, process.env.BOT_TOKEN, {
      expiresIn: 3600, // 1 час
    });
    
    const initData = parse(authData);
    req.user = initData.user;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid init data' });
  }
};
```

**Правила:**
- ✅ Валидация на КАЖДЫЙ API запрос
- ✅ Проверка `expiresIn` (макс. 1 час)
- ✅ Хранение `BOT_TOKEN` только в env переменных
- ❌ Никогда не доверять client-side данным без валидации

### 2.2 Bot Webhook Authentication

```typescript
// Проверка секретного токена webhook
const WEBHOOK_SECRET = crypto.randomBytes(32).toString('hex');

app.post('/webhook', (req, res) => {
  const token = req.headers['x-telegram-bot-api-secret-token'];
  
  if (token !== WEBHOOK_SECRET) {
    return res.status(403).send('Forbidden');
  }
  
  // Process update...
});
```

### 2.3 Admin Authentication

Для админ-панели (если будет):
- Отдельная авторизация (НЕ через TMA)
- 2FA обязательна
- IP whitelist

---

## 3. Input Validation

### 3.1 Zod Schemas

Все входные данные валидируются через Zod:

```typescript
import { z } from 'zod';

// Пример: создание розыгрыша
const createGiveawaySchema = z.object({
  title: z.string()
    .min(3, 'Минимум 3 символа')
    .max(255, 'Максимум 255 символов')
    .trim(),
  
  description: z.string()
    .max(2000)
    .optional(),
  
  winnersCount: z.number()
    .int()
    .min(1)
    .max(100),
  
  endAt: z.string()
    .datetime()
    .refine(date => new Date(date) > new Date(), {
      message: 'Дата должна быть в будущем'
    }),
  
  channelIds: z.array(z.string().uuid())
    .min(1, 'Выберите хотя бы один канал'),
});

// Fastify integration
fastify.post('/giveaways', {
  schema: {
    body: zodToJsonSchema(createGiveawaySchema),
  },
  preHandler: [authMiddleware],
}, async (request, reply) => {
  const data = createGiveawaySchema.parse(request.body);
  // ...
});
```

### 3.2 Sanitization Rules

| Field Type | Sanitization |
|------------|-------------|
| Text | HTML escape, trim whitespace |
| URLs | Validate protocol (https only), no javascript: |
| Numbers | parseInt/parseFloat, bounds check |
| Arrays | Max length limit, item validation |
| JSON | Schema validation, max depth |

### 3.3 Content Security

```typescript
// Telegram Markdown sanitization
const sanitizeMarkdown = (text: string): string => {
  // Разрешённые теги: bold, italic, code, link
  // Удаляем потенциально опасные конструкции
  return text
    .replace(/<script[^>]*>.*?<\/script>/gi, '')
    .replace(/javascript:/gi, '')
    .slice(0, 4096); // Telegram limit
};
```

---

## 4. Rate Limiting

### 4.1 API Rate Limits

```typescript
import rateLimit from '@fastify/rate-limit';

await fastify.register(rateLimit, {
  global: true,
  max: 100,           // 100 запросов
  timeWindow: '1m',   // в минуту
  
  // Кастомные лимиты для разных эндпоинтов
  keyGenerator: (req) => req.user?.id || req.ip,
});

// Специфичные лимиты
const rateLimits = {
  'POST /giveaways': { max: 10, window: '1h' },        // Создание
  'POST /participation/*/join': { max: 50, window: '1m' }, // Участие
  'POST /payments/create': { max: 5, window: '1h' },  // Платежи
};
```

### 4.2 Bot Rate Limits

```typescript
// Telegram Bot API limits
const TELEGRAM_LIMITS = {
  messagesPerSecond: 30,          // Глобально
  messagesPerChatPerMinute: 20,   // В один чат
  bulkMessagesPerSecond: 1,       // Массовая рассылка
};

// Использовать auto-retry от grammY
import { autoRetry } from '@grammyjs/auto-retry';

bot.api.config.use(autoRetry());
```

### 4.3 Redis-based Rate Limiting

```typescript
// Sliding window rate limiter
const checkRateLimit = async (
  key: string, 
  limit: number, 
  windowSeconds: number
): Promise<boolean> => {
  const now = Date.now();
  const windowStart = now - (windowSeconds * 1000);
  
  const pipeline = redis.pipeline();
  pipeline.zremrangebyscore(key, 0, windowStart);
  pipeline.zadd(key, now, `${now}-${Math.random()}`);
  pipeline.zcard(key);
  pipeline.expire(key, windowSeconds);
  
  const results = await pipeline.exec();
  const count = results[2][1] as number;
  
  return count <= limit;
};
```

---

## 5. Authorization

### 5.1 Resource Ownership

```typescript
// Проверка владельца ресурса
const checkOwnership = async (
  userId: string,
  resourceType: 'giveaway' | 'channel' | 'template',
  resourceId: string
): Promise<boolean> => {
  const resource = await prisma[resourceType].findUnique({
    where: { id: resourceId },
    select: { ownerUserId: true },
  });
  
  return resource?.ownerUserId === userId;
};

// Использование в хэндлере
fastify.patch('/giveaways/:id', async (req, reply) => {
  if (!await checkOwnership(req.user.id, 'giveaway', req.params.id)) {
    return reply.status(403).json({ error: 'Forbidden' });
  }
  // ...
});
```

### 5.2 Entitlement Checks

```typescript
// Проверка прав доступа
const checkEntitlement = async (
  userId: string, 
  code: string
): Promise<boolean> => {
  const entitlement = await prisma.entitlement.findFirst({
    where: {
      userId,
      code,
      revokedAt: null,
      OR: [
        { expiresAt: null },
        { expiresAt: { gt: new Date() } },
      ],
    },
  });
  
  return !!entitlement;
};

// Middleware
const requireEntitlement = (code: string) => async (req, res, next) => {
  if (!await checkEntitlement(req.user.id, code)) {
    return res.status(403).json({ 
      error: 'Upgrade required',
      code: 'ENTITLEMENT_REQUIRED',
      requiredEntitlement: code,
    });
  }
  next();
};
```

---

## 6. Payment Security (YooKassa)

### 6.1 Webhook Verification

```typescript
import crypto from 'crypto';

const verifyYooKassaWebhook = (
  body: string, 
  signature: string
): boolean => {
  const secret = process.env.YOOKASSA_SECRET_KEY;
  
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(body)
    .digest('hex');
  
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
};

fastify.post('/payments/webhook', {
  config: { rawBody: true },
}, async (req, reply) => {
  const signature = req.headers['x-yookassa-signature'];
  
  if (!verifyYooKassaWebhook(req.rawBody, signature)) {
    return reply.status(403).send('Invalid signature');
  }
  
  // Process webhook...
});
```

### 6.2 Payment Processing Rules

- ✅ Идемпотентность: использовать `idempotenceKey`
- ✅ Двойная проверка суммы (клиент vs БД)
- ✅ Логирование всех операций
- ✅ Webhook retry handling
- ❌ Никогда не хранить полные данные карт

---

## 7. Data Protection

### 7.1 Sensitive Data Handling

| Data | Storage | Notes |
|------|---------|-------|
| BOT_TOKEN | Env vars only | Никогда в коде |
| YOOKASSA_SECRET | Env vars only | - |
| Database URL | Env vars only | - |
| User Telegram ID | DB (encrypted at rest) | - |
| Payment data | Не хранить | Только статус и ID |

### 7.2 Logging Rules

```typescript
// Что НЕ логировать
const sensitiveFields = [
  'password',
  'token',
  'secret',
  'authorization',
  'cookie',
  'creditCard',
];

// Pino redaction
const logger = pino({
  redact: {
    paths: sensitiveFields.map(f => `*.${f}`),
    censor: '[REDACTED]',
  },
});
```

### 7.3 GDPR Considerations

- Право на удаление: soft delete + полное удаление по запросу
- Экспорт данных: API для выгрузки данных пользователя
- Минимизация данных: хранить только необходимое

---

## 8. Infrastructure Security

### 8.1 CORS Configuration

```typescript
await fastify.register(cors, {
  origin: [
    'https://app.randombeast.ru',
    'https://randombeast.ru',
    // В dev режиме
    ...(isDev ? ['http://localhost:3000'] : []),
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
});
```

### 8.2 HTTP Security Headers

```typescript
await fastify.register(helmet, {
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", 'telegram.org'],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'https:'],
      connectSrc: ["'self'", 'https://api.randombeast.ru'],
      frameSrc: ['telegram.org'],
    },
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true,
  },
});
```

### 8.3 Database Security

```sql
-- Отдельные роли для разных операций
CREATE ROLE app_read WITH LOGIN PASSWORD 'xxx';
CREATE ROLE app_write WITH LOGIN PASSWORD 'xxx';

GRANT SELECT ON ALL TABLES IN SCHEMA public TO app_read;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_write;

-- Row Level Security (если потребуется)
ALTER TABLE giveaways ENABLE ROW LEVEL SECURITY;
```

---

## 9. Fraud Detection

### 9.1 Suspicious Activity Indicators

```typescript
interface FraudSignals {
  // Аккаунт
  accountAgeDays: number;       // < 7 дней = подозрительно
  hasPremium: boolean;          // Premium реже боты
  hasUsername: boolean;         // Без username = подозрительно
  hasProfilePhoto: boolean;
  
  // Поведение
  participationsPerHour: number; // > 50 = подозрительно
  sameIpParticipations: number;  // > 10 = подозрительно
  
  // Паттерны
  joinedAtNight: boolean;       // 3-6 AM = подозрительно
  instantJoin: boolean;         // < 1 sec = бот
}

const calculateFraudScore = (signals: FraudSignals): number => {
  let score = 0;
  
  if (signals.accountAgeDays < 7) score += 20;
  if (!signals.hasUsername) score += 15;
  if (!signals.hasProfilePhoto) score += 10;
  if (signals.participationsPerHour > 50) score += 30;
  if (signals.instantJoin) score += 25;
  
  return Math.min(score, 100);
};
```

### 9.2 Captcha Strategy

```typescript
enum CaptchaDecision {
  SKIP = 'SKIP',           // Доверенный пользователь
  SIMPLE = 'SIMPLE',       // Простая (кнопка)
  COMPLEX = 'COMPLEX',     // Сложная (задача)
}

const decideCaptcha = (
  mode: CaptchaMode, 
  fraudScore: number
): CaptchaDecision => {
  if (mode === 'OFF') return CaptchaDecision.SKIP;
  if (mode === 'ALL') return CaptchaDecision.SIMPLE;
  
  // SUSPICIOUS_ONLY
  if (fraudScore >= 50) return CaptchaDecision.COMPLEX;
  if (fraudScore >= 30) return CaptchaDecision.SIMPLE;
  return CaptchaDecision.SKIP;
};
```

---

## 10. Incident Response

### 10.1 Security Events to Monitor

- Failed authentication attempts (> 10/min)
- Unusual payment patterns
- Mass participation from single IP
- API rate limit hits
- Database query anomalies

### 10.2 Alerting (Sentry Integration)

```typescript
import * as Sentry from '@sentry/node';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: 0.1,
});

// Security event
Sentry.captureEvent({
  level: 'warning',
  message: 'Suspicious activity detected',
  tags: {
    type: 'security',
    subtype: 'fraud_attempt',
  },
  extra: {
    userId: user.id,
    fraudScore: 85,
    signals: {...},
  },
});
```

### 10.3 Response Playbook

1. **Detection** → Alert в Sentry/Telegram
2. **Assessment** → Определить масштаб
3. **Containment** → Временный бан IP/user
4. **Investigation** → Анализ логов
5. **Recovery** → Откат, если нужно
6. **Post-mortem** → Документирование

---

## 11. Security Checklist (Pre-Launch)

- [ ] TMA init data validation работает
- [ ] Rate limiting настроен
- [ ] CORS ограничен доменами
- [ ] Все env переменные в безопасности
- [ ] Логи не содержат sensitive data
- [ ] YooKassa webhook верифицируется
- [ ] SQL injection невозможен (Prisma)
- [ ] XSS защита (helmet, CSP)
- [ ] HTTPS everywhere
- [ ] Backup стратегия готова
