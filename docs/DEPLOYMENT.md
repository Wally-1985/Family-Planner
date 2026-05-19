# Deployment Guide

This app is designed to run on a small permanent computer or server with Docker Compose.

## What runs

- **Frontend:** React app built into static files and served by Nginx on port `5174`.
- **Backend:** FastAPI app on port `8088`.
- **Data:** local files under `./data` mounted into the backend container at `/data`.

The app currently uses SQLite and JSON files for local data. PostgreSQL/Redis are not required yet.

## Server requirements

- Linux server or desktop that can stay on
- Git
- Docker Engine
- Docker Compose plugin
- Network access to Microsoft Graph if SharePoint integration is used

Ubuntu/Debian example:

```bash
sudo apt update
sudo apt install -y git ca-certificates curl
# Install Docker using Docker's official instructions for your OS:
# https://docs.docker.com/engine/install/
```

## First install

```bash
git clone <YOUR_GITHUB_REPO_URL> finances-app
cd finances-app
cp .env.example .env
mkdir -p data/cache data/uploads data/backups
```

Edit `.env`:

```bash
nano .env
```

Set the real values for Microsoft Graph / SharePoint and AI only when you are ready. Do not commit `.env`.

Start the app:

```bash
docker compose up -d --build
```

Open:

- Frontend: `http://SERVER_IP:5174/`
- Backend health: `http://SERVER_IP:8088/api/health`

View logs:

```bash
docker compose logs -f
```

Stop:

```bash
docker compose down
```

Update after pulling changes:

```bash
git pull
docker compose up -d --build
```

## Firewall

Only expose what you need. For a private LAN install, ports `5174` and optionally `8088` are enough.

If exposing this outside the LAN, put it behind HTTPS and authentication first. The app handles financial/tax information and should not be published directly to the internet without hardening.

## Data location

All portable application data lives under:

```text
./data/
```

Important files include:

- `family_budget.sqlite3` — family budget schedules, actual costs, savings accounts
- `receipt_drafts.sqlite3` — local OCR/AI receipt drafts
- `ai_field_definitions.json` — AI extraction field definitions
- `sharepoint_field_settings.json` — field visibility settings
- `uploads/` — local temporary/uploaded files if used

See [BACKUP_RESTORE.md](BACKUP_RESTORE.md) before moving computers.
