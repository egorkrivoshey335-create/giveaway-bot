# 🖥️ БЛОК 15: ДЕПЛОЙ И ИНФРАСТРУКТУРА

## Обозначения статусов
- [ ] — не сделано
- [x] — сделано полностью
- [~] — сделано частично (см. комментарий)
- [?] — нужно проверить (начальный статус)

---

### [~] Задача 15.1 — Настройка сервера
**Что подразумевает:**
- Сервер: reg.ru, минимум 2 vCPU / 4GB RAM / 40GB SSD
- ОС: Ubuntu 24.04 LTS
- Установка:
  - Node.js 20 LTS (через nvm)
  - pnpm (через corepack)
  - Docker + Docker Compose (для PostgreSQL + Redis)
  - Nginx (reverse proxy)
  - Certbot (SSL Let's Encrypt)
  - PM2 (process manager)
  - Fail2ban (защита SSH)
  - UFW (firewall: открыты только 80, 443, 22)

**Статус аудита:**
- ✅ `docker-compose.yml` — PostgreSQL 16 + Redis 7, healthchecks, именованные volumes (`postgres_data`, `redis_data`), restart: unless-stopped
- ✅ `ecosystem.config.cjs` — PM2 конфиг для 4 процессов (api, bot, web, site)
- ✅ `.env.example` — полный шаблон всех переменных окружения
- ❌ Сервер-скрипт установки — отсутствует (нет `setup-server.sh`)
- ❌ Nginx конфиг — не найден в репозитории (настроен на сервере вручную)
- ❌ Redis AOF/RDB persistence — в `docker-compose.yml` не настроено явно (Redis по умолчанию делает RDB, но AOF отключён)
- ⚠️ В `docker-compose.yml` БД доступна на `0.0.0.0:5432` — в production нужно ограничить `127.0.0.1:5432`

**Файлы:**
- `docker-compose.yml`
- `.env.example`
- `ecosystem.config.cjs`

---

### [ ] Задача 15.2 — Nginx конфигурация
**Что подразумевает:**
- Виртуальные хосты:
  - `app.randombeast.ru` → proxy_pass http://localhost:3000 (Next.js Mini App)
  - `api.randombeast.ru` → proxy_pass http://localhost:4000 (Fastify API)
  - `randombeast.ru` → proxy_pass http://localhost:3001 (Next.js Site)
- SSL: Let's Encrypt wildcard cert (*.randombeast.ru + randombeast.ru)
- Security headers: X-Frame-Options, CSP, HSTS, X-Content-Type-Options
- Gzip compression
- Rate limiting
- CSP для Mini App: `frame-ancestors https://web.telegram.org`

**Статус аудита:**
- ❌ Nginx конфигурационные файлы — НЕ найдены в репозитории (ни одного `.conf` файла)
- ❌ Нет папки `nginx/` или `infra/` с конфигами
- ❌ Нет `certbot` скрипта получения SSL
- ⚠️ Nginx, вероятно, настроен вручную на сервере — не под версионным контролем

**КРИТИЧНО для production:**
- CSP для `app.randombeast.ru` обязателен с `frame-ancestors https://web.telegram.org` — иначе Mini App не откроется в Telegram
- Webhook бота (`/bot/webhook`) должен быть доступен через `api.randombeast.ru`
- Нет X-Frame-Options: DENY для API и Site — но это OK, главное не забыть для Mini App

---

### [~] Задача 15.3 — PM2 конфигурация
**Что подразумевает:**
- `ecosystem.config.js` с процессами: api (cluster x2), bot (x1), web (x1), site (x1), worker (x1)
- Автозапуск при рестарте сервера: `pm2 startup` + `pm2 save`
- Логи: `pm2 logs`, ротация через `pm2-logrotate`

**Статус аудита:**
- ✅ `ecosystem.config.cjs` существует — 4 процесса: api, bot, web, site
- ✅ max_restarts: 10, restart_delay: 1000ms — защита от crash-loop
- ✅ NODE_ENV: production прописан
- ✅ Порты: web → 3000, site → 3001 (совпадают с nginx проксированием)
- ✅ Bot запускается с tsx (поддерживает TypeScript напрямую)
- ❌ Нет worker-процесса (BullMQ) — воркеры запускаются внутри bot-процесса, что правильно
- ❌ Режим cluster для API — отсутствует (instances: 1, не `instances: 2, exec_mode: 'cluster'`)
- ❌ pm2-logrotate — не настроен (логи могут переполнить диск)
- ⚠️ Путь к tsx захардкожен: `/opt/randombeast/app/node_modules/.pnpm/tsx@4.21.0/...` — при обновлении версии tsx сломается

**Файлы:**
- `ecosystem.config.cjs`

---

### [ ] Задача 15.4 — CI/CD (деплой)
**Что подразумевает:**
- Скрипт `deploy.sh` в корне проекта
- В будущем: GitHub Actions → SSH deploy on push to main
- Автоматический бэкап перед деплоем
- `prisma migrate deploy` (не `db push`)

**Статус аудита:**
- ❌ `deploy.sh` — НЕ найден в репозитории
- ❌ GitHub Actions (`.github/workflows/`) — НЕ найдено
- ❌ Нет скрипта автоматического деплоя
- ⚠️ Деплой производится вручную: `git pull` + `pnpm install` + `pnpm build` + `pm2 restart all`

---

### [~] Задача 15.5 — Мониторинг и логирование
**Что подразумевает:**
- Sentry: подключить в apps/api, apps/web, apps/bot, apps/site
- Логирование (pino): структурированные JSON логи
- Healthcheck: GET /health → проверка DB + Redis + Bot
- Мониторинг ресурсов: PM2 monit

**Статус аудита:**
- ✅ **Bot Sentry** — `apps/bot/src/lib/sentry.ts` полная реализация: init, uncaughtException, unhandledRejection, ignoreErrors
- ✅ **Web Sentry** — `sentry.client.config.ts`, `sentry.server.config.ts`, `sentry.edge.config.ts` — полный Sentry NextJS
- ✅ **Web instrumentation** — `apps/web/instrumentation.ts` подключена
- ✅ **API Healthcheck** — `GET /health` проверяет DB (latency) + Redis (latency), отдаёт 200/503
- ✅ **Bot Healthcheck** — `GET /health` на отдельном порту (4001)
- ✅ **API pino-логирование** — JSON логи в production, pino-pretty в dev
- ✅ **Bot pino-логирование** — `apps/bot/src/lib/logger.ts`
- ✅ **Graceful shutdown** — SIGINT/SIGTERM в API и Bot: закрывают Redis, Fastify, bot.stop()
- ❌ **API Sentry** — НЕ найден в `apps/api/src/` (нет @sentry/node инициализации)
- ❌ **Site Sentry** — нет Sentry конфигов в `apps/site/`
- ❌ Healthcheck cron-мониторинг — нет скрипта который периодически пингует `/health` и шлёт алерты в Telegram
- ⚠️ SENTRY_DSN в `.env.example` закомментирован — нужно раскомментировать и прописать реальный DSN

**Файлы:**
- `apps/bot/src/lib/sentry.ts`
- `apps/web/sentry.client.config.ts`
- `apps/web/sentry.server.config.ts`
- `apps/web/sentry.edge.config.ts`
- `apps/web/instrumentation.ts`
- `apps/api/src/routes/health.ts`
- `apps/bot/src/server.ts` (health server на порту 4001)

---

### [ ] Задача 15.6 — Бэкапы
**Что подразумевает:**
- PostgreSQL: ежедневный pg_dump → сжатие → хранение 30 дней, cron 0 3 * * *
- Redis: RDB snapshot + AOF persistence
- Тестирование восстановления: раз в месяц

**Статус аудита:**
- ❌ Backup-скрипт — НЕ найден в репозитории (нет `backup.sh` / `scripts/backup.sh`)
- ❌ Cron-задача для pg_dump — не настроена в репозитории
- ❌ Redis AOF — не включён явно в `docker-compose.yml` (нет `--appendonly yes`)
- ❌ Директория `/backups/` — не создана (упоминается в спецификации deploy.sh)
- ⚠️ Redis делает RDB по умолчанию каждые 60 сек при изменениях — минимальный уровень защиты

---

### [~] Задача 15.7 — Graceful degradation при сбоях
**Что подразумевает:**
- Если Redis недоступен: fallback, in-memory rate limit, кеши → БД
- Если PostgreSQL недоступен: 503
- Если Telegram Bot API недоступен: очередь BullMQ с retry

**Статус аудита:**
- ✅ **Redis rate-limit fallback** — `skipOnError: true` в `@fastify/rate-limit` → при падении Redis rate-limit отключается (трафик не блокируется)
- ✅ **Redis getCache/setCache** — все методы обёрнуты в try/catch, при ошибке возвращают null (не крашат API)
- ✅ **Redis reconnect** — `retryStrategy: times => Math.min(times * 50, 2000)` — автореконнект с backoff
- ✅ **DB down → 503** — `/health` возвращает 503 при недоступной БД
- ✅ **BullMQ retry** — очереди настроены с retry (giveaway-start, giveaway-end, winner-notifications)
- ✅ **Graceful shutdown** — SIGINT/SIGTERM обработчики в API и Bot
- ✅ **PM2 auto-restart** — max_restarts: 10
- ❌ **Sentry alert при Redis down** — нет явного предупреждения "Redis unavailable, running in degraded mode"
- ❌ **Nginx static fallback** — нет статической страницы 503 в nginx конфиге
- ⚠️ Captcha при Redis down — fallback не явный (капча использует Redis, при падении скорее всего ошибка 500)

---

## Итоговая сводка блока 15

| Задача | Статус | Комментарий |
|--------|--------|-------------|
| 15.1 Настройка сервера | [~] | docker-compose + .env.example есть; нет setup-скрипта |
| 15.2 Nginx конфигурация | [ ] | Конфиг не найден в репозитории (настроен на сервере) |
| 15.3 PM2 конфигурация | [~] | ecosystem.config.cjs есть; нет cluster-режима, нет logrotate |
| 15.4 CI/CD деплой | [ ] | Нет deploy.sh, нет GitHub Actions |
| 15.5 Мониторинг | [~] | Sentry в bot+web есть; API и Site — нет; healthcheck есть |
| 15.6 Бэкапы | [ ] | Нет backup-скриптов, нет cron |
| 15.7 Graceful degradation | [~] | Redis fallback есть; нет nginx-страницы 503; нет Sentry-алерта |

**Итого:** [x]: 0 / [~]: 4 / [ ]: 3

---

## Файлы блока 15

```
Существующие:
├── docker-compose.yml              ✅ PostgreSQL + Redis
├── ecosystem.config.cjs            ✅ PM2 (api, bot, web, site)
├── .env.example                    ✅ Шаблон переменных
├── apps/api/src/routes/health.ts   ✅ GET /health (DB + Redis)
├── apps/bot/src/lib/sentry.ts      ✅ Sentry для бота
├── apps/web/sentry.client.config.ts ✅ Sentry web (client)
├── apps/web/sentry.server.config.ts ✅ Sentry web (server)
├── apps/web/sentry.edge.config.ts   ✅ Sentry web (edge)
└── apps/web/instrumentation.ts      ✅ Next.js instrumentation

Отсутствуют (нужно создать):
├── nginx/
│   ├── app.randombeast.ru.conf     ❌ Mini App (с CSP frame-ancestors!)
│   ├── api.randombeast.ru.conf     ❌ API + webhook
│   └── randombeast.ru.conf         ❌ Landing site
├── scripts/
│   ├── deploy.sh                   ❌ Деплой-скрипт
│   ├── backup.sh                   ❌ Бэкап БД
│   └── setup-server.sh             ❌ Первоначальная настройка сервера
├── apps/api/src/lib/sentry.ts      ❌ Sentry для API
└── apps/site/sentry.*.config.ts    ❌ Sentry для Site
```

---

## Что критично для первого деплоя

### 🔴 ОБЯЗАТЕЛЬНО (без этого ничего не заработает):

1. **Nginx конфиг** — особенно CSP для Mini App:
   ```nginx
   # app.randombeast.ru — ОБЯЗАТЕЛЕН frame-ancestors
   add_header Content-Security-Policy "frame-ancestors https://web.telegram.org https://webk.telegram.org https://webz.telegram.org 'self';";
   # НЕ ставить X-Frame-Options: DENY!
   ```

2. **Webhook бота** — при `BOT_MODE=webhook` в `.env`:
   ```bash
   WEBHOOK_ENABLED=true
   WEBHOOK_DOMAIN=https://api.randombeast.ru
   WEBHOOK_PATH=/bot/webhook
   BOT_WEBHOOK_SECRET=<random-64-char-hex>
   ```

3. **SSL сертификат**:
   ```bash
   certbot --nginx -d randombeast.ru -d app.randombeast.ru -d api.randombeast.ru
   ```

4. **Реальный `.env`** — скопировать `.env.example`, заполнить все секреты

5. **Миграции БД**:
   ```bash
   cd packages/database && npx prisma migrate deploy
   ```

### 🟡 ВАЖНО (первые дни):

6. **PM2 startup** — автозапуск после перезагрузки:
   ```bash
   pm2 startup && pm2 save
   ```

7. **pm2-logrotate** — ротация логов:
   ```bash
   pm2 install pm2-logrotate
   pm2 set pm2-logrotate:max_size 100M
   pm2 set pm2-logrotate:retain 7
   ```

8. **Sentry DSN** — прописать в `.env` для API и Site

9. **Бэкап-cron** — добавить в crontab:
   ```bash
   0 3 * * * pg_dump $DATABASE_URL | gzip > /backups/$(date +%Y%m%d).sql.gz
   ```

---

## Команды для проверки на сервере

```bash
# 1. Docker (БД + Redis)
docker compose ps
docker compose logs --tail=20

# 2. PM2 процессы
pm2 list
pm2 logs --lines 50

# 3. API healthcheck
curl http://localhost:4000/health

# 4. Bot health
curl http://localhost:4001/health

# 5. Nginx статус
sudo nginx -t
sudo systemctl status nginx

# 6. SSL сертификаты
sudo certbot certificates

# 7. Firewall
sudo ufw status

# 8. Disk / Memory
df -h && free -h
```
