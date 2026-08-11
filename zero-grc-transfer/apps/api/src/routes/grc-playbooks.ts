/**
 * GRC Remediation Playbooks — 15 security/compliance categories with step-by-step
 * procedure management and policy-document generation.
 *
 *   GET  /categories                   — list categories with active-playbook counts
 *   GET  /playbooks                    — paginated list with optional category/status filter
 *   GET  /playbooks/:id                — single playbook with ordered steps
 *   POST /playbooks                    — create playbook + optional inline steps
 *   PATCH /playbooks/:id               — update title/description/status/framework (bumps version)
 *   POST /playbooks/:id/steps          — append a step to an existing playbook
 *   DELETE /playbooks/:id/steps/:stepId — remove a step
 *   POST /playbooks/:id/generate-policy — render a structured policy document from playbook data
 *   GET  /dashboard                    — summary counts, breakdown by category/framework/status
 */

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { v7 as uuidv7 } from 'uuid';
import { requireModule } from '../middleware/module-guard.js';
import { getDB } from './time.js';
import { record as recordAudit } from '../lib/audit-collector.js';

// ─── Playbook category registry ───────────────────────────────────────────────

const PLAYBOOK_CATEGORIES: Record<string, { label: string; framework: string }> = {
  IR:     { label: 'Incident Response',        framework: 'FedRAMP' },
  PHI:    { label: 'PHI / HIPAA Breach',        framework: 'HIPAA' },
  MFA:    { label: 'MFA Rollout',               framework: 'CMMC' },
  PATCH:  { label: 'Patch Management',          framework: 'FedRAMP' },
  EDR:    { label: 'EDR Deployment',            framework: 'CMMC' },
  AV:     { label: 'Antivirus Response',        framework: 'General' },
  CLOUD:  { label: 'Cloud Misconfiguration',    framework: 'FedRAMP' },
  VULN:   { label: 'Vulnerability Remediation', framework: 'FedRAMP' },
  SOC:    { label: 'SOC Triage',                framework: 'General' },
  PRIV:   { label: 'Privilege Escalation',      framework: 'CMMC' },
  MOBILE: { label: 'Mobile Device Compromise',  framework: 'General' },
  BCDR:   { label: 'Business Continuity',       framework: 'FedRAMP' },
  VENDOR: { label: 'Vendor / Supply Chain',     framework: 'CMMC' },
  CHANGE: { label: 'Change Management',         framework: 'General' },
  DATA:   { label: 'Data Breach Response',      framework: 'FedRAMP' },
};

// ─── Zod schemas ─────────────────────────────────────────────────────────────

const listQuerySchema = z.object({
  category: z.string().optional(),
  status: z.enum(['draft', 'active', 'archived']).optional(),
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
});

const createPlaybookSchema = z.object({
  category:    z.string(),
  title:       z.string().max(200),
  description: z.string(),
  framework:   z.string().default('General'),
  steps: z.array(z.object({
    title:          z.string(),
    description:    z.string(),
    responsible:    z.string(),
    estimatedHours: z.number().optional(),
    evidence:       z.string().optional(),
  })).default([]),
});

const patchPlaybookSchema = z.object({
  title:       z.string().max(200).optional(),
  description: z.string().optional(),
  status:      z.enum(['draft', 'active', 'archived']).optional(),
  framework:   z.string().optional(),
});

const createStepSchema = z.object({
  title:          z.string(),
  description:    z.string(),
  responsible:    z.string(),
  estimatedHours: z.number().optional(),
  evidence:       z.string().optional(),
});

// ─── Plugin ───────────────────────────────────────────────────────────────────

type PbPrisma = NonNullable<Awaited<ReturnType<typeof getDB>>['prisma']>;

const STANDARD_PLAYBOOK_STEPS = [
  { title: 'Detect & Triage',  responsible: 'SOC Analyst',       description: 'Identify the event, validate its severity, and open an incident record.' },
  { title: 'Contain',          responsible: 'Security Engineer', description: 'Isolate affected systems or accounts to limit the blast radius.' },
  { title: 'Eradicate',        responsible: 'Security Engineer', description: 'Remove the root cause and any persistence; patch the exploited weakness.' },
  { title: 'Recover & Review', responsible: 'IT Manager',        description: 'Restore services, confirm normal operation, and run a post-incident review.' },
];

/**
 * Seed one starter playbook (with the 4 standard steps) per category so the library shows
 * content on first load. Idempotent — no-op once any playbook exists. Sample data users edit.
 */
export async function seedPlaybookLibrary(prisma: PbPrisma, tid: string): Promise<void> {
  if ((await prisma.grcPlaybook.count({ where: { tenantId: tid } })) > 0) return;
  let n = 0;
  for (const [key, meta] of Object.entries(PLAYBOOK_CATEGORIES)) {
    n += 1;
    const pbId = uuidv7();
    await prisma.grcPlaybook.create({
      data: {
        id: pbId, tenantId: tid, ref: `PBK-SAMPLE-${String(n).padStart(4, '0')}`,
        category: key, title: `${meta.label} Response Playbook`,
        description: `Standard operating procedure for ${meta.label.toLowerCase()} events. Sample starter playbook — edit the steps to match your environment.`,
        framework: meta.framework, status: 'active', version: 1, createdBy: 'sample-data',
      },
    });
    await prisma.grcPlaybookStep.createMany({
      data: STANDARD_PLAYBOOK_STEPS.map((s, i) => ({
        id: uuidv7(), playbookId: pbId, stepOrder: i + 1,
        title: s.title, description: s.description, responsible: s.responsible,
        estimatedHours: null, evidence: null,
      })),
    });
  }
}

export const grcPlaybooksRoutes: FastifyPluginAsync = async (app) => {
  // ─── GET /categories ──────────────────────────────────────────────────────
  app.get('/categories', { preHandler: requireModule('itsec', 'viewer') }, async (req, reply) => {
    const db = await getDB();
    if (!(db.ok && db.prisma)) return reply.status(503).send({ error: 'db_unavailable' });
    const { prisma } = db;
    const tid = req.auth!.tid;

    await seedPlaybookLibrary(prisma, tid);

    const rows = await prisma.grcPlaybook.groupBy({
      by: ['category'],
      where: { tenantId: tid, status: 'active' },
      _count: { id: true },
    });

    const counts: Record<string, number> = {};
    for (const row of rows) {
      counts[row.category] = row._count.id;
    }

    return Object.entries(PLAYBOOK_CATEGORIES).map(([key, meta]) => ({
      key,
      label: meta.label,
      framework: meta.framework,
      count: counts[key] ?? 0,
    }));
  });

  // ─── GET /playbooks ───────────────────────────────────────────────────────
  app.get('/playbooks', { preHandler: requireModule('itsec', 'viewer') }, async (req, reply) => {
    const db = await getDB();
    if (!(db.ok && db.prisma)) return reply.status(503).send({ error: 'db_unavailable' });
    const { prisma } = db;
    const tid = req.auth!.tid;

    await seedPlaybookLibrary(prisma, tid);

    const parsed = listQuerySchema.safeParse(req.query);
    if (!parsed.success) return reply.status(400).send({ error: 'invalid_query', details: parsed.error.flatten() });
    const { category, status, page, limit } = parsed.data;

    const where = {
      tenantId: tid,
      ...(category ? { category } : {}),
      ...(status   ? { status }   : {}),
    };

    const skip = (page - 1) * limit;

    const [rawPlaybooks, total] = await Promise.all([
      prisma.grcPlaybook.findMany({
        where,
        include: { steps: { select: { id: true } } },
        orderBy: { updatedAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.grcPlaybook.count({ where }),
    ]);

    const playbooks = rawPlaybooks.map(({ steps, ...pb }) => ({
      ...pb,
      stepCount: steps.length,
    }));

    return { playbooks, total, page, limit };
  });

  // ─── GET /playbooks/:id ───────────────────────────────────────────────────
  app.get('/playbooks/:id', { preHandler: requireModule('itsec', 'viewer') }, async (req, reply) => {
    const db = await getDB();
    if (!(db.ok && db.prisma)) return reply.status(503).send({ error: 'db_unavailable' });
    const { prisma } = db;
    const tid = req.auth!.tid;
    const { id } = req.params as { id: string };

    const playbook = await prisma.grcPlaybook.findFirst({
      where: { id },
      include: { steps: { orderBy: { stepOrder: 'asc' } } },
    });

    if (!playbook || playbook.tenantId !== tid) {
      return reply.status(404).send({ error: 'not_found' });
    }

    return playbook;
  });

  // ─── POST /playbooks ──────────────────────────────────────────────────────
  app.post('/playbooks', { preHandler: requireModule('itsec', 'editor') }, async (req, reply) => {
    const db = await getDB();
    if (!(db.ok && db.prisma)) return reply.status(503).send({ error: 'db_unavailable' });
    const { prisma } = db;
    const tid = req.auth!.tid;

    const parsed = createPlaybookSchema.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: 'invalid_body', details: parsed.error.flatten() });
    const body = parsed.data;

    const count = await prisma.grcPlaybook.count({ where: { tenantId: tid } });
    const ref = `PBK-${new Date().getFullYear()}-${String(count + 1).padStart(4, '0')}`;

    const playbook = await prisma.$transaction(async (tx) => {
      const pb = await tx.grcPlaybook.create({
        data: {
          id:          uuidv7(),
          tenantId:    tid,
          ref,
          category:    body.category,
          title:       body.title,
          description: body.description,
          framework:   body.framework,
          status:      'draft',
          version:     1,
          createdBy:   req.auth!.sub,
        },
      });

      if (body.steps.length > 0) {
        await tx.grcPlaybookStep.createMany({
          data: body.steps.map((s, i) => ({
            id:             uuidv7(),
            playbookId:     pb.id,
            stepOrder:      i + 1,
            title:          s.title,
            description:    s.description,
            responsible:    s.responsible,
            estimatedHours: s.estimatedHours ?? null,
            evidence:       s.evidence ?? null,
          })),
        });
      }

      return tx.grcPlaybook.findFirst({
        where: { id: pb.id },
        include: { steps: { orderBy: { stepOrder: 'asc' } } },
      });
    });

    recordAudit({
      tenantId:     tid,
      actorUserId:  req.auth!.sub,
      actorRole:    req.auth!.roles[0] ?? 'compliance',
      action:       'grc.playbook.create',
      resourceType: 'grc_playbook',
      resourceId:   playbook!.id,
      beforeJson:   null,
      afterJson:    { ref: playbook!.ref, category: playbook!.category, title: playbook!.title },
    });

    // Include stepCount so the list card shows the right count without a refetch.
    return reply.status(201).send({ ...playbook!, stepCount: playbook!.steps.length });
  });

  // ─── PATCH /playbooks/:id ─────────────────────────────────────────────────
  app.patch('/playbooks/:id', { preHandler: requireModule('itsec', 'editor') }, async (req, reply) => {
    const db = await getDB();
    if (!(db.ok && db.prisma)) return reply.status(503).send({ error: 'db_unavailable' });
    const { prisma } = db;
    const tid = req.auth!.tid;
    const { id } = req.params as { id: string };

    const existing = await prisma.grcPlaybook.findFirst({ where: { id, tenantId: tid } });
    if (!existing) return reply.status(404).send({ error: 'not_found' });

    const parsed = patchPlaybookSchema.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: 'invalid_body', details: parsed.error.flatten() });
    const body = parsed.data;

    const updated = await prisma.grcPlaybook.update({
      where: { id },
      data: {
        ...(body.title       !== undefined ? { title: body.title }             : {}),
        ...(body.description !== undefined ? { description: body.description } : {}),
        ...(body.status      !== undefined ? { status: body.status }           : {}),
        ...(body.framework   !== undefined ? { framework: body.framework }     : {}),
        version: { increment: 1 },
      },
      include: { steps: { orderBy: { stepOrder: 'asc' } } },
    });

    recordAudit({
      tenantId:     tid,
      actorUserId:  req.auth!.sub,
      actorRole:    req.auth!.roles[0] ?? 'compliance',
      action:       'grc.playbook.update',
      resourceType: 'grc_playbook',
      resourceId:   id,
      beforeJson:   { title: existing.title, status: existing.status, version: existing.version },
      afterJson:    { title: updated.title, status: updated.status, version: updated.version },
    });

    return updated;
  });

  // ─── POST /playbooks/:id/steps ────────────────────────────────────────────
  app.post('/playbooks/:id/steps', { preHandler: requireModule('itsec', 'editor') }, async (req, reply) => {
    const db = await getDB();
    if (!(db.ok && db.prisma)) return reply.status(503).send({ error: 'db_unavailable' });
    const { prisma } = db;
    const tid = req.auth!.tid;
    const { id } = req.params as { id: string };

    const playbook = await prisma.grcPlaybook.findFirst({ where: { id, tenantId: tid } });
    if (!playbook) return reply.status(404).send({ error: 'not_found' });

    const parsed = createStepSchema.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: 'invalid_body', details: parsed.error.flatten() });
    const body = parsed.data;

    const maxResult = await prisma.grcPlaybookStep.aggregate({
      where: { playbookId: id },
      _max: { stepOrder: true },
    });
    const nextOrder = (maxResult._max.stepOrder ?? 0) + 1;

    const step = await prisma.grcPlaybookStep.create({
      data: {
        id:             uuidv7(),
        playbookId:     id,
        stepOrder:      nextOrder,
        title:          body.title,
        description:    body.description,
        responsible:    body.responsible,
        estimatedHours: body.estimatedHours ?? null,
        evidence:       body.evidence ?? null,
      },
    });

    recordAudit({
      tenantId:     tid,
      actorUserId:  req.auth!.sub,
      actorRole:    req.auth!.roles[0] ?? 'compliance',
      action:       'grc.playbook.step.create',
      resourceType: 'grc_playbook_step',
      resourceId:   step.id,
      beforeJson:   null,
      afterJson:    { playbookId: id, stepOrder: nextOrder, title: step.title },
    });

    return reply.status(201).send(step);
  });

  // ─── DELETE /playbooks/:id/steps/:stepId ─────────────────────────────────
  app.delete('/playbooks/:id/steps/:stepId', { preHandler: requireModule('itsec', 'editor') }, async (req, reply) => {
    const db = await getDB();
    if (!(db.ok && db.prisma)) return reply.status(503).send({ error: 'db_unavailable' });
    const { prisma } = db;
    const tid = req.auth!.tid;
    const { id, stepId } = req.params as { id: string; stepId: string };

    const playbook = await prisma.grcPlaybook.findFirst({ where: { id, tenantId: tid } });
    if (!playbook) return reply.status(404).send({ error: 'not_found' });

    const step = await prisma.grcPlaybookStep.findFirst({ where: { id: stepId, playbookId: id } });
    if (!step) return reply.status(404).send({ error: 'step_not_found' });

    await prisma.grcPlaybookStep.delete({ where: { id: stepId } });

    recordAudit({
      tenantId:     tid,
      actorUserId:  req.auth!.sub,
      actorRole:    req.auth!.roles[0] ?? 'compliance',
      action:       'grc.playbook.step.delete',
      resourceType: 'grc_playbook_step',
      resourceId:   stepId,
      beforeJson:   { playbookId: id, stepOrder: step.stepOrder, title: step.title },
      afterJson:    null,
    });

    return reply.status(204).send();
  });

  // ─── POST /playbooks/:id/generate-policy ──────────────────────────────────
  app.post('/playbooks/:id/generate-policy', { preHandler: requireModule('itsec', 'editor') }, async (req, reply) => {
    const db = await getDB();
    if (!(db.ok && db.prisma)) return reply.status(503).send({ error: 'db_unavailable' });
    const { prisma } = db;
    const tid = req.auth!.tid;
    const { id } = req.params as { id: string };

    const playbook = await prisma.grcPlaybook.findFirst({
      where: { id, tenantId: tid },
      include: { steps: { orderBy: { stepOrder: 'asc' } } },
    });
    if (!playbook) return reply.status(404).send({ error: 'not_found' });

    const today = new Date().toISOString().slice(0, 10);
    const categoryMeta = PLAYBOOK_CATEGORIES[playbook.category];
    const categoryLabel = categoryMeta?.label ?? playbook.category;

    const stepsText = playbook.steps.length > 0
      ? playbook.steps
          .map((s, i) =>
            `Step ${i + 1}: ${s.title}\nResponsible: ${s.responsible}\n${s.description}` +
            (s.estimatedHours !== null ? `\nEstimated Hours: ${s.estimatedHours}` : '') +
            (s.evidence ? `\nEvidence Required: ${s.evidence}` : ''),
          )
          .join('\n\n')
      : 'No procedure steps defined. Add steps to populate this section.';

    const policyText = [
      `${playbook.category} SECURITY POLICY AND PROCEDURE`,
      `Title: ${playbook.title}`,
      `Framework: ${playbook.framework}`,
      `Version: ${playbook.version}`,
      `Effective Date: ${today}`,
      '',
      '1. PURPOSE',
      playbook.description,
      '',
      '2. SCOPE',
      'This policy applies to all personnel with access to systems and data within InterScripts, Inc.',
      '',
      '3. PROCEDURE STEPS',
      stepsText,
      '',
      '4. REVIEW SCHEDULE',
      'This policy shall be reviewed annually or upon significant changes.',
      '',
      '5. POLICY OWNER',
      `Framework: ${playbook.framework} | Category: ${categoryLabel}`,
      `Document Ref: ${playbook.ref} | Status: ${playbook.status}`,
    ].join('\n');

    const title = `${playbook.title} — Policy Document (${today})`;

    recordAudit({
      tenantId:     tid,
      actorUserId:  req.auth!.sub,
      actorRole:    req.auth!.roles[0] ?? 'compliance',
      action:       'grc.playbook.generate-policy',
      resourceType: 'grc_playbook',
      resourceId:   id,
      beforeJson:   null,
      afterJson:    { ref: playbook.ref, title, generatedAt: today },
    });

    return { title, policyText };
  });

  // ─── GET /dashboard ───────────────────────────────────────────────────────
  app.get('/dashboard', { preHandler: requireModule('itsec', 'viewer') }, async (req, reply) => {
    const db = await getDB();
    if (!(db.ok && db.prisma)) return reply.status(503).send({ error: 'db_unavailable' });
    const { prisma } = db;
    const tid = req.auth!.tid;

    const [totalPlaybooks, byCategoryRows, byFrameworkRows, byStatusRows, recentlyUpdated] =
      await Promise.all([
        prisma.grcPlaybook.count({ where: { tenantId: tid } }),
        prisma.grcPlaybook.groupBy({
          by: ['category'],
          where: { tenantId: tid },
          _count: { id: true },
        }),
        prisma.grcPlaybook.groupBy({
          by: ['framework'],
          where: { tenantId: tid },
          _count: { id: true },
        }),
        prisma.grcPlaybook.groupBy({
          by: ['status'],
          where: { tenantId: tid },
          _count: { id: true },
        }),
        prisma.grcPlaybook.findMany({
          where: { tenantId: tid },
          orderBy: { updatedAt: 'desc' },
          take: 5,
          select: {
            id:        true,
            ref:       true,
            category:  true,
            title:     true,
            status:    true,
            framework: true,
            version:   true,
            updatedAt: true,
          },
        }),
      ]);

    const byCategory: Record<string, number> = {};
    for (const row of byCategoryRows) {
      byCategory[row.category] = row._count.id;
    }

    const byFramework: Record<string, number> = {};
    for (const row of byFrameworkRows) {
      byFramework[row.framework] = row._count.id;
    }

    const byStatus: Record<string, number> = {};
    for (const row of byStatusRows) {
      byStatus[row.status] = row._count.id;
    }

    return {
      totalPlaybooks,
      byCategory,
      byFramework,
      byStatus,
      recentlyUpdated,
    };
  });
};
