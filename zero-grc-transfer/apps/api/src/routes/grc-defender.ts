/**
 * GRC — Microsoft Defender 90-Day Remediation Plan.
 * 44 tasks across 8 categories.
 * Module-gated: viewer for reads, editor for PATCH, admin for seed.
 */

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { v7 as uuidv7 } from 'uuid';
import { requireModule } from '../middleware/module-guard.js';
import { getDB } from './time.js';
import { record as recordAudit } from '../lib/audit-collector.js';

const DEFENDER_TASKS_SEED = [
  { ref: 'DF-001', category: 'IDENTITY', priority: 'P1', title: 'Enable MFA for All Admin Accounts', description: 'Enforce multi-factor authentication for all Azure AD privileged roles using Conditional Access policies.' },
  { ref: 'DF-002', category: 'IDENTITY', priority: 'P1', title: 'Enforce MFA for All Users', description: 'Roll out MFA to all user accounts via Conditional Access. Enable Security Defaults or custom CA policy requiring MFA on all cloud app sign-ins.' },
  { ref: 'DF-003', category: 'IDENTITY', priority: 'P1', title: 'Eliminate Legacy Authentication', description: 'Block legacy authentication protocols (Basic Auth, SMTP AUTH, POP3, IMAP) using Conditional Access. These bypass MFA and are a top attack vector.' },
  { ref: 'DF-004', category: 'IDENTITY', priority: 'P1', title: 'Enable Identity Protection Risk Policies', description: 'Configure Azure AD Identity Protection sign-in risk and user risk policies to automatically block or challenge risky sign-ins.' },
  { ref: 'DF-005', category: 'IDENTITY', priority: 'P2', title: 'Enable Privileged Identity Management (PIM)', description: 'Implement just-in-time privileged access using Azure AD PIM. Require approval and justification for privileged role activation.' },
  { ref: 'DF-006', category: 'IDENTITY', priority: 'P2', title: 'Review and Remove Stale Guest Accounts', description: 'Audit all guest accounts in Azure AD. Remove accounts inactive for 90+ days. Implement access reviews for ongoing governance.' },
  { ref: 'DF-007', category: 'IDENTITY', priority: 'P2', title: 'Configure Password Protection', description: 'Enable Azure AD Password Protection to ban common passwords and enforce smart lockout.' },
  { ref: 'DF-008', category: 'ENDPOINT', priority: 'P1', title: 'Onboard All Devices to Microsoft Defender for Endpoint', description: 'Enroll 100% of Windows/macOS/Linux devices to MDE for real-time protection, EDR, and vulnerability management.' },
  { ref: 'DF-009', category: 'ENDPOINT', priority: 'P1', title: 'Enable Tamper Protection', description: 'Turn on Tamper Protection in MDE to prevent attackers from disabling security settings and antivirus protection.' },
  { ref: 'DF-010', category: 'ENDPOINT', priority: 'P1', title: 'Remediate High-Severity Vulnerabilities', description: 'Address all CVE vulnerabilities rated Critical or High in MDE Threat and Vulnerability Management within 7 days of discovery.' },
  { ref: 'DF-011', category: 'ENDPOINT', priority: 'P2', title: 'Enable Attack Surface Reduction Rules', description: 'Configure ASR rules in block mode to prevent common attack techniques: Office macros, credential theft, ransomware behaviors.' },
  { ref: 'DF-012', category: 'ENDPOINT', priority: 'P2', title: 'Enforce Disk Encryption (BitLocker/FileVault)', description: 'Require disk encryption on all managed devices via Intune compliance policy.' },
  { ref: 'DF-013', category: 'ENDPOINT', priority: 'P2', title: 'Enable Controlled Folder Access', description: 'Enable CFA (ransomware protection) on endpoints to prevent unauthorized changes to protected folders.' },
  { ref: 'DF-014', category: 'APPS', priority: 'P1', title: 'Enable Microsoft Defender for Cloud Apps', description: 'Deploy MDCA and configure app connectors for O365, Azure, Salesforce, Box, etc. Set up anomaly detection policies.' },
  { ref: 'DF-015', category: 'APPS', priority: 'P1', title: 'Review OAuth App Permissions', description: 'Audit all OAuth apps with access to Microsoft 365. Revoke permissions from unknown or overly-permissive apps.' },
  { ref: 'DF-016', category: 'APPS', priority: 'P2', title: 'Configure Session Policies for Risky Apps', description: 'Use MDCA session controls to monitor and restrict actions in risky apps when sign-in risk is elevated.' },
  { ref: 'DF-017', category: 'APPS', priority: 'P2', title: 'Enable App Governance Add-on', description: 'Enable App Governance in MDCA for automated detection of over-permissioned and malicious apps in Microsoft 365.' },
  { ref: 'DF-018', category: 'DATA', priority: 'P1', title: 'Enable Microsoft Purview Data Loss Prevention', description: 'Deploy DLP policies to detect and prevent sharing of sensitive data across Exchange, SharePoint, Teams, Endpoint.' },
  { ref: 'DF-019', category: 'DATA', priority: 'P1', title: 'Enable Sensitivity Labels and Classification', description: 'Deploy Microsoft Information Protection sensitivity labels. Auto-classify documents containing sensitive data.' },
  { ref: 'DF-020', category: 'DATA', priority: 'P2', title: 'Configure Insider Risk Management', description: 'Enable Microsoft Purview Insider Risk Management with departure and data theft sequence policies.' },
  { ref: 'DF-021', category: 'DATA', priority: 'P2', title: 'Enable Data Retention Policies', description: 'Configure retention policies in Microsoft Purview for Exchange, SharePoint, Teams, and OneDrive per regulatory requirements.' },
  { ref: 'DF-022', category: 'DATA', priority: 'P3', title: 'Enable Communication Compliance', description: 'Deploy communication compliance policies to detect policy violations in email and Teams messages.' },
  { ref: 'DF-023', category: 'INFRA', priority: 'P1', title: 'Enable Microsoft Defender for Cloud', description: 'Enable MDC on all Azure subscriptions. Achieve at least Foundational CSPM. Enable enhanced workload protections.' },
  { ref: 'DF-024', category: 'INFRA', priority: 'P1', title: 'Remediate Defender for Cloud Recommendations', description: 'Address all High-severity security recommendations in MDC. Focus on: exposed VMs, unpatched systems, misconfigured storage.' },
  { ref: 'DF-025', category: 'INFRA', priority: 'P2', title: 'Enable Microsoft Sentinel', description: 'Deploy Microsoft Sentinel as SIEM/SOAR. Connect data connectors for Azure AD, M365, MDE, MDC. Configure analytics rules.' },
  { ref: 'DF-026', category: 'INFRA', priority: 'P2', title: 'Configure Just-In-Time VM Access', description: 'Enable JIT VM access in MDC to reduce attack surface. Require approval for RDP/SSH access on all Azure VMs.' },
  { ref: 'DF-027', category: 'INFRA', priority: 'P2', title: 'Enable Azure DDoS Protection', description: 'Enable Azure DDoS Protection Standard on virtual networks hosting internet-facing resources.' },
  { ref: 'DF-028', category: 'INFRA', priority: 'P3', title: 'Implement Azure Firewall or NSG Hardening', description: 'Review and tighten all Network Security Group rules. Deploy Azure Firewall for outbound filtering.' },
  { ref: 'DF-029', category: 'IOT', priority: 'P2', title: 'Discover Unmanaged IoT/OT Devices', description: 'Use Microsoft Defender for IoT to discover unmanaged devices in the network. Assess OT/IoT security posture.' },
  { ref: 'DF-030', category: 'IOT', priority: 'P2', title: 'Segment IoT Devices on Isolated Network', description: 'Place all IoT/OT devices on isolated VLANs with strict access control. No lateral movement to corporate network.' },
  { ref: 'DF-031', category: 'IOT', priority: 'P3', title: 'Onboard IoT Devices to Defender for IoT', description: 'Deploy Defender for IoT sensors for passive monitoring of OT/IoT traffic and anomaly detection.' },
  { ref: 'DF-032', category: 'NETWORK', priority: 'P1', title: 'Enable Microsoft Defender for DNS', description: 'Enable Defender for DNS to detect DNS-based attacks (C2 communication, data exfiltration, DNS hijacking).' },
  { ref: 'DF-033', category: 'NETWORK', priority: 'P2', title: 'Deploy Zero Trust Network Access', description: 'Implement Zero Trust Network Access (ZTNA) to replace VPN for remote access. Use Entra Private Access or equivalent.' },
  { ref: 'DF-034', category: 'NETWORK', priority: 'P2', title: 'Enable Network Detection and Response', description: 'Deploy network detection to identify lateral movement and C2 traffic.' },
  { ref: 'DF-035', category: 'NETWORK', priority: 'P3', title: 'Harden DNS Configuration', description: 'Implement DNSSEC, configure DNS filtering, and block known malicious domains via Defender custom indicators.' },
  { ref: 'DF-036', category: 'COLLAB', priority: 'P1', title: 'Enable Microsoft Defender for Office 365', description: 'Enable MDO Plan 2 for all licensed users. Configure Safe Links, Safe Attachments, anti-phishing policies.' },
  { ref: 'DF-037', category: 'COLLAB', priority: 'P1', title: 'Configure Anti-Phishing and Impersonation Protection', description: 'Configure advanced anti-phishing policies targeting impersonation of executives, key vendors, and the organization domain.' },
  { ref: 'DF-038', category: 'COLLAB', priority: 'P1', title: 'Enable Attack Simulation Training', description: 'Run regular phishing simulations using Attack Simulation Training in MDO.' },
  { ref: 'DF-039', category: 'COLLAB', priority: 'P2', title: 'Restrict External Email Forwarding', description: 'Block automatic email forwarding to external domains via outbound anti-spam policy.' },
  { ref: 'DF-040', category: 'COLLAB', priority: 'P2', title: 'Enable Teams External Access Controls', description: 'Configure Teams external access and guest access policies. Restrict file sharing to approved domains only.' },
  { ref: 'DF-041', category: 'COLLAB', priority: 'P2', title: 'Audit SharePoint and OneDrive Sharing', description: 'Review and restrict SharePoint/OneDrive external sharing policies. Require link expiration and block anonymous sharing.' },
  { ref: 'DF-042', category: 'COLLAB', priority: 'P3', title: 'Enable Email Encryption for Sensitive Content', description: 'Configure OME for email containing sensitivity labels classified as Confidential or higher.' },
  { ref: 'DF-043', category: 'COLLAB', priority: 'P3', title: 'Implement DMARC/DKIM/SPF', description: 'Verify SPF, DKIM, and DMARC records are properly configured. Set DMARC policy to p=reject.' },
  { ref: 'DF-044', category: 'COLLAB', priority: 'P3', title: 'Enable Unified Audit Log', description: 'Ensure the Microsoft 365 Unified Audit Log is enabled for all workloads. Configure log retention to 1 year minimum.' },
] as const;

type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'not_applicable' | 'deferred';
type TaskPriority = 'P1' | 'P2' | 'P3';
type TaskCategory = 'IDENTITY' | 'ENDPOINT' | 'APPS' | 'DATA' | 'INFRA' | 'IOT' | 'NETWORK' | 'COLLAB';
const TASK_STATUSES = ['pending', 'in_progress', 'completed', 'not_applicable', 'deferred'] as const;
const TASK_PRIORITIES = ['P1', 'P2', 'P3'] as const;
const TASK_CATEGORIES = ['IDENTITY', 'ENDPOINT', 'APPS', 'DATA', 'INFRA', 'IOT', 'NETWORK', 'COLLAB'] as const;

const TasksQuerySchema = z.object({ category: z.enum(TASK_CATEGORIES).optional(), priority: z.enum(TASK_PRIORITIES).optional(), status: z.enum(TASK_STATUSES).optional() });
const TaskPatchBody = z.object({ status: z.enum(TASK_STATUSES).optional(), assignedTo: z.string().max(200).optional(), dueDate: z.string().optional(), notes: z.string().optional() });

type PrismaClient = NonNullable<Awaited<ReturnType<typeof getDB>>['prisma']>;

async function seedTenantTasks(prisma: PrismaClient, tid: string): Promise<void> {
  await Promise.all(DEFENDER_TASKS_SEED.map((t) => prisma.grcDefenderTask.upsert({
    where: { tenantId_taskRef: { tenantId: tid, taskRef: t.ref } },
    create: { id: uuidv7(), tenantId: tid, taskRef: t.ref, title: t.title, description: t.description, category: t.category, priority: t.priority, status: 'pending' },
    update: {},
  })));
}

function computeStats(tasks: Array<{ priority: string; status: string; category: string }>) {
  const byPriority: Record<TaskPriority, number> = { P1: 0, P2: 0, P3: 0 };
  const byStatus: Record<TaskStatus, number> = { pending: 0, in_progress: 0, completed: 0, not_applicable: 0, deferred: 0 };
  const byCategory: Record<TaskCategory, number> = { IDENTITY: 0, ENDPOINT: 0, APPS: 0, DATA: 0, INFRA: 0, IOT: 0, NETWORK: 0, COLLAB: 0 };
  for (const t of tasks) {
    if (t.priority in byPriority) byPriority[t.priority as TaskPriority]++;
    if (t.status in byStatus) byStatus[t.status as TaskStatus]++;
    if (t.category in byCategory) byCategory[t.category as TaskCategory]++;
  }
  const total = tasks.length;
  const done = byStatus.completed + byStatus.not_applicable;
  return { total, byPriority, byStatus, byCategory, percentComplete: total > 0 ? Math.round((done / total) * 100) : 0 };
}

function percentOf(tasks: Array<{ priority: string; status: string }>, priority: TaskPriority): number {
  const subset = tasks.filter((t) => t.priority === priority);
  if (subset.length === 0) return 0;
  const done = subset.filter((t) => t.status === 'completed' || t.status === 'not_applicable').length;
  return Math.round((done / subset.length) * 100);
}

/* ─── Microsoft Defender (Graph Secure Score) live sync ──────────────────────── */

/**
 * App-only Microsoft Graph token via client_credentials. Reuses the existing
 * zero-api Graph app registration already provisioned in production
 * (AUTH_MICROSOFT_ENTRA_ID_* / ZERO_GRAPH_CLIENT_SECRET) when the dedicated
 * AZURE_* vars are unset. Returns null when no credentials exist — callers then
 * fall back to simulated data.
 */
async function getGraphToken(): Promise<string | null> {
  const tenantId = process.env['AZURE_TENANT_ID'] ?? process.env['AUTH_MICROSOFT_ENTRA_ID_TENANT_ID'];
  const clientId = process.env['AZURE_CLIENT_ID'] ?? process.env['AUTH_MICROSOFT_ENTRA_ID_ID'];
  const clientSecret = process.env['AZURE_CLIENT_SECRET'] ?? process.env['ZERO_GRAPH_CLIENT_SECRET'];
  if (!tenantId || !clientId || !clientSecret) return null;

  const res = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
    method: 'POST',
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
      scope: 'https://graph.microsoft.com/.default',
    }),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { access_token?: string };
  return data.access_token ?? null;
}

interface GraphControlScore {
  controlName?: string;
  score?: number;
  total?: number;
  implementationStatus?: string;
  controlCategory?: string;
}
interface GraphControlProfile {
  id?: string;
  title?: string;
  controlCategory?: string;
  actionType?: string;
  service?: string;
  maxScore?: number;
  remediation?: string;
  threats?: string[];
}

interface DefenderControlRow {
  controlName: string;
  title: string;
  category: string;
  service: string | null;
  actionType: string | null;
  maxScore: number;
  currentScore: number;
  implementationStatus: string;
  remediation: string | null;
  threats: string[];
  source: string;
}

/** Pull live control posture from Microsoft Graph Security (Secure Score). */
async function fetchDefenderControls(token: string): Promise<DefenderControlRow[]> {
  const headers = { Authorization: `Bearer ${token}` };
  const [scoreRes, profileRes] = await Promise.all([
    fetch('https://graph.microsoft.com/v1.0/security/secureScores?$top=1', { headers }),
    fetch('https://graph.microsoft.com/v1.0/security/secureScoreControlProfiles?$top=200', { headers }),
  ]);
  if (!scoreRes.ok || !profileRes.ok) return [];

  const scoreData = (await scoreRes.json()) as { value?: Array<{ controlScores?: GraphControlScore[] }> };
  const profileData = (await profileRes.json()) as { value?: GraphControlProfile[] };

  const controlScores = scoreData.value?.[0]?.controlScores ?? [];
  const profiles = new Map<string, GraphControlProfile>();
  for (const p of profileData.value ?? []) {
    if (p.id) profiles.set(p.id.toLowerCase(), p);
  }

  return controlScores
    .filter((c): c is GraphControlScore & { controlName: string } => Boolean(c.controlName))
    .map((c) => {
      const profile = profiles.get(c.controlName.toLowerCase());
      return {
        controlName: c.controlName,
        title: profile?.title ?? c.controlName,
        category: c.controlCategory ?? profile?.controlCategory ?? 'Other',
        service: profile?.service ?? null,
        actionType: profile?.actionType ?? null,
        maxScore: profile?.maxScore ?? c.total ?? 0,
        currentScore: c.score ?? 0,
        implementationStatus: c.implementationStatus ?? 'unknown',
        remediation: profile?.remediation ?? null,
        threats: profile?.threats ?? [],
        source: 'defender',
      };
    });
}

/** Fallback controls shown until the Graph app reg + SecurityEvents.Read.All consent lands. */
const SIMULATED_DEFENDER_CONTROLS: DefenderControlRow[] = [
  { controlName: 'AdminMFAV2', title: 'Require MFA for administrative roles', category: 'Identity', service: 'Microsoft Entra ID', actionType: 'Config', maxScore: 10, currentScore: 10, implementationStatus: 'This control is complete', remediation: 'Require MFA for all admin accounts via Conditional Access.', threats: ['accountBreach'], source: 'simulated' },
  { controlName: 'MFARegistrationV2', title: 'Ensure all users can complete MFA', category: 'Identity', service: 'Microsoft Entra ID', actionType: 'Config', maxScore: 9, currentScore: 4.5, implementationStatus: 'This control is partially complete', remediation: 'Register all users for multi-factor authentication.', threats: ['accountBreach'], source: 'simulated' },
  { controlName: 'BlockLegacyAuthentication', title: 'Block legacy authentication', category: 'Identity', service: 'Microsoft Entra ID', actionType: 'Config', maxScore: 8, currentScore: 0, implementationStatus: 'This control is not complete', remediation: 'Block legacy auth protocols with a Conditional Access policy.', threats: ['accountBreach'], source: 'simulated' },
  { controlName: 'EnableWindowsDefenderAV', title: 'Ensure Microsoft Defender Antivirus is enabled', category: 'Device', service: 'Microsoft Defender for Endpoint', actionType: 'Config', maxScore: 8, currentScore: 6, implementationStatus: 'This control is partially complete', remediation: 'Onboard all devices and enable real-time protection.', threats: ['malware'], source: 'simulated' },
  { controlName: 'TenantBitLocker', title: 'Ensure BitLocker is enabled on Windows devices', category: 'Device', service: 'Microsoft Intune', actionType: 'Config', maxScore: 6, currentScore: 3, implementationStatus: 'This control is partially complete', remediation: 'Require disk encryption via an Intune compliance policy.', threats: ['dataExfiltration'], source: 'simulated' },
  { controlName: 'DLP', title: 'Enable Data Loss Prevention policies', category: 'Data', service: 'Microsoft Purview', actionType: 'Config', maxScore: 7, currentScore: 0, implementationStatus: 'This control is not complete', remediation: 'Deploy DLP policies across Exchange, SharePoint, and Teams.', threats: ['dataExfiltration'], source: 'simulated' },
  { controlName: 'SafeLinks', title: 'Ensure Safe Links is enabled', category: 'Apps', service: 'Microsoft Defender for Office 365', actionType: 'Config', maxScore: 5, currentScore: 5, implementationStatus: 'This control is complete', remediation: 'Enable the Safe Links policy for all users.', threats: ['phishing'], source: 'simulated' },
];

export const grcDefenderRoutes: FastifyPluginAsync = async (app) => {
  app.get('/tasks', { preHandler: requireModule('itsec', 'viewer') }, async (req, reply) => {
    const query = TasksQuerySchema.safeParse(req.query);
    if (!query.success) return reply.status(400).send({ error: 'invalid_query', issues: query.error.issues });
    const tid = req.auth!.tid;
    const db = await getDB(); if (!(db.ok && db.prisma)) return reply.status(503).send({ error: 'db_unavailable' });
    const { prisma } = db;
    const count = await prisma.grcDefenderTask.count({ where: { tenantId: tid } });
    if (count === 0) await seedTenantTasks(prisma, tid);
    const where: { tenantId: string; category?: string; priority?: string; status?: string } = { tenantId: tid };
    if (query.data.category) where.category = query.data.category;
    if (query.data.priority) where.priority = query.data.priority;
    if (query.data.status) where.status = query.data.status;
    const tasks = await prisma.grcDefenderTask.findMany({ where, orderBy: [{ priority: 'asc' }, { taskRef: 'asc' }] });
    const allTasks = await prisma.grcDefenderTask.findMany({ where: { tenantId: tid }, select: { priority: true, status: true, category: true } });
    return reply.send({ tasks, stats: computeStats(allTasks) });
  });

  app.post('/tasks/seed', { preHandler: requireModule('itsec', 'admin') }, async (req, reply) => {
    const tid = req.auth!.tid;
    const db = await getDB(); if (!(db.ok && db.prisma)) return reply.status(503).send({ error: 'db_unavailable' });
    await seedTenantTasks(db.prisma, tid);
    return reply.status(200).send({ seeded: 44 });
  });

  app.get('/tasks/:ref', { preHandler: requireModule('itsec', 'viewer') }, async (req, reply) => {
    const { ref } = req.params as { ref: string };
    const tid = req.auth!.tid;
    const db = await getDB(); if (!(db.ok && db.prisma)) return reply.status(503).send({ error: 'db_unavailable' });
    const { prisma } = db;
    const task = await prisma.grcDefenderTask.findUnique({ where: { tenantId_taskRef: { tenantId: tid, taskRef: ref } } });
    if (!task) return reply.status(404).send({ error: 'task_not_found' });
    return reply.send(task);
  });

  app.patch('/tasks/:ref', { preHandler: requireModule('itsec', 'editor') }, async (req, reply) => {
    const { ref } = req.params as { ref: string };
    const body = TaskPatchBody.safeParse(req.body);
    if (!body.success) return reply.status(400).send({ error: 'invalid_body', issues: body.error.issues });
    const tid = req.auth!.tid;
    const db = await getDB(); if (!(db.ok && db.prisma)) return reply.status(503).send({ error: 'db_unavailable' });
    const { prisma } = db;
    const existing = await prisma.grcDefenderTask.findUnique({ where: { tenantId_taskRef: { tenantId: tid, taskRef: ref } } });
    if (!existing) return reply.status(404).send({ error: 'task_not_found' });
    const { status, assignedTo, dueDate, notes } = body.data;
    const updateData: { status?: string; assignedTo?: string; dueDate?: Date | null; notes?: string; completedAt?: Date | null; updatedAt: Date } = { updatedAt: new Date() };
    if (status !== undefined) { updateData.status = status; updateData.completedAt = status === 'completed' ? new Date() : null; }
    if (assignedTo !== undefined) updateData.assignedTo = assignedTo;
    if (dueDate !== undefined) updateData.dueDate = dueDate ? new Date(dueDate) : null;
    if (notes !== undefined) updateData.notes = notes;
    const updated = await prisma.grcDefenderTask.update({ where: { tenantId_taskRef: { tenantId: tid, taskRef: ref } }, data: updateData });
    recordAudit({ tenantId: tid, actorUserId: req.auth!.sub, actorRole: req.auth!.roles[0] ?? 'viewer', action: 'grc.defender.task.update', resourceType: 'GrcDefenderTask', resourceId: existing.id, beforeJson: { status: existing.status }, afterJson: body.data });
    return reply.send(updated);
  });

  app.get('/dashboard', { preHandler: requireModule('itsec', 'viewer') }, async (req, reply) => {
    const tid = req.auth!.tid;
    const db = await getDB(); if (!(db.ok && db.prisma)) return reply.status(503).send({ error: 'db_unavailable' });
    const { prisma } = db;
    const count = await prisma.grcDefenderTask.count({ where: { tenantId: tid } });
    if (count === 0) await seedTenantTasks(prisma, tid);
    const allTasks = await prisma.grcDefenderTask.findMany({ where: { tenantId: tid }, orderBy: [{ priority: 'asc' }, { taskRef: 'asc' }] });
    const stats = computeStats(allTasks);
    const byCategory = TASK_CATEGORIES.map((cat) => { const catTasks = allTasks.filter((t) => t.category === cat); const done = catTasks.filter((t) => t.status === 'completed' || t.status === 'not_applicable').length; return { category: cat, total: catTasks.length, completed: done, percentComplete: catTasks.length > 0 ? Math.round((done / catTasks.length) * 100) : 0 }; });
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const overdueTasks = allTasks.filter((t) => t.dueDate !== null && t.dueDate < today && t.status !== 'completed' && t.status !== 'not_applicable');
    const recentlyCompleted = allTasks.filter((t) => t.status === 'completed' && t.completedAt !== null).sort((a, b) => (b.completedAt?.getTime() ?? 0) - (a.completedAt?.getTime() ?? 0)).slice(0, 5);
    return reply.send({ overallPercent: stats.percentComplete, p1Percent: percentOf(allTasks, 'P1'), p2Percent: percentOf(allTasks, 'P2'), p3Percent: percentOf(allTasks, 'P3'), byCategory, overdueTasks, recentlyCompleted });
  });

  /* ── POST /defender-sync ─────────────────────────────────────────────────────
   * Pull live control posture from Microsoft Defender (Graph Secure Score) and
   * upsert into grc_defender_control. Falls back to simulated controls when the
   * Graph app registration / SecurityEvents.Read.All consent is not yet in place. */
  app.post('/defender-sync', { preHandler: requireModule('itsec', 'admin') }, async (req, reply) => {
    const tid = req.auth!.tid;
    const db = await getDB(); if (!(db.ok && db.prisma)) return reply.status(503).send({ error: 'db_unavailable' });
    const { prisma } = db;

    const token = await getGraphToken();
    let controls: DefenderControlRow[] = [];
    if (token) controls = await fetchDefenderControls(token);
    const live = controls.length > 0;
    if (!live) controls = SIMULATED_DEFENDER_CONTROLS;

    const now = new Date();
    for (const c of controls) {
      const fields = {
        title: c.title,
        category: c.category,
        service: c.service,
        actionType: c.actionType,
        maxScore: c.maxScore,
        currentScore: c.currentScore,
        implementationStatus: c.implementationStatus,
        remediation: c.remediation,
        threats: c.threats,
        source: c.source,
        lastSyncedAt: now,
      };
      await prisma.grcDefenderControl.upsert({
        where: { tenantId_controlName: { tenantId: tid, controlName: c.controlName } },
        create: { id: uuidv7(), tenantId: tid, controlName: c.controlName, ...fields },
        update: fields,
      });
    }

    recordAudit({ tenantId: tid, actorUserId: req.auth!.sub, actorRole: req.auth!.roles[0] ?? 'itsec', action: 'grc.defender.sync', resourceType: 'GrcDefenderControl', resourceId: tid, beforeJson: null, afterJson: { synced: controls.length, live } });

    return reply.send({ synced: controls.length, live, source: live ? 'defender' : 'simulated' });
  });

  /* ── GET /defender-controls ──────────────────────────────────────────────────
   * Live Microsoft Defender control posture with per-category rollups. */
  app.get('/defender-controls', { preHandler: requireModule('itsec', 'viewer') }, async (req, reply) => {
    const tid = req.auth!.tid;
    const db = await getDB(); if (!(db.ok && db.prisma)) return reply.status(503).send({ error: 'db_unavailable' });
    const { prisma } = db;

    const controls = await prisma.grcDefenderControl.findMany({ where: { tenantId: tid }, orderBy: [{ category: 'asc' }, { maxScore: 'desc' }] });

    const totalMax = controls.reduce((s, c) => s + Number(c.maxScore), 0);
    const totalCurrent = controls.reduce((s, c) => s + Number(c.currentScore), 0);

    const byCategoryMap = new Map<string, { category: string; current: number; max: number; count: number }>();
    for (const c of controls) {
      const e = byCategoryMap.get(c.category) ?? { category: c.category, current: 0, max: 0, count: 0 };
      e.current += Number(c.currentScore);
      e.max += Number(c.maxScore);
      e.count += 1;
      byCategoryMap.set(c.category, e);
    }

    return reply.send({
      controls: controls.map((c) => ({
        id: c.id,
        controlName: c.controlName,
        title: c.title,
        category: c.category,
        service: c.service,
        actionType: c.actionType,
        maxScore: Number(c.maxScore),
        currentScore: Number(c.currentScore),
        implementationStatus: c.implementationStatus,
        remediation: c.remediation,
        threats: c.threats,
        source: c.source,
        lastSyncedAt: c.lastSyncedAt.toISOString(),
      })),
      summary: {
        totalControls: controls.length,
        totalCurrent,
        totalMax,
        percent: totalMax > 0 ? Math.round((totalCurrent / totalMax) * 100) : 0,
        byCategory: [...byCategoryMap.values()].sort((a, b) => a.category.localeCompare(b.category)),
        source: controls[0]?.source ?? null,
        lastSyncedAt: controls[0]?.lastSyncedAt.toISOString() ?? null,
      },
    });
  });
};
