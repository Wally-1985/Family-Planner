from __future__ import annotations

import json
import os
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

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
DRAFT_DB_PATH = DATA_DIR / "receipt_drafts.sqlite3"
BUDGET_DB_PATH = DATA_DIR / "family_budget.sqlite3"
CHORES_DB_PATH = DATA_DIR / "chores.sqlite3"
FIELD_DEFINITIONS_PATH = DATA_DIR / "ai_field_definitions.json"
SHAREPOINT_FIELD_SETTINGS_PATH = DATA_DIR / "sharepoint_field_settings.json"
BACKUP_DIR = DATA_DIR / "backups"
USER_PROFILES_PATH = DATA_DIR / "user_profiles.json"
PIN_RESET_TOKENS_PATH = DATA_DIR / "pin_reset_tokens.json"

DEFAULT_PAGE_PERMISSIONS = [
    "dashboard",
    "receipts-inbox",
    "processed-receipts",
    "family-dashboard",
    "family-projections",
    "family-actuals",
    "chores",
    "business",
    "settings-sharepoint",
    "settings-ai-ocr",
    "settings-family-budget",
    "settings-users",
    "settings-backup",
    "settings-bank",
]

DEFAULT_USER_PROFILES = [
    {"id": "owner", "name": "Owner", "role": "Administrator", "pin": "", "email": "", "permissions": DEFAULT_PAGE_PERMISSIONS},
    {"id": "family", "name": "Family", "role": "User", "pin": "", "email": "", "permissions": ["dashboard", "family-dashboard", "family-projections", "family-actuals"]},
]


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def draft_db() -> sqlite3.Connection:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DRAFT_DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS receipt_drafts (
            item_id TEXT PRIMARY KEY,
            status TEXT NOT NULL,
            message TEXT NOT NULL DEFAULT '',
            ocr_text TEXT NOT NULL DEFAULT '',
            suggestions_json TEXT NOT NULL DEFAULT '{}',
            confidence REAL,
            updated_at TEXT NOT NULL
        )
        """
    )
    return conn


def empty_draft(item_id: str) -> ReceiptDraft:
    return ReceiptDraft(item_id=item_id, status="not-started", message="OCR has not been run yet.")


def get_draft(item_id: str) -> ReceiptDraft:
    with draft_db() as conn:
        row = conn.execute("SELECT * FROM receipt_drafts WHERE item_id = ?", (item_id,)).fetchone()
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
    with draft_db() as conn:
        conn.execute(
            """
            INSERT INTO receipt_drafts (item_id, status, message, ocr_text, suggestions_json, confidence, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(item_id) DO UPDATE SET
              status = excluded.status,
              message = excluded.message,
              ocr_text = excluded.ocr_text,
              suggestions_json = excluded.suggestions_json,
              confidence = excluded.confidence,
              updated_at = excluded.updated_at
            """,
            (
                draft.item_id,
                draft.status,
                draft.message,
                draft.ocr_text,
                json.dumps(draft.suggestions),
                draft.confidence,
                draft.updated_at,
            ),
        )
    return draft


def delete_draft(item_id: str) -> None:
    with draft_db() as conn:
        conn.execute("DELETE FROM receipt_drafts WHERE item_id = ?", (item_id,))


def budget_db() -> sqlite3.Connection:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(BUDGET_DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS family_budget_items (
            id TEXT PRIMARY KEY,
            kind TEXT NOT NULL,
            name TEXT NOT NULL,
            supplier TEXT NOT NULL DEFAULT '',
            amount REAL NOT NULL DEFAULT 0,
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
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS savings_accounts (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            balance REAL NOT NULL DEFAULT 0,
            note TEXT NOT NULL DEFAULT '',
            updated_at TEXT NOT NULL
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS family_budget_categories (
            name TEXT PRIMARY KEY,
            sort_order INTEGER NOT NULL DEFAULT 0,
            updated_at TEXT NOT NULL
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS actual_cost_transactions (
            id TEXT PRIMARY KEY,
            date TEXT NOT NULL DEFAULT '',
            description TEXT NOT NULL DEFAULT '',
            amount REAL NOT NULL DEFAULT 0,
            account TEXT NOT NULL DEFAULT '',
            category TEXT NOT NULL DEFAULT '',
            notes TEXT NOT NULL DEFAULT '',
            updated_at TEXT NOT NULL
        )
        """
    )
    existing_columns = {row["name"] for row in conn.execute("PRAGMA table_info(family_budget_items)").fetchall()}
    if "category" not in existing_columns:
        conn.execute("ALTER TABLE family_budget_items ADD COLUMN category TEXT NOT NULL DEFAULT ''")
    if "schedule" not in existing_columns:
        conn.execute("ALTER TABLE family_budget_items ADD COLUMN schedule TEXT NOT NULL DEFAULT 'recurring'")
    if "interval_count" not in existing_columns:
        conn.execute("ALTER TABLE family_budget_items ADD COLUMN interval_count INTEGER NOT NULL DEFAULT 1")
    if "interval_unit" not in existing_columns:
        conn.execute("ALTER TABLE family_budget_items ADD COLUMN interval_unit TEXT NOT NULL DEFAULT 'week'")
    if "days_of_month_json" not in existing_columns:
        conn.execute("ALTER TABLE family_budget_items ADD COLUMN days_of_month_json TEXT NOT NULL DEFAULT '[]'")
    if "end_date" not in existing_columns:
        conn.execute("ALTER TABLE family_budget_items ADD COLUMN end_date TEXT NOT NULL DEFAULT ''")
    if not conn.execute("SELECT COUNT(*) FROM family_budget_categories").fetchone()[0]:
        timestamp = now_iso()
        conn.executemany(
            "INSERT INTO family_budget_categories (name, sort_order, updated_at) VALUES (?, ?, ?)",
            [(name, index, timestamp) for index, name in enumerate(default_budget_categories())],
        )
    return conn


def default_budget_categories() -> list[str]:
    return ["Housing", "Groceries", "Car", "Utilities", "Insurance", "School", "Subscriptions", "Business", "Personal", "Once-off"]


def row_to_budget_item(row: sqlite3.Row) -> FamilyBudgetItem:
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
    with budget_db() as conn:
        rows = conn.execute("SELECT * FROM family_budget_items ORDER BY kind, name COLLATE NOCASE").fetchall()
    return [row_to_budget_item(row) for row in rows]


def replace_budget_items(items: list[FamilyBudgetItem]) -> list[FamilyBudgetItem]:
    timestamp = now_iso()
    with budget_db() as conn:
        conn.execute("DELETE FROM family_budget_items")
        conn.executemany(
            """
            INSERT INTO family_budget_items
              (id, kind, name, supplier, amount, cycle, schedule, interval_count, interval_unit, anchor_date, end_date, day_of_month, days_of_month_json, months_json, due_dates_json, category, note, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            [
                (
                    item.id, item.kind, item.name, item.supplier, item.amount, item.cycle,
                    item.schedule, item.intervalCount, item.intervalUnit, item.anchorDate,
                    item.endDate, item.dayOfMonth, json.dumps(item.daysOfMonth),
                    json.dumps(item.months), json.dumps(item.dueDates), item.category,
                    item.note, timestamp,
                )
                for item in items
            ],
        )
    return items


def row_to_savings_account(row: sqlite3.Row) -> SavingsAccount:
    return SavingsAccount(id=row["id"], name=row["name"], balance=row["balance"] or 0, note=row["note"] or "")


def get_savings_accounts() -> list[SavingsAccount]:
    with budget_db() as conn:
        rows = conn.execute("SELECT * FROM savings_accounts ORDER BY name COLLATE NOCASE").fetchall()
    return [row_to_savings_account(row) for row in rows]


def replace_savings_accounts(accounts: list[SavingsAccount]) -> list[SavingsAccount]:
    timestamp = now_iso()
    with budget_db() as conn:
        conn.execute("DELETE FROM savings_accounts")
        conn.executemany(
            "INSERT INTO savings_accounts (id, name, balance, note, updated_at) VALUES (?, ?, ?, ?, ?)",
            [(account.id, account.name, account.balance, account.note, timestamp) for account in accounts],
        )
    return accounts


def get_budget_categories() -> list[str]:
    with budget_db() as conn:
        rows = conn.execute("SELECT name FROM family_budget_categories ORDER BY sort_order, name COLLATE NOCASE").fetchall()
    return [row["name"] for row in rows]


def replace_budget_categories(categories: list[str]) -> list[str]:
    cleaned: list[str] = []
    for category in categories:
        name = category.strip()
        if name and name.lower() not in [existing.lower() for existing in cleaned]:
            cleaned.append(name)
    timestamp = now_iso()
    with budget_db() as conn:
        conn.execute("DELETE FROM family_budget_categories")
        conn.executemany(
            "INSERT INTO family_budget_categories (name, sort_order, updated_at) VALUES (?, ?, ?)",
            [(name, index, timestamp) for index, name in enumerate(cleaned)],
        )
    return cleaned


def row_to_actual_cost(row: sqlite3.Row) -> ActualCostTransaction:
    return ActualCostTransaction(
        id=row["id"], date=row["date"] or "", description=row["description"] or "",
        amount=row["amount"] or 0, account=row["account"] or "",
        category=row["category"] or "", notes=row["notes"] or "",
    )


def get_actual_costs() -> list[ActualCostTransaction]:
    with budget_db() as conn:
        rows = conn.execute("SELECT * FROM actual_cost_transactions ORDER BY date DESC, description COLLATE NOCASE").fetchall()
    return [row_to_actual_cost(row) for row in rows]


def replace_actual_costs(transactions: list[ActualCostTransaction]) -> list[ActualCostTransaction]:
    timestamp = now_iso()
    with budget_db() as conn:
        conn.execute("DELETE FROM actual_cost_transactions")
        conn.executemany(
            "INSERT INTO actual_cost_transactions (id, date, description, amount, account, category, notes, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            [(item.id, item.date, item.description, item.amount, item.account, item.category, item.notes, timestamp) for item in transactions],
        )
    return transactions


def chores_db() -> sqlite3.Connection:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(CHORES_DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("""
        CREATE TABLE IF NOT EXISTS chores (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            description TEXT NOT NULL DEFAULT '',
            assigned_to TEXT NOT NULL DEFAULT 'everyone',
            added_by TEXT NOT NULL DEFAULT '',
            done INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL
        )
    """)
    return conn


def get_chores() -> list:
    with chores_db() as conn:
        rows = conn.execute("SELECT * FROM chores ORDER BY done ASC, created_at DESC").fetchall()
    return [dict(row) for row in rows]


def create_chore(chore_id: str, title: str, description: str, assigned_to: str, added_by: str) -> dict:
    created_at = now_iso()
    with chores_db() as conn:
        conn.execute(
            "INSERT INTO chores (id, title, description, assigned_to, added_by, done, created_at) VALUES (?, ?, ?, ?, ?, 0, ?)",
            (chore_id, title, description, assigned_to, added_by, created_at)
        )
    return {"id": chore_id, "title": title, "description": description, "assigned_to": assigned_to, "added_by": added_by, "done": False, "created_at": created_at}


def update_chore_done(chore_id: str, done: bool) -> bool:
    with chores_db() as conn:
        result = conn.execute("UPDATE chores SET done = ? WHERE id = ?", (1 if done else 0, chore_id))
    return result.rowcount > 0


def delete_chore(chore_id: str) -> bool:
    with chores_db() as conn:
        result = conn.execute("DELETE FROM chores WHERE id = ?", (chore_id,))
    return result.rowcount > 0


def get_user_profiles() -> list[UserProfile]:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    if not USER_PROFILES_PATH.exists():
        USER_PROFILES_PATH.write_text(json.dumps(DEFAULT_USER_PROFILES, indent=2))
    raw_profiles = json.loads(USER_PROFILES_PATH.read_text() or "[]")
    changed = False
    for profile in raw_profiles:
        profile.setdefault("pin", "")
        profile.setdefault("email", "")
        if profile.get("role") not in {"Administrator", "User"}:
            profile["role"] = "User"
            changed = True
        permissions = profile.setdefault("permissions", [])
        if profile.get("role") == "Administrator" and "settings-users" in permissions and "settings-smtp" not in permissions:
            insert_at = permissions.index("settings-users") + 1
            permissions.insert(insert_at, "settings-smtp")
            changed = True
    if changed:
        USER_PROFILES_PATH.write_text(json.dumps(raw_profiles, indent=2))
    return [UserProfile(**profile) for profile in raw_profiles]


def save_user_profiles(profiles: list[UserProfile]) -> list[UserProfile]:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    clean_profiles = [
        {**profile.model_dump(), "permissions": [permission for permission in profile.permissions if permission in DEFAULT_PAGE_PERMISSIONS]}
        for profile in profiles
        if profile.id.strip() and profile.name.strip()
    ]
    USER_PROFILES_PATH.write_text(json.dumps(clean_profiles, indent=2))
    return [UserProfile(**profile) for profile in clean_profiles]


def read_pin_reset_tokens() -> dict[str, dict[str, str]]:
    if not PIN_RESET_TOKENS_PATH.exists():
        return {}
    try:
        return json.loads(PIN_RESET_TOKENS_PATH.read_text() or "{}")
    except json.JSONDecodeError:
        return {}


def write_pin_reset_tokens(tokens: dict[str, dict[str, str]]) -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    PIN_RESET_TOKENS_PATH.write_text(json.dumps(tokens, indent=2))


def load_ai_field_definitions() -> dict[str, str]:
    if not FIELD_DEFINITIONS_PATH.exists():
        return {}
    try:
        payload = json.loads(FIELD_DEFINITIONS_PATH.read_text())
    except json.JSONDecodeError:
        return {}
    if not isinstance(payload, dict):
        return {}
    return {str(key): str(value) for key, value in payload.items()}


def write_ai_field_definitions(definitions: dict[str, str]) -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    FIELD_DEFINITIONS_PATH.write_text(json.dumps(definitions, indent=2, sort_keys=True) + "\n")


def load_sharepoint_field_settings() -> dict[str, bool]:
    if not SHAREPOINT_FIELD_SETTINGS_PATH.exists():
        return {}
    try:
        payload = json.loads(SHAREPOINT_FIELD_SETTINGS_PATH.read_text())
    except json.JSONDecodeError:
        return {}
    values = payload.get("show_in_input_form") if isinstance(payload, dict) else {}
    if not isinstance(values, dict):
        return {}
    return {str(key): bool(value) for key, value in values.items()}


def write_sharepoint_field_settings(show_in_input_form: dict[str, bool]) -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    SHAREPOINT_FIELD_SETTINGS_PATH.write_text(json.dumps({"show_in_input_form": show_in_input_form}, indent=2, sort_keys=True) + "\n")


def update_env_file(updates: dict[str, str]) -> None:
    import os as _os
    existing: dict[str, str] = {}
    order: list[str] = []
    if ENV_PATH.exists():
        for line in ENV_PATH.read_text().splitlines():
            if line.strip() and not line.lstrip().startswith("#") and "=" in line:
                key, value = line.split("=", 1)
                existing[key] = value
                order.append(key)
    for key, value in updates.items():
        existing[key] = value
        if key not in order:
            order.append(key)
        _os.environ[key] = value
    ENV_PATH.write_text("\n".join(f"{key}={existing[key]}" for key in order) + "\n")
