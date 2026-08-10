import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { requireModule } from '../middleware/module-guard.js';
import { getDB } from './time.js';

export const grcDashboardRoutes: FastifyPluginAsync = async (app) => {
  // ─── GET /summary ────────────────────────────────────────────────────
  // Aggregated GRC posture across all modules for the tenant.
  app.get('/summary', { preHandler: requireModule('compliance', 'viewer') }, async (req, reply) => {
    const tid = req.auth!.tid;
    const db = await getDB();
    if (!(db.ok && db.prisma)) return reply.status(503).send({ error: 'db_unavailable' });
    const { prisma } = db;

    const [
      frameworks,
      controlGroups,
      defenderGroups,
      secureScore,
      playbookGroups,
      fortiConfig,
      fortiAlertGroups,
      vantaConfig,
    ] = await Promise.all([
      prisma.grcFramework.findMany({ where: { tenantId: tid } }),
      prisma.grcControlAssessment.groupBy({
        by: ['frameworkKey', 'status'],
        where: { tenantId: tid },
        _count: true,
      }),
      prisma.grcDefenderTask.groupBy({
        by: ['status', 'priority'],
        where: { tenantId: tid },
        _count: true,
      }),
      prisma.grcSecureScoreSnapshot.findFirst({
        where: { tenantId: tid },
        orderBy: { snapshotAt: 'desc' },
      }),
      prisma.grcPlaybook.groupBy({
        by: ['category', 'status'],
        where: { tenantId: tid },
        _count: true,
      }),
      prisma.grcFortiGateConfig.findUnique({ where: { tenantId: tid } }),
      prisma.grcFortiGateAlert.groupBy({
        by: ['status', 'severity'],
        where: { tenantId: tid },
        _count: true,
      }),
      prisma.grcVantaConfig.findUnique({ where: { tenantId: tid } }),
    ]);

    const frameworkStats = (frameworks ?? []).map((fw) => {
      const fwGroups = (controlGroups ?? []).filter((g) => g.frameworkKey === fw.key);
      const total = fwGroups.reduce((s, g) => s + (g._count ?? 0), 0);
      const complete = fwGroups
        .filter((g) => g.status === 'compliant' || g.status === 'implemented')
        .reduce((s, g) => s + (g._count ?? 0), 0);
      return {
        key: fw.key,
        name: (fw as Record<string, unknown>).name as string ?? fw.key,
        totalControls: total,
        percentComplete: total > 0 ? Math.round((complete / total) * 100) : 0,
      };
    });

    const defTotal = (defenderGroups ?? []).reduce((s, g) => s + (g._count ?? 0), 0);
    const defDone = (defenderGroups ?? []).filter((g) => g.status === 'completed').reduce((s, g) => s + (g._count ?? 0), 0);
    const defP = (priority: string) => (defenderGroups ?? []).filter((g) => g.priority === priority).reduce((s, g) => s + (g._count ?? 0), 0);
    const p1Total = defP('P1'); const p2Total = defP('P2'); const p3Total = defP('P3');
    const defP1Done = (defenderGroups ?? []).filter((g) => g.priority === 'P1' && g.status === 'completed').reduce((s, g) => s + (g._count ?? 0), 0);
    const defP2Done = (defenderGroups ?? []).filter((g) => g.priority === 'P2' && g.status === 'completed').reduce((s, g) => s + (g._count ?? 0), 0);
    const defP3Done = (defenderGroups ?? []).filter((g) => g.priority === 'P3' && g.status === 'completed').reduce((s, g) => s + (g._count ?? 0), 0);

    const secureScoreSummary = secureScore
      ? {
          score: Number(secureScore.score) ?? null,
          maxScore: Number(secureScore.maxScore) ?? null,
          percentage:
            secureScore.maxScore && Number(secureScore.maxScore) > 0
              ? Math.round((Number(secureScore.score) / Number(secureScore.maxScore)) * 100)
              : null,
          snapshotAt: secureScore.snapshotAt ?? null,
        }
      : null;

    const playbookTotal = (playbookGroups ?? []).reduce((s, g) => s + (g._count ?? 0), 0);
    const playbookByStatus = {
      active: (playbookGroups ?? []).filter((g) => g.status === 'active').reduce((s, g) => s + (g._count ?? 0), 0),
      draft: (playbookGroups ?? []).filter((g) => g.status === 'draft').reduce((s, g) => s + (g._count ?? 0), 0),
      archived: (playbookGroups ?? []).filter((g) => g.status === 'archived').reduce((s, g) => s + (g._count ?? 0), 0),
    };

    const fortiOpenAlerts = (fortiAlertGroups ?? []).filter((g) => g.status === 'open').reduce((s, g) => s + (g._count ?? 0), 0);
    const fortiCritical = (fortiAlertGroups ?? []).filter((g) => g.status === 'open' && g.severity === 'critical').reduce((s, g) => s + (g._count ?? 0), 0);

    const vantaSummary = {
      configured: vantaConfig != null,
      lastSyncAt: vantaConfig ? ((vantaConfig as Record<string, unknown>).lastSyncAt as string | null ?? null) : null,
      lastSyncStatus: vantaConfig ? ((vantaConfig as Record<string, unknown>).lastSyncStatus as string | null ?? null) : null,
    };

    return {
      frameworks: frameworkStats,
      defenderPlan: {
        total: defTotal,
        percentComplete: defTotal > 0 ? Math.round((defDone / defTotal) * 100) : 0,
        p1Percent: p1Total > 0 ? Math.round((defP1Done / p1Total) * 100) : 0,
        p2Percent: p2Total > 0 ? Math.round((defP2Done / p2Total) * 100) : 0,
        p3Percent: p3Total > 0 ? Math.round((defP3Done / p3Total) * 100) : 0,
      },
      secureScore: secureScoreSummary,
      playbooks: { total: playbookTotal, byStatus: playbookByStatus },
      fortigate: { configured: fortiConfig != null, openAlerts: fortiOpenAlerts, criticalAlerts: fortiCritical },
      vanta: vantaSummary,
    };
  });

  // ─── GET /posture-score ───────────────────────────────────────────────
  app.get('/posture-score', { preHandler: requireModule('compliance', 'viewer') }, async (req, reply) => {
    const tid = req.auth!.tid;
    const db = await getDB();
    if (!(db.ok && db.prisma)) return reply.status(503).send({ error: 'db_unavailable' });
    const { prisma } = db;

    const [controlGroups, defenderGroups, secureScore] = await Promise.all([
      prisma.grcControlAssessment.groupBy({ by: ['frameworkKey', 'status'], where: { tenantId: tid }, _count: true }),
      prisma.grcDefenderTask.groupBy({ by: ['status', 'priority'], where: { tenantId: tid }, _count: true }),
      prisma.grcSecureScoreSnapshot.findFirst({ where: { tenantId: tid }, orderBy: { snapshotAt: 'desc' } }),
    ]);

    const totalControls = (controlGroups ?? []).reduce((s, g) => s + (g._count ?? 0), 0);
    const completeControls = (controlGroups ?? []).filter((g) => g.status === 'compliant' || g.status === 'implemented').reduce((s, g) => s + (g._count ?? 0), 0);
    const frameworkScore = totalControls > 0 ? Math.round((completeControls / totalControls) * 100) : null;

    const p1Tasks = (defenderGroups ?? []).filter((g) => g.priority === 'P1').reduce((s, g) => s + (g._count ?? 0), 0);
    const p1Done = (defenderGroups ?? []).filter((g) => g.priority === 'P1' && g.status === 'completed').reduce((s, g) => s + (g._count ?? 0), 0);
    const defenderScore = p1Tasks > 0 ? Math.round((p1Done / p1Tasks) * 100) : null;

    const ssMax = secureScore ? Number(secureScore.maxScore) : null;
    const ssCurrent = secureScore ? Number(secureScore.score) : null;
    const secureScorePercent = ssMax != null && ssMax > 0 && ssCurrent != null ? Math.round((ssCurrent / ssMax) * 100) : null;

    type Component = { score: number | null; baseWeight: number };
    const components: Component[] = [
      { score: frameworkScore, baseWeight: 40 },
      { score: defenderScore, baseWeight: 30 },
      { score: secureScorePercent, baseWeight: 30 },
    ];

    const available = components.filter((c) => c.score != null);
    let postureScore = 0;
    if (available.length === 0) { postureScore = 0; } else {
      const totalWeight = available.reduce((s, c) => s + c.baseWeight, 0);
      postureScore = Math.round(available.reduce((s, c) => s + (c.score! * c.baseWeight) / totalWeight, 0));
    }

    const totalAvailableWeight = available.reduce((s, c) => s + c.baseWeight, 0);
    const effectiveWeight = (c: Component): number =>
      c.score != null && totalAvailableWeight > 0 ? Math.round((c.baseWeight / totalAvailableWeight) * 100) : 0;

    const riskLevel: 'low' | 'medium' | 'high' | 'critical' =
      postureScore > 80 ? 'low' : postureScore >= 60 ? 'medium' : postureScore >= 40 ? 'high' : 'critical';

    return {
      postureScore,
      breakdown: {
        frameworks: { score: frameworkScore, weight: effectiveWeight(components[0]) },
        defender: { score: defenderScore, weight: effectiveWeight(components[1]) },
        secureScore: { score: secureScorePercent, weight: effectiveWeight(components[2]) },
      },
      riskLevel,
    };
  });

  // ─── GET /activity ────────────────────────────────────────────────────
  const ActivityQuery = z.object({ days: z.coerce.number().default(7) });

  app.get('/activity', { preHandler: requireModule('compliance', 'viewer') }, async (req, reply) => {
    const tid = req.auth!.tid;
    const db = await getDB();
    if (!(db.ok && db.prisma)) return reply.status(503).send({ error: 'db_unavailable' });
    const { prisma } = db;
    const parseQ = ActivityQuery.safeParse(req.query);
    const { days } = parseQ.success ? parseQ.data : { days: 7 };
    const since = new Date(Date.now() - days * 86_400_000);
    const events = await prisma.auditEvent.findMany({
      where: { tenantId: tid, action: { startsWith: 'grc.' }, occurredAt: { gte: since } },
      orderBy: { occurredAt: 'desc' },
      take: 50,
    });
    return { events: events ?? [], total: (events ?? []).length };
  });

  // ─── GET /alerts ──────────────────────────────────────────────────────
  app.get('/alerts', { preHandler: requireModule('compliance', 'viewer') }, async (req, reply) => {
    const tid = req.auth!.tid;
    const db = await getDB();
    if (!(db.ok && db.prisma)) return reply.status(503).send({ error: 'db_unavailable' });
    const { prisma } = db;
    const now = new Date();

    const [fortiAlerts, overdueReviews, overdueTasks, secureScoreRecs] = await Promise.all([
      prisma.grcFortiGateAlert.findMany({ where: { tenantId: tid, status: 'open', severity: { in: ['critical', 'high'] } }, take: 10, orderBy: { eventTime: 'desc' } }),
      prisma.grcControlAssessment.findMany({ where: { tenantId: tid, nextReviewAt: { lt: now }, status: { not: 'not_applicable' } }, take: 10 }),
      prisma.grcDefenderTask.findMany({ where: { tenantId: tid, dueDate: { lt: now }, status: { notIn: ['completed', 'not_applicable'] } }, take: 10 }),
      prisma.grcSecureScoreRecommendation.findMany({ where: { tenantId: tid, priority: 'high', status: 'active' }, take: 5 }),
    ]);

    type AlertItem = { type: 'fortigate_alert' | 'overdue_review' | 'overdue_task' | 'secure_score_rec'; severity: string; title: string; ref?: string; };
    const items: AlertItem[] = [
      ...(fortiAlerts ?? []).map((a) => ({ type: 'fortigate_alert' as const, severity: (a as Record<string, unknown>).severity as string ?? 'high', title: (a as Record<string, unknown>).title as string ?? (a as Record<string, unknown>).alertType as string ?? 'FortiGate Alert', ref: (a as Record<string, unknown>).id as string | undefined })),
      ...(overdueReviews ?? []).map((r) => ({ type: 'overdue_review' as const, severity: 'medium', title: `Control review overdue: ${(r as Record<string, unknown>).controlKey as string ?? (r as Record<string, unknown>).id as string}`, ref: (r as Record<string, unknown>).id as string | undefined })),
      ...(overdueTasks ?? []).map((t) => ({ type: 'overdue_task' as const, severity: (t as Record<string, unknown>).priority as string === 'P1' ? 'high' : 'medium', title: (t as Record<string, unknown>).title as string ?? 'Defender task overdue', ref: (t as Record<string, unknown>).id as string | undefined })),
      ...(secureScoreRecs ?? []).map((rec) => ({ type: 'secure_score_rec' as const, severity: 'high', title: (rec as Record<string, unknown>).title as string ?? 'Secure Score recommendation', ref: (rec as Record<string, unknown>).id as string | undefined })),
    ];
    return { totalAlerts: items.length, items };
  });
};
