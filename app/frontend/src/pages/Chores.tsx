import React, { useEffect, useState } from 'react';
import type { Chore, UserProfile } from '../types';

export function ChoresPage({ activeProfile }: { activeProfile?: UserProfile }) {
  const [chores, setChores] = useState<Chore[]>([]);
  const [status, setStatus] = useState('Loading chores…');
  const [newTitle, setNewTitle] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newAssignedTo, setNewAssignedTo] = useState('everyone');

  const load = async () => {
    setStatus('Loading chores…');
    try {
      const response = await fetch('/api/chores');
      if (!response.ok) throw new Error(`Could not load chores (HTTP ${response.status}).`);
      const result = await response.json();
      setChores(Array.isArray(result.chores) ? result.chores : []);
      setStatus(result.message || 'Chores loaded.');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not load chores.');
    }
  };

  useEffect(() => { void load(); }, []);

  const addChore = async () => {
    const title = newTitle.trim();
    if (!title) return;
    setStatus('Adding chore…');
    try {
      const response = await fetch('/api/chores', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          description: newDescription.trim(),
          assigned_to: newAssignedTo.trim() || 'everyone',
          added_by: activeProfile?.name || ''
        })
      });
      if (!response.ok) throw new Error(`Could not add chore (HTTP ${response.status}).`);
      const result = await response.json();
      setChores(Array.isArray(result.chores) ? result.chores : []);
      setNewTitle('');
      setNewDescription('');
      setNewAssignedTo('everyone');
      setStatus(result.message || 'Chore added.');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not add chore.');
    }
  };

  const toggleDone = async (chore: Chore) => {
    try {
      const response = await fetch(`/api/chores/${encodeURIComponent(chore.id)}/done`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ done: !chore.done })
      });
      if (!response.ok) throw new Error(`Could not update chore (HTTP ${response.status}).`);
      setChores((current) =>
        current.map((c) => c.id === chore.id ? { ...c, done: !c.done } : c)
      );
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not update chore.');
    }
  };

  const deleteChore = async (id: string) => {
    setStatus('Deleting chore…');
    try {
      const response = await fetch(`/api/chores/${encodeURIComponent(id)}`, { method: 'DELETE' });
      if (!response.ok) throw new Error(`Could not delete chore (HTTP ${response.status}).`);
      setChores((current) => current.filter((c) => c.id !== id));
      setStatus('Chore deleted.');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not delete chore.');
    }
  };

  const pending = chores.filter((c) => !c.done);
  const done = chores.filter((c) => c.done);

  return (
    <section className="page-stack">
      <div className="card hero-card budget-hero">
        <div>
          <p className="eyebrow">Household</p>
          <h2>Chores</h2>
          <p>Track household tasks. Tick them off as you go.</p>
          <p className="help-text">{status}</p>
        </div>
      </div>

      <div className="card table-card">
        <div className="card-header">
          <div><p className="eyebrow">New chore</p><h2>Add a task</h2></div>
        </div>
        <div className="form-grid">
          <label>
            Title
            <input
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void addChore(); }}
              placeholder="e.g. Mow the lawn"
            />
          </label>
          <label>
            Assigned to
            <input
              value={newAssignedTo}
              onChange={(e) => setNewAssignedTo(e.target.value)}
              placeholder="everyone"
            />
          </label>
          <label className="span-2">
            Description
            <input
              value={newDescription}
              onChange={(e) => setNewDescription(e.target.value)}
              placeholder="Optional extra detail"
            />
          </label>
        </div>
        <div className="button-row">
          <button className="primary-button" type="button" onClick={() => void addChore()}>Add chore</button>
        </div>
      </div>

      {pending.length > 0 && (
        <div className="card table-card">
          <div className="card-header">
            <div><p className="eyebrow">To do</p><h2>Pending ({pending.length})</h2></div>
          </div>
          <ul className="chores-list">
            {pending.map((chore) => (
              <ChoreRow key={chore.id} chore={chore} onToggle={toggleDone} onDelete={deleteChore} />
            ))}
          </ul>
        </div>
      )}

      {done.length > 0 && (
        <div className="card table-card">
          <div className="card-header">
            <div><p className="eyebrow">Completed</p><h2>Done ({done.length})</h2></div>
            <button
              className="secondary-button danger-button"
              type="button"
              onClick={() => done.forEach((c) => void deleteChore(c.id))}
            >
              Clear completed
            </button>
          </div>
          <ul className="chores-list">
            {done.map((chore) => (
              <ChoreRow key={chore.id} chore={chore} onToggle={toggleDone} onDelete={deleteChore} />
            ))}
          </ul>
        </div>
      )}

      {chores.length === 0 && (
        <div className="card">
          <p className="help-text">No chores yet. Add one above to get started.</p>
        </div>
      )}
    </section>
  );
}

function ChoreRow({
  chore,
  onToggle,
  onDelete
}: {
  chore: Chore;
  onToggle: (chore: Chore) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <li className={`chore-row${chore.done ? ' chore-done' : ''}`}>
      <button
        className="chore-circle"
        type="button"
        aria-label={chore.done ? 'Mark as not done' : 'Mark as done'}
        onClick={() => onToggle(chore)}
      />
      <div className="chore-info">
        <strong>{chore.title}</strong>
        {chore.description && <span className="chore-description">{chore.description}</span>}
        <span className="chore-meta">
          {chore.assigned_to !== 'everyone' ? `Assigned to ${chore.assigned_to}` : 'Everyone'}
          {chore.added_by ? ` · Added by ${chore.added_by}` : ''}
        </span>
      </div>
      <button
        className="secondary-button danger-button"
        type="button"
        onClick={() => onDelete(chore.id)}
      >
        Delete
      </button>
    </li>
  );
}
