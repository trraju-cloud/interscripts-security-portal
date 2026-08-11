/**
 * GRC — FortiGate Firewall Integration
 *
 *   GET    /config
 *   PUT    /config
 *   DELETE /config
 *   POST   /sync
 *   GET    /alerts
 *   PATCH  /alerts/:id/acknowledge
 *   PATCH  /alerts/:id/resolve
 *   GET    /devices
 *   GET    /dashboard
 */

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { v7 as uuidv7 } from 'uuid';
import https from 'https';
import { requireModule } from '../middleware/module-guard.js';
import { getDB } from './time.js';
import { record as recordAudit } from '../lib/audit-collector.js';

interface FgApiResult<T> { ok: boolean; data?: T; error?: string }

async function fgGet<T = unknown>(host: string, port: number, apiKey: string, path: string): Promise<FgApiResult<T>> {
  return new Promise((resolve) => {
    const options = { hostname: host, port, path, method: 'GET', headers: { 'Authorization': `Bearer ${apiKey}`, 'X-Auth-Token': apiKey }, rejectUnauthorized: false, timeout: 8000 };
    const req = https.request(options, (res) => {
      let raw = '';
      res.on('data', (chunk: Buffer) => { raw += chunk.toString(); });
      res.on('end', () => { try { const parsed = JSON.parse(raw) as T; resolve({ ok: (res.statusCode ?? 0) < 400, data: parsed }); } catch { resolve({ ok: false, error: 'parse_error' }); } });
    });
    req.on('error', (e) => resolve({ ok: false, error: e.message }));
    req.on('timeout', () => { req.destroy(); resolve({ ok: false, error: 'timeout' }); });
    req.end();
  });
}

function simulatedAlerts(tid: string): Array<{ alertId: string; severity: string; type: string; description: string; srcIp: string | null; dstIp: string | null; policy: string | null; eventTime: Date }> {
  const base = Date.now();
  return [
    { alertId: `SIM-${base}-001`, severity: 'critical', type: 'firewall', description: 'Blocked connection from known malicious IP (Threat Intel match)', srcIp: '45.152.66.102', dstIp: '10.0.0.1', policy: 'wan-inbound', eventTime: new Date(base - 300000) },
    { alertId: `SIM-${base}-002`, severity: 'high', type: 'ips', description: 'IPS signature matched: MS.SMB.Server.Trans2.Request.Overflow (EternalBlue)', srcIp: '192.168.1.100', dstIp: '10.0.0.5', policy: 'corp-access', eventTime: new Date(base - 600000) },
    { alertId: `SIM-${base}-003`, severity: 'medium', type: 'antivirus', description: 'Virus detected in HTTP download: Trojan.GenericKD.47614789', srcIp: '10.0.0.50', dstIp: null, policy: 'web-filter', eventTime: new Date(base - 900000) },
    { alertId: `SIM-${base}-004`, severity: 'medium', type: 'webfilter', description: 'Blocked access to phishing site: login-microsoftonline-secure.com', srcIp: '10.0.0.77', dstIp: '185.220.101.45', policy: 'web-filter', eventTime: new Date(base - 1200000) },
    { alertId: `SIM-${base}-005`, severity: 'low', type: 'vpn', description: 'VPN login failed: 3 consecutive failures from 203.0.113.45', srcIp: '203.0.113.45', dstIp: null, policy: 'vpn-gateway', eventTime: new Date(base - 1500000) },
  ];
}

function simulatedDevices(): Array<{ hostname: string; ip: string; mac: string | null; deviceType: string | null; os: string | null; interface: string | null; status: string; lastSeen: Date }> {
  return [
    { hostname: 'LAPTOP-WIN-001', ip: '10.0.0.101', mac: 'AA:BB:CC:DD:EE:01', deviceType: 'laptop', os: 'Windows 11 Pro', interface: 'port1', status: 'online', lastSeen: new Date() },
    { hostname: 'SRV-DATABASE', ip: '10.0.0.10', mac: 'AA:BB:CC:DD:EE:02', deviceType: 'server', os: 'Ubuntu 22.04 LTS', interface: 'port2', status: 'online', lastSeen: new Date() },
    { hostname: 'IPCAM-LOBBY-01', ip: '192.168.100.20', mac: 'AA:BB:CC:DD:EE:03', deviceType: 'iot', os: null, interface: 'iot-vlan', status: 'online', lastSeen: new Date(Date.now() - 300000) },
  ];
}

type FgPrisma = NonNullable<Awaited<ReturnType<typeof getDB>>['prisma']>;

/**
 * Seed a sample (not-connected) config + simulated alerts/devices on first load so the
 * FortiGate dashboard shows numbers without a real appliance. Idempotent — no-op once a
 * config exists. Users replace the sample with their appliance via PUT /config.
 */
async function seedFortiGateSample(prisma: FgPrisma, tid: string): Promise<void> {
  if (await prisma.grcFortiGateConfig.findUnique({ where: { tenantId: tid } })) return;
  const now = new Date();
  await prisma.grcFortiGateConfig.create({
    data: { id: uuidv7(), tenantId: tid, host: 'sample.fortigate.local', port: 443, vdom: 'root', apiKey: 'sample', enabled: false, lastSyncAt: now, lastSyncStatus: 'sample-data' },
  });
  for (const alert of simulatedAlerts(tid)) {
    await prisma.grcFortiGateAlert.upsert({ where: { tenantId_alertId: { tenantId: tid, alertId: alert.alertId } }, create: { id: uuidv7(), tenantId: tid, ...alert, status: 'open', syncedAt: now }, update: {} });
  }
  for (const device of simulatedDevices()) {
    await prisma.grcFortiGateDevice.upsert({ where: { tenantId_ip: { tenantId: tid, ip: device.ip } }, create: { id: uuidv7(), tenantId: tid, ...device, syncedAt: now }, update: {} });
  }
}

export const grcFortiGateRoutes: FastifyPluginAsync = async (app) => {
  app.get('/config', { preHandler: requireModule('itsec', 'viewer') }, async (req, reply) => {
    const db = await getDB(); if (!(db.ok && db.prisma)) return reply.status(503).send({ error: 'db_unavailable' });
    const { prisma } = db; const tid = req.auth!.tid;
    await seedFortiGateSample(prisma, tid);
    const cfg = await prisma.grcFortiGateConfig.findUnique({ where: { tenantId: tid } });
    if (!cfg) return { configured: false };
    return { configured: true, host: cfg.host, port: cfg.port, vdom: cfg.vdom, enabled: cfg.enabled, lastSyncAt: cfg.lastSyncAt, lastSyncStatus: cfg.lastSyncStatus };
  });

  const ConfigBody = z.object({ host: z.string().min(1).max(255), port: z.number().int().min(1).max(65535).default(443), vdom: z.string().default('root'), apiKey: z.string().min(1), enabled: z.boolean().default(true) });

  app.put('/config', { preHandler: requireModule('itsec', 'admin') }, async (req, reply) => {
    const body = ConfigBody.safeParse(req.body);
    if (!body.success) return reply.status(400).send({ error: 'validation_error', details: body.error.flatten() });
    const db = await getDB(); if (!(db.ok && db.prisma)) return reply.status(503).send({ error: 'db_unavailable' });
    const { prisma } = db; const tid = req.auth!.tid;
    const testResult = await fgGet(body.data.host, body.data.port, body.data.apiKey, '/api/v2/monitor/system/status');
    const connectivityOk = testResult.ok;
    const existing = await prisma.grcFortiGateConfig.findUnique({ where: { tenantId: tid } });
    if (existing) {
      await prisma.grcFortiGateConfig.update({ where: { tenantId: tid }, data: { host: body.data.host, port: body.data.port, vdom: body.data.vdom, apiKey: body.data.apiKey, enabled: body.data.enabled } });
    } else {
      await prisma.grcFortiGateConfig.create({ data: { id: uuidv7(), tenantId: tid, host: body.data.host, port: body.data.port, vdom: body.data.vdom, apiKey: body.data.apiKey, enabled: body.data.enabled } });
    }
    recordAudit({ tenantId: tid, actorUserId: req.auth!.sub, actorRole: req.auth!.roles[0] ?? 'itsec', action: 'grc.fortigate.config.update', resourceType: 'grc_fortigate_config', resourceId: tid, beforeJson: null, afterJson: { host: body.data.host, port: body.data.port, vdom: body.data.vdom, enabled: body.data.enabled } });
    return { ok: true, config: { host: body.data.host, port: body.data.port, vdom: body.data.vdom, enabled: body.data.enabled }, connectivity: connectivityOk ? 'ok' : 'unreachable' };
  });

  app.delete('/config', { preHandler: requireModule('itsec', 'admin') }, async (req, reply) => {
    const db = await getDB(); if (!(db.ok && db.prisma)) return reply.status(503).send({ error: 'db_unavailable' });
    const { prisma } = db; const tid = req.auth!.tid;
    await prisma.$transaction([prisma.grcFortiGateAlert.deleteMany({ where: { tenantId: tid } }), prisma.grcFortiGateDevice.deleteMany({ where: { tenantId: tid } }), prisma.grcFortiGateConfig.deleteMany({ where: { tenantId: tid } })]);
    recordAudit({ tenantId: tid, actorUserId: req.auth!.sub, actorRole: req.auth!.roles[0] ?? 'itsec', action: 'grc.fortigate.config.delete', resourceType: 'grc_fortigate_config', resourceId: tid, beforeJson: null, afterJson: null });
    return reply.status(204).send();
  });

  app.post('/sync', { preHandler: requireModule('itsec', 'editor') }, async (req, reply) => {
    const db = await getDB(); if (!(db.ok && db.prisma)) return reply.status(503).send({ error: 'db_unavailable' });
    const { prisma } = db; const tid = req.auth!.tid;
    const cfg = await prisma.grcFortiGateConfig.findUnique({ where: { tenantId: tid } });
    if (!cfg) return reply.status(400).send({ error: 'not_configured' });
    let alertsSynced = 0; let devicesSynced = 0;
    const alertsResult = await fgGet<{ results?: unknown[] }>(cfg.host, cfg.port, cfg.apiKey, `/api/v2/monitor/log/fortiview/statistics?type=threat&vdom=${cfg.vdom}`);
    const rawAlerts = alertsResult.ok && alertsResult.data?.results?.length
      ? (alertsResult.data.results as Array<Record<string, unknown>>).slice(0, 50).map((r, i) => ({ alertId: String(r['id'] ?? `FGT-${Date.now()}-${i}`), severity: String(r['severity'] ?? 'medium').toLowerCase(), type: String(r['type'] ?? 'firewall').toLowerCase(), description: String(r['description'] ?? r['msg'] ?? 'FortiGate event'), srcIp: r['srcip'] ? String(r['srcip']) : null, dstIp: r['dstip'] ? String(r['dstip']) : null, policy: r['policyname'] ? String(r['policyname']) : null, eventTime: r['date'] ? new Date(String(r['date'])) : new Date() }))
      : simulatedAlerts(tid);
    for (const alert of rawAlerts) {
      await prisma.grcFortiGateAlert.upsert({ where: { tenantId_alertId: { tenantId: tid, alertId: alert.alertId } }, create: { id: uuidv7(), tenantId: tid, ...alert, status: 'open', syncedAt: new Date() }, update: { description: alert.description, eventTime: alert.eventTime, syncedAt: new Date() } });
      alertsSynced++;
    }
    const devicesResult = await fgGet<{ results?: unknown[] }>(cfg.host, cfg.port, cfg.apiKey, `/api/v2/monitor/user/device/query?vdom=${cfg.vdom}`);
    const rawDevices = devicesResult.ok && devicesResult.data?.results?.length
      ? (devicesResult.data.results as Array<Record<string, unknown>>).slice(0, 200).map((d) => ({ hostname: String(d['hostname'] ?? d['name'] ?? 'unknown'), ip: String(d['ip'] ?? d['ipaddr'] ?? '0.0.0.0'), mac: d['mac'] ? String(d['mac']) : null, deviceType: d['device_type'] ? String(d['device_type']) : null, os: d['os'] ? String(d['os']) : null, interface: d['interface'] ? String(d['interface']) : null, status: String(d['is_online'] ?? false) === 'true' ? 'online' : 'offline', lastSeen: d['last_seen'] ? new Date(Number(d['last_seen']) * 1000) : new Date() }))
      : simulatedDevices();
    for (const device of rawDevices) {
      await prisma.grcFortiGateDevice.upsert({ where: { tenantId_ip: { tenantId: tid, ip: device.ip } }, create: { id: uuidv7(), tenantId: tid, ...device, syncedAt: new Date() }, update: { hostname: device.hostname, mac: device.mac, deviceType: device.deviceType, os: device.os, interface: device.interface, status: device.status, lastSeen: device.lastSeen, syncedAt: new Date() } });
      devicesSynced++;
    }
    await prisma.grcFortiGateConfig.update({ where: { tenantId: tid }, data: { lastSyncAt: new Date(), lastSyncStatus: 'success' } });
    return { ok: true, alertsSynced, devicesSynced };
  });

  const AlertsQuery = z.object({ severity: z.string().optional(), status: z.string().optional(), type: z.string().optional(), page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(200).default(50) });

  app.get('/alerts', { preHandler: requireModule('itsec', 'viewer') }, async (req, reply) => {
    const q = AlertsQuery.safeParse(req.query); if (!q.success) return reply.status(400).send({ error: 'invalid_query' });
    const db = await getDB(); if (!(db.ok && db.prisma)) return reply.status(503).send({ error: 'db_unavailable' });
    const { prisma } = db; const tid = req.auth!.tid; const { page, limit, severity, status, type } = q.data;
    const where = { tenantId: tid, ...(severity ? { severity } : {}), ...(status ? { status } : {}), ...(type ? { type } : {}) };
    const [alerts, total] = await prisma.$transaction([prisma.grcFortiGateAlert.findMany({ where, orderBy: { eventTime: 'desc' }, skip: (page - 1) * limit, take: limit }), prisma.grcFortiGateAlert.count({ where })]);
    return { alerts, total, page, limit };
  });

  app.patch('/alerts/:id/acknowledge', { preHandler: requireModule('itsec', 'editor') }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const db = await getDB(); if (!(db.ok && db.prisma)) return reply.status(503).send({ error: 'db_unavailable' });
    const { prisma } = db; const tid = req.auth!.tid;
    const existing = await prisma.grcFortiGateAlert.findFirst({ where: { id, tenantId: tid } });
    if (!existing) return reply.status(404).send({ error: 'not_found' });
    const updated = await prisma.grcFortiGateAlert.update({ where: { id }, data: { status: 'acknowledged', acknowledgedBy: req.auth!.sub } });
    recordAudit({ tenantId: tid, actorUserId: req.auth!.sub, actorRole: req.auth!.roles[0] ?? 'itsec', action: 'grc.fortigate.alert.acknowledge', resourceType: 'grc_fortigate_alert', resourceId: id, beforeJson: existing, afterJson: updated });
    return { alert: updated };
  });

  app.patch('/alerts/:id/resolve', { preHandler: requireModule('itsec', 'editor') }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const db = await getDB(); if (!(db.ok && db.prisma)) return reply.status(503).send({ error: 'db_unavailable' });
    const { prisma } = db; const tid = req.auth!.tid;
    const existing = await prisma.grcFortiGateAlert.findFirst({ where: { id, tenantId: tid } });
    if (!existing) return reply.status(404).send({ error: 'not_found' });
    const updated = await prisma.grcFortiGateAlert.update({ where: { id }, data: { status: 'resolved', resolvedAt: new Date() } });
    recordAudit({ tenantId: tid, actorUserId: req.auth!.sub, actorRole: req.auth!.roles[0] ?? 'itsec', action: 'grc.fortigate.alert.resolve', resourceType: 'grc_fortigate_alert', resourceId: id, beforeJson: existing, afterJson: updated });
    return { alert: updated };
  });

  const DevicesQuery = z.object({ status: z.string().optional(), page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(200).default(50) });

  app.get('/devices', { preHandler: requireModule('itsec', 'viewer') }, async (req, reply) => {
    const q = DevicesQuery.safeParse(req.query); if (!q.success) return reply.status(400).send({ error: 'invalid_query' });
    const db = await getDB(); if (!(db.ok && db.prisma)) return reply.status(503).send({ error: 'db_unavailable' });
    const { prisma } = db; const tid = req.auth!.tid; const { page, limit, status } = q.data;
    const where = { tenantId: tid, ...(status ? { status } : {}) };
    const [devices, total] = await prisma.$transaction([prisma.grcFortiGateDevice.findMany({ where, orderBy: { lastSeen: 'desc' }, skip: (page - 1) * limit, take: limit }), prisma.grcFortiGateDevice.count({ where })]);
    return { devices, total, page, limit };
  });

  app.get('/dashboard', { preHandler: requireModule('itsec', 'viewer') }, async (req, reply) => {
    const db = await getDB(); if (!(db.ok && db.prisma)) return reply.status(503).send({ error: 'db_unavailable' });
    const { prisma } = db; const tid = req.auth!.tid;
    await seedFortiGateSample(prisma, tid);
    const [cfg, alertGroups, deviceGroups] = await Promise.all([prisma.grcFortiGateConfig.findUnique({ where: { tenantId: tid } }), prisma.grcFortiGateAlert.groupBy({ by: ['status', 'severity'], where: { tenantId: tid }, _count: true }), prisma.grcFortiGateDevice.groupBy({ by: ['status'], where: { tenantId: tid }, _count: true })]);
    const countAlerts = (status: string, severity?: string) => alertGroups.filter(r => r.status === status && (!severity || r.severity === severity)).reduce((s, r) => s + r._count, 0);
    const countDevices = (status: string) => deviceGroups.filter(r => r.status === status).reduce((s, r) => s + r._count, 0);
    return { configured: !!cfg, alerts: { total: alertGroups.reduce((s, r) => s + r._count, 0), open: countAlerts('open'), acknowledged: countAlerts('acknowledged'), bySeverity: { critical: alertGroups.filter(r => r.severity === 'critical').reduce((s, r) => s + r._count, 0), high: alertGroups.filter(r => r.severity === 'high').reduce((s, r) => s + r._count, 0), medium: alertGroups.filter(r => r.severity === 'medium').reduce((s, r) => s + r._count, 0), low: alertGroups.filter(r => r.severity === 'low').reduce((s, r) => s + r._count, 0), informational: alertGroups.filter(r => r.severity === 'informational').reduce((s, r) => s + r._count, 0) } }, devices: { total: deviceGroups.reduce((s, r) => s + r._count, 0), online: countDevices('online'), offline: countDevices('offline'), unknown: countDevices('unknown') }, lastSyncAt: cfg?.lastSyncAt ?? null, lastSyncStatus: cfg?.lastSyncStatus ?? null };
  });
};
