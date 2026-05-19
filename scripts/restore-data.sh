#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "Usage: $0 /path/to/finances-data-YYYYMMDD-HHMMSS.tar.gz" >&2
  exit 1
fi

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DATA_DIR="${DATA_DIR:-$ROOT_DIR/data}"
BACKUP_FILE="$1"

if [[ ! -f "$BACKUP_FILE" ]]; then
  echo "Backup file not found: $BACKUP_FILE" >&2
  exit 1
fi

mkdir -p "$DATA_DIR"

if [[ -n "$(find "$DATA_DIR" -mindepth 1 -maxdepth 1 ! -name backups -print -quit 2>/dev/null)" ]]; then
  SAFETY_BACKUP="$DATA_DIR/backups/pre-restore-$(date +%Y%m%d-%H%M%S).tar.gz"
  mkdir -p "$DATA_DIR/backups"
  tar --exclude='backups' -czf "$SAFETY_BACKUP" -C "$DATA_DIR" .
  echo "Safety backup written before restore: $SAFETY_BACKUP"
fi

tar -xzf "$BACKUP_FILE" -C "$DATA_DIR"
echo "Restored data from: $BACKUP_FILE"
