'use client';

import * as React from 'react';
import { PageHeader } from '@/components/shell/page-header';
import { ModuleGate } from '@/components/shell/access-denied';

// ─── Types ────────────────────────────────────────────────────────────────────

interface FgConfig {
  configured: boolean; host?: string; port?: number; vdom?: string;
  enabled?: boolean; lastSyncAt?: string | null; lastSyncStatus?: string | null;
}
interface FgAlert {
  id: string; alertId: string; severity: string; type: string; description: string;
  srcIp?: string | null; dstIp?: string | null; policy?: string | null;
  status: string; acknowledgedBy?: string | null; resolvedAt?: string | null; eventTime: string;
}
interface FgDevice {
  id: string; hostname: string; ip: string; mac?: string | null;
  deviceType?: string | null; os?: string | null; interface?: string | null;
  status: string; lastSeen: string;
}
interface FgDashboard {
  configured: boolean;
  alerts: { total: number; open: number; acknowledged: number; bySeverity: Record<string, number> };
  devices: { total: number; online: number; offline: number; unknown: number };
  lastSyncAt?: string | null;
  lastSyncStatus?: string | null;
}

// ─── Severity badge ───────────────────────────────────────────────────────────

const SEV_STYLES: Record<string, string> = {
  critical: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
  high: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
  medium: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
  low: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  informational: 'bg-gray-100 text-gray-600 dark:bg-gray-800/50 dark:text-gray-400',
};

function SevBadge({ severity }: { severity: string }) {
  return <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${SEV_STYLES[severity] ?? SEV_STYLES.medium}`}>{severity}</span>;
}

// ─── Config form (shown when not configured) ─────────────────────────────────

function ConfigForm({ onSaved }: { onSaved: () => void }) {
  const [host, setHost] = React.useState('');
  const [port, setPort] = React.useState(443);
  const [vdom, setVdom] = React.useState('root');
  const [apiKey, setApiKey] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const save = async () => {
    if (!host.trim() || !apiKey.trim()) return;
    setSaving(true); setError(null);
    try {
      const res = await fetch('/api/v1/grc-fortigate/config', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ host, port, vdom, apiKey, enabled: true }),
      });
      if (res.ok) {
        onSaved();
      } else {
        const d = await res.json() as { error?: string };
        setError(d.error ?? 'Save failed');
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-md rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-8">
      <div className="mb-6 text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--brand-100)] text-[var(--brand-600)] dark:bg-[var(--brand-900)]/20">
          🔐
        </div>
        <h2 className="text-lg font-semibold text-[var(--ink-primary)]">Connect FortiGate</h2>
        <p className="mt-1 text-sm text-[var(--ink-tertiary)]">Enter your FortiGate appliance details to enable alert and device monitoring.</p>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-[var(--ink-secondary)]">Host / IP Address</label>
          <input value={host} onChange={e => setHost(e.target.value)} placeholder="192.168.1.1 or fortigate.company.com"
            className="mt-1 w-full rounded-md border border-[var(--border-subtle)] bg-[var(--surface-overlay)] px-3 py-2 text-sm focus:border-[var(--brand-500)] focus:outline-none" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-[var(--ink-secondary)]">Port</label>
            <input type="number" value={port} onChange={e => setPort(Number(e.target.value))} min={1} max={65535}
              className="mt-1 w-full rounded-md border border-[var(--border-subtle)] bg-[var(--surface-overlay)] px-3 py-2 text-sm focus:border-[var(--brand-500)] focus:outline-none" />
          </div>
          <div>
            <label className="block text-xs font-medium text-[var(--ink-secondary)]">VDOM</label>
            <input value={vdom} onChange={e => setVdom(e.target.value)}
              className="mt-1 w-full rounded-md border border-[var(--border-subtle)] bg-[var(--surface-overlay)] px-3 py-2 text-sm focus:border-[var(--brand-500)] focus:outline-none" />
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-[var(--ink-secondary)]">API Key</label>
          <input type="password" value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder="FortiGate REST API token"
            className="mt-1 w-full rounded-md border border-[var(--border-subtle)] bg-[var(--surface-overlay)] px-3 py-2 text-sm focus:border-[var(--brand-500)] focus:outline-none" />
        </div>
        {error && <p className="text-xs text-red-600">{error}</p>}
        <button onClick={() => void save()} disabled={saving || !host.trim() || !apiKey.trim()}
          className="w-full rounded-md bg-[var(--brand-600)] py-2.5 text-sm font-medium text-white hover:bg-[var(--brand-700)] disabled:opacity-50">
          {saving ? 'Connecting…' : 'Test & Save Connection'}
        </button>
      </div>
    </div>
  );
}

// ─── Main content (when configured) ──────────────────────────────────────────

function FortiGateDashboard({ config }: { config: FgConfig }) {
  const [dashboard, setDashboard] = React.useState<FgDashboard | null>(null);
  const [alerts, setAlerts] = React.useState<FgAlert[]>([]);
  const [devices, setDevices] = React.useState<FgDevice[]>([]);
  const [alertSev, setAlertSev] = React.useState('');
  const [alertStatus, setAlertStatus] = React.useState('open');
  const [syncing, setSyncing] = React.useState(false);
  const [actionLoading, setActionLoading] = React.useState<string | null>(null);

  const loadAll = React.useCallback(async () => {
    const [dashRes, alertsRes, devRes] = await Promise.all([
      fetch('/api/v1/grc-fortigate/dashboard'),
      fetch(`/api/v1/grc-fortigate/alerts?status=${alertStatus}&${alertSev ? `severity=${alertSev}` : ''}&limit=50`),
      fetch('/api/v1/grc-fortigate/devices?limit=100'),
    ]);
    if (dashRes.ok) setDashboard(await dashRes.json() as FgDashboard);
    if (alertsRes.ok) setAlerts(await alertsRes.json().then((d: { alerts: FgAlert[] }) => d.alerts ?? []));
    if (devRes.ok) setDevices(await devRes.json().then((d: { devices: FgDevice[] }) => d.devices ?? []));
  }, [alertSev, alertStatus]);

  React.useEffect(() => { void loadAll(); }, [loadAll]);

  const syncNow = async () => {
    setSyncing(true);
    try {
      await fetch('/api/v1/grc-fortigate/sync', { method: 'POST' });
      await loadAll();
    } finally {
      setSyncing(false);
    }
  };

  const alertAction = async (id: string, action: 'acknowledge' | 'resolve') => {
    setActionLoading(id);
    try {
      await fetch(`/api/v1/grc-fortigate/alerts/${id}/${action}`, { method: 'PATCH' });
      await loadAll();
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Status strip */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] px-4 py-3">
        <div className="flex items-center gap-3">
          <span className={`h-2 w-2 rounded-full ${config.lastSyncStatus === 'success' || dashboard?.configured ? 'bg-green-500' : 'bg-gray-400'}`} />
          <span className="text-sm font-medium text-[var(--ink-primary)]">{config.host}:{config.port}</span>
          {dashboard?.lastSyncAt && (
            <span className="text-xs text-[var(--ink-tertiary)]">Last sync: {new Date(dashboard.lastSyncAt).toLocaleString()}</span>
          )}
        </div>
        <button onClick={() => void syncNow()} disabled={syncing}
          className="rounded-md border border-[var(--border-subtle)] px-3 py-1.5 text-xs font-medium text-[var(--ink-secondary)] hover:bg-[var(--surface-overlay)] disabled:opacity-50">
          {syncing ? 'Syncing…' : '↻ Sync Now'}
        </button>
      </div>

      {/* Stat cards */}
      {dashboard && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
          {[
            { label: 'Open Alerts', value: dashboard.alerts.open, accent: dashboard.alerts.open > 0 ? 'text-red-600' : undefined },
            { label: 'Critical', value: dashboard.alerts.bySeverity['critical'] ?? 0, accent: (dashboard.alerts.bySeverity['critical'] ?? 0) > 0 ? 'text-red-600' : undefined },
            { label: 'High', value: dashboard.alerts.bySeverity['high'] ?? 0, accent: (dashboard.alerts.bySeverity['high'] ?? 0) > 0 ? 'text-orange-600' : undefined },
            { label: 'Total Devices', value: dashboard.devices.total },
            { label: 'Online', value: dashboard.devices.online, accent: 'text-green-600' },
          ].map(card => (
            <div key={card.label} className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-3">
              <p className="text-[10px] uppercase tracking-wide text-[var(--ink-tertiary)]">{card.label}</p>
              <p className={`text-2xl font-bold ${card.accent ?? 'text-[var(--ink-primary)]'}`}>{card.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Two-panel: Alerts + Devices */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        {/* Alerts panel (3/5) */}
        <div className="col-span-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-4">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-semibold text-[var(--ink-primary)]">Alerts</h2>
            <select value={alertSev} onChange={e => setAlertSev(e.target.value)}
              className="ml-auto rounded-md border border-[var(--border-subtle)] bg-[var(--surface-overlay)] px-2 py-1 text-xs focus:outline-none">
              <option value="">All severities</option>
              {['critical','high','medium','low','informational'].map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <select value={alertStatus} onChange={e => setAlertStatus(e.target.value)}
              className="rounded-md border border-[var(--border-subtle)] bg-[var(--surface-overlay)] px-2 py-1 text-xs focus:outline-none">
              <option value="">All</option>
              <option value="open">Open</option>
              <option value="acknowledged">Acknowledged</option>
              <option value="resolved">Resolved</option>
            </select>
          </div>
          <div className="divide-y divide-[var(--border-subtle)]">
            {alerts.length === 0 ? (
              <p className="py-8 text-center text-sm text-[var(--ink-tertiary)]">No alerts. Click Sync Now to pull from FortiGate.</p>
            ) : alerts.map(alert => (
              <div key={alert.id} className="py-2.5">
                <div className="flex items-start gap-2">
                  <SevBadge severity={alert.severity} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium text-[var(--ink-primary)]">{alert.description}</p>
                    <div className="mt-0.5 flex flex-wrap gap-3 text-[10px] text-[var(--ink-tertiary)]">
                      {alert.srcIp && <span>Src: {alert.srcIp}</span>}
                      {alert.dstIp && <span>Dst: {alert.dstIp}</span>}
                      <span className="capitalize">{alert.type}</span>
                      <span>{new Date(alert.eventTime).toLocaleString()}</span>
                    </div>
                  </div>
                  {alert.status === 'open' && (
                    <div className="flex gap-1 shrink-0">
                      <button onClick={() => void alertAction(alert.id, 'acknowledge')} disabled={actionLoading === alert.id}
                        className="rounded px-2 py-0.5 text-[10px] font-medium text-[var(--ink-tertiary)] border border-[var(--border-subtle)] hover:bg-[var(--surface-overlay)] disabled:opacity-50">Ack</button>
                      <button onClick={() => void alertAction(alert.id, 'resolve')} disabled={actionLoading === alert.id}
                        className="rounded px-2 py-0.5 text-[10px] font-medium text-green-700 border border-green-200 hover:bg-green-50 dark:text-green-400 dark:border-green-800 dark:hover:bg-green-900/20 disabled:opacity-50">Resolve</button>
                    </div>
                  )}
                  {alert.status !== 'open' && (
                    <span className="shrink-0 text-[10px] capitalize text-[var(--ink-tertiary)]">{alert.status}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Devices panel (2/5) */}
        <div className="col-span-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-4">
          <h2 className="mb-3 text-sm font-semibold text-[var(--ink-primary)]">Devices ({devices.length})</h2>
          <div className="divide-y divide-[var(--border-subtle)]">
            {devices.length === 0 ? (
              <p className="py-8 text-center text-sm text-[var(--ink-tertiary)]">No devices synced yet.</p>
            ) : devices.slice(0, 20).map(dev => (
              <div key={dev.id} className="flex items-center gap-2 py-2">
                <span className={`h-2 w-2 shrink-0 rounded-full ${dev.status === 'online' ? 'bg-green-500' : dev.status === 'offline' ? 'bg-red-500' : 'bg-gray-400'}`} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium text-[var(--ink-primary)]">{dev.hostname}</p>
                  <p className="text-[10px] text-[var(--ink-tertiary)]">{dev.ip} {dev.os ? `· ${dev.os}` : ''}</p>
                </div>
                <span className="shrink-0 text-[10px] text-[var(--ink-tertiary)] capitalize">{dev.deviceType ?? 'unknown'}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

function FortiGateContent() {
  const [config, setConfig] = React.useState<FgConfig | null>(null);
  const [loading, setLoading] = React.useState(true);

  const loadConfig = async () => {
    const res = await fetch('/api/v1/grc-fortigate/config');
    if (res.ok) setConfig(await res.json() as FgConfig);
    setLoading(false);
  };

  React.useEffect(() => { void loadConfig(); }, []);

  if (loading) {
    return <div className="flex h-40 items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--brand-500)] border-t-transparent" /></div>;
  }

  if (!config?.configured) {
    return <ConfigForm onSaved={() => void loadConfig()} />;
  }

  return <FortiGateDashboard config={config} />;
}

export default function FortiGatePage() {
  return (
    <ModuleGate module="itsec" prettyName="IT & Security">
      <PageHeader
        eyebrow="IT & Security · GRC"
        title="FortiGate Integration"
        description="Real-time firewall alerts, device discovery, and IPS/threat intelligence from FortiGate."
      />
      <FortiGateContent />
    </ModuleGate>
  );
}
