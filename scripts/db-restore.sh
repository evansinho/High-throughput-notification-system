#!/bin/bash

# Database Restore Script
# Restores database from a backup file

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
CONTAINER_NAME="${CONTAINER_NAME:-notification-postgres}"

# Database credentials (from environment or defaults)
DB_NAME="${POSTGRES_DB:-notification_db}"
DB_USER="${POSTGRES_USER:-notification_user}"
DB_HOST="${POSTGRES_HOST:-localhost}"
DB_PORT="${POSTGRES_PORT:-5432}"

# Check if backup file is provided
if [ -z "$1" ]; then
  echo -e "${RED}Error: No backup file specified${NC}"
  echo "Usage: ./db-restore.sh <backup-file>"
  echo ""
  echo "Available backups:"
  ls -lh "$BACKUP_DIR"/notification_db_*.sql.gz 2>/dev/null | awk '{print $9, "(" $5 ")"}' || echo "No backups found"
  exit 1
fi

BACKUP_FILE="$1"

# Check if backup file exists
if [ ! -f "$BACKUP_FILE" ]; then
  echo -e "${RED}Error: Backup file not found: $BACKUP_FILE${NC}"
  exit 1
fi

echo -e "${RED}WARNING: This will delete all existing data in the database!${NC}"
echo -e "${YELLOW}Database: $DB_NAME${NC}"
echo -e "${YELLOW}Backup file: $BACKUP_FILE${NC}"
echo ""
read -p "Are you sure you want to continue? (yes/no): " -r
echo

if [[ ! $REPLY =~ ^[Yy]es$ ]]; then
  echo "Restore cancelled."
  exit 0
fi

echo -e "${YELLOW}Starting database restore...${NC}"

# Decompress if needed
RESTORE_FILE="$BACKUP_FILE"
if [[ "$BACKUP_FILE" == *.gz ]]; then
  echo -e "${YELLOW}Decompressing backup...${NC}"
  RESTORE_FILE="${BACKUP_FILE%.gz}"
  gunzip -c "$BACKUP_FILE" > "$RESTORE_FILE"
fi

# Check if running with Docker or local PostgreSQL
if docker ps | grep -q "$CONTAINER_NAME"; then
  echo -e "${GREEN}Using Docker container: $CONTAINER_NAME${NC}"

  # Drop and recreate database
  echo -e "${YELLOW}Dropping existing database...${NC}"
  docker exec -t "$CONTAINER_NAME" psql -U "$DB_USER" -c "DROP DATABASE IF EXISTS $DB_NAME;"
  docker exec -t "$CONTAINER_NAME" psql -U "$DB_USER" -c "CREATE DATABASE $DB_NAME;"

  # Restore using Docker exec
  echo -e "${YELLOW}Restoring database...${NC}"
  docker exec -i "$CONTAINER_NAME" psql -U "$DB_USER" "$DB_NAME" < "$RESTORE_FILE"

else
  echo -e "${GREEN}Using local PostgreSQL${NC}"

  # Drop and recreate database
  echo -e "${YELLOW}Dropping existing database...${NC}"
  PGPASSWORD="$POSTGRES_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -c "DROP DATABASE IF EXISTS $DB_NAME;"
  PGPASSWORD="$POSTGRES_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -c "CREATE DATABASE $DB_NAME;"

  # Restore database
  echo -e "${YELLOW}Restoring database...${NC}"
  PGPASSWORD="$POSTGRES_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" "$DB_NAME" < "$RESTORE_FILE"

fi

# Clean up decompressed file if we created it
if [[ "$BACKUP_FILE" == *.gz ]] && [ -f "$RESTORE_FILE" ]; then
  rm "$RESTORE_FILE"
fi

# Check if restore was successful
if [ $? -eq 0 ]; then
  echo -e "${GREEN}Database restored successfully!${NC}"
else
  echo -e "${RED}Restore failed!${NC}"
  exit 1
fi
