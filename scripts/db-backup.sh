#!/bin/bash

# Database Backup Script
# Creates timestamped backups of the PostgreSQL database

set -e

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Load environment variables from .env if it exists
if [ -f .env ]; then
  export $(cat .env | grep -v '^#' | xargs)
fi

# Configuration
BACKUP_DIR="${BACKUP_DIR:-./backups}"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="$BACKUP_DIR/notification_db_$TIMESTAMP.sql"
CONTAINER_NAME="${CONTAINER_NAME:-notification-postgres}"

# Database credentials (from environment or defaults)
DB_NAME="${POSTGRES_DB:-notification_db}"
DB_USER="${POSTGRES_USER:-notification_user}"
DB_HOST="${POSTGRES_HOST:-localhost}"
DB_PORT="${POSTGRES_PORT:-5432}"

echo -e "${YELLOW}Starting database backup...${NC}"

# Create backup directory if it doesn't exist
mkdir -p "$BACKUP_DIR"

# Check if running with Docker or local PostgreSQL
if docker ps | grep -q "$CONTAINER_NAME"; then
  echo -e "${GREEN}Using Docker container: $CONTAINER_NAME${NC}"

  # Backup using Docker exec
  docker exec -t "$CONTAINER_NAME" pg_dump -U "$DB_USER" "$DB_NAME" > "$BACKUP_FILE"

else
  echo -e "${GREEN}Using local PostgreSQL${NC}"

  # Backup using local pg_dump
  PGPASSWORD="$POSTGRES_PASSWORD" pg_dump -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" "$DB_NAME" > "$BACKUP_FILE"

fi

# Check if backup was successful
if [ $? -eq 0 ]; then
  BACKUP_SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
  echo -e "${GREEN}Backup completed successfully!${NC}"
  echo -e "${GREEN}File: $BACKUP_FILE${NC}"
  echo -e "${GREEN}Size: $BACKUP_SIZE${NC}"

  # Compress the backup
  echo -e "${YELLOW}Compressing backup...${NC}"
  gzip "$BACKUP_FILE"
  COMPRESSED_SIZE=$(du -h "$BACKUP_FILE.gz" | cut -f1)
  echo -e "${GREEN}Compressed to: $BACKUP_FILE.gz (${COMPRESSED_SIZE})${NC}"

  # Optional: Keep only last N backups (default: 7)
  KEEP_BACKUPS="${KEEP_BACKUPS:-7}"
  echo -e "${YELLOW}Cleaning up old backups (keeping last $KEEP_BACKUPS)...${NC}"
  cd "$BACKUP_DIR"
  ls -t notification_db_*.sql.gz | tail -n +$((KEEP_BACKUPS + 1)) | xargs -r rm
  echo -e "${GREEN}Cleanup complete!${NC}"

  # List current backups
  echo -e "${YELLOW}Current backups:${NC}"
  ls -lh notification_db_*.sql.gz | awk '{print $9, "(" $5 ")"}'

else
  echo -e "${RED}Backup failed!${NC}"
  exit 1
fi