# Backup and Restore Guide

The app is local-first. The GitHub repo contains the application code; the backup zip contains the private runtime data/config needed to recreate your running system on another computer.

## What the UI backup includes

**Settings → Backup & Restore → Download full .zip backup** includes:

- `data/*.sqlite3` local databases
- `data/*.json` app settings, profile settings, field settings, etc.
- `data/uploads/` if present
- `config/.env` copied from the server `.env`, when present
- `manifest.json` with backup metadata

This backup can contain financial data, SharePoint/AI/SMTP secrets, Administrator PINs, and reset email addresses. Store it securely and do not commit it to GitHub.

## Move to another computer using GitHub + backup

1. Clone the app code:

```bash
git clone git@github.com:Wally-1985/Family-Planner.git finances-app
cd finances-app
```

2. Start the app once:

```bash
cp .env.example .env
mkdir -p data/cache data/uploads data/backups
docker compose up -d --build
```

3. Open the app in the browser.
4. Go to **Settings → Backup & Restore**.
5. Upload the full backup `.zip` and click **Restore selected .zip**.
6. Restart the app so restored `.env` settings are active:

```bash
docker compose restart
```

The restore creates a safety backup before overwriting local data/config.

## Command-line backup

The command-line script backs up `data/` only. Use the UI backup for full migration including `.env`.

```bash
./scripts/backup-data.sh
```

This creates a file like:

```text
data/backups/finances-data-20260519-133000.tar.gz
```

## Command-line restore

```bash
./scripts/restore-data.sh /path/to/finances-data-YYYYMMDD-HHMMSS.tar.gz
```

If restoring a UI full backup manually, extract:

- `data/*` into `./data/`
- `config/.env` to `./.env`

Then restart:

```bash
docker compose restart
```

## Backup frequency recommendation

For active use:

- Weekly manual backup at minimum
- Before upgrades or migrations
- After importing/categorising a large batch of transactions
- After approving or processing many receipts

Store backups somewhere separate from the computer running the app.
