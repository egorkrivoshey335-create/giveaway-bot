#!/usr/bin/env bash
# =============================================================================
# RandomBeast — Database Backup Script
#
# Создаёт gzip-дамп PostgreSQL в /opt/randombeast/backups/
# Хранит последние 7 дней (удаляет старше)
#
# Использование:
#   ./scripts/backup.sh                          — backup с меткой времени
#   ./scripts/backup.sh --label "pre-deploy"     — backup с кастомным именем
#
# Crontab (каждый день в 3:00):
#   0 3 * * * /opt/randombeast/app/scripts/backup.sh >> /opt/randombeast/backups/backup.log 2>&1
# =============================================================================

set -euo pipefail

# --- Конфигурация ---
APP_DIR="${APP_DIR:-/opt/randombeast/app}"
BACKUP_DIR="${BACKUP_DIR:-/opt/randombeast/backups}"
RETAIN_DAYS="${RETAIN_DAYS:-7}"
LABEL="${2:-}"

# --- Цвета ---
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

log() {
  echo -e "${GREEN}[$(date '+%Y-%m-%d %H:%M:%S')]${NC} $1"
}

error() {
  echo -e "${RED}[$(date '+%Y-%m-%d %H:%M:%S')] ERROR:${NC} $1"
  exit 1
}

# =============================================================================
# Загрузка конфига
# =============================================================================

if [[ -f "${APP_DIR}/.env" ]]; then
  set -a
  source "${APP_DIR}/.env"
  set +a
fi

# Извлекаем параметры подключения из DATABASE_URL
# Формат: postgresql://user:password@host:port/database
if [[ -z "${DATABASE_URL:-}" ]]; then
  error "DATABASE_URL не задан"
fi

# Парсим DATABASE_URL
DB_HOST=$(echo "${DATABASE_URL}" | sed -n 's|.*@\([^:]*\):\([0-9]*\)/.*|\1|p')
DB_PORT=$(echo "${DATABASE_URL}" | sed -n 's|.*@\([^:]*\):\([0-9]*\)/.*|\2|p')
DB_NAME=$(echo "${DATABASE_URL}" | sed -n 's|.*/\([^?]*\).*|\1|p')
DB_USER=$(echo "${DATABASE_URL}" | sed -n 's|.*://\([^:]*\):.*|\1|p')
DB_PASS=$(echo "${DATABASE_URL}" | sed -n 's|.*://[^:]*:\([^@]*\)@.*|\1|p')

DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"

# =============================================================================
# Создание бэкапа
# =============================================================================

mkdir -p "${BACKUP_DIR}"

TIMESTAMP=$(date '+%Y%m%d_%H%M%S')
if [[ -n "${LABEL}" ]]; then
  FILENAME="backup_${LABEL}_${TIMESTAMP}.sql.gz"
else
  FILENAME="backup_${TIMESTAMP}.sql.gz"
fi
FILEPATH="${BACKUP_DIR}/${FILENAME}"

log "Starting backup: ${DB_NAME}@${DB_HOST}:${DB_PORT}"
log "Output: ${FILEPATH}"

# pg_dump через Docker контейнер rb-postgres (если доступен) или напрямую
if docker exec rb-postgres pg_dump --version &>/dev/null 2>&1; then
  log "Using docker exec rb-postgres..."
  docker exec rb-postgres pg_dump \
    -U "${DB_USER}" \
    -d "${DB_NAME}" \
    --no-password \
    --verbose \
    --format=plain \
    2>&1 | gzip > "${FILEPATH}"
else
  # Напрямую через pg_dump с паролем через PGPASSWORD
  log "Using local pg_dump..."
  PGPASSWORD="${DB_PASS}" pg_dump \
    -h "${DB_HOST}" \
    -p "${DB_PORT}" \
    -U "${DB_USER}" \
    -d "${DB_NAME}" \
    --verbose \
    --format=plain \
    2>&1 | gzip > "${FILEPATH}"
fi

BACKUP_SIZE=$(du -sh "${FILEPATH}" | cut -f1)
log "Backup created: ${FILEPATH} (${BACKUP_SIZE})"

# =============================================================================
# Удаление старых бэкапов
# =============================================================================

log "Removing backups older than ${RETAIN_DAYS} days..."
find "${BACKUP_DIR}" -name "backup_*.sql.gz" -mtime "+${RETAIN_DAYS}" -delete
REMAINING=$(find "${BACKUP_DIR}" -name "backup_*.sql.gz" | wc -l)
log "Remaining backups: ${REMAINING}"

log "Backup completed successfully"
