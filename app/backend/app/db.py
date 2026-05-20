from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import psycopg
from psycopg.rows import dict_row
from dotenv import load_dotenv

from .models import (
    ActualCostTransaction,
    FamilyBudgetItem,
    ReceiptDraft,
    SavingsAccount,
    UserProfile,
)


def env(name: str, default: str = "") -> str:
    return os.getenv(name, default)


def default_project_root() -> Path:
    parents = Path(__file__).resolve().parents
    return parents[3] if len(parents) > 3 else Path("/app")


PROJECT_ROOT = Path(os.getenv("PROJECT_ROOT", str(default_project_root())))
ENV_PATH = Path(os.getenv("ENV_PATH", str(PROJECT_ROOT / ".env")))
load_dotenv(ENV_PATH)

DATA_DIR = Path(os.getenv("DATA_DIR", str(PROJECT_ROOT / "data")))
BACKUP_DIR = DATA_DIR / "backups"

DATABASE_URL = env("DATABASE_URL", "postgresql://finances:change-me-local-only@postgres:5432/finances")

DEFAULT_PAGE_PERMISSIONS = [
    "dashboard",
    "receipts-inbox",
    "processed-receipts",
    "family-dashboard",
    "family-projections",
    "family-actuals",
    "todo",
    "todo-manage",
    "business",
    "settings-general",
    "settings-ai-ocr",
    "settings-family-budget",
    "settings-users",
    "settings-bank",
]

DEFAULT_USER_PROFILES = [
    {"id": "owner", "name": "Owner", "role": "Administrator", "pin": "", "email": "", "permissions": DEFAULT_PAGE_PERMISSIONS},
    {"id": "family", "name": "Family", "role": "User", "pin": "", "email": "", "permissions": ["dashboard", "family-dashboard", "family-projections", "family-actuals"]},
]


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def get_conn() -> psycopg.Connection:
    return psycopg.connect(DATABASE_URL, row_factory=dict_row)


def init_db() -> None:
    """Create all tables if they don't exist. Called once at startup."""
    with get_conn() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS receipt_drafts (
                item_id TEXT PRIMARY KEY,
                status TEXT NOT NULL,
                message TEXT NOT NULL DEFAULT '',
                ocr_text TEXT NOT NULL DEFAULT '',
                suggestions_json TEXT NOT NULL DEFAULT '{}',
                confidence DOUBLE PRECISION,
                updated_at TEXT NOT NULL
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS family_budget_items (
                id TEXT PRIMARY KEY,
                kind TEXT NOT NULL,
                name TEXT NOT NULL,
                supplier TEXT NOT NULL DEFAULT '',
                amount DOUBLE PRECISION NOT NULL DEFAULT 0,
                cycle TEXT NOT NULL DEFAULT 'weekly',
                schedule TEXT NOT NULL DEFAULT 'recurring',
                interval_count INTEGER NOT NULL DEFAULT 1,
                interval_unit TEXT NOT NULL DEFAULT 'week',
                anchor_date TEXT NOT NULL DEFAULT '',
                end_date TEXT NOT NULL DEFAULT '',
                day_of_month INTEGER,
                days_of_month_json TEXT NOT NULL DEFAULT '[]',
                months_json TEXT NOT NULL DEFAULT '[]',
                due_dates_json TEXT NOT NULL DEFAULT '[]',
                category TEXT NOT NULL DEFAULT '',
                note TEXT NOT NULL DEFAULT '',
                updated_at TEXT NOT NULL
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS savings_accounts (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                balance DOUBLE PRECISION NOT NULL DEFAULT 0,
                note TEXT NOT NULL DEFAULT '',
                updated_at TEXT NOT NULL
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS family_budget_categories (
                name TEXT PRIMARY KEY,
                sort_order INTEGER NOT NULL DEFAULT 0,
                updated_at TEXT NOT NULL
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS actual_cost_transactions (
                id TEXT PRIMARY KEY,
                date TEXT NOT NULL DEFAULT '',
                description TEXT NOT NULL DEFAULT '',
                amount DOUBLE PRECISION NOT NULL DEFAULT 0,
                account TEXT NOT NULL DEFAULT '',
                category TEXT NOT NULL DEFAULT '',
                notes TEXT NOT NULL DEFAULT '',
                updated_at TEXT NOT NULL
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS chores (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                description TEXT NOT NULL DEFAULT '',
                assigned_to TEXT NOT NULL DEFAULT 'everyone',
                added_by TEXT NOT NULL DEFAULT '',
                done BOOLEAN NOT NULL DEFAULT FALSE,
                created_at TEXT NOT NULL
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS tasks (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                description TEXT NOT NULL DEFAULT '',
                assigned_to TEXT NOT NULL DEFAULT '["everyone"]',
                added_by TEXT NOT NULL DEFAULT '',
                schedule TEXT NOT NULL DEFAULT 'once-off',
                interval_count INTEGER NOT NULL DEFAULT 1,
                interval_unit TEXT NOT NULL DEFAULT 'week',
                anchor_date TEXT NOT NULL DEFAULT '',
                days_of_month_json TEXT NOT NULL DEFAULT '[]',
                months_json TEXT NOT NULL DEFAULT '[]',
                due_dates_json TEXT NOT NULL DEFAULT '[]',
                due_date TEXT NOT NULL DEFAULT '',
                end_date TEXT NOT NULL DEFAULT '',
                rule_note TEXT NOT NULL DEFAULT '',
                is_template BOOLEAN NOT NULL DEFAULT FALSE,
                template_id TEXT NOT NULL DEFAULT '',
                done BOOLEAN NOT NULL DEFAULT FALSE,
                done_date TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS subtasks (
                id TEXT PRIMARY KEY,
                task_id TEXT NOT NULL,
                title TEXT NOT NULL,
                done BOOLEAN NOT NULL DEFAULT FALSE,
                sort_order INTEGER NOT NULL DEFAULT 0,
                assigned_to TEXT NOT NULL DEFAULT '["everyone"]',
                created_at TEXT NOT NULL
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS roster_items (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                description TEXT NOT NULL DEFAULT '',
                profile_ids_json TEXT NOT NULL DEFAULT '[]',
                start_date TEXT NOT NULL DEFAULT '',
                schedule_type TEXT NOT NULL DEFAULT 'daily',
                interval INTEGER NOT NULL DEFAULT 1,
                weekdays_json TEXT NOT NULL DEFAULT '[]',
                sort_order INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS user_profiles (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                role TEXT NOT NULL DEFAULT 'User',
                pin TEXT NOT NULL DEFAULT '',
                email TEXT NOT NULL DEFAULT '',
                permissions TEXT NOT NULL DEFAULT '[]',
                updated_at TEXT NOT NULL DEFAULT ''
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS app_settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL DEFAULT '{}',
                updated_at TEXT NOT NULL
            )
        """)
        # Seed categories if empty
        row = conn.execute("SELECT COUNT(*) as cnt FROM family_budget_categories").fetchone()
        if (row["cnt"] if row else 0) == 0:
            ts = now_iso()
            for i, cat in enumerate(default_budget_categories()):
                conn.execute(
                    "INSERT INTO family_budget_categories (name, sort_order, updated_at) VALUES (%s, %s, %s) ON CONFLICT (name) DO NOTHING",
                    (cat, i, ts)
                )
        # Seed user profiles if empty
        row = conn.execute("SELECT COUNT(*) as cnt FROM user_profiles").fetchone()
        if (row["cnt"] if row else 0) == 0:
            ts = now_iso()
            for p in DEFAULT_USER_PROFILES:
                conn.execute(
                    "INSERT INTO user_profiles (id, name, role, pin, email, permissions, updated_at) VALUES (%s, %s, %s, %s, %s, %s, %s) ON CONFLICT (id) DO NOTHING",
                    (p["id"], p["name"], p["role"], p["pin"], p["email"], json.dumps(p["permissions"]), ts)
                )


# ---------------------------------------------------------------------------
# app_settings table — replaces all JSON config files and .env writes
# ---------------------------------------------------------------------------

def get_app_setting(key: str) -> dict | list | None:
    with get_conn() as conn:
        row = conn.execute("SELECT value FROM app_settings WHERE key = %s", (key,)).fetchone()
    if row is None:
        return None
    try:
        return json.loads(row["value"])
    except Exception:
        return None


def set_app_setting(key: str, value: Any) -> None:
    ts = now_iso()
    serialized = json.dumps(value)
    with get_conn() as conn:
        conn.execute(
            """INSERT INTO app_settings (key, value, updated_at) VALUES (%s, %s, %s)
               ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at""",
            (key, serialized, ts)
        )


# Mapping of env-var names → (app_settings key, field name)
_ENV_TO_SETTING: dict[str, tuple[str, str]] = {
    "SMTP_HOST": ("smtp", "host"),
    "SMTP_PORT": ("smtp", "port"),
    "SMTP_USERNAME": ("smtp", "username"),
    "SMTP_PASSWORD": ("smtp", "password"),
    "SMTP_FROM_EMAIL": ("smtp", "from_email"),
    "SMTP_USE_TLS": ("smtp", "use_tls"),
    "MS_TENANT_DOMAIN": ("sharepoint", "tenant_domain"),
    "MS_TENANT_ID": ("sharepoint", "tenant_id"),
    "MS_CLIENT_ID": ("sharepoint", "client_id"),
    "MS_CLIENT_SECRET": ("sharepoint", "client_secret"),
    "MS_CLIENT_SECRET_EXPIRES_ON": ("sharepoint", "client_secret_expires_on"),
    "SHAREPOINT_SITE_URL": ("sharepoint", "site_url"),
    "SHAREPOINT_SITE_ID": ("sharepoint", "site_id"),
    "SHAREPOINT_DRIVE_ID": ("sharepoint", "drive_id"),
    "SHAREPOINT_DOCUMENT_LIBRARY": ("sharepoint", "library_name"),
    "SHAREPOINT_INPUT_FOLDER": ("sharepoint", "input_folder"),
    "SHAREPOINT_OUTPUT_FOLDER": ("sharepoint", "output_folder"),
    "AI_PROVIDER": ("ai", "provider"),
    "AI_MODEL": ("ai", "model"),
    "AI_BASE_URL": ("ai", "base_url"),
    "AI_API_KEY": ("ai", "api_key"),
}


def update_env_file(updates: dict[str, str]) -> None:
    """Write settings to PostgreSQL app_settings (replaces .env file writes)."""
    groups: dict[str, dict] = {}
    for env_key, value in updates.items():
        if env_key not in _ENV_TO_SETTING:
            continue
        setting_key, field = _ENV_TO_SETTING[env_key]
        if setting_key not in groups:
            existing = get_app_setting(setting_key)
            groups[setting_key] = dict(existing) if isinstance(existing, dict) else {}
        groups[setting_key][field] = value
        os.environ[env_key] = value
    for setting_key, data in groups.items():
        set_app_setting(setting_key, data)


def get_smtp_config() -> dict[str, Any]:
    stored = get_app_setting("smtp")
    cfg = dict(stored) if isinstance(stored, dict) else {}
    return {
        "host": cfg.get("host") or env("SMTP_HOST", ""),
        "port": cfg.get("port") or env("SMTP_PORT", "587"),
        "username": cfg.get("username") or env("SMTP_USERNAME", ""),
        "password": cfg.get("password") or env("SMTP_PASSWORD", ""),
        "from_email": cfg.get("from_email") or env("SMTP_FROM_EMAIL", ""),
        "use_tls": cfg.get("use_tls", env("SMTP_USE_TLS", "true").lower() not in {"false", "0", "no"}),
    }


def get_sharepoint_config() -> dict[str, Any]:
    stored = get_app_setting("sharepoint")
    cfg = dict(stored) if isinstance(stored, dict) else {}
    return {
        "tenant_domain": cfg.get("tenant_domain") or env("MS_TENANT_DOMAIN", ""),
        "tenant_id": cfg.get("tenant_id") or env("MS_TENANT_ID", ""),
        "client_id": cfg.get("client_id") or env("MS_CLIENT_ID", ""),
        "client_secret": cfg.get("client_secret") or env("MS_CLIENT_SECRET", ""),
        "client_secret_expires_on": cfg.get("client_secret_expires_on") or env("MS_CLIENT_SECRET_EXPIRES_ON", ""),
        "site_url": cfg.get("site_url") or env("SHAREPOINT_SITE_URL", ""),
        "site_id": cfg.get("site_id") or env("SHAREPOINT_SITE_ID", ""),
        "drive_id": cfg.get("drive_id") or env("SHAREPOINT_DRIVE_ID", ""),
        "library_name": cfg.get("library_name") or env("SHAREPOINT_DOCUMENT_LIBRARY", "Documents"),
        "input_folder": cfg.get("input_folder") or env("SHAREPOINT_INPUT_FOLDER", "Inbox"),
        "output_folder": cfg.get("output_folder") or env("SHAREPOINT_OUTPUT_FOLDER", "Processed/FY2025-2026"),
    }


def get_ai_config() -> dict[str, Any]:
    stored = get_app_setting("ai")
    cfg = dict(stored) if isinstance(stored, dict) else {}
    return {
        "provider": cfg.get("provider") or env("AI_PROVIDER", "OpenAI"),
        "model": cfg.get("model") or env("AI_MODEL", "gpt-4o-mini"),
        "base_url": cfg.get("base_url") or env("AI_BASE_URL", "https://api.openai.com/v1"),
        "api_key": cfg.get("api_key") or env("AI_API_KEY", ""),
    }


def get_frontend_settings() -> dict[str, Any]:
    data = get_app_setting("frontend_settings")
    return dict(data) if isinstance(data, dict) else {}


def save_frontend_settings(settings: dict[str, Any]) -> None:
    set_app_setting("frontend_settings", settings)


# ---------------------------------------------------------------------------
# JSON config file replacements (now stored in app_settings table)
# ---------------------------------------------------------------------------

def load_ai_field_definitions() -> dict[str, str]:
    data = get_app_setting("ai_field_definitions")
    if not isinstance(data, dict):
        return {}
    return {str(k): str(v) for k, v in data.items()}


def write_ai_field_definitions(definitions: dict[str, str]) -> None:
    set_app_setting("ai_field_definitions", definitions)


def load_sharepoint_field_settings() -> dict[str, bool]:
    data = get_app_setting("sharepoint_field_settings")
    if not isinstance(data, dict):
        return {}
    values = data.get("show_in_input_form", data)
    if not isinstance(values, dict):
        return {}
    return {str(k): bool(v) for k, v in values.items()}


def write_sharepoint_field_settings(show_in_input_form: dict[str, bool]) -> None:
    set_app_setting("sharepoint_field_settings", {"show_in_input_form": show_in_input_form})


def read_pin_reset_tokens() -> dict[str, dict[str, str]]:
    data = get_app_setting("pin_reset_tokens")
    return dict(data) if isinstance(data, dict) else {}


def write_pin_reset_tokens(tokens: dict[str, dict[str, str]]) -> None:
    set_app_setting("pin_reset_tokens", tokens)


# ---------------------------------------------------------------------------
# Receipt drafts
# ---------------------------------------------------------------------------

def empty_draft(item_id: str) -> ReceiptDraft:
    return ReceiptDraft(item_id=item_id, status="not-started", message="OCR has not been run yet.")


def get_draft(item_id: str) -> ReceiptDraft:
    with get_conn() as conn:
        row = conn.execute("SELECT * FROM receipt_drafts WHERE item_id = %s", (item_id,)).fetchone()
    if row is None:
        return empty_draft(item_id)
    return ReceiptDraft(
        item_id=row["item_id"],
        status=row["status"],
        message=row["message"],
        ocr_text=row["ocr_text"],
        suggestions=json.loads(row["suggestions_json"] or "{}"),
        confidence=row["confidence"],
        updated_at=row["updated_at"],
    )


def save_draft(draft: ReceiptDraft) -> ReceiptDraft:
    draft.updated_at = now_iso()
    with get_conn() as conn:
        conn.execute(
            """INSERT INTO receipt_drafts (item_id, status, message, ocr_text, suggestions_json, confidence, updated_at)
               VALUES (%s, %s, %s, %s, %s, %s, %s)
               ON CONFLICT (item_id) DO UPDATE SET
                 status = EXCLUDED.status, message = EXCLUDED.message,
                 ocr_text = EXCLUDED.ocr_text, suggestions_json = EXCLUDED.suggestions_json,
                 confidence = EXCLUDED.confidence, updated_at = EXCLUDED.updated_at""",
            (draft.item_id, draft.status, draft.message, draft.ocr_text,
             json.dumps(draft.suggestions), draft.confidence, draft.updated_at)
        )
    return draft


def delete_draft(item_id: str) -> None:
    with get_conn() as conn:
        conn.execute("DELETE FROM receipt_drafts WHERE item_id = %s", (item_id,))


# ---------------------------------------------------------------------------
# Family budget
# ---------------------------------------------------------------------------

def default_budget_categories() -> list[str]:
    return ["Housing", "Groceries", "Car", "Utilities", "Insurance", "School", "Subscriptions", "Business", "Personal", "Once-off"]


def row_to_budget_item(row: dict) -> FamilyBudgetItem:
    return FamilyBudgetItem(
        id=row["id"],
        kind=row["kind"],
        name=row["name"],
        supplier=row["supplier"] or "",
        amount=row["amount"] or 0,
        cycle="annually" if row["cycle"] == "yearly" else row["cycle"],
        schedule="recurring" if row["schedule"] == "reoccurring" else (row["schedule"] or "recurring"),
        intervalCount=row["interval_count"] or 1,
        intervalUnit=row["interval_unit"] or "week",
        anchorDate=row["anchor_date"] or "",
        endDate=row["end_date"] or "",
        dayOfMonth=row["day_of_month"],
        daysOfMonth=json.loads(row["days_of_month_json"] or "[]"),
        months=json.loads(row["months_json"] or "[]"),
        dueDates=json.loads(row["due_dates_json"] or "[]"),
        category=row["category"] or "",
        note=row["note"] or "",
    )


def get_budget_items() -> list[FamilyBudgetItem]:
    with get_conn() as conn:
        rows = conn.execute("SELECT * FROM family_budget_items ORDER BY kind, name").fetchall()
    return [row_to_budget_item(row) for row in rows]


def replace_budget_items(items: list[FamilyBudgetItem]) -> list[FamilyBudgetItem]:
    ts = now_iso()
    with get_conn() as conn:
        conn.execute("DELETE FROM family_budget_items")
        for item in items:
            conn.execute(
                """INSERT INTO family_budget_items
                   (id, kind, name, supplier, amount, cycle, schedule, interval_count, interval_unit,
                    anchor_date, end_date, day_of_month, days_of_month_json, months_json, due_dates_json,
                    category, note, updated_at)
                   VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)""",
                (item.id, item.kind, item.name, item.supplier, item.amount, item.cycle,
                 item.schedule, item.intervalCount, item.intervalUnit, item.anchorDate,
                 item.endDate, item.dayOfMonth, json.dumps(item.daysOfMonth),
                 json.dumps(item.months), json.dumps(item.dueDates), item.category, item.note, ts)
            )
    return items


def row_to_savings_account(row: dict) -> SavingsAccount:
    return SavingsAccount(id=row["id"], name=row["name"], balance=row["balance"] or 0, note=row["note"] or "")


def get_savings_accounts() -> list[SavingsAccount]:
    with get_conn() as conn:
        rows = conn.execute("SELECT * FROM savings_accounts ORDER BY name").fetchall()
    return [row_to_savings_account(row) for row in rows]


def replace_savings_accounts(accounts: list[SavingsAccount]) -> list[SavingsAccount]:
    ts = now_iso()
    with get_conn() as conn:
        conn.execute("DELETE FROM savings_accounts")
        for a in accounts:
            conn.execute(
                "INSERT INTO savings_accounts (id, name, balance, note, updated_at) VALUES (%s, %s, %s, %s, %s)",
                (a.id, a.name, a.balance, a.note, ts)
            )
    return accounts


def get_budget_categories() -> list[str]:
    with get_conn() as conn:
        rows = conn.execute("SELECT name FROM family_budget_categories ORDER BY sort_order, name").fetchall()
    return [row["name"] for row in rows]


def replace_budget_categories(categories: list[str]) -> list[str]:
    cleaned: list[str] = []
    for cat in categories:
        name = cat.strip()
        if name and name.lower() not in [c.lower() for c in cleaned]:
            cleaned.append(name)
    ts = now_iso()
    with get_conn() as conn:
        conn.execute("DELETE FROM family_budget_categories")
        for i, name in enumerate(cleaned):
            conn.execute(
                "INSERT INTO family_budget_categories (name, sort_order, updated_at) VALUES (%s, %s, %s)",
                (name, i, ts)
            )
    return cleaned


def row_to_actual_cost(row: dict) -> ActualCostTransaction:
    return ActualCostTransaction(
        id=row["id"], date=row["date"] or "", description=row["description"] or "",
        amount=row["amount"] or 0, account=row["account"] or "",
        category=row["category"] or "", notes=row["notes"] or "",
    )


def get_actual_costs() -> list[ActualCostTransaction]:
    with get_conn() as conn:
        rows = conn.execute("SELECT * FROM actual_cost_transactions ORDER BY date DESC, description").fetchall()
    return [row_to_actual_cost(row) for row in rows]


def replace_actual_costs(transactions: list[ActualCostTransaction]) -> list[ActualCostTransaction]:
    ts = now_iso()
    with get_conn() as conn:
        conn.execute("DELETE FROM actual_cost_transactions")
        for t in transactions:
            conn.execute(
                "INSERT INTO actual_cost_transactions (id, date, description, amount, account, category, notes, updated_at) VALUES (%s, %s, %s, %s, %s, %s, %s, %s)",
                (t.id, t.date, t.description, t.amount, t.account, t.category, t.notes, ts)
            )
    return transactions


# ---------------------------------------------------------------------------
# Chores
# ---------------------------------------------------------------------------

def get_chores() -> list:
    with get_conn() as conn:
        rows = conn.execute("SELECT * FROM chores ORDER BY done ASC, created_at DESC").fetchall()
    result = []
    for row in rows:
        d = dict(row)
        d["done"] = bool(d["done"])
        result.append(d)
    return result


def create_chore(chore_id: str, title: str, description: str, assigned_to: str, added_by: str) -> dict:
    created_at = now_iso()
    with get_conn() as conn:
        conn.execute(
            "INSERT INTO chores (id, title, description, assigned_to, added_by, done, created_at) VALUES (%s, %s, %s, %s, %s, FALSE, %s)",
            (chore_id, title, description, assigned_to, added_by, created_at)
        )
    return {"id": chore_id, "title": title, "description": description, "assigned_to": assigned_to, "added_by": added_by, "done": False, "created_at": created_at}


def update_chore_done(chore_id: str, done: bool) -> bool:
    with get_conn() as conn:
        cur = conn.execute("UPDATE chores SET done = %s WHERE id = %s", (done, chore_id))
    return cur.rowcount > 0


def delete_chore(chore_id: str) -> bool:
    with get_conn() as conn:
        cur = conn.execute("DELETE FROM chores WHERE id = %s", (chore_id,))
    return cur.rowcount > 0


# ---------------------------------------------------------------------------
# User profiles (replaces user_profiles.json)
# ---------------------------------------------------------------------------

def get_user_profiles() -> list[UserProfile]:
    with get_conn() as conn:
        rows = conn.execute("SELECT * FROM user_profiles ORDER BY updated_at").fetchall()
    if not rows:
        return [UserProfile(**p) for p in DEFAULT_USER_PROFILES]
    profiles = []
    for row in rows:
        perms = json.loads(row["permissions"] or "[]")
        role = row["role"] if row["role"] in {"Administrator", "User"} else "User"
        profiles.append(UserProfile(
            id=row["id"], name=row["name"], role=role,
            pin=row["pin"] or "", email=row["email"] or "", permissions=perms,
        ))
    return profiles


def save_user_profiles(profiles: list[UserProfile]) -> list[UserProfile]:
    with get_conn() as conn:
        existing_ids = {row["id"] for row in conn.execute("SELECT id FROM user_profiles").fetchall()}

    clean = [p for p in profiles if p.id.strip() and p.name.strip()]
    new_ids = {p.id for p in clean}
    removed_ids = existing_ids - new_ids
    if removed_ids:
        _cleanup_removed_profiles(removed_ids)

    ts = now_iso()
    with get_conn() as conn:
        for rid in removed_ids:
            conn.execute("DELETE FROM user_profiles WHERE id = %s", (rid,))
        for p in clean:
            perms = [perm for perm in p.permissions if perm in DEFAULT_PAGE_PERMISSIONS]
            conn.execute(
                """INSERT INTO user_profiles (id, name, role, pin, email, permissions, updated_at)
                   VALUES (%s, %s, %s, %s, %s, %s, %s)
                   ON CONFLICT (id) DO UPDATE SET
                     name = EXCLUDED.name, role = EXCLUDED.role, pin = EXCLUDED.pin,
                     email = EXCLUDED.email, permissions = EXCLUDED.permissions,
                     updated_at = EXCLUDED.updated_at""",
                (p.id, p.name, p.role, p.pin, p.email, json.dumps(perms), ts)
            )
    return [
        UserProfile(**{**p.model_dump(), "permissions": [perm for perm in p.permissions if perm in DEFAULT_PAGE_PERMISSIONS]})
        for p in clean
    ]


def _cleanup_removed_profiles(removed_ids: set[str]) -> None:
    with get_conn() as conn:
        rows = conn.execute("SELECT id, assigned_to FROM tasks").fetchall()
        for row in rows:
            ids = _parse_assigned_to(row["assigned_to"])
            new_ids = [i for i in ids if i not in removed_ids]
            if len(new_ids) != len(ids):
                new_assigned = new_ids if new_ids else ["everyone"]
                conn.execute("UPDATE tasks SET assigned_to = %s WHERE id = %s",
                             (_serialise_assigned_to(new_assigned), row["id"]))
        rows = conn.execute("SELECT id, profile_ids_json FROM roster_items").fetchall()
        for row in rows:
            ids = json.loads(row["profile_ids_json"] or "[]")
            new_ids = [i for i in ids if i not in removed_ids]
            if len(new_ids) != len(ids):
                conn.execute("UPDATE roster_items SET profile_ids_json = %s WHERE id = %s",
                             (json.dumps(new_ids), row["id"]))


# ---------------------------------------------------------------------------
# Tasks & subtasks
# ---------------------------------------------------------------------------

def _parse_assigned_to(raw: str | None) -> list[str]:
    if not raw:
        return ["everyone"]
    if raw.startswith("["):
        try:
            return json.loads(raw)
        except Exception:
            return ["everyone"]
    return ["everyone"] if raw == "everyone" else [raw]


def _serialise_assigned_to(val: Any) -> str:
    if isinstance(val, list):
        return json.dumps(val)
    if val == "everyone" or not val:
        return json.dumps(["everyone"])
    return json.dumps([val])


def row_to_task(row: dict) -> dict:
    return {
        "id": row["id"],
        "title": row["title"],
        "description": row.get("description") or "",
        "assigned_to": _parse_assigned_to(row.get("assigned_to")),
        "added_by": row.get("added_by") or "",
        "schedule": row.get("schedule") or "once-off",
        "interval_count": row.get("interval_count") or 1,
        "interval_unit": row.get("interval_unit") or "week",
        "anchor_date": row.get("anchor_date") or "",
        "days_of_month": json.loads(row.get("days_of_month_json") or "[]") or [],
        "months": json.loads(row.get("months_json") or "[]") or [],
        "due_dates": json.loads(row.get("due_dates_json") or "[]") or [],
        "due_date": row.get("due_date") or "",
        "end_date": row.get("end_date") or "",
        "rule_note": row.get("rule_note") or "",
        "is_template": bool(row.get("is_template")),
        "template_id": row.get("template_id") or "",
        "done": bool(row.get("done")),
        "done_date": row.get("done_date") or "",
        "created_at": row["created_at"],
    }


def get_tasks() -> list:
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT * FROM tasks ORDER BY is_template DESC, done ASC, due_date ASC, created_at DESC"
        ).fetchall()
    return [row_to_task(r) for r in rows]


def get_subtasks(task_id: str) -> list[dict]:
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT * FROM subtasks WHERE task_id = %s ORDER BY sort_order, created_at", (task_id,)
        ).fetchall()
    return [{"id": r["id"], "task_id": r["task_id"], "title": r["title"],
             "done": bool(r["done"]), "sort_order": r["sort_order"],
             "assigned_to": _parse_assigned_to(r.get("assigned_to")),
             "created_at": r["created_at"]}
            for r in rows]


def create_subtask(task_id: str, data: dict) -> dict:
    import uuid
    sid = str(uuid.uuid4())
    created_at = now_iso()
    title = data.get("title", "")
    assigned_to_raw = _serialise_assigned_to(data.get("assigned_to", ["everyone"]))
    with get_conn() as conn:
        row = conn.execute("SELECT COALESCE(MAX(sort_order),0) as mo FROM subtasks WHERE task_id = %s", (task_id,)).fetchone()
        max_order = (row["mo"] if row else 0) or 0
        conn.execute(
            "INSERT INTO subtasks (id, task_id, title, done, sort_order, assigned_to, created_at) VALUES (%s,%s,%s,FALSE,%s,%s,%s)",
            (sid, task_id, title, max_order + 1, assigned_to_raw, created_at)
        )
    return {"id": sid, "task_id": task_id, "title": title, "done": False,
            "sort_order": max_order + 1, "assigned_to": _parse_assigned_to(assigned_to_raw), "created_at": created_at}


def update_subtask(subtask_id: str, patch: dict) -> bool:
    allowed = {"title", "done", "sort_order", "assigned_to"}
    fields = {k: v for k, v in patch.items() if k in allowed and v is not None}
    if not fields:
        return False
    if "assigned_to" in fields:
        fields["assigned_to"] = _serialise_assigned_to(fields["assigned_to"])
    set_clause = ", ".join(f"{k} = %s" for k in fields)
    with get_conn() as conn:
        cur = conn.execute(f"UPDATE subtasks SET {set_clause} WHERE id = %s", (*fields.values(), subtask_id))
    return cur.rowcount > 0


def delete_subtask(subtask_id: str) -> bool:
    with get_conn() as conn:
        cur = conn.execute("DELETE FROM subtasks WHERE id = %s", (subtask_id,))
    return cur.rowcount > 0


def _spawn_instance(conn: psycopg.Connection, template_row: dict, due_date: str) -> None:
    import secrets as _sec
    new_id = _sec.token_hex(8)
    conn.execute(
        """INSERT INTO tasks
           (id, title, description, assigned_to, added_by, schedule,
            interval_count, interval_unit, anchor_date,
            days_of_month_json, months_json, due_dates_json,
            due_date, end_date, rule_note, is_template, template_id, done, done_date, created_at)
           VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, FALSE, %s, FALSE, '', %s)
           ON CONFLICT (id) DO NOTHING""",
        (new_id,
         template_row["title"], template_row.get("description") or "",
         _serialise_assigned_to(_parse_assigned_to(template_row.get("assigned_to"))),
         template_row.get("added_by") or "",
         template_row.get("schedule") or "once-off",
         template_row.get("interval_count") or 1,
         template_row.get("interval_unit") or "week",
         template_row.get("anchor_date") or "",
         template_row.get("days_of_month_json") or "[]",
         template_row.get("months_json") or "[]",
         template_row.get("due_dates_json") or "[]",
         due_date,
         template_row.get("end_date") or "",
         template_row.get("rule_note") or "",
         template_row["id"],
         now_iso())
    )


def create_task(data: dict) -> dict:
    import secrets as _sec
    task_id = _sec.token_hex(8)
    created = now_iso()
    schedule = data.get("schedule", "once-off")
    is_template = schedule in ("recurring", "random", "weekdays")
    with get_conn() as conn:
        conn.execute(
            """INSERT INTO tasks
               (id, title, description, assigned_to, added_by, schedule,
                interval_count, interval_unit, anchor_date,
                days_of_month_json, months_json, due_dates_json,
                due_date, end_date, rule_note, is_template, template_id, done, done_date, created_at)
               VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, '', FALSE, '', %s)""",
            (task_id, data.get("title", ""), data.get("description", ""),
             _serialise_assigned_to(data.get("assigned_to", ["everyone"])),
             data.get("added_by", ""), schedule,
             data.get("interval_count", 1), data.get("interval_unit", "week"),
             data.get("anchor_date", ""),
             json.dumps(data.get("days_of_month", []) or []),
             json.dumps(data.get("months", []) or []),
             json.dumps(data.get("due_dates", []) or []),
             data.get("due_date", ""), data.get("end_date", ""), data.get("rule_note", ""),
             is_template, created)
        )
        if is_template:
            template_row = conn.execute("SELECT * FROM tasks WHERE id = %s", (task_id,)).fetchone()
            if template_row:
                first_due = data.get("due_date", "") or data.get("anchor_date", "")
                if not first_due:
                    from datetime import date
                    first_due = date.today().isoformat()
                _spawn_instance(conn, dict(template_row), first_due)
    return {**data, "id": task_id, "is_template": bool(is_template), "template_id": "", "done": False, "done_date": "", "created_at": created}


def _next_due_for_task(row: dict, today: str) -> str:
    from datetime import date, timedelta
    from dateutil.relativedelta import relativedelta

    schedule = row.get("schedule") or "once-off"
    if schedule == "recurring":
        try:
            base = date.fromisoformat(row.get("due_date") or today)
        except ValueError:
            base = date.today()
        count = row.get("interval_count") or 1
        unit = row.get("interval_unit") or "week"
        if unit == "day":
            return (base + timedelta(days=count)).isoformat()
        if unit == "week":
            return (base + timedelta(weeks=count)).isoformat()
        if unit == "month":
            return (base + relativedelta(months=count)).isoformat()
        if unit == "year":
            return (base + relativedelta(years=count)).isoformat()
        return (base + timedelta(weeks=1)).isoformat()
    if schedule == "random":
        from datetime import date as ddate
        try:
            ref = ddate.fromisoformat(today)
        except ValueError:
            ref = ddate.today()
        days = json.loads(row.get("days_of_month_json") or "[]") or []
        allowed_months = json.loads(row.get("months_json") or "[]") or []
        if not days:
            return today
        for delta in range(1, 400):
            candidate = ref + timedelta(days=delta)
            if candidate.day in days:
                if not allowed_months or candidate.month in allowed_months:
                    return candidate.isoformat()
        return today
    if schedule == "weekdays":
        from datetime import date as ddate
        try:
            ref = ddate.fromisoformat(row.get("due_date") or today)
        except ValueError:
            ref = ddate.today()
        days = json.loads(row.get("days_of_month_json") or "[]") or []
        if not days:
            return today
        for delta in range(1, 14):
            candidate = ref + timedelta(days=delta)
            js_day = candidate.isoweekday() % 7
            if js_day in days:
                return candidate.isoformat()
        return today
    return today


def set_task_done(task_id: str, done: bool) -> bool:
    from datetime import date as _date
    today = _date.today().isoformat()
    with get_conn() as conn:
        row = conn.execute("SELECT * FROM tasks WHERE id = %s", (task_id,)).fetchone()
        if not row:
            return False
        if bool(row.get("is_template")):
            return False
        conn.execute(
            "UPDATE tasks SET done = %s, done_date = %s WHERE id = %s",
            (done, today if done else "", task_id)
        )
        if done:
            template_id = row.get("template_id") or ""
            if template_id:
                template_row = conn.execute("SELECT * FROM tasks WHERE id = %s", (template_id,)).fetchone()
                if template_row and (template_row.get("schedule") or "once-off") in ("recurring", "random", "weekdays"):
                    next_due = _next_due_for_task(dict(row), today)
                    _spawn_instance(conn, dict(template_row), next_due)
    return True


def update_task(task_id: str, data: dict) -> bool:
    if "assigned_to" in data and isinstance(data["assigned_to"], list):
        data["assigned_to"] = _serialise_assigned_to(data["assigned_to"])
    allowed = {"title", "description", "assigned_to", "schedule", "interval_count",
               "interval_unit", "anchor_date", "days_of_month", "months",
               "due_dates", "due_date", "end_date", "rule_note"}
    fields: dict = {}
    for k, v in data.items():
        if k not in allowed or v is None:
            continue
        if k == "days_of_month":
            fields["days_of_month_json"] = json.dumps(v or [])
        elif k == "months":
            fields["months_json"] = json.dumps(v or [])
        elif k == "due_dates":
            fields["due_dates_json"] = json.dumps(v or [])
        else:
            fields[k] = v
    if not fields:
        return False
    set_clause = ", ".join(f"{k} = %s" for k in fields)
    with get_conn() as conn:
        cur = conn.execute(f"UPDATE tasks SET {set_clause} WHERE id = %s", [*fields.values(), task_id])
    return cur.rowcount > 0


def delete_task(task_id: str) -> bool:
    with get_conn() as conn:
        conn.execute("DELETE FROM tasks WHERE template_id = %s AND done = FALSE", (task_id,))
        cur = conn.execute("DELETE FROM tasks WHERE id = %s", (task_id,))
    return cur.rowcount > 0


# ---------------------------------------------------------------------------
# Roster
# ---------------------------------------------------------------------------

def get_roster() -> list:
    with get_conn() as conn:
        rows = conn.execute("SELECT * FROM roster_items ORDER BY sort_order, created_at").fetchall()
    result = []
    for r in rows:
        result.append({
            "id": r["id"],
            "name": r["name"],
            "description": r.get("description") or "",
            "profile_ids": json.loads(r.get("profile_ids_json") or "[]"),
            "start_date": r.get("start_date") or "",
            "schedule_type": r.get("schedule_type") or "daily",
            "interval": r.get("interval") or 1,
            "weekdays": json.loads(r.get("weekdays_json") or "[]") or [],
            "sort_order": r.get("sort_order") or 0,
            "created_at": r["created_at"],
        })
    return sorted(result, key=lambda x: x["sort_order"])


def create_roster_item(data: dict) -> dict:
    import secrets as _sec
    item_id = _sec.token_hex(8)
    created = now_iso()
    with get_conn() as conn:
        row = conn.execute("SELECT COALESCE(MAX(sort_order), -1) as mo FROM roster_items").fetchone()
        max_order = (row["mo"] if row else -1) if row else -1
        if max_order is None:
            max_order = -1
        conn.execute(
            """INSERT INTO roster_items (id, name, description, profile_ids_json, start_date, schedule_type, interval, weekdays_json, sort_order, created_at)
               VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)""",
            (item_id, data.get("name", ""), data.get("description", ""),
             json.dumps(data.get("profile_ids", []) or []),
             data.get("start_date", ""), data.get("schedule_type", "daily"),
             data.get("interval", 1), json.dumps(data.get("weekdays", []) or []),
             max_order + 1, created)
        )
    return {**data, "id": item_id, "sort_order": max_order + 1, "created_at": created}


def update_roster_item(item_id: str, data: dict) -> bool:
    allowed = {"name", "description", "profile_ids", "start_date", "schedule_type", "interval", "weekdays", "sort_order"}
    fields: dict = {}
    for k, v in data.items():
        if k not in allowed or v is None:
            continue
        if k == "profile_ids":
            fields["profile_ids_json"] = json.dumps(v or [])
        elif k == "weekdays":
            fields["weekdays_json"] = json.dumps(v or [])
        else:
            fields[k] = v
    if not fields:
        return False
    set_clause = ", ".join(f"{k} = %s" for k in fields)
    with get_conn() as conn:
        cur = conn.execute(f"UPDATE roster_items SET {set_clause} WHERE id = %s", [*fields.values(), item_id])
    return cur.rowcount > 0


def delete_roster_item(item_id: str) -> bool:
    with get_conn() as conn:
        cur = conn.execute("DELETE FROM roster_items WHERE id = %s", (item_id,))
    return cur.rowcount > 0


def reorder_roster_items(order: list[str]) -> None:
    with get_conn() as conn:
        for i, item_id in enumerate(order):
            conn.execute("UPDATE roster_items SET sort_order = %s WHERE id = %s", (i, item_id))
