import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  BarChart3,
  BriefcaseBusiness,
  ArrowLeft,
  PanelLeftClose,
  PanelLeftOpen,
  Building2,
  CheckCircle2,
  ChevronRight,
  Cloud,
  Download,
  RefreshCw,
  FileScan,
  Home,
  Landmark,
  Moon,
  ReceiptText,
  Search,
  Save,
  Settings,
  ShieldCheck,
  Sparkles,
  Sun,
  Upload,
  WalletCards
} from 'lucide-react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';
import './styles.css';

type Theme = 'light' | 'dark' | 'system';
type Page = 'dashboard' | 'receipts-inbox' | 'processed-receipts' | 'family-dashboard' | 'family-projections' | 'family-actuals' | 'business' | 'settings-sharepoint' | 'settings-ai-ocr' | 'settings-family-budget' | 'settings-backup' | 'settings-bank';

type ConnectorStatus = 'not-connected' | 'ready' | 'needs-review';

type SettingsState = {
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

const defaultSettings: SettingsState = {
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

const receiptTrend = [
  { month: 'Jan', receipts: 18, reviewed: 12 },
  { month: 'Feb', receipts: 31, reviewed: 25 },
  { month: 'Mar', receipts: 26, reviewed: 20 },
  { month: 'Apr', receipts: 44, reviewed: 35 },
  { month: 'May', receipts: 37, reviewed: 22 }
];

const categorySpend = [
  { name: 'Fuel', value: 1840 },
  { name: 'Tools', value: 1260 },
  { name: 'Meals', value: 720 },
  { name: 'Software', value: 950 },
  { name: 'Travel', value: 1110 }
];

type SharePointInputFile = {
  id: string;
  name: string;
  web_url: string;
  size: number;
  last_modified: string;
  item_type: 'file' | 'folder';
  status: string;
};

type SharePointFieldDefinition = {
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

type SharePointFileDetail = {
  status: 'connected' | 'failed';
  message: string;
  file: SharePointInputFile;
  fields: SharePointFieldDefinition[];
  raw_fields: Record<string, unknown>;
};

type ReceiptDraft = {
  item_id: string;
  status: string;
  message: string;
  ocr_text: string;
  suggestions: Record<string, unknown>;
  confidence: number | null;
  updated_at: string;
};

type AiFieldDefinition = {
  name: string;
  display_name: string;
  field_type: string;
  choices: string[];
  allow_multiple: boolean;
  definition: string;
};

type SortKey = 'name' | 'item_type' | 'size' | 'last_modified' | 'status';
type SortDirection = 'asc' | 'desc';

function readSettings(): SettingsState {
  try {
    const saved = localStorage.getItem('finances.settings');
    return saved ? { ...defaultSettings, ...JSON.parse(saved) } : defaultSettings;
  } catch {
    return defaultSettings;
  }
}

function App() {
  const [page, setPage] = useState<Page>('dashboard');
  const [settings, setSettings] = useState<SettingsState>(readSettings);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(280);

  const startSidebarResize = (event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = sidebarWidth;

    const onPointerMove = (moveEvent: PointerEvent) => {
      const nextWidth = Math.min(420, Math.max(220, startWidth + moveEvent.clientX - startX));
      setSidebarWidth(nextWidth);
    };

    const onPointerUp = () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  };

  const effectiveTheme = useMemo(() => {
    if (settings.theme === 'system') {
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    return settings.theme;
  }, [settings.theme]);

  useEffect(() => {
    document.documentElement.dataset.theme = effectiveTheme;
    localStorage.setItem('finances.settings', JSON.stringify(settings));
  }, [settings, effectiveTheme]);

  const updateSettings = (patch: Partial<SettingsState>) => setSettings((current) => ({ ...current, ...patch }));

  return (
    <div className={sidebarCollapsed ? 'app-shell sidebar-collapsed' : 'app-shell'} style={{ '--sidebar-width': `${sidebarWidth}px` } as React.CSSProperties}>
      <Sidebar current={page} onNavigate={setPage} collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed((value) => !value)} onResizeStart={startSidebarResize} />
      <main className="main-panel">
        <TopBar page={page} sidebarCollapsed={sidebarCollapsed} onToggleSidebar={() => setSidebarCollapsed((value) => !value)} />
        {page === 'dashboard' && <Dashboard onNavigate={setPage} />}
        {page === 'receipts-inbox' && <TaxReceipts />}
        {page === 'processed-receipts' && <ProcessedReceipts />}
        {page === 'family-dashboard' && <FamilyBudgetDashboard />}
        {page === 'family-projections' && <FamilyBudget />}
        {page === 'family-actuals' && <ActualCostsPage />}
        {page === 'business' && <ComingSoon title="Business budgets" icon={<BriefcaseBusiness />} />}
        {page === 'settings-sharepoint' && <SettingsPage section="sharepoint" settings={settings} update={updateSettings} />}
        {page === 'settings-ai-ocr' && <SettingsPage section="ai-ocr" settings={settings} update={updateSettings} />}
        {page === 'settings-family-budget' && <SettingsPage section="family-budget" settings={settings} update={updateSettings} />}
        {page === 'settings-backup' && <SettingsPage section="backup" settings={settings} update={updateSettings} />}
        {page === 'settings-bank' && <SettingsPage section="bank" settings={settings} update={updateSettings} />}
      </main>
    </div>
  );
}

function Sidebar({
  current,
  onNavigate,
  collapsed,
  onToggle,
  onResizeStart
}: {
  current: Page;
  onNavigate: (page: Page) => void;
  collapsed: boolean;
  onToggle: () => void;
  onResizeStart: (event: React.PointerEvent<HTMLDivElement>) => void;
}) {
  const otherItems: Array<{ id: Page; label: string; icon: React.ReactNode }> = [
    { id: 'business', label: 'Business budgets', icon: <Building2 size={18} /> }
  ];
  const taxActive = current === 'receipts-inbox' || current === 'processed-receipts';
  const familyActive = current === 'family-dashboard' || current === 'family-projections' || current === 'family-actuals';
  const settingsActive = current === 'settings-sharepoint' || current === 'settings-ai-ocr' || current === 'settings-family-budget' || current === 'settings-backup' || current === 'settings-bank';

  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-copy">
          <strong>Finances</strong>
        </div>
        <button className="sidebar-toggle" onClick={onToggle} aria-label={collapsed ? 'Open sidebar' : 'Collapse sidebar'}>
          {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
        </button>
      </div>
      <nav>
        <button className={current === 'dashboard' ? 'active nav-item' : 'nav-item'} onClick={() => onNavigate('dashboard')} title={collapsed ? 'Dashboard' : undefined}>
          <Home size={18} />
          <span>Dashboard</span>
        </button>
        <div className={taxActive ? 'nav-group active' : 'nav-group'}>
          <button className={taxActive ? 'active nav-item' : 'nav-item'} onClick={() => onNavigate('receipts-inbox')} title={collapsed ? 'Tax Receipts' : undefined}>
            <ReceiptText size={18} />
            <span>Tax Receipts</span>
          </button>
          {!collapsed && (
            <div className="nav-subitems">
              <button className={current === 'receipts-inbox' ? 'active nav-subitem' : 'nav-subitem'} onClick={() => onNavigate('receipts-inbox')}>Receipts Inbox</button>
              <button className={current === 'processed-receipts' ? 'active nav-subitem' : 'nav-subitem'} onClick={() => onNavigate('processed-receipts')}>Processed Receipts</button>
            </div>
          )}
        </div>
        <div className={familyActive ? 'nav-group active' : 'nav-group'}>
          <button className={familyActive ? 'active nav-item' : 'nav-item'} onClick={() => onNavigate('family-dashboard')} title={collapsed ? 'Family Budget' : undefined}>
            <Landmark size={18} />
            <span>Family Budget</span>
          </button>
          {!collapsed && (
            <div className="nav-subitems">
              <button className={current === 'family-projections' ? 'active nav-subitem' : 'nav-subitem'} onClick={() => onNavigate('family-projections')}>Projections</button>
              <button className={current === 'family-actuals' ? 'active nav-subitem' : 'nav-subitem'} onClick={() => onNavigate('family-actuals')}>Actual Costs</button>
            </div>
          )}
        </div>
        {otherItems.map((item) => (
          <button key={item.id} className={current === item.id ? 'active nav-item' : 'nav-item'} onClick={() => onNavigate(item.id)} title={collapsed ? item.label : undefined}>
            {item.icon}
            <span>{item.label}</span>
          </button>
        ))}
        <div className={settingsActive ? 'nav-group active' : 'nav-group'}>
          <button className={settingsActive ? 'active nav-item' : 'nav-item'} onClick={() => onNavigate('settings-sharepoint')} title={collapsed ? 'Settings' : undefined}>
            <Settings size={18} />
            <span>Settings</span>
          </button>
          {!collapsed && (
            <div className="nav-subitems">
              <button className={current === 'settings-sharepoint' ? 'active nav-subitem' : 'nav-subitem'} onClick={() => onNavigate('settings-sharepoint')}>SharePoint Library Settings</button>
              <button className={current === 'settings-ai-ocr' ? 'active nav-subitem' : 'nav-subitem'} onClick={() => onNavigate('settings-ai-ocr')}>AI + OCR</button>
              <button className={current === 'settings-family-budget' ? 'active nav-subitem' : 'nav-subitem'} onClick={() => onNavigate('settings-family-budget')}>Family Budget</button>
              <button className={current === 'settings-backup' ? 'active nav-subitem' : 'nav-subitem'} onClick={() => onNavigate('settings-backup')}>Backup & Restore</button>
              <button className={current === 'settings-bank' ? 'active nav-subitem' : 'nav-subitem'} onClick={() => onNavigate('settings-bank')}>Bank Accounts</button>
            </div>
          )}
        </div>
      </nav>
      <div className="sidebar-note">
        <ShieldCheck size={18} />
        <span>Local-first. Review before SharePoint writes.</span>
      </div>
      {!collapsed && <div className="sidebar-resizer" onPointerDown={onResizeStart} aria-label="Resize sidebar" />}
    </aside>
  );
}

function TopBar({ page, sidebarCollapsed, onToggleSidebar }: { page: Page; sidebarCollapsed: boolean; onToggleSidebar: () => void }) {
  const titles: Record<Page, string> = {
    dashboard: 'Finance dashboard',
    'receipts-inbox': 'Receipts Inbox',
    'processed-receipts': 'Processed Receipts',
    'family-dashboard': 'Family Budget',
    'family-projections': 'Projections',
    'family-actuals': 'Actual Costs',
    business: 'Business budgets',
    'settings-sharepoint': 'SharePoint Library Settings',
    'settings-ai-ocr': 'AI + OCR',
    'settings-family-budget': 'Family Budget Settings',
    'settings-backup': 'Backup & Restore',
    'settings-bank': 'Bank Accounts'
  };

  return (
    <header className="topbar">
      <div className="topbar-title">
        <button className="topbar-sidebar-toggle" onClick={onToggleSidebar} aria-label={sidebarCollapsed ? 'Open sidebar' : 'Collapse sidebar'}>
          {sidebarCollapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
        </button>
        <div>
          <p className="eyebrow">Local development workspace</p>
          <h1>{titles[page]}</h1>
        </div>
      </div>

    </header>
  );
}

function Dashboard({ onNavigate }: { onNavigate: (page: Page) => void }) {
  return (
    <section className="content-grid dashboard-grid">
      <HeroCard />
      <MetricCard title="Receipts synced" value="156" detail="37 this month" icon={<Cloud />} />
      <MetricCard title="Needs review" value="21" detail="AI confidence under threshold" icon={<FileScan />} />
      <MetricCard title="Ready to write" value="68" detail="Approved metadata pending" icon={<CheckCircle2 />} />
      <div className="card chart-card span-2">
        <div className="card-header">
          <div>
            <p className="eyebrow">Progress</p>
            <h2>Receipt processing trend</h2>
          </div>
        </div>
        <ResponsiveContainer width="100%" height={260}>
          <AreaChart data={receiptTrend}>
            <defs>
              <linearGradient id="receipts" x1="0" x2="0" y1="0" y2="1">
                <stop offset="5%" stopColor="var(--accent)" stopOpacity={0.35} />
                <stop offset="95%" stopColor="var(--accent)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="month" stroke="var(--muted)" />
            <YAxis stroke="var(--muted)" />
            <Tooltip contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 14 }} />
            <Area type="monotone" dataKey="receipts" stroke="var(--accent)" fill="url(#receipts)" strokeWidth={3} />
            <Area type="monotone" dataKey="reviewed" stroke="var(--success)" fill="transparent" strokeWidth={2} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <div className="card chart-card">
        <div className="card-header">
          <div>
            <p className="eyebrow">Spend</p>
            <h2>Top categories</h2>
          </div>
        </div>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={categorySpend}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="name" stroke="var(--muted)" />
            <YAxis stroke="var(--muted)" />
            <Tooltip contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 14 }} />
            <Bar dataKey="value" fill="var(--accent)" radius={[8, 8, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <button className="card action-card" onClick={() => onNavigate('receipts-inbox')}>
        <ReceiptText />
        <div>
          <h2>Open Tax Receipts</h2>
          <p>Review OCR, extracted fields, SharePoint sync state, and write-back queue.</p>
        </div>
        <ChevronRight />
      </button>
    </section>
  );
}

function HeroCard() {
  return (
    <div className="hero-card span-2">
      <div>
        <p className="eyebrow">Tax Receipts MVP</p>
        <h2>One calm place to sync, OCR, review, and file receipts.</h2>
        <p>
          Built to keep SharePoint as the document source of truth while this app tracks progress, extraction confidence, and approval history.
        </p>
      </div>
      <div className="hero-orb"><Sparkles /></div>
    </div>
  );
}

function MetricCard({ title, value, detail, icon }: { title: string; value: string; detail: string; icon: React.ReactNode }) {
  return (
    <div className="card metric-card">
      <div className="metric-icon">{icon}</div>
      <p>{title}</p>
      <strong>{value}</strong>
      <span>{detail}</span>
    </div>
  );
}

type BudgetCycle = 'weekly' | 'fortnightly' | 'monthly' | 'quarterly' | 'bi-annually' | 'annually' | 'once-off' | 'random';
type BudgetSchedule = 'recurring' | 'once-off' | 'random';
type BudgetIntervalUnit = 'day' | 'week' | 'month' | 'year';
type BudgetKind = 'income' | 'expense';
type ProjectionRangePreset = 'entire-year' | 'remaining-year' | 'current-month' | 'current-fortnight' | 'current-week' | 'custom';

type BudgetItem = {
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

type SavingsAccount = {
  id: string;
  name: string;
  balance: number;
  note?: string;
};

type ActualCostTransaction = {
  id: string;
  date: string;
  description: string;
  amount: number;
  account?: string;
  category?: string;
  notes?: string;
};

type CsvMapping = {
  date: string;
  description: string;
  amount: string;
  account: string;
};

const FAMILY_BUDGET_STORAGE_KEY = 'finances.familyBudget.items.v1';
const SAVINGS_ACCOUNTS_STORAGE_KEY = 'finances.familyBudget.savingsAccounts.v1';
const FAMILY_BUDGET_CATEGORIES_STORAGE_KEY = 'finances.familyBudget.expenseCategories.v1';
const defaultExpenseCategories = ['Housing', 'Groceries', 'Car', 'Utilities', 'Insurance', 'School', 'Subscriptions', 'Business', 'Personal', 'Once-off'];
const categoryChartColors = ['#d97735', '#3f8d65', '#4f7cac', '#b85d22', '#8b5cf6', '#dc8a32', '#c23b3b', '#2f9e9b', '#7d7367'];

const familyBudgetItems: BudgetItem[] = [
  { id: 'james-income', kind: 'income', name: 'James Income', supplier: 'AGnVET', amount: 4130.15, cycle: 'fortnightly', anchorDate: '2026-05-21', note: 'Fortnight Thursday' },
  { id: 'meg-pay', kind: 'income', name: 'Meg Pay', amount: 2229.05, cycle: 'fortnightly', anchorDate: '2026-05-22' },
  { id: 'millie-board', kind: 'income', name: 'Millie Board', amount: 50, cycle: 'weekly', anchorDate: '2026-05-19' },
  { id: 'daily-expenses', kind: 'income', name: 'Daily expenses allowance', amount: 1724, cycle: 'monthly', dayOfMonth: 1 },
  { id: 'mux-finance', kind: 'expense', name: 'Car - MU-X Finance', supplier: 'Suncorp', amount: 479.76, cycle: 'fortnightly', anchorDate: '2026-05-22' },
  { id: 'mux-fuel', kind: 'expense', name: 'Car - MU-X Fuel', supplier: 'Various', amount: 120, cycle: 'fortnightly', anchorDate: '2026-05-22' },
  { id: 'mux-insurance', kind: 'expense', name: 'Car - MU-X Insurance', amount: 106.44, cycle: 'monthly', dayOfMonth: 25 },
  { id: 'aurion-insurance', kind: 'expense', name: 'Car - Aurion Insurance', amount: 94.81, cycle: 'monthly', dayOfMonth: 18 },
  { id: 'rent', kind: 'expense', name: 'Rent', supplier: 'Ray White', amount: 870, cycle: 'weekly', anchorDate: '2026-05-19' },
  { id: 'school-fees', kind: 'expense', name: 'School Fees', supplier: 'Genesis', amount: 775, cycle: 'weekly', anchorDate: '2026-05-19' },
  { id: 'groceries', kind: 'expense', name: 'Groceries, food, alcohol, cafe, etc', supplier: 'Various', amount: 450, cycle: 'weekly', anchorDate: '2026-05-19' },
  { id: 'takeaway', kind: 'expense', name: 'Takeaway', amount: 120, cycle: 'weekly', anchorDate: '2026-05-19' },
  { id: 'internet', kind: 'expense', name: 'Internet', supplier: 'Neptune', amount: 90, cycle: 'monthly', dayOfMonth: 13 },
  { id: 'meg-phone', kind: 'expense', name: "Meg's Phone", supplier: 'Optus', amount: 115, cycle: 'monthly', dayOfMonth: 29 },
  { id: 'health-insurance', kind: 'expense', name: 'Health Insurance', supplier: 'Bupa', amount: 47.93, cycle: 'monthly', dayOfMonth: 17 },
  { id: 'apple-one', kind: 'expense', name: 'Streaming - Apple One', supplier: 'Apple / Stan / Netflix / Amazon', amount: 35, cycle: 'monthly', dayOfMonth: 22 },
  { id: 'chatgpt', kind: 'expense', name: 'ChatGPT', amount: 36, cycle: 'monthly', dayOfMonth: 4 },
  { id: 'electricity', kind: 'expense', name: 'Electricity', supplier: 'Harcourts', amount: 300, cycle: 'quarterly', months: [2, 5, 8, 11], dayOfMonth: 15 },
  { id: 'water', kind: 'expense', name: 'Water', supplier: 'Harcourts', amount: 133, cycle: 'quarterly', months: [3, 6, 9, 12], dayOfMonth: 15 },
  { id: 'pool-guy', kind: 'expense', name: 'Pool Guy', amount: 40, cycle: 'monthly', dayOfMonth: 15 },
  { id: 'qtu', kind: 'expense', name: 'QLD Teachers Union', supplier: 'QTU', amount: 16.75, cycle: 'fortnightly', anchorDate: '2026-05-22' },
  { id: 'emb-insurance', kind: 'expense', name: 'Embers - Business Insurance', supplier: 'Elders Insurance', amount: 190, cycle: 'monthly', dayOfMonth: 17 },
  { id: 'emb-trailer', kind: 'expense', name: 'Embers - Trailer Repayment', amount: 700, cycle: 'monthly', dayOfMonth: 1 },
  { id: 'aurion-rego', kind: 'expense', name: 'Car - Aurion Rego', supplier: 'TMR', amount: 452.8, cycle: 'bi-annually', dueDates: ['2026-02-12', '2026-08-12'] },
  { id: 'aurion-racq', kind: 'expense', name: 'Car - Aurion RACQ', supplier: 'RACQ', amount: 193.15, cycle: 'annually', dueDates: ['2026-02-20'] },
  { id: 'mux-rego', kind: 'expense', name: 'Car - MUX Rego', supplier: 'TMR', amount: 368.65, cycle: 'bi-annually', dueDates: ['2026-07-28', '2027-01-28'] },
  { id: 'mothers-day', kind: 'expense', name: 'Mother’s Day', amount: 300, cycle: 'once-off', dueDates: ['2026-05-10'] },
  { id: 'meg-mum', kind: 'expense', name: "Meg's Mum", amount: 600, cycle: 'once-off', dueDates: ['2026-06-01'] }
];

function FamilyBudgetDashboard() {
  const [items, setItems] = useState<BudgetItem[]>([]);
  const [actuals, setActuals] = useState<ActualCostTransaction[]>([]);
  const [fromDate, setFromDate] = useState(() => formatAuDate(addDays(new Date(), -30)));
  const [toDate, setToDate] = useState(() => formatAuDate(new Date()));
  const [status, setStatus] = useState('Loading family budget comparison…');
  const [selectedDashboardCategory, setSelectedDashboardCategory] = useState<string | null>(null);
  const defaultDashboardRangeSet = useRef(false);

  useEffect(() => {
    const load = async () => {
      try {
        const [itemsResponse, actualsResponse] = await Promise.all([fetch('/api/family-budget/items'), fetch('/api/family-budget/actual-costs')]);
        if (!itemsResponse.ok || !actualsResponse.ok) throw new Error('Could not load family budget dashboard data.');
        const itemsResult = await itemsResponse.json();
        const actualsResult = await actualsResponse.json();
        setItems(Array.isArray(itemsResult.items) ? itemsResult.items.map(normalizeBudgetItem) : []);
        setActuals(Array.isArray(actualsResult.transactions) ? actualsResult.transactions : []);
        setStatus('Comparing projections against imported actual costs.');
      } catch (error) {
        setStatus(error instanceof Error ? error.message : 'Could not load family budget dashboard data.');
      }
    };
    void load();
  }, []);

  useEffect(() => {
    if (defaultDashboardRangeSet.current || !items.length) return;
    const start = findLastTuesdayIncomeDate(items, new Date());
    setFromDate(formatAuDate(start));
    setToDate(formatAuDate(addDays(start, 13)));
    defaultDashboardRangeSet.current = true;
  }, [items]);

  const from = parseBudgetDate(fromDate);
  const to = parseBudgetDate(toDate);
  const days = from && to ? Math.max(1, Math.round((to.getTime() - from.getTime()) / 86_400_000) + 1) : 30;
  const projected = items.filter((item) => item.kind === 'expense').reduce((sum, item) => sum + annualizedBudgetAmount(item) * (days / 365.25), 0);
  const filteredActuals = actuals.filter((item) => {
    const date = parseBudgetDate(item.date);
    return date && from && to ? date >= from && date <= to : true;
  });
  const actualTotal = filteredActuals.reduce((sum, item) => sum + Math.abs(item.amount), 0);
  const variance = actualTotal - projected;
  const comparisonData = buildActualComparisonData(items, filteredActuals, days);

  return (
    <section className="page-stack">
      <div className="content-grid compact">
        <MetricCard title="Projected costs" value={formatMoney(projected)} detail={`${days} day projection`} icon={<BarChart3 />} />
        <MetricCard title="Actual costs" value={formatMoney(actualTotal)} detail={`${filteredActuals.length} imported transactions`} icon={<ReceiptText />} />
        <MetricCard title="Variance" value={formatMoney(variance)} detail={variance > 0 ? 'Over projection' : 'Under projection'} icon={<WalletCards />} />
      </div>
      <div className="card hero-card budget-hero">
        <div>
          <p className="eyebrow">Family Budget Dashboard</p>
          <h2>Projection vs Actual Costs</h2>
          <p>Compare the projection schedule against imported bank transactions for a date range.</p>
          <p className="help-text">{status}</p>
        </div>
        <div className="budget-controls">
          <label>From<input type="date" value={toDateInputValue(fromDate)} onChange={(event) => setFromDate(formatBudgetDateText(event.target.value))} /></label>
          <label>To<input type="date" value={toDateInputValue(toDate)} onChange={(event) => setToDate(formatBudgetDateText(event.target.value))} /></label>
        </div>
      </div>
      <div className="card span-2 table-card">
        <div className="card-header"><div><p className="eyebrow">By category</p><h2>Projected vs actual</h2></div></div>
        <ResponsiveContainer width="100%" height={340}>
          <BarChart
            data={comparisonData}
            onClick={(event: any) => {
              const category = event?.activeLabel || event?.activePayload?.[0]?.payload?.category;
              if (category) setSelectedDashboardCategory(category);
            }}
            style={{ cursor: 'pointer' }}
          >
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="category" />
            <YAxis tickFormatter={(value) => formatMoney(Number(value))} />
            <Tooltip formatter={(value) => formatMoney(Number(value))} />
            <Bar dataKey="projected" fill="var(--accent)" name="Projected" cursor="pointer" />
            <Bar dataKey="actual" fill="#dc8a32" name="Actual" cursor="pointer" />
          </BarChart>
        </ResponsiveContainer>
      </div>
      {selectedDashboardCategory && <DashboardCategoryModal category={selectedDashboardCategory} items={items} actuals={filteredActuals} days={days} onClose={() => setSelectedDashboardCategory(null)} />}
    </section>
  );
}

function DashboardCategoryModal({ category, items, actuals, days, onClose }: { category: string; items: BudgetItem[]; actuals: ActualCostTransaction[]; days: number; onClose: () => void }) {
  const projectedRows = items.filter((item) => item.kind === 'expense' && (item.category || 'Uncategorised') === category).map((item) => ({ item, projected: annualizedBudgetAmount(item) * (days / 365.25) })).sort((a, b) => b.projected - a.projected);
  const actualRows = actuals.filter((item) => (item.category || 'Uncategorised') === category).sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
  const projectedTotal = projectedRows.reduce((sum, row) => sum + row.projected, 0);
  const actualTotal = actualRows.reduce((sum, row) => sum + Math.abs(row.amount), 0);

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal-card budget-modal dashboard-category-modal">
        <div className="card-header">
          <div><p className="eyebrow">Category detail</p><h2>{category}</h2></div>
          <button className="secondary-button" type="button" onClick={onClose}>Close</button>
        </div>
        <div className="detail-summary-grid">
          <MetricCard title="Projected" value={formatMoney(projectedTotal)} detail={`${projectedRows.length} projection item${projectedRows.length === 1 ? '' : 's'}`} icon={<BarChart3 />} />
          <MetricCard title="Actual" value={formatMoney(actualTotal)} detail={`${actualRows.length} imported transaction${actualRows.length === 1 ? '' : 's'}`} icon={<ReceiptText />} />
          <MetricCard title="Variance" value={formatMoney(actualTotal - projectedTotal)} detail={actualTotal > projectedTotal ? 'Over projection' : 'Under projection'} icon={<WalletCards />} />
          <MetricCard title="Range" value={`${days} days`} detail="Selected dashboard range" icon={<WalletCards />} />
        </div>
        <div className="dashboard-category-detail-grid">
          <div className="card table-card">
            <div className="card-header"><div><p className="eyebrow">Projected</p><h2>Schedule items</h2></div></div>
            <div className="table-wrap budget-table-wrap"><table><thead><tr><th>Item</th><th>Rule</th><th>Projected</th></tr></thead><tbody>{projectedRows.map(({ item, projected }) => <tr key={item.id}><td>{item.name}</td><td>{budgetRuleLabel(item)}</td><td>{formatMoney(projected)}</td></tr>)}{!projectedRows.length && <tr><td colSpan={3}>No projected items in this category.</td></tr>}</tbody></table></div>
          </div>
          <div className="card table-card">
            <div className="card-header"><div><p className="eyebrow">Actual</p><h2>Imported transactions</h2></div></div>
            <div className="table-wrap budget-table-wrap"><table><thead><tr><th>Date</th><th>Description</th><th>Account</th><th>Amount</th></tr></thead><tbody>{actualRows.map((item) => <tr key={item.id}><td>{item.date}</td><td>{item.description}</td><td>{item.account || '—'}</td><td>{formatMoney(Math.abs(item.amount))}</td></tr>)}{!actualRows.length && <tr><td colSpan={4}>No actual transactions in this category.</td></tr>}</tbody></table></div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ActualCostsPage() {
  const [transactions, setTransactions] = useState<ActualCostTransaction[]>([]);
  const [categories, setCategories] = useState<string[]>(() => loadExpenseCategories());
  const [status, setStatus] = useState('Loading actual costs…');
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvRows, setCsvRows] = useState<Record<string, string>[]>([]);
  const [mapping, setMapping] = useState<CsvMapping>({ date: '', description: '', amount: '', account: '' });
  const [sortKey, setSortKey] = useState<keyof ActualCostTransaction>('date');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  useEffect(() => {
    const load = async () => {
      try {
        const [transactionsResponse, categoriesResponse] = await Promise.all([fetch('/api/family-budget/actual-costs'), fetch('/api/family-budget/categories')]);
        if (!transactionsResponse.ok) throw new Error('Could not load actual costs.');
        const transactionResult = await transactionsResponse.json();
        const categoryResult = categoriesResponse.ok ? await categoriesResponse.json() : { categories: [] };
        setTransactions(Array.isArray(transactionResult.transactions) ? transactionResult.transactions : []);
        if (Array.isArray(categoryResult.categories) && categoryResult.categories.length) setCategories(categoryResult.categories);
        setStatus(transactionResult.message || 'Actual costs loaded.');
      } catch (error) {
        setStatus(error instanceof Error ? error.message : 'Could not load actual costs.');
      }
    };
    void load();
  }, []);

  const saveTransactions = async (nextTransactions: ActualCostTransaction[]) => {
    setTransactions(nextTransactions);
    setStatus('Saving actual costs…');
    try {
      const response = await fetch('/api/family-budget/actual-costs', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transactions: nextTransactions })
      });
      if (!response.ok) throw new Error(`Save failed with HTTP ${response.status}`);
      const result = await response.json();
      setStatus(result.message || 'Actual costs saved.');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not save actual costs.');
    }
  };

  const loadCsvFile = async (file: File) => {
    const text = await file.text();
    const { headers, rows } = parseCsv(text);
    setCsvHeaders(headers);
    setCsvRows(rows);
    setMapping({ date: guessHeader(headers, ['date', 'transaction date', 'posted date']), description: guessHeader(headers, ['description', 'details', 'memo', 'transaction']), amount: guessHeader(headers, ['amount', 'debit', 'value']), account: guessHeader(headers, ['account', 'account name']) });
    setStatus(`Loaded ${rows.length} CSV rows. Map the fields, then import.`);
  };

  const importMappedRows = () => {
    if (!mapping.date || !mapping.description || !mapping.amount) {
      setStatus('Please map at least Date, Description, and Amount.');
      return;
    }
    const imported = csvRows.map((row, index) => ({
      id: `actual-${Date.now()}-${index}`,
      date: formatBudgetDateText(row[mapping.date] || ''),
      description: row[mapping.description] || '',
      amount: parseMoney(row[mapping.amount] || '0'),
      account: mapping.account ? row[mapping.account] || '' : '',
      category: '',
      notes: ''
    })).filter((item) => item.date && item.description);
    void saveTransactions([...transactions, ...imported]);
    setCsvRows([]);
    setCsvHeaders([]);
  };

  const updateTransaction = (id: string, patch: Partial<ActualCostTransaction>) => {
    void saveTransactions(transactions.map((item) => item.id === id ? { ...item, ...patch } : item));
  };

  const addManualTransaction = () => {
    const transaction: ActualCostTransaction = {
      id: `manual-${Date.now()}`,
      date: formatAuDate(new Date()),
      description: 'Cash transaction',
      amount: 0,
      account: 'Cash',
      category: '',
      notes: 'Added manually'
    };
    void saveTransactions([transaction, ...transactions]);
    setSortKey('date');
    setSortDirection('desc');
  };

  const changeSort = (key: keyof ActualCostTransaction) => {
    if (sortKey === key) {
      setSortDirection((current) => current === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDirection(key === 'date' || key === 'amount' ? 'desc' : 'asc');
    }
  };

  const sortedTransactions = useMemo(() => [...transactions].sort((left, right) => compareActualCostTransactions(left, right, sortKey, sortDirection)), [transactions, sortDirection, sortKey]);

  return (
    <section className="page-stack">
      <div className="card hero-card budget-hero">
        <div><p className="eyebrow">Actual Costs</p><h2>Import and categorise transactions.</h2><p>Upload bank CSV exports or add cash transactions manually, then categorise them for dashboard comparison.</p><p className="help-text">{status}</p></div>
        <div className="budget-controls"><label>Upload CSV<input type="file" accept=".csv,text/csv" onChange={(event) => event.target.files?.[0] && void loadCsvFile(event.target.files[0])} /></label><button className="primary-button" type="button" onClick={addManualTransaction}>Add transaction</button></div>
      </div>
      {csvHeaders.length > 0 && <div className="card table-card"><div className="card-header"><div><p className="eyebrow">CSV import</p><h2>Map fields</h2></div><button className="primary-button" type="button" onClick={importMappedRows}>Import rows</button></div><div className="form-grid"><CsvMapSelect label="Date" headers={csvHeaders} value={mapping.date} onChange={(date) => setMapping((current) => ({ ...current, date }))} /><CsvMapSelect label="Description" headers={csvHeaders} value={mapping.description} onChange={(description) => setMapping((current) => ({ ...current, description }))} /><CsvMapSelect label="Amount" headers={csvHeaders} value={mapping.amount} onChange={(amount) => setMapping((current) => ({ ...current, amount }))} /><CsvMapSelect label="Account" headers={csvHeaders} value={mapping.account} onChange={(account) => setMapping((current) => ({ ...current, account }))} /></div><p className="help-text">Preview: {csvRows.slice(0, 3).map((row) => row[mapping.description] || Object.values(row)[0]).join(' · ')}</p></div>}
      <div className="card table-card">
        <div className="card-header"><div><p className="eyebrow">Actual costs</p><h2>Transactions</h2></div><button className="primary-button" type="button" onClick={addManualTransaction}>Add transaction</button></div>
        <div className="table-wrap budget-table-wrap actual-costs-table"><table><thead><tr><ActualCostSortableTh label="Date" column="date" sortKey={sortKey} sortDirection={sortDirection} onSort={changeSort} /><ActualCostSortableTh label="Description" column="description" sortKey={sortKey} sortDirection={sortDirection} onSort={changeSort} /><ActualCostSortableTh label="Amount" column="amount" sortKey={sortKey} sortDirection={sortDirection} onSort={changeSort} /><ActualCostSortableTh label="Account" column="account" sortKey={sortKey} sortDirection={sortDirection} onSort={changeSort} /><ActualCostSortableTh label="Category" column="category" sortKey={sortKey} sortDirection={sortDirection} onSort={changeSort} /><ActualCostSortableTh label="Notes" column="notes" sortKey={sortKey} sortDirection={sortDirection} onSort={changeSort} /><th>Actions</th></tr></thead><tbody>{sortedTransactions.map((item) => <tr key={item.id}><td><input value={item.date} onChange={(event) => updateTransaction(item.id, { date: event.target.value })} /></td><td><input value={item.description} onChange={(event) => updateTransaction(item.id, { description: event.target.value })} /></td><td><input type="number" value={item.amount} onChange={(event) => updateTransaction(item.id, { amount: Number(event.target.value || 0) })} /></td><td><input value={item.account || ''} onChange={(event) => updateTransaction(item.id, { account: event.target.value })} /></td><td><select value={item.category || ''} onChange={(event) => updateTransaction(item.id, { category: event.target.value })}><option value="">Select…</option>{categories.map((category) => <option key={category} value={category}>{category}</option>)}</select></td><td><input value={item.notes || ''} onChange={(event) => updateTransaction(item.id, { notes: event.target.value })} /></td><td><button className="secondary-button danger-button" type="button" onClick={() => void saveTransactions(transactions.filter((row) => row.id !== item.id))}>Delete</button></td></tr>)}</tbody></table></div>
      </div>
    </section>
  );
}

function CsvMapSelect({ label, headers, value, onChange }: { label: string; headers: string[]; value: string; onChange: (value: string) => void }) {
  return <label>{label}<select value={value} onChange={(event) => onChange(event.target.value)}><option value="">Do not import</option>{headers.map((header) => <option key={header} value={header}>{header}</option>)}</select></label>;
}

function ActualCostSortableTh({ label, column, sortKey, sortDirection, onSort }: { label: string; column: keyof ActualCostTransaction; sortKey: keyof ActualCostTransaction; sortDirection: SortDirection; onSort: (column: keyof ActualCostTransaction) => void }) {
  const active = sortKey === column;
  return <th><button className="sort-header-button" type="button" onClick={() => onSort(column)}>{label}{active ? (sortDirection === 'asc' ? ' ↑' : ' ↓') : ''}</button></th>;
}

function FamilyBudget() {
  const [projectionRangePreset, setProjectionRangePreset] = useState<ProjectionRangePreset>('remaining-year');
  const [customRangeFrom, setCustomRangeFrom] = useState(() => formatAuDate(new Date()));
  const [customRangeTo, setCustomRangeTo] = useState(() => formatAuDate(new Date(new Date().getFullYear(), 11, 31)));
  const [items, setItems] = useState<BudgetItem[]>(() => loadFamilyBudgetItems());
  const [itemsLoaded, setItemsLoaded] = useState(false);
  const [savingsAccounts, setSavingsAccounts] = useState<SavingsAccount[]>(() => loadSavingsAccounts());
  const [savingsLoaded, setSavingsLoaded] = useState(false);
  const [budgetSaveStatus, setBudgetSaveStatus] = useState('Loading budget database…');
  const [savingsSaveStatus, setSavingsSaveStatus] = useState('Loading savings accounts…');
  const [expenseCategories, setExpenseCategories] = useState<string[]>(() => loadExpenseCategories());
  const [editingBudgetItem, setEditingBudgetItem] = useState<BudgetItem | null>(null);
  const [modalKind, setModalKind] = useState<BudgetKind | null>(null);
  const [selectedBudgetItem, setSelectedBudgetItem] = useState<BudgetItem | null>(null);
  const [selectedProjectionWeek, setSelectedProjectionWeek] = useState<ReturnType<typeof buildBudgetProjectionForRange>[number] | null>(null);
  const [editingSavingsAccount, setEditingSavingsAccount] = useState<SavingsAccount | null>(null);
  const budgetLeftColumnRef = useRef<HTMLDivElement>(null);
  const [budgetLeftColumnHeight, setBudgetLeftColumnHeight] = useState<number | null>(null);
  const currentAccountBalance = savingsAccounts.reduce((sum, account) => sum + account.balance, 0);
  const projectionRange = useMemo(() => buildProjectionDateRange(projectionRangePreset, customRangeFrom, customRangeTo), [projectionRangePreset, customRangeFrom, customRangeTo]);
  const projectionRangeLabel = formatProjectionRangeLabel(projectionRange.from, projectionRange.to);
  const weeks = useMemo(() => buildBudgetProjectionForRange(items, projectionRange.from, projectionRange.to, currentAccountBalance), [items, projectionRange.from, projectionRange.to, currentAccountBalance]);
  const visibleItems = useMemo(() => items.filter((item) => occurrenceDatesBetween(item, projectionRange.from, projectionRange.to).length > 0), [items, projectionRange.from, projectionRange.to]);
  const expenses = visibleItems.filter((item) => item.kind === 'expense');
  const totalAnnualExpense = items.filter((item) => item.kind === 'expense').reduce((sum, item) => sum + annualizedBudgetAmount(item), 0);
  const scheduledTotals = useMemo(() => buildScheduleTotalsForRange(items, projectionRange.from, projectionRange.to), [items, projectionRange.from, projectionRange.to]);
  const carefulWeeks = weeks.filter((week) => week.net < 0 || week.balance < 0).slice(0, 8);
  const worstWeek = [...weeks].sort((a, b) => a.net - b.net)[0];
  const categorySummary = useMemo(() => buildProjectedCategorySummaryForRange(items.filter((item) => item.kind === 'expense'), projectionRange.from, projectionRange.to), [items, projectionRange.from, projectionRange.to]);
  const categoryPieSummary = useMemo(() => {
    const unallocated = Math.max(0, scheduledTotals.income - scheduledTotals.expenses);
    return unallocated > 0 ? [...categorySummary, { category: 'Unallocated', yearly: unallocated }] : categorySummary;
  }, [categorySummary, scheduledTotals.expenses, scheduledTotals.income]);

  useEffect(() => {
    let cancelled = false;
    const loadCategories = async () => {
      try {
        const response = await fetch('/api/family-budget/categories');
        if (!response.ok) throw new Error(`Category load failed with HTTP ${response.status}`);
        const result = await response.json();
        if (cancelled) return;
        const categories = Array.isArray(result.categories) && result.categories.length ? result.categories : loadExpenseCategories();
        setExpenseCategories(categories);
        localStorage.setItem(FAMILY_BUDGET_CATEGORIES_STORAGE_KEY, JSON.stringify(categories));
      } catch {
        if (!cancelled) setExpenseCategories(loadExpenseCategories());
      }
    };
    void loadCategories();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const loadItems = async () => {
      try {
        const response = await fetch('/api/family-budget/items');
        if (!response.ok) throw new Error(`Budget database load failed with HTTP ${response.status}`);
        const result = await response.json();
        if (cancelled) return;
        const databaseItems = Array.isArray(result.items) ? result.items.map(normalizeBudgetItem) : [];
        const nextItems = databaseItems.length ? databaseItems : loadFamilyBudgetItems();
        setItems(nextItems);
        setBudgetSaveStatus(databaseItems.length ? 'Budget items loaded from database.' : 'Budget database started with the current starter list.');
        setItemsLoaded(true);
        if (!databaseItems.length) void saveFamilyBudgetItems(nextItems, false);
      } catch (error) {
        if (cancelled) return;
        setBudgetSaveStatus(error instanceof Error ? `${error.message}; using browser backup for now.` : 'Budget database unavailable; using browser backup for now.');
        setItems(loadFamilyBudgetItems());
        setItemsLoaded(true);
      }
    };
    void loadItems();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const loadAccounts = async () => {
      try {
        const response = await fetch('/api/family-budget/savings-accounts');
        if (!response.ok) throw new Error(`Savings database load failed with HTTP ${response.status}`);
        const result = await response.json();
        if (cancelled) return;
        const databaseAccounts = Array.isArray(result.accounts) ? result.accounts : [];
        const nextAccounts = databaseAccounts.length ? databaseAccounts : loadSavingsAccounts();
        setSavingsAccounts(nextAccounts);
        setSavingsSaveStatus(databaseAccounts.length ? 'Savings accounts loaded from database.' : 'No savings accounts added yet.');
        setSavingsLoaded(true);
        if (!databaseAccounts.length && nextAccounts.length) void saveSavingsAccounts(nextAccounts, false);
      } catch (error) {
        if (cancelled) return;
        setSavingsSaveStatus(error instanceof Error ? `${error.message}; using browser backup for now.` : 'Savings database unavailable; using browser backup for now.');
        setSavingsAccounts(loadSavingsAccounts());
        setSavingsLoaded(true);
      }
    };
    void loadAccounts();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    localStorage.setItem(FAMILY_BUDGET_STORAGE_KEY, JSON.stringify(items));
    if (itemsLoaded) void saveFamilyBudgetItems(items, true);
  }, [items, itemsLoaded]);

  useEffect(() => {
    localStorage.setItem(SAVINGS_ACCOUNTS_STORAGE_KEY, JSON.stringify(savingsAccounts));
    if (savingsLoaded) void saveSavingsAccounts(savingsAccounts, true);
  }, [savingsAccounts, savingsLoaded]);

  useEffect(() => {
    const element = budgetLeftColumnRef.current;
    if (!element) return;
    const updateHeight = () => setBudgetLeftColumnHeight(Math.ceil(element.getBoundingClientRect().height));
    updateHeight();
    const observer = new ResizeObserver(updateHeight);
    observer.observe(element);
    window.addEventListener('resize', updateHeight);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', updateHeight);
    };
  }, [items, savingsAccounts]);

  const saveFamilyBudgetItems = async (nextItems: BudgetItem[], announce: boolean) => {
    if (announce) setBudgetSaveStatus('Saving budget items to database…');
    try {
      const response = await fetch('/api/family-budget/items', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: nextItems })
      });
      if (!response.ok) throw new Error(`Budget database save failed with HTTP ${response.status}`);
      const result = await response.json();
      setBudgetSaveStatus(result.message || 'Budget items saved to database.');
    } catch (error) {
      setBudgetSaveStatus(error instanceof Error ? `${error.message}; browser backup saved.` : 'Budget database save failed; browser backup saved.');
    }
  };

  const saveSavingsAccounts = async (nextAccounts: SavingsAccount[], announce: boolean) => {
    if (announce) setSavingsSaveStatus('Saving savings accounts to database…');
    try {
      const response = await fetch('/api/family-budget/savings-accounts', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accounts: nextAccounts })
      });
      if (!response.ok) throw new Error(`Savings database save failed with HTTP ${response.status}`);
      const result = await response.json();
      setSavingsSaveStatus(result.message || 'Savings accounts saved to database.');
    } catch (error) {
      setSavingsSaveStatus(error instanceof Error ? `${error.message}; browser backup saved.` : 'Savings database save failed; browser backup saved.');
    }
  };

  const openAddBudgetItem = (kind: BudgetKind) => {
    setModalKind(kind);
    setEditingBudgetItem({ id: `budget-${Date.now()}`, kind, name: '', supplier: '', amount: 0, cycle: 'weekly', schedule: 'recurring', intervalCount: 1, intervalUnit: 'week', anchorDate: formatAuDate(new Date()) });
  };

  const openEditBudgetItem = (item: BudgetItem) => {
    setModalKind(item.kind);
    setEditingBudgetItem({ ...item, months: item.months ? [...item.months] : undefined, dueDates: item.dueDates ? [...item.dueDates] : undefined });
  };

  const saveBudgetItem = (item: BudgetItem) => {
    setItems((current) => current.some((existing) => existing.id === item.id) ? current.map((existing) => existing.id === item.id ? item : existing) : [...current, item]);
    setEditingBudgetItem(null);
    setModalKind(null);
  };

  const deleteBudgetItem = (id: string) => {
    setItems((current) => current.filter((item) => item.id !== id));
  };

  const saveSavingsAccount = (account: SavingsAccount) => {
    setSavingsAccounts((current) => current.some((existing) => existing.id === account.id) ? current.map((existing) => existing.id === account.id ? account : existing) : [...current, account]);
    setEditingSavingsAccount(null);
  };

  const deleteSavingsAccount = (id: string) => {
    setSavingsAccounts((current) => current.filter((account) => account.id !== id));
  };

  return (
    <section className="page-stack">
      <div className="card hero-card budget-hero projection-range-hero">
        <div>
          <p className="eyebrow">Projection range</p>
          <h2>{projectionRangeLabel}</h2>
          <p>Switch the projection, schedule lists, totals, and category graph to a specific date range.</p>
        </div>
        <div className="projection-range-controls">
          <div className="button-row">
            <button className={projectionRangePreset === 'entire-year' ? 'primary-button' : 'secondary-button'} type="button" onClick={() => setProjectionRangePreset('entire-year')}>Entire Year</button>
            <button className={projectionRangePreset === 'remaining-year' ? 'primary-button' : 'secondary-button'} type="button" onClick={() => setProjectionRangePreset('remaining-year')}>Remaining Year</button>
            <button className={projectionRangePreset === 'current-month' ? 'primary-button' : 'secondary-button'} type="button" onClick={() => setProjectionRangePreset('current-month')}>Current Month</button>
            <button className={projectionRangePreset === 'current-fortnight' ? 'primary-button' : 'secondary-button'} type="button" onClick={() => setProjectionRangePreset('current-fortnight')}>Current Fortnight</button>
            <button className={projectionRangePreset === 'current-week' ? 'primary-button' : 'secondary-button'} type="button" onClick={() => setProjectionRangePreset('current-week')}>Current Week</button>
            <button className={projectionRangePreset === 'custom' ? 'primary-button' : 'secondary-button'} type="button" onClick={() => setProjectionRangePreset('custom')}>Custom Date Range</button>
          </div>
          {projectionRangePreset === 'custom' && <div className="budget-controls compact-date-controls"><label>From<input type="date" value={toDateInputValue(customRangeFrom)} onChange={(event) => setCustomRangeFrom(formatBudgetDateText(event.target.value))} /></label><label>To<input type="date" value={toDateInputValue(customRangeTo)} onChange={(event) => setCustomRangeTo(formatBudgetDateText(event.target.value))} /></label></div>}
        </div>
      </div>

      <div className="content-grid compact">
        <MetricCard title="Budget week" value="Tue–Mon" detail={`Starting balance ${formatMoney(currentAccountBalance)} from account balances`} icon={<WalletCards />} />
        <MetricCard title="Range income" value={formatMoney(scheduledTotals.income)} detail={`Calculated for ${projectionRangeLabel}`} icon={<Landmark />} />
        <MetricCard title="Range expenses" value={formatMoney(scheduledTotals.expenses)} detail={`Calculated for ${projectionRangeLabel}`} icon={<ReceiptText />} />
      </div>

      <div className="card hero-card budget-hero budget-insights-hero projections-insights-only">
        <div className="category-insights-panel">
          <div className="card-header compact-header"><div><p className="eyebrow">Expense mix</p><h2>Top categories + Other</h2></div><strong>{formatMoney(scheduledTotals.expenses)} / range</strong></div>
          <div className="category-charts-grid">
            <div className="category-chart-container">
              <p className="eyebrow">Spend by category</p>
              <div className="category-chart-wrap">
                <ResponsiveContainer width="100%" height={230}>
                  <BarChart data={categorySummary} layout="vertical" margin={{ left: 8, right: 18, top: 8, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                    <XAxis type="number" tickFormatter={(value) => formatMoney(Number(value))} />
                    <YAxis type="category" dataKey="category" width={94} />
                    <Tooltip formatter={(value) => formatMoney(Number(value))} />
                    <Bar dataKey="yearly" fill="var(--accent)" radius={[0, 8, 8, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div className="category-chart-container">
              <p className="eyebrow">Category share</p>
              <div className="category-chart-wrap">
                <ResponsiveContainer width="100%" height={230}>
                  <PieChart>
                    <Tooltip formatter={(value) => formatMoney(Number(value))} />
                    <Pie data={categoryPieSummary} dataKey="yearly" nameKey="category" cx="50%" cy="50%" innerRadius={46} outerRadius={82} label={(entry) => `${entry.category} ${((entry.percent || 0) * 100).toFixed(0)}%`}>
                      {categoryPieSummary.map((item, index) => <Cell key={item.category} fill={item.category === 'Unallocated' ? '#94a3b8' : categoryChartColors[index % categoryChartColors.length]} />)}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
          <div className="category-chip-row">{categoryPieSummary.map((item, index) => <span key={item.category}><i style={{ background: item.category === 'Unallocated' ? '#94a3b8' : categoryChartColors[index % categoryChartColors.length] }} />{item.category}: {formatMoney(item.yearly)}</span>)}</div>
        </div>
      </div>

      <div className="budget-schedules-grid">
        <div className="budget-left-column" ref={budgetLeftColumnRef}>
          <BudgetScheduleCard title="Income schedule" items={visibleItems.filter((item) => item.kind === 'income')} categories={expenseCategories} onAdd={() => openAddBudgetItem('income')} onEdit={openEditBudgetItem} onDelete={deleteBudgetItem} onView={setSelectedBudgetItem} />
          <SavingsAccountsCard accounts={savingsAccounts} status={savingsSaveStatus} onAdd={() => setEditingSavingsAccount({ id: `savings-${Date.now()}`, name: '', balance: 0, note: '' })} onEdit={(account) => setEditingSavingsAccount({ ...account })} onDelete={deleteSavingsAccount} />
        </div>
        <BudgetScheduleCard title="Expense schedule" items={visibleItems.filter((item) => item.kind === 'expense')} categories={expenseCategories} onAdd={() => openAddBudgetItem('expense')} onEdit={openEditBudgetItem} onDelete={deleteBudgetItem} onView={setSelectedBudgetItem} matchedHeight={budgetLeftColumnHeight} wide />
      </div>

      <div className="content-grid">
        <div className="card span-2 table-card">
          <div className="card-header"><div><p className="eyebrow">Projection</p><h2>Tuesday–Monday budget weeks</h2></div></div>
          <div className="table-wrap budget-table-wrap">
            <table>
              <thead><tr><th>Week</th><th>Income</th><th>Expenses</th><th>Net</th><th>Projected balance</th><th>Watch items</th></tr></thead>
              <tbody>{weeks.map((week) => <tr key={week.start.toISOString()} className={`${week.net < 0 || week.balance < 0 ? 'risk-row' : ''} clickable-row`} onClick={() => setSelectedProjectionWeek(week)}><td>{formatWeekRange(week.start, week.end)}</td><td>{formatMoney(week.income)}</td><td>{formatMoney(week.expenses)}</td><td>{formatMoney(week.net)}</td><td>{formatMoney(week.balance)}</td><td>{week.items.slice(0, 3).map((item) => item.name).join(', ') || '—'}</td></tr>)}</tbody>
            </table>
          </div>
          <p className="help-text">Showing weeks inside {projectionRangeLabel}; the metrics, risk detection, schedule lists, and graph use the same range.</p>
        </div>

        <div className="card">
          <div className="card-header"><div><p className="eyebrow">Careful weeks</p><h2>Risk flags</h2></div></div>
          <div className="risk-list">
            {carefulWeeks.map((week) => <div className="risk-card" key={week.start.toISOString()}><strong>{formatWeekRange(week.start, week.end)}</strong><span>Net {formatMoney(week.net)} · Balance {formatMoney(week.balance)}</span></div>)}
            {!carefulWeeks.length && <p className="help-text">No negative weeks in the selected projection.</p>}
          </div>
          {worstWeek && <p className="help-text">Worst projected week: {formatWeekRange(worstWeek.start, worstWeek.end)} at {formatMoney(worstWeek.net)} net.</p>}
        </div>
      </div>

      {selectedProjectionWeek && <ProjectionWeekModal week={selectedProjectionWeek} onClose={() => setSelectedProjectionWeek(null)} />}
      {selectedBudgetItem && <BudgetItemDetailModal item={selectedBudgetItem} totalAnnualExpense={totalAnnualExpense} onClose={() => setSelectedBudgetItem(null)} />}
      {editingBudgetItem && modalKind && <BudgetItemModal kind={modalKind} item={editingBudgetItem} categories={expenseCategories} onSave={saveBudgetItem} onClose={() => { setEditingBudgetItem(null); setModalKind(null); }} />}
      {editingSavingsAccount && <SavingsAccountModal account={editingSavingsAccount} onSave={saveSavingsAccount} onClose={() => setEditingSavingsAccount(null)} />}
    </section>
  );
}

function normalizeBudgetItem(item: BudgetItem): BudgetItem {
  const cycle = (item.cycle as string) === 'yearly' ? 'annually' : item.cycle;
  return {
    ...item,
    cycle,
    schedule: normalizeBudgetSchedule(item.schedule, cycle),
    intervalCount: item.intervalCount || defaultIntervalFromCycle(cycle).count,
    intervalUnit: item.intervalUnit || defaultIntervalFromCycle(cycle).unit,
    daysOfMonth: item.daysOfMonth || (item.dayOfMonth ? [item.dayOfMonth] : [])
  };
}

function defaultIntervalFromCycle(cycle: BudgetCycle): { count: number; unit: BudgetIntervalUnit } {
  if (cycle === 'fortnightly') return { count: 2, unit: 'week' };
  if (cycle === 'monthly') return { count: 1, unit: 'month' };
  if (cycle === 'quarterly') return { count: 3, unit: 'month' };
  if (cycle === 'bi-annually') return { count: 6, unit: 'month' };
  if (cycle === 'annually') return { count: 1, unit: 'year' };
  return { count: 1, unit: 'week' };
}

function normalizeBudgetSchedule(schedule: BudgetItem['schedule'], cycle: BudgetCycle): BudgetSchedule {
  if ((schedule as string) === 'reoccurring') return 'recurring';
  if (schedule) return schedule;
  if (cycle === 'once-off') return 'once-off';
  if (cycle === 'random') return 'random';
  return 'recurring';
}

function loadFamilyBudgetItems(): BudgetItem[] {
  try {
    const stored = localStorage.getItem(FAMILY_BUDGET_STORAGE_KEY);
    if (!stored) return familyBudgetItems;
    const parsed = JSON.parse(stored);
    if (!Array.isArray(parsed)) return familyBudgetItems;
    const validItems = parsed.filter((item) => item && (item.kind === 'income' || item.kind === 'expense') && typeof item.name === 'string' && typeof item.amount === 'number');
    return validItems.map(normalizeBudgetItem);
  } catch {
    return familyBudgetItems;
  }
}

function loadSavingsAccounts(): SavingsAccount[] {
  try {
    const stored = localStorage.getItem(SAVINGS_ACCOUNTS_STORAGE_KEY);
    if (!stored) return [];
    const parsed = JSON.parse(stored);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((account) => account && typeof account.name === 'string' && typeof account.balance === 'number');
  } catch {
    return [];
  }
}

function loadExpenseCategories(): string[] {
  try {
    const stored = localStorage.getItem(FAMILY_BUDGET_CATEGORIES_STORAGE_KEY);
    if (!stored) return defaultExpenseCategories;
    const parsed = JSON.parse(stored);
    if (!Array.isArray(parsed)) return defaultExpenseCategories;
    const categories = parsed.map((item) => String(item).trim()).filter(Boolean);
    return categories.length ? categories : defaultExpenseCategories;
  } catch {
    return defaultExpenseCategories;
  }
}

function BudgetScheduleCard({ title, items, wide, categories, onAdd, onEdit, onDelete, onView, matchedHeight }: { title: string; items: BudgetItem[]; wide?: boolean; categories: string[]; onAdd: () => void; onEdit: (item: BudgetItem) => void; onDelete: (id: string) => void; onView: (item: BudgetItem) => void; matchedHeight?: number | null }) {
  const isIncome = !wide;
  const [expenseColumnWidths, setExpenseColumnWidths] = useState([220, 130, 120, 95, 105, 220, 145]);
  const [expenseSortKey, setExpenseSortKey] = useState<'name' | 'supplier' | 'category' | 'amount' | 'schedule' | 'rule'>('name');
  const [expenseSortDirection, setExpenseSortDirection] = useState<SortDirection>('asc');
  const startColumnResize = (event: React.PointerEvent<HTMLSpanElement>, index: number) => {
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const startWidth = expenseColumnWidths[index];
    const onPointerMove = (moveEvent: PointerEvent) => {
      const next = Math.max(70, startWidth + moveEvent.clientX - startX);
      setExpenseColumnWidths((current) => current.map((width, widthIndex) => widthIndex === index ? next : width));
    };
    const onPointerUp = () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  };
  const expenseHeadings: Array<{ label: string; key: 'name' | 'supplier' | 'category' | 'amount' | 'schedule' | 'rule' | 'actions' }> = [
    { label: 'Name', key: 'name' },
    { label: 'Supplier', key: 'supplier' },
    { label: 'Category', key: 'category' },
    { label: 'Amount', key: 'amount' },
    { label: 'Schedule', key: 'schedule' },
    { label: 'Rule', key: 'rule' },
    { label: 'Actions', key: 'actions' }
  ];
  const changeExpenseSort = (key: 'name' | 'supplier' | 'category' | 'amount' | 'schedule' | 'rule') => {
    if (expenseSortKey === key) setExpenseSortDirection((current) => current === 'asc' ? 'desc' : 'asc');
    else {
      setExpenseSortKey(key);
      setExpenseSortDirection(key === 'amount' ? 'desc' : 'asc');
    }
  };
  const sortedExpenseItems = useMemo(() => isIncome ? items : [...items].sort((left, right) => compareBudgetItems(left, right, expenseSortKey, expenseSortDirection)), [expenseSortDirection, expenseSortKey, isIncome, items]);

  return (
    <div className={wide ? 'card table-card expense-schedule-card' : 'card table-card'} style={wide && matchedHeight ? { height: matchedHeight } : undefined}>
      <div className="card-header">
        <div><p className="eyebrow">Known items</p><h2>{title}</h2></div>
        <button className="primary-button" type="button" onClick={onAdd}>Add item</button>
      </div>
      {isIncome ? (
        <div className="budget-card-list income-card-list">
          {items.map((item) => (
            <div className="budget-item-card clickable-row" key={item.id} onClick={() => onView(item)}>
              <div className="budget-item-line primary-line">
                <strong>{item.name}</strong>
                <span>{item.supplier || 'No source set'}</span>
              </div>
              <div className="budget-item-line">
                <span>{formatMoney(item.amount)}</span>
                <span>{item.schedule || item.cycle}</span>
              </div>
              <div className="budget-item-line">
                <span>{budgetRuleLabel(item)}</span>
                <div className="table-actions"><button className="secondary-button" type="button" onClick={(event) => { event.stopPropagation(); onEdit(item); }}>Edit</button><button className="secondary-button danger-button" type="button" onClick={(event) => { event.stopPropagation(); onDelete(item.id); }}>Delete</button></div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="table-wrap budget-table-wrap expense-table-wrap">
          <table className="expense-table">
            <colgroup>{expenseColumnWidths.map((width, index) => <col key={index} style={{ width }} />)}</colgroup>
            <thead><tr>{expenseHeadings.map((heading, index) => <th key={heading.key}>{heading.key === 'actions' ? heading.label : <button className="sort-header-button" type="button" onClick={() => changeExpenseSort(heading.key)}>{heading.label}{expenseSortKey === heading.key ? (expenseSortDirection === 'asc' ? ' ↑' : ' ↓') : ''}</button>}<span className="column-resize-handle" onPointerDown={(event) => startColumnResize(event, index)} /></th>)}</tr></thead>
            <tbody>{sortedExpenseItems.map((item) => <tr key={item.id} className="clickable-row" onClick={() => onView(item)}><td title={item.name}>{item.name}</td><td title={item.supplier || ''}>{item.supplier || '—'}</td><td title={item.category || ''}>{item.category || '—'}</td><td>{formatMoney(item.amount)}</td><td>{item.schedule || item.cycle}</td><td title={budgetRuleLabel(item)}>{budgetRuleLabel(item)}</td><td><div className="table-actions"><button className="secondary-button" type="button" onClick={(event) => { event.stopPropagation(); onEdit(item); }}>Edit</button><button className="secondary-button danger-button" type="button" onClick={(event) => { event.stopPropagation(); onDelete(item.id); }}>Delete</button></div></td></tr>)}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function SavingsAccountsCard({ accounts, status, onAdd, onEdit, onDelete }: { accounts: SavingsAccount[]; status: string; onAdd: () => void; onEdit: (account: SavingsAccount) => void; onDelete: (id: string) => void }) {
  const total = accounts.reduce((sum, account) => sum + account.balance, 0);
  return (
    <div className="card table-card savings-card">
      <div className="card-header">
        <div><p className="eyebrow">Savings</p><h2>Account balances</h2></div>
        <button className="primary-button" type="button" onClick={onAdd}>Add account</button>
      </div>
      <p className="help-text">{status}</p>
      <div className="savings-total"><span>Total savings</span><strong>{formatMoney(total)}</strong></div>
      <div className="budget-card-list savings-account-list">
        {accounts.map((account) => (
          <div className="savings-account-card" key={account.id}>
            <div><strong>{account.name}</strong>{account.note && <span>{account.note}</span>}</div>
            <strong>{formatMoney(account.balance)}</strong>
            <div className="table-actions"><button className="secondary-button" type="button" onClick={() => onEdit(account)}>Edit</button><button className="secondary-button danger-button" type="button" onClick={() => onDelete(account.id)}>Delete</button></div>
          </div>
        ))}
        {!accounts.length && <p className="help-text">Add each savings account here so balances are tracked separately.</p>}
      </div>
    </div>
  );
}

function BudgetItemDetailModal({ item, totalAnnualExpense, onClose }: { item: BudgetItem; totalAnnualExpense: number; onClose: () => void }) {
  const yearly = annualizedBudgetAmount(item);
  const monthly = yearly / 12;
  const weekly = yearly / 52.1775;
  const daily = yearly / 365.25;
  const percentage = item.kind === 'expense' && totalAnnualExpense > 0 ? (yearly / totalAnnualExpense) * 100 : 0;

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal-card budget-modal item-detail-modal">
        <div className="card-header">
          <div><p className="eyebrow">{item.kind === 'income' ? 'Income item' : 'Expense item'}</p><h2>{item.name}</h2></div>
          <button className="secondary-button" type="button" onClick={onClose}>Close</button>
        </div>
        <div className="detail-summary-grid">
          <MetricCard title="Daily" value={formatMoney(daily)} detail="Annualised average" icon={<WalletCards />} />
          <MetricCard title="Weekly" value={formatMoney(weekly)} detail="Annualised average" icon={<WalletCards />} />
          <MetricCard title="Monthly" value={formatMoney(monthly)} detail="Annualised average" icon={<WalletCards />} />
          <MetricCard title="Yearly" value={formatMoney(yearly)} detail={item.kind === 'expense' ? `${percentage.toFixed(1)}% of yearly expenses` : 'Annualised total'} icon={<WalletCards />} />
        </div>
        <div className="item-detail-list">
          <div><span>Supplier / source</span><strong>{item.supplier || '—'}</strong></div>
          <div><span>Category</span><strong>{item.category || '—'}</strong></div>
          <div><span>Amount per occurrence</span><strong>{formatMoney(item.amount)}</strong></div>
          <div><span>Schedule</span><strong>{item.schedule || item.cycle}</strong></div>
          <div><span>Rule</span><strong>{budgetRuleLabel(item)}</strong></div>
          <div><span>Occurrences/year</span><strong>{formatNumber(annualOccurrenceCount(item))}</strong></div>
        </div>
      </div>
    </div>
  );
}

function ProjectionWeekModal({ week, onClose }: { week: ReturnType<typeof buildBudgetProjectionForRange>[number]; onClose: () => void }) {
  const expenseRows = week.items
    .filter((item) => item.kind === 'expense')
    .map((item) => {
      const count = occurrenceCountInWeek(item, week.start, week.end);
      return { item, count, total: item.amount * count };
    })
    .filter((row) => row.count > 0)
    .sort((a, b) => b.total - a.total);
  const expenseTotal = expenseRows.reduce((sum, row) => sum + row.total, 0);

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal-card budget-modal projection-week-modal">
        <div className="card-header">
          <div><p className="eyebrow">Projection week</p><h2>{formatWeekRange(week.start, week.end)}</h2></div>
          <button className="secondary-button" type="button" onClick={onClose}>Close</button>
        </div>
        <div className="detail-summary-grid">
          <MetricCard title="Week income" value={formatMoney(week.income)} detail="Scheduled into this week" icon={<Landmark />} />
          <MetricCard title="Week expenses" value={formatMoney(week.expenses)} detail={`${expenseRows.length} expense item${expenseRows.length === 1 ? '' : 's'}`} icon={<ReceiptText />} />
          <MetricCard title="Week net" value={formatMoney(week.net)} detail="Income less expenses" icon={<WalletCards />} />
          <MetricCard title="Projected balance" value={formatMoney(week.balance)} detail="After this week" icon={<WalletCards />} />
        </div>
        <div className="table-wrap budget-table-wrap projection-week-table">
          <table>
            <thead><tr><th>Expense item</th><th>Category</th><th>Schedule</th><th>Rule</th><th>Occurrences</th><th>Amount</th><th>Week total</th></tr></thead>
            <tbody>
              {expenseRows.map(({ item, count, total }) => (
                <tr key={item.id}>
                  <td>{item.name}</td>
                  <td>{item.category || '—'}</td>
                  <td>{item.schedule || item.cycle}</td>
                  <td>{budgetRuleLabel(item)}</td>
                  <td>{formatNumber(count)}</td>
                  <td>{formatMoney(item.amount)}</td>
                  <td>{formatMoney(total)}</td>
                </tr>
              ))}
              {!expenseRows.length && <tr><td colSpan={7}>No expense items are scheduled in this week.</td></tr>}
            </tbody>
            <tfoot><tr><td colSpan={6}>Expense total</td><td>{formatMoney(expenseTotal)}</td></tr></tfoot>
          </table>
        </div>
        <p className="help-text">This popup shows the Expense Schedule items whose rules place them inside this Tuesday–Monday week, so you can check the maths line by line.</p>
      </div>
    </div>
  );
}

function BudgetItemModal({ kind, item, categories, onSave, onClose }: { kind: BudgetKind; item: BudgetItem; categories: string[]; onSave: (item: BudgetItem) => void; onClose: () => void }) {
  const [draft, setDraft] = useState<BudgetItem>(item);
  const [daysOfMonthText, setDaysOfMonthText] = useState((item.daysOfMonth || (item.dayOfMonth ? [item.dayOfMonth] : [])).join(', '));
  const [monthsText, setMonthsText] = useState((item.months || []).join(', '));
  const [dueDatesText, setDueDatesText] = useState((item.dueDates || []).map(formatBudgetDateText).join(', '));
  const updateDraft = (patch: Partial<BudgetItem>) => setDraft((current) => ({ ...current, ...patch }));
  const parseList = (value: string) => value.split(',').map((item) => item.trim()).filter(Boolean);
  const saveDraft = () => {
    if (!draft.name.trim()) return;
    onSave({
      ...draft,
      kind,
      name: draft.name.trim(),
      cycle: cycleFromSchedule(draft),
      daysOfMonth: parseList(daysOfMonthText).map(Number).filter(Boolean),
      dayOfMonth: parseList(daysOfMonthText).map(Number).filter(Boolean)[0],
      months: parseList(monthsText).map(Number).filter(Boolean),
      dueDates: parseList(dueDatesText),
      endDate: draft.endDate ? formatBudgetDateText(draft.endDate) : ''
    });
  };

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal-card budget-modal">
        <div className="card-header">
          <div><p className="eyebrow">{kind === 'income' ? 'Income' : 'Expense'}</p><h2>{item.name ? 'Edit item' : 'Add item'}</h2></div>
          <button className="secondary-button" type="button" onClick={onClose}>Close</button>
        </div>
        <div className="form-grid">
          <label>Name<input value={draft.name} onChange={(event) => updateDraft({ name: event.target.value })} /></label>
          <label>Supplier / source<input value={draft.supplier || ''} onChange={(event) => updateDraft({ supplier: event.target.value })} /></label>
          <label>Amount<input type="number" value={draft.amount} onChange={(event) => updateDraft({ amount: Number(event.target.value || 0) })} /></label>
          {kind === 'expense' && <label>Category<select value={draft.category || ''} onChange={(event) => updateDraft({ category: event.target.value })}><option value="">Select category</option>{categories.map((category) => <option key={category} value={category}>{category}</option>)}</select></label>}
          <label>Schedule<select value={draft.schedule || 'recurring'} onChange={(event) => updateDraft({ schedule: event.target.value as BudgetSchedule })}><option value="recurring">Recurring</option><option value="once-off">Once off</option><option value="random">Random</option></select></label>
          {(draft.schedule || 'recurring') === 'recurring' && <div className="schedule-inline-row"><label>Count<input type="number" min="1" value={draft.intervalCount || 1} onChange={(event) => updateDraft({ intervalCount: Number(event.target.value || 1) })} /></label><label>Every<select value={draft.intervalUnit || 'week'} onChange={(event) => updateDraft({ intervalUnit: event.target.value as BudgetIntervalUnit })}><option value="day">Day</option><option value="week">Week</option><option value="month">Month</option><option value="year">Year</option></select></label><label>Starting on<input type="date" value={toDateInputValue(draft.anchorDate || '')} onChange={(event) => updateDraft({ anchorDate: formatBudgetDateText(event.target.value) })} /></label></div>}
          {(draft.schedule || 'recurring') === 'random' && <label>Start date<input type="date" value={toDateInputValue(draft.anchorDate || '')} onChange={(event) => updateDraft({ anchorDate: formatBudgetDateText(event.target.value) })} /></label>}
          {(draft.schedule || 'recurring') === 'random' && <label>Day of the month<input value={daysOfMonthText} onChange={(event) => setDaysOfMonthText(event.target.value)} placeholder="1, 15, 28" /></label>}
          {(draft.schedule || 'recurring') === 'random' && <label>Months<input value={monthsText} onChange={(event) => setMonthsText(event.target.value)} placeholder="2, 5, 8, 11" /></label>}
          <label>Due dates<input value={dueDatesText} onChange={(event) => setDueDatesText(event.target.value)} placeholder="12/02/2026, 12/08/2026" /></label>
          <label>End date<input type="date" value={toDateInputValue(draft.endDate || '')} onChange={(event) => updateDraft({ endDate: formatBudgetDateText(event.target.value) })} /></label>
          <label>Rule note<input value={draft.note || ''} onChange={(event) => updateDraft({ note: event.target.value })} placeholder="Fortnight Thursday, 15th of month, etc" /></label>
        </div>
        <div className="button-row">
          <button className="primary-button" type="button" onClick={saveDraft}>Save {kind}</button>
          <button className="secondary-button" type="button" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

function SavingsAccountModal({ account, onSave, onClose }: { account: SavingsAccount; onSave: (account: SavingsAccount) => void; onClose: () => void }) {
  const [draft, setDraft] = useState<SavingsAccount>(account);
  const updateDraft = (patch: Partial<SavingsAccount>) => setDraft((current) => ({ ...current, ...patch }));
  const saveDraft = () => {
    if (!draft.name.trim()) return;
    onSave({ ...draft, name: draft.name.trim(), note: draft.note || '' });
  };

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal-card budget-modal">
        <div className="card-header">
          <div><p className="eyebrow">Savings</p><h2>{account.name ? 'Edit account' : 'Add account'}</h2></div>
          <button className="secondary-button" type="button" onClick={onClose}>Close</button>
        </div>
        <div className="form-grid">
          <label>Account name<input value={draft.name} onChange={(event) => updateDraft({ name: event.target.value })} placeholder="Emergency fund" /></label>
          <label>Balance<input type="number" value={draft.balance} onChange={(event) => updateDraft({ balance: Number(event.target.value || 0) })} /></label>
          <label>Note<input value={draft.note || ''} onChange={(event) => updateDraft({ note: event.target.value })} placeholder="Bank, goal, offset, etc" /></label>
        </div>
        <div className="button-row">
          <button className="primary-button" type="button" onClick={saveDraft}>Save account</button>
          <button className="secondary-button" type="button" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

function cycleFromSchedule(item: BudgetItem): BudgetCycle {
  if (item.schedule === 'once-off') return 'once-off';
  if (item.schedule === 'random') return 'random';
  const count = item.intervalCount || 1;
  const unit = item.intervalUnit || 'week';
  if (unit === 'week' && count === 1) return 'weekly';
  if (unit === 'week' && count === 2) return 'fortnightly';
  if (unit === 'month' && count === 1) return 'monthly';
  if (unit === 'month' && count === 3) return 'quarterly';
  if (unit === 'month' && count === 6) return 'bi-annually';
  if (unit === 'year' && count === 1) return 'annually';
  return 'weekly';
}


function TaxReceipts() {
  const [files, setFiles] = useState<SharePointInputFile[]>([]);
  const [inputFolder, setInputFolder] = useState('Inbox');
  const [libraryName, setLibraryName] = useState('SharePoint library');
  const [listStatus, setListStatus] = useState('Loading SharePoint input folder…');
  const [isLoading, setIsLoading] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>('last_modified');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<SharePointFileDetail | null>(null);
  const [fieldDraft, setFieldDraft] = useState<Record<string, unknown>>({});
  const [fieldOriginal, setFieldOriginal] = useState<Record<string, unknown>>({});
  const [markedUpPdf, setMarkedUpPdf] = useState<File | null>(null);
  const [draft, setDraft] = useState<ReceiptDraft | null>(null);
  const [isExtracting, setIsExtracting] = useState(false);
  const [detailStatus, setDetailStatus] = useState<string | null>(null);
  const [actionStatus, setActionStatus] = useState<string | null>(null);
  const autoPreparingIds = useRef<Set<string>>(new Set());

  const autoPrepareReceipts = async (inboxFiles: SharePointInputFile[]) => {
    const pdfFiles = inboxFiles.filter((file) => file.item_type === 'file' && file.name.toLowerCase().endsWith('.pdf'));
    if (!pdfFiles.length) return;
    let prepared = 0;
    for (const file of pdfFiles) {
      if (autoPreparingIds.current.has(file.id)) continue;
      autoPreparingIds.current.add(file.id);
      setListStatus(`Preparing OCR + AI suggestions ${prepared + 1}/${pdfFiles.length}: ${file.name}`);
      try {
        await fetch(`/api/tax-receipts/${encodeURIComponent(file.id)}/prepare`, { method: 'POST' });
      } catch {
        // Keep processing the rest of the queue; individual failures remain in the local draft status.
      } finally {
        prepared += 1;
      }
    }
    setListStatus(`SharePoint input folder loaded. OCR + AI preparation checked ${prepared} receipt${prepared === 1 ? '' : 's'}.`);
  };

  const loadInputFiles = async () => {
    setIsLoading(true);
    setListStatus('Loading SharePoint input folder…');
    try {
      const response = await fetch('/api/sharepoint/input-files');
      if (!response.ok) throw new Error(`SharePoint list failed with HTTP ${response.status}`);
      const result = await response.json();
      const nextFiles = Array.isArray(result.files) ? result.files : [];
      setFiles(nextFiles);
      setInputFolder(result.target?.input_folder || 'Inbox');
      setLibraryName(result.target?.library_name || 'SharePoint library');
      setListStatus(result.message || 'SharePoint input folder loaded.');
      void autoPrepareReceipts(nextFiles);
    } catch (error) {
      setFiles([]);
      setListStatus(error instanceof Error ? error.message : 'Could not load SharePoint input folder.');
    } finally {
      setIsLoading(false);
    }
  };

  const sortedFiles = useMemo(() => {
    const direction = sortDirection === 'asc' ? 1 : -1;
    return [...files].sort((left, right) => {
      const leftValue = left[sortKey];
      const rightValue = right[sortKey];
      if (sortKey === 'size') return ((leftValue as number) - (rightValue as number)) * direction;
      if (sortKey === 'last_modified') return (new Date(left.last_modified).getTime() - new Date(right.last_modified).getTime()) * direction;
      return String(leftValue || '').localeCompare(String(rightValue || '')) * direction;
    });
  }, [files, sortDirection, sortKey]);

  const changeSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDirection((current) => (current === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDirection(key === 'last_modified' || key === 'size' ? 'desc' : 'asc');
    }
  };

  const selectedIndex = selectedId ? sortedFiles.findIndex((file) => file.id === selectedId) : -1;
  const previousFile = selectedIndex > 0 ? sortedFiles[selectedIndex - 1] : null;
  const nextFile = selectedIndex >= 0 && selectedIndex < sortedFiles.length - 1 ? sortedFiles[selectedIndex + 1] : null;

  const openFile = async (file: SharePointInputFile) => {
    setSelectedId(file.id);
    setDetail(null);
    setFieldDraft({});
    setFieldOriginal({});
    setMarkedUpPdf(null);
    setDraft(null);
    setActionStatus(null);
    setDetailStatus(`Loading ${file.name}…`);
    try {
      const response = await fetch(`/api/sharepoint/input-files/${encodeURIComponent(file.id)}`);
      if (!response.ok) throw new Error(`File details failed with HTTP ${response.status}`);
      const result: SharePointFileDetail = await response.json();
      const draftValues = Object.fromEntries((result.fields || []).map((field) => [field.name, initialFieldDraftValue(field)]));
      setDetail(result);
      setFieldDraft(draftValues);
      setFieldOriginal(draftValues);
      setDetailStatus(result.message);
      const loadedDraft = await loadDraft(file.id);
      if (loadedDraft?.suggestions && Object.keys(loadedDraft.suggestions).length) {
        setFieldDraft((current) => ({ ...current, ...loadedDraft.suggestions }));
      }
      if (!loadedDraft?.ocr_text && loadedDraft?.status !== 'processing') {
        void runOcrForItem(file.id, false);
      }
    } catch (error) {
      setDetailStatus(error instanceof Error ? error.message : 'Could not load file details.');
    }
  };

  const loadDraft = async (itemId: string): Promise<ReceiptDraft | null> => {
    try {
      const response = await fetch(`/api/tax-receipts/${encodeURIComponent(itemId)}/draft`);
      if (!response.ok) return null;
      const result = await response.json();
      const nextDraft = result.draft || null;
      setDraft(nextDraft);
      return nextDraft;
    } catch {
      // Drafts are a helper only; don't block file review if unavailable.
      return null;
    }
  };

  const runOcrForItem = async (itemId: string, announce = true) => {
    setIsExtracting(true);
    if (announce) setActionStatus('Running local OCR/text extraction…');
    try {
      const response = await fetch(`/api/tax-receipts/${encodeURIComponent(itemId)}/ocr`, { method: 'POST' });
      if (!response.ok) throw new Error(`OCR failed with HTTP ${response.status}`);
      const result = await response.json();
      setDraft(result.draft || null);
      if (announce || result.status === 'failed') setActionStatus(result.message || result.draft?.message || 'OCR finished.');
    } catch (error) {
      setActionStatus(error instanceof Error ? error.message : 'OCR failed.');
    } finally {
      setIsExtracting(false);
    }
  };

  const getAiSuggestions = async () => {
    if (!selectedId) return;
    setIsExtracting(true);
    setActionStatus('Getting AI suggestions from OCR text…');
    try {
      let currentDraft = draft;
      if (!currentDraft?.ocr_text) {
        await runOcrForItem(selectedId, false);
        currentDraft = await loadDraft(selectedId);
      }
      if (!currentDraft?.ocr_text) throw new Error('OCR text is not available yet.');
      const response = await fetch(`/api/tax-receipts/${encodeURIComponent(selectedId)}/ai-suggestions`, { method: 'POST' });
      if (!response.ok) throw new Error(`AI suggestions failed with HTTP ${response.status}`);
      const result = await response.json();
      if (result.status === 'failed') throw new Error(result.message || 'AI suggestions failed.');
      const nextDraft = result.draft || null;
      setDraft(nextDraft);
      if (nextDraft?.suggestions) {
        setFieldDraft((current) => ({ ...current, ...nextDraft.suggestions }));
      }
      setActionStatus(result.message || 'AI suggestions entered into the fields. Review before saving.');
    } catch (error) {
      setActionStatus(error instanceof Error ? error.message : 'AI suggestions failed.');
    } finally {
      setIsExtracting(false);
    }
  };

  const cancelReview = () => {
    setSelectedId(null);
    setDetail(null);
    setFieldDraft({});
    setFieldOriginal({});
    setMarkedUpPdf(null);
    setDraft(null);
    setActionStatus(null);
    setDetailStatus(null);
  };

  const submitAction = async (action: 'fields' | 'approve') => {
    if (!selectedId) return;
    setActionStatus(action === 'approve' ? 'Approving and moving file…' : 'Saving metadata…');
    try {
      if (markedUpPdf) {
        setActionStatus('Saving marked-up PDF to SharePoint…');
        const formData = new FormData();
        formData.append('file', markedUpPdf);
        const uploadResponse = await fetch(`/api/sharepoint/input-files/${encodeURIComponent(selectedId)}/content`, {
          method: 'PUT',
          body: formData
        });
        if (!uploadResponse.ok) throw new Error(`PDF save failed with HTTP ${uploadResponse.status}`);
        const uploadResult = await uploadResponse.json();
        if (uploadResult.status === 'failed') throw new Error(uploadResult.message);
      }
      const path = action === 'fields' ? 'fields' : action;
      const changedFields = changedFieldValues(fieldDraft, fieldOriginal);
      const response = await fetch(`/api/sharepoint/input-files/${encodeURIComponent(selectedId)}/${path}`, {
        method: action === 'fields' ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields: changedFields })
      });
      if (!response.ok) throw new Error(`SharePoint action failed with HTTP ${response.status}`);
      const result = await response.json();
      if (result.status === 'failed') throw new Error(result.message || 'SharePoint action failed.');
      setActionStatus(result.message);
      setMarkedUpPdf(null);
      if (result.status === 'approved') {
        const nextToOpen = nextFile;
        await loadInputFiles();
        if (nextToOpen) {
          await openFile(nextToOpen);
          setActionStatus(result.message);
        } else {
          setSelectedId(null);
          setDetail(null);
        }
      } else if (detail) {
        const savedMessage = result.message;
        await openFile(detail.file);
        setActionStatus(savedMessage);
      }
    } catch (error) {
      setActionStatus(error instanceof Error ? error.message : 'SharePoint action failed.');
    }
  };

  useEffect(() => {
    loadInputFiles();
  }, []);

  if (selectedId) {
    return (
      <section className="page-stack">
        <div className="viewer-nav-row">
          <button className="secondary-button back-button" type="button" onClick={() => { setSelectedId(null); setDetail(null); setActionStatus(null); }}>
            <ArrowLeft size={17} /> Back to input queue
          </button>
          <div className="button-row inline-buttons">
            <button className="secondary-button" type="button" onClick={() => previousFile && openFile(previousFile)} disabled={!previousFile}>Previous</button>
            <button className="secondary-button" type="button" onClick={() => nextFile && openFile(nextFile)} disabled={!nextFile}>Next</button>
          </div>
        </div>

        <div className="detail-layout">
          <div className="card preview-card">
            <div className="card-header">
              <div>
                <p className="eyebrow">File preview</p>
                <h2>{detail?.file.name || 'Loading file…'}</h2>
              </div>
              {detail?.file.web_url && <a className="secondary-button" href={detail.file.web_url} target="_blank" rel="noreferrer">Open in SharePoint</a>}
            </div>
            <iframe className="file-preview" src={`/api/sharepoint/input-files/${encodeURIComponent(selectedId)}/content`} title={detail?.file.name || 'SharePoint file preview'} />
            <div className="ocr-results-panel">
              <div className="card-header compact-header">
                <div>
                  <p className="eyebrow">OCR results</p>
                  <h2>Extracted text</h2>
                </div>
                <div className="ocr-header-actions">
                  <span className="status-chip">{draft?.status || 'Not run'}</span>
                  <button className="secondary-button" type="button" onClick={() => selectedId && runOcrForItem(selectedId)} disabled={!selectedId || isExtracting}>
                    <RefreshCw size={16} /> {isExtracting ? 'Rescanning…' : 'Rescan OCR'}
                  </button>
                </div>
              </div>
              {draft?.ocr_text ? (
                <pre className="ocr-text">{draft.ocr_text}</pre>
              ) : (
                <p className="help-text">No OCR text yet. OCR runs automatically when this viewer opens. If it fails, check the message below.</p>
              )}
              {draft?.message && <p className="help-text">{draft.message}</p>}
            </div>
            <div className="markup-upload">
              <label>
                Marked-up PDF replacement
                <input type="file" accept="application/pdf,.pdf" onChange={(event) => setMarkedUpPdf(event.target.files?.[0] || null)} />
              </label>
              <p className="help-text">
                If you annotate the PDF in another viewer, save/export it and attach it here. Save fields or Approve will upload this marked-up PDF before saving metadata.
              </p>
              {markedUpPdf && <span className="status-chip">Ready to save: {markedUpPdf.name}</span>}
            </div>
          </div>

          <div className="card metadata-card">
            <div className="card-header">
              <div>
                <p className="eyebrow">SharePoint metadata</p>
                <h2>Review custom fields</h2>
              </div>
              <button className="secondary-button" type="button" onClick={getAiSuggestions} disabled={!detail || isExtracting}>
                <Sparkles size={17} /> {isExtracting ? 'Working…' : 'Get AI Suggestions'}
              </button>
            </div>
            {detailStatus && <p className="help-text table-status">{detailStatus}</p>}
            <div className="metadata-form">
              {([...(detail?.fields || [])].filter((field) => field.show_in_input_form !== false).sort((left, right) => left.order - right.order)).map((field) => (
                <SharePointFieldInput
                  key={field.name}
                  field={field}
                  value={fieldDraft[field.name]}
                  onChange={(value) => setFieldDraft((current) => ({ ...current, [field.name]: value }))}
                  onClear={() => setFieldDraft((current) => ({ ...current, [field.name]: field.field_type === 'boolean' ? false : '' }))}
                />
              ))}
              {detail && !detail.fields.length && <p className="help-text">No editable custom fields were found on this SharePoint library yet.</p>}
            </div>
            <div className="button-row sticky-actions">
              <button className="secondary-button" type="button" onClick={() => submitAction('fields')} disabled={!detail}><Save size={17} /> Save fields</button>
              <button className="secondary-button" type="button" onClick={cancelReview}>Cancel</button>
              <button className="primary-button" type="button" onClick={() => submitAction('approve')} disabled={!detail}><CheckCircle2 size={17} /> Approve</button>
            </div>
            {actionStatus && <p className="help-text">{actionStatus}</p>}
            {draft && (
              <div className="draft-card">
                <strong>OCR/AI draft: {draft.status}</strong>
                <p className="help-text">{draft.message}</p>
                {!!Object.keys(draft.suggestions || {}).length && <p className="help-text">{Object.keys(draft.suggestions).length} suggested field value(s). Confidence: {draft.confidence ?? 'n/a'}</p>}
              </div>
            )}
            <p className="help-text">Approve saves these field values to SharePoint, then moves the file to the configured processed output folder. Cancel closes this review without saving anything.</p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="page-stack">
      <div className="workflow-strip">
        {['SharePoint sync', 'OCR', 'AI extraction', 'Human review', 'Metadata write-back'].map((step, index) => (
          <div className="workflow-step" key={step}>
            <span>{index + 1}</span>
            {step}
          </div>
        ))}
      </div>

      <div className="content-grid compact">
        <MetricCard title="SharePoint library" value={libraryName} detail={`Input folder: ${inputFolder}`} icon={<Cloud />} />
        <MetricCard title="Input queue" value={String(files.length)} detail="Held here until you approve" icon={<FileScan />} />
        <MetricCard title="AI reviewed" value="0" detail="Extraction starts after OCR is wired" icon={<Sparkles />} />
      </div>

      <div className="card table-card">
        <div className="card-header">
          <div>
            <p className="eyebrow">SharePoint input folder</p>
            <h2>OCR / AI / review queue</h2>
          </div>
          <button className="secondary-button" type="button" onClick={loadInputFiles} disabled={isLoading}>
            <RefreshCw size={17} /> {isLoading ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
        <p className="help-text table-status">{listStatus}</p>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <SortableTh label="Name" sortKey="name" activeKey={sortKey} direction={sortDirection} onSort={changeSort} />
                <SortableTh label="Type" sortKey="item_type" activeKey={sortKey} direction={sortDirection} onSort={changeSort} />
                <SortableTh label="Size" sortKey="size" activeKey={sortKey} direction={sortDirection} onSort={changeSort} />
                <SortableTh label="Last modified" sortKey="last_modified" activeKey={sortKey} direction={sortDirection} onSort={changeSort} />
                <SortableTh label="Status" sortKey="status" activeKey={sortKey} direction={sortDirection} onSort={changeSort} />
              </tr>
            </thead>
            <tbody>
              {sortedFiles.map((file) => (
                <tr key={file.id}>
                  <td><button className="file-button" type="button" onClick={() => openFile(file)}>{file.name}</button></td>
                  <td>{file.item_type}</td>
                  <td>{formatBytes(file.size)}</td>
                  <td>{formatDateTime(file.last_modified)}</td>
                  <td><span className="status-chip">{file.status || 'Queued for OCR'}</span></td>
                </tr>
              ))}
              {!files.length && !isLoading && (
                <tr>
                  <td colSpan={5} className="empty-table-cell">No files found in the configured SharePoint input folder.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

function ProcessedReceipts() {
  const [files, setFiles] = useState<SharePointInputFile[]>([]);
  const [outputFolder, setOutputFolder] = useState('Processed/FY2025-2026');
  const [libraryName, setLibraryName] = useState('SharePoint library');
  const [listStatus, setListStatus] = useState('Loading processed receipts…');
  const [isLoading, setIsLoading] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>('last_modified');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [search, setSearch] = useState('');
  const [pageSize, setPageSize] = useState<50 | 100 | 200>(50);
  const [pageIndex, setPageIndex] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<SharePointFileDetail | null>(null);
  const [detailStatus, setDetailStatus] = useState<string | null>(null);

  const loadProcessedFiles = async () => {
    setIsLoading(true);
    setListStatus('Loading processed receipts…');
    try {
      const response = await fetch('/api/sharepoint/processed-files');
      if (!response.ok) throw new Error(`Processed receipts list failed with HTTP ${response.status}`);
      const result = await response.json();
      setFiles(Array.isArray(result.files) ? result.files : []);
      setOutputFolder(result.target?.output_folder || 'Processed/FY2025-2026');
      setLibraryName(result.target?.library_name || 'SharePoint library');
      setListStatus(result.message || 'Processed receipts loaded.');
    } catch (error) {
      setFiles([]);
      setListStatus(error instanceof Error ? error.message : 'Could not load processed receipts.');
    } finally {
      setIsLoading(false);
    }
  };

  const filteredFiles = useMemo(() => {
    const query = search.trim().toLowerCase();
    const direction = sortDirection === 'asc' ? 1 : -1;
    return files
      .filter((file) => !query || `${file.name} ${file.status} ${file.item_type}`.toLowerCase().includes(query))
      .sort((left, right) => {
        const leftValue = left[sortKey];
        const rightValue = right[sortKey];
        if (sortKey === 'size') return ((leftValue as number) - (rightValue as number)) * direction;
        if (sortKey === 'last_modified') return (new Date(left.last_modified).getTime() - new Date(right.last_modified).getTime()) * direction;
        return String(leftValue || '').localeCompare(String(rightValue || '')) * direction;
      });
  }, [files, search, sortDirection, sortKey]);

  const pageCount = Math.max(1, Math.ceil(filteredFiles.length / pageSize));
  const visibleFiles = filteredFiles.slice(pageIndex * pageSize, pageIndex * pageSize + pageSize);

  const changeSort = (key: SortKey) => {
    if (sortKey === key) setSortDirection((current) => (current === 'asc' ? 'desc' : 'asc'));
    else {
      setSortKey(key);
      setSortDirection(key === 'last_modified' || key === 'size' ? 'desc' : 'asc');
    }
  };

  const openProcessedFile = async (file: SharePointInputFile) => {
    setSelectedId(file.id);
    setDetail(null);
    setDetailStatus(`Loading ${file.name}…`);
    try {
      const response = await fetch(`/api/sharepoint/input-files/${encodeURIComponent(file.id)}`);
      if (!response.ok) throw new Error(`File details failed with HTTP ${response.status}`);
      const result: SharePointFileDetail = await response.json();
      setDetail(result);
      setDetailStatus(result.message);
    } catch (error) {
      setDetailStatus(error instanceof Error ? error.message : 'Could not load receipt details.');
    }
  };

  useEffect(() => {
    loadProcessedFiles();
  }, []);

  useEffect(() => {
    setPageIndex(0);
  }, [search, pageSize]);

  if (selectedId) {
    return (
      <section className="page-stack">
        <button className="secondary-button back-button" type="button" onClick={() => { setSelectedId(null); setDetail(null); setDetailStatus(null); }}>
          <ArrowLeft size={17} /> Back to processed receipts
        </button>
        <div className="detail-layout">
          <div className="card preview-card">
            <div className="card-header">
              <div>
                <p className="eyebrow">Processed receipt</p>
                <h2>{detail?.file.name || 'Loading file…'}</h2>
              </div>
              {detail?.file.web_url && <a className="secondary-button" href={detail.file.web_url} target="_blank" rel="noreferrer">Open in SharePoint</a>}
            </div>
            <iframe className="file-preview" src={`/api/sharepoint/input-files/${encodeURIComponent(selectedId)}/content`} title={detail?.file.name || 'Processed receipt preview'} />
          </div>
          <div className="card metadata-card">
            <div className="card-header">
              <div>
                <p className="eyebrow">Read only</p>
                <h2>Receipt details</h2>
              </div>
            </div>
            {detailStatus && <p className="help-text table-status">{detailStatus}</p>}
            <div className="readonly-fields">
              {([...(detail?.fields || [])].sort((left, right) => left.order - right.order)).map((field) => (
                <div className="readonly-field" key={field.name}>
                  <span>{field.display_name}</span>
                  <strong>{formatFieldValue(field.value)}</strong>
                </div>
              ))}
              {detail && !detail.fields.length && <p className="help-text">No custom metadata fields were found on this receipt.</p>}
            </div>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="page-stack">
      <div className="content-grid compact">
        <MetricCard title="SharePoint library" value={libraryName} detail={`Processed folder: ${outputFolder}`} icon={<Cloud />} />
        <MetricCard title="Processed receipts" value={String(files.length)} detail="Completed and moved" icon={<CheckCircle2 />} />
        <MetricCard title="Search results" value={String(filteredFiles.length)} detail="Filtered locally" icon={<Search />} />
      </div>
      <div className="card table-card">
        <div className="card-header">
          <div>
            <p className="eyebrow">SharePoint processed folder</p>
            <h2>Completed receipt archive</h2>
          </div>
          <button className="secondary-button" type="button" onClick={loadProcessedFiles} disabled={isLoading}>
            <RefreshCw size={17} /> {isLoading ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
        <div className="table-controls">
          <label>Search<input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search receipt names…" /></label>
          <label>Show per page
            <select value={pageSize} onChange={(event) => setPageSize(Number(event.target.value) as 50 | 100 | 200)}>
              <option value={50}>50</option>
              <option value={100}>100</option>
              <option value={200}>200</option>
            </select>
          </label>
        </div>
        <p className="help-text table-status">{listStatus}</p>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <SortableTh label="Name" sortKey="name" activeKey={sortKey} direction={sortDirection} onSort={changeSort} />
                <SortableTh label="Type" sortKey="item_type" activeKey={sortKey} direction={sortDirection} onSort={changeSort} />
                <SortableTh label="Size" sortKey="size" activeKey={sortKey} direction={sortDirection} onSort={changeSort} />
                <SortableTh label="Last modified" sortKey="last_modified" activeKey={sortKey} direction={sortDirection} onSort={changeSort} />
                <SortableTh label="Status" sortKey="status" activeKey={sortKey} direction={sortDirection} onSort={changeSort} />
              </tr>
            </thead>
            <tbody>
              {visibleFiles.map((file) => (
                <tr key={file.id}>
                  <td><button className="file-button" type="button" onClick={() => openProcessedFile(file)}>{file.name}</button></td>
                  <td>{file.item_type}</td>
                  <td>{formatBytes(file.size)}</td>
                  <td>{formatDateTime(file.last_modified)}</td>
                  <td><span className="status-chip">{file.status || 'Processed'}</span></td>
                </tr>
              ))}
              {!visibleFiles.length && !isLoading && (
                <tr><td colSpan={5} className="empty-table-cell">No processed receipts found.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="pagination-row">
          <span className="help-text inline-help">Page {Math.min(pageIndex + 1, pageCount)} of {pageCount}</span>
          <div className="button-row">
            <button className="secondary-button" type="button" onClick={() => setPageIndex((value) => Math.max(0, value - 1))} disabled={pageIndex === 0}>Previous</button>
            <button className="secondary-button" type="button" onClick={() => setPageIndex((value) => Math.min(pageCount - 1, value + 1))} disabled={pageIndex >= pageCount - 1}>Next</button>
          </div>
        </div>
      </div>
    </section>
  );
}

function SortableTh({ label, sortKey, activeKey, direction, onSort }: { label: string; sortKey: SortKey; activeKey: SortKey; direction: SortDirection; onSort: (key: SortKey) => void }) {
  const marker = activeKey === sortKey ? (direction === 'asc' ? ' ↑' : ' ↓') : '';
  return <th><button className="sort-button" type="button" onClick={() => onSort(sortKey)}>{label}{marker}</button></th>;
}

function SharePointFieldInput({ field, value, onChange, onClear }: { field: SharePointFieldDefinition; value: unknown; onChange: (value: unknown) => void; onClear: () => void }) {
  const label = `${field.display_name}${field.required ? ' *' : ''}`;
  const inputId = `field-${field.name}`;
  const common = {
    id: inputId,
    disabled: field.read_only,
    required: field.required
  };

  let control: React.ReactNode;
  if (field.field_type === 'choice' && field.choices?.length) {
    if (field.allow_multiple) {
      const selected = Array.isArray(value) ? value.map(String) : String(value || '').split(';').filter(Boolean);
      control = (
        <select
          {...common}
          multiple
          value={selected}
          onChange={(event) => onChange(Array.from(event.target.selectedOptions).map((option) => option.value))}
        >
          {field.choices.map((choice) => <option key={choice} value={choice}>{choice}</option>)}
        </select>
      );
    } else {
      control = (
        <select {...common} value={String(value ?? '')} onChange={(event) => onChange(event.target.value)}>
          <option value="">Select…</option>
          {field.choices.map((choice) => <option key={choice} value={choice}>{choice}</option>)}
          {field.allow_text_entry && value && !field.choices.includes(String(value)) && <option value={String(value)}>{String(value)}</option>}
        </select>
      );
    }
  } else if (field.field_type === 'boolean') {
    control = (
      <div className="checkbox-field">
        <input {...common} type="checkbox" checked={Boolean(value)} onChange={(event) => onChange(event.target.checked)} />
        <span>Yes</span>
      </div>
    );
  } else if (field.field_type === 'dateTime') {
    control = <input {...common} type="datetime-local" value={toDateTimeLocal(value)} onChange={(event) => onChange(event.target.value)} />;
  } else if (field.field_type === 'number' || field.field_type === 'currency') {
    control = (
      <input
        {...common}
        type="number"
        value={String(value ?? '')}
        min={field.min_value ?? undefined}
        max={field.max_value ?? undefined}
        step={field.field_type === 'currency' ? '0.01' : 'any'}
        onChange={(event) => onChange(event.target.value)}
      />
    );
  } else {
    control = (
      <input
        {...common}
        type="text"
        value={String(value ?? '')}
        maxLength={field.max_length ?? undefined}
        onChange={(event) => onChange(event.target.value)}
      />
    );
  }

  return (
    <label htmlFor={inputId}>
      {label}
      <div className="field-control-row">
        {control}
        <button className="clear-field-button" type="button" onClick={onClear} title={`Clear ${field.display_name}`} aria-label={`Clear ${field.display_name}`}>×</button>
      </div>
      {field.description && <span className="field-description">{field.description}</span>}
    </label>
  );
}

function initialFieldDraftValue(field: SharePointFieldDefinition): unknown {
  if (field.value == null) return field.field_type === 'boolean' ? false : '';
  if (field.field_type === 'dateTime') return toDateTimeLocal(field.value);
  if (field.field_type === 'boolean') return Boolean(field.value);
  if (field.allow_multiple && Array.isArray(field.value)) return field.value.map(String);
  return String(field.value);
}

function changedFieldValues(current: Record<string, unknown>, original: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(current).filter(([key, value]) => JSON.stringify(value ?? '') !== JSON.stringify(original[key] ?? ''))
  );
}

function toDateTimeLocal(value: unknown): string {
  if (!value) return '';
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return String(value);
  const offsetMs = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

function formatFieldValue(value: unknown): string {
  if (value == null || value === '') return '—';
  if (Array.isArray(value)) return value.length ? value.map(String).join(', ') : '—';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  return String(value);
}

function buildBudgetProjectionForRange(items: BudgetItem[], rangeStart: Date, rangeEnd: Date, startingBalance: number) {
  const firstWeekStart = startOfBudgetWeek(rangeStart);
  const safeRangeEnd = rangeEnd < rangeStart ? rangeStart : rangeEnd;
  const weekCount = Math.max(1, Math.ceil((safeRangeEnd.getTime() - firstWeekStart.getTime() + 1) / (7 * 86_400_000)));
  let balance = startingBalance;
  return Array.from({ length: weekCount }, (_, index) => {
    const calendarStart = addDays(firstWeekStart, index * 7);
    const calendarEnd = addDays(calendarStart, 6);
    const start = calendarStart < rangeStart ? rangeStart : calendarStart;
    const end = calendarEnd > safeRangeEnd ? safeRangeEnd : calendarEnd;
    const dueItems = items.filter((item) => occurrenceCountInWeek(item, start, end) > 0);
    const income = dueItems.filter((item) => item.kind === 'income').reduce((sum, item) => sum + item.amount * occurrenceCountInWeek(item, start, end), 0);
    const expenses = dueItems.filter((item) => item.kind === 'expense').reduce((sum, item) => sum + item.amount * occurrenceCountInWeek(item, start, end), 0);
    const net = income - expenses;
    balance += net;
    return { start, end, items: dueItems, income, expenses, net, balance };
  }).filter((week) => week.end >= rangeStart && week.start <= safeRangeEnd);
}

function itemOccursInWeek(item: BudgetItem, start: Date, end: Date): boolean {
  return occurrenceCountInWeek(item, start, end) > 0;
}

function occurrenceCountInWeek(item: BudgetItem, start: Date, end: Date): number {
  const schedule = normalizeBudgetSchedule(item.schedule, item.cycle);
  const itemEnd = parseBudgetDate(item.endDate);
  const effectiveEnd = itemEnd && itemEnd < end ? itemEnd : end;
  if (effectiveEnd < start) return 0;
  if (schedule === 'once-off') return (item.dueDates || []).filter((date) => {
    const parsedDate = parseBudgetDate(date);
    return parsedDate ? dateInRange(parsedDate, start, effectiveEnd) : false;
  }).length;
  if (schedule === 'random') {
    const anchor = parseBudgetDate(item.anchorDate);
    const effectiveStart = anchor && anchor > start ? anchor : start;
    if (effectiveEnd < effectiveStart) return 0;
    const days = item.daysOfMonth?.length ? item.daysOfMonth : item.dayOfMonth ? [item.dayOfMonth] : [];
    if (!days.length) return 0;
    let count = 0;
    for (const day of days) {
      for (const candidate of datesForDayOfMonthBetween(day, effectiveStart, effectiveEnd)) {
        const monthNumber = candidate.getMonth() + 1;
        if (!item.months?.length || item.months.includes(monthNumber)) count += 1;
      }
    }
    return count;
  }
  const anchor = parseBudgetDate(item.anchorDate);
  if (!anchor) return 0;
  const count = Math.max(1, item.intervalCount || defaultIntervalFromCycle(item.cycle).count);
  const unit = item.intervalUnit || defaultIntervalFromCycle(item.cycle).unit;
  let occurrences = 0;
  for (let cursor = new Date(anchor), guard = 0; cursor <= effectiveEnd && guard < 10_000; guard += 1) {
    if (dateInRange(cursor, start, effectiveEnd)) occurrences += 1;
    const next = addInterval(cursor, count, unit);
    if (next <= cursor) break;
    cursor = next;
  }
  return occurrences;
}

function addInterval(date: Date, count: number, unit: BudgetIntervalUnit): Date {
  const copy = new Date(date);
  if (unit === 'day') copy.setDate(copy.getDate() + count);
  if (unit === 'week') copy.setDate(copy.getDate() + count * 7);
  if (unit === 'month') copy.setMonth(copy.getMonth() + count);
  if (unit === 'year') copy.setFullYear(copy.getFullYear() + count);
  return copy;
}

function datesForDayOfMonthBetween(day: number, start: Date, end: Date): Date[] {
  const dates: Date[] = [];
  for (let cursor = new Date(start.getFullYear(), start.getMonth(), 1); cursor <= end; cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1)) {
    const lastDay = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
    const candidate = new Date(cursor.getFullYear(), cursor.getMonth(), Math.min(day, lastDay));
    if (dateInRange(candidate, start, end)) dates.push(candidate);
  }
  return dates;
}

function startOfBudgetWeek(date: Date): Date {
  const copy = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diff = (copy.getDay() + 5) % 7;
  return addDays(copy, -diff);
}

function addDays(date: Date, days: number): Date {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

function dateInRange(date: Date, start: Date, end: Date): boolean {
  return date >= start && date <= end;
}

function formatWeekRange(start: Date, end: Date): string {
  return `${start.toLocaleDateString('en-AU', { day: '2-digit', month: 'short' })} – ${end.toLocaleDateString('en-AU', { day: '2-digit', month: 'short' })}`;
}

function formatProjectionRangeLabel(from: Date, to: Date): string {
  return `${from.toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' })} – ${to.toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' })}`;
}

function buildProjectionDateRange(preset: ProjectionRangePreset, customFrom: string, customTo: string): { from: Date; to: Date } {
  const today = new Date();
  const year = today.getFullYear();
  const currentMonth = today.getMonth();
  let from = new Date(year, 0, 1);
  let to = new Date(year, 11, 31);
  if (preset === 'remaining-year') from = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  if (preset === 'current-month') {
    from = new Date(year, currentMonth, 1);
    to = new Date(year, currentMonth + 1, 0);
  }
  if (preset === 'current-fortnight') {
    const fortnightStart = startOfBudgetWeek(today);
    from = today.getDay() === 2 ? addDays(fortnightStart, -7) : fortnightStart;
    to = addDays(from, 13);
  }
  if (preset === 'current-week') {
    from = startOfBudgetWeek(today);
    to = addDays(from, 6);
  }
  if (preset === 'custom') {
    from = parseBudgetDate(customFrom) || from;
    to = parseBudgetDate(customTo) || to;
  }
  if (to < from) return { from: to, to: from };
  return { from, to };
}

function formatAuDate(date: Date): string {
  return date.toLocaleDateString('en-AU', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function parseBudgetDate(value: string | undefined): Date | null {
  if (!value) return null;
  const trimmed = value.trim();
  const auMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (auMatch) {
    const [, day, month, year] = auMatch;
    return new Date(Number(year), Number(month) - 1, Number(day));
  }
  const isoMatch = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (isoMatch) {
    const [, year, month, day] = isoMatch;
    return new Date(Number(year), Number(month) - 1, Number(day));
  }
  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatBudgetDateText(value: string): string {
  const parsed = parseBudgetDate(value);
  return parsed ? formatAuDate(parsed) : value;
}

function toDateInputValue(value: string): string {
  const parsed = parseBudgetDate(value);
  if (!parsed) return '';
  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, '0');
  const day = String(parsed.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatMoney(value: number): string {
  return value.toLocaleString(undefined, { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 });
}

function formatNumber(value: number): string {
  return value.toLocaleString(undefined, { maximumFractionDigits: value % 1 === 0 ? 0 : 1 });
}

function annualOccurrenceCount(item: BudgetItem): number {
  const schedule = normalizeBudgetSchedule(item.schedule, item.cycle);
  if (schedule === 'once-off') return item.dueDates?.length || 0;
  if (schedule === 'random') {
    const days = item.daysOfMonth?.length ? item.daysOfMonth : item.dayOfMonth ? [item.dayOfMonth] : [];
    const months = item.months?.length ? item.months.length : 12;
    return days.length * months;
  }
  const count = Math.max(1, item.intervalCount || defaultIntervalFromCycle(item.cycle).count);
  const unit = item.intervalUnit || defaultIntervalFromCycle(item.cycle).unit;
  if (unit === 'day') return 365.25 / count;
  if (unit === 'week') return 52.1775 / count;
  if (unit === 'month') return 12 / count;
  if (unit === 'year') return 1 / count;
  return 0;
}

function annualizedBudgetAmount(item: BudgetItem): number {
  return item.amount * annualOccurrenceCount(item);
}

function buildScheduleTotalsForRange(items: BudgetItem[], from: Date, to: Date): { income: number; expenses: number } {
  return items.reduce((totals, item) => {
    const amount = occurrenceDatesBetween(item, from, to).length * item.amount;
    if (item.kind === 'income') return { ...totals, income: totals.income + amount };
    return { ...totals, expenses: totals.expenses + amount };
  }, { income: 0, expenses: 0 });
}

function buildProjectedCategorySummaryForRange(expenses: BudgetItem[], from: Date, to: Date): Array<{ category: string; yearly: number }> {
  const totals = new Map<string, number>();
  expenses.forEach((item) => {
    const projectedTotal = occurrenceDatesBetween(item, from, to).length * item.amount;
    if (!projectedTotal) return;
    const category = item.category || 'Uncategorised';
    totals.set(category, (totals.get(category) || 0) + projectedTotal);
  });
  const sorted = Array.from(totals, ([category, yearly]) => ({ category, yearly })).sort((a, b) => b.yearly - a.yearly);
  const top = sorted.slice(0, 8);
  const other = sorted.slice(8).reduce((sum, item) => sum + item.yearly, 0);
  return other > 0 ? [...top, { category: 'Other', yearly: other }] : top;
}

function buildActualComparisonData(items: BudgetItem[], actuals: ActualCostTransaction[], days: number): Array<{ category: string; projected: number; actual: number }> {
  const projected = new Map<string, number>();
  items.filter((item) => item.kind === 'expense').forEach((item) => {
    const category = item.category || 'Uncategorised';
    projected.set(category, (projected.get(category) || 0) + annualizedBudgetAmount(item) * (days / 365.25));
  });
  const actual = new Map<string, number>();
  actuals.forEach((item) => {
    const category = item.category || 'Uncategorised';
    actual.set(category, (actual.get(category) || 0) + Math.abs(item.amount));
  });
  return Array.from(new Set([...projected.keys(), ...actual.keys()])).map((category) => ({ category, projected: projected.get(category) || 0, actual: actual.get(category) || 0 })).sort((a, b) => (b.projected + b.actual) - (a.projected + a.actual));
}

function compareActualCostTransactions(left: ActualCostTransaction, right: ActualCostTransaction, key: keyof ActualCostTransaction, direction: SortDirection): number {
  const multiplier = direction === 'asc' ? 1 : -1;
  if (key === 'date') {
    const leftTime = parseBudgetDate(left.date)?.getTime() || 0;
    const rightTime = parseBudgetDate(right.date)?.getTime() || 0;
    return (leftTime - rightTime) * multiplier;
  }
  if (key === 'amount') return ((left.amount || 0) - (right.amount || 0)) * multiplier;
  return String(left[key] || '').localeCompare(String(right[key] || '')) * multiplier;
}

function compareBudgetItems(left: BudgetItem, right: BudgetItem, key: 'name' | 'supplier' | 'category' | 'amount' | 'schedule' | 'rule', direction: SortDirection): number {
  const multiplier = direction === 'asc' ? 1 : -1;
  if (key === 'amount') return ((left.amount || 0) - (right.amount || 0)) * multiplier;
  const leftValue = key === 'schedule' ? (left.schedule || left.cycle) : key === 'rule' ? budgetRuleLabel(left) : String(left[key] || '');
  const rightValue = key === 'schedule' ? (right.schedule || right.cycle) : key === 'rule' ? budgetRuleLabel(right) : String(right[key] || '');
  return String(leftValue || '').localeCompare(String(rightValue || '')) * multiplier;
}

function findLastTuesdayIncomeDate(items: BudgetItem[], referenceDate: Date): Date {
  const end = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), referenceDate.getDate());
  const start = addDays(end, -730);
  let latest: Date | null = null;
  items.filter((item) => item.kind === 'income').forEach((item) => {
    for (const date of occurrenceDatesBetween(item, start, end)) {
      if (date.getDay() === 2 && (!latest || date > latest)) latest = date;
    }
  });
  if (latest) return latest;
  return addDays(end, -((end.getDay() + 5) % 7));
}

function occurrenceDatesBetween(item: BudgetItem, start: Date, end: Date): Date[] {
  const schedule = normalizeBudgetSchedule(item.schedule, item.cycle);
  const itemEnd = parseBudgetDate(item.endDate);
  const effectiveEnd = itemEnd && itemEnd < end ? itemEnd : end;
  if (effectiveEnd < start) return [];
  if (schedule === 'once-off') return (item.dueDates || []).map(parseBudgetDate).filter((date): date is Date => Boolean(date)).filter((date) => dateInRange(date, start, effectiveEnd));
  if (schedule === 'random') {
    const anchor = parseBudgetDate(item.anchorDate);
    const effectiveStart = anchor && anchor > start ? anchor : start;
    if (effectiveEnd < effectiveStart) return [];
    const days = item.daysOfMonth?.length ? item.daysOfMonth : item.dayOfMonth ? [item.dayOfMonth] : [];
    return days.flatMap((day) => datesForDayOfMonthBetween(day, effectiveStart, effectiveEnd)).filter((date) => !item.months?.length || item.months.includes(date.getMonth() + 1));
  }
  const anchor = parseBudgetDate(item.anchorDate);
  if (!anchor) return [];
  const count = Math.max(1, item.intervalCount || defaultIntervalFromCycle(item.cycle).count);
  const unit = item.intervalUnit || defaultIntervalFromCycle(item.cycle).unit;
  const dates: Date[] = [];
  for (let cursor = new Date(anchor), guard = 0; cursor <= effectiveEnd && guard < 10_000; guard += 1) {
    if (dateInRange(cursor, start, effectiveEnd)) dates.push(new Date(cursor));
    const next = addInterval(cursor, count, unit);
    if (next <= cursor) break;
    cursor = next;
  }
  return dates;
}

function parseMoney(value: string): number {
  const cleaned = String(value).replace(/[$,\s]/g, '');
  const parsed = Number(cleaned);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function guessHeader(headers: string[], candidates: string[]): string {
  const lower = headers.map((header) => header.toLowerCase());
  const index = candidates.map((candidate) => lower.findIndex((header) => header.includes(candidate))).find((match) => match !== -1);
  return index == null || index === -1 ? '' : headers[index];
}

function parseCsv(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const rows: string[][] = [];
  let current = '';
  let row: string[] = [];
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (char === '"' && quoted && next === '"') {
      current += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === ',' && !quoted) {
      row.push(current.trim());
      current = '';
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && next === '\n') index += 1;
      row.push(current.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      current = '';
    } else {
      current += char;
    }
  }
  row.push(current.trim());
  if (row.some(Boolean)) rows.push(row);
  const headers = rows[0] || [];
  return { headers, rows: rows.slice(1).map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] || '']))) };
}

function budgetRuleLabel(item: BudgetItem): string {
  if (item.note) return item.note;
  const endLabel = item.endDate ? ` until ${formatBudgetDateText(item.endDate)}` : '';
  const schedule = normalizeBudgetSchedule(item.schedule, item.cycle);
  if (schedule === 'recurring') return `Every ${item.intervalCount || defaultIntervalFromCycle(item.cycle).count} ${pluralizeUnit(item.intervalUnit || defaultIntervalFromCycle(item.cycle).unit, item.intervalCount || defaultIntervalFromCycle(item.cycle).count)} from ${item.anchorDate ? formatBudgetDateText(item.anchorDate) : 'start date'}${endLabel}`;
  if (schedule === 'random') {
    const days = item.daysOfMonth?.length ? item.daysOfMonth : item.dayOfMonth ? [item.dayOfMonth] : [];
    return `Day ${days.join(', ') || '—'} in month${item.months?.length ? `s ${item.months.join(', ')}` : 's'}${item.anchorDate ? ` from ${formatBudgetDateText(item.anchorDate)}` : ''}${endLabel}`;
  }
  if (item.dueDates?.length) return `${item.dueDates.map(formatBudgetDateText).join(', ')}${endLabel}`;
  return item.endDate ? `As needed until ${formatBudgetDateText(item.endDate)}` : 'As needed';
}

function pluralizeUnit(unit: BudgetIntervalUnit, count: number): string {
  const label = unit === 'day' ? 'day' : unit === 'week' ? 'week' : unit === 'month' ? 'month' : 'year';
  return count === 1 ? label : `${label}s`;
}

function ordinalSuffix(day: number): string {
  if (day >= 11 && day <= 13) return 'th';
  return ['th', 'st', 'nd', 'rd'][day % 10] || 'th';
}

function formatBytes(bytes: number): string {
  if (!bytes) return '—';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(value >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

function formatDateTime(value: string): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('en-AU', { dateStyle: 'short', timeStyle: 'short' });
}

function SettingsPage({ section, settings, update }: { section: 'sharepoint' | 'ai-ocr' | 'family-budget' | 'backup' | 'bank'; settings: SettingsState; update: (patch: Partial<SettingsState>) => void }) {
  const [clientSecretDraft, setClientSecretDraft] = useState('');
  const [aiApiKeyDraft, setAiApiKeyDraft] = useState('');
  const [aiFieldDefinitions, setAiFieldDefinitions] = useState<AiFieldDefinition[]>([]);
  const [aiPromptPreview, setAiPromptPreview] = useState('');
  const [sharePointFields, setSharePointFields] = useState<SharePointFieldDefinition[]>([]);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const [aiSaveStatus, setAiSaveStatus] = useState<string | null>(null);
  const [aiDefinitionsStatus, setAiDefinitionsStatus] = useState<string | null>(null);
  const [sharePointFieldsStatus, setSharePointFieldsStatus] = useState<string | null>(null);
  const [familyBudgetCategories, setFamilyBudgetCategories] = useState<string[]>([]);
  const [familyBudgetCategoryDraft, setFamilyBudgetCategoryDraft] = useState('');
  const [familyBudgetStatus, setFamilyBudgetStatus] = useState<string | null>(null);
  const [backupStatus, setBackupStatus] = useState<string | null>(null);
  const [restoreFile, setRestoreFile] = useState<File | null>(null);
  const [testStatus, setTestStatus] = useState<string | null>(null);
  const secretExpiryWarning = getSecretExpiryWarning(settings.sharePointClientSecretExpiry);

  const loadSharePointFields = async () => {
    setSharePointFieldsStatus('Loading SharePoint fields…');
    try {
      const response = await fetch('/api/settings/sharepoint/fields');
      if (!response.ok) throw new Error(`SharePoint fields load failed with HTTP ${response.status}`);
      const result = await response.json();
      if (result.status === 'failed') throw new Error(result.message || 'Could not load SharePoint fields.');
      setSharePointFields(result.fields || []);
      setSharePointFieldsStatus(result.message || 'Loaded SharePoint fields.');
    } catch (error) {
      setSharePointFieldsStatus(error instanceof Error ? error.message : 'Could not load SharePoint fields.');
    }
  };

  const loadAiFieldDefinitions = async () => {
    setAiDefinitionsStatus('Loading SharePoint field definitions…');
    try {
      const response = await fetch('/api/settings/ai/field-definitions');
      if (!response.ok) throw new Error(`Field definition load failed with HTTP ${response.status}`);
      const result = await response.json();
      if (result.status === 'failed') throw new Error(result.message || 'Could not load field definitions.');
      setAiFieldDefinitions(result.fields || []);
      setAiPromptPreview(result.prompt_preview || '');
      setAiDefinitionsStatus(result.message || 'Loaded SharePoint field definitions.');
    } catch (error) {
      setAiDefinitionsStatus(error instanceof Error ? error.message : 'Could not load field definitions.');
    }
  };

  const loadFamilyBudgetCategories = async () => {
    setFamilyBudgetStatus('Loading family budget categories…');
    try {
      const response = await fetch('/api/family-budget/categories');
      if (!response.ok) throw new Error(`Family budget categories load failed with HTTP ${response.status}`);
      const result = await response.json();
      if (result.status === 'failed') throw new Error(result.message || 'Could not load family budget categories.');
      setFamilyBudgetCategories(result.categories || []);
      setFamilyBudgetStatus(result.message || 'Loaded family budget categories.');
    } catch (error) {
      setFamilyBudgetStatus(error instanceof Error ? error.message : 'Could not load family budget categories.');
    }
  };

  useEffect(() => {
    if (section === 'sharepoint') loadSharePointFields();
    if (section === 'ai-ocr') loadAiFieldDefinitions();
    if (section === 'family-budget') loadFamilyBudgetCategories();
  }, [section]);

  const saveSharePointSettings = async () => {
    setSaveStatus('Saving SharePoint settings…');
    try {
      const response = await fetch('/api/settings/sharepoint', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenant_domain: settings.sharePointTenant,
          tenant_id: settings.sharePointTenantId,
          client_id: settings.sharePointClientId,
          client_secret: clientSecretDraft || null,
          client_secret_expires_on: settings.sharePointClientSecretExpiry || null,
          site_url: settings.sharePointSite,
          site_id: settings.sharePointSiteId,
          drive_id: settings.sharePointDriveId,
          library_name: settings.sharePointLibrary,
          input_folder: settings.sharePointInputFolder,
          output_folder: settings.sharePointOutputFolder
        })
      });
      if (!response.ok) throw new Error(`Save failed with HTTP ${response.status}`);
      setClientSecretDraft('');
      setSaveStatus('Saved to server-side .env. Client secret field cleared from the browser.');
    } catch (error) {
      setSaveStatus(error instanceof Error ? error.message : 'Save failed. Is the backend running?');
    }
  };

  const saveSharePointFields = async () => {
    setSharePointFieldsStatus('Saving SharePoint field visibility…');
    try {
      const response = await fetch('/api/settings/sharepoint/fields', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ show_in_input_form: Object.fromEntries(sharePointFields.map((field) => [field.name, field.show_in_input_form])) })
      });
      if (!response.ok) throw new Error(`SharePoint fields save failed with HTTP ${response.status}`);
      const result = await response.json();
      if (result.status === 'failed') throw new Error(result.message || 'Could not save SharePoint field visibility.');
      setSharePointFields(result.fields || []);
      setSharePointFieldsStatus('Saved. Receipts Inbox will hide unchecked fields from the input form.');
    } catch (error) {
      setSharePointFieldsStatus(error instanceof Error ? error.message : 'Could not save SharePoint field visibility.');
    }
  };

  const saveAiSettings = async () => {
    setAiSaveStatus('Saving AI settings…');
    try {
      const response = await fetch('/api/settings/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: settings.aiProvider,
          model: settings.aiModel,
          base_url: settings.aiBaseUrl,
          api_key: aiApiKeyDraft || null
        })
      });
      if (!response.ok) throw new Error(`AI settings save failed with HTTP ${response.status}`);
      setAiApiKeyDraft('');
      setAiSaveStatus('Saved AI settings to server-side .env. API key field cleared from the browser.');
    } catch (error) {
      setAiSaveStatus(error instanceof Error ? error.message : 'AI settings save failed. Is the backend running?');
    }
  };

  const saveAiFieldDefinitions = async () => {
    setAiDefinitionsStatus('Saving field definitions…');
    try {
      const response = await fetch('/api/settings/ai/field-definitions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ definitions: Object.fromEntries(aiFieldDefinitions.map((field) => [field.name, field.definition])) })
      });
      if (!response.ok) throw new Error(`Field definition save failed with HTTP ${response.status}`);
      const result = await response.json();
      if (result.status === 'failed') throw new Error(result.message || 'Could not save field definitions.');
      setAiFieldDefinitions(result.fields || []);
      setAiPromptPreview(result.prompt_preview || '');
      setAiDefinitionsStatus('Saved field definitions. AI extraction will use these definitions in the prompt.');
    } catch (error) {
      setAiDefinitionsStatus(error instanceof Error ? error.message : 'Could not save field definitions.');
    }
  };

  const saveFamilyBudgetCategories = async (categories = familyBudgetCategories) => {
    setFamilyBudgetStatus('Saving family budget categories…');
    try {
      const response = await fetch('/api/family-budget/categories', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ categories })
      });
      if (!response.ok) throw new Error(`Family budget categories save failed with HTTP ${response.status}`);
      const result = await response.json();
      if (result.status === 'failed') throw new Error(result.message || 'Could not save family budget categories.');
      setFamilyBudgetCategories(result.categories || []);
      localStorage.setItem(FAMILY_BUDGET_CATEGORIES_STORAGE_KEY, JSON.stringify(result.categories || []));
      setFamilyBudgetStatus(result.message || 'Saved family budget categories.');
    } catch (error) {
      setFamilyBudgetStatus(error instanceof Error ? error.message : 'Could not save family budget categories.');
    }
  };

  const testSharePointConnection = async () => {
    setTestStatus('Testing SharePoint configuration…');
    try {
      const response = await fetch('/api/sharepoint/test');
      if (!response.ok) throw new Error(`Test failed with HTTP ${response.status}`);
      const result = await response.json();
      const missing = Array.isArray(result.missing) && result.missing.length ? ` Missing: ${result.missing.join(', ')}` : '';
      setTestStatus(`${result.message}${missing}`);
    } catch (error) {
      setTestStatus(error instanceof Error ? error.message : 'Test failed. Is the backend running?');
    }
  };

  const downloadBackup = async () => {
    setBackupStatus('Preparing backup zip…');
    try {
      const response = await fetch('/api/settings/backup');
      if (!response.ok) throw new Error(`Backup failed with HTTP ${response.status}`);
      const blob = await response.blob();
      const disposition = response.headers.get('Content-Disposition') || '';
      const filename = disposition.match(/filename="?([^";]+)"?/)?.[1] || `finances-data-${new Date().toISOString().slice(0, 10)}.zip`;
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setBackupStatus('Backup downloaded. Store it somewhere safe and separate from this computer.');
    } catch (error) {
      setBackupStatus(error instanceof Error ? error.message : 'Backup failed. Is the backend running?');
    }
  };

  const restoreBackup = async () => {
    if (!restoreFile) {
      setBackupStatus('Choose a .zip backup file first.');
      return;
    }
    const confirmed = window.confirm('Restore this backup zip? This will overwrite app data files with the contents of the backup. A safety backup is created first.');
    if (!confirmed) return;
    setBackupStatus('Restoring backup…');
    try {
      const formData = new FormData();
      formData.append('file', restoreFile);
      const response = await fetch('/api/settings/backup/restore', { method: 'POST', body: formData });
      if (!response.ok) throw new Error(`Restore failed with HTTP ${response.status}`);
      const result = await response.json();
      if (result.status === 'failed') throw new Error(result.message || 'Restore failed.');
      setRestoreFile(null);
      setBackupStatus(`${result.message} Safety backup: ${result.safety_backup || 'created'}`);
    } catch (error) {
      setBackupStatus(error instanceof Error ? error.message : 'Restore failed. Is the backend running?');
    }
  };

  if (section === 'ai-ocr') {
    return (
      <section className="settings-layout single-settings-page">
        <div className="card settings-card span-2">
          <div className="card-header"><div><p className="eyebrow">Extraction</p><h2>AI + OCR</h2></div></div>
          <div className="form-grid one-column">
            <label>AI provider<input value={settings.aiProvider} onChange={(e) => update({ aiProvider: e.target.value })} placeholder="OpenAI" /></label>
            <label>Model<input value={settings.aiModel} onChange={(e) => update({ aiModel: e.target.value })} placeholder="gpt-4o-mini" /></label>
            <label>Base URL<input value={settings.aiBaseUrl} onChange={(e) => update({ aiBaseUrl: e.target.value })} placeholder="https://api.openai.com/v1" /></label>
            <label>OpenAI API key<input type="password" value={aiApiKeyDraft} onChange={(e) => setAiApiKeyDraft(e.target.value)} placeholder="Stored server-side only" autoComplete="new-password" /></label>
          </div>
          <div className="button-row">
            <button className="primary-button" type="button" onClick={saveAiSettings}>Save AI settings</button>
            <span className="help-text inline-help">Default model is OpenAI <code>gpt-4o-mini</code>. API key is not stored in browser localStorage.</span>
          </div>
          {aiSaveStatus && <p className="help-text">{aiSaveStatus}</p>}

          <div className="field-definition-section">
            <div className="card-header compact-header">
              <div><p className="eyebrow">SharePoint fields</p><h2>AI extraction definitions</h2></div>
              <button className="secondary-button" type="button" onClick={loadAiFieldDefinitions}>Refresh fields</button>
            </div>
            <p className="help-text table-status">These definitions are included in the AI prompt when extracting receipt metadata.</p>
            <div className="field-definition-list">
              {aiFieldDefinitions.map((field) => (
                <label className="field-definition-row" key={field.name}>
                  <span><strong>{field.display_name}</strong><small>{field.name} · {field.field_type}{field.allow_multiple ? ' · multiple' : ''}{field.choices.length ? ` · choices: ${field.choices.join(', ')}` : ''}</small></span>
                  <textarea value={field.definition} rows={2} onChange={(event) => setAiFieldDefinitions((current) => current.map((item) => item.name === field.name ? { ...item, definition: event.target.value } : item))} />
                </label>
              ))}
              {!aiFieldDefinitions.length && <p className="help-text">No SharePoint fields loaded yet. Check SharePoint settings, then refresh fields.</p>}
            </div>
            <div className="button-row">
              <button className="primary-button" type="button" onClick={saveAiFieldDefinitions}>Save field definitions</button>
              {aiDefinitionsStatus && <span className="help-text inline-help">{aiDefinitionsStatus}</span>}
            </div>
            <label className="prompt-preview-label">Example AI prompt preview<textarea className="prompt-preview" value={aiPromptPreview} readOnly rows={14} /></label>
          </div>
        </div>
      </section>
    );
  }

  if (section === 'family-budget') {
    const addCategory = () => {
      const next = familyBudgetCategoryDraft.trim();
      if (!next) return;
      const categories = familyBudgetCategories.some((category) => category.toLowerCase() === next.toLowerCase()) ? familyBudgetCategories : [...familyBudgetCategories, next];
      setFamilyBudgetCategoryDraft('');
      setFamilyBudgetCategories(categories);
      void saveFamilyBudgetCategories(categories);
    };
    const removeCategory = (category: string) => {
      const categories = familyBudgetCategories.filter((item) => item !== category);
      setFamilyBudgetCategories(categories);
      void saveFamilyBudgetCategories(categories);
    };
    const renameCategory = (index: number, value: string) => setFamilyBudgetCategories((current) => current.map((category, categoryIndex) => categoryIndex === index ? value : category));

    return (
      <section className="settings-layout single-settings-page">
        <div className="card settings-card span-2">
          <div className="card-header"><div><p className="eyebrow">Family Budget</p><h2>Expense categories</h2></div></div>
          <p className="help-text">These choices appear in the Expense Schedule item form as the Category dropdown.</p>
          <div className="category-settings-list">
            {familyBudgetCategories.map((category, index) => (
              <div className="category-settings-row" key={`${category}-${index}`}>
                <input value={category} onChange={(event) => renameCategory(index, event.target.value)} onBlur={() => saveFamilyBudgetCategories()} />
                <button className="secondary-button danger-button" type="button" onClick={() => removeCategory(category)}>Delete</button>
              </div>
            ))}
            {!familyBudgetCategories.length && <p className="help-text">No categories yet. Add one below.</p>}
          </div>
          <div className="button-row">
            <input value={familyBudgetCategoryDraft} onChange={(event) => setFamilyBudgetCategoryDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') addCategory(); }} placeholder="New category" />
            <button className="primary-button" type="button" onClick={addCategory}>Add category</button>
            <button className="secondary-button" type="button" onClick={() => saveFamilyBudgetCategories()}>Save categories</button>
          </div>
          {familyBudgetStatus && <p className="help-text">{familyBudgetStatus}</p>}
        </div>
      </section>
    );
  }

  if (section === 'backup') {
    return (
      <section className="settings-layout single-settings-page">
        <div className="card settings-card span-2">
          <div className="card-header"><div><p className="eyebrow">Portability</p><h2>Backup & Restore</h2></div></div>
          <p className="help-text">Download a zip of the local app data, or restore one on this computer. Keep backups somewhere safe; they can contain sensitive financial information.</p>
          <div className="backup-actions-grid">
            <div className="backup-action-card">
              <Download size={22} />
              <div>
                <h3>Download data backup</h3>
                <p className="help-text">Exports SQLite databases and app JSON settings from the server data folder. Secrets in <code>.env</code> are not included.</p>
                <button className="primary-button" type="button" onClick={downloadBackup}>Download .zip backup</button>
              </div>
            </div>
            <div className="backup-action-card danger-zone-card">
              <Upload size={22} />
              <div>
                <h3>Restore from backup</h3>
                <p className="help-text">Restoring overwrites matching local data files. The backend creates a safety backup before extraction.</p>
                <input type="file" accept=".zip,application/zip" onChange={(event) => setRestoreFile(event.target.files?.[0] || null)} />
                {restoreFile && <p className="help-text">Selected: {restoreFile.name}</p>}
                <button className="secondary-button danger-button" type="button" onClick={restoreBackup}>Restore selected .zip</button>
              </div>
            </div>
          </div>
          {backupStatus && <p className="help-text">{backupStatus}</p>}
        </div>
      </section>
    );
  }

  if (section === 'bank') {
    return (
      <section className="settings-layout single-settings-page">
        <div className="card settings-card span-2">
          <div className="card-header"><div><p className="eyebrow">Future</p><h2>Bank Accounts</h2></div></div>
          <p>Bank feeds will live here later with provider, account mapping, and reconciliation rules.</p>
          <span className="status-chip">Not connected</span>
        </div>
      </section>
    );
  }

  return (
    <section className="settings-layout single-settings-page">
      <div className="card settings-card">
        <div className="card-header"><div><p className="eyebrow">Appearance</p><h2>Theme</h2></div></div>
        <div className="theme-toggle">
          {(['light', 'dark', 'system'] as Theme[]).map((theme) => (
            <button key={theme} className={settings.theme === theme ? 'selected' : ''} onClick={() => update({ theme })}>
              {theme === 'light' && <Sun size={16} />}{theme === 'dark' && <Moon size={16} />}{theme === 'system' && <Settings size={16} />}{theme}
            </button>
          ))}
        </div>
      </div>

      <div className="card settings-card span-2">
        <div className="card-header">
          <div><p className="eyebrow">Connectors</p><h2>SharePoint Invoice site + Documents library</h2></div>
          <span className="status-chip">Not connected</span>
        </div>
        <div className="form-grid">
          <label>Tenant domain<input value={settings.sharePointTenant} onChange={(e) => update({ sharePointTenant: e.target.value })} placeholder="contoso.onmicrosoft.com" /></label>
          <label>Tenant ID<input value={settings.sharePointTenantId} onChange={(e) => update({ sharePointTenantId: e.target.value })} placeholder="Azure Directory tenant ID" /></label>
          <label>App / client ID<input value={settings.sharePointClientId} onChange={(e) => update({ sharePointClientId: e.target.value })} placeholder="Azure app registration client ID" /></label>
          <label>Client secret<input type="password" value={clientSecretDraft} onChange={(e) => setClientSecretDraft(e.target.value)} placeholder="Stored server-side only" autoComplete="new-password" /></label>
          <label>Client secret expiry date<input type="date" value={settings.sharePointClientSecretExpiry} onChange={(e) => update({ sharePointClientSecretExpiry: e.target.value })} /></label>
          <label>Site URL<input value={settings.sharePointSite} onChange={(e) => update({ sharePointSite: e.target.value })} placeholder="https://tenant.sharepoint.com/sites/Invoice" /></label>
          <label>Site ID<input value={settings.sharePointSiteId} onChange={(e) => update({ sharePointSiteId: e.target.value })} placeholder="Optional once discovered via Graph" /></label>
          <label>Drive / library ID<input value={settings.sharePointDriveId} onChange={(e) => update({ sharePointDriveId: e.target.value })} placeholder="Optional once discovered via Graph" /></label>
          <label>Library name<input value={settings.sharePointLibrary} onChange={(e) => update({ sharePointLibrary: e.target.value })} placeholder="Documents" /></label>
          <label>Input folder<input value={settings.sharePointInputFolder} onChange={(e) => update({ sharePointInputFolder: e.target.value })} placeholder="Inbox" /></label>
          <label>Processed output folder<input value={settings.sharePointOutputFolder} onChange={(e) => update({ sharePointOutputFolder: e.target.value })} placeholder="Processed/FY2025-2026" /></label>
        </div>
        {secretExpiryWarning && <p className={secretExpiryWarning.kind === 'danger' ? 'alert-text danger' : 'alert-text'}>{secretExpiryWarning.message}</p>}
        <div className="button-row">
          <button className="primary-button" type="button" onClick={saveSharePointSettings}>Save SharePoint settings</button>
          <button className="secondary-button" type="button" onClick={testSharePointConnection}>Test SharePoint connection</button>
          <span className="help-text inline-help">Client secret saving writes to server-side `.env` only; it is not persisted in browser localStorage.</span>
        </div>
        {saveStatus && <p className="help-text">{saveStatus}</p>}
        {testStatus && <p className="help-text">{testStatus}</p>}
      </div>

      <div className="card settings-card span-2">
        <div className="card-header compact-header">
          <div><p className="eyebrow">SharePoint fields</p><h2>Receipts Inbox input form visibility</h2></div>
          <button className="secondary-button" type="button" onClick={loadSharePointFields}>Refresh fields</button>
        </div>
        <p className="help-text table-status">Unchecked fields are hidden from the editable form on Receipts Inbox. They remain visible on read-only processed receipt details.</p>
        <div className="sharepoint-field-list">
          {sharePointFields.map((field) => (
            <label className="sharepoint-field-row" key={field.name}>
              <input type="checkbox" checked={field.show_in_input_form} onChange={(event) => setSharePointFields((current) => current.map((item) => item.name === field.name ? { ...item, show_in_input_form: event.target.checked } : item))} />
              <span><strong>{field.display_name}</strong><small>{field.name} · {field.field_type}{field.allow_multiple ? ' · multiple' : ''}{field.choices.length ? ` · choices: ${field.choices.join(', ')}` : ''}</small></span>
            </label>
          ))}
          {!sharePointFields.length && <p className="help-text">No SharePoint fields loaded yet. Check SharePoint settings, then refresh fields.</p>}
        </div>
        <div className="button-row">
          <button className="primary-button" type="button" onClick={saveSharePointFields}>Save field visibility</button>
          {sharePointFieldsStatus && <span className="help-text inline-help">{sharePointFieldsStatus}</span>}
        </div>
      </div>
    </section>
  );
}

function getSecretExpiryWarning(expiryDate: string): { kind: 'warning' | 'danger'; message: string } | null {
  if (!expiryDate) return null;
  const expiry = new Date(`${expiryDate}T00:00:00`);
  if (Number.isNaN(expiry.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Math.ceil((expiry.getTime() - today.getTime()) / 86_400_000);
  if (days < 0) return { kind: 'danger', message: `Client secret expired ${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'} ago. Replace it before connecting SharePoint.` };
  if (days === 0) return { kind: 'danger', message: 'Client secret expires today. Replace it now to avoid SharePoint sync failure.' };
  if (days <= 30) return { kind: 'warning', message: `Client secret expires in ${days} day${days === 1 ? '' : 's'}. Notification threshold: 30 days.` };
  return null;
}

function ComingSoon({ title, icon }: { title: string; icon: React.ReactNode }) {
  return (
    <div className="empty-state">
      <div className="empty-icon">{icon}</div>
      <h2>{title}</h2>
      <p>This module is reserved in the dashboard. We’re starting with Tax Receipts first.</p>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
