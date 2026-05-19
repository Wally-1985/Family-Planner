import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft, CheckCircle2, Cloud, FileScan, RefreshCw, Save, Search, Sparkles
} from 'lucide-react';
import type {
  SharePointInputFile, SharePointFieldDefinition, SharePointFileDetail,
  ReceiptDraft, SortKey, SortDirection
} from '../types';
import { MetricCard } from './Dashboard';

// ── helpers ────────────────────────────────────────────────────────────────

export function initialFieldDraftValue(field: SharePointFieldDefinition): unknown {
  if (field.value == null) return field.field_type === 'boolean' ? false : '';
  if (field.field_type === 'dateTime') return toDateTimeLocal(field.value);
  if (field.field_type === 'boolean') return Boolean(field.value);
  if (field.allow_multiple && Array.isArray(field.value)) return field.value.map(String);
  return String(field.value);
}

export function changedFieldValues(
  current: Record<string, unknown>,
  original: Record<string, unknown>
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(current).filter(
      ([key, value]) => JSON.stringify(value ?? '') !== JSON.stringify(original[key] ?? '')
    )
  );
}

function toDateTimeLocal(value: unknown): string {
  if (!value) return '';
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return String(value);
  const offsetMs = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

export function formatFieldValue(value: unknown): string {
  if (value == null || value === '') return '—';
  if (Array.isArray(value)) return value.length ? value.map(String).join(', ') : '—';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  return String(value);
}

export function formatBytes(bytes: number): string {
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

export function formatDateTime(value: string): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('en-AU', { dateStyle: 'short', timeStyle: 'short' });
}

// ── SortableTh ─────────────────────────────────────────────────────────────

export function SortableTh({
  label, sortKey, activeKey, direction, onSort
}: {
  label: string;
  sortKey: SortKey;
  activeKey: SortKey;
  direction: SortDirection;
  onSort: (key: SortKey) => void;
}) {
  const marker = activeKey === sortKey ? (direction === 'asc' ? ' ↑' : ' ↓') : '';
  return (
    <th>
      <button className="sort-button" type="button" onClick={() => onSort(sortKey)}>
        {label}{marker}
      </button>
    </th>
  );
}

// ── SharePointFieldInput ───────────────────────────────────────────────────

export function SharePointFieldInput({
  field, value, onChange, onClear
}: {
  field: SharePointFieldDefinition;
  value: unknown;
  onChange: (value: unknown) => void;
  onClear: () => void;
}) {
  const label = `${field.display_name}${field.required ? ' *' : ''}`;
  const inputId = `field-${field.name}`;
  const common = { id: inputId, disabled: field.read_only, required: field.required };

  let control: React.ReactNode;
  if (field.field_type === 'choice' && field.choices?.length) {
    if (field.allow_multiple) {
      const selected = Array.isArray(value) ? value.map(String) : String(value || '').split(';').filter(Boolean);
      control = (
        <select {...common} multiple value={selected}
          onChange={(e) => onChange(Array.from(e.target.selectedOptions).map((o) => o.value))}>
          {field.choices.map((choice) => <option key={choice} value={choice}>{choice}</option>)}
        </select>
      );
    } else {
      control = (
        <select {...common} value={String(value ?? '')} onChange={(e) => onChange(e.target.value)}>
          <option value="">Select…</option>
          {field.choices.map((choice) => <option key={choice} value={choice}>{choice}</option>)}
          {field.allow_text_entry && value && !field.choices.includes(String(value)) && (
            <option value={String(value)}>{String(value)}</option>
          )}
        </select>
      );
    }
  } else if (field.field_type === 'boolean') {
    control = (
      <div className="checkbox-field">
        <input {...common} type="checkbox" checked={Boolean(value)} onChange={(e) => onChange(e.target.checked)} />
        <span>Yes</span>
      </div>
    );
  } else if (field.field_type === 'dateTime') {
    control = (
      <input {...common} type="datetime-local" value={toDateTimeLocal(value)} onChange={(e) => onChange(e.target.value)} />
    );
  } else if (field.field_type === 'number' || field.field_type === 'currency') {
    control = (
      <input {...common} type="number" value={String(value ?? '')}
        min={field.min_value ?? undefined} max={field.max_value ?? undefined}
        step={field.field_type === 'currency' ? '0.01' : 'any'}
        onChange={(e) => onChange(e.target.value)} />
    );
  } else {
    control = (
      <input {...common} type="text" value={String(value ?? '')}
        maxLength={field.max_length ?? undefined} onChange={(e) => onChange(e.target.value)} />
    );
  }

  return (
    <label htmlFor={inputId}>
      {label}
      <div className="field-control-row">
        {control}
        <button className="clear-field-button" type="button" onClick={onClear}
          title={`Clear ${field.display_name}`} aria-label={`Clear ${field.display_name}`}>×</button>
      </div>
      {field.description && <span className="field-description">{field.description}</span>}
    </label>
  );
}

// ── TaxReceipts ─────────────────────────────────────────────────────────────

export function TaxReceipts() {
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
    const pdfFiles = inboxFiles.filter((f) => f.item_type === 'file' && f.name.toLowerCase().endsWith('.pdf'));
    if (!pdfFiles.length) return;
    let prepared = 0;
    for (const file of pdfFiles) {
      if (autoPreparingIds.current.has(file.id)) continue;
      autoPreparingIds.current.add(file.id);
      setListStatus(`Preparing OCR + AI suggestions ${prepared + 1}/${pdfFiles.length}: ${file.name}`);
      try {
        await fetch(`/api/tax-receipts/${encodeURIComponent(file.id)}/prepare`, { method: 'POST' });
      } catch {
        // keep going
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
    return [...files].sort((l, r) => {
      if (sortKey === 'size') return ((l.size as number) - (r.size as number)) * direction;
      if (sortKey === 'last_modified') return (new Date(l.last_modified).getTime() - new Date(r.last_modified).getTime()) * direction;
      return String(l[sortKey] || '').localeCompare(String(r[sortKey] || '')) * direction;
    });
  }, [files, sortDirection, sortKey]);

  const changeSort = (key: SortKey) => {
    if (sortKey === key) setSortDirection((c) => c === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDirection(key === 'last_modified' || key === 'size' ? 'desc' : 'asc'); }
  };

  const selectedIndex = selectedId ? sortedFiles.findIndex((f) => f.id === selectedId) : -1;
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
      const draftValues = Object.fromEntries((result.fields || []).map((f) => [f.name, initialFieldDraftValue(f)]));
      setDetail(result);
      setFieldDraft(draftValues);
      setFieldOriginal(draftValues);
      setDetailStatus(result.message);
      const loadedDraft = await loadDraft(file.id);
      if (loadedDraft?.suggestions && Object.keys(loadedDraft.suggestions).length) {
        setFieldDraft((c) => ({ ...c, ...loadedDraft.suggestions }));
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
      if (nextDraft?.suggestions) setFieldDraft((c) => ({ ...c, ...nextDraft.suggestions }));
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
          method: 'PUT', body: formData
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
        if (nextToOpen) { await openFile(nextToOpen); setActionStatus(result.message); }
        else { setSelectedId(null); setDetail(null); }
      } else if (detail) {
        const savedMessage = result.message;
        await openFile(detail.file);
        setActionStatus(savedMessage);
      }
    } catch (error) {
      setActionStatus(error instanceof Error ? error.message : 'SharePoint action failed.');
    }
  };

  useEffect(() => { loadInputFiles(); }, []);

  if (selectedId) {
    return (
      <section className="page-stack">
        <div className="viewer-nav-row">
          <button className="secondary-button back-button" type="button"
            onClick={() => { setSelectedId(null); setDetail(null); setActionStatus(null); }}>
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
              <div><p className="eyebrow">File preview</p><h2>{detail?.file.name || 'Loading file…'}</h2></div>
              {detail?.file.web_url && <a className="secondary-button" href={detail.file.web_url} target="_blank" rel="noreferrer">Open in SharePoint</a>}
            </div>
            <iframe className="file-preview" src={`/api/sharepoint/input-files/${encodeURIComponent(selectedId)}/content`} title={detail?.file.name || 'SharePoint file preview'} />
            <div className="ocr-results-panel">
              <div className="card-header compact-header">
                <div><p className="eyebrow">OCR results</p><h2>Extracted text</h2></div>
                <div className="ocr-header-actions">
                  <span className="status-chip">{draft?.status || 'Not run'}</span>
                  <button className="secondary-button" type="button" onClick={() => selectedId && runOcrForItem(selectedId)} disabled={!selectedId || isExtracting}>
                    <RefreshCw size={16} /> {isExtracting ? 'Rescanning…' : 'Rescan OCR'}
                  </button>
                </div>
              </div>
              {draft?.ocr_text
                ? <pre className="ocr-text">{draft.ocr_text}</pre>
                : <p className="help-text">No OCR text yet. OCR runs automatically when this viewer opens.</p>}
              {draft?.message && <p className="help-text">{draft.message}</p>}
            </div>
            <div className="markup-upload">
              <label>
                Marked-up PDF replacement
                <input type="file" accept="application/pdf,.pdf" onChange={(e) => setMarkedUpPdf(e.target.files?.[0] || null)} />
              </label>
              <p className="help-text">Attach an annotated PDF to upload it before saving metadata.</p>
              {markedUpPdf && <span className="status-chip">Ready to save: {markedUpPdf.name}</span>}
            </div>
          </div>
          <div className="card metadata-card">
            <div className="card-header">
              <div><p className="eyebrow">SharePoint metadata</p><h2>Review custom fields</h2></div>
              <button className="secondary-button" type="button" onClick={getAiSuggestions} disabled={!detail || isExtracting}>
                <Sparkles size={17} /> {isExtracting ? 'Working…' : 'Get AI Suggestions'}
              </button>
            </div>
            {detailStatus && <p className="help-text table-status">{detailStatus}</p>}
            <div className="metadata-form">
              {([...(detail?.fields || [])].filter((f) => f.show_in_input_form !== false).sort((l, r) => l.order - r.order)).map((field) => (
                <SharePointFieldInput key={field.name} field={field} value={fieldDraft[field.name]}
                  onChange={(v) => setFieldDraft((c) => ({ ...c, [field.name]: v }))}
                  onClear={() => setFieldDraft((c) => ({ ...c, [field.name]: field.field_type === 'boolean' ? false : '' }))} />
              ))}
              {detail && !detail.fields.length && <p className="help-text">No editable custom fields found.</p>}
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
                {!!Object.keys(draft.suggestions || {}).length && (
                  <p className="help-text">{Object.keys(draft.suggestions).length} suggested field value(s). Confidence: {draft.confidence ?? 'n/a'}</p>
                )}
              </div>
            )}
            <p className="help-text">Approve saves field values to SharePoint, then moves the file to the processed folder.</p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="page-stack">
      <div className="workflow-strip">
        {['SharePoint sync', 'OCR', 'AI extraction', 'Human review', 'Metadata write-back'].map((step, i) => (
          <div className="workflow-step" key={step}><span>{i + 1}</span>{step}</div>
        ))}
      </div>
      <div className="content-grid compact">
        <MetricCard title="SharePoint library" value={libraryName} detail={`Input folder: ${inputFolder}`} icon={<Cloud />} />
        <MetricCard title="Input queue" value={String(files.length)} detail="Held here until you approve" icon={<FileScan />} />
        <MetricCard title="AI reviewed" value="0" detail="Extraction starts after OCR is wired" icon={<Sparkles />} />
      </div>
      <div className="card table-card">
        <div className="card-header">
          <div><p className="eyebrow">SharePoint input folder</p><h2>OCR / AI / review queue</h2></div>
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
                <tr><td colSpan={5} className="empty-table-cell">No files found in the configured SharePoint input folder.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

// ── ProcessedReceipts ──────────────────────────────────────────────────────

export function ProcessedReceipts() {
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
      .filter((f) => !query || `${f.name} ${f.status} ${f.item_type}`.toLowerCase().includes(query))
      .sort((l, r) => {
        if (sortKey === 'size') return ((l.size as number) - (r.size as number)) * direction;
        if (sortKey === 'last_modified') return (new Date(l.last_modified).getTime() - new Date(r.last_modified).getTime()) * direction;
        return String(l[sortKey] || '').localeCompare(String(r[sortKey] || '')) * direction;
      });
  }, [files, search, sortDirection, sortKey]);

  const pageCount = Math.max(1, Math.ceil(filteredFiles.length / pageSize));
  const visibleFiles = filteredFiles.slice(pageIndex * pageSize, pageIndex * pageSize + pageSize);

  const changeSort = (key: SortKey) => {
    if (sortKey === key) setSortDirection((c) => c === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDirection(key === 'last_modified' || key === 'size' ? 'desc' : 'asc'); }
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

  useEffect(() => { loadProcessedFiles(); }, []);
  useEffect(() => { setPageIndex(0); }, [search, pageSize]);

  if (selectedId) {
    return (
      <section className="page-stack">
        <button className="secondary-button back-button" type="button"
          onClick={() => { setSelectedId(null); setDetail(null); setDetailStatus(null); }}>
          <ArrowLeft size={17} /> Back to processed receipts
        </button>
        <div className="detail-layout">
          <div className="card preview-card">
            <div className="card-header">
              <div><p className="eyebrow">Processed receipt</p><h2>{detail?.file.name || 'Loading file…'}</h2></div>
              {detail?.file.web_url && <a className="secondary-button" href={detail.file.web_url} target="_blank" rel="noreferrer">Open in SharePoint</a>}
            </div>
            <iframe className="file-preview" src={`/api/sharepoint/input-files/${encodeURIComponent(selectedId)}/content`} title={detail?.file.name || 'Processed receipt preview'} />
          </div>
          <div className="card metadata-card">
            <div className="card-header"><div><p className="eyebrow">Read only</p><h2>Receipt details</h2></div></div>
            {detailStatus && <p className="help-text table-status">{detailStatus}</p>}
            <div className="readonly-fields">
              {([...(detail?.fields || [])].sort((l, r) => l.order - r.order)).map((field) => (
                <div className="readonly-field" key={field.name}>
                  <span>{field.display_name}</span>
                  <strong>{formatFieldValue(field.value)}</strong>
                </div>
              ))}
              {detail && !detail.fields.length && <p className="help-text">No custom metadata fields found.</p>}
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
          <div><p className="eyebrow">SharePoint processed folder</p><h2>Completed receipt archive</h2></div>
          <button className="secondary-button" type="button" onClick={loadProcessedFiles} disabled={isLoading}>
            <RefreshCw size={17} /> {isLoading ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
        <div className="table-controls">
          <label>Search<input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search receipt names…" /></label>
          <label>Show per page
            <select value={pageSize} onChange={(e) => setPageSize(Number(e.target.value) as 50 | 100 | 200)}>
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
            <button className="secondary-button" type="button" onClick={() => setPageIndex((v) => Math.max(0, v - 1))} disabled={pageIndex === 0}>Previous</button>
            <button className="secondary-button" type="button" onClick={() => setPageIndex((v) => Math.min(pageCount - 1, v + 1))} disabled={pageIndex >= pageCount - 1}>Next</button>
          </div>
        </div>
      </div>
    </section>
  );
}
