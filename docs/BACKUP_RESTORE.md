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

### In the app UI

Open **Settings → Backup & Restore** and click **Download .zip backup**.

This downloads a zip containing the local app data files from `data/`. It does not include `.env` secrets.

### From the command line

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

### In the app UI

1. Install and start the app on the new computer using `docs/DEPLOYMENT.md`.
2. Open **Settings → Backup & Restore**.
3. Choose the downloaded `.zip` backup.
4. Click **Restore selected .zip**.
5. Copy your private `.env` separately if SharePoint/AI credentials are needed.

The backend creates a safety backup before restoring.

### From the command line

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
