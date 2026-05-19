# Finances App

Local-first finance management web app for personal/family finance workflows, starting with Tax Receipts automation and Family Budget planning.

## Current modules

- Dashboard with progress cards and charts
- Tax Receipts:
  - SharePoint Inbox queue
  - PDF preview and OCR/AI draft extraction
  - editable SharePoint metadata review
  - approve/move workflow for processed receipts
- Family Budget:
  - income and expense schedules
  - actual costs import/manual transaction entry
  - projection ranges: Entire Year, Remaining Year, Current Month, Current Fortnight, Current Week, Custom Date Range
  - category bar/pie charts and weekly cashflow projection
- Settings:
  - SharePoint Graph connector settings
  - AI/OCR settings and field definitions
  - Family Budget categories
  - future bank account connector placeholder
- FastAPI backend with local SQLite/JSON data storage
- Docker Compose deployment for a permanent local server/computer

## Quick start: server/Docker

```bash
cp .env.example .env
mkdir -p data/cache data/uploads data/backups
docker compose up -d --build
```

Open:

- Frontend: <http://localhost:5174>
- Backend health: <http://localhost:8088/api/health>

For full server setup, see [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Local frontend development

Run the backend first, then:

```bash
cd app/frontend
npm install
npm run dev
```

Open: <http://localhost:5174>

## Local backend development

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r app/backend/requirements.txt
cd app/backend
uvicorn app.main:app --host 127.0.0.1 --port 8088
```

## Backups and migration

Application data is stored under `data/`. Create a backup with:

```bash
./scripts/backup-data.sh
```

Restore on another computer with:

```bash
./scripts/restore-data.sh /path/to/finances-data-YYYYMMDD-HHMMSS.tar.gz
```

See [docs/BACKUP_RESTORE.md](docs/BACKUP_RESTORE.md) for the complete migration process.

## Security notes

- Do not commit `.env`, SQLite databases, uploads, backups, or real Microsoft/AI/bank credentials.
- Financial/tax documents are sensitive. Keep the server private unless HTTPS and authentication are added.
- Settings UI is for connector configuration, but credentials/tokens belong server-side.
- See [docs/SHAREPOINT_GRAPH_SETUP.md](docs/SHAREPOINT_GRAPH_SETUP.md) for Microsoft Graph setup.
