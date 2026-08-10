'use client';

import * as React from 'react';
import { PageHeader } from '@/components/shell/page-header';
import { ModuleGate } from '@/components/shell/access-denied';

// ─── Types ────────────────────────────────────────────────────────────────────

interface FrameworkSummary {
  key: string; name: string; totalControls: number; percentComplete: number;
}
interface DefenderSummary {
  total: number; percentComplete: number; p1Percent: number; p2Percent: number;
}
interface SecureScoreSummary {
  score?: number; maxScore?: number; percentage?: number; snapshotAt?: string;
}
interface PostureScore {
  postureScore: number;
  breakdown: {
    frameworks: { score: number; weight: number };
    defender: { score: number; weight: number };
    secureScore: { score: number; weight: number };
  };
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
}
interface AlertItem {
  type: string; severity: string; title: string; ref?: string;
}
interface ActivityEvent {
  id: string; action: string; createdAt: string; actorEmail?: string;
}

// ─── Helper components ────────────────────────────────────────────────────────

function RiskBadge({ level }: { level: string }) {
  const styles: Record<string, string> = {
    low: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
    medium: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
    high: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
    critical: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
  };
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide ${styles[level] ?? styles.medium}`}>
      {level}
    </span>
  );
}

function SeverityDot({ severity }: { severity: string }) {
  const colors: Record<string, string> = {
    critical: 'bg-red-500', high: 'bg-orange-500', medium: 'bg-yellow-500',
    low: 'bg-blue-500', informational: 'bg-gray-400',
  };
  return <span className={`inline-block h-2 w-2 rounded-full ${colors[severity] ?? 'bg-gray-400'}`} />;
}

function MetricCard({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: string }) {
  return (
    <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-4">
      <p className="text-xs font-medium text-[var(--ink-tertiary)] uppercase tracking-wide">{label}</p>
      <p className={`mt-1 text-3xl font-bold ${accent ?? 'text-[var(--ink-primary)]'}`}>{value}</p>
      {sub && <p className="mt-0.5 text-xs text-[var(--ink-tertiary)]">{sub}</p>}
    </div>
  );
}

function PostureMeter({ score }: { score: number }) {
  const color = score > 80 ? 'text-green-600' : score > 60 ? 'text-yellow-600' : score > 40 ? 'text-orange-600' : 'text-red-600';
  return (
    <div className="flex flex-col items-center gap-2">
      <div className={`text-6xl font-extrabold tabular-nums ${color}`}>{Math.round(score)}</div>
      <div className="text-sm text-[var(--ink-tertiary)]">GRC Posture Score / 100</div>
      <div className="h-2 w-48 overflow-hidden rounded-full bg-[var(--surface-sunken)]">
        <div className={`h-full rounded-full transition-all ${score > 80 ? 'bg-green-500' : score > 60 ? 'bg-yellow-500' : score > 40 ? 'bg-orange-500' : 'bg-red-500'}`} style={{ width: `${Math.min(score, 100)}%` }} />
      </div>
    </div>
  );
}

export default function GrcDashboardPage() {
  return (
    <ModuleGate module="compliance" prettyName="GRC Compliance">
      <PageHeader
        eyebrow="IT & Security · GRC"
        title="Compliance Posture Dashboard"
        description="Composite GRC score from frameworks, Defender plan, and Secure Score."
      />
      <GrcDashboardContent />
    </ModuleGate>
  );
}

function GrcDashboardContent() {
  const [posture, setPosture] = React.useState<PostureScore | null>(null);
  const [summary, setSummary] = React.useState<any | null>(null);
  const [alerts, setAlerts] = React.useState<AlertItem[]>([]);
  const [activity, setActivity] = React.useState<ActivityEvent[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    const fetchAll = async () => {
      try {
        const [postureRes, summaryRes, alertsRes, activityRes] = await Promise.all([
          fetch('/api/v1/grc-dashboard/posture-score'),
          fetch('/api/v1/grc-dashboard/summary'),
          fetch('/api/v1/grc-dashboard/alerts'),
          fetch('/api/v1/grc-dashboard/activity?days=7'),
        ]);
        if (postureRes.ok) setPosture(await postureRes.json() as PostureScore);
        if (summaryRes.ok) setSummary(await summaryRes.json());
        if (alertsRes.ok) { const d = await alertsRes.json() as { items: AlertItem[] }; setAlerts(d.items ?? []); }
        if (activityRes.ok) { const d = await activityRes.json() as { events: ActivityEvent[] }; setActivity(d.events ?? []); }
      } finally { setLoading(false); }
    };
    void fetchAll();
  }, []);

  if (loading) return <div className="flex h-64 items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--brand-500)] border-t-transparent" /></div>;

  const ss = summary?.secureScore;
  const ssLabel = ss?.percentage != null ? `${ss.percentage.toFixed(1)}%` : '—';
  const ssMax = ss?.score != null && ss.maxScore != null ? `${Math.round(ss.score)} / ${Math.round(ss.maxScore)} pts` : 'Not synced';

  return (
    <div className="space-y-6">
      <div className="flex flex-col items-center gap-4 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-8">
        {posture ? (<><PostureMeter score={posture.postureScore} /><RiskBadge level={posture.riskLevel} /></>) : (<p className="text-[var(--ink-tertiary)]">No posture data yet.</p>)}
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {summary?.frameworks.slice(0, 2).map((fw: FrameworkSummary) => (<MetricCard key={fw.key} label={fw.name} value={`${Math.round(fw.percentComplete)}%`} sub={`${fw.totalControls} controls`} />))}
        {(summary?.frameworks.length ?? 0) === 0 && (<><MetricCard label="FedRAMP 20x" value="—" sub="Not enabled" /><MetricCard label="CMMC Level 2" value="—" sub="Not enabled" /></>)}
        <MetricCard label="Defender Plan" value={`${Math.round(summary?.defenderPlan.p1Percent ?? 0)}%`} sub="P1 tasks complete" />
        <MetricCard label="Secure Score" value={ssLabel} sub={ssMax} />
      </div>
    </div>
  );
}