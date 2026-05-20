import React, { useEffect, useState } from 'react';
import { Check, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, ClipboardList, Pencil, RefreshCw, Shuffle, Trash2, X } from 'lucide-react';
import type { RosterItem, RosterScheduleType, SubTask, Task, TaskSchedule, UserProfile } from '../types';

// ── Audio ─────────────────────────────────────────────────────────────────────
function playBling() {
  try {
    const AudioCtx = (window as any).AudioContext || (window as any).webkitAudioContext;
    const ctx = new AudioCtx();
    [523.25, 659.25, 783.99].forEach((freq, i) => {
      const osc = ctx.createOscillator(); const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.type = 'sine'; osc.frequency.value = freq;
      const t = ctx.currentTime + i * 0.13;
      gain.gain.setValueAtTime(0.35, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
      osc.start(t); osc.stop(t + 0.45);
    });
  } catch { /* audio not available */ }
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function todayStr() { return new Date().toISOString().slice(0, 10); }

function assigneeLabel(assignedTo: string | string[], userProfiles: UserProfile[]) {
  const ids = Array.isArray(assignedTo) ? assignedTo : [assignedTo];
  if (ids.includes('everyone') || ids.length === 0) return 'Everyone';
  const names = ids.map(id => userProfiles.find(p => p.id === id)?.name || id);
  return names.join(', ');
}

function AssigneeToggle({ value, onChange, userProfiles, compact }: {
  value: string[]; onChange: (v: string[]) => void;
  userProfiles: UserProfile[]; compact?: boolean;
}) {
  const isEveryone = value.includes('everyone') || value.length === 0;
  const toggle = (id: string) => {
    if (id === 'everyone') { onChange(['everyone']); return; }
    const cur = value.filter(x => x !== 'everyone');
    const next = cur.includes(id) ? cur.filter(x => x !== id) : [...cur, id];
    onChange(next.length === 0 ? ['everyone'] : next);
  };
  const btnStyle = compact ? { fontSize: '0.78rem', padding: '0.2rem 0.5rem' } : { fontSize: '0.82rem', padding: '0.25rem 0.65rem' };
  return (
    <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
      <button type="button" style={btnStyle}
        className={isEveryone ? 'primary-button' : 'secondary-button'}
        onClick={() => toggle('everyone')}>Everyone</button>
      {userProfiles.map(p => (
        <button key={p.id} type="button" style={btnStyle}
          className={!isEveryone && value.includes(p.id) ? 'primary-button' : 'secondary-button'}
          onClick={() => toggle(p.id)}>{p.name}</button>
      ))}
    </div>
  );
}

function isOverdue(task: Task) {
  return !task.done && !!task.due_date && task.due_date < todayStr();
}

const INTERVAL_UNITS = ['day', 'week', 'month', 'year'] as const;
const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const WEEKDAY_NAMES = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const WEEKDAY_FULL  = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

function recurringDescription(task: Task): string {
  if (task.schedule === 'recurring') {
    const c = task.interval_count; const u = task.interval_unit;
    return `Every ${c} ${u}${c !== 1 ? 's' : ''}${task.anchor_date ? ' from ' + task.anchor_date : ''}`;
  }
  if (task.schedule === 'random') {
    const days = task.days_of_month.length ? 'Days ' + task.days_of_month.join(', ') : 'Any day';
    const months = task.months.length ? task.months.map(m => MONTH_NAMES[m - 1]).join(', ') : 'every month';
    return `${days} · ${months}`;
  }
  return '';
}

function rosterScheduleLabel(item: RosterItem): string {
  if (item.schedule_type === 'daily') return 'Every day';
  if (item.schedule_type === 'every-n-days') return `Every ${item.interval} day${item.interval !== 1 ? 's' : ''}`;
  if (item.schedule_type === 'weekdays') {
    const sorted = [...item.weekdays].sort((a, b) => a - b);
    return sorted.map(d => WEEKDAY_FULL[d]).join(' & ');
  }
  return '';
}

// Returns true if the roster item is active on the given date string
function isRosterActiveOn(item: RosterItem, dateStr: string): boolean {
  if (!item.start_date) return false;
  const date = new Date(dateStr);
  const start = new Date(item.start_date);
  if (date < start) return false;
  if (item.schedule_type === 'daily') return true;
  if (item.schedule_type === 'every-n-days') {
    const days = Math.round((date.getTime() - start.getTime()) / 86400000);
    return days % item.interval === 0;
  }
  if (item.schedule_type === 'weekdays') {
    return item.weekdays.includes(date.getDay());
  }
  return false;
}

// Count how many occurrences have happened from start up to and including dateStr
function rosterOccurrenceCount(item: RosterItem, dateStr: string): number {
  if (!item.start_date) return 0;
  const date = new Date(dateStr);
  const start = new Date(item.start_date);
  if (date < start) return 0;
  if (item.schedule_type === 'daily') {
    return Math.round((date.getTime() - start.getTime()) / 86400000) + 1;
  }
  if (item.schedule_type === 'every-n-days') {
    const days = Math.round((date.getTime() - start.getTime()) / 86400000);
    return Math.floor(days / item.interval) + 1;
  }
  if (item.schedule_type === 'weekdays') {
    let count = 0;
    const d = new Date(start);
    while (d <= date) {
      if (item.weekdays.includes(d.getDay())) count++;
      d.setDate(d.getDate() + 1);
    }
    return count;
  }
  return 0;
}

function rosterAssigneeToday(item: RosterItem): string | null {
  if (!item.profile_ids.length) return null;
  const today = todayStr();
  if (!isRosterActiveOn(item, today)) return null;
  const count = rosterOccurrenceCount(item, today);
  return item.profile_ids[(count - 1) % item.profile_ids.length];
}

// ── API helpers ───────────────────────────────────────────────────────────────
async function fetchTasks(): Promise<Task[]> {
  const res = await fetch('/api/tasks');
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const data = await res.json();
  return Array.isArray(data.tasks) ? data.tasks : [];
}

async function fetchSubtasks(taskId: string): Promise<SubTask[]> {
  const res = await fetch('/api/tasks/' + encodeURIComponent(taskId) + '/subtasks');
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const data = await res.json();
  return Array.isArray(data.subtasks) ? data.subtasks : [];
}

async function fetchRoster(): Promise<RosterItem[]> {
  const res = await fetch('/api/roster');
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const data = await res.json();
  return Array.isArray(data.items) ? data.items : [];
}

async function apiPatch(url: string, body: object) {
  const res = await fetch(url, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return res.json();
}

async function apiPost(url: string, body: object) {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return res.json();
}

async function apiDelete(url: string) {
  const res = await fetch(url, { method: 'DELETE' });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return res.json();
}

async function apiReorderRoster(ids: string[]) {
  const res = await fetch('/api/roster/reorder', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(ids) });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return res.json();
}

// ── Task form ─────────────────────────────────────────────────────────────────
type TaskFormValue = Omit<Task, 'id' | 'created_at' | 'done' | 'done_date' | 'is_template' | 'template_id'>;

function blankTask(activeProfile?: UserProfile): TaskFormValue {
  return {
    title: '', description: '', assigned_to: ['everyone'],
    added_by: activeProfile?.name || '',
    schedule: 'once-off', interval_count: 1, interval_unit: 'week',
    anchor_date: todayStr(), days_of_month: [], months: [], due_dates: [],
    due_date: todayStr(), end_date: '', rule_note: '', task_weekdays: [] as number[],
  };
}

function parseIntList(s: string): number[] {
  return s.split(',').map(v => parseInt(v.trim(), 10)).filter(n => !isNaN(n));
}
function parseDateList(s: string): string[] {
  return s.split(',').map(v => v.trim()).filter(Boolean);
}

function TaskForm({ value, onChange, userProfiles, onSubmit, onCancel, submitLabel }: {
  value: TaskFormValue; onChange: (patch: Partial<TaskFormValue>) => void;
  userProfiles: UserProfile[]; onSubmit: () => void; onCancel: () => void; submitLabel: string;
}) {
  return (
    <div className="task-form">
      <div className="form-grid">
        <label className="span-2">Title
          <input autoFocus value={value.title} onChange={(e) => onChange({ title: e.target.value })} placeholder="What needs to be done?" onKeyDown={(e) => e.key === 'Enter' && onSubmit()} />
        </label>
        <div className="span-2">
          <p style={{ margin: '0 0 0.4rem', fontSize: '0.85rem', fontWeight: 600 }}>Assigned to</p>
          <AssigneeToggle value={Array.isArray(value.assigned_to) ? value.assigned_to : ['everyone']} onChange={(v) => onChange({ assigned_to: v })} userProfiles={userProfiles} />
        </div>
        <label>Schedule
          <select value={value.schedule} onChange={(e) => onChange({ schedule: e.target.value as TaskSchedule })}>
            <option value="once-off">Once off</option>
            <option value="recurring">Recurring</option>
            <option value="random">Random</option>
            <option value="weekdays">Specific day(s) of week</option>
          </select>
        </label>
        {value.schedule === 'recurring' && (<>
          <label>Repeat every
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <input type="number" min={1} value={value.interval_count} onChange={(e) => onChange({ interval_count: parseInt(e.target.value) || 1 })} style={{ width: '4rem' }} />
              <select value={value.interval_unit} onChange={(e) => onChange({ interval_unit: e.target.value as 'day'|'week'|'month'|'year' })}>
                {INTERVAL_UNITS.map(u => <option key={u} value={u}>{u}{value.interval_count !== 1 ? 's' : ''}</option>)}
              </select>
            </div>
          </label>
          <label>Starting from<input type="date" value={value.anchor_date} onChange={(e) => onChange({ anchor_date: e.target.value })} /></label>
        </>)}
        {value.schedule === 'random' && (<>
          <label>Start date<input type="date" value={value.anchor_date} onChange={(e) => onChange({ anchor_date: e.target.value })} /></label>
          <label>Days of month <span style={{ fontWeight: 400, fontSize: '0.8em' }}>(e.g. 1, 15, 28)</span>
            <input value={value.days_of_month.join(', ')} onChange={(e) => onChange({ days_of_month: parseIntList(e.target.value) })} placeholder="1, 15, 28" />
          </label>
          <label className="span-2">Months <span style={{ fontWeight: 400, fontSize: '0.8em' }}>(blank = all; e.g. 1, 4, 7, 10)</span>
            <input value={value.months.join(', ')} onChange={(e) => onChange({ months: parseIntList(e.target.value) })} placeholder="Leave blank for every month" />
          </label>
        </>)}
        {value.schedule === 'weekdays' && (<>
          <div className="span-2">
            <p style={{ margin: '0 0 0.4rem', fontSize: '0.85rem', fontWeight: 600 }}>Which day(s)?</p>
            <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
              {WEEKDAY_NAMES.map((name, d) => (
                <button key={d} type="button"
                  className={(value.days_of_month || []).includes(d) ? 'primary-button' : 'secondary-button'}
                  style={{ fontSize: '0.82rem', padding: '0.25rem 0.6rem', minWidth: '3rem' }}
                  onClick={() => {
                    const cur = value.days_of_month || [];
                    onChange({ days_of_month: cur.includes(d) ? cur.filter(x => x !== d) : [...cur, d].sort((a,b) => a-b) });
                  }}>{name}</button>
              ))}
            </div>
          </div>
          <label>Starting from<input type="date" value={value.anchor_date} onChange={(e) => onChange({ anchor_date: e.target.value })} /></label>
        </>)}

        {value.schedule === 'once-off' && (
          <label className="span-2">Due dates <span style={{ fontWeight: 400, fontSize: '0.8em' }}>(e.g. 2026-06-01, 2026-12-25)</span>
            <input value={value.due_dates.join(', ')} onChange={(e) => onChange({ due_dates: parseDateList(e.target.value) })} placeholder="2026-06-01, 2026-12-25" />
          </label>
        )}
        {(value.schedule === 'recurring' || value.schedule === 'random' || value.schedule === 'weekdays') && (
          <label>Due date <span style={{ fontWeight: 400, fontSize: '0.8em' }}>(first occurrence)</span>
            <input type="date" value={value.due_date} onChange={(e) => onChange({ due_date: e.target.value })} />
          </label>
        )}
        <label>Scheduled task end date <span style={{ fontWeight: 400, fontSize: '0.8em' }}>(optional)</span>
          <input type="date" value={value.end_date} onChange={(e) => onChange({ end_date: e.target.value })} />
        </label>
        <label className="span-2">Rule note <span style={{ fontWeight: 400, fontSize: '0.8em' }}>(optional)</span>
          <input value={value.rule_note} onChange={(e) => onChange({ rule_note: e.target.value })} placeholder="e.g. school term only" />
        </label>
        <label className="span-2">Description
          <textarea value={value.description} onChange={(e) => onChange({ description: e.target.value })} placeholder="Optional extra details" rows={2} />
        </label>
      </div>
      <div className="button-row" style={{ marginTop: '1rem' }}>
        <button className="primary-button" type="button" onClick={onSubmit} disabled={!value.title.trim()}>{submitLabel}</button>
        <button className="secondary-button" type="button" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

// ── Roster form ───────────────────────────────────────────────────────────────
type RosterFormValue = Omit<RosterItem, 'id' | 'created_at'>;

function blankRoster(): RosterFormValue {
  return { name: '', description: '', profile_ids: [], start_date: todayStr(), schedule_type: 'daily', interval: 2, weekdays: [] };
}

function RosterForm({ value, onChange, userProfiles, onSubmit, onCancel, submitLabel }: {
  value: RosterFormValue; onChange: (patch: Partial<RosterFormValue>) => void;
  userProfiles: UserProfile[]; onSubmit: () => void; onCancel: () => void; submitLabel: string;
}) {
  const toggleProfile = (id: string) => {
    const ids = value.profile_ids.includes(id)
      ? value.profile_ids.filter(p => p !== id)
      : [...value.profile_ids, id];
    onChange({ profile_ids: ids });
  };
  const moveUp = (idx: number) => {
    if (idx === 0) return;
    const ids = [...value.profile_ids];
    [ids[idx - 1], ids[idx]] = [ids[idx], ids[idx - 1]];
    onChange({ profile_ids: ids });
  };
  const moveDown = (idx: number) => {
    if (idx === value.profile_ids.length - 1) return;
    const ids = [...value.profile_ids];
    [ids[idx + 1], ids[idx]] = [ids[idx], ids[idx + 1]];
    onChange({ profile_ids: ids });
  };
  const toggleWeekday = (d: number) => {
    const days = value.weekdays.includes(d)
      ? value.weekdays.filter(x => x !== d)
      : [...value.weekdays, d].sort((a, b) => a - b);
    onChange({ weekdays: days });
  };

  const canSubmit = value.name.trim() && value.profile_ids.length > 0 &&
    (value.schedule_type !== 'weekdays' || value.weekdays.length > 0);

  return (
    <div className="task-form">
      <div className="form-grid">
        <label className="span-2">Roster item name
          <input autoFocus value={value.name} onChange={(e) => onChange({ name: e.target.value })} placeholder="e.g. Empty the bins" onKeyDown={(e) => e.key === 'Enter' && canSubmit && onSubmit()} />
        </label>
        <label>Schedule
          <select value={value.schedule_type} onChange={(e) => onChange({ schedule_type: e.target.value as RosterScheduleType })}>
            <option value="daily">Every day</option>
            <option value="every-n-days">Every N days</option>
            <option value="weekdays">Specific day(s) of week</option>
          </select>
        </label>
        {value.schedule_type === 'every-n-days' && (
          <label>Every how many days
            <input type="number" min={2} max={365} value={value.interval} onChange={(e) => onChange({ interval: parseInt(e.target.value) || 2 })} />
          </label>
        )}
        {value.schedule_type === 'weekdays' && (
          <div className="span-2">
            <p style={{ margin: '0 0 0.4rem', fontSize: '0.85rem', fontWeight: 600 }}>Which day(s)?</p>
            <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
              {WEEKDAY_NAMES.map((name, d) => (
                <button key={d} type="button"
                  className={value.weekdays.includes(d) ? 'primary-button' : 'secondary-button'}
                  style={{ fontSize: '0.82rem', padding: '0.25rem 0.6rem', minWidth: '3rem' }}
                  onClick={() => toggleWeekday(d)}>{name}</button>
              ))}
            </div>
          </div>
        )}
        <label>Start date<input type="date" value={value.start_date} onChange={(e) => onChange({ start_date: e.target.value })} /></label>
        <label className="span-2">Description <span style={{ fontWeight: 400, fontSize: '0.8em' }}>(optional notes)</span>
          <input value={value.description} onChange={(e) => onChange({ description: e.target.value })} placeholder="e.g. Take bins to street on Wednesday" />
        </label>
        <div className="span-2">
          <p style={{ margin: '0 0 0.5rem', fontSize: '0.85rem', fontWeight: 600 }}>Rotation order <span style={{ fontWeight: 400 }}>(select profiles and set order)</span></p>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.5rem' }}>
            {userProfiles.map(p => (
              <button key={p.id} type="button"
                className={value.profile_ids.includes(p.id) ? 'primary-button' : 'secondary-button'}
                style={{ fontSize: '0.82rem', padding: '0.25rem 0.75rem' }}
                onClick={() => toggleProfile(p.id)}>{p.name}</button>
            ))}
          </div>
          {value.profile_ids.length > 0 && (
            <div className="roster-order-list">
              {value.profile_ids.map((id, idx) => {
                const profile = userProfiles.find(p => p.id === id);
                return (
                  <div key={id} className="roster-order-item">
                    <span className="roster-order-num">{idx + 1}</span>
                    <span style={{ flex: 1 }}>{profile?.name || id}</span>
                    <button type="button" className="secondary-button icon-btn" onClick={() => moveUp(idx)} disabled={idx === 0} aria-label="Move up"><ChevronUp size={14} /></button>
                    <button type="button" className="secondary-button icon-btn" onClick={() => moveDown(idx)} disabled={idx === value.profile_ids.length - 1} aria-label="Move down"><ChevronDown size={14} /></button>
                    <button type="button" className="secondary-button danger-button icon-btn" onClick={() => onChange({ profile_ids: value.profile_ids.filter((_, j) => j !== idx) })} aria-label="Remove"><X size={14} /></button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
      <div className="button-row" style={{ marginTop: '1rem' }}>
        <button className="primary-button" type="button" onClick={onSubmit} disabled={!canSubmit}>{submitLabel}</button>
        <button className="secondary-button" type="button" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

// ── Roster card ───────────────────────────────────────────────────────────────
function RosterCard({ item, userProfiles, onEdit, onDelete, isAdmin, onMoveLeft, onMoveRight }: {
  item: RosterItem; userProfiles: UserProfile[];
  onEdit: (item: RosterItem) => void; onDelete: (id: string) => void;
  isAdmin?: boolean; onMoveLeft?: () => void; onMoveRight?: () => void;
}) {
  const todayAssigneeId = rosterAssigneeToday(item);
  const todayAssignee = todayAssigneeId
    ? (userProfiles.find(p => p.id === todayAssigneeId)?.name || todayAssigneeId)
    : null;
  const activeToday = todayAssigneeId !== null;
  const rotation = item.profile_ids.map(id => userProfiles.find(p => p.id === id)?.name || id);

  return (
    <div className={"roster-mgmt-tile" + (activeToday ? ' roster-mgmt-tile-active' : '')}>
      {isAdmin && (
        <div className="roster-mgmt-tile-actions">
          {onMoveLeft && <button className="secondary-button icon-btn" type="button" onClick={onMoveLeft} aria-label="Move left"><ChevronLeft size={13} /></button>}
          {onMoveRight && <button className="secondary-button icon-btn" type="button" onClick={onMoveRight} aria-label="Move right"><ChevronRight size={13} /></button>}
          <button className="secondary-button icon-btn" type="button" onClick={() => onEdit(item)} aria-label="Edit"><Pencil size={13} /></button>
          <button className="secondary-button danger-button icon-btn" type="button" onClick={() => onDelete(item.id)} aria-label="Delete"><Trash2 size={13} /></button>
        </div>
      )}
      <strong className="roster-tile-name">{item.name}</strong>
      {todayAssignee
        ? <span className="roster-tile-assignee roster-tile-assignee-active">{todayAssignee}</span>
        : <span className="roster-tile-assignee" style={{ opacity: 0.4 }}>Not today</span>}
      {item.description && <span className="roster-tile-desc">{item.description}</span>}
      <span className="roster-tile-desc" style={{ marginTop: 'auto', paddingTop: '0.4rem' }}>{rosterScheduleLabel(item)}</span>
      <span className="roster-tile-desc">{rotation.join(' → ')}</span>
    </div>
  );
}

// ── Template card ─────────────────────────────────────────────────────────────
function TemplateCard({ task, userProfiles, onEdit, onDelete }: {
  task: Task; userProfiles: UserProfile[];
  onEdit: (task: Task) => void; onDelete: (id: string) => void;
}) {
  const Icon = task.schedule === 'random' ? Shuffle : RefreshCw;
  return (
    <div className="template-card">
      <div className="template-card-icon"><Icon size={16} /></div>
      <div className="template-card-body">
        <strong className="template-card-title">{task.title}</strong>
        <span className="template-card-rule">{recurringDescription(task)}</span>
        <span className="task-meta">
          {assigneeLabel(task.assigned_to, userProfiles)}
          {task.end_date ? ' · Ends ' + task.end_date : ''}
          {task.rule_note ? ' · ' + task.rule_note : ''}
        </span>
      </div>
      <div className="task-actions">
        <button className="secondary-button" type="button" onClick={() => onEdit(task)} aria-label="Edit"><Pencil size={14} /></button>
        <button className="secondary-button danger-button" type="button" onClick={() => onDelete(task.id)} aria-label="Delete"><Trash2 size={14} /></button>
      </div>
    </div>
  );
}

// ── Task row ──────────────────────────────────────────────────────────────────
function TaskRow({ task, userProfiles, onToggle, onDelete, onEdit, subtasks, onToggleSubtask, onSelect, isSelected }: {
  task: Task; userProfiles: UserProfile[];
  onToggle: (task: Task) => void; onDelete?: (id: string) => void; onEdit?: (task: Task) => void;
  subtasks?: SubTask[]; onToggleSubtask?: (id: string, done: boolean) => void;
  onSelect?: (task: Task) => void; isSelected?: boolean;
}) {
  const overdue = isOverdue(task);
  const [confetti, setConfetti] = React.useState(false);
  const pendingSubtasks = subtasks ? subtasks.filter(s => !s.done).length : 0;
  const blocked = !task.done && pendingSubtasks > 0;
  const handleToggle = () => {
    if (blocked) return;
    if (!task.done) { setConfetti(true); setTimeout(() => setConfetti(false), 900); }
    onToggle(task);
  };
  return (
    <li
      className={'task-row' + (task.done ? ' task-done' : '') + (overdue ? ' task-overdue' : '') + (isSelected ? ' task-row-selected' : '')}
      onClick={onSelect ? (e) => { if (!(e.target as HTMLElement).closest('button')) onSelect(task); } : undefined}
      style={onSelect ? { cursor: 'pointer' } : undefined}
    >
      <span className={'task-circle-wrap' + (confetti ? ' confetti-burst' : '')}
        title={blocked ? `Complete ${pendingSubtasks} sub-task${pendingSubtasks > 1 ? 's' : ''} first` : undefined}>
        <button
          className={'chore-circle' + (task.done ? ' chore-circle-done' : '') + (overdue ? ' chore-circle-overdue' : '') + (blocked ? ' chore-circle-blocked' : '')}
          type="button" onClick={handleToggle} disabled={blocked}
          aria-label={blocked ? `Complete sub-tasks first` : task.done ? 'Mark as not done' : 'Mark as done'}
        >
          {task.done && <Check size={16} strokeWidth={3} />}
        </button>
        {confetti && Array.from({ length: 10 }).map((_, i) => (
          <span key={i} className="confetti-piece" style={{ '--i': i } as React.CSSProperties} />
        ))}
      </span>
      <div className="task-body">
        <div className="task-title-row">
          {overdue && <span className="task-urgent-tag">URGENT</span>}
          <strong className="task-title">{task.title}</strong>
        </div>
        {task.description && <span className="task-desc">{task.description}</span>}
        <span className="task-meta">
          {assigneeLabel(task.assigned_to, userProfiles)}
          {task.due_date ? (task.due_date === todayStr() ? ' · Due today' : ' · Due ' + task.due_date) : ''}
          {task.added_by ? ' · Added by ' + task.added_by : ''}
        </span>
        {subtasks && subtasks.length > 0 && (
          <ul className="subtask-list">
            {subtasks.map(st => (
              <li key={st.id} className={'subtask-item' + (st.done ? ' subtask-done' : '')}>
                <button type="button" className={'subtask-circle' + (st.done ? ' subtask-circle-done' : '')}
                  onClick={(e) => { e.stopPropagation(); onToggleSubtask?.(st.id, !st.done); }}>
                  {st.done && <Check size={10} strokeWidth={3} />}
                </button>
                <span className="subtask-title">{st.title}</span>
                <span style={{ fontSize: '0.72rem', opacity: 0.55, marginLeft: '0.35rem' }}>
                  {' — ' + assigneeLabel(st.assigned_to?.length ? st.assigned_to : ['everyone'], userProfiles)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="task-actions">
        {onEdit && <button className="secondary-button" type="button" onClick={() => onEdit(task)} aria-label="Edit"><Pencil size={14} /></button>}
        {onDelete && <button className="secondary-button danger-button" type="button" onClick={() => onDelete(task.id)} aria-label="Delete"><Trash2 size={14} /></button>}
      </div>
    </li>
  );
}

// ── Task detail panel ─────────────────────────────────────────────────────────
function TaskDetailPanel({ task, subtasks, userProfiles, onEdit, onToggleSubtask, onAddSubtask, onDeleteSubtask, onAssignSubtask, onClose, readOnly, embedded }: {
  task: Task | null; subtasks: SubTask[]; userProfiles: UserProfile[];
  onEdit?: (task: Task) => void;
  onToggleSubtask: (id: string, done: boolean) => void;
  onAddSubtask?: (title: string, assignedTo: string[]) => void;
  onDeleteSubtask?: (id: string) => void;
  onAssignSubtask?: (id: string, assignedTo: string[]) => void;
  onClose: () => void;
  readOnly?: boolean;
  embedded?: boolean;
}) {
  const [newSubtask, setNewSubtask] = React.useState('');
  React.useEffect(() => { setNewSubtask(''); }, [task?.id]);

  if (!task) {
    return (
      <div className="task-detail-panel task-detail-empty">
        <ClipboardList size={36} style={{ opacity: 0.2, display: 'block', margin: '0 auto 0.75rem' }} />
        <p style={{ opacity: 0.45, textAlign: 'center', fontSize: '0.88rem' }}>Select a task to see more details</p>
      </div>
    );
  }

  const overdue = isOverdue(task);
  const doneCount = subtasks.filter(s => s.done).length;
  const total = subtasks.length;

  const submitNew = () => {
    const t = newSubtask.trim();
    if (!t || !onAddSubtask) return;
    const assignedTo = task?.assigned_to?.length ? task.assigned_to : ['everyone'];
    onAddSubtask(t, assignedTo);
    setNewSubtask('');
  };


  const subtaskList = (
    <div className="task-detail-subtasks">
      <div className="task-detail-subtasks-header">
        <strong>Sub-tasks</strong>
        {total > 0 && <span className="subtask-progress">{doneCount}/{total}</span>}
      </div>
      {subtasks.length === 0 && <p style={{ fontSize: '0.82rem', opacity: 0.45, margin: '0.25rem 0' }}>No sub-tasks yet.</p>}
      <ul className="subtask-list subtask-list-detail">
        {subtasks.map(st => (
          <li key={st.id} className={'subtask-item subtask-item-detail' + (st.done ? ' subtask-done' : '')}>
            <button type="button" className={'subtask-circle' + (st.done ? ' subtask-circle-done' : '')}
              style={{ marginTop: '0.15rem' }}
              onClick={() => onToggleSubtask(st.id, !st.done)}>
              {st.done && <Check size={10} strokeWidth={3} />}
            </button>
            <div style={{ flex: 1, minWidth: 0 }}>
              <span className="subtask-title">{st.title}</span>
              {!readOnly && onAssignSubtask && (
                <div style={{ marginTop: '0.3rem' }}>
                  <AssigneeToggle value={st.assigned_to?.length ? st.assigned_to : ['everyone']}
                    onChange={(v) => onAssignSubtask(st.id, v)}
                    userProfiles={userProfiles} compact />
                </div>
              )}
            </div>
            {!readOnly && onDeleteSubtask && (
              <button type="button" className="secondary-button danger-button icon-btn"
                style={{ opacity: 0.55, marginTop: '0.1rem' }} onClick={() => onDeleteSubtask(st.id)} aria-label="Delete">
                <Trash2 size={11} />
              </button>
            )}
          </li>
        ))}
      </ul>
      {!readOnly && onAddSubtask && (
        <div className="subtask-add-row">
          <input className="subtask-add-input" placeholder="Add a sub-task…"
            value={newSubtask} onChange={e => setNewSubtask(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && submitNew()} />
          <button className="primary-button" type="button" onClick={submitNew} disabled={!newSubtask.trim()}>Add</button>
        </div>
      )}
    </div>
  );

  if (embedded) return subtaskList;

  return (
    <div className="task-detail-panel">
      <div className="task-detail-header">
        <div style={{ flex: 1, minWidth: 0 }}>
          <p className="eyebrow" style={{ marginBottom: '0.2rem' }}>
            {overdue ? 'Overdue' : task.done ? 'Completed' : 'Due today'}
          </p>
          <h3 className="task-detail-title">{task.title}</h3>
        </div>
        <div style={{ display: 'flex', gap: '0.4rem', flexShrink: 0 }}>
          {!readOnly && onEdit && (
            <button className="secondary-button" type="button" onClick={() => onEdit(task)} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
              <Pencil size={13} /> Edit
            </button>
          )}
          <button className="secondary-button icon-btn" type="button" onClick={onClose} aria-label="Close"><X size={14} /></button>
        </div>
      </div>
      {task.description && <p className="task-detail-desc">{task.description}</p>}
      <div className="task-detail-meta">
        <span>{assigneeLabel(task.assigned_to, userProfiles)}</span>
        {task.due_date && <span>{task.due_date === todayStr() ? 'Due today' : (overdue ? 'Overdue · ' : 'Due ') + task.due_date}</span>}
        {task.added_by && <span>Added by {task.added_by}</span>}
      </div>
      {subtaskList}
    </div>
  );
}


// ── To Do page ────────────────────────────────────────────────────────────────
export function TodoPage({ activeProfile, userProfiles }: { activeProfile?: UserProfile; userProfiles: UserProfile[] }) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [roster, setRoster] = useState<RosterItem[]>([]);
  const [status, setStatus] = useState('Loading…');
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [subtasksMap, setSubtasksMap] = useState<Record<string, SubTask[]>>({});

  const loadSubtasks = async (taskId: string) => {
    try { const sts = await fetchSubtasks(taskId); setSubtasksMap(m => ({ ...m, [taskId]: sts })); } catch { /* ignore */ }
  };

  const load = async () => {
    try {
      const [t, r] = await Promise.all([fetchTasks(), fetchRoster()]);
      setTasks(t); setRoster(r); setStatus('');
      t.filter(x => !x.is_template).forEach(x =>
        fetchSubtasks(x.id).then(sts => setSubtasksMap(m => ({ ...m, [x.id]: sts }))).catch(() => {})
      );
    } catch (e) { setStatus(e instanceof Error ? e.message : 'Could not load.'); }
  };

  useEffect(() => { void load(); }, []);

  const toggle = async (task: Task) => {
    if (!task.done) playBling();
    try { await apiPatch('/api/tasks/' + encodeURIComponent(task.id) + '/done', { done: !task.done }); await load(); }
    catch (e) { setStatus(e instanceof Error ? e.message : 'Could not update task.'); }
  };

  const toggleSubtask = async (taskId: string, subtaskId: string, done: boolean) => {
    try {
      await apiPatch('/api/subtasks/' + encodeURIComponent(subtaskId), { done });
      const sts = await fetchSubtasks(taskId);
      setSubtasksMap(m => ({ ...m, [taskId]: sts }));
    } catch { /* ignore */ }
  };
  const addSubtask = async (taskId: string, title: string) => {
    try {
      await apiPost('/api/tasks/' + encodeURIComponent(taskId) + '/subtasks', { title });
      const sts = await fetchSubtasks(taskId);
      setSubtasksMap(m => ({ ...m, [taskId]: sts }));
    } catch { /* ignore */ }
  };
  const deleteSubtask = async (taskId: string, subtaskId: string) => {
    try {
      await apiDelete('/api/subtasks/' + encodeURIComponent(subtaskId));
      const sts = await fetchSubtasks(taskId);
      setSubtasksMap(m => ({ ...m, [taskId]: sts }));
    } catch { /* ignore */ }
  };

  const today = todayStr();
  const isAdmin = activeProfile?.role === 'Administrator';
  const instances = tasks.filter(t => {
    if (t.is_template) return false;
    if (isAdmin) return true;
    // User role: only show tasks assigned to this profile or everyone
    const ids: string[] = Array.isArray(t.assigned_to) ? t.assigned_to : [t.assigned_to];
    return ids.includes('everyone') || (activeProfile ? ids.includes(activeProfile.id) : false);
  });
  const overdue = instances.filter(t => !t.done && t.due_date && t.due_date < today).sort((a, b) => a.due_date.localeCompare(b.due_date));
  const dueToday = instances.filter(t => !t.done && t.due_date === today);
  const doneToday = instances.filter(t => t.done && t.done_date === today);

  const rosterToday = roster
    .map(item => ({ item, assigneeId: rosterAssigneeToday(item) }))
    .filter(r => r.assigneeId !== null)
    .map(r => ({
      item: r.item,
      assigneeName: userProfiles.find(p => p.id === r.assigneeId)?.name || r.assigneeId || '—',
    }))
    .sort((a, b) => (a.item.sort_order ?? 0) - (b.item.sort_order ?? 0));

  const nothing = overdue.length === 0 && dueToday.length === 0 && doneToday.length === 0 && rosterToday.length === 0;

  const selectedTask = tasks.find(t => t.id === selectedTaskId) || null;
  const selectTask = (task: Task) => setSelectedTaskId(prev => prev === task.id ? null : task.id);

  return (
    <section className="page-stack">
      {status && <p className="help-text">{status}</p>}

      {rosterToday.length > 0 && (
        <div className="card table-card">
          <div className="card-header"><div><p className="eyebrow">Roster</p><h2>Today's roster</h2></div></div>
          <div className="roster-tiles">
            {rosterToday.map(({ item, assigneeName }) => (
              <div key={item.id} className="roster-mgmt-tile roster-mgmt-tile-active">
                <strong className="roster-tile-name">{item.name}</strong>
                <span className="roster-tile-assignee roster-tile-assignee-active">{assigneeName}</span>
                {item.description && <span className="roster-tile-desc">{item.description}</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      <div>
        <div>
          {overdue.length > 0 && (
            <div className="card table-card">
              <div className="card-header"><div><p className="eyebrow" style={{ color: '#dc2626' }}>Overdue</p><h2>Past due date</h2></div></div>
              <ul className="tasks-list">{overdue.map(t => <TaskRow key={t.id} task={t} userProfiles={userProfiles} onToggle={toggle}
                subtasks={subtasksMap[t.id]} onToggleSubtask={(sid, done) => void toggleSubtask(t.id, sid, done)}
                onSelect={selectTask} isSelected={selectedTaskId === t.id} />)}</ul>
            </div>
          )}

          {dueToday.length > 0 && (
            <div className="card table-card">
              <div className="card-header"><div><p className="eyebrow">Tasks</p><h2>Due today</h2></div></div>
              <ul className="tasks-list">{dueToday.map(t => <TaskRow key={t.id} task={t} userProfiles={userProfiles} onToggle={toggle}
                subtasks={subtasksMap[t.id]} onToggleSubtask={(sid, done) => void toggleSubtask(t.id, sid, done)}
                onSelect={selectTask} isSelected={selectedTaskId === t.id} />)}</ul>
            </div>
          )}

          {doneToday.length > 0 && (
            <div className="card table-card">
              <div className="card-header"><div><p className="eyebrow">Completed</p><h2>Done today</h2></div></div>
              <ul className="tasks-list">{doneToday.map(t => <TaskRow key={t.id} task={t} userProfiles={userProfiles} onToggle={toggle}
                subtasks={subtasksMap[t.id]} onToggleSubtask={(sid, done) => void toggleSubtask(t.id, sid, done)}
                onSelect={selectTask} isSelected={selectedTaskId === t.id} />)}</ul>
            </div>
          )}

          {nothing && !status && (
            <div className="card" style={{ textAlign: 'center', padding: '2.5rem' }}>
              <ClipboardList size={44} style={{ opacity: 0.25, margin: '0 auto 1rem', display: 'block' }} />
              <p className="help-text">Nothing scheduled for today.</p>
            </div>
          )}
        </div>

      </div>
    </section>
  );
}

// ── Task Management page ──────────────────────────────────────────────────────
export function TaskManagementPage({ activeProfile, userProfiles }: { activeProfile?: UserProfile; userProfiles: UserProfile[] }) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [roster, setRoster] = useState<RosterItem[]>([]);
  const [status, setStatus] = useState('Loading…');
  const [adding, setAdding] = useState<'task' | 'roster' | null>(null);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [editingRoster, setEditingRoster] = useState<RosterItem | null>(null);
  const [taskDraft, setTaskDraft] = useState<TaskFormValue>(() => blankTask(activeProfile));
  const [rosterDraft, setRosterDraft] = useState<RosterFormValue>(blankRoster);
  const [schedulesExpanded, setSchedulesExpanded] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [subtasksMap, setSubtasksMap] = useState<Record<string, SubTask[]>>({});

  const loadSubtasks = async (taskId: string) => {
    try { const sts = await fetchSubtasks(taskId); setSubtasksMap(m => ({ ...m, [taskId]: sts })); } catch { /* ignore */ }
  };

  const load = async () => {
    try {
      const [t, r] = await Promise.all([fetchTasks(), fetchRoster()]);
      setTasks(t); setRoster(r); setStatus('');
      t.filter(x => !x.is_template).forEach(x =>
        fetchSubtasks(x.id).then(sts => setSubtasksMap(m => ({ ...m, [x.id]: sts }))).catch(() => {})
      );
    } catch (e) { setStatus(e instanceof Error ? e.message : 'Could not load.'); }
  };

  useEffect(() => { void load(); }, []);

  const addTask = async () => {
    if (!taskDraft.title.trim()) return;
    setStatus('Adding…');
    try { await apiPost('/api/tasks', { ...taskDraft, added_by: activeProfile?.name || '' }); setTaskDraft(blankTask(activeProfile)); setAdding(null); await load(); }
    catch (e) { setStatus(e instanceof Error ? e.message : 'Could not add task.'); }
  };

  const saveEditTask = async () => {
    if (!editingTask) return;
    setStatus('Saving…');
    try { await apiPatch('/api/tasks/' + encodeURIComponent(editingTask.id), editingTask); setEditingTask(null); await load(); }
    catch (e) { setStatus(e instanceof Error ? e.message : 'Could not save.'); }
  };

  const addRoster = async () => {
    if (!rosterDraft.name.trim() || rosterDraft.profile_ids.length === 0) return;
    setStatus('Adding…');
    try { await apiPost('/api/roster', rosterDraft); setRosterDraft(blankRoster()); setAdding(null); await load(); }
    catch (e) { setStatus(e instanceof Error ? e.message : 'Could not add roster item.'); }
  };

  const saveEditRoster = async () => {
    if (!editingRoster) return;
    setStatus('Saving…');
    try { await apiPatch('/api/roster/' + encodeURIComponent(editingRoster.id), editingRoster); setEditingRoster(null); await load(); }
    catch (e) { setStatus(e instanceof Error ? e.message : 'Could not save.'); }
  };

  const toggle = async (task: Task) => {
    if (!task.done) playBling();
    try { await apiPatch('/api/tasks/' + encodeURIComponent(task.id) + '/done', { done: !task.done }); await load(); }
    catch (e) { setStatus(e instanceof Error ? e.message : 'Could not update task.'); }
  };

  const deleteTask = async (id: string) => {
    try { await apiDelete('/api/tasks/' + encodeURIComponent(id)); await load(); }
    catch (e) { setStatus(e instanceof Error ? e.message : 'Could not delete.'); }
  };

  const deleteRoster = async (id: string) => {
    try { await apiDelete('/api/roster/' + encodeURIComponent(id)); await load(); }
    catch (e) { setStatus(e instanceof Error ? e.message : 'Could not delete.'); }
  };

  const toggleSubtask = async (taskId: string, subtaskId: string, done: boolean) => {
    try { await apiPatch('/api/subtasks/' + encodeURIComponent(subtaskId), { done }); await loadSubtasks(taskId); }
    catch (e) { setStatus(e instanceof Error ? e.message : 'Could not update sub-task.'); }
  };
  const addSubtask = async (taskId: string, title: string, assignedTo: string[] = ['everyone']) => {
    try {
      await apiPost('/api/tasks/' + encodeURIComponent(taskId) + '/subtasks', { title, assigned_to: assignedTo });
      const sts = await fetchSubtasks(taskId);
      setSubtasksMap(m => ({ ...m, [taskId]: sts }));
    } catch (e) { setStatus(e instanceof Error ? e.message : 'Could not add sub-task.'); }
  };
  const deleteMgmtSubtask = async (taskId: string, subtaskId: string) => {
    try {
      await apiDelete('/api/subtasks/' + encodeURIComponent(subtaskId));
      const sts = await fetchSubtasks(taskId);
      setSubtasksMap(m => ({ ...m, [taskId]: sts }));
    } catch (e) { setStatus(e instanceof Error ? e.message : 'Could not delete sub-task.'); }
  };

  const assignSubtask = async (taskId: string, subtaskId: string, assignedTo: string[]) => {
    try {
      await apiPatch('/api/subtasks/' + encodeURIComponent(subtaskId), { assigned_to: assignedTo });
      const sts = await fetchSubtasks(taskId);
      setSubtasksMap(m => ({ ...m, [taskId]: sts }));
      // Auto-assign: if subtask is assigned to specific people, add them to the parent task
      if (!assignedTo.includes('everyone')) {
        const res = await fetch('/api/tasks');
        const data = await res.json();
        const parentTask = (data.tasks as Task[]).find((t: Task) => t.id === taskId);
        if (parentTask) {
          const curIds = (parentTask.assigned_to as string[]).filter((x: string) => x !== 'everyone');
          const toAdd = assignedTo.filter(id => !curIds.includes(id));
          if (toAdd.length > 0 || curIds.length === 0) {
            const merged = curIds.length === 0 ? assignedTo : [...curIds, ...toAdd];
            await apiPatch('/api/tasks/' + encodeURIComponent(taskId), { assigned_to: merged });
            // Keep editingTask in sync so Save doesn't overwrite the updated assigned_to
            setEditingTask(v => v && v.id === taskId ? { ...v, assigned_to: merged } : v);
          }
        }
      }
      await load();
    } catch (e) { setStatus(e instanceof Error ? e.message : 'Could not assign sub-task.'); }
  };

  const moveRoster = async (idx: number, dir: -1 | 1) => {
    const newOrder = [...sortedRoster];
    const swapIdx = idx + dir;
    if (swapIdx < 0 || swapIdx >= newOrder.length) return;
    [newOrder[idx], newOrder[swapIdx]] = [newOrder[swapIdx], newOrder[idx]];
    try { await apiReorderRoster(newOrder.map(r => r.id)); await load(); }
    catch (e) { setStatus(e instanceof Error ? e.message : 'Could not reorder.'); }
  };

  const today = todayStr();
  const templates = tasks.filter(t => t.is_template);
  const sortedRoster = roster; // sorted by sort_order from server
  const instances = tasks.filter(t => !t.is_template);
  const pending = instances.filter(t => !t.done).sort((a, b) => {
    const aOv = (a.due_date && a.due_date < today) ? 0 : 1;
    const bOv = (b.due_date && b.due_date < today) ? 0 : 1;
    if (aOv !== bOv) return aOv - bOv;
    return (a.due_date || '9999').localeCompare(b.due_date || '9999');
  });
  const done = instances.filter(t => t.done);

  const selectedTask = tasks.find(t => t.id === selectedTaskId) || null;
  const selectTask = (task: Task) => setSelectedTaskId(prev => prev === task.id ? null : task.id);

  return (
    <section className="page-stack">
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', flexWrap: 'wrap' }}>
        {status && <span className="help-text" style={{ marginRight: 'auto' }}>{status}</span>}
        <button className="primary-button" type="button" onClick={() => { setAdding(v => v === 'task' ? null : 'task'); setEditingTask(null); setEditingRoster(null); }}>
          {adding === 'task' ? 'Cancel' : '+ Add task'}
        </button>
        {activeProfile?.role === 'Administrator' && (
          <button className="secondary-button" type="button" onClick={() => { setAdding(v => v === 'roster' ? null : 'roster'); setEditingTask(null); setEditingRoster(null); }}>
            {adding === 'roster' ? 'Cancel' : '+ Add roster item'}
          </button>
        )}
      </div>

      {adding === 'task' && (
        <div className="card">
          <div className="card-header"><div><p className="eyebrow">New task</p><h2>Add a task</h2></div></div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', alignItems: 'start' }}>
            <TaskForm value={taskDraft} onChange={(p) => setTaskDraft(v => ({ ...v, ...p }))} userProfiles={userProfiles} onSubmit={addTask} onCancel={() => setAdding(null)} submitLabel="Add task" />
            <div className="card" style={{ margin: 0 }}>
              <p style={{ margin: '0 0 0.4rem', fontSize: '0.85rem', fontWeight: 600 }}>Sub-tasks</p>
              <p style={{ fontSize: '0.82rem', opacity: 0.5, margin: 0 }}>Save the task first, then edit it to add sub-tasks.</p>
            </div>
          </div>
        </div>
      )}

      {adding === 'roster' && (
        <div className="card">
          <div className="card-header"><div><p className="eyebrow">New roster item</p><h2>Add to roster</h2></div></div>
          <RosterForm value={rosterDraft} onChange={(p) => setRosterDraft(v => ({ ...v, ...p }))} userProfiles={userProfiles} onSubmit={addRoster} onCancel={() => setAdding(null)} submitLabel="Add roster item" />
        </div>
      )}

      {editingTask && (
        <div className="card">
          <div className="card-header">
            <div><p className="eyebrow">{editingTask.is_template ? 'Edit schedule' : 'Edit task'}</p><h2>{editingTask.title}</h2></div>
            <button className="secondary-button" type="button" onClick={() => setEditingTask(null)}><X size={16} /></button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', alignItems: 'start' }}>
            <TaskForm value={editingTask} onChange={(p) => setEditingTask(v => v ? { ...v, ...p } : v)} userProfiles={userProfiles} onSubmit={saveEditTask} onCancel={() => setEditingTask(null)} submitLabel="Save changes" />
            <div className="card" style={{ margin: 0 }}>
              <p style={{ margin: '0 0 0.6rem', fontSize: '0.85rem', fontWeight: 600 }}>Sub-tasks</p>
              <TaskDetailPanel
                task={editingTask}
                subtasks={subtasksMap[editingTask.id] || []}
                userProfiles={userProfiles}
                onToggleSubtask={(sid, done) => void toggleSubtask(editingTask.id, sid, done)}
                onAddSubtask={(title, assignedTo) => void addSubtask(editingTask.id, title, assignedTo)}
                onDeleteSubtask={(sid) => void deleteMgmtSubtask(editingTask.id, sid)}
                onAssignSubtask={(sid, v) => void assignSubtask(editingTask.id, sid, v)}
                onClose={() => {}}
                embedded
              />
            </div>
          </div>
        </div>
      )}

      {editingRoster && (
        <div className="card">
          <div className="card-header">
            <div><p className="eyebrow">Edit roster item</p><h2>{editingRoster.name}</h2></div>
            <button className="secondary-button" type="button" onClick={() => setEditingRoster(null)}><X size={16} /></button>
          </div>
          <RosterForm value={editingRoster} onChange={(p) => setEditingRoster(v => v ? { ...v, ...p } : v)} userProfiles={userProfiles} onSubmit={saveEditRoster} onCancel={() => setEditingRoster(null)} submitLabel="Save changes" />
        </div>
      )}

      {roster.length > 0 && (
        <div className="card table-card">
          <div className="card-header"><div><p className="eyebrow">Daily Roster</p><h2>Rotation schedule</h2></div></div>
          <div className="roster-tiles">
            {sortedRoster.map((item, idx) => (
              <RosterCard key={item.id} item={item} userProfiles={userProfiles}
                onEdit={(r) => { setEditingRoster({ ...r }); setAdding(null); }}
                onDelete={deleteRoster} isAdmin={activeProfile?.role === 'Administrator'}
                onMoveLeft={idx > 0 ? () => moveRoster(idx, -1) : undefined}
                onMoveRight={idx < sortedRoster.length - 1 ? () => moveRoster(idx, 1) : undefined} />
            ))}
          </div>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
        <div>
          {templates.length > 0 && (
            <div className="card table-card">
              <button
                type="button"
                className="collapsible-header card-header"
                onClick={() => setSchedulesExpanded(v => !v)}
                aria-expanded={schedulesExpanded}
              >
                <div><p className="eyebrow">Schedules</p><h2>Recurring &amp; Random</h2></div>
                {schedulesExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
              </button>
              {schedulesExpanded && (
                <div className="templates-list" style={{ paddingTop: '0.5rem' }}>
                  {templates.map(t => (
                    <TemplateCard key={t.id} task={t} userProfiles={userProfiles}
                      onEdit={(task) => { setEditingTask({ ...task }); setAdding(null); }}
                      onDelete={deleteTask} />
                  ))}
                </div>
              )}
            </div>
          )}

          {pending.length > 0 && (
            <div className="card table-card">
              <div className="card-header"><div><p className="eyebrow">Pending</p><h2>Outstanding ({pending.length})</h2></div></div>
              <ul className="tasks-list">{pending.map(t => (
                <TaskRow key={t.id} task={t} userProfiles={userProfiles} onToggle={toggle}
                  onDelete={deleteTask}
                  onEdit={(task) => { setEditingTask({ ...task }); setAdding(null); setSelectedTaskId(null); }}
                  subtasks={subtasksMap[t.id]} onToggleSubtask={(sid, done) => void toggleSubtask(t.id, sid, done)}
                  onSelect={selectTask} isSelected={selectedTaskId === t.id} />
              ))}</ul>
            </div>
          )}

          {done.length > 0 && (
            <div className="card table-card">
              <div className="card-header">
                <div><p className="eyebrow">Completed</p><h2>Done ({done.length})</h2></div>
                <button className="secondary-button danger-button" type="button" onClick={() => done.forEach(t => void deleteTask(t.id))}>Clear completed</button>
              </div>
              <ul className="tasks-list">{done.map(t => (
                <TaskRow key={t.id} task={t} userProfiles={userProfiles} onToggle={toggle} onDelete={deleteTask}
                  subtasks={subtasksMap[t.id]} onToggleSubtask={(sid, done) => void toggleSubtask(t.id, sid, done)}
                  onSelect={selectTask} isSelected={selectedTaskId === t.id} />
              ))}</ul>
            </div>
          )}

          {instances.length === 0 && templates.length === 0 && roster.length === 0 && !status && (
            <div className="card" style={{ textAlign: 'center', padding: '2.5rem' }}>
              <ClipboardList size={44} style={{ opacity: 0.25, margin: '0 auto 1rem', display: 'block' }} />
              <p className="help-text">Nothing here yet. Add a task or roster item to get started.</p>
            </div>
          )}
        </div>

      </div>
    </section>
  );
}
