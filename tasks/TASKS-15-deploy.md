# 🖥️ БЛОК 15: ДЕПЛОЙ И ИНФРАСТРУКТУРА

## Обозначения статусов
- [ ] — не сделано
- [x] — сделано полностью
- [~] — сделано частично (см. комментарий)
- [?] — нужно проверить (начальный статус)

---

### [?] Задача 15.1 — Настройка сервера
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

---

### [?] Задача 15.2 — Nginx конфигурация
**Что подразумевает:**
- Виртуальные хосты:
  - `app.randombeast.ru` → proxy_pass http://localhost:3000 (Next.js Mini App)
  - `api.randombeast.ru` → proxy_pass http://localhost:4000 (Fastify API)
  - `randombeast.ru` → proxy_pass http://localhost:3001 (Next.js Site)
- SSL: Let's Encrypt wildcard cert (*.randombeast.ru + randombeast.ru)
- Security headers:
  - `X-Frame-Options: DENY` (кроме Mini App — `ALLOW-FROM https://web.telegram.org`)
  - `X-Content-Type-Options: nosniff`
  - `X-XSS-Protection: 1; mode=block`
  - `Content-Security-Policy`
  - `Strict-Transport-Security`
- Gzip compression
- Rate limiting (дополнительный уровень к Fastify)
- Access logs + error logs
- Content-Security-Policy для app.randombeast.ru (Mini App):
  - `frame-ancestors https://web.telegram.org https://webk.telegram.org https://webz.telegram.org;`
  - `default-src 'self';`
  - `script-src 'self' 'unsafe-inline' https://telegram.org;`
  - `style-src 'self' 'unsafe-inline';`
  - `img-src 'self' data: blob: https://api.randombeast.ru https://t.me;`
  - `connect-src 'self' https://api.randombeast.ru wss://api.randombeast.ru;`
  - `font-src 'self';`
  - `media-src 'self' blob:;`
  - НЕ ставить X-Frame-Options: DENY для app.randombeast.ru (иначе Telegram не откроет в iframe)
  - Для randombeast.ru и api.randombeast.ru: X-Frame-Options: DENY — ок

---

### [?] Задача 15.3 — PM2 конфигурация
**Что подразумевает:**
- `ecosystem.config.js` с процессами: api (cluster x2), bot (x1), web (x1), site (x1), worker (x1)
- Автозапуск при рестарте сервера: `pm2 startup` + `pm2 save`
- Логи: `pm2 logs`, ротация через `pm2-logrotate`

---

### [?] Задача 15.4 — CI/CD (деплой)
**Что подразумевает:**
- Скрипт `deploy.sh` в корне проекта:
  ```bash
  #!/bin/bash
  set -e
  git pull origin main
  pnpm install --frozen-lockfile
  pnpm build
  pnpm db:push
  pm2 restart all
  echo "✅ Deploy complete"
- В будущем: GitHub Actions → SSH deploy on push to main
- Обновлённый скрипт `deploy.sh`:
  ```bash
  #!/bin/bash
  set -e

  echo "📦 Pulling latest code..."
  git pull origin main

  echo "📥 Installing dependencies..."
  pnpm install --frozen-lockfile

  echo "💾 Backing up database..."
  pg_dump $DATABASE_URL | gzip > /backups/pre-deploy-$(date +%Y%m%d_%H%M%S).sql.gz

  echo "🔄 Running migrations..."
  cd packages/database && npx prisma migrate deploy && cd ../..

  echo "🏗️ Building..."
  pnpm build

  echo "🔄 Restarting services..."
  pm2 restart all

  echo "✅ Deploy complete!"
- Правило: НИКОГДА не редактировать существующие миграции после деплоя
- Откат (rollback): восстановить из бэкапа + git revert + redeploy
- Тестирование миграции: сначала на dev/staging, потом на production

---

### [?] Задача 15.5 — Мониторинг и логирование
**Что подразумевает:**
- Sentry: подключить в apps/api, apps/web, apps/bot, apps/site
- Логирование (pino): структурированные JSON логи, уровни trace→fatal, в production info+
- Healthcheck: GET api.randombeast.ru/health → проверка DB + Redis + Bot, cron каждые 5 мин, алерт в Telegram
- Мониторинг ресурсов: PM2 monit, bash-скрипт RAM > 80% → алерт

---

### [?] Задача 15.6 — Бэкапы
**Что подразумевает:**
- PostgreSQL: ежедневный pg_dump → сжатие → хранение 30 дней, cron 0 3 * * *
- Redis: RDB snapshot + AOF persistence
- Медиа/Liveness фото: бэкап вместе с основным
- Тестирование восстановления: раз в месяц

---

### [?] Задача 15.7 — Graceful degradation при сбоях
**Что подразумевает:**
- Если Redis недоступен:
  - Сессии: fallback на JWT-only (без серверного хранения, менее безопасно но работает)
  - Капча: временно отключить капчу, всех пускать без неё (или in-memory Map с TTL)
  - Rate limit: fallback на in-memory rate limit (менее точный, но лучше чем ничего)
  - Кеши: запросы идут напрямую в БД (медленнее, но работает)
  - Логирование: warning в Sentry "Redis unavailable, running in degraded mode"
- Если PostgreSQL недоступен:
  - Всё падает → 503 Service Unavailable
  - Healthcheck /health → { status: "down", db: false }
  - PM2 автоматически рестартует процесс
  - Nginx отдаёт статическую страницу "Сервис временно недоступен"
- Если Telegram Bot API недоступен:
  - Публикация постов: ставить в очередь BullMQ с retry
  - Уведомления: ставить в очередь с retry
  - Mini App: работает (не зависит от Bot API напрямую)
  - Проверка подписки: временно кешированные данные или "подписка не проверена, попробуйте позже"