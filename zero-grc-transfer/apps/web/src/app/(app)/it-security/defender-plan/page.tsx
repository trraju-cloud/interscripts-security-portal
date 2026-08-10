'use client';

import * as React from 'react';
import { PageHeader } from '@/components/shell/page-header';
import { ModuleGate } from '@/components/shell/access-denied';

// ─── Types ────────────────────────────────────────────────────────────────────

type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'not_applicable' | 'deferred';
type TaskPriority = 'P1' | 'P2' | 'P3';
type TaskCategory = 'IDENTITY' | 'ENDPOINT' | 'APPS' | 'DATA' | 'INFRA' | 'IOT' | 'NETWORK' | 'COLLAB';

interface DefenderTask {
  id: string; taskRef: string; category: TaskCategory; priority: TaskPriority;
  title: string; description: string; status: TaskStatus;
  assignedTo?: string | null; dueDate?: string | null; notes?: string | null; completedAt?: string | null;
}
interface TaskStats {
  total: number;
  byPriority: Record<TaskPriority, number>;
  byStatus: Record<TaskStatus, number>;
  byCategory: Record<TaskCategory, number>;
  percentComplete: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const CATEGORIES: TaskCategory[] = ['IDENTITY', 'ENDPOINT', 'APPS', 'DATA', 'INFRA', 'IOT', 'NETWORK', 'COLLAB'];
const PRIORITIES: TaskPriority[] = ['P1', 'P2', 'P3'];

const STATUS_STYLES: Record<TaskStatus, string> = {
  completed: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  in_progress: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  pending: 'bg-gray-100 text-gray-700 dark:bg-gray-800/50 dark:text-gray-300',
  not_applicable: 'bg-slate-100 text-slate-600 dark:bg-slate-800/50 dark:text-slate-400',
  deferred: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
};

const PRIORITY_STYLES: Record<TaskPriority, string> = {
  P1: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  P2: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
  P3: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300',
};

// ─── Task card ────────────────────────────────────────────────────────────────

function TaskCard({ task, onUpdate }: { task: DefenderTask; onUpdate: (ref: string, patch: Partial<DefenderTask>) => void }) {
  const [notesOpen, setNotesOpen] = React.useState(false);
  const [notes, setNotes] = React.useState(task.notes ?? '');
  const [saving, setSaving] = React.useState(false);

  const patch = async (data: Partial<DefenderTask>) => {
    setSaving(true);
    try {
      const res = await fetch(`/api/v1/grc-defender/tasks/${task.taskRef}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
      });
      if (res.ok) onUpdate(task.taskRef, data);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={`rounded-lg border bg-[var(--surface-raised)] p-4 transition-opacity ${saving ? 'opacity-60' : ''} ${task.status === 'completed' ? 'border-green-200 dark:border-green-900/50' : 'border-[var(--border-subtle)]'}`}>
      <div className="flex flex-wrap items-start gap-2">
        <span className="font-mono text-xs text-[var(--ink-tertiary)]">{task.taskRef}</span>
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${PRIORITY_STYLES[task.priority]}`}>{task.priority}</span>
        <span className="rounded-full bg-[var(--surface-sunken)] px-2 py-0.5 text-[10px] font-medium text-[var(--ink-tertiary)]">{task.category}</span>
        <div className="ml-auto">
          <select
            value={task.status}
            onChange={e => void patch({ status: e.target.value as TaskStatus })}
            className={`rounded-full border-0 px-2 py-0.5 text-[10px] font-semibold uppercase ring-1 ring-inset ring-transparent focus:outline-none ${STATUS_STYLES[task.status]}`}
          >
            {(['pending','in_progress','completed','not_applicable','deferred'] as TaskStatus[]).map(s => (
              <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
            ))}
          </select>
        </div>
      </div>

      <h3 className="mt-2 text-sm font-semibold text-[var(--ink-primary)]">{task.title}</h3>
      <p className="mt-1 line-clamp-2 text-xs text-[var(--ink-secondary)]">{task.description}</p>

      <div className="mt-3 flex flex-wrap items-center gap-3 text-xs">
        <label className="flex items-center gap-1 text-[var(--ink-tertiary)]">
          Assigned:
          <input
            defaultValue={task.assignedTo ?? ''}
            placeholder="—"
            onBlur={e => { if (e.target.value !== (task.assignedTo ?? '')) void patch({ assignedTo: e.target.value || undefined }); }}
            className="ml-1 min-w-0 flex-1 border-0 border-b border-[var(--border-subtle)] bg-transparent py-0.5 text-[var(--ink-primary)] placeholder:text-[var(--ink-tertiary)] focus:border-[var(--brand-500)] focus:outline-none"
          />
        </label>
        <label className="flex items-center gap-1 text-[var(--ink-tertiary)]">
          Due:
          <input
            type="date"
            defaultValue={task.dueDate?.slice(0, 10) ?? ''}
            onBlur={e => { if (e.target.value !== (task.dueDate?.slice(0, 10) ?? '')) void patch({ dueDate: e.target.value || undefined }); }}
            className="border-0 border-b border-[var(--border-subtle)] bg-transparent text-[var(--ink-primary)] focus:border-[var(--brand-500)] focus:outline-none"
          />
        </label>
        <button onClick={() => setNotesOpen(o => !o)} className="text-[var(--ink-tertiary)] hover:text-[var(--ink-primary)]">
          {notesOpen ? '▲ hide notes' : '▼ notes'}
        </button>
      </div>

      {notesOpen && (
        <div className="mt-3">
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            onBlur={() => { if (notes !== (task.notes ?? '')) void patch({ notes: notes || undefined }); }}
            rows={3}
            className="w-full rounded-md border border-[var(--border-subtle)] bg-[var(--surface-overlay)] px-3 py-2 text-xs text-[var(--ink-primary)] placeholder:text-[var(--ink-tertiary)] focus:border-[var(--brand-500)] focus:outline-none"
            placeholder="Add notes..."
          />
        </div>
      )}
    </div>
  );
}

// ─── Progress bar ──────────────────────────────────────────────────────────────

function ProgressBar({ value, label, color = 'bg-[var(--brand-500)]' }: { value: number; label: string; color?: string }) {
  return (
    <div>
      <div className="flex justify-between text-xs text-[var(--ink-tertiary)]">
        <span>{label}</span><span>{Math.round(value)}%</span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[var(--surface-sunken)]">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(value, 100)}%` }} />
      </div>
    </div>
  );
}

// ─── Main content ─────────────────────────────────────────────────────────────

function DefenderPlanContent() {
  const [tasks, setTasks] = React.useState<DefenderTask[]>([]);
  const [stats, setStats] = React.useState<TaskStats | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [categoryFilter, setCategoryFilter] = React.useState<TaskCategory | 'ALL'>('ALL');
  const [priorityFilter, setPriorityFilter] = React.useState<TaskPriority | 'ALL'>('ALL');
  const [seeding, setSeeding] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/v1/grc-defender/tasks');
      if (res.ok) {
        const d = await res.json() as { tasks: DefenderTask[]; stats: TaskStats };
        setTasks(d.tasks ?? []);
        setStats(d.stats ?? null);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => { void load(); }, [load]);

  const handleUpdate = (ref: string, patch: Partial<DefenderTask>) => {
    setTasks(prev => prev.map(t => t.taskRef === ref ? { ...t, ...patch } : t));
  };

  const seedTasks = async () => {
    setSeeding(true);
    try {
      await fetch('/api/v1/grc-defender/tasks/seed', { method: 'POST' });
      await load();
    } finally {
      setSeeding(false);
    }
  };

  const filtered = tasks.filter(t =>
    (categoryFilter === 'ALL' || t.category === categoryFilter) &&
    (priorityFilter === 'ALL' || t.priority === priorityFilter),
  );

  return (
    <div className="space-y-6">
      {/* Stats strip */}
      {stats && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-4">
            <p className="text-xs text-[var(--ink-tertiary)] uppercase tracking-wide">Overall</p>
            <p className="text-3xl font-bold text-[var(--ink-primary)]">{Math.round(stats.percentComplete)}%</p>
          </div>
          {PRIORITIES.map(p => {
            const pTotal = stats.byPriority[p] ?? 0;
            const pDone = tasks.filter(t => t.priority === p && t.status === 'completed').length;
            const pPct = pTotal > 0 ? (pDone / pTotal) * 100 : 0;
            const colors = { P1: 'text-red-600', P2: 'text-orange-600', P3: 'text-yellow-600' };
            return (
              <div key={p} className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-4">
                <p className={`text-xs font-bold uppercase tracking-wide ${colors[p]}`}>{p} Tasks</p>
                <p className="text-3xl font-bold text-[var(--ink-primary)]">{Math.round(pPct)}%</p>
                <p className="text-xs text-[var(--ink-tertiary)]">{pDone}/{pTotal} complete</p>
              </div>
            );
          })}
        </div>
      )}

      {/* Progress bars */}
      {stats && (
        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-4">
          <h2 className="mb-3 text-sm font-semibold">Progress by Category</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {CATEGORIES.map(cat => {
              const catTotal = tasks.filter(t => t.category === cat).length;
              const catDone = tasks.filter(t => t.category === cat && t.status === 'completed').length;
              const pct = catTotal > 0 ? (catDone / catTotal) * 100 : 0;
              return <ProgressBar key={cat} label={cat} value={pct} />;
            })}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <div className="flex overflow-hidden rounded-lg border border-[var(--border-subtle)]">
          <button onClick={() => setCategoryFilter('ALL')} className={`px-3 py-1.5 text-xs font-medium ${categoryFilter === 'ALL' ? 'bg-[var(--brand-600)] text-white' : 'text-[var(--ink-secondary)] hover:bg-[var(--surface-overlay)]'}`}>ALL</button>
          {CATEGORIES.map(c => (
            <button key={c} onClick={() => setCategoryFilter(c)} className={`px-3 py-1.5 text-xs font-medium ${categoryFilter === c ? 'bg-[var(--brand-600)] text-white' : 'text-[var(--ink-secondary)] hover:bg-[var(--surface-overlay)]'}`}>{c}</button>
          ))}
        </div>
        <div className="flex overflow-hidden rounded-lg border border-[var(--border-subtle)]">
          {(['ALL', ...PRIORITIES] as const).map(p => (
            <button key={p} onClick={() => setPriorityFilter(p as typeof priorityFilter)} className={`px-3 py-1.5 text-xs font-medium ${priorityFilter === p ? 'bg-[var(--brand-600)] text-white' : 'text-[var(--ink-secondary)] hover:bg-[var(--surface-overlay)]'}`}>{p}</button>
          ))}
        </div>
        {tasks.length === 0 && (
          <button onClick={() => void seedTasks()} disabled={seeding} className="ml-auto rounded-lg border border-[var(--border-subtle)] px-3 py-1.5 text-xs font-medium text-[var(--ink-secondary)] hover:bg-[var(--surface-overlay)] disabled:opacity-50">
            {seeding ? 'Seeding…' : 'Seed 44 Tasks'}
          </button>
        )}
      </div>

      {/* Task list */}
      {loading ? (
        <div className="flex h-40 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--brand-500)] border-t-transparent" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex h-40 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-[var(--border-subtle)] text-sm text-[var(--ink-tertiary)]">
          <span>No tasks match the current filter.</span>
          {tasks.length === 0 && <span>Click "Seed 44 Tasks" to load the Defender 90-day plan.</span>}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {filtered.map(t => <TaskCard key={t.id} task={t} onUpdate={handleUpdate} />)}
        </div>
      )}
    </div>
  );
}

export default function DefenderPlanPage() {
  return (
    <ModuleGate module="itsec" prettyName="IT & Security">
      <PageHeader
        eyebrow="IT & Security · GRC"
        title="Defender 90-Day Remediation Plan"
        description="44 prioritised tasks across Identity, Endpoint, Apps, Data, Infrastructure, IoT, Network, and Collaboration."
      />
      <DefenderPlanContent />
    </ModuleGate>
  );
}
