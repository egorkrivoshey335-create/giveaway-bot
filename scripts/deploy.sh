#!/usr/bin/env bash
# =============================================================================
# RandomBeast — Deploy Script
#
# Порядок действий:
#   1. Pull из git
#   2. Backup БД (ПЕРЕД любыми миграциями!)
#   3. pnpm install
#   4. prisma migrate deploy
#   5. prisma generate
#   6. Build всех приложений
#   7. pm2 reload / restart
#
# Использование:
#   ./scripts/deploy.sh             — полный деплой
#   ./scripts/deploy.sh --skip-build— без сборки (быстро, если нет изменений фронтенда)
# =============================================================================

set -euo pipefail

# --- Цвета для вывода ---
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# --- Конфигурация ---
APP_DIR="${APP_DIR:-/opt/randombeast/app}"
BACKUP_DIR="${BACKUP_DIR:-/opt/randombeast/backups}"
LOG_FILE="${APP_DIR}/deploy.log"
SKIP_BUILD="${1:-}"

log() {
  local timestamp
  timestamp=$(date '+%Y-%m-%d %H:%M:%S')
  echo -e "${GREEN}[${timestamp}]${NC} $1"
  echo "[${timestamp}] $1" >> "${LOG_FILE}"
}

warn() {
  local timestamp
  timestamp=$(date '+%Y-%m-%d %H:%M:%S')
  echo -e "${YELLOW}[${timestamp}] WARNING:${NC} $1"
  echo "[${timestamp}] WARNING: $1" >> "${LOG_FILE}"
}

error() {
  local timestamp
  timestamp=$(date '+%Y-%m-%d %H:%M:%S')
  echo -e "${RED}[${timestamp}] ERROR:${NC} $1"
  echo "[${timestamp}] ERROR: $1" >> "${LOG_FILE}"
  exit 1
}

step() {
  echo -e "\n${BLUE}========================================${NC}"
  echo -e "${BLUE}  $1${NC}"
  echo -e "${BLUE}========================================${NC}"
}

# =============================================================================
# Проверки перед запуском
# =============================================================================

step "Pre-flight checks"

if [[ ! -d "${APP_DIR}" ]]; then
  error "APP_DIR не существует: ${APP_DIR}"
fi

if [[ ! -f "${APP_DIR}/.env" ]]; then
  error ".env не найден в ${APP_DIR}"
fi

cd "${APP_DIR}"

# Загружаем переменные окружения
set -a
source "${APP_DIR}/.env"
set +a

log "Deploy started at $(date)"
log "App dir: ${APP_DIR}"

# =============================================================================
# 1. Git pull
# =============================================================================

step "1/7 — Git pull"

CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
log "Current branch: ${CURRENT_BRANCH}"

PREV_COMMIT=$(git rev-parse HEAD)
git pull origin "${CURRENT_BRANCH}"
NEW_COMMIT=$(git rev-parse HEAD)

if [[ "${PREV_COMMIT}" == "${NEW_COMMIT}" ]]; then
  log "Нет новых изменений (HEAD: ${NEW_COMMIT:0:8})"
else
  log "Обновлено: ${PREV_COMMIT:0:8} → ${NEW_COMMIT:0:8}"
fi

# =============================================================================
# 2. Backup БД (ПЕРЕД миграцией!)
# =============================================================================

step "2/7 — Database backup (before migration)"

BACKUP_SCRIPT="${APP_DIR}/scripts/backup.sh"
if [[ -f "${BACKUP_SCRIPT}" ]]; then
  bash "${BACKUP_SCRIPT}" || warn "Backup завершился с ошибкой. Продолжаем..."
else
  warn "backup.sh не найден — пропускаем бэкап"
fi

# =============================================================================
# 3. pnpm install
# =============================================================================

step "3/7 — pnpm install"

NODE_ENV=development pnpm install --frozen-lockfile
log "Dependencies installed"

# =============================================================================
# 4. Prisma migrate deploy
# =============================================================================

step "4/7 — prisma migrate deploy"

cd "${APP_DIR}/packages/database"
npx prisma migrate deploy
log "Migrations applied"
cd "${APP_DIR}"

# =============================================================================
# 5. Prisma generate
# =============================================================================

step "5/7 — prisma generate"

cd "${APP_DIR}/packages/database"
npx prisma generate
log "Prisma client generated"
cd "${APP_DIR}"

# =============================================================================
# 6. Build
# =============================================================================

if [[ "${SKIP_BUILD}" == "--skip-build" ]]; then
  warn "Сборка пропущена (--skip-build)"
else
  step "6/7 — Build applications"

  # Build web (Mini App)
  log "Building apps/web..."
  pnpm --filter @randombeast/web build

  # Build site (Marketing)
  log "Building apps/site..."
  pnpm --filter @randombeast/site build

  log "Build completed"
fi

# =============================================================================
# 7. PM2 reload (zero-downtime)
# =============================================================================

step "7/7 — PM2 reload"

# Проверяем что pm2 запущен
if ! pm2 list &>/dev/null; then
  error "pm2 не запущен или не установлен"
fi

# Проверяем запущены ли процессы
RUNNING=$(pm2 list | grep -c "online" || true)

if [[ "${RUNNING}" -gt 0 ]]; then
  log "Reload with zero-downtime..."
  pm2 reload all --update-env
else
  log "PM2 процессы не запущены. Запускаем..."
  pm2 start ecosystem.config.cjs --update-env
fi

# Ждём пока все процессы поднимутся
sleep 5

# Проверка статуса
log "PM2 status after deploy:"
pm2 list

# Проверяем что api запущен
API_STATUS=$(pm2 list | grep -c "api.*online" || true)
BOT_STATUS=$(pm2 list | grep -c "bot.*online" || true)

if [[ "${API_STATUS}" -eq 0 ]]; then
  warn "api процесс не в статусе online — проверь: pm2 logs api"
fi

if [[ "${BOT_STATUS}" -eq 0 ]]; then
  warn "bot процесс не в статусе online — проверь: pm2 logs bot"
fi

# Сохраняем конфиг pm2 (чтобы автозапуск знал о новых процессах)
pm2 save

# =============================================================================
# Готово
# =============================================================================

step "Deploy completed!"
log "Deploy finished at $(date)"
log ""
log "Проверь логи: pm2 logs api --lines 50"
log "Проверь health: curl https://api.randombeast.ru/health"
