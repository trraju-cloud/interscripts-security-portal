-- GRC Compliance Platform — 13 tables
-- Migration: 20260810210000_create_grc_tables

-- CreateTable
CREATE TABLE "grc_framework" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "totalControls" INTEGER NOT NULL,
    "enabledAt" TIMESTAMPTZ NOT NULL,
    CONSTRAINT "grc_framework_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grc_control" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "frameworkKey" TEXT NOT NULL,
    "controlId" TEXT NOT NULL,
    "family" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "priority" TEXT NOT NULL,
    "baseline" TEXT NOT NULL,
    CONSTRAINT "grc_control_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grc_control_assessment" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "frameworkKey" TEXT NOT NULL,
    "controlId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "implementationNote" TEXT,
    "evidenceLinks" TEXT[] NOT NULL,
    "assessedBy" TEXT,
    "assessedAt" TIMESTAMPTZ,
    "nextReviewAt" DATE,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,
    CONSTRAINT "grc_control_assessment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grc_playbook" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "ref" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "framework" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,
    CONSTRAINT "grc_playbook_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grc_playbook_step" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "playbookId" UUID NOT NULL,
    "stepOrder" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "responsible" TEXT NOT NULL,
    "estimatedHours" DECIMAL(6,2),
    "evidence" TEXT,
    CONSTRAINT "grc_playbook_step_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grc_defender_task" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "taskRef" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "priority" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "assignedTo" TEXT,
    "dueDate" DATE,
    "completedAt" TIMESTAMPTZ,
    "notes" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,
    CONSTRAINT "grc_defender_task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grc_fortigate_config" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "host" TEXT NOT NULL,
    "port" INTEGER NOT NULL DEFAULT 443,
    "vdom" TEXT NOT NULL DEFAULT 'root',
    "apiKey" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "lastSyncAt" TIMESTAMPTZ,
    "lastSyncStatus" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,
    CONSTRAINT "grc_fortigate_config_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grc_fortigate_alert" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "alertId" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "srcIp" TEXT,
    "dstIp" TEXT,
    "policy" TEXT,
    "status" TEXT NOT NULL,
    "acknowledgedBy" TEXT,
    "resolvedAt" TIMESTAMPTZ,
    "eventTime" TIMESTAMPTZ NOT NULL,
    "syncedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "grc_fortigate_alert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grc_fortigate_device" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "hostname" TEXT NOT NULL,
    "ip" TEXT NOT NULL,
    "mac" TEXT,
    "deviceType" TEXT,
    "os" TEXT,
    "interface" TEXT,
    "status" TEXT NOT NULL,
    "lastSeen" TIMESTAMPTZ NOT NULL,
    "syncedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "grc_fortigate_device_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grc_vanta_config" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "apiKey" TEXT NOT NULL,
    "orgSlug" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "lastSyncAt" TIMESTAMPTZ,
    "lastSyncStatus" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,
    CONSTRAINT "grc_vanta_config_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grc_vanta_sync_event" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "status" TEXT NOT NULL,
    "controlsImported" INTEGER NOT NULL DEFAULT 0,
    "controlsFailed" INTEGER NOT NULL DEFAULT 0,
    "errorSummary" TEXT,
    "startedAt" TIMESTAMPTZ NOT NULL,
    "completedAt" TIMESTAMPTZ,
    CONSTRAINT "grc_vanta_sync_event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grc_secure_score_snapshot" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "score" DECIMAL(8,2) NOT NULL,
    "maxScore" DECIMAL(8,2) NOT NULL,
    "percentile" DECIMAL(5,2),
    "snapshotAt" TIMESTAMPTZ NOT NULL,
    CONSTRAINT "grc_secure_score_snapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grc_secure_score_recommendation" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "remediationId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "scoreImpact" DECIMAL(6,2) NOT NULL,
    "status" TEXT NOT NULL,
    "implementationStatus" TEXT NOT NULL,
    "priority" TEXT NOT NULL,
    "resourceType" TEXT,
    "syncedAt" TIMESTAMPTZ NOT NULL,
    CONSTRAINT "grc_secure_score_recommendation_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "grc_playbook_step" ADD CONSTRAINT "grc_playbook_step_playbookId_fkey"
    FOREIGN KEY ("playbookId") REFERENCES "grc_playbook"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateIndex: grc_framework
CREATE UNIQUE INDEX "grc_framework_tenantId_key_key" ON "grc_framework"("tenantId", "key");
CREATE INDEX "grc_framework_tenantId_idx" ON "grc_framework"("tenantId");

-- CreateIndex: grc_control
CREATE UNIQUE INDEX "grc_control_tenantId_frameworkKey_controlId_key" ON "grc_control"("tenantId", "frameworkKey", "controlId");
CREATE INDEX "grc_control_tenantId_frameworkKey_family_idx" ON "grc_control"("tenantId", "frameworkKey", "family");

-- CreateIndex: grc_control_assessment
CREATE UNIQUE INDEX "grc_control_assessment_tenantId_frameworkKey_controlId_key" ON "grc_control_assessment"("tenantId", "frameworkKey", "controlId");
CREATE INDEX "grc_control_assessment_tenantId_frameworkKey_status_idx" ON "grc_control_assessment"("tenantId", "frameworkKey", "status");

-- CreateIndex: grc_playbook
CREATE UNIQUE INDEX "grc_playbook_tenantId_ref_key" ON "grc_playbook"("tenantId", "ref");
CREATE INDEX "grc_playbook_tenantId_category_status_idx" ON "grc_playbook"("tenantId", "category", "status");

-- CreateIndex: grc_playbook_step
CREATE INDEX "grc_playbook_step_playbookId_stepOrder_idx" ON "grc_playbook_step"("playbookId", "stepOrder");

-- CreateIndex: grc_defender_task
CREATE UNIQUE INDEX "grc_defender_task_tenantId_taskRef_key" ON "grc_defender_task"("tenantId", "taskRef");
CREATE INDEX "grc_defender_task_tenantId_status_priority_idx" ON "grc_defender_task"("tenantId", "status", "priority");
CREATE INDEX "grc_defender_task_tenantId_category_idx" ON "grc_defender_task"("tenantId", "category");

-- CreateIndex: grc_fortigate_config
CREATE UNIQUE INDEX "grc_fortigate_config_tenantId_key" ON "grc_fortigate_config"("tenantId");

-- CreateIndex: grc_fortigate_alert
CREATE UNIQUE INDEX "grc_fortigate_alert_tenantId_alertId_key" ON "grc_fortigate_alert"("tenantId", "alertId");
CREATE INDEX "grc_fortigate_alert_tenantId_status_severity_idx" ON "grc_fortigate_alert"("tenantId", "status", "severity");
CREATE INDEX "grc_fortigate_alert_tenantId_eventTime_idx" ON "grc_fortigate_alert"("tenantId", "eventTime");

-- CreateIndex: grc_fortigate_device
CREATE UNIQUE INDEX "grc_fortigate_device_tenantId_ip_key" ON "grc_fortigate_device"("tenantId", "ip");
CREATE INDEX "grc_fortigate_device_tenantId_status_idx" ON "grc_fortigate_device"("tenantId", "status");

-- CreateIndex: grc_vanta_config
CREATE UNIQUE INDEX "grc_vanta_config_tenantId_key" ON "grc_vanta_config"("tenantId");

-- CreateIndex: grc_vanta_sync_event
CREATE INDEX "grc_vanta_sync_event_tenantId_startedAt_idx" ON "grc_vanta_sync_event"("tenantId", "startedAt");

-- CreateIndex: grc_secure_score_snapshot
CREATE INDEX "grc_secure_score_snapshot_tenantId_snapshotAt_idx" ON "grc_secure_score_snapshot"("tenantId", "snapshotAt");

-- CreateIndex: grc_secure_score_recommendation
CREATE UNIQUE INDEX "grc_secure_score_recommendation_tenantId_remediationId_key" ON "grc_secure_score_recommendation"("tenantId", "remediationId");
CREATE INDEX "grc_secure_score_recommendation_tenantId_status_priority_idx" ON "grc_secure_score_recommendation"("tenantId", "status", "priority");
