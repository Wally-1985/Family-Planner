# Family Planner — Project Memory

## What this app is
A local-first family household management web app.
Runs as a Docker Compose stack on a home server (192.168.10.14).
nginx serves the built React SPA and proxies `/api/` to the FastAPI backend.

## Architecture

```
app/
  frontend/           React 18 + TypeScript + Vite
    src/
      main.tsx        App shell, Sidebar, TopBar, ProfileSelectScreen, routing
      types.ts        All shared TypeScript types, constants, helper functions
      styles.css      Single CSS file (custom properties, no CSS framework)
      pages/
        Dashboard.tsx       Dashboard, HeroCard, MetricCard
        FamilyBudget.tsx    FamilyBudget (Projections), FamilyBudgetDashboard, ActualCostsPage
        TaxReceipts.tsx     TaxReceipts, ProcessedReceipts, SharePointFieldInput, helpers
        Todo.tsx            TodoPage, TaskManagementPage, TaskDetailPanel, AssigneeToggle, TaskRow
        Settings.tsx        SettingsPage (all sections: general, sharepoint, ai-ocr, family-budget, users, smtp, backup, bank)
      components/
        ComingSoon.tsx      Generic placeholder for unbuilt pages

  backend/            FastAPI + Python 3.12 + uvicorn
    app/
      __init__.py     Empty — makes the directory a Python package
      main.py         FastAPI app, all route handlers
      models.py       All Pydantic models
      db.py           env(), path constants, DEFAULT_PAGE_PERMISSIONS, DB helpers for all features

  nginx/              nginx config — serves /static from built frontend, proxies /api/ to backend:8000
```

## Key technologies
- Frontend: React 18, TypeScript, Vite, lucide-react icons, recharts
- Backend: FastAPI, Pydantic v2, uvicorn, python-dotenv, SQLite
- Container: Docker Compose, nginx

## Data storage
All data is SQLite on the server. Files live in the backend container's `/data/` volume:
- `receipt_drafts.sqlite3`  — OCR/AI draft state per SharePoint file
- `family_budget.sqlite3`   — budget items, savings, categories, actuals, user_profiles
- `tasks.sqlite3`           — tasks, subtasks (with assigned_to as JSON array)
- `roster.sqlite3`          — daily roster schedules

Secrets (.env) are stored server-side only, never in browser localStorage.

## Pages / sidebar nav

| Page key | Route in UI | Description |
|---|---|---|
| dashboard | Dashboard | Receipt stats + charts |
| receipts-inbox | Tax Receipts › Inbox | SharePoint input folder, OCR/AI queue |
| processed-receipts | Tax Receipts › Processed | Completed receipts archive |
| family-dashboard | Family Budget | Projection vs Actual comparison |
| family-projections | Family Budget › Projections | Budget schedule + weekly projection table |
| family-actuals | Family Budget › Actual Costs | CSV import + manual transaction entry |
| todo | To Do | Personal task view (role-filtered) with subtasks |
| task-management | Task Management | Admin CRUD for tasks + subtasks with assignees |
| settings-general | Settings › General | Theme, timezone, backup & restore |
| settings-sharepoint | Settings › SharePoint | SharePoint config |
| settings-ai-ocr | Settings › AI+OCR | OCR/AI config |
| settings-family-budget | Settings › Family Budget | Budget config |
| settings-users | Settings › Users | Profile/permission management |
| settings-smtp | Settings › SMTP | Email config |
| settings-bank | Settings › Bank | Bank feed config |

## Task / Subtask system

### assigned_to field
Both tasks and subtasks store `assigned_to` as a JSON array in SQLite:
- `["everyone"]` — visible to all
- `["profile-uuid-1", "profile-uuid-2"]` — specific people
- Helpers: `_parse_assigned_to(raw)` → `list[str]`, `_serialise_assigned_to(val)` → JSON string

### To Do page (TodoPage)
- User role: only sees tasks assigned to them or 'everyone'
- Administrator role: sees all tasks
- Subtask assignee labels shown inline after subtask title (e.g. `— Isaac, Max`)
- No separate detail panel; editing opens in-place

### Task Management page (TaskManagementPage)
- Two-column edit form: task fields left, subtask manager right
- `AssigneeToggle` component: button-group multi-select for profile assignment
- Auto-assign: assigning a subtask to someone automatically adds them to parent task
- `assignSubtask` fetches fresh task data to avoid stale React closure issues
- `setEditingTask` synced after auto-assign so Save doesn't overwrite DB update

### AssigneeToggle component
```tsx
function AssigneeToggle({ value, onChange, userProfiles, compact }) {
  // value: string[] — ['everyone'] or array of profile IDs
  // Falls back to ['everyone'] if empty
}
```

## User profiles / permissions
- Stored in `family_budget.sqlite3` → `user_profiles` table
- `DEFAULT_PAGE_PERMISSIONS` in db.py is the allowlist — any permission not in this list is stripped on save
- Includes: `settings-general`, `todo`, `task-management`, all other page keys
- Roles: `Administrator` (sees everything), `User` (sees own tasks only)
- PIN-protected: profile tiles hidden while PIN entry is active

## Settings — General page
- Theme: light / dark / system
- Timezone: dropdown, default `Australia/Brisbane`
- Backup & Restore: download full .zip of all data, or restore from backup zip
- `SettingsState.timezone: string` added to types.ts and defaultSettings

## Development workflow
```bash
# SSH to server
ssh utilities@192.168.10.14
cd /home/utilities/.openclaw/workspace/Family-Planner

# Build frontend (catches TypeScript errors)
cd app/frontend && npx vite build && cd ../..

# Rebuild containers
docker compose up --build -d

# Check health
curl http://localhost/api/health

# View logs
docker compose logs -f backend
docker compose logs -f frontend
```

## Important conventions
- Python backend uses relative imports: `from .models import ...`, `from .db import ...`
- `from __future__ import annotations` at top of all Python files
- Frontend type imports: `import type { ... } from '../types'`
- Budget dates: DD/MM/YYYY internally; YYYY-MM-DD for `<input type=date>`
- Budget week runs Tuesday–Monday
- Money formatted as AUD with `formatMoney()` (no cents)
- assigned_to always stored as JSON array string in SQLite, parsed on read

## Key bug fixes history
- `_parse_assigned_to` / `_serialise_assigned_to` added for backward-compat JSON storage
- `create_subtask` fixed: `data` parameter was referenced as `patch` in `update_task`
- `ALTER TABLE subtasks ADD COLUMN assigned_to` — string quoting in Python heredoc fixed
- Auto-assign stale closure: fixed by fresh API fetch instead of reading React state
- `saveEditTask` overwriting auto-assign: fixed by syncing `editingTask` state after patch
- `DEFAULT_PAGE_PERMISSIONS` missing `settings-general`: caused permission to be dropped on save
