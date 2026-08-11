'use client';

import * as React from 'react';
import { PageHeader } from '@/components/shell/page-header';
import { ModuleGate } from '@/components/shell/access-denied';

// ─── Types ────────────────────────────────────────────────────────────────────

interface PlaybookStep {
  id: string; stepOrder: number; title: string; description: string;
  responsible: string; estimatedHours?: number | null; evidence?: string | null;
}
interface Playbook {
  id: string; ref: string; category: string; title: string; description: string;
  framework: string; status: string; version: number; createdBy: string;
  createdAt: string; stepCount?: number; steps?: PlaybookStep[];
}
interface Category {
  key: string; label: string; framework: string; count: number;
}

const RESPONSIBLE_OPTIONS = ['CISO', 'IR_TEAM', 'SYSADMIN', 'LEGAL', 'EXEC', 'VENDOR'];
const FRAMEWORK_OPTIONS = ['FedRAMP', 'CMMC', 'HIPAA', 'General'];

const STATUS_STYLES: Record<string, string> = {
  active: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  draft: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
  archived: 'bg-gray-100 text-gray-600 dark:bg-gray-800/50 dark:text-gray-400',
};

// ─── Create playbook modal ────────────────────────────────────────────────────

function CreatePlaybookModal({ categories, onClose, onCreate }: {
  categories: Category[]; onClose: () => void; onCreate: (pb: Playbook) => void;
}) {
  const [category, setCategory] = React.useState(categories[0]?.key ?? '');
  const [title, setTitle] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [framework, setFramework] = React.useState('General');
  const [steps, setSteps] = React.useState<Array<{ title: string; description: string; responsible: string; estimatedHours?: number | undefined }>>([]);
  const [saving, setSaving] = React.useState(false);

  const addStep = () => setSteps(s => [...s, { title: '', description: '', responsible: 'CISO' }]);
  const updateStep = (i: number, patch: Partial<typeof steps[0]>) => setSteps(s => s.map((st, j) => j === i ? { ...st, ...patch } : st));
  const removeStep = (i: number) => setSteps(s => s.filter((_, j) => j !== i));

  const save = async () => {
    if (!title.trim() || !category) return;
    setSaving(true);
    try {
      const res = await fetch('/api/v1/grc-playbooks/playbooks', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category, title, description, framework, steps }),
      });
      if (res.ok) { onCreate(await res.json() as Playbook); onClose(); }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl bg-[var(--surface-base)] shadow-2xl">
        <div className="flex items-center justify-between border-b border-[var(--border-subtle)] p-4">
          <h2 className="font-semibold text-[var(--ink-primary)]">Create Playbook</h2>
          <button onClick={onClose} className="rounded-md p-1 text-[var(--ink-tertiary)] hover:bg-[var(--surface-overlay)]">✕</button>
        </div>
        <div className="space-y-4 p-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-[var(--ink-secondary)]">Category</label>
              <select value={category} onChange={e => setCategory(e.target.value)}
                className="mt-1 w-full rounded-md border border-[var(--border-subtle)] bg-[var(--surface-overlay)] px-3 py-2 text-sm focus:border-[var(--brand-500)] focus:outline-none">
                {categories.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--ink-secondary)]">Framework</label>
              <select value={framework} onChange={e => setFramework(e.target.value)}
                className="mt-1 w-full rounded-md border border-[var(--border-subtle)] bg-[var(--surface-overlay)] px-3 py-2 text-sm focus:border-[var(--brand-500)] focus:outline-none">
                {FRAMEWORK_OPTIONS.map(f => <option key={f} value={f}>{f}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-[var(--ink-secondary)]">Title</label>
            <input value={title} onChange={e => setTitle(e.target.value)}
              className="mt-1 w-full rounded-md border border-[var(--border-subtle)] bg-[var(--surface-overlay)] px-3 py-2 text-sm focus:border-[var(--brand-500)] focus:outline-none" placeholder="Playbook title…" />
          </div>
          <div>
            <label className="block text-xs font-medium text-[var(--ink-secondary)]">Description</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} rows={3}
              className="mt-1 w-full rounded-md border border-[var(--border-subtle)] bg-[var(--surface-overlay)] px-3 py-2 text-sm focus:border-[var(--brand-500)] focus:outline-none" placeholder="What does this playbook address?" />
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <label className="text-xs font-medium text-[var(--ink-secondary)]">Steps ({steps.length})</label>
              <button onClick={addStep} className="text-xs font-medium text-[var(--brand-600)] hover:underline">+ Add step</button>
            </div>
            {steps.map((step, i) => (
              <div key={i} className="mb-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-3">
                <div className="mb-2 flex items-center gap-2">
                  <span className="text-xs font-bold text-[var(--ink-tertiary)]">Step {i + 1}</span>
                  <button onClick={() => removeStep(i)} className="ml-auto text-xs text-[var(--ink-tertiary)] hover:text-red-500">Remove</button>
                </div>
                <input value={step.title} onChange={e => updateStep(i, { title: e.target.value })} placeholder="Step title"
                  className="mb-2 w-full rounded border border-[var(--border-subtle)] bg-[var(--surface-overlay)] px-2 py-1.5 text-xs focus:border-[var(--brand-500)] focus:outline-none" />
                <textarea value={step.description} onChange={e => updateStep(i, { description: e.target.value })} rows={2} placeholder="Step description"
                  className="mb-2 w-full rounded border border-[var(--border-subtle)] bg-[var(--surface-overlay)] px-2 py-1.5 text-xs focus:border-[var(--brand-500)] focus:outline-none" />
                <div className="flex gap-2">
                  <select value={step.responsible} onChange={e => updateStep(i, { responsible: e.target.value })}
                    className="rounded border border-[var(--border-subtle)] bg-[var(--surface-overlay)] px-2 py-1 text-xs focus:border-[var(--brand-500)] focus:outline-none">
                    {RESPONSIBLE_OPTIONS.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                  <input type="number" value={step.estimatedHours ?? ''} onChange={e => updateStep(i, { estimatedHours: e.target.value ? Number(e.target.value) : undefined })}
                    placeholder="Hours" min="0" step="0.5"
                    className="w-24 rounded border border-[var(--border-subtle)] bg-[var(--surface-overlay)] px-2 py-1 text-xs focus:border-[var(--brand-500)] focus:outline-none" />
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-[var(--border-subtle)] p-4">
          <button onClick={onClose} className="rounded-md border border-[var(--border-subtle)] px-4 py-2 text-sm text-[var(--ink-secondary)] hover:bg-[var(--surface-overlay)]">Cancel</button>
          <button onClick={() => void save()} disabled={saving || !title.trim()}
            className="rounded-md bg-[var(--brand-600)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--brand-700)] disabled:opacity-50">
            {saving ? 'Creating…' : 'Create Playbook'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Playbook detail view ─────────────────────────────────────────────────────

function PlaybookDetail({ playbook, onClose }: { playbook: Playbook; onClose: () => void }) {
  const [generatingPolicy, setGeneratingPolicy] = React.useState(false);
  const [policyText, setPolicyText] = React.useState<string | null>(null);

  const generatePolicy = async () => {
    setGeneratingPolicy(true);
    try {
      const res = await fetch(`/api/v1/grc-playbooks/playbooks/${playbook.id}/generate-policy`, { method: 'POST' });
      if (res.ok) {
        const d = await res.json() as { title: string; policyText: string };
        setPolicyText(d.policyText);
      }
    } finally {
      setGeneratingPolicy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/40" onClick={onClose} />
      <div className="flex h-full w-full max-w-xl flex-col overflow-y-auto bg-[var(--surface-base)] shadow-2xl">
        <div className="flex items-start justify-between border-b border-[var(--border-subtle)] p-4">
          <div>
            <p className="font-mono text-xs text-[var(--ink-tertiary)]">{playbook.ref} · {playbook.category} · v{playbook.version}</p>
            <h2 className="mt-1 font-semibold text-[var(--ink-primary)]">{playbook.title}</h2>
          </div>
          <button onClick={onClose} className="ml-4 p-1 text-[var(--ink-tertiary)] hover:bg-[var(--surface-overlay)] rounded-md">✕</button>
        </div>
        <div className="flex-1 p-4 space-y-4">
          <p className="text-sm text-[var(--ink-secondary)]">{playbook.description}</p>

          <div className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--ink-tertiary)]">Steps</h3>
            {(playbook.steps ?? []).map((step, i) => (
              <div key={step.id} className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-3">
                <div className="flex items-start gap-2">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[var(--brand-600)] text-[10px] font-bold text-white shrink-0">{i + 1}</span>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-sm text-[var(--ink-primary)]">{step.title}</p>
                    <p className="mt-0.5 text-xs text-[var(--ink-secondary)]">{step.description}</p>
                    <div className="mt-2 flex flex-wrap gap-3 text-xs text-[var(--ink-tertiary)]">
                      <span>Responsible: <strong className="text-[var(--ink-secondary)]">{step.responsible}</strong></span>
                      {step.estimatedHours && <span>Est: <strong className="text-[var(--ink-secondary)]">{step.estimatedHours}h</strong></span>}
                    </div>
                  </div>
                </div>
              </div>
            ))}
            {(playbook.steps ?? []).length === 0 && (
              <p className="text-xs text-[var(--ink-tertiary)]">No steps defined.</p>
            )}
          </div>

          {policyText ? (
            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--ink-tertiary)]">Generated Policy</h3>
              <pre className="overflow-x-auto rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-sunken)] p-3 text-xs text-[var(--ink-secondary)] whitespace-pre-wrap">{policyText}</pre>
              <button onClick={() => setPolicyText(null)} className="mt-2 text-xs text-[var(--ink-tertiary)] hover:text-[var(--ink-primary)]">✕ Close policy</button>
            </div>
          ) : (
            <button onClick={() => void generatePolicy()} disabled={generatingPolicy}
              className="w-full rounded-lg border border-[var(--border-subtle)] py-2 text-sm font-medium text-[var(--ink-secondary)] hover:bg-[var(--surface-overlay)] disabled:opacity-50">
              {generatingPolicy ? 'Generating…' : '📄 Generate Policy Document'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main content ─────────────────────────────────────────────────────────────

function PlaybooksContent() {
  const [categories, setCategories] = React.useState<Category[]>([]);
  const [playbooks, setPlaybooks] = React.useState<Playbook[]>([]);
  const [selectedCategory, setSelectedCategory] = React.useState<string | null>(null);
  const [selectedPlaybook, setSelectedPlaybook] = React.useState<Playbook | null>(null);
  const [showCreate, setShowCreate] = React.useState(false);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    void fetch('/api/v1/grc-playbooks/categories').then(async r => {
      if (r.ok) setCategories(await r.json() as Category[]);
    });
  }, []);

  React.useEffect(() => {
    if (!selectedCategory) { setPlaybooks([]); return; }
    setLoading(true);
    void fetch(`/api/v1/grc-playbooks/playbooks?category=${selectedCategory}&limit=50`)
      .then(async r => { if (r.ok) setPlaybooks(await r.json().then((d: { playbooks: Playbook[] }) => d.playbooks ?? [])); })
      .finally(() => setLoading(false));
  }, [selectedCategory]);

  const openPlaybook = async (pb: Playbook) => {
    const res = await fetch(`/api/v1/grc-playbooks/playbooks/${pb.id}`);
    if (res.ok) setSelectedPlaybook(await res.json() as Playbook);
  };

  const FRAMEWORK_COLORS: Record<string, string> = {
    FedRAMP: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
    CMMC: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
    HIPAA: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
    General: 'bg-gray-100 text-gray-600 dark:bg-gray-800/50 dark:text-gray-400',
  };

  return (
    <div className="space-y-6">
      {/* Category grid */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-[var(--ink-primary)]">Playbook Categories</h2>
          <button onClick={() => setShowCreate(true)}
            className="rounded-md bg-[var(--brand-600)] px-3 py-1.5 text-xs font-medium text-white hover:bg-[var(--brand-700)]">
            + Create Playbook
          </button>
        </div>
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-5">
          {categories.map(cat => (
            <button key={cat.key} onClick={() => setSelectedCategory(s => s === cat.key ? null : cat.key)}
              className={`rounded-xl border p-3 text-left transition-all ${selectedCategory === cat.key ? 'border-[var(--brand-600)] bg-[var(--brand-50)] dark:bg-[var(--brand-900)]/10' : 'border-[var(--border-subtle)] bg-[var(--surface-raised)] hover:border-[var(--brand-400)]'}`}>
              <p className="text-xs font-semibold text-[var(--ink-primary)]">{cat.label}</p>
              <p className="mt-1 text-[10px] text-[var(--ink-tertiary)]">{cat.count} playbook{cat.count !== 1 ? 's' : ''}</p>
              <span className={`mt-1.5 inline-block rounded px-1.5 py-0.5 text-[9px] font-medium ${FRAMEWORK_COLORS[cat.framework] ?? FRAMEWORK_COLORS.General}`}>{cat.framework}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Playbook list */}
      {selectedCategory && (
        <div>
          <h2 className="mb-3 text-sm font-semibold text-[var(--ink-primary)]">
            {categories.find(c => c.key === selectedCategory)?.label} Playbooks
          </h2>
          {loading ? (
            <div className="flex h-32 items-center justify-center">
              <div className="h-7 w-7 animate-spin rounded-full border-2 border-[var(--brand-500)] border-t-transparent" />
            </div>
          ) : playbooks.length === 0 ? (
            <div className="flex h-32 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-[var(--border-subtle)] text-sm text-[var(--ink-tertiary)]">
              <span>No playbooks in this category yet.</span>
              <button onClick={() => setShowCreate(true)} className="text-[var(--brand-600)] hover:underline text-xs">Create one →</button>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {playbooks.map(pb => (
                <div key={pb.id} className="cursor-pointer rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-4 hover:border-[var(--brand-400)]" onClick={() => void openPlaybook(pb)}>
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-sm text-[var(--ink-primary)] truncate">{pb.title}</p>
                      <p className="mt-0.5 text-xs text-[var(--ink-tertiary)] font-mono">{pb.ref} · v{pb.version}</p>
                    </div>
                    <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${STATUS_STYLES[pb.status] ?? STATUS_STYLES.draft}`}>{pb.status}</span>
                  </div>
                  <p className="mt-2 line-clamp-2 text-xs text-[var(--ink-secondary)]">{pb.description}</p>
                  <div className="mt-2 flex items-center gap-3 text-[10px] text-[var(--ink-tertiary)]">
                    <span>{pb.stepCount ?? 0} steps</span>
                    <span className={`rounded px-1.5 py-0.5 ${FRAMEWORK_COLORS[pb.framework] ?? FRAMEWORK_COLORS.General}`}>{pb.framework}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {showCreate && categories.length > 0 && (
        <CreatePlaybookModal categories={categories} onClose={() => setShowCreate(false)}
          onCreate={pb => { setPlaybooks(prev => [pb, ...prev]); }} />
      )}
      {selectedPlaybook && (
        <PlaybookDetail playbook={selectedPlaybook} onClose={() => setSelectedPlaybook(null)} />
      )}
    </div>
  );
}

export default function PlaybooksPage() {
  return (
    <ModuleGate module="itsec" prettyName="IT & Security">
      <PageHeader
        eyebrow="IT & Security · GRC"
        title="Remediation Playbooks"
        description="15 playbook categories with step-by-step procedures and auto-generated policy documents."
      />
      <PlaybooksContent />
    </ModuleGate>
  );
}
