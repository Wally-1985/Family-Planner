from __future__ import annotations

import io
import json
import os
import shutil
import sqlite3
import subprocess
import sys
import tempfile
import zipfile
from pathlib import Path
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Literal
from urllib import error, parse, request

from dotenv import load_dotenv
from fastapi import FastAPI, File, Response, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, SecretStr


class ConnectorStatus(str, Enum):
    not_connected = "not-connected"
    ready = "ready"
    needs_review = "needs-review"


class HealthResponse(BaseModel):
    status: Literal["ok"] = "ok"
    service: str = "finances-api"
    time: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class SharePointGraphSettings(BaseModel):
    tenant_domain: str = ""
    tenant_id: str = ""
    client_id: str = ""
    client_secret_saved: bool = False
    client_secret_expires_on: str = ""
    site_url: str = ""
    site_id: str = ""
    drive_id: str = ""
    library_name: str = "Documents"
    input_folder: str = "Inbox"
    output_folder: str = "Processed/FY2025-2026"
    status: ConnectorStatus = ConnectorStatus.not_connected
    required_permissions: list[str] = Field(
        default_factory=lambda: [
            "Microsoft Graph application permission: Sites.Selected or Sites.ReadWrite.All",
            "SharePoint site grant: read/write access to the Invoice site",
            "Document library access to Documents/Inbox and Documents/Processed/FY2025-2026",
        ]
    )


class ConnectorSettings(BaseModel):
    sharepoint: SharePointGraphSettings = Field(default_factory=SharePointGraphSettings)
    bank_status: ConnectorStatus = ConnectorStatus.not_connected
    ai_provider: str = "OpenAI / Codex-compatible extractor"
    ai_model: str = "gpt-4o-mini"
    ai_base_url: str = "https://api.openai.com/v1"
    ai_api_key_saved: bool = False


class SharePointSettingsUpdate(BaseModel):
    tenant_domain: str = ""
    tenant_id: str = ""
    client_id: str = ""
    client_secret: SecretStr | None = None
    client_secret_expires_on: str | None = None
    site_url: str = ""
    site_id: str = ""
    drive_id: str = ""
    library_name: str = "Documents"
    input_folder: str = "Inbox"
    output_folder: str = "Processed/FY2025-2026"


class AiSettingsUpdate(BaseModel):
    provider: str = "OpenAI"
    model: str = "gpt-4o-mini"
    base_url: str = "https://api.openai.com/v1"
    api_key: SecretStr | None = None


class SaveSettingsResponse(BaseModel):
    status: Literal["saved"] = "saved"
    saved_to: str
    client_secret_saved: bool
    reminder_message: str | None = None


class BackupRestoreResponse(BaseModel):
    status: Literal["ok", "failed"] = "ok"
    message: str
    restored_files: list[str] = Field(default_factory=list)
    safety_backup: str | None = None


class UserProfile(BaseModel):
    id: str
    name: str
    role: str = "User"
    permissions: list[str] = Field(default_factory=list)


class UserProfilesResponse(BaseModel):
    status: Literal["ok", "failed"] = "ok"
    message: str
    profiles: list[UserProfile] = Field(default_factory=list)


class UserProfilesUpdate(BaseModel):
    profiles: list[UserProfile] = Field(default_factory=list)


class SharePointTestResponse(BaseModel):
    status: Literal["not-configured", "connected", "failed"]
    message: str
    missing: list[str] = Field(default_factory=list)
    target: SharePointGraphSettings
    details: dict[str, Any] = Field(default_factory=dict)


class ReceiptSummary(BaseModel):
    receipts_synced: int = 156
    needs_review: int = 21
    ready_to_write: int = 68
    ocr_queue: int = 3


class SharePointInputFile(BaseModel):
    id: str
    name: str
    web_url: str = ""
    size: int = 0
    last_modified: str = ""
    item_type: Literal["file", "folder"] = "file"
    status: str = "Queued for OCR"


class SharePointInputFilesResponse(BaseModel):
    status: Literal["connected", "not-configured", "failed"]
    message: str
    files: list[SharePointInputFile] = Field(default_factory=list)
    target: SharePointGraphSettings


class SharePointFieldDefinition(BaseModel):
    name: str
    display_name: str
    field_type: str = "text"
    value: Any = None
    read_only: bool = False
    order: int = 0
    required: bool = False
    description: str = ""
    default_value: Any = None
    choices: list[str] = Field(default_factory=list)
    allow_text_entry: bool = False
    allow_multiple: bool = False
    min_value: float | None = None
    max_value: float | None = None
    max_length: int | None = None
    show_in_input_form: bool = True


class SharePointFileDetailResponse(BaseModel):
    status: Literal["connected", "failed"]
    message: str
    file: SharePointInputFile
    fields: list[SharePointFieldDefinition] = Field(default_factory=list)
    raw_fields: dict[str, Any] = Field(default_factory=dict)


class SharePointFieldUpdate(BaseModel):
    fields: dict[str, Any] = Field(default_factory=dict)


class SharePointActionResponse(BaseModel):
    status: Literal["saved", "approved", "failed"]
    message: str
    file_id: str
    saved_fields: dict[str, Any] = Field(default_factory=dict)


class ReceiptDraft(BaseModel):
    item_id: str
    status: str = "not-started"
    message: str = ""
    ocr_text: str = ""
    suggestions: dict[str, Any] = Field(default_factory=dict)
    confidence: float | None = None
    updated_at: str = ""


class ReceiptDraftResponse(BaseModel):
    status: Literal["ok", "failed"] = "ok"
    message: str = ""
    draft: ReceiptDraft


class AiFieldDefinition(BaseModel):
    name: str
    display_name: str
    field_type: str = "text"
    choices: list[str] = Field(default_factory=list)
    allow_multiple: bool = False
    definition: str = ""


class AiFieldDefinitionsResponse(BaseModel):
    status: Literal["ok", "failed"] = "ok"
    message: str = ""
    fields: list[AiFieldDefinition] = Field(default_factory=list)
    prompt_preview: str = ""


class AiFieldDefinitionsUpdate(BaseModel):
    definitions: dict[str, str] = Field(default_factory=dict)


class SharePointFieldSettingsResponse(BaseModel):
    status: Literal["ok", "failed"] = "ok"
    message: str = ""
    fields: list[SharePointFieldDefinition] = Field(default_factory=list)


class SharePointFieldSettingsUpdate(BaseModel):
    show_in_input_form: dict[str, bool] = Field(default_factory=dict)


class FamilyBudgetItem(BaseModel):
    id: str
    kind: Literal["income", "expense"]
    name: str
    supplier: str = ""
    amount: float = 0
    cycle: Literal["weekly", "fortnightly", "monthly", "quarterly", "bi-annually", "annually", "once-off", "random"] = "weekly"
    schedule: Literal["recurring", "reoccurring", "once-off", "random"] = "recurring"
    intervalCount: int = 1
    intervalUnit: Literal["day", "week", "month", "year"] = "week"
    anchorDate: str = ""
    endDate: str = ""
    dayOfMonth: int | None = None
    daysOfMonth: list[int] = Field(default_factory=list)
    months: list[int] = Field(default_factory=list)
    dueDates: list[str] = Field(default_factory=list)
    category: str = ""
    note: str = ""


class FamilyBudgetResponse(BaseModel):
    status: Literal["ok", "failed"] = "ok"
    message: str = ""
    items: list[FamilyBudgetItem] = Field(default_factory=list)


class FamilyBudgetUpdate(BaseModel):
    items: list[FamilyBudgetItem] = Field(default_factory=list)


class SavingsAccount(BaseModel):
    id: str
    name: str
    balance: float = 0
    note: str = ""


class SavingsAccountsResponse(BaseModel):
    status: Literal["ok", "failed"] = "ok"
    message: str = ""
    accounts: list[SavingsAccount] = Field(default_factory=list)


class SavingsAccountsUpdate(BaseModel):
    accounts: list[SavingsAccount] = Field(default_factory=list)


class FamilyBudgetCategoriesResponse(BaseModel):
    status: Literal["ok", "failed"] = "ok"
    message: str = ""
    categories: list[str] = Field(default_factory=list)


class FamilyBudgetCategoriesUpdate(BaseModel):
    categories: list[str] = Field(default_factory=list)


class ActualCostTransaction(BaseModel):
    id: str
    date: str = ""
    description: str = ""
    amount: float = 0
    account: str = ""
    category: str = ""
    notes: str = ""


class ActualCostsResponse(BaseModel):
    status: Literal["ok", "failed"] = "ok"
    message: str = ""
    transactions: list[ActualCostTransaction] = Field(default_factory=list)


class ActualCostsUpdate(BaseModel):
    transactions: list[ActualCostTransaction] = Field(default_factory=list)


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
FIELD_DEFINITIONS_PATH = DATA_DIR / "ai_field_definitions.json"
SHAREPOINT_FIELD_SETTINGS_PATH = DATA_DIR / "sharepoint_field_settings.json"
BACKUP_DIR = DATA_DIR / "backups"
USER_PROFILES_PATH = DATA_DIR / "user_profiles.json"

DEFAULT_PAGE_PERMISSIONS = [
    "dashboard",
    "receipts-inbox",
    "processed-receipts",
    "family-dashboard",
    "family-projections",
    "family-actuals",
    "business",
    "settings-sharepoint",
    "settings-ai-ocr",
    "settings-family-budget",
    "settings-users",
    "settings-backup",
    "settings-bank",
]

DEFAULT_USER_PROFILES = [
    {"id": "owner", "name": "Owner", "role": "Administrator", "permissions": DEFAULT_PAGE_PERMISSIONS},
    {"id": "family", "name": "Family", "role": "Family budget", "permissions": ["dashboard", "family-dashboard", "family-projections", "family-actuals"]},
]


def safe_backup_member(name: str) -> Path:
    member = Path(name)
    if member.is_absolute() or ".." in member.parts or not name.strip():
        raise ValueError(f"Unsafe backup path: {name}")
    return member


def create_data_zip() -> bytes:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    buffer = io.BytesIO()
    excluded_roots = {"backups", "cache"}
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as archive:
        for path in sorted(DATA_DIR.rglob("*")):
            if path.is_dir():
                continue
            relative = path.relative_to(DATA_DIR)
            if relative.parts and relative.parts[0] in excluded_roots:
                continue
            archive.write(path, relative.as_posix())
    return buffer.getvalue()


def write_safety_backup() -> str:
    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    backup_path = BACKUP_DIR / f"pre-restore-{datetime.now().strftime('%Y%m%d-%H%M%S')}.zip"
    backup_path.write_bytes(create_data_zip())
    return str(backup_path)


def restore_data_zip(content: bytes) -> tuple[list[str], str]:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    safety_backup = write_safety_backup()
    with zipfile.ZipFile(io.BytesIO(content)) as archive:
        members = [member for member in archive.infolist() if not member.is_dir()]
        restored: list[str] = []
        for member in members:
            relative = safe_backup_member(member.filename)
            if relative.parts and relative.parts[0] in {"backups", "cache"}:
                continue
            target = DATA_DIR / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            with archive.open(member) as source, target.open("wb") as destination:
                shutil.copyfileobj(source, destination)
            restored.append(relative.as_posix())
    return restored, safety_backup


def get_user_profiles() -> list[UserProfile]:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    if not USER_PROFILES_PATH.exists():
        USER_PROFILES_PATH.write_text(json.dumps(DEFAULT_USER_PROFILES, indent=2))
    profiles = json.loads(USER_PROFILES_PATH.read_text() or "[]")
    return [UserProfile(**profile) for profile in profiles]


def save_user_profiles(profiles: list[UserProfile]) -> list[UserProfile]:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    clean_profiles = [profile.model_dump() for profile in profiles if profile.id.strip() and profile.name.strip()]
    USER_PROFILES_PATH.write_text(json.dumps(clean_profiles, indent=2))
    return [UserProfile(**profile) for profile in clean_profiles]


def update_env_file(updates: dict[str, str]) -> None:
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
        os.environ[key] = value

    ENV_PATH.write_text("\n".join(f"{key}={existing[key]}" for key in order) + "\n")


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


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


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
                    item.id,
                    item.kind,
                    item.name,
                    item.supplier,
                    item.amount,
                    item.cycle,
                    item.schedule,
                    item.intervalCount,
                    item.intervalUnit,
                    item.anchorDate,
                    item.endDate,
                    item.dayOfMonth,
                    json.dumps(item.daysOfMonth),
                    json.dumps(item.months),
                    json.dumps(item.dueDates),
                    item.category,
                    item.note,
                    timestamp,
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
            """
            INSERT INTO savings_accounts (id, name, balance, note, updated_at)
            VALUES (?, ?, ?, ?, ?)
            """,
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
        id=row["id"],
        date=row["date"] or "",
        description=row["description"] or "",
        amount=row["amount"] or 0,
        account=row["account"] or "",
        category=row["category"] or "",
        notes=row["notes"] or "",
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
            """
            INSERT INTO actual_cost_transactions (id, date, description, amount, account, category, notes, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            [(item.id, item.date, item.description, item.amount, item.account, item.category, item.notes, timestamp) for item in transactions],
        )
    return transactions


app = FastAPI(title="Finances API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5174", "http://127.0.0.1:5174"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health", response_model=HealthResponse)
def health() -> HealthResponse:
    return HealthResponse()


@app.get("/api/family-budget/items", response_model=FamilyBudgetResponse)
def read_family_budget_items() -> FamilyBudgetResponse:
    try:
        return FamilyBudgetResponse(status="ok", message="Family budget items loaded.", items=get_budget_items())
    except Exception as exc:  # noqa: BLE001
        return FamilyBudgetResponse(status="failed", message=str(exc), items=[])


@app.put("/api/family-budget/items", response_model=FamilyBudgetResponse)
def save_family_budget_items(update: FamilyBudgetUpdate) -> FamilyBudgetResponse:
    try:
        items = replace_budget_items(update.items)
        return FamilyBudgetResponse(status="ok", message=f"Saved {len(items)} family budget item{'s' if len(items) != 1 else ''}.", items=items)
    except Exception as exc:  # noqa: BLE001
        return FamilyBudgetResponse(status="failed", message=str(exc), items=[])


@app.get("/api/family-budget/categories", response_model=FamilyBudgetCategoriesResponse)
def read_family_budget_categories() -> FamilyBudgetCategoriesResponse:
    try:
        return FamilyBudgetCategoriesResponse(status="ok", message="Family budget categories loaded.", categories=get_budget_categories())
    except Exception as exc:  # noqa: BLE001
        return FamilyBudgetCategoriesResponse(status="failed", message=str(exc), categories=[])


@app.put("/api/family-budget/categories", response_model=FamilyBudgetCategoriesResponse)
def save_family_budget_categories(update: FamilyBudgetCategoriesUpdate) -> FamilyBudgetCategoriesResponse:
    try:
        categories = replace_budget_categories(update.categories)
        return FamilyBudgetCategoriesResponse(status="ok", message=f"Saved {len(categories)} expense categor{'y' if len(categories) == 1 else 'ies'}.", categories=categories)
    except Exception as exc:  # noqa: BLE001
        return FamilyBudgetCategoriesResponse(status="failed", message=str(exc), categories=[])


@app.get("/api/family-budget/savings-accounts", response_model=SavingsAccountsResponse)
def read_savings_accounts() -> SavingsAccountsResponse:
    try:
        return SavingsAccountsResponse(status="ok", message="Savings accounts loaded.", accounts=get_savings_accounts())
    except Exception as exc:  # noqa: BLE001
        return SavingsAccountsResponse(status="failed", message=str(exc), accounts=[])


@app.put("/api/family-budget/savings-accounts", response_model=SavingsAccountsResponse)
def save_savings_accounts(update: SavingsAccountsUpdate) -> SavingsAccountsResponse:
    try:
        accounts = replace_savings_accounts(update.accounts)
        return SavingsAccountsResponse(status="ok", message=f"Saved {len(accounts)} savings account{'s' if len(accounts) != 1 else ''}.", accounts=accounts)
    except Exception as exc:  # noqa: BLE001
        return SavingsAccountsResponse(status="failed", message=str(exc), accounts=[])


@app.get("/api/family-budget/actual-costs", response_model=ActualCostsResponse)
def read_actual_costs() -> ActualCostsResponse:
    try:
        return ActualCostsResponse(status="ok", message="Actual costs loaded.", transactions=get_actual_costs())
    except Exception as exc:  # noqa: BLE001
        return ActualCostsResponse(status="failed", message=str(exc), transactions=[])


@app.put("/api/family-budget/actual-costs", response_model=ActualCostsResponse)
def save_actual_costs(update: ActualCostsUpdate) -> ActualCostsResponse:
    try:
        transactions = replace_actual_costs(update.transactions)
        return ActualCostsResponse(status="ok", message=f"Saved {len(transactions)} actual cost transaction{'s' if len(transactions) != 1 else ''}.", transactions=transactions)
    except Exception as exc:  # noqa: BLE001
        return ActualCostsResponse(status="failed", message=str(exc), transactions=[])


@app.get("/api/settings/backup")
def download_data_backup() -> Response:
    filename = f"finances-data-{datetime.now().strftime('%Y%m%d-%H%M%S')}.zip"
    return Response(
        content=create_data_zip(),
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@app.post("/api/settings/backup/restore", response_model=BackupRestoreResponse)
async def restore_data_backup_route(file: UploadFile = File(...)) -> BackupRestoreResponse:
    if not file.filename.lower().endswith(".zip"):
        return BackupRestoreResponse(status="failed", message="Please upload a .zip backup file.")
    try:
        restored, safety_backup = restore_data_zip(await file.read())
        return BackupRestoreResponse(
            message=f"Restored {len(restored)} file{'s' if len(restored) != 1 else ''}. Restart the app if anything looks stale.",
            restored_files=restored,
            safety_backup=safety_backup,
        )
    except zipfile.BadZipFile:
        return BackupRestoreResponse(status="failed", message="That file is not a valid zip backup.")
    except Exception as exc:
        return BackupRestoreResponse(status="failed", message=f"Restore failed: {exc}")


@app.get("/api/settings/user-profiles", response_model=UserProfilesResponse)
def read_user_profiles() -> UserProfilesResponse:
    try:
        profiles = get_user_profiles()
        return UserProfilesResponse(message=f"Loaded {len(profiles)} user profile{'s' if len(profiles) != 1 else ''}.", profiles=profiles)
    except Exception as exc:
        return UserProfilesResponse(status="failed", message=f"Could not load user profiles: {exc}")


@app.put("/api/settings/user-profiles", response_model=UserProfilesResponse)
def update_user_profiles(update: UserProfilesUpdate) -> UserProfilesResponse:
    try:
        profiles = save_user_profiles(update.profiles)
        return UserProfilesResponse(message=f"Saved {len(profiles)} user profile{'s' if len(profiles) != 1 else ''}.", profiles=profiles)
    except Exception as exc:
        return UserProfilesResponse(status="failed", message=f"Could not save user profiles: {exc}")


@app.get("/api/settings/connectors", response_model=ConnectorSettings)
def connector_settings() -> ConnectorSettings:
    """Return non-secret connector settings.

    Client secrets/certificates must remain server-side and are never returned by this endpoint.
    """
    sharepoint = SharePointGraphSettings(
        tenant_domain=env("MS_TENANT_DOMAIN"),
        tenant_id=env("MS_TENANT_ID"),
        client_id=env("MS_CLIENT_ID"),
        client_secret_saved=bool(env("MS_CLIENT_SECRET")),
        client_secret_expires_on=env("MS_CLIENT_SECRET_EXPIRES_ON"),
        site_url=env("SHAREPOINT_SITE_URL"),
        site_id=env("SHAREPOINT_SITE_ID"),
        drive_id=env("SHAREPOINT_DRIVE_ID"),
        library_name=env("SHAREPOINT_DOCUMENT_LIBRARY", "Documents"),
        input_folder=env("SHAREPOINT_INPUT_FOLDER", "Inbox"),
        output_folder=env("SHAREPOINT_OUTPUT_FOLDER", "Processed/FY2025-2026"),
        status=ConnectorStatus.ready
        if env("MS_TENANT_ID") and env("MS_CLIENT_ID") and env("SHAREPOINT_SITE_URL")
        else ConnectorStatus.not_connected,
    )
    return ConnectorSettings(
        sharepoint=sharepoint,
        ai_provider=env("AI_PROVIDER", "OpenAI"),
        ai_model=env("AI_MODEL", "gpt-4o-mini"),
        ai_base_url=env("AI_BASE_URL", "https://api.openai.com/v1"),
        ai_api_key_saved=bool(env("AI_API_KEY")),
    )


def graph_token() -> str:
    token_url = f"https://login.microsoftonline.com/{parse.quote(env('MS_TENANT_ID'))}/oauth2/v2.0/token"
    body = parse.urlencode(
        {
            "client_id": env("MS_CLIENT_ID"),
            "client_secret": env("MS_CLIENT_SECRET"),
            "scope": "https://graph.microsoft.com/.default",
            "grant_type": "client_credentials",
        }
    ).encode()
    req = request.Request(
        token_url,
        data=body,
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        method="POST",
    )
    payload = urlopen_json(req)
    access_token = payload.get("access_token")
    if not isinstance(access_token, str) or not access_token:
        raise RuntimeError("Microsoft identity platform did not return an access token.")
    return access_token


def graph_get(path: str, token: str) -> dict[str, Any]:
    return graph_request("GET", path, token)


def graph_request(method: str, path: str, token: str, body: dict[str, Any] | None = None) -> dict[str, Any]:
    data = json.dumps(body).encode() if body is not None else None
    headers = {"Authorization": f"Bearer {token}", "Accept": "application/json"}
    if body is not None:
        headers["Content-Type"] = "application/json"
    req = request.Request(
        f"https://graph.microsoft.com/v1.0{path}",
        data=data,
        headers=headers,
        method=method,
    )
    return urlopen_json(req)


def graph_get_bytes(path: str, token: str) -> tuple[bytes, str]:
    req = request.Request(
        f"https://graph.microsoft.com/v1.0{path}",
        headers={"Authorization": f"Bearer {token}"},
        method="GET",
    )
    try:
        with request.urlopen(req, timeout=30) as response:
            return response.read(), response.headers.get("content-type", "application/octet-stream")
    except error.HTTPError as exc:
        raw = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"HTTP {exc.code}: {raw}") from exc
    except error.URLError as exc:
        raise RuntimeError(f"Network error: {exc.reason}") from exc


def graph_put_bytes(path: str, token: str, data: bytes, content_type: str = "application/octet-stream") -> dict[str, Any]:
    req = request.Request(
        f"https://graph.microsoft.com/v1.0{path}",
        data=data,
        headers={"Authorization": f"Bearer {token}", "Content-Type": content_type, "Accept": "application/json"},
        method="PUT",
    )
    return urlopen_json(req)


def urlopen_json(req: request.Request) -> dict[str, Any]:
    try:
        with request.urlopen(req, timeout=20) as response:
            raw = response.read().decode("utf-8")
    except error.HTTPError as exc:
        raw = exc.read().decode("utf-8", errors="replace")
        message = raw
        try:
            payload = json.loads(raw)
            message = payload.get("error_description") or payload.get("error", {}).get("message") or raw
        except json.JSONDecodeError:
            pass
        raise RuntimeError(f"HTTP {exc.code}: {message}") from exc
    except error.URLError as exc:
        raise RuntimeError(f"Network error: {exc.reason}") from exc

    try:
        payload = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise RuntimeError("Graph returned a non-JSON response.") from exc
    if not isinstance(payload, dict):
        raise RuntimeError("Graph returned an unexpected JSON response.")
    return payload


def site_graph_path(site_url: str) -> str:
    parsed = parse.urlparse(site_url)
    if not parsed.netloc or not parsed.path:
        raise RuntimeError("SHAREPOINT_SITE_URL must look like https://tenant.sharepoint.com/sites/Invoice")
    return f"/sites/{parsed.netloc}:{parsed.path.rstrip('/')}"


def sharepoint_target() -> SharePointGraphSettings:
    return SharePointGraphSettings(
        tenant_domain=env("MS_TENANT_DOMAIN"),
        tenant_id=env("MS_TENANT_ID"),
        client_id=env("MS_CLIENT_ID"),
        client_secret_saved=bool(env("MS_CLIENT_SECRET")),
        client_secret_expires_on=env("MS_CLIENT_SECRET_EXPIRES_ON"),
        site_url=env("SHAREPOINT_SITE_URL"),
        site_id=env("SHAREPOINT_SITE_ID"),
        drive_id=env("SHAREPOINT_DRIVE_ID"),
        library_name=env("SHAREPOINT_DOCUMENT_LIBRARY", "Documents"),
        input_folder=env("SHAREPOINT_INPUT_FOLDER", "Inbox"),
        output_folder=env("SHAREPOINT_OUTPUT_FOLDER", "Processed/FY2025-2026"),
    )


def required_sharepoint_settings(target: SharePointGraphSettings) -> dict[str, str]:
    return {
        "MS_TENANT_ID": target.tenant_id,
        "MS_CLIENT_ID": target.client_id,
        "MS_CLIENT_SECRET": env("MS_CLIENT_SECRET"),
        "SHAREPOINT_SITE_URL": target.site_url,
        "SHAREPOINT_DOCUMENT_LIBRARY": target.library_name,
        "SHAREPOINT_INPUT_FOLDER": target.input_folder,
        "SHAREPOINT_OUTPUT_FOLDER": target.output_folder,
    }


def find_drive(site_id: str, library_name: str, token: str) -> dict[str, Any]:
    drives = graph_get(f"/sites/{parse.quote(site_id, safe='')}/drives", token).get("value", [])
    if not isinstance(drives, list):
        raise RuntimeError("Graph returned an unexpected drives response.")
    for drive in drives:
        if isinstance(drive, dict) and drive.get("name", "").casefold() == library_name.casefold():
            return drive
    available = ", ".join(drive.get("name", "<unnamed>") for drive in drives if isinstance(drive, dict))
    raise RuntimeError(f"Document library '{library_name}' was not found on the site. Available libraries: {available or 'none'}")


def resolve_sharepoint_site_and_drive(target: SharePointGraphSettings, token: str) -> tuple[dict[str, Any], dict[str, Any]]:
    site = graph_get(f"/sites/{parse.quote(target.site_id, safe='')}" if target.site_id else site_graph_path(target.site_url), token)
    site_id = str(site.get("id") or target.site_id)
    if not site_id:
        raise RuntimeError("Graph did not return a SharePoint site id.")

    drive = graph_get(f"/drives/{parse.quote(target.drive_id, safe='')}", token) if target.drive_id else find_drive(site_id, target.library_name, token)
    if not str(drive.get("id") or target.drive_id):
        raise RuntimeError("Graph did not return a document library drive id.")
    return site, drive


SYSTEM_FIELD_NAMES = {
    "id",
    "contenttype",
    "created",
    "author",
    "modified",
    "editor",
    "_checkincomment",
    "linkfilename",
    "linkfilename2",
    "filename",
    "fileleafref",
    "filedirref",
    "filesize",
    "docicon",
    "serverurl",
    "encodedabsurl",
    "baseName",
    "owshiddentype",
    "fsobjtype",
    "sortbehavior",
    "order",
    "guid",
    "uniqueid",
    "syncclientid",
    "progId",
    "scopeId",
    "virusstatus",
    "checkedouttitle",
    "_copySource",
    "_moderationstatus",
    "_moderationcomments",
}


def column_type(column: dict[str, Any]) -> str:
    for key in ["dateTime", "number", "currency", "boolean", "choice", "personOrGroup", "hyperlinkOrPicture", "lookup", "text"]:
        if key in column:
            return key
    return "text"


def field_definition_from_column(column: dict[str, Any], raw_fields: dict[str, Any]) -> SharePointFieldDefinition:
    name = str(column.get("name", ""))
    field_type = column_type(column)
    choice = column.get("choice") if isinstance(column.get("choice"), dict) else {}
    text = column.get("text") if isinstance(column.get("text"), dict) else {}
    number = column.get("number") if isinstance(column.get("number"), dict) else {}
    currency = column.get("currency") if isinstance(column.get("currency"), dict) else {}
    value = raw_fields.get(name, column.get("defaultValue", {}).get("value") if isinstance(column.get("defaultValue"), dict) else None)
    return SharePointFieldDefinition(
        name=name,
        display_name=str(column.get("displayName") or name),
        field_type=field_type,
        value=value,
        read_only=False,
        order=int(column.get("_sharepointOrder", 0)),
        required=bool(column.get("required")),
        description=str(column.get("description") or ""),
        default_value=column.get("defaultValue", {}).get("value") if isinstance(column.get("defaultValue"), dict) else None,
        choices=[str(choice_value) for choice_value in choice.get("choices", [])] if isinstance(choice.get("choices"), list) else [],
        allow_text_entry=bool(choice.get("allowTextEntry")),
        allow_multiple=bool(choice.get("allowMultipleSelection") or column.get("allowMultipleValues") or choice.get("displayAs") == "checkBoxes"),
        min_value=number.get("minimum") or currency.get("minimum"),
        max_value=number.get("maximum") or currency.get("maximum"),
        max_length=text.get("maxLength"),
    )


def editable_columns(drive_id: str, token: str) -> list[dict[str, Any]]:
    columns = graph_get(f"/drives/{parse.quote(drive_id, safe='')}/list/columns", token).get("value", [])
    if not isinstance(columns, list):
        raise RuntimeError("Graph returned an unexpected columns response.")
    editable: list[dict[str, Any]] = []
    for order, column in enumerate(columns):
        if not isinstance(column, dict):
            continue
        name = str(column.get("name") or "")
        if not name:
            continue
        if column.get("hidden") or column.get("readOnly") or column.get("sealed"):
            continue
        if name.casefold() in SYSTEM_FIELD_NAMES:
            continue
        column["_sharepointOrder"] = order
        editable.append(column)
    return editable


def drive_item_to_input_file(item: dict[str, Any], fields: dict[str, Any] | None = None) -> SharePointInputFile:
    status = "Queued for OCR"
    fields = fields or {}
    for key in ["ReviewStatus", "ProcessingStatus", "Status", "ApprovalStatus"]:
        if fields.get(key):
            status = str(fields[key])
            break
    return SharePointInputFile(
        id=str(item.get("id", "")),
        name=str(item.get("name", "")),
        web_url=str(item.get("webUrl", "")),
        size=int(item.get("size") or 0),
        last_modified=str(item.get("lastModifiedDateTime", "")),
        item_type="folder" if "folder" in item else "file",
        status=status,
    )


def resolve_drive_id(target: SharePointGraphSettings, token: str) -> str:
    _, drive = resolve_sharepoint_site_and_drive(target, token)
    drive_id = str(drive.get("id") or target.drive_id)
    if not drive_id:
        raise RuntimeError("Graph did not return a document library drive id.")
    return drive_id


def clean_field_updates(fields: dict[str, Any], drive_id: str, token: str) -> dict[str, Any]:
    columns = {str(column.get("name")): column for column in editable_columns(drive_id, token) if column.get("name")}
    allowed = set(columns)
    cleaned: dict[str, Any] = {}
    for key, value in fields.items():
        if key not in allowed:
            continue
        column = columns[key]
        field_type = column_type(column)
        if value == "" or value is None:
            cleaned[key] = None
            continue
        if field_type in {"number", "currency"}:
            cleaned[key] = float(value)
        elif field_type == "boolean":
            cleaned[key] = bool(value) if isinstance(value, bool) else str(value).lower() in {"true", "1", "yes", "on"}
        elif field_type == "choice":
            choice = column.get("choice") if isinstance(column.get("choice"), dict) else {}
            options = {str(choice_value) for choice_value in choice.get("choices", [])} if isinstance(choice.get("choices"), list) else set()
            allow_text = bool(choice.get("allowTextEntry"))
            is_multi = bool(choice.get("allowMultipleSelection") or column.get("allowMultipleValues") or choice.get("displayAs") == "checkBoxes")
            if is_multi:
                selected = [str(item) for item in value if str(item)] if isinstance(value, list) else [str(value)] if str(value) else []
                invalid = [item for item in selected if options and item not in options]
                if invalid and not allow_text:
                    raise RuntimeError(f"Invalid choice for {key}: {', '.join(invalid)}")
                cleaned[f"{key}@odata.type"] = "Collection(Edm.String)"
                cleaned[key] = selected
            else:
                selected = str(value)
                if options and selected not in options and not allow_text:
                    raise RuntimeError(f"Invalid choice for {key}: {selected}")
                cleaned[key] = selected
        else:
            cleaned[key] = value
    blocked = sorted(set(fields) - set(cleaned))
    if blocked:
        raise RuntimeError(f"These fields are not editable SharePoint custom fields: {', '.join(blocked)}")
    return cleaned


def update_list_item_fields(item_id: str, fields: dict[str, Any], token: str, drive_id: str) -> dict[str, Any]:
    """Patch list item metadata and return Graph's updated field values.

    The driveItem/listItem endpoint accepts simple text updates, but SharePoint choice
    and percentage/number columns are more reliable through the canonical list item path.
    """
    if not fields:
        return {}
    item = graph_get(
        f"/drives/{parse.quote(drive_id, safe='')}/items/{parse.quote(item_id, safe='')}?$select=sharepointIds",
        token,
    )
    sharepoint_ids = item.get("sharepointIds") if isinstance(item.get("sharepointIds"), dict) else {}
    site_id = str(sharepoint_ids.get("siteId") or "")
    list_id = str(sharepoint_ids.get("listId") or "")
    list_item_id = str(sharepoint_ids.get("listItemId") or "")
    if not site_id or not list_id or not list_item_id:
        raise RuntimeError("Could not resolve SharePoint list item ids for metadata update.")
    return graph_request(
        "PATCH",
        f"/sites/{parse.quote(site_id, safe=',')}/lists/{parse.quote(list_id, safe='')}/items/{parse.quote(list_item_id, safe='')}/fields",
        token,
        fields,
    )


FIELD_PURPOSES = {
    "name": "File name. Do not change unless explicitly needed.",
    "supplier": "Supplier on the invoice.",
    "reason": "Brief reason/notes describing why purchased, e.g. Ingredients, Hardware to fix trailer, Drinks, Ice, Firewood, Replacement boxes.",
    "notes": "Brief reason/notes describing why purchased.",
    "invoice date": "Date the invoice or receipt was created.",
    "invoice number": "Invoice number when present.",
    "job": "Job or business the cost relates to.",
    "category": "Closest matching SharePoint category for the invoice items.",
    "frequency": "Monthly subscription, annual cost, or once off cost.",
    "invoice": "Total cost inclusive of GST.",
    "include in claim": "Default to yes/true. Boss will turn it off manually if needed.",
    "claim portion": "Default to 100 percent. Boss will change manually if needed.",
    "processed": "Approval flag. Do not set during OCR/AI.",
    "ref number": "Unique upload/scan reference. Do not change.",
}


def purpose_for_field(field: SharePointFieldDefinition) -> str:
    label = f"{field.display_name} {field.name}".lower()
    for key, purpose in FIELD_PURPOSES.items():
        if key in label:
            return purpose
    if "portion" in label:
        return FIELD_PURPOSES["claim portion"]
    if "total" in label or "inc gst" in label:
        return FIELD_PURPOSES["invoice"]
    return "Extract this value only when clearly supported by the receipt text."


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


def apply_sharepoint_field_settings(fields: list[SharePointFieldDefinition]) -> list[SharePointFieldDefinition]:
    settings = load_sharepoint_field_settings()
    for field in fields:
        field.show_in_input_form = settings.get(field.name, True)
    return fields


def ai_field_payload(fields: list[SharePointFieldDefinition]) -> list[dict[str, Any]]:
    custom_definitions = load_ai_field_definitions()
    payload: list[dict[str, Any]] = []
    for field in fields:
        label = f"{field.name} {field.display_name}".lower()
        if "processed" in label or "ref" in label or "claim amount" in label:
            continue
        payload.append(
            {
                "name": field.name,
                "display_name": field.display_name,
                "type": field.field_type,
                "choices": field.choices,
                "allow_multiple": field.allow_multiple,
                "required": field.required,
                "definition": custom_definitions.get(field.name) or purpose_for_field(field),
            }
        )
    return payload


def build_ai_prompt(file_name: str, ocr_text: str, fields: list[SharePointFieldDefinition]) -> tuple[str, str]:
    system_prompt = """You extract tax receipt metadata. Return strict JSON only with keys: fields, confidence.
fields must be an object keyed only by the supplied SharePoint internal field names, not display names.
Use the supplied field definitions to decide what data belongs in each field.
Use only provided choice options for choice fields. If unsure, omit the field.
Defaults: Include in claim=true/Yes, Claim Portion=100, Frequency=Once Off unless a subscription/annual cost is evident.
Do not set Processed, Ref Number, calculated fields, or file Name."""
    user_prompt = json.dumps(
        {
            "file_name": file_name,
            "sharepoint_fields": ai_field_payload(fields),
            "ocr_text": ocr_text[:20000] or "<OCR text will be inserted here>",
        },
        indent=2,
    )
    return system_prompt, user_prompt


def prompt_preview(fields: list[SharePointFieldDefinition]) -> str:
    system_prompt, user_prompt = build_ai_prompt("example-receipt.pdf", "<OCR text from the selected SharePoint PDF>", fields)
    return f"SYSTEM:\n{system_prompt}\n\nUSER:\n{user_prompt}"


def normalize_ai_suggestions(suggestions: dict[str, Any], fields: list[SharePointFieldDefinition]) -> dict[str, Any]:
    """Map AI output to SharePoint internal field names, tolerating display-name keys."""
    by_key: dict[str, str] = {}
    for field in fields:
        for alias in {field.name, field.display_name, field.name.replace("_x0020_", " "), field.display_name.replace(" ", "")}:
            by_key[alias.casefold()] = field.name
            by_key[alias.replace(" ", "").casefold()] = field.name

    normalized: dict[str, Any] = {}
    for key, value in suggestions.items():
        target = by_key.get(str(key).casefold()) or by_key.get(str(key).replace(" ", "").casefold())
        if target:
            normalized[target] = value
    return normalized


def pdftotext_extract(pdf_path: Path) -> str:
    try:
        result = subprocess.run(
            ["pdftotext", "-layout", str(pdf_path), "-"],
            check=True,
            capture_output=True,
            text=True,
            timeout=60,
        )
    except FileNotFoundError as exc:
        raise RuntimeError("pdftotext is not installed on this machine.") from exc
    except subprocess.CalledProcessError as exc:
        raise RuntimeError(f"pdftotext failed: {exc.stderr or exc.stdout}") from exc
    return result.stdout.strip()


def extract_pdf_text(pdf_bytes: bytes) -> str:
    with tempfile.TemporaryDirectory() as temp_dir:
        pdf_path = Path(temp_dir) / "receipt.pdf"
        ocr_pdf_path = Path(temp_dir) / "receipt.ocr.pdf"
        sidecar_path = Path(temp_dir) / "receipt.txt"
        pdf_path.write_bytes(pdf_bytes)

        text = pdftotext_extract(pdf_path)
        if text:
            return text

        ocrmypdf_bin = Path(sys.executable).parent / "ocrmypdf"
        if not ocrmypdf_bin.exists():
            raise RuntimeError("No text was found in the PDF and OCRmyPDF is not installed in the backend environment.")
        try:
            subprocess.run(
                [
                    str(ocrmypdf_bin),
                    "--skip-text",
                    "--sidecar",
                    str(sidecar_path),
                    str(pdf_path),
                    str(ocr_pdf_path),
                ],
                check=True,
                capture_output=True,
                text=True,
                timeout=180,
            )
        except subprocess.CalledProcessError as exc:
            raise RuntimeError(f"OCRmyPDF failed: {exc.stderr or exc.stdout}") from exc

        text = sidecar_path.read_text(errors="replace").strip() if sidecar_path.exists() else pdftotext_extract(ocr_pdf_path)
        if not text:
            raise RuntimeError("OCR completed but no text was found in the PDF.")
        return text


def ai_extract_fields(file_name: str, ocr_text: str, fields: list[SharePointFieldDefinition]) -> tuple[dict[str, Any], float | None]:
    api_key = env("AI_API_KEY")
    if not api_key:
        raise RuntimeError("AI_API_KEY is not configured. OCR text was saved, but AI extraction could not run.")
    system_prompt, user_prompt = build_ai_prompt(file_name, ocr_text, fields)
    body = {
        "model": env("AI_MODEL", "gpt-4o-mini"),
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        "temperature": 0,
        "response_format": {"type": "json_object"},
    }
    req = request.Request(
        env("AI_BASE_URL", "https://api.openai.com/v1").rstrip("/") + "/chat/completions",
        data=json.dumps(body).encode(),
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
        method="POST",
    )
    payload = urlopen_json(req)
    content = payload.get("choices", [{}])[0].get("message", {}).get("content", "{}")
    parsed = json.loads(content)
    suggestions = parsed.get("fields", {}) if isinstance(parsed, dict) else {}
    confidence = parsed.get("confidence") if isinstance(parsed, dict) else None
    if not isinstance(suggestions, dict):
        suggestions = {}
    return suggestions, float(confidence) if isinstance(confidence, (int, float)) else None


@app.get("/api/sharepoint/test", response_model=SharePointTestResponse)
def test_sharepoint_connection() -> SharePointTestResponse:
    """Run a live Microsoft Graph connection test without writing to SharePoint."""
    target = sharepoint_target()
    required = required_sharepoint_settings(target)
    missing = [key for key, value in required.items() if not value]
    if missing:
        return SharePointTestResponse(
            status="not-configured",
            message="SharePoint connection is not ready yet. Add the missing required settings, save, then test again.",
            missing=missing,
            target=target,
        )

    try:
        token = graph_token()
        site, drive = resolve_sharepoint_site_and_drive(target, token)
        site_id = str(site.get("id") or target.site_id)
        site_name = str(site.get("displayName") or site.get("name") or target.site_url)
        drive_id = str(drive.get("id") or target.drive_id)
        drive_name = str(drive.get("name") or target.library_name)

        folder_path = parse.quote(target.input_folder.strip("/"), safe="/")
        inbox = graph_get(f"/drives/{parse.quote(drive_id, safe='')}/root:/{folder_path}?$select=id,name,webUrl,folder", token)
        if "folder" not in inbox:
            raise RuntimeError(f"'{target.input_folder}' exists, but it is not a folder.")

        target.site_id = site_id
        target.drive_id = drive_id
        target.status = ConnectorStatus.ready
        return SharePointTestResponse(
            status="connected",
            message=f"Connected to SharePoint. Verified site '{site_name}', library '{drive_name}', and input folder '{target.input_folder}'.",
            target=target,
            details={
                "site_id": site_id,
                "site_name": site_name,
                "drive_id": drive_id,
                "drive_name": drive_name,
                "input_folder_id": inbox.get("id"),
                "input_folder_web_url": inbox.get("webUrl"),
            },
        )
    except RuntimeError as exc:
        target.status = ConnectorStatus.needs_review
        return SharePointTestResponse(
            status="failed",
            message=f"SharePoint live test failed: {exc}",
            target=target,
        )


@app.get("/api/sharepoint/input-files", response_model=SharePointInputFilesResponse)
def sharepoint_input_files() -> SharePointInputFilesResponse:
    """List files currently waiting in the configured SharePoint input folder.

    This is read-only: it lists DriveItem children and does not download or write receipt content.
    """
    target = sharepoint_target()
    missing = [key for key, value in required_sharepoint_settings(target).items() if not value]
    if missing:
        return SharePointInputFilesResponse(
            status="not-configured",
            message=f"SharePoint is not configured. Missing: {', '.join(missing)}",
            target=target,
        )

    try:
        token = graph_token()
        drive_id = resolve_drive_id(target, token)
        target.drive_id = drive_id
        target.status = ConnectorStatus.ready

        folder_path = parse.quote(target.input_folder.strip("/"), safe="/")
        children = graph_get(
            f"/drives/{parse.quote(drive_id, safe='')}/root:/{folder_path}:/children"
            "?$select=id,name,webUrl,size,lastModifiedDateTime,file,folder"
            "&$orderby=lastModifiedDateTime%20desc"
            "&$top=500",
            token,
        ).get("value", [])
        if not isinstance(children, list):
            raise RuntimeError("Graph returned an unexpected folder children response.")

        files = [
            drive_item_to_input_file(item)
            for item in children
            if isinstance(item, dict) and item.get("id") and item.get("name")
        ]
        return SharePointInputFilesResponse(
            status="connected",
            message=f"Found {len(files)} item{'s' if len(files) != 1 else ''} in SharePoint input folder '{target.input_folder}'.",
            files=files,
            target=target,
        )
    except RuntimeError as exc:
        target.status = ConnectorStatus.needs_review
        return SharePointInputFilesResponse(
            status="failed",
            message=f"Could not list SharePoint input folder: {exc}",
            target=target,
        )


@app.get("/api/sharepoint/processed-files", response_model=SharePointInputFilesResponse)
def sharepoint_processed_files() -> SharePointInputFilesResponse:
    """List completed files from the configured SharePoint processed folder. Read-only."""
    target = sharepoint_target()
    missing = [key for key, value in required_sharepoint_settings(target).items() if not value]
    if missing:
        return SharePointInputFilesResponse(
            status="not-configured",
            message=f"SharePoint is not configured. Missing: {', '.join(missing)}",
            target=target,
        )

    try:
        token = graph_token()
        drive_id = resolve_drive_id(target, token)
        target.drive_id = drive_id
        target.status = ConnectorStatus.ready

        folder_path = parse.quote(target.output_folder.strip("/"), safe="/")
        children = graph_get(
            f"/drives/{parse.quote(drive_id, safe='')}/root:/{folder_path}:/children"
            "?$select=id,name,webUrl,size,lastModifiedDateTime,file,folder"
            "&$orderby=lastModifiedDateTime%20desc"
            "&$top=500",
            token,
        ).get("value", [])
        if not isinstance(children, list):
            raise RuntimeError("Graph returned an unexpected folder children response.")

        files = [
            drive_item_to_input_file(item)
            for item in children
            if isinstance(item, dict) and item.get("id") and item.get("name")
        ]
        return SharePointInputFilesResponse(
            status="connected",
            message=f"Found {len(files)} processed item{'s' if len(files) != 1 else ''} in SharePoint folder '{target.output_folder}'.",
            files=files,
            target=target,
        )
    except RuntimeError as exc:
        target.status = ConnectorStatus.needs_review
        return SharePointInputFilesResponse(
            status="failed",
            message=f"Could not list SharePoint processed folder: {exc}",
            target=target,
        )


@app.get("/api/sharepoint/input-files/{item_id}", response_model=SharePointFileDetailResponse)
def sharepoint_file_detail(item_id: str) -> SharePointFileDetailResponse:
    """Load one input file plus editable SharePoint metadata fields."""
    target = sharepoint_target()
    try:
        token = graph_token()
        drive_id = resolve_drive_id(target, token)
        item_path = f"/drives/{parse.quote(drive_id, safe='')}/items/{parse.quote(item_id, safe='')}"
        item = graph_get(f"{item_path}?$select=id,name,webUrl,size,lastModifiedDateTime,file,folder", token)
        raw_fields = graph_get(f"{item_path}/listItem/fields", token)
        columns = editable_columns(drive_id, token)
        fields = apply_sharepoint_field_settings([
            field_definition_from_column(column, raw_fields)
            for column in sorted(columns, key=lambda value: int(value.get("_sharepointOrder", 0)))
            if column.get("name")
        ])
        return SharePointFileDetailResponse(
            status="connected",
            message=f"Loaded SharePoint metadata for '{item.get('name', item_id)}'.",
            file=drive_item_to_input_file(item, raw_fields),
            fields=fields,
            raw_fields=raw_fields,
        )
    except RuntimeError as exc:
        return SharePointFileDetailResponse(
            status="failed",
            message=f"Could not load SharePoint file details: {exc}",
            file=SharePointInputFile(id=item_id, name=item_id),
        )


@app.get("/api/sharepoint/input-files/{item_id}/content")
def sharepoint_file_content(item_id: str) -> Response:
    """Proxy file bytes for in-app preview. No metadata or file content is sent outside Graph/browser."""
    target = sharepoint_target()
    try:
        token = graph_token()
        drive_id = resolve_drive_id(target, token)
        data, content_type = graph_get_bytes(f"/drives/{parse.quote(drive_id, safe='')}/items/{parse.quote(item_id, safe='')}/content", token)
        return Response(content=data, media_type=content_type)
    except RuntimeError as exc:
        return Response(content=str(exc), status_code=502, media_type="text/plain")


@app.put("/api/sharepoint/input-files/{item_id}/content", response_model=SharePointActionResponse)
async def replace_sharepoint_file_content(item_id: str, file: UploadFile = File(...)) -> SharePointActionResponse:
    """Replace the PDF bytes in SharePoint, used for user-saved markups/annotations."""
    try:
        if file.content_type not in {"application/pdf", "application/octet-stream", "binary/octet-stream"}:
            raise RuntimeError(f"Expected a PDF upload, got {file.content_type or 'unknown content type'}.")
        data = await file.read()
        if not data:
            raise RuntimeError("Uploaded PDF was empty.")
        token = graph_token()
        drive_id = resolve_drive_id(sharepoint_target(), token)
        graph_put_bytes(
            f"/drives/{parse.quote(drive_id, safe='')}/items/{parse.quote(item_id, safe='')}/content",
            token,
            data,
            "application/pdf",
        )
        return SharePointActionResponse(status="saved", message="Marked-up PDF saved to SharePoint.", file_id=item_id)
    except RuntimeError as exc:
        return SharePointActionResponse(status="failed", message=f"Could not save marked-up PDF: {exc}", file_id=item_id)


@app.patch("/api/sharepoint/input-files/{item_id}/fields", response_model=SharePointActionResponse)
def update_sharepoint_file_fields(item_id: str, update: SharePointFieldUpdate) -> SharePointActionResponse:
    """Save editable metadata back to SharePoint without moving the file."""
    try:
        token = graph_token()
        drive_id = resolve_drive_id(sharepoint_target(), token)
        fields = clean_field_updates(update.fields, drive_id, token)
        saved = update_list_item_fields(item_id, fields, token, drive_id)
        message = "Metadata saved to SharePoint. File remains in the input queue." if fields else "No changed metadata fields to save."
        return SharePointActionResponse(status="saved", message=message, file_id=item_id, saved_fields=saved)
    except RuntimeError as exc:
        return SharePointActionResponse(status="failed", message=f"Could not save metadata: {exc}", file_id=item_id)


@app.post("/api/sharepoint/input-files/{item_id}/hold", response_model=SharePointActionResponse)
def hold_sharepoint_file(item_id: str, update: SharePointFieldUpdate) -> SharePointActionResponse:
    """Save metadata and keep the file in the input list for later review."""
    response = update_sharepoint_file_fields(item_id, update)
    if response.status == "failed":
        return response
    return SharePointActionResponse(status="saved", message="Held for review. Metadata saved; file stays in the input folder.", file_id=item_id)


@app.post("/api/sharepoint/input-files/{item_id}/approve", response_model=SharePointActionResponse)
def approve_sharepoint_file(item_id: str, update: SharePointFieldUpdate) -> SharePointActionResponse:
    """Save metadata, then move the file to the configured processed output folder."""
    target = sharepoint_target()
    try:
        token = graph_token()
        drive_id = resolve_drive_id(target, token)
        fields = clean_field_updates(update.fields, drive_id, token)
        item_path = f"/drives/{parse.quote(drive_id, safe='')}/items/{parse.quote(item_id, safe='')}"
        update_list_item_fields(item_id, fields, token, drive_id)

        output_path = target.output_folder.strip("/")
        if not output_path:
            raise RuntimeError("SHAREPOINT_OUTPUT_FOLDER is empty.")
        encoded_output = parse.quote(output_path, safe="/")
        graph_get(f"/drives/{parse.quote(drive_id, safe='')}/root:/{encoded_output}?$select=id,name,folder", token)
        graph_request(
            "PATCH",
            item_path,
            token,
            {"parentReference": {"path": f"/drives/{drive_id}/root:/{output_path}"}},
        )
        delete_draft(item_id)
        return SharePointActionResponse(
            status="approved",
            message=f"Approved. Metadata saved, file moved to '{target.output_folder}', and local OCR draft removed.",
            file_id=item_id,
        )
    except RuntimeError as exc:
        return SharePointActionResponse(status="failed", message=f"Could not approve file: {exc}", file_id=item_id)


@app.get("/api/tax-receipts/{item_id}/draft", response_model=ReceiptDraftResponse)
def tax_receipt_draft(item_id: str) -> ReceiptDraftResponse:
    draft = get_draft(item_id)
    return ReceiptDraftResponse(message=draft.message, draft=draft)


def receipt_context(item_id: str, token: str, drive_id: str) -> tuple[dict[str, Any], list[SharePointFieldDefinition]]:
    item_path = f"/drives/{parse.quote(drive_id, safe='')}/items/{parse.quote(item_id, safe='')}"
    item = graph_get(f"{item_path}?$select=id,name,webUrl,size,lastModifiedDateTime,file,folder", token)
    raw_fields = graph_get(f"{item_path}/listItem/fields", token)
    columns = editable_columns(drive_id, token)
    fields = [
        field_definition_from_column(column, raw_fields)
        for column in sorted(columns, key=lambda value: int(value.get("_sharepointOrder", 0)))
        if column.get("name")
    ]
    return item, fields


@app.post("/api/tax-receipts/{item_id}/ocr", response_model=ReceiptDraftResponse)
def run_tax_receipt_ocr(item_id: str) -> ReceiptDraftResponse:
    """Download a SharePoint PDF and save local OCR/text extraction results as a draft."""
    target = sharepoint_target()
    draft = save_draft(ReceiptDraft(item_id=item_id, status="processing", message="Downloading PDF and running OCR/text extraction…"))
    try:
        token = graph_token()
        drive_id = resolve_drive_id(target, token)
        item_path = f"/drives/{parse.quote(drive_id, safe='')}/items/{parse.quote(item_id, safe='')}"
        pdf_bytes, _ = graph_get_bytes(f"{item_path}/content", token)
        ocr_text = extract_pdf_text(pdf_bytes)
        draft = save_draft(
            ReceiptDraft(
                item_id=item_id,
                status="ocr-complete",
                message="OCR complete. Text is saved locally and ready for AI suggestions.",
                ocr_text=ocr_text,
                suggestions=draft.suggestions,
                confidence=draft.confidence,
            )
        )
        return ReceiptDraftResponse(message=draft.message, draft=draft)
    except RuntimeError as exc:
        draft = save_draft(ReceiptDraft(item_id=item_id, status="failed", message=str(exc), ocr_text=draft.ocr_text, suggestions=draft.suggestions))
        return ReceiptDraftResponse(status="failed", message=str(exc), draft=draft)


@app.post("/api/tax-receipts/{item_id}/ai-suggestions", response_model=ReceiptDraftResponse)
def run_tax_receipt_ai_suggestions(item_id: str) -> ReceiptDraftResponse:
    """Generate AI suggestions from locally saved OCR text. Does not write to SharePoint."""
    draft = get_draft(item_id)
    if not draft.ocr_text:
        return ReceiptDraftResponse(status="failed", message="Run OCR before getting AI suggestions.", draft=draft)
    try:
        token = graph_token()
        drive_id = resolve_drive_id(sharepoint_target(), token)
        item, fields = receipt_context(item_id, token, drive_id)
        suggestions, confidence = ai_extract_fields(str(item.get("name") or item_id), draft.ocr_text, fields)
        cleaned = clean_field_updates(normalize_ai_suggestions(suggestions, fields), drive_id, token)
        cleaned = {key: value for key, value in cleaned.items() if not key.endswith("@odata.type")}
        draft = save_draft(
            ReceiptDraft(
                item_id=item_id,
                status="ai-extracted",
                message="AI suggestions have been applied to the form for review. Nothing has been written to SharePoint yet.",
                ocr_text=draft.ocr_text,
                suggestions=cleaned,
                confidence=confidence,
            )
        )
        return ReceiptDraftResponse(message=draft.message, draft=draft)
    except (RuntimeError, json.JSONDecodeError, KeyError) as exc:
        draft = save_draft(ReceiptDraft(item_id=item_id, status="failed", message=str(exc), ocr_text=draft.ocr_text, suggestions=draft.suggestions))
        return ReceiptDraftResponse(status="failed", message=str(exc), draft=draft)


@app.post("/api/tax-receipts/{item_id}/ocr-ai", response_model=ReceiptDraftResponse)
def run_tax_receipt_ocr_ai(item_id: str) -> ReceiptDraftResponse:
    """Backward-compatible combined OCR + AI action."""
    ocr_response = run_tax_receipt_ocr(item_id)
    if ocr_response.status == "failed":
        return ocr_response
    return run_tax_receipt_ai_suggestions(item_id)


@app.post("/api/tax-receipts/{item_id}/prepare", response_model=ReceiptDraftResponse)
def prepare_tax_receipt_draft(item_id: str) -> ReceiptDraftResponse:
    """Ensure a receipt has local OCR text and AI suggestions, skipping work already done."""
    draft = get_draft(item_id)
    if draft.status == "ai-extracted" and draft.suggestions:
        return ReceiptDraftResponse(message="AI suggestions already exist for this receipt.", draft=draft)
    if not draft.ocr_text:
        ocr_response = run_tax_receipt_ocr(item_id)
        if ocr_response.status == "failed":
            return ocr_response
    return run_tax_receipt_ai_suggestions(item_id)


@app.get("/api/sharepoint/requirements")
def sharepoint_requirements() -> dict[str, object]:
    return {
        "required_values": [
            "MS_TENANT_DOMAIN, e.g. yourtenant.onmicrosoft.com",
            "MS_TENANT_ID from Microsoft Entra ID",
            "MS_CLIENT_ID from an App Registration",
            "MS_CLIENT_SECRET or certificate credential, stored only server-side",
            "MS_CLIENT_SECRET_EXPIRES_ON for expiry reminders/notifications",
            "SHAREPOINT_SITE_URL for the Invoice site",
            "SHAREPOINT_DOCUMENT_LIBRARY, default Documents",
            "SHAREPOINT_INPUT_FOLDER, default Inbox",
            "SHAREPOINT_OUTPUT_FOLDER, default Processed/FY2025-2026",
        ],
        "recommended_permissions": [
            "Use Sites.Selected where possible instead of tenant-wide Sites.ReadWrite.All",
            "Grant the app read/write only to the Invoice SharePoint site",
            "Allow reading from Documents/Inbox",
            "Allow writing/moving into Documents/Processed/FY2025-2026 and updating list item fields",
        ],
        "notes": [
            "Graph identifies SharePoint document libraries as drives.",
            "Custom metadata fields are updated on the drive item's listItem fields.",
            "Real connection testing is disabled until credentials are configured.",
        ],
    }


@app.post("/api/settings/sharepoint", response_model=SaveSettingsResponse)
def save_sharepoint_settings(update: SharePointSettingsUpdate) -> SaveSettingsResponse:
    updates = {
        "MS_TENANT_DOMAIN": update.tenant_domain,
        "MS_TENANT_ID": update.tenant_id,
        "MS_CLIENT_ID": update.client_id,
        "MS_CLIENT_SECRET_EXPIRES_ON": update.client_secret_expires_on or "",
        "SHAREPOINT_SITE_URL": update.site_url,
        "SHAREPOINT_SITE_ID": update.site_id,
        "SHAREPOINT_DRIVE_ID": update.drive_id,
        "SHAREPOINT_DOCUMENT_LIBRARY": update.library_name,
        "SHAREPOINT_INPUT_FOLDER": update.input_folder,
        "SHAREPOINT_OUTPUT_FOLDER": update.output_folder,
    }
    client_secret_saved = update.client_secret is not None and bool(update.client_secret.get_secret_value())
    if client_secret_saved:
        updates["MS_CLIENT_SECRET"] = update.client_secret.get_secret_value()

    update_env_file(updates)

    reminder_message = None
    if update.client_secret_expires_on:
        reminder_message = "Track this expiry date and notify Boss when the client secret is within 30 days of expiry."

    return SaveSettingsResponse(saved_to=str(ENV_PATH), client_secret_saved=client_secret_saved, reminder_message=reminder_message)


@app.get("/api/settings/sharepoint/fields", response_model=SharePointFieldSettingsResponse)
def get_sharepoint_field_settings() -> SharePointFieldSettingsResponse:
    try:
        token = graph_token()
        drive_id = resolve_drive_id(sharepoint_target(), token)
        columns = editable_columns(drive_id, token)
        fields = apply_sharepoint_field_settings([
            field_definition_from_column(column, {})
            for column in sorted(columns, key=lambda value: int(value.get("_sharepointOrder", 0)))
            if column.get("name")
        ])
        return SharePointFieldSettingsResponse(message=f"Loaded {len(fields)} SharePoint fields.", fields=fields)
    except RuntimeError as exc:
        return SharePointFieldSettingsResponse(status="failed", message=f"Could not load SharePoint fields: {exc}")


@app.post("/api/settings/sharepoint/fields", response_model=SharePointFieldSettingsResponse)
def save_sharepoint_field_settings(update: SharePointFieldSettingsUpdate) -> SharePointFieldSettingsResponse:
    write_sharepoint_field_settings(update.show_in_input_form)
    return get_sharepoint_field_settings()


@app.post("/api/settings/ai", response_model=SaveSettingsResponse)
def save_ai_settings(update: AiSettingsUpdate) -> SaveSettingsResponse:
    updates = {
        "AI_PROVIDER": update.provider,
        "AI_MODEL": update.model,
        "AI_BASE_URL": update.base_url,
    }
    api_key_saved = update.api_key is not None and bool(update.api_key.get_secret_value())
    if api_key_saved:
        updates["AI_API_KEY"] = update.api_key.get_secret_value()

    update_env_file(updates)
    return SaveSettingsResponse(saved_to=str(ENV_PATH), client_secret_saved=api_key_saved)


@app.get("/api/settings/ai/field-definitions", response_model=AiFieldDefinitionsResponse)
def get_ai_field_definitions() -> AiFieldDefinitionsResponse:
    """Return SharePoint metadata fields and editable AI extraction definitions."""
    try:
        token = graph_token()
        drive_id = resolve_drive_id(sharepoint_target(), token)
        columns = editable_columns(drive_id, token)
        fields = [
            field_definition_from_column(column, {})
            for column in sorted(columns, key=lambda value: int(value.get("_sharepointOrder", 0)))
            if column.get("name")
        ]
        custom_definitions = load_ai_field_definitions()
        response_fields = [
            AiFieldDefinition(
                name=field.name,
                display_name=field.display_name,
                field_type=field.field_type,
                choices=field.choices,
                allow_multiple=field.allow_multiple,
                definition=custom_definitions.get(field.name) or purpose_for_field(field),
            )
            for field in fields
        ]
        return AiFieldDefinitionsResponse(
            message=f"Loaded {len(response_fields)} SharePoint field definitions from the configured library.",
            fields=response_fields,
            prompt_preview=prompt_preview(fields),
        )
    except RuntimeError as exc:
        return AiFieldDefinitionsResponse(status="failed", message=f"Could not load SharePoint field definitions: {exc}")


@app.post("/api/settings/ai/field-definitions", response_model=AiFieldDefinitionsResponse)
def save_ai_field_definitions_route(update: AiFieldDefinitionsUpdate) -> AiFieldDefinitionsResponse:
    clean_definitions = {key: value.strip() for key, value in update.definitions.items() if key and value.strip()}
    write_ai_field_definitions(clean_definitions)
    return get_ai_field_definitions()


@app.get("/api/tax-receipts/summary", response_model=ReceiptSummary)
def tax_receipts_summary() -> ReceiptSummary:
    return ReceiptSummary()
