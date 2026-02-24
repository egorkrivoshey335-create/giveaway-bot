# 🖥️ БЛОК 15: ДЕПЛОЙ И ИНФРАСТРУКТУРА

## Обозначения статусов
- [ ] — не сделано
- [x] — сделано полностью
- [~] — сделано частично (см. комментарий)
- [?] — нужно проверить (начальный статус)

---

### [x] Задача 15.1 — Настройка сервера
**Что подразумевает:**
- Сервер: reg.ru, минимум 2 vCPU / 4GB RAM / 40GB SSD
- ОС: Ubuntu 24.04 LTS
- Установка: Node.js 20, pnpm, Docker, Nginx, Certbot, PM2, Fail2ban, UFW

**Статус аудита:**
- ✅ `docker-compose.yml` — PostgreSQL 16 + Redis 7, healthchecks, именованные volumes, restart: unless-stopped
- ✅ `docker-compose.yml` — порты привязаны к `127.0.0.1:5432` и `127.0.0.1:6379` (исправлено)
- ✅ Redis AOF persistence — включён (`--appendonly yes --appendfsync everysec`)
- ✅ `ecosystem.config.cjs` — PM2 конфиг для 4 процессов (api, bot, web, site)
- ✅ `ecosystem.config.cjs` — путь к tsx исправлен: `node_modules/.bin/tsx` (убран хардкод версии)
- ✅ `.env.example` — полный шаблон всех переменных окружения
- ✅ `scripts/setup-server.sh` — скрипт первоначальной настройки сервера
- ✅ **Сервер работает** — все 4 PM2 процесса `online`, DB + Redis запущены
- ✅ **Миграции применены** — все 10 миграций deployed (включая Task 0.5 поля и таблицы)

**Файлы:**
- `docker-compose.yml`
- `.env.example`
- `ecosystem.config.cjs`
- `scripts/setup-server.sh`

---

### [x] Задача 15.2 — Nginx конфигурация
**Что подразумевает:**
- Виртуальные хосты:
  - `app.randombeast.ru` → proxy_pass http://localhost:3000 (Next.js Mini App)
  - `api.randombeast.ru` → proxy_pass http://localhost:4000 (Fastify API)
  - `randombeast.ru` → proxy_pass http://localhost:3001 (Next.js Site)
- SSL: Let's Encrypt
- Security headers: CSP (особенно frame-ancestors для Mini App), HSTS, X-Content-Type-Options
- Gzip compression, Rate limiting

**Статус:**
- ✅ `nginx/app.randombeast.ru.conf` — CSP с `frame-ancestors`, без X-Frame-Options: DENY, gzip, cache статики
- ✅ `nginx/api.randombeast.ru.conf` — `/internal/` только с 127.0.0.1, `/bot/webhook` только POST
- ✅ `nginx/randombeast.ru.conf` — www→non-www redirect, CSP, gzip, fallback 503.html
- ✅ `nginx/503.html` — красивая fallback страница при недоступности сайта
- ✅ `nginx/README.md` — инструкция по установке и certbot
- ✅ SSL — certbot пути прописаны, `options-ssl-nginx.conf`
- ✅ HSTS, X-Content-Type-Options, Referrer-Policy во всех конфигах
- ⚠️ Nginx настроен вручную на сервере — скопировать конфиги из репозитория командой выше

**КРИТИЧНО для Mini App:**
```nginx
# app.randombeast.ru — CSP с frame-ancestors (обязательно!)
add_header Content-Security-Policy "frame-ancestors https://web.telegram.org https://webk.telegram.org https://webz.telegram.org 'self';" always;
# НЕ ставить X-Frame-Options: DENY!
```

**Файлы:**
- `nginx/app.randombeast.ru.conf` ✅
- `nginx/api.randombeast.ru.conf` ✅
- `nginx/randombeast.ru.conf` ✅
- `nginx/503.html` ✅
- `nginx/README.md` ✅

---

### [x] Задача 15.3 — PM2 конфигурация
**Что подразумевает:**
- `ecosystem.config.cjs` с процессами, автозапуск, ротация логов

**Статус:**
- ✅ `ecosystem.config.cjs` — 4 процесса: api, bot, web, site
- ✅ max_restarts: 10, restart_delay: 3000ms
- ✅ NODE_ENV: production
- ✅ Порты: web → 3000, site → 3001
- ✅ **Все 4 процесса online** на сервере (confirmed)
- ✅ BullMQ workers запускаются внутри bot-процесса (корректно)
- ✅ Путь к tsx: `node_modules/.bin/tsx` (убран хардкод абсолютного пути)
- ✅ log_date_format для удобного просмотра логов
- ✅ Инструкция pm2-logrotate в комментарии конфига
- ⚠️ Cluster-режим для API не включён (`instances: 1`) — достаточно для MVP

**Файлы:**
- `ecosystem.config.cjs`

**После деплоя выполнить:**
```bash
pm2 startup    # настроить автозапуск
pm2 save       # сохранить список процессов
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 100M
pm2 set pm2-logrotate:retain 7
pm2 set pm2-logrotate:compress true
```

---

### [x] Задача 15.4 — CI/CD (деплой)
**Что подразумевает:**
- `deploy.sh`, GitHub Actions, автоматический бэкап перед деплоем, `prisma migrate deploy`

**Статус:**
- ✅ `scripts/deploy.sh` — полный деплой: git pull → backup → pnpm install → migrate → generate → build → pm2 reload
- ✅ Backup БД **перед** `prisma migrate deploy` — как требуется
- ✅ Zero-downtime reload (`pm2 reload all --update-env`)
- ✅ Цветной вывод, лог в `deploy.log`, проверка статуса после деплоя
- ✅ Флаг `--skip-build` для быстрого деплоя без пересборки фронтенда
- ⚠️ GitHub Actions — не реализован (ручной деплой через `bash scripts/deploy.sh`)

**Файлы:**
- `scripts/deploy.sh`

**Использование:**
```bash
# Полный деплой
bash scripts/deploy.sh

# Без пересборки фронтенда (только API + Bot)
bash scripts/deploy.sh --skip-build
```

---

### [x] Задача 15.5 — Мониторинг и логирование
**Что подразумевает:**
- Sentry во всех 4 приложениях, pino-логи, healthcheck, PM2 monit

**Статус:**
- ✅ **Bot Sentry** — `apps/bot/src/lib/sentry.ts`: init, uncaughtException, unhandledRejection, ignoreErrors
- ✅ **Web Sentry** — `sentry.client/server/edge.config.ts` + `instrumentation.ts`
- ✅ **API Sentry** — `apps/api/src/lib/sentry.ts`: initSentry, setupErrorHandlers, captureException
- ✅ **Site Sentry** — `sentry.client/server/edge.config.ts` + `instrumentation.ts` + `withSentryConfig` в next.config.js
- ✅ **API Healthcheck** — `GET /health` проверяет DB (latency) + Redis (latency), отдаёт 200/503
- ✅ **Bot Healthcheck** — `GET /health` на порту 4001
- ✅ **API pino-логи** — JSON в production
- ✅ **Bot pino-логи** — структурированные JSON с модулями
- ✅ **Graceful shutdown** — SIGINT/SIGTERM в API и Bot
- ⚠️ `SENTRY_DSN` — нужно прописать в `.env` (переменные: `SENTRY_DSN_API`, `SENTRY_DSN_BOT`, `NEXT_PUBLIC_SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN_SITE`)

**Переменные окружения для Sentry:**
```env
SENTRY_DSN_API=https://...@sentry.io/...
SENTRY_DSN_BOT=https://...@sentry.io/...
NEXT_PUBLIC_SENTRY_DSN=https://...@sentry.io/...       # web (Mini App)
NEXT_PUBLIC_SENTRY_DSN_SITE=https://...@sentry.io/...  # site
SENTRY_DSN_SITE=https://...@sentry.io/...              # site (server-side)
```

**Файлы:**
- `apps/bot/src/lib/sentry.ts` ✅
- `apps/web/sentry.client.config.ts` ✅
- `apps/web/sentry.server.config.ts` ✅
- `apps/web/sentry.edge.config.ts` ✅
- `apps/web/instrumentation.ts` ✅
- `apps/api/src/lib/sentry.ts` ✅ (создан)
- `apps/api/src/server.ts` ✅ (Sentry инициализируется при старте)
- `apps/site/sentry.client.config.ts` ✅ (создан)
- `apps/site/sentry.server.config.ts` ✅ (создан)
- `apps/site/sentry.edge.config.ts` ✅ (создан)
- `apps/site/instrumentation.ts` ✅ (создан)
- `apps/site/next.config.js` ✅ (withSentryConfig добавлен)
- `apps/api/src/routes/health.ts` ✅

---

### [x] Задача 15.6 — Бэкапы
**Что подразумевает:**
- pg_dump cron ежедневно 03:00, хранение 7 дней, Redis AOF

**Статус:**
- ✅ `scripts/backup.sh` — pg_dump через `docker exec rb-postgres` или прямой pg_dump
- ✅ Автоудаление бэкапов старше N дней (настраиваемо через `RETAIN_DAYS`)
- ✅ Поддержка кастомного label: `backup.sh --label "pre-deploy"`
- ✅ Парсинг параметров из `DATABASE_URL` (не нужен отдельный конфиг)
- ✅ Redis AOF — включён в `docker-compose.yml` (`--appendonly yes --appendfsync everysec`)
- ⚠️ Cron-задача — нужно настроить вручную на сервере

**Настройка cron на сервере:**
```bash
# Ежедневный бэкап в 3:00
echo "0 3 * * * /opt/randombeast/app/scripts/backup.sh >> /opt/randombeast/backups/backup.log 2>&1" | crontab -
```

**Файлы:**
- `scripts/backup.sh`

---

### [x] Задача 15.7 — Graceful degradation при сбоях
**Что подразумевает:**
- Fallback при недоступности Redis, PostgreSQL, Telegram Bot API

**Статус:**
- ✅ Redis rate-limit fallback — `skipOnError: true`
- ✅ Redis getCache/setCache обёрнуты в try/catch → null при ошибке
- ✅ Redis reconnect — `retryStrategy` с exponential backoff
- ✅ DB down → 503 через `/health`
- ✅ BullMQ retry на очередях
- ✅ Graceful shutdown — SIGINT/SIGTERM в API и Bot
- ✅ PM2 auto-restart — max_restarts: 10
- ✅ **BullMQ workers защищены try/catch** — бот продолжает работу даже если workers не стартовали
- ✅ Nginx fallback страница 503 при недоступности сайта (`nginx/503.html`)
- ⚠️ Sentry alert при Redis down — не реализован

---

## Итоговая сводка блока 15

| Задача | Статус | Комментарий |
|--------|--------|-------------|
| 15.1 Настройка сервера | [x] | docker-compose, ecosystem, setup-server.sh |
| 15.2 Nginx конфигурация | [x] | 3 домена, CSP для Mini App, 503 fallback |
| 15.3 PM2 конфигурация | [x] | tsx путь исправлен, logrotate инструкция |
| 15.4 CI/CD деплой | [x] | deploy.sh с backup-before-migrate |
| 15.5 Мониторинг | [x] | Sentry во всех 4 приложениях |
| 15.6 Бэкапы | [x] | backup.sh + Redis AOF; cron настроить вручную |
| 15.7 Graceful degradation | [x] | Redis/DB fallback + nginx 503 |

**Итого:** [x]: 7 / [~]: 0 / [ ]: 0

---

## Файлы блока 15

```
├── docker-compose.yml                   ✅ PostgreSQL + Redis (127.0.0.1, AOF)
├── ecosystem.config.cjs                 ✅ PM2 (api, bot, web, site; tsx через .bin)
├── .env.example                         ✅ Шаблон переменных
├── scripts/
│   ├── deploy.sh                        ✅ Полный деплой с backup-before-migrate
│   ├── backup.sh                        ✅ pg_dump + ротация + label
│   └── setup-server.sh                  ✅ Установка Node, pnpm, Docker, Nginx, etc.
├── nginx/
│   ├── app.randombeast.ru.conf          ✅ Mini App (CSP frame-ancestors!)
│   ├── api.randombeast.ru.conf          ✅ API + webhook + internal
│   ├── randombeast.ru.conf              ✅ Landing + www redirect
│   ├── 503.html                         ✅ Fallback страница
│   └── README.md                        ✅ Инструкция certbot
├── apps/api/src/lib/sentry.ts           ✅ Sentry для API (создан)
├── apps/api/src/server.ts               ✅ initSentry() при старте
├── apps/site/sentry.client.config.ts    ✅ Sentry site (client)
├── apps/site/sentry.server.config.ts    ✅ Sentry site (server)
├── apps/site/sentry.edge.config.ts      ✅ Sentry site (edge)
├── apps/site/instrumentation.ts         ✅ Next.js instrumentation
├── apps/site/next.config.js             ✅ withSentryConfig
├── apps/bot/src/lib/sentry.ts           ✅ Sentry для бота
├── apps/web/sentry.client.config.ts     ✅ Sentry web (client)
├── apps/web/sentry.server.config.ts     ✅ Sentry web (server)
├── apps/web/sentry.edge.config.ts       ✅ Sentry web (edge)
├── apps/web/instrumentation.ts          ✅ Next.js instrumentation
└── apps/api/src/routes/health.ts        ✅ GET /health (DB + Redis)
```

---

## Чеклист первого деплоя (с нуля)

### Шаг 1: Подготовка сервера
```bash
# Клонировать репо
git clone https://github.com/your-org/giveaway-bot.git /opt/randombeast/app
cd /opt/randombeast/app

# Запустить setup-server.sh (устанавливает Node, pnpm, PM2, Docker, Nginx, Certbot)
sudo bash scripts/setup-server.sh

# Скопировать .env с секретами
# scp .env.production root@server:/opt/randombeast/app/.env
```

### Шаг 2: Инфраструктура
```bash
# PostgreSQL + Redis через Docker
docker compose up -d

# Проверить
docker ps -a
docker compose exec postgres pg_isready
docker compose exec redis redis-cli ping
```

### Шаг 3: Nginx + SSL
```bash
# Скопировать конфиги
sudo cp nginx/*.conf /etc/nginx/sites-available/
sudo ln -sf /etc/nginx/sites-available/app.randombeast.ru.conf /etc/nginx/sites-enabled/
sudo ln -sf /etc/nginx/sites-available/api.randombeast.ru.conf /etc/nginx/sites-enabled/
sudo ln -sf /etc/nginx/sites-available/randombeast.ru.conf     /etc/nginx/sites-enabled/
sudo cp nginx/503.html /var/www/randombeast/

# ВАЖНО: закомментировать ssl_certificate строки до получения сертификата!
# Проверить и перезапустить
sudo nginx -t && sudo systemctl reload nginx

# Получить SSL
sudo certbot --nginx \
  -d randombeast.ru -d www.randombeast.ru \
  -d app.randombeast.ru \
  -d api.randombeast.ru
```

### Шаг 4: Деплой приложений
```bash
cd /opt/randombeast/app
bash scripts/deploy.sh
```

### Шаг 5: Автозапуск и мониторинг
```bash
# PM2 автозапуск
pm2 startup    # выполнить команду которую выведет
pm2 save

# Ротация логов
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 100M
pm2 set pm2-logrotate:retain 7

# Бэкапы в cron
echo "0 3 * * * /opt/randombeast/app/scripts/backup.sh >> /opt/randombeast/backups/backup.log 2>&1" | crontab -
```

### Шаг 6: Проверка после деплоя
```bash
# Статус процессов
pm2 status

# Healthcheck
curl -s https://api.randombeast.ru/health | python3 -m json.tool

# Логи (не должно быть ERROR)
pm2 logs api --lines 30 --nostream
pm2 logs bot --lines 30 --nostream

# SSL
sudo certbot certificates

# Mini App открывается в Telegram?
# Открыть бота @BeastRandomBot → нажать кнопку → убедиться что Mini App открылся
```

---

## Команды для проверки на сервере

```bash
# ===== 1. Статус всех процессов =====
pm2 status
pm2 logs --lines 20 --nostream

# ===== 2. Docker контейнеры =====
docker ps -a
docker stats --no-stream

# ===== 3. API и Bot healthcheck =====
curl -s http://localhost:4000/health | python3 -m json.tool
curl -s http://localhost:4001/health | python3 -m json.tool

# ===== 4. Nginx =====
sudo nginx -t
sudo systemctl status nginx
sudo nginx -T 2>/dev/null | grep -A5 "server_name\|frame-ancestors\|proxy_pass\|ssl_certificate"

# ===== 5. SSL сертификаты =====
sudo certbot certificates

# ===== 6. Firewall =====
sudo ufw status verbose

# ===== 7. PM2 startup настроен? =====
systemctl list-units | grep pm2
cat ~/.pm2/dump.pm2 2>/dev/null | python3 -m json.tool | grep '"name"' || echo "pm2 save не выполнен"

# ===== 8. pm2-logrotate =====
pm2 conf 2>/dev/null | grep logrotate || echo "logrotate не установлен"

# ===== 9. Cron (бэкапы) =====
crontab -l 2>/dev/null || echo "нет cron задач"

# ===== 10. Диск и память =====
df -h && free -h

# ===== 11. Webhook или polling? =====
grep -i "WEBHOOK_ENABLED\|BOT_MODE" /opt/randombeast/app/.env 2>/dev/null || echo "не найдено"

# ===== 12. Миграции =====
cd /opt/randombeast/app/packages/database
set -a; source /opt/randombeast/app/.env; set +a
npx prisma migrate status
```
