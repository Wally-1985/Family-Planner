from __future__ import annotations

import json
import sqlite3
from datetime import datetime, timedelta, timezone
from enum import Enum
from typing import Any, Literal

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
    role: Literal["Administrator", "User"] = "User"
    pin: str = ""
    email: str = ""
    permissions: list[str] = Field(default_factory=list)


class UserProfilesResponse(BaseModel):
    status: Literal["ok", "failed"] = "ok"
    message: str
    profiles: list[UserProfile] = Field(default_factory=list)


class UserProfilesUpdate(BaseModel):
    profiles: list[UserProfile] = Field(default_factory=list)


class SmtpSettings(BaseModel):
    host: str = ""
    port: int = 587
    username: str = ""
    password_saved: bool = False
    from_email: str = ""
    use_tls: bool = True


class SmtpSettingsUpdate(BaseModel):
    host: str = ""
    port: int = 587
    username: str = ""
    password: SecretStr | None = None
    from_email: str = ""
    use_tls: bool = True


class ForgotPinRequest(BaseModel):
    profile_id: str
    app_url: str = ""


class ResetTokenVerifyRequest(BaseModel):
    profile_id: str
    token: str


class ActionResponse(BaseModel):
    status: Literal["ok", "failed"] = "ok"
    message: str


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


class Chore(BaseModel):
    id: str
    title: str
    description: str = ""
    assigned_to: list[str] = Field(default_factory=lambda: ["everyone"])
    added_by: str = ""
    done: bool = False
    created_at: str = ""


class ChoreCreate(BaseModel):
    title: str
    description: str = ""
    assigned_to: list[str] = Field(default_factory=lambda: ["everyone"])
    added_by: str = ""


class ChoreUpdate(BaseModel):
    done: bool


class ChoresResponse(BaseModel):
    status: Literal["ok", "failed"] = "ok"
    message: str = ""
    chores: list[Chore] = Field(default_factory=list)


class Task(BaseModel):
    id: str
    title: str
    description: str = ""
    assigned_to: list[str] = Field(default_factory=lambda: ["everyone"])
    added_by: str = ""
    schedule: str = "once-off"
    interval_count: int = 1
    interval_unit: str = "week"
    anchor_date: str = ""
    days_of_month: list[int] = Field(default_factory=list)
    months: list[int] = Field(default_factory=list)
    due_dates: list[str] = Field(default_factory=list)
    due_date: str = ""
    end_date: str = ""
    rule_note: str = ""
    is_template: bool = False
    template_id: str = ""
    done: bool = False
    done_date: str = ""
    created_at: str = ""



class SubTask(BaseModel):
    id: str
    task_id: str
    title: str
    done: bool = False
    sort_order: int = 0
    assigned_to: list[str] = Field(default_factory=lambda: ["everyone"])
    created_at: str = ""


class SubTaskCreate(BaseModel):
    title: str
    assigned_to: list[str] = Field(default_factory=lambda: ["everyone"])


class SubTaskUpdate(BaseModel):
    title: str | None = None
    done: bool | None = None
    sort_order: int | None = None
    assigned_to: list[str] | None = None


class SubTasksResponse(BaseModel):
    status: Literal["ok", "failed"] = "ok"
    message: str = ""
    subtasks: list[SubTask] = Field(default_factory=list)


class TaskCreate(BaseModel):
    title: str
    description: str = ""
    assigned_to: list[str] = Field(default_factory=lambda: ["everyone"])
    added_by: str = ""
    schedule: str = "once-off"
    interval_count: int = 1
    interval_unit: str = "week"
    anchor_date: str = ""
    days_of_month: list[int] = Field(default_factory=list)
    months: list[int] = Field(default_factory=list)
    due_dates: list[str] = Field(default_factory=list)
    due_date: str = ""
    end_date: str = ""
    rule_note: str = ""


class TaskDoneUpdate(BaseModel):
    done: bool


class TaskUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    assigned_to: list[str] | None = None
    schedule: str | None = None
    interval_count: int | None = None
    interval_unit: str | None = None
    anchor_date: str | None = None
    days_of_month: list[int] | None = None
    months: list[int] | None = None
    due_dates: list[str] | None = None
    due_date: str | None = None
    end_date: str | None = None
    rule_note: str | None = None


class TasksResponse(BaseModel):
    status: Literal["ok", "failed"] = "ok"
    message: str = ""
    tasks: list[Task] = Field(default_factory=list)


class RosterItem(BaseModel):
    id: str
    name: str
    description: str = ""
    profile_ids: list[str] = Field(default_factory=list)
    start_date: str = ""
    schedule_type: str = "daily"
    interval: int = 1
    weekdays: list[int] = Field(default_factory=list)
    sort_order: int = 0
    created_at: str = ""


class RosterItemCreate(BaseModel):
    name: str
    description: str = ""
    profile_ids: list[str] = Field(default_factory=list)
    start_date: str = ""
    schedule_type: str = "daily"
    interval: int = 1
    weekdays: list[int] = Field(default_factory=list)


class RosterItemUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    profile_ids: list[str] | None = None
    start_date: str | None = None
    schedule_type: str | None = None
    interval: int | None = None
    weekdays: list[int] | None = None
    sort_order: int | None = None


class RosterResponse(BaseModel):
    status: Literal["ok", "failed"] = "ok"
    message: str = ""
    items: list[RosterItem] = Field(default_factory=list)
