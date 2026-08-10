'use client';

import * as React from 'react';
import { PageHeader } from '@/components/shell/page-header';
import { ModuleGate } from '@/components/shell/access-denied';

// ─── Types ────────────────────────────────────────────────────────────────────

type AssessmentStatus = 'not_started' | 'in_progress' | 'implemented' | 'not_applicable' | 'inherited';

interface FrameworkStats {
  implemented: number; in_progress: number; not_started: number; not_applicable: number; inherited: number; percentComplete: number;
}
interface Framework {
  key: string; name: string; version: string; totalControls: number; enabledAt: string; stats: FrameworkStats;
}
interface ControlAssessment {
  status: AssessmentStatus; implementationNote?: string | null; evidenceLinks: string[];
  assessedBy?: string | null; assessedAt?: string | null; nextReviewAt?: string | null;
}
interface Control {
  id: string; controlId: string; family: string; title: string; description: string;
  priority: string; baseline: string; assessment: ControlAssessment;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const FRAMEWORK_OPTIONS = [
  { key: 'fedramp_20x', name: 'FedRAMP 20x', version: '2026', description: '18 families · 60+ controls' },
  { key: 'cmmc_l2', name: 'CMMC Level 2', version: '2.0', description: '15 domains · 35+ practices' },
];

const STATUS_LABELS: Record<AssessmentStatus, string> = {
  not_started: 'Not Started', in_progress: 'In Progress', implemented: 'Implemented',
  not_applicable: 'N/A', inherited: 'Inherited',
};
const STATUS_STYLES: Record<AssessmentStatus, string> = {
  implemented: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  in_progress: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
  not_started: 'bg-gray-100 text-gray-600 dark:bg-gray-800/50 dark:text-gray-400',
  not_applicable: 'bg-slate-100 text-slate-500 dark:bg-slate-800/50 dark:text-slate-500',
  inherited: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
};

// ─── Assessment drawer ────────────────────────────────────────────────────────

function AssessmentDrawer({ control, frameworkKey, onClose, onSave }: {
  control: Control; frameworkKey: string; onClose: () => void;
  onSave: (controlId: string, data: Partial<ControlAssessment>) => void;
}) {
  const [status, setStatus] = React.useState<AssessmentStatus>(control.assessment.status);
  const [note, setNote] = React.useState(control.assessment.implementationNote ?? '');
  const [evidenceInput, setEvidenceInput] = React.useState('');
  const [evidenceLinks, setEvidenceLinks] = React.useState<string[]>(control.assessment.evidenceLinks ?? []);
  const [nextReview, setNextReview] = React.useState(control.assessment.nextReviewAt?.slice(0, 10) ?? '');
  const [saving, setSaving] = React.useState(false);

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/v1/grc-frameworks/frameworks/${frameworkKey}/controls/${encodeURIComponent(control.controlId)}/assessment`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, implementationNote: note || undefined, evidenceLinks, nextReviewAt: nextReview || undefined }),
      });
      if (res.ok) {
        onSave(control.controlId, { status, implementationNote: note, evidenceLinks, nextReviewAt: nextReview });
        onClose();
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/40" onClick={onClose} />
      <div className="flex h-full w-full max-w-lg flex-col overflow-y-auto bg-[var(--surface-base)] shadow-2xl">
        <div className="flex items-start justify-between border-b border-[var(--border-subtle)] p-4">
          <div>
            <p className="font-mono text-xs text-[var(--ink-tertiary)]">{control.controlId} · {control.family}</p>
            <h2 className="mt-1 text-sm font-semibold text-[var(--ink-primary)]">{control.title}</h2>
          </div>
          <button onClick={onClose} className="ml-4 rounded-md p-1 text-[var(--ink-tertiary)] hover:bg-[var(--surface-overlay)]">✕</button>
        </div>
        <div className="flex-1 space-y-4 p-4">
          <p className="text-xs text-[var(--ink-secondary)]">{control.description}</p>

          <div>
            <label className="block text-xs font-medium text-[var(--ink-secondary)]">Assessment Status</label>
            <select value={status} onChange={e => setStatus(e.target.value as AssessmentStatus)}
              className="mt-1 w-full rounded-md border border-[var(--border-subtle)] bg-[var(--surface-overlay)] px-3 py-2 text-sm focus:border-[var(--brand-500)] focus:outline-none">
              {(Object.keys(STATUS_LABELS) as AssessmentStatus[]).map(s => (
                <option key={s} value={s}>{STATUS_LABELS[s]}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-[var(--ink-secondary)]">Implementation Notes</label>
            <textarea value={note} onChange={e => setNote(e.target.value)} rows={4}
              className="mt-1 w-full rounded-md border border-[var(--border-subtle)] bg-[var(--surface-overlay)] px-3 py-2 text-sm focus:border-[var(--brand-500)] focus:outline-none"
              placeholder="Describe how this control is implemented…" />
          </div>

          <div>
            <label className="block text-xs font-medium text-[var(--ink-secondary)]">Evidence Links</label>
            <div className="mt-1 flex gap-2">
              <input value={evidenceInput} onChange={e => setEvidenceInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && evidenceInput.trim()) { setEvidenceLinks(l => [...l, evidenceInput.trim()]); setEvidenceInput(''); e.preventDefault(); } }}
                className="flex-1 rounded-md border border-[var(--border-subtle)] bg-[var(--surface-overlay)] px-3 py-1.5 text-sm focus:border-[var(--brand-500)] focus:outline-none" placeholder="URL or reference (Enter to add)" />
            </div>
            {evidenceLinks.length > 0 && (
              <ul className="mt-2 space-y-1">
                {evidenceLinks.map((link, i) => (
                  <li key={i} className="flex items-center gap-2 text-xs">
                    <span className="flex-1 truncate text-[var(--brand-600)]">{link}</span>
                    <button onClick={() => setEvidenceLinks(l => l.filter((_, j) => j !== i))} className="text-[var(--ink-tertiary)] hover:text-red-500">✕</button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-[var(--ink-secondary)]">Next Review Date</label>
            <input type="date" value={nextReview} onChange={e => setNextReview(e.target.value)}
              className="mt-1 rounded-md border border-[var(--border-subtle)] bg-[var(--surface-overlay)] px-3 py-1.5 text-sm focus:border-[var(--brand-500)] focus:outline-none" />
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-[var(--border-subtle)] p-4">
          <button onClick={onClose} className="rounded-md border border-[var(--border-subtle)] px-4 py-2 text-sm text-[var(--ink-secondary)] hover:bg-[var(--surface-overlay)]">Cancel</button>
          <button onClick={() => void save()} disabled={saving} className="rounded-md bg-[var(--brand-600)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--brand-700)] disabled:opacity-50">
            {saving ? 'Saving…' : 'Save Assessment'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Donut-like stats strip ───────────────────────────────────────────────────

function StatsStrip({ stats }: { stats: FrameworkStats }) {
  const segments = [
    { key: 'implemented', label: 'Implemented', count: stats.implemented, color: 'bg-green-500' },
    { key: 'in_progress', label: 'In Progress', count: stats.in_progress, color: 'bg-yellow-400' },
    { key: 'inherited', label: 'Inherited', count: stats.inherited, color: 'bg-blue-400' },
    { key: 'not_applicable', label: 'N/A', count: stats.not_applicable, color: 'bg-slate-300 dark:bg-slate-600' },
    { key: 'not_started', label: 'Not Started', count: stats.not_started, color: 'bg-gray-200 dark:bg-gray-700' },
  ];
  return (
    <div className="flex flex-wrap items-center gap-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-4">
      <div className="flex items-center gap-2">
        <span className="text-4xl font-extrabold text-[var(--ink-primary)]">{Math.round(stats.percentComplete)}%</span>
        <span className="text-sm text-[var(--ink-tertiary)]">implemented</span>
      </div>
      <div className="h-8 w-px bg-[var(--border-subtle)]" />
      <div className="flex flex-wrap gap-4">
        {segments.map(s => (
          <div key={s.key} className="flex items-center gap-1.5">
            <span className={`h-2.5 w-2.5 rounded-full ${s.color}`} />
            <span className="text-xs text-[var(--ink-secondary)]">{s.label}</span>
            <span className="text-xs font-semibold text-[var(--ink-primary)]">{s.count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main content ─────────────────────────────────────────────────────────────

function ComplianceContent() {
  const [frameworks, setFrameworks] = React.useState<Framework[]>([]);
  const [selectedKey, setSelectedKey] = React.useState<string | null>(null);
  const [controls, setControls] = React.useState<Control[]>([]);
  const [families, setFamilies] = React.useState<string[]>([]);
  const [familyFilter, setFamilyFilter] = React.useState('');
  const [statusFilter, setStatusFilter] = React.useState('');
  const [search, setSearch] = React.useState('');
  const [selectedControl, setSelectedControl] = React.useState<Control | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [enabling, setEnabling] = React.useState<string | null>(null);
  const [exporting, setExporting] = React.useState(false);

  React.useEffect(() => {
    void fetch('/api/v1/grc-frameworks/frameworks').then(async r => {
      if (r.ok) {
        const d = await r.json() as { frameworks: Framework[] };
        setFrameworks(d.frameworks ?? []);
      }
    });
  }, []);

  const loadControls = async (key: string) => {
    setLoading(true);
    setControls([]);
    setFamilies([]);
    try {
      const res = await fetch(`/api/v1/grc-frameworks/frameworks/${key}/controls?limit=200`);
      if (res.ok) {
        const d = await res.json() as { controls: Control[]; families: string[] };
        setControls(d.controls ?? []);
        setFamilies(d.families ?? []);
      }
    } finally {
      setLoading(false);
    }
  };

  const enableFramework = async (key: string) => {
    setEnabling(key);
    try {
      const res = await fetch(`/api/v1/grc-frameworks/frameworks/${key}/enable`, { method: 'POST' });
      if (res.ok) {
        const fwRes = await fetch('/api/v1/grc-frameworks/frameworks');
        if (fwRes.ok) {
          const fwD = await fwRes.json() as { frameworks: Framework[] };
          setFrameworks(fwD.frameworks ?? []);
        }
        setSelectedKey(key);
        await loadControls(key);
      }
    } finally {
      setEnabling(null);
    }
  };

  React.useEffect(() => {
    if (selectedKey) void loadControls(selectedKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedKey]);

  const handleAssessmentSave = (controlId: string, data: Partial<ControlAssessment>) => {
    setControls(prev => prev.map(c => c.controlId === controlId ? { ...c, assessment: { ...c.assessment, ...data } } : c));
  };

  const exportEvidence = async () => {
    if (!selectedKey) return;
    setExporting(true);
    try {
      const res = await fetch(`/api/v1/grc-frameworks/frameworks/${selectedKey}/export`);
      if (res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `grc-${selectedKey}-export.json`;
        a.click();
        URL.revokeObjectURL(url);
      }
    } finally {
      setExporting(false);
    }
  };

  const enabledKeys = new Set(frameworks.map(f => f.key));
  const selectedFw = frameworks.find(f => f.key === selectedKey);

  const filtered = controls.filter(c =>
    (!familyFilter || c.family === familyFilter) &&
    (!statusFilter || c.assessment.status === statusFilter) &&
    (!search || c.title.toLowerCase().includes(search.toLowerCase()) || c.controlId.toLowerCase().includes(search.toLowerCase())),
  );

  return (
    <div className="space-y-6">
      {/* Framework selector */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {FRAMEWORK_OPTIONS.map(fw => {
          const enabled = enabledKeys.has(fw.key);
          const fwData = frameworks.find(f => f.key === fw.key);
          return (
            <div
              key={fw.key}
              onClick={() => { if (enabled) { setSelectedKey(fw.key); setFamilyFilter(''); setStatusFilter(''); setSearch(''); } }}
              className={`cursor-pointer rounded-xl border p-4 transition-all ${selectedKey === fw.key ? 'border-[var(--brand-600)] bg-[var(--brand-50)] dark:bg-[var(--brand-900)]/10' : 'border-[var(--border-subtle)] bg-[var(--surface-raised)] hover:border-[var(--brand-400)]'}`}
            >
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-semibold text-[var(--ink-primary)]">{fw.name}</h3>
                  <p className="text-xs text-[var(--ink-tertiary)]">{fw.description}</p>
                </div>
                {enabled && fwData ? (
                  <span className="rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-semibold text-green-800 dark:bg-green-900/30 dark:text-green-300">
                    {Math.round(fwData.stats.percentComplete)}%
                  </span>
                ) : (
                  <button
                    onClick={e => { e.stopPropagation(); void enableFramework(fw.key); }}
                    disabled={enabling === fw.key}
                    className="rounded-md bg-[var(--brand-600)] px-3 py-1 text-xs font-medium text-white hover:bg-[var(--brand-700)] disabled:opacity-50"
                  >
                    {enabling === fw.key ? 'Enabling…' : 'Enable'}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Controls table */}
      {selectedKey && (
        <>
          {selectedFw && <StatsStrip stats={selectedFw.stats} />}

          {/* Filters + export */}
          <div className="flex flex-wrap items-center gap-2">
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search controls…"
              className="rounded-md border border-[var(--border-subtle)] bg-[var(--surface-overlay)] px-3 py-1.5 text-sm focus:border-[var(--brand-500)] focus:outline-none" />
            <select value={familyFilter} onChange={e => setFamilyFilter(e.target.value)}
              className="rounded-md border border-[var(--border-subtle)] bg-[var(--surface-overlay)] px-3 py-1.5 text-sm focus:border-[var(--brand-500)] focus:outline-none">
              <option value="">All families</option>
              {families.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
              className="rounded-md border border-[var(--border-subtle)] bg-[var(--surface-overlay)] px-3 py-1.5 text-sm focus:border-[var(--brand-500)] focus:outline-none">
              <option value="">All statuses</option>
              {(Object.keys(STATUS_LABELS) as AssessmentStatus[]).map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
            </select>
            <button onClick={() => void exportEvidence()} disabled={exporting}
              className="ml-auto rounded-md border border-[var(--border-subtle)] px-3 py-1.5 text-xs font-medium text-[var(--ink-secondary)] hover:bg-[var(--surface-overlay)] disabled:opacity-50">
              {exporting ? 'Exporting…' : '↓ Export Evidence'}
            </button>
          </div>

          {loading ? (
            <div className="flex h-40 items-center justify-center">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--brand-500)] border-t-transparent" />
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-[var(--border-subtle)]">
              <table className="min-w-full divide-y divide-[var(--border-subtle)] text-sm">
                <thead className="bg-[var(--surface-sunken)]">
                  <tr>
                    <th className="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-[var(--ink-tertiary)]">Control</th>
                    <th className="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-[var(--ink-tertiary)]">Family</th>
                    <th className="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-[var(--ink-tertiary)]">Title</th>
                    <th className="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-[var(--ink-tertiary)]">Priority</th>
                    <th className="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-[var(--ink-tertiary)]">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-subtle)] bg-[var(--surface-base)]">
                  {filtered.map(c => (
                    <tr key={c.id} onClick={() => setSelectedControl(c)} className="cursor-pointer hover:bg-[var(--surface-overlay)]">
                      <td className="px-4 py-2.5 font-mono text-xs text-[var(--ink-tertiary)]">{c.controlId}</td>
                      <td className="px-4 py-2.5 text-xs font-medium text-[var(--ink-secondary)]">{c.family}</td>
                      <td className="px-4 py-2.5 text-xs text-[var(--ink-primary)]">{c.title}</td>
                      <td className="px-4 py-2.5">
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${c.priority === 'P1' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300' : c.priority === 'P2' ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300' : 'bg-gray-100 text-gray-600 dark:bg-gray-800/50 dark:text-gray-400'}`}>{c.priority}</span>
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${STATUS_STYLES[c.assessment.status]}`}>
                          {STATUS_LABELS[c.assessment.status]}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filtered.length === 0 && (
                <div className="py-12 text-center text-sm text-[var(--ink-tertiary)]">No controls match the current filter.</div>
              )}
            </div>
          )}
        </>
      )}

      {selectedControl && selectedKey && (
        <AssessmentDrawer
          control={selectedControl}
          frameworkKey={selectedKey}
          onClose={() => setSelectedControl(null)}
          onSave={handleAssessmentSave}
        />
      )}
    </div>
  );
}

export default function CompliancePage() {
  return (
    <ModuleGate module="compliance" prettyName="GRC Compliance">
      <PageHeader
        eyebrow="IT & Security · GRC"
        title="Compliance Frameworks"
        description="Track FedRAMP 20x and CMMC Level 2 control implementation and evidence."
      />
      <ComplianceContent />
    </ModuleGate>
  );
}
