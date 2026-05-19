# Backup and Restore Guide

The app is local-first. To move it to another computer, back up the `data/` directory and the private `.env` file separately.

## What to back up

Back up:

```text
data/
.env
```

Do **not** commit either to GitHub. They can contain financial data and secrets.

## Create a data backup

From the repo root:

```bash
./scripts/backup-data.sh
```

This creates a file like:

```text
data/backups/finances-data-20260519-133000.tar.gz
```

Copy that backup file somewhere safe, plus a separate copy of `.env`.

## Restore data on another computer

1. Install the app on the new computer using `docs/DEPLOYMENT.md`.
2. Copy your backup tarball onto the new computer.
3. Restore it from the repo root:

```bash
./scripts/restore-data.sh /path/to/finances-data-YYYYMMDD-HHMMSS.tar.gz
```

4. Copy your private `.env` file into the repo root:

```bash
cp /path/to/your/.env .env
```

5. Start the app:

```bash
docker compose up -d --build
```

## Manual backup alternative

If you prefer not to use the script:

```bash
tar --exclude='backups' --exclude='cache' -czf finances-data.tar.gz -C data .
```

Restore manually:

```bash
mkdir -p data
tar -xzf finances-data.tar.gz -C data
```

## Before a restore

The restore script automatically creates a safety backup of the existing `data/` folder before it extracts the new backup.

Still, if the existing server has important data, stop the app first:

```bash
docker compose down
./scripts/backup-data.sh
./scripts/restore-data.sh /path/to/new-backup.tar.gz
docker compose up -d --build
```

## Backup frequency recommendation

For active use:

- Weekly manual backup at minimum
- Before upgrades or migrations
- After importing/categorising a large batch of transactions
- After approving or processing many receipts

Store backups somewhere separate from the computer running the app.
