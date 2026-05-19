// Shared types, constants, and utility helpers used across all pages.

export type Theme = 'light' | 'dark' | 'system';
export type Page =
  | 'dashboard'
  | 'receipts-inbox'
  | 'processed-receipts'
  | 'family-dashboard'
  | 'family-projections'
  | 'family-actuals'
  | 'chores'
  | 'business'
  | 'settings-sharepoint'
  | 'settings-ai-ocr'
  | 'settings-family-budget'
  | 'settings-users'
  | 'settings-smtp'
  | 'settings-backup'
  | 'settings-bank';

export type UserProfile = {
  id: string;
  name: string;
  role: 'Administrator' | 'User';
  pin: string;
  email: string;
  permissions: Page[];
};

export const pageLabels: Record<Page, string> = {
  dashboard: 'Finance dashboard',
  'receipts-inbox': 'Receipts Inbox',
  'processed-receipts': 'Processed Receipts',
  'family-dashboard': 'Family Budget',
  'family-projections': 'Projections',
  'family-actuals': 'Actual Costs',
  chores: 'Chores',
  business: 'Business budgets',
  'settings-sharepoint': 'SharePoint Library Settings',
  'settings-ai-ocr': 'AI + OCR',
  'settings-family-budget': 'Family Budget Settings',
  'settings-users': 'User Profiles',
  'settings-smtp': 'SMTP Email Settings',
  'settings-backup': 'Backup & Restore',
  'settings-bank': 'Bank Accounts'
};

export const allPermissionPages = Object.keys(pageLabels) as Page[];

export const defaultUserProfiles: UserProfile[] = [
  { id: 'owner', name: 'Owner', role: 'Administrator', pin: '', email: '', permissions: allPermissionPages },
  { id: 'family', name: 'Family', role: 'User', pin: '', email: '', permissions: ['dashboard', 'family-dashboard', 'family-projections', 'family-actuals', 'chores'] }
];

export const firstAllowedPage = (profile: UserProfile | undefined): Page =>
  profile?.permissions?.[0] || 'dashboard';

export const canAccessPage = (profile: UserProfile | undefined, page: Page) =>
  !profile || profile.permissions.includes(page);

export type ConnectorStatus = 'not-connected' | 'ready' | 'needs-review';

export type SettingsState = {
  theme: Theme;
  sharePointTenant: string;
  sharePointTenantId: string;
  sharePointClientId: string;
  sharePointClientSecretExpiry: string;
  sharePointSite: string;
  sharePointSiteId: string;
  sharePointDriveId: string;
  sharePointLibrary: string;
  sharePointInputFolder: string;
  sharePointOutputFolder: string;
  aiProvider: string;
  aiModel: string;
  aiBaseUrl: string;
  bankConnector: ConnectorStatus;
  sharePointConnector: ConnectorStatus;
};

export type SmtpSettingsState = {
  host: string;
  port: number;
  username: string;
  password_saved: boolean;
  from_email: string;
  use_tls: boolean;
};

export const defaultSettings: SettingsState = {
  theme: 'system',
  sharePointTenant: '',
  sharePointTenantId: '',
  sharePointClientId: '',
  sharePointClientSecretExpiry: '',
  sharePointSite: '',
  sharePointSiteId: '',
  sharePointDriveId: '',
  sharePointLibrary: 'Documents',
  sharePointInputFolder: 'Inbox',
  sharePointOutputFolder: 'Processed/FY2025-2026',
  aiProvider: 'OpenAI',
  aiModel: 'gpt-4o-mini',
  aiBaseUrl: 'https://api.openai.com/v1',
  bankConnector: 'not-connected',
  sharePointConnector: 'not-connected'
};

export type SharePointInputFile = {
  id: string;
  name: string;
  web_url: string;
  size: number;
  last_modified: string;
  item_type: 'file' | 'folder';
  status: string;
};

export type SharePointFieldDefinition = {
  name: string;
  display_name: string;
  field_type: string;
  value: unknown;
  read_only: boolean;
  order: number;
  required: boolean;
  description: string;
  default_value: unknown;
  choices: string[];
  allow_text_entry: boolean;
  allow_multiple: boolean;
  min_value: number | null;
  max_value: number | null;
  max_length: number | null;
  show_in_input_form: boolean;
};

export type SharePointFileDetail = {
  status: 'connected' | 'failed';
  message: string;
  file: SharePointInputFile;
  fields: SharePointFieldDefinition[];
  raw_fields: Record<string, unknown>;
};

export type ReceiptDraft = {
  item_id: string;
  status: string;
  message: string;
  ocr_text: string;
  suggestions: Record<string, unknown>;
  confidence: number | null;
  updated_at: string;
};

export type AiFieldDefinition = {
  name: string;
  display_name: string;
  field_type: string;
  choices: string[];
  allow_multiple: boolean;
  definition: string;
};

export type SortKey = 'name' | 'item_type' | 'size' | 'last_modified' | 'status';
export type SortDirection = 'asc' | 'desc';

export type BudgetCycle =
  | 'weekly'
  | 'fortnightly'
  | 'monthly'
  | 'quarterly'
  | 'bi-annually'
  | 'annually'
  | 'once-off'
  | 'random';
export type BudgetSchedule = 'recurring' | 'once-off' | 'random';
export type BudgetIntervalUnit = 'day' | 'week' | 'month' | 'year';
export type BudgetKind = 'income' | 'expense';
export type ProjectionRangePreset =
  | 'entire-year'
  | 'remaining-year'
  | 'current-month'
  | 'current-fortnight'
  | 'current-week'
  | 'custom';

export type BudgetItem = {
  id: string;
  kind: BudgetKind;
  name: string;
  supplier?: string;
  amount: number;
  cycle: BudgetCycle;
  schedule?: BudgetSchedule;
  intervalCount?: number;
  intervalUnit?: BudgetIntervalUnit;
  anchorDate?: string;
  endDate?: string;
  dayOfMonth?: number;
  daysOfMonth?: number[];
  months?: number[];
  dueDates?: string[];
  category?: string;
  note?: string;
};

export type SavingsAccount = {
  id: string;
  name: string;
  balance: number;
  note?: string;
};

export type ActualCostTransaction = {
  id: string;
  date: string;
  description: string;
  amount: number;
  account?: string;
  category?: string;
  notes?: string;
};

export type CsvMapping = {
  date: string;
  description: string;
  amount: string;
  account: string;
};

export type Chore = {
  id: string;
  title: string;
  description: string;
  assigned_to: string;
  added_by: string;
  done: boolean;
  created_at: string;
};

export const FAMILY_BUDGET_STORAGE_KEY = 'finances.familyBudget.items.v1';
export const SAVINGS_ACCOUNTS_STORAGE_KEY = 'finances.familyBudget.savingsAccounts.v1';
export const FAMILY_BUDGET_CATEGORIES_STORAGE_KEY = 'finances.familyBudget.expenseCategories.v1';
export const defaultExpenseCategories = [
  'Housing', 'Groceries', 'Car', 'Utilities', 'Insurance',
  'School', 'Subscriptions', 'Business', 'Personal', 'Once-off'
];
export const categoryChartColors = [
  '#d97735', '#3f8d65', '#4f7cac', '#b85d22', '#8b5cf6',
  '#dc8a32', '#c23b3b', '#2f9e9b', '#7d7367'
];
