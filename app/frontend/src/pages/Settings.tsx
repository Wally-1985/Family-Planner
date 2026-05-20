import React, { useEffect, useState } from 'react';
import { Download, Moon, Settings, Sun, Upload, ChevronUp, ChevronDown } from 'lucide-react';
import type {
  AiFieldDefinition, Page, SettingsState, SharePointFieldDefinition, SmtpSettingsState, UserProfile
} from '../types';
import { allPermissionPages, pageLabels, FAMILY_BUDGET_CATEGORIES_STORAGE_KEY } from '../types';

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

export function SettingsPage({
  section,
  settings,
  update,
  userProfiles = [],
  setUserProfiles,
  activeProfileId,
  setActiveProfileId
}: {
  section: 'general' | 'ai-ocr' | 'family-budget' | 'users' | 'bank';
  settings: SettingsState;
  update: (patch: Partial<SettingsState>) => void;
  userProfiles?: UserProfile[];
  setUserProfiles?: React.Dispatch<React.SetStateAction<UserProfile[]>>;
  activeProfileId?: string;
  setActiveProfileId?: (profileId: string) => void;
}) {
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
  const [userProfilesStatus, setUserProfilesStatus] = useState<string | null>(null);
  const [pinConfirmDrafts, setPinConfirmDrafts] = useState<Record<string, string>>({});
  const [visiblePins, setVisiblePins] = useState<Record<string, boolean>>({});
  const [smtpSettings, setSmtpSettings] = useState<SmtpSettingsState>({ host: '', port: 587, username: '', password_saved: false, from_email: '', use_tls: true });
  const [smtpPasswordDraft, setSmtpPasswordDraft] = useState('');
  const [smtpStatus, setSmtpStatus] = useState<string | null>(null);
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

  const loadSmtpSettings = async () => {
    setSmtpStatus('Loading SMTP settings…');
    try {
      const response = await fetch('/api/settings/smtp');
      if (!response.ok) throw new Error(`SMTP settings load failed with HTTP ${response.status}`);
      const result = await response.json();
      setSmtpSettings({ host: result.host || '', port: result.port || 587, username: result.username || '', password_saved: Boolean(result.password_saved), from_email: result.from_email || '', use_tls: result.use_tls !== false });
      setSmtpStatus('Loaded SMTP settings.');
    } catch (error) {
      setSmtpStatus(error instanceof Error ? error.message : 'Could not load SMTP settings.');
    }
  };

  useEffect(() => {
    if (section === 'sharepoint' || section === 'general') loadSharePointFields();
    if (section === 'ai-ocr') loadAiFieldDefinitions();
    if (section === 'family-budget') loadFamilyBudgetCategories();
    if (section === 'smtp' || section === 'general') loadSmtpSettings();
  }, [section]);

  const saveSharePointSettings = async () => {
    setSaveStatus('Saving SharePoint settings…');
    try {
      const response = await fetch('/api/settings/sharepoint', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenant_domain: settings.sharePointTenant, tenant_id: settings.sharePointTenantId, client_id: settings.sharePointClientId, client_secret: clientSecretDraft || null, client_secret_expires_on: settings.sharePointClientSecretExpiry || null, site_url: settings.sharePointSite, site_id: settings.sharePointSiteId, drive_id: settings.sharePointDriveId, library_name: settings.sharePointLibrary, input_folder: settings.sharePointInputFolder, output_folder: settings.sharePointOutputFolder })
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
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ show_in_input_form: Object.fromEntries(sharePointFields.map((f) => [f.name, f.show_in_input_form])) })
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
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: settings.aiProvider, model: settings.aiModel, base_url: settings.aiBaseUrl, api_key: aiApiKeyDraft || null })
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
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ definitions: Object.fromEntries(aiFieldDefinitions.map((f) => [f.name, f.definition])) })
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
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
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

  const saveSmtpSettings = async () => {
    setSmtpStatus('Saving SMTP settings…');
    try {
      const response = await fetch('/api/settings/smtp', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...smtpSettings, password: smtpPasswordDraft || null })
      });
      if (!response.ok) throw new Error(`SMTP settings save failed with HTTP ${response.status}`);
      const result = await response.json();
      if (result.status === 'failed') throw new Error(result.message || 'Could not save SMTP settings.');
      setSmtpPasswordDraft('');
      setSmtpSettings((c) => ({ ...c, password_saved: c.password_saved || Boolean(smtpPasswordDraft) }));
      setSmtpStatus(result.message || 'Saved SMTP settings.');
    } catch (error) {
      setSmtpStatus(error instanceof Error ? error.message : 'Could not save SMTP settings.');
    }
  };

  const saveUserProfiles = async (profiles = userProfiles) => {
    if (!setUserProfiles) return;
    const pinMismatch = profiles.find((p) => p.role === 'Administrator' && p.pin && pinConfirmDrafts[p.id] !== p.pin);
    if (pinMismatch) { setUserProfilesStatus(`Confirm the PIN for ${pinMismatch.name} before saving.`); return; }
    const missingEmail = profiles.find((p) => p.role === 'Administrator' && p.pin && !p.email.trim());
    if (missingEmail) { setUserProfilesStatus(`Add a reset email address for ${missingEmail.name} before saving a PIN.`); return; }
    setUserProfilesStatus('Saving user profiles…');
    try {
      const response = await fetch('/api/settings/user-profiles', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ profiles }) });
      if (!response.ok) throw new Error(`User profile save failed with HTTP ${response.status}`);
      const result = await response.json();
      if (result.status === 'failed') throw new Error(result.message || 'Could not save user profiles.');
      setUserProfiles(result.profiles || []);
      setUserProfilesStatus(result.message || 'Saved user profiles.');
    } catch (error) {
      setUserProfilesStatus(error instanceof Error ? error.message : 'Could not save user profiles.');
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
      link.href = url; link.download = filename;
      document.body.appendChild(link); link.click(); link.remove();
      URL.revokeObjectURL(url);
      setBackupStatus('Backup downloaded. Store it somewhere safe and separate from this computer.');
    } catch (error) {
      setBackupStatus(error instanceof Error ? error.message : 'Backup failed. Is the backend running?');
    }
  };

  const restoreBackup = async () => {
    if (!restoreFile) { setBackupStatus('Choose a .zip backup file first.'); return; }
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

  // ── section renders ────────────────────────────────────────────────────

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
            <div className="card-header compact-header"><div><p className="eyebrow">SharePoint fields</p><h2>AI extraction definitions</h2></div><button className="secondary-button" type="button" onClick={loadAiFieldDefinitions}>Refresh fields</button></div>
            <p className="help-text table-status">These definitions are included in the AI prompt when extracting receipt metadata.</p>
            <div className="field-definition-list">
              {aiFieldDefinitions.map((field) => (
                <label className="field-definition-row" key={field.name}>
                  <span><strong>{field.display_name}</strong><small>{field.name} · {field.field_type}{field.allow_multiple ? ' · multiple' : ''}{field.choices.length ? ` · choices: ${field.choices.join(', ')}` : ''}</small></span>
                  <textarea value={field.definition} rows={2} onChange={(e) => setAiFieldDefinitions((c) => c.map((i) => i.name === field.name ? { ...i, definition: e.target.value } : i))} />
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
      const categories = familyBudgetCategories.some((c) => c.toLowerCase() === next.toLowerCase()) ? familyBudgetCategories : [...familyBudgetCategories, next];
      setFamilyBudgetCategoryDraft('');
      setFamilyBudgetCategories(categories);
      void saveFamilyBudgetCategories(categories);
    };
    const removeCategory = (category: string) => {
      const categories = familyBudgetCategories.filter((i) => i !== category);
      setFamilyBudgetCategories(categories);
      void saveFamilyBudgetCategories(categories);
    };
    const renameCategory = (index: number, value: string) => setFamilyBudgetCategories((c) => c.map((cat, ci) => ci === index ? value : cat));
    return (
      <section className="settings-layout single-settings-page">
        <div className="card settings-card span-2">
          <div className="card-header"><div><p className="eyebrow">Family Budget</p><h2>Expense categories</h2></div></div>
          <p className="help-text">These choices appear in the Expense Schedule item form as the Category dropdown.</p>
          <div className="category-settings-list">
            {familyBudgetCategories.map((category, index) => (
              <div className="category-settings-row" key={`${category}-${index}`}>
                <input value={category} onChange={(e) => renameCategory(index, e.target.value)} onBlur={() => saveFamilyBudgetCategories()} />
                <button className="secondary-button danger-button" type="button" onClick={() => removeCategory(category)}>Delete</button>
              </div>
            ))}
            {!familyBudgetCategories.length && <p className="help-text">No categories yet. Add one below.</p>}
          </div>
          <div className="button-row">
            <input value={familyBudgetCategoryDraft} onChange={(e) => setFamilyBudgetCategoryDraft(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') addCategory(); }} placeholder="New category" />
            <button className="primary-button" type="button" onClick={addCategory}>Add category</button>
            <button className="secondary-button" type="button" onClick={() => saveFamilyBudgetCategories()}>Save categories</button>
          </div>
          {familyBudgetStatus && <p className="help-text">{familyBudgetStatus}</p>}
        </div>
      </section>
    );
  }

  if (section === 'users') {
    const updateProfile = (profileId: string, patch: Partial<UserProfile>) => {
      setUserProfiles?.((c) => c.map((p) => p.id === profileId ? { ...p, ...patch } : p));
    };

    const moveProfile = (idx: number, dir: -1 | 1) => {
      setUserProfiles?.((c) => {
        const next = [...c];
        const swapIdx = idx + dir;
        if (swapIdx < 0 || swapIdx >= next.length) return c;
        [next[idx], next[swapIdx]] = [next[swapIdx], next[idx]];
        return next;
      });
    };
    const togglePermission = (profileId: string, permission: Page) => {
      setUserProfiles?.((c) => c.map((p) => {
        if (p.id !== profileId) return p;
        const permissions = p.permissions.includes(permission) ? p.permissions.filter((i) => i !== permission) : [...p.permissions, permission];
        return { ...p, permissions };
      }));
    };
    const addProfile = () => {
      const id = `profile-${Date.now()}`;
      const nextProfiles = [...userProfiles, { id, name: 'New profile', role: 'User' as const, pin: '', email: '', permissions: ['dashboard'] as Page[] }];
      setUserProfiles?.(nextProfiles);
      void saveUserProfiles(nextProfiles);
    };
    const deleteProfile = (profileId: string) => {
      if (userProfiles.length <= 1) { setUserProfilesStatus('Keep at least one profile.'); return; }
      const nextProfiles = userProfiles.filter((p) => p.id !== profileId);
      setUserProfiles?.(nextProfiles);
      if (activeProfileId === profileId) setActiveProfileId?.(nextProfiles[0]?.id || 'owner');
      void saveUserProfiles(nextProfiles);
    };
    return (
      <section className="settings-layout single-settings-page">
        <div className="card settings-card span-2">
          <div className="card-header"><div><p className="eyebrow">Access control</p><h2>User Profiles</h2></div><button className="primary-button" type="button" onClick={addProfile}>Add profile</button></div>
          <p className="help-text">Choose which sidebar areas each profile can access. This is local app-level access control.</p>
          <div className="profiles-settings-list">
            {userProfiles.map((profile) => (
              <div className="profile-settings-card" key={profile.id}>
                <div className="form-grid">
                  <label>Name<input value={profile.name} onChange={(e) => updateProfile(profile.id, { name: e.target.value })} /></label>
                  <label>Role<select value={profile.role} onChange={(e) => updateProfile(profile.id, { role: e.target.value as UserProfile['role'], pin: e.target.value === 'Administrator' ? profile.pin : '', email: e.target.value === 'Administrator' ? profile.email : '' })}><option value="Administrator">Administrator</option><option value="User">User</option></select></label>
                  {profile.role === 'Administrator' && <label>PIN<div className="password-field"><input type={visiblePins[profile.id] ? 'text' : 'password'} inputMode="numeric" value={profile.pin || ''} onChange={(e) => updateProfile(profile.id, { pin: e.target.value })} placeholder="Optional, required at profile selection when set" /><button type="button" className="icon-field-button" onClick={() => setVisiblePins((c) => ({ ...c, [profile.id]: !c[profile.id] }))}>{visiblePins[profile.id] ? 'Hide' : 'Show'}</button></div></label>}
                  {profile.role === 'Administrator' && profile.pin && <label>Confirm PIN<div className="password-field"><input type={visiblePins[`${profile.id}-confirm`] ? 'text' : 'password'} inputMode="numeric" value={pinConfirmDrafts[profile.id] || ''} onChange={(e) => setPinConfirmDrafts((c) => ({ ...c, [profile.id]: e.target.value }))} placeholder="Re-enter PIN" /><button type="button" className="icon-field-button" onClick={() => setVisiblePins((c) => ({ ...c, [`${profile.id}-confirm`]: !c[`${profile.id}-confirm`] }))}>{visiblePins[`${profile.id}-confirm`] ? 'Hide' : 'Show'}</button></div></label>}
                  {profile.role === 'Administrator' && profile.pin && <label>Reset email<input type="email" value={profile.email || ''} onChange={(e) => updateProfile(profile.id, { email: e.target.value })} placeholder="Used for the Forgot your PIN link" /></label>}
                </div>
                <div className="permission-grid">
                  {allPermissionPages.map((permission) => (
                    <label key={permission} className="permission-check">
                      <input type="checkbox" checked={profile.permissions.includes(permission)} onChange={() => togglePermission(profile.id, permission)} />
                      <span>{pageLabels[permission]}</span>
                    </label>
                  ))}
                </div>
                <div className="button-row">
                  <button className="secondary-button icon-btn" type="button" onClick={() => moveProfile(userProfiles.indexOf(profile), -1)} disabled={userProfiles.indexOf(profile) === 0} aria-label="Move up"><ChevronUp size={15} /></button>
                  <button className="secondary-button icon-btn" type="button" onClick={() => moveProfile(userProfiles.indexOf(profile), 1)} disabled={userProfiles.indexOf(profile) === userProfiles.length - 1} aria-label="Move down"><ChevronDown size={15} /></button>
                  <button className="secondary-button" type="button" onClick={() => saveUserProfiles()}>Save profiles</button>
                  <button className="secondary-button danger-button" type="button" onClick={() => deleteProfile(profile.id)}>Delete profile</button>
                </div>
              </div>
            ))}
          </div>
          <div className="button-row">
            <button className="primary-button" type="button" onClick={() => saveUserProfiles()}>Save all profiles</button>
            {userProfilesStatus && <span className="help-text inline-help">{userProfilesStatus}</span>}
          </div>
        </div>
      </section>
    );
  }

  if (section === 'smtp') {
    return (
      <section className="settings-layout single-settings-page">
        <div className="card settings-card span-2">
          <div className="card-header"><div><p className="eyebrow">System email</p><h2>SMTP Email Settings</h2></div></div>
          <p className="help-text">Used by the system to send profile PIN reset links. SMTP passwords are stored server-side only.</p>
          <div className="form-grid">
            <label>SMTP host<input value={smtpSettings.host} onChange={(e) => setSmtpSettings((c) => ({ ...c, host: e.target.value }))} placeholder="smtp.gmail.com" /></label>
            <label>SMTP port<input type="number" value={smtpSettings.port} onChange={(e) => setSmtpSettings((c) => ({ ...c, port: Number(e.target.value || 587) }))} /></label>
            <label>Username<input value={smtpSettings.username} onChange={(e) => setSmtpSettings((c) => ({ ...c, username: e.target.value }))} placeholder="SMTP username" /></label>
            <label>Password<input type="password" value={smtpPasswordDraft} onChange={(e) => setSmtpPasswordDraft(e.target.value)} placeholder={smtpSettings.password_saved ? 'Saved server-side; enter to replace' : 'SMTP password'} autoComplete="new-password" /></label>
            <label>From email<input type="email" value={smtpSettings.from_email} onChange={(e) => setSmtpSettings((c) => ({ ...c, from_email: e.target.value }))} placeholder="planner@example.com" /></label>
            <label className="checkbox-line"><input type="checkbox" checked={smtpSettings.use_tls} onChange={(e) => setSmtpSettings((c) => ({ ...c, use_tls: e.target.checked }))} /> Use STARTTLS</label>
          </div>
          <div className="button-row">
            <button className="primary-button" type="button" onClick={saveSmtpSettings}>Save SMTP settings</button>
            {smtpStatus && <span className="help-text inline-help">{smtpStatus}</span>}
          </div>
        </div>
      </section>
    );
  }

  if (section === 'general') {
    const tzOptions = [
      'Australia/Brisbane', 'Australia/Sydney', 'Australia/Melbourne', 'Australia/Adelaide',
      'Australia/Perth', 'Australia/Darwin', 'Australia/Hobart',
      'Pacific/Auckland', 'Asia/Singapore', 'Asia/Tokyo', 'Europe/London',
      'Europe/Paris', 'America/New_York', 'America/Chicago', 'America/Denver',
      'America/Los_Angeles', 'UTC',
    ];
    return (
      <section className="settings-layout single-settings-page">
        <div className="card settings-card span-2">
          <div className="card-header"><div><p className="eyebrow">Appearance</p><h2>Theme</h2></div></div>
          <div className="theme-toggle">
            {(['light', 'dark', 'system'] as SettingsState['theme'][]).map((theme) => (
              <button key={theme} className={settings.theme === theme ? 'selected' : ''} onClick={() => update({ theme })}>
                {theme === 'light' && <Sun size={16} />}{theme === 'dark' && <Moon size={16} />}{theme === 'system' && <Settings size={16} />}{theme}
              </button>
            ))}
          </div>
        </div>
        <div className="card settings-card span-2">
          <div className="card-header"><div><p className="eyebrow">Regional</p><h2>Timezone</h2></div></div>
          <p className="help-text">Used for scheduling and date calculations.</p>
          <select value={settings.timezone} onChange={e => update({ timezone: e.target.value })} style={{ maxWidth: '24rem' }}>
            {tzOptions.map(tz => <option key={tz} value={tz}>{tz.replace('_', ' ')}</option>)}
          </select>
        </div>
        <div className="card settings-card span-2">
          <div className="card-header"><div><p className="eyebrow">Portability</p><h2>Backup & Restore</h2></div></div>
          <p className="help-text">Download a zip of all app data (tasks, roster, profiles, budgets, settings), or restore from a previous backup.</p>
          <div className="backup-actions-grid">
            <div className="backup-action-card">
              <Download size={22} />
              <div>
                <h3>Download full system backup</h3>
                <p className="help-text">Exports all databases (tasks, subtasks, roster, budgets, receipts), profile settings, and server config. Treat this zip as sensitive.</p>
                <button className="primary-button" type="button" onClick={downloadBackup}>Download full .zip backup</button>
              </div>
            </div>
            <div className="backup-action-card danger-zone-card">
              <Upload size={22} />
              <div>
                <h3>Restore from backup</h3>
                <p className="help-text">Restoring overwrites matching local data/config files. The backend creates a safety backup before extraction.</p>
                <input type="file" accept=".zip,application/zip" onChange={(e) => setRestoreFile(e.target.files?.[0] || null)} />
                {restoreFile && <p className="help-text">Selected: {restoreFile.name}</p>}
                <button className="secondary-button danger-button" type="button" onClick={restoreBackup}>Restore selected .zip</button>
              </div>
            </div>
          </div>
          {backupStatus && <p className="help-text">{backupStatus}</p>}
        </div>
        <div className="card settings-card span-2">
          <div className="card-header"><div><p className="eyebrow">Connectors</p><h2>SharePoint Library Settings</h2></div><span className="status-chip">Not connected</span></div>
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
            <span className="help-text inline-help">Client secret is stored server-side only; not persisted in browser localStorage.</span>
          </div>
          {saveStatus && <p className="help-text">{saveStatus}</p>}
          {testStatus && <p className="help-text">{testStatus}</p>}
        </div>
        <div className="card settings-card span-2">
          <div className="card-header"><div><p className="eyebrow">System email</p><h2>SMTP Email Settings</h2></div></div>
          <p className="help-text">Used by the system to send profile PIN reset links. SMTP passwords are stored server-side only.</p>
          <div className="form-grid">
            <label>SMTP host<input value={smtpSettings.host} onChange={(e) => setSmtpSettings((c) => ({ ...c, host: e.target.value }))} placeholder="smtp.gmail.com" /></label>
            <label>SMTP port<input type="number" value={smtpSettings.port} onChange={(e) => setSmtpSettings((c) => ({ ...c, port: Number(e.target.value || 587) }))} /></label>
            <label>Username<input value={smtpSettings.username} onChange={(e) => setSmtpSettings((c) => ({ ...c, username: e.target.value }))} placeholder="SMTP username" /></label>
            <label>Password<input type="password" value={smtpPasswordDraft} onChange={(e) => setSmtpPasswordDraft(e.target.value)} placeholder={smtpSettings.password_saved ? 'Saved server-side; enter to replace' : 'SMTP password'} autoComplete="new-password" /></label>
            <label>From email<input type="email" value={smtpSettings.from_email} onChange={(e) => setSmtpSettings((c) => ({ ...c, from_email: e.target.value }))} placeholder="planner@example.com" /></label>
            <label className="checkbox-line"><input type="checkbox" checked={smtpSettings.use_tls} onChange={(e) => setSmtpSettings((c) => ({ ...c, use_tls: e.target.checked }))} /> Use STARTTLS</label>
          </div>
          <div className="button-row">
            <button className="primary-button" type="button" onClick={saveSmtpSettings}>Save SMTP settings</button>
            {smtpStatus && <span className="help-text inline-help">{smtpStatus}</span>}
          </div>
        </div>
      </section>
    );
  }

  if (section === 'backup') {
    return (
      <section className="settings-layout single-settings-page">
        <div className="card settings-card span-2">
          <div className="card-header"><div><p className="eyebrow">Portability</p><h2>Backup & Restore</h2></div></div>
          <p className="help-text">Download a zip of the local app data, or restore one on this computer.</p>
          <div className="backup-actions-grid">
            <div className="backup-action-card">
              <Download size={22} />
              <div>
                <h3>Download full system backup</h3>
                <p className="help-text">Exports local databases, app JSON settings, profile settings, and server <code>.env</code> config. Treat this zip as sensitive.</p>
                <button className="primary-button" type="button" onClick={downloadBackup}>Download full .zip backup</button>
              </div>
            </div>
            <div className="backup-action-card danger-zone-card">
              <Upload size={22} />
              <div>
                <h3>Restore from backup</h3>
                <p className="help-text">Restoring overwrites matching local data/config files. The backend creates a safety backup before extraction.</p>
                <input type="file" accept=".zip,application/zip" onChange={(e) => setRestoreFile(e.target.files?.[0] || null)} />
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

  // default: sharepoint
  return (
    <section className="settings-layout single-settings-page">
      <div className="card settings-card span-2">
        <div className="card-header"><div><p className="eyebrow">Connectors</p><h2>SharePoint Invoice site + Documents library</h2></div><span className="status-chip">Not connected</span></div>
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
        <div className="card-header compact-header"><div><p className="eyebrow">SharePoint fields</p><h2>Receipts Inbox input form visibility</h2></div><button className="secondary-button" type="button" onClick={loadSharePointFields}>Refresh fields</button></div>
        <p className="help-text table-status">Unchecked fields are hidden from the editable form on Receipts Inbox.</p>
        <div className="sharepoint-field-list">
          {sharePointFields.map((field) => (
            <label className="sharepoint-field-row" key={field.name}>
              <input type="checkbox" checked={field.show_in_input_form} onChange={(e) => setSharePointFields((c) => c.map((i) => i.name === field.name ? { ...i, show_in_input_form: e.target.checked } : i))} />
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
