# Family Planner

Local-first household management web app for family finance, task coordination, and daily scheduling.
Runs as a Docker Compose stack on a home server (192.168.10.14).

## Modules

### Task Management
- **To Do** page — personal task view; Users see only tasks assigned to them or Everyone; Administrators see all
- **Task Management** page — full CRUD for tasks and subtasks; two-column edit form (task fields + subtask manager)
- Multi-assignee support — tasks and subtasks can be assigned to multiple family members or Everyone
- Subtask inline assignee labels shown in task lists (e.g. `— Isaac, Max`)
- Auto-assign — assigning a subtask to someone automatically adds them to the parent task
- Daily roster scheduling with recurring patterns

### Tax Receipts
- SharePoint Inbox queue with OCR/AI draft extraction
- PDF preview and editable SharePoint metadata review
- Approve/move workflow for processed receipts

### Family Budget
- Income and expense schedules
- Actual costs import / manual transaction entry
- Projection ranges: Entire Year, Remaining Year, Current Month, Current Fortnight, Current Week, Custom Date Range
- Category bar/pie charts and weekly cashflow projection

### Settings
- **General** — theme (light/dark/system), timezone (default: Australia/Brisbane), Backup & Restore
- **SharePoint** — Microsoft Graph connector settings
- **AI/OCR** — OCR settings and field definitions
- **Family Budget** — budget categories
- **Users** — profile management, Administrator PINs, sidebar/page visibility permissions
- **SMTP** — system email settings (PIN reset links)
- **Bank** — future bank account connector placeholder

### Dashboard
- Receipt stats + progress cards and charts

## Quick start: server/Docker

```bash
cp .env.example .env
mkdir -p data/cache data/uploads data/backups
docker compose up -d --build
```

- Frontend: http://localhost:5174
- Backend health: http://localhost:8088/api/health

## Local frontend development

```bash
cd app/frontend
npm install
npm run dev
```

## Local backend development

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r app/backend/requirements.txt
cd app/backend
uvicorn app.main:app --host 127.0.0.1 --port 8088
```

## Architecture

```
app/
  frontend/src/
    main.tsx          — App shell, routing, sidebar, ProfileSelectScreen
    types.ts          — All TypeScript types, constants, helpers
    pages/
      Todo.tsx        — TodoPage, TaskManagementPage, TaskDetailPanel, AssigneeToggle
      Settings.tsx    — All settings sections
      Dashboard.tsx, FamilyBudget.tsx, TaxReceipts.tsx
  backend/app/
    main.py           — FastAPI routes
    db.py             — SQLite helpers, DEFAULT_PAGE_PERMISSIONS allowlist
  nginx/              — Reverse proxy (serves SPA + proxies /api/)
```

Data is stored in SQLite files under the backend's `/data/` volume:
- `family_budget.sqlite3` — budget data + user profiles
- `tasks.sqlite3` — tasks and subtasks (assigned_to stored as JSON array)
- `roster.sqlite3` — roster schedules
- `receipt_drafts.sqlite3` — OCR/AI draft state

## Backup & Restore

Use the **Settings › General** page to download a full `.zip` backup of all app data, or restore from a previous backup. The backend creates a safety backup before any restore extraction.

## Developer reference

See [docs/Development Actions.pdf](docs/Development%20Actions.pdf) for a full record of key development decisions, architectural notes, bug fixes, and the standard build/deploy workflow.

## Security notes

- Do not commit `.env`, SQLite databases, uploads, backups, or real credentials.
- Family/financial documents are sensitive — keep the server private unless HTTPS + authentication are added.
- User Profiles control app/sidebar visibility. Administrator PINs are local convenience locks, not server-side authentication.
- `DEFAULT_PAGE_PERMISSIONS` in `db.py` is the authoritative allowlist for permission keys — new pages must be added here or their permissions will be silently stripped on save.
