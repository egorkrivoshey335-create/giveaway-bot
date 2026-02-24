#!/usr/bin/env bash
# =============================================================================
# RandomBeast — Server Setup Script
#
# Настройка чистого Ubuntu/Debian сервера:
# - Node.js 20 LTS
# - pnpm
# - PM2
# - Docker + Docker Compose plugin
# - Nginx
# - Certbot (SSL)
# - Директории для приложения и бэкапов
#
# Использование (от root или sudo):
#   curl -sSL https://raw.githubusercontent.com/.../setup-server.sh | bash
#   или
#   sudo bash scripts/setup-server.sh
# =============================================================================

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log()  { echo -e "${GREEN}[✓]${NC} $1"; }
warn() { echo -e "${YELLOW}[!]${NC} $1"; }
step() { echo -e "\n${BLUE}==> $1${NC}"; }
error() { echo -e "${RED}[✗] ERROR:${NC} $1" && exit 1; }

# Проверяем что запущено с правами root
if [[ "${EUID}" -ne 0 ]]; then
  error "Запусти скрипт от root: sudo bash scripts/setup-server.sh"
fi

APP_DIR="/opt/randombeast/app"
BACKUP_DIR="/opt/randombeast/backups"

# =============================================================================
# 1. Системные пакеты
# =============================================================================

step "1. Обновление системы и установка зависимостей"

export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get upgrade -y -qq
apt-get install -y -qq \
  curl \
  git \
  nginx \
  certbot \
  python3-certbot-nginx \
  htop \
  unzip \
  build-essential \
  postgresql-client \
  fail2ban \
  ufw

log "Системные пакеты установлены"

# =============================================================================
# 2. Node.js 20 LTS (через NodeSource)
# =============================================================================

step "2. Node.js 20 LTS"

if ! command -v node &>/dev/null || [[ "$(node -v)" != v20* ]]; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
  log "Node.js $(node -v) установлен"
else
  log "Node.js $(node -v) уже установлен"
fi

# =============================================================================
# 3. pnpm
# =============================================================================

step "3. pnpm"

if ! command -v pnpm &>/dev/null; then
  npm install -g pnpm
  log "pnpm $(pnpm -v) установлен"
else
  log "pnpm $(pnpm -v) уже установлен"
fi

# =============================================================================
# 4. PM2
# =============================================================================

step "4. PM2"

if ! command -v pm2 &>/dev/null; then
  npm install -g pm2
  log "PM2 $(pm2 -v) установлен"
else
  log "PM2 $(pm2 -v) уже установлен"
fi

# PM2 log rotate
pm2 install pm2-logrotate 2>/dev/null || true
pm2 set pm2-logrotate:max_size 100M 2>/dev/null || true
pm2 set pm2-logrotate:retain 7      2>/dev/null || true
pm2 set pm2-logrotate:compress true 2>/dev/null || true
log "PM2 logrotate настроен"

# =============================================================================
# 5. Docker
# =============================================================================

step "5. Docker"

if ! command -v docker &>/dev/null; then
  curl -fsSL https://get.docker.com | sh
  systemctl enable docker
  systemctl start docker
  log "Docker $(docker -v) установлен"
else
  log "Docker $(docker -v) уже установлен"
fi

# =============================================================================
# 6. Директории
# =============================================================================

step "6. Создание директорий"

mkdir -p "${APP_DIR}"
mkdir -p "${BACKUP_DIR}"
mkdir -p /var/www/certbot
mkdir -p /var/www/randombeast

# Страница 503
if [[ -f "${APP_DIR}/nginx/503.html" ]]; then
  cp "${APP_DIR}/nginx/503.html" /var/www/randombeast/
fi

log "Директории созданы"

# =============================================================================
# 7. Nginx
# =============================================================================

step "7. Nginx"

# Базовый конфиг — убираем default
if [[ -f /etc/nginx/sites-enabled/default ]]; then
  rm -f /etc/nginx/sites-enabled/default
fi

# Глобальный gzip и server_tokens off в nginx.conf
if ! grep -q "server_tokens off" /etc/nginx/nginx.conf; then
  sed -i 's/http {/http {\n\tserver_tokens off;/' /etc/nginx/nginx.conf
fi

systemctl enable nginx
systemctl start nginx
log "Nginx настроен"

# =============================================================================
# 8. Firewall (ufw)
# =============================================================================

step "8. Firewall (ufw)"

ufw default deny incoming
ufw default allow outgoing
ufw allow ssh
ufw allow 80/tcp
ufw allow 443/tcp
# Внутренние порты НЕ открываем (3000, 3001, 4000 — через nginx)
ufw --force enable
log "UFW настроен"

# =============================================================================
# 9. fail2ban
# =============================================================================

step "9. fail2ban"

systemctl enable fail2ban
systemctl start fail2ban
log "fail2ban запущен"

# =============================================================================
# 10. SSH hardening (опционально)
# =============================================================================

step "10. Итог"

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  Сервер готов к деплою!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo "Следующие шаги:"
echo ""
echo "  1. Клонируй репозиторий:"
echo "     git clone https://github.com/your-org/giveaway-bot.git ${APP_DIR}"
echo ""
echo "  2. Скопируй .env на сервер:"
echo "     scp .env.production root@server:${APP_DIR}/.env"
echo ""
echo "  3. Запусти Docker сервисы (PostgreSQL, Redis):"
echo "     cd ${APP_DIR} && docker compose up -d"
echo ""
echo "  4. Настрой nginx:"
echo "     sudo cp ${APP_DIR}/nginx/*.conf /etc/nginx/sites-available/"
echo "     sudo ln -sf /etc/nginx/sites-available/*.conf /etc/nginx/sites-enabled/"
echo "     sudo nginx -t && sudo systemctl reload nginx"
echo ""
echo "  5. Получи SSL сертификаты:"
echo "     sudo certbot --nginx -d randombeast.ru -d www.randombeast.ru -d app.randombeast.ru -d api.randombeast.ru"
echo ""
echo "  6. Запусти deploy:"
echo "     cd ${APP_DIR} && bash scripts/deploy.sh"
echo ""
echo "  7. Настрой автозапуск PM2:"
echo "     pm2 startup    # скопируй и выполни команду"
echo "     pm2 save"
echo ""
echo "  8. Настрой cron для бэкапов:"
echo "     echo '0 3 * * * ${APP_DIR}/scripts/backup.sh >> ${BACKUP_DIR}/backup.log 2>&1' | crontab -"
echo ""
