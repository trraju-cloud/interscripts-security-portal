-- GRC — live Microsoft Defender control posture (Graph Secure Score)
-- Migration: 20260811120000_create_grc_defender_control

-- CreateTable
CREATE TABLE "grc_defender_control" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "controlName" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "service" TEXT,
    "actionType" TEXT,
    "maxScore" DECIMAL(8,2) NOT NULL,
    "currentScore" DECIMAL(8,2) NOT NULL,
    "implementationStatus" TEXT NOT NULL,
    "remediation" TEXT,
    "threats" TEXT[] NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'defender',
    "lastSyncedAt" TIMESTAMPTZ NOT NULL,
    CONSTRAINT "grc_defender_control_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "grc_defender_control_tenantId_controlName_key" ON "grc_defender_control"("tenantId", "controlName");
CREATE INDEX "grc_defender_control_tenantId_category_idx" ON "grc_defender_control"("tenantId", "category");
