#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DATA_DIR="${DATA_DIR:-$ROOT_DIR/data}"
BACKUP_DIR="${BACKUP_DIR:-$DATA_DIR/backups}"
STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP_FILE="$BACKUP_DIR/finances-data-$STAMP.tar.gz"

mkdir -p "$BACKUP_DIR"

tar \
  --exclude='backups' \
  --exclude='cache' \
  -czf "$BACKUP_FILE" \
  -C "$DATA_DIR" .

printf 'Backup written: %s\n' "$BACKUP_FILE"
