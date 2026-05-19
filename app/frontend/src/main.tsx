import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  BriefcaseBusiness,
  Building2,
  ClipboardList,
  Cloud,
  Home,
  Landmark,
  PanelLeftClose,
  PanelLeftOpen,
  ReceiptText,
  Settings,
  ShieldCheck
} from 'lucide-react';
import './styles.css';

import {
  Page, UserProfile, SettingsState,
  pageLabels, allPermissionPages, defaultUserProfiles, defaultSettings,
  firstAllowedPage, canAccessPage
} from './types';
import { Dashboard } from './pages/Dashboard';
import { TaxReceipts, ProcessedReceipts } from './pages/TaxReceipts';
import { FamilyBudget, FamilyBudgetDashboard, ActualCostsPage } from './pages/FamilyBudget';
import { ChoresPage } from './pages/Chores';
import { SettingsPage } from './pages/Settings';
import { ComingSoon } from './components/ComingSoon';

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
  const [userProfiles, setUserProfiles] = useState<UserProfile[]>(defaultUserProfiles);
  const [activeProfileId, setActiveProfileId] = useState('');
  const [pendingProfile, setPendingProfile] = useState<UserProfile | null>(null);
  const [profilePin, setProfilePin] = useState('');
  const [profileSelectError, setProfileSelectError] = useState<string | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(280);
  const activeProfile = userProfiles.find((p) => p.id === activeProfileId) || userProfiles[0];

  const navigateToPage = (nextPage: Page) => {
    if (canAccessPage(activeProfile, nextPage)) setPage(nextPage);
  };

  const chooseProfile = (profile: UserProfile) => {
    setProfileSelectError(null);
    if (profile.role === 'Administrator' && profile.pin) {
      setPendingProfile(profile);
      setProfilePin('');
      return;
    }
    setActiveProfileId(profile.id);
    setPage(firstAllowedPage(profile));
  };

  const unlockPendingProfile = () => {
    if (!pendingProfile) return;
    if (profilePin !== pendingProfile.pin) { setProfileSelectError('Incorrect PIN.'); return; }
    setActiveProfileId(pendingProfile.id);
    setPage(firstAllowedPage(pendingProfile));
    setPendingProfile(null);
    setProfilePin('');
  };

  const sendForgotPinEmail = async (profile: UserProfile) => {
    setProfileSelectError('Sending PIN reset email…');
    try {
      const response = await fetch('/api/settings/user-profiles/forgot-pin', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profile_id: profile.id, app_url: window.location.origin })
      });
      if (!response.ok) throw new Error(`Reset email failed with HTTP ${response.status}`);
      const result = await response.json();
      if (result.status === 'failed') throw new Error(result.message || 'Could not send reset email.');
      setProfileSelectError(result.message || 'PIN reset email sent.');
    } catch (error) {
      setProfileSelectError(error instanceof Error ? error.message : 'Could not send reset email. Check SMTP settings.');
    }
  };

  const signOutProfile = () => {
    setActiveProfileId('');
    setPendingProfile(null);
    setProfilePin('');
    setProfileSelectError(null);
  };

  const startSidebarResize = (event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = sidebarWidth;
    const onPointerMove = (me: PointerEvent) => {
      const nextWidth = Math.min(420, Math.max(220, startWidth + me.clientX - startX));
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
    if (settings.theme === 'system') return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    return settings.theme;
  }, [settings.theme]);

  useEffect(() => {
    document.documentElement.dataset.theme = effectiveTheme;
    localStorage.setItem('finances.settings', JSON.stringify(settings));
  }, [settings, effectiveTheme]);

  useEffect(() => {
    const loadProfiles = async () => {
      try {
        const response = await fetch('/api/settings/user-profiles');
        if (!response.ok) throw new Error('Could not load user profiles.');
        const result = await response.json();
        if (result.status === 'failed') throw new Error(result.message || 'Could not load user profiles.');
        if (Array.isArray(result.profiles) && result.profiles.length) {
          setUserProfiles(result.profiles.map((p: UserProfile) => ({ ...p, pin: p.pin || '', email: p.email || '', role: p.role === 'Administrator' ? 'Administrator' : 'User' })));
        }
      } catch { setUserProfiles(defaultUserProfiles); }
    };
    void loadProfiles();
  }, []);

  useEffect(() => {
    if (!activeProfileId || !activeProfile) return;
    if (!canAccessPage(activeProfile, page)) setPage(firstAllowedPage(activeProfile));
  }, [activeProfile, activeProfileId, page]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const resetProfileId = params.get('reset_profile');
    const resetToken = params.get('reset_token');
    if (!resetProfileId || !resetToken) return;
    const verify = async () => {
      try {
        const response = await fetch('/api/settings/user-profiles/verify-reset', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ profile_id: resetProfileId, token: resetToken })
        });
        const result = await response.json();
        if (!response.ok || result.status === 'failed') throw new Error(result.message || 'Reset link failed.');
        const profile = userProfiles.find((p) => p.id === resetProfileId);
        if (profile) {
          setActiveProfileId(profile.id);
          setPage('settings-users');
          setProfileSelectError(null);
          window.history.replaceState({}, document.title, window.location.pathname);
        }
      } catch (error) {
        setProfileSelectError(error instanceof Error ? error.message : 'Reset link failed.');
      }
    };
    void verify();
  }, [userProfiles]);

  const updateSettings = (patch: Partial<SettingsState>) => setSettings((c) => ({ ...c, ...patch }));

  if (!activeProfileId) {
    return (
      <ProfileSelectScreen
        profiles={userProfiles}
        pendingProfile={pendingProfile}
        pin={profilePin}
        error={profileSelectError}
        onChoose={chooseProfile}
        onPinChange={setProfilePin}
        onUnlock={unlockPendingProfile}
        onForgotPin={sendForgotPinEmail}
        onCancel={() => { setPendingProfile(null); setProfilePin(''); setProfileSelectError(null); }}
      />
    );
  }

  return (
    <div className={sidebarCollapsed ? 'app-shell sidebar-collapsed' : 'app-shell'} style={{ '--sidebar-width': `${sidebarWidth}px` } as React.CSSProperties}>
      <Sidebar current={page} onNavigate={navigateToPage} collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed((v) => !v)} onResizeStart={startSidebarResize} activeProfile={activeProfile} />
      <main className="main-panel">
        <TopBar page={page} sidebarCollapsed={sidebarCollapsed} onToggleSidebar={() => setSidebarCollapsed((v) => !v)} activeProfile={activeProfile} onSignOut={signOutProfile} />
        {page === 'dashboard' && <Dashboard onNavigate={setPage} />}
        {page === 'receipts-inbox' && <TaxReceipts />}
        {page === 'processed-receipts' && <ProcessedReceipts />}
        {page === 'family-dashboard' && <FamilyBudgetDashboard />}
        {page === 'family-projections' && <FamilyBudget />}
        {page === 'family-actuals' && <ActualCostsPage />}
        {page === 'chores' && <ChoresPage activeProfile={activeProfile} />}
        {page === 'business' && <ComingSoon title="Business budgets" icon={<BriefcaseBusiness />} />}
        {page === 'settings-sharepoint' && <SettingsPage section="sharepoint" settings={settings} update={updateSettings} />}
        {page === 'settings-ai-ocr' && <SettingsPage section="ai-ocr" settings={settings} update={updateSettings} />}
        {page === 'settings-family-budget' && <SettingsPage section="family-budget" settings={settings} update={updateSettings} />}
        {page === 'settings-users' && <SettingsPage section="users" settings={settings} update={updateSettings} userProfiles={userProfiles} setUserProfiles={setUserProfiles} activeProfileId={activeProfileId} setActiveProfileId={setActiveProfileId} />}
        {page === 'settings-smtp' && <SettingsPage section="smtp" settings={settings} update={updateSettings} />}
        {page === 'settings-backup' && <SettingsPage section="backup" settings={settings} update={updateSettings} />}
        {page === 'settings-bank' && <SettingsPage section="bank" settings={settings} update={updateSettings} />}
      </main>
    </div>
  );
}

function ProfileSelectScreen({
  profiles, pendingProfile, pin, error, onChoose, onPinChange, onUnlock, onForgotPin, onCancel
}: {
  profiles: UserProfile[];
  pendingProfile: UserProfile | null;
  pin: string;
  error: string | null;
  onChoose: (profile: UserProfile) => void;
  onPinChange: (pin: string) => void;
  onUnlock: () => void;
  onForgotPin: (profile: UserProfile) => void;
  onCancel: () => void;
}) {
  return (
    <main className="profile-select-screen">
      <section className="profile-select-panel">
        <p className="eyebrow">Family Planner</p>
        <h1>Who's using the app?</h1>
        <p className="help-text">Choose a profile to continue. Administrator profiles may require a PIN.</p>
        <div className="profile-tile-grid">
          {profiles.map((profile) => (
            <button className="profile-tile" type="button" key={profile.id} onClick={() => onChoose(profile)}>
              <span className="profile-avatar">{profile.name.slice(0, 1).toUpperCase()}</span>
              <strong>{profile.name}</strong>
              <small>{profile.role}{profile.role === 'Administrator' && profile.pin ? ' · PIN required' : ''}</small>
            </button>
          ))}
        </div>
        {pendingProfile && (
          <div className="profile-pin-card">
            <h2>{pendingProfile.name} PIN</h2>
            <p className="help-text">Enter the Administrator PIN to continue.</p>
            <input type="password" inputMode="numeric" autoFocus value={pin} onChange={(e) => onPinChange(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') onUnlock(); }} placeholder="PIN" />
            {pendingProfile.email && <button className="forgot-pin-link" type="button" onClick={() => onForgotPin(pendingProfile)}>Forgot your PIN?</button>}
            <div className="button-row">
              <button className="primary-button" type="button" onClick={onUnlock}>Unlock</button>
              <button className="secondary-button" type="button" onClick={onCancel}>Cancel</button>
            </div>
          </div>
        )}
        {error && <p className="help-text profile-error">{error}</p>}
      </section>
    </main>
  );
}

function Sidebar({
  current, onNavigate, collapsed, onToggle, onResizeStart, activeProfile
}: {
  current: Page;
  onNavigate: (page: Page) => void;
  collapsed: boolean;
  onToggle: () => void;
  onResizeStart: (event: React.PointerEvent<HTMLDivElement>) => void;
  activeProfile?: UserProfile;
}) {
  const allowed = (page: Page) => canAccessPage(activeProfile, page);
  const taxActive = current === 'receipts-inbox' || current === 'processed-receipts';
  const familyActive = current === 'family-dashboard' || current === 'family-projections' || current === 'family-actuals';
  const settingsActive = current === 'settings-sharepoint' || current === 'settings-ai-ocr' || current === 'settings-family-budget' || current === 'settings-users' || current === 'settings-smtp' || current === 'settings-backup' || current === 'settings-bank';
  const firstTaxPage = (['receipts-inbox', 'processed-receipts'] as Page[]).find(allowed);
  const firstFamilyPage = (['family-dashboard', 'family-projections', 'family-actuals'] as Page[]).find(allowed);
  const settingsPages: Page[] = ['settings-sharepoint', 'settings-ai-ocr', 'settings-family-budget', 'settings-users', 'settings-smtp', 'settings-backup', 'settings-bank'];
  const firstSettingsPage = settingsPages.find(allowed);

  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-copy"><strong>Finances</strong></div>
        <button className="sidebar-toggle" onClick={onToggle} aria-label={collapsed ? 'Open sidebar' : 'Collapse sidebar'}>
          {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
        </button>
      </div>
      <nav>
        {allowed('dashboard') && (
          <button className={current === 'dashboard' ? 'active nav-item' : 'nav-item'} onClick={() => onNavigate('dashboard')} title={collapsed ? 'Dashboard' : undefined}>
            <Home size={18} /><span>Dashboard</span>
          </button>
        )}
        {(allowed('receipts-inbox') || allowed('processed-receipts')) && (
          <div className={taxActive ? 'nav-group active' : 'nav-group'}>
            <button className={taxActive ? 'active nav-item' : 'nav-item'} onClick={() => firstTaxPage && onNavigate(firstTaxPage)} title={collapsed ? 'Tax Receipts' : undefined}>
              <ReceiptText size={18} /><span>Tax Receipts</span>
            </button>
            {!collapsed && (
              <div className="nav-subitems">
                {allowed('receipts-inbox') && <button className={current === 'receipts-inbox' ? 'active nav-subitem' : 'nav-subitem'} onClick={() => onNavigate('receipts-inbox')}>Receipts Inbox</button>}
                {allowed('processed-receipts') && <button className={current === 'processed-receipts' ? 'active nav-subitem' : 'nav-subitem'} onClick={() => onNavigate('processed-receipts')}>Processed Receipts</button>}
              </div>
            )}
          </div>
        )}
        {(allowed('family-dashboard') || allowed('family-projections') || allowed('family-actuals')) && (
          <div className={familyActive ? 'nav-group active' : 'nav-group'}>
            <button className={familyActive ? 'active nav-item' : 'nav-item'} onClick={() => firstFamilyPage && onNavigate(firstFamilyPage)} title={collapsed ? 'Family Budget' : undefined}>
              <Landmark size={18} /><span>Family Budget</span>
            </button>
            {!collapsed && (
              <div className="nav-subitems">
                {allowed('family-projections') && <button className={current === 'family-projections' ? 'active nav-subitem' : 'nav-subitem'} onClick={() => onNavigate('family-projections')}>Projections</button>}
                {allowed('family-actuals') && <button className={current === 'family-actuals' ? 'active nav-subitem' : 'nav-subitem'} onClick={() => onNavigate('family-actuals')}>Actual Costs</button>}
              </div>
            )}
          </div>
        )}
        {allowed('chores') && (
          <button className={current === 'chores' ? 'active nav-item' : 'nav-item'} onClick={() => onNavigate('chores')} title={collapsed ? 'Chores' : undefined}>
            <ClipboardList size={18} /><span>Chores</span>
          </button>
        )}
        {allowed('business') && (
          <button className={current === 'business' ? 'active nav-item' : 'nav-item'} onClick={() => onNavigate('business')} title={collapsed ? 'Business budgets' : undefined}>
            <Building2 size={18} /><span>Business budgets</span>
          </button>
        )}
        {firstSettingsPage && (
          <div className={settingsActive ? 'nav-group active' : 'nav-group'}>
            <button className={settingsActive ? 'active nav-item' : 'nav-item'} onClick={() => onNavigate(firstSettingsPage)} title={collapsed ? 'Settings' : undefined}>
              <Settings size={18} /><span>Settings</span>
            </button>
            {!collapsed && (
              <div className="nav-subitems">
                {allowed('settings-sharepoint') && <button className={current === 'settings-sharepoint' ? 'active nav-subitem' : 'nav-subitem'} onClick={() => onNavigate('settings-sharepoint')}>SharePoint Library Settings</button>}
                {allowed('settings-ai-ocr') && <button className={current === 'settings-ai-ocr' ? 'active nav-subitem' : 'nav-subitem'} onClick={() => onNavigate('settings-ai-ocr')}>AI + OCR</button>}
                {allowed('settings-family-budget') && <button className={current === 'settings-family-budget' ? 'active nav-subitem' : 'nav-subitem'} onClick={() => onNavigate('settings-family-budget')}>Family Budget</button>}
                {allowed('settings-users') && <button className={current === 'settings-users' ? 'active nav-subitem' : 'nav-subitem'} onClick={() => onNavigate('settings-users')}>User Profiles</button>}
                {allowed('settings-smtp') && <button className={current === 'settings-smtp' ? 'active nav-subitem' : 'nav-subitem'} onClick={() => onNavigate('settings-smtp')}>SMTP Email</button>}
                {allowed('settings-backup') && <button className={current === 'settings-backup' ? 'active nav-subitem' : 'nav-subitem'} onClick={() => onNavigate('settings-backup')}>Backup & Restore</button>}
                {allowed('settings-bank') && <button className={current === 'settings-bank' ? 'active nav-subitem' : 'nav-subitem'} onClick={() => onNavigate('settings-bank')}>Bank Accounts</button>}
              </div>
            )}
          </div>
        )}
      </nav>
      <div className="sidebar-note">
        <ShieldCheck size={18} />
        <span>Local-first. Review before SharePoint writes.</span>
      </div>
      {!collapsed && <div className="sidebar-resizer" onPointerDown={onResizeStart} aria-label="Resize sidebar" />}
    </aside>
  );
}

function TopBar({
  page, sidebarCollapsed, onToggleSidebar, activeProfile, onSignOut
}: {
  page: Page;
  sidebarCollapsed: boolean;
  onToggleSidebar: () => void;
  activeProfile?: UserProfile;
  onSignOut: () => void;
}) {
  return (
    <header className="topbar">
      <div className="topbar-title">
        <button className="topbar-sidebar-toggle" onClick={onToggleSidebar} aria-label={sidebarCollapsed ? 'Open sidebar' : 'Collapse sidebar'}>
          {sidebarCollapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
        </button>
        <div>
          <p className="eyebrow">Local development workspace</p>
          <h1>{pageLabels[page]}</h1>
        </div>
      </div>
      <div className="topbar-actions">
        {activeProfile && <span className="status-chip">{activeProfile.name} · {activeProfile.role}</span>}
        <button className="secondary-button" type="button" onClick={onSignOut}>Switch profile</button>
        <span className="status-chip ready"><Cloud size={14} /> Local-first</span>
      </div>
    </header>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
