#!/usr/bin/env bash
# ============================================================
# Zero GRC Platform – Migration Apply Script
# Run from your zero-local root directory:
#   cd ~/code/zero-local
#   bash zero-grc-transfer/APPLY.sh
# ============================================================
set -euo pipefail

ZERO_ROOT="$(pwd)"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export ZERO_ROOT SCRIPT_DIR

echo ""
echo "╔═══════════════════════════════════════════════════════╗"
echo "║  Zero GRC Platform – Migration Script                  ║"
echo "╚═══════════════════════════════════════════════════════╝"
echo ""

# ─── Validate environment ─────────────────────────────────────────────────
if [ ! -f "$ZERO_ROOT/packages/db/prisma/schema.prisma" ]; then
  echo "ERROR: Run this script from your zero-local root directory"
  echo "  (the directory that contains packages/, apps/, etc.)"
  exit 1
fi
echo "✔ zero-local root: $ZERO_ROOT"

# ─── Copy GRC route files (idempotent) ─────────────────────────────────────
echo ""
echo "=== Step 1: GRC API route files ==="
for f in grc-dashboard grc-frameworks grc-defender grc-fortigate grc-vanta grc-secure-score grc-playbooks; do
  SRC="$SCRIPT_DIR/apps/api/src/routes/${f}.ts"
  DST="$ZERO_ROOT/apps/api/src/routes/${f}.ts"
  if [ -f "$SRC" ]; then
    cp "$SRC" "$DST" && echo "  ✔ ${f}.ts"
  elif [ -f "$DST" ]; then
    echo "  ✔ ${f}.ts (already in repo)"
  else
    echo "  ⚠ ${f}.ts missing from both transfer dir and repo"
  fi
done

# ─── Copy GRC web pages (idempotent) ───────────────────────────────────────
echo ""
echo "=== Step 2: GRC web pages ==="
for page in grc-dashboard compliance defender-plan fortigate playbooks; do
  SRC="$SCRIPT_DIR/apps/web/src/app/(app)/it-security/${page}/page.tsx"
  DST_DIR="$ZERO_ROOT/apps/web/src/app/(app)/it-security/${page}"
  DST="$DST_DIR/page.tsx"
  if [ -f "$SRC" ]; then
    mkdir -p "$DST_DIR"
    cp "$SRC" "$DST" && echo "  ✔ it-security/${page}/page.tsx"
  elif [ -f "$DST" ]; then
    echo "  ✔ it-security/${page}/page.tsx (already in repo)"
  else
    echo "  ⚠ it-security/${page}/page.tsx missing"
  fi
done

# ─── Patch apps/api/src/server.ts (idempotent) ──────────────────────────────
echo ""
echo "=== Step 3: server.ts route registration ==="
if grep -q 'grcDashboardRoutes' "$ZERO_ROOT/apps/api/src/server.ts" 2>/dev/null; then
  echo "  ✔ GRC routes already registered in server.ts"
else
  python3 - "$ZERO_ROOT/apps/api/src/server.ts" <<'PYEOF'
import sys
path = sys.argv[1]
with open(path) as f:
    c = f.read()

IMPORT_ANCHOR = "import { itSecurityRoutes } from './routes/it-security.js';"
GRC_IMPORTS = """import { grcDashboardRoutes } from './routes/grc-dashboard.js';
import { grcFrameworksRoutes } from './routes/grc-frameworks.js';
import { grcDefenderRoutes } from './routes/grc-defender.js';
import { grcFortiGateRoutes } from './routes/grc-fortigate.js';
import { grcVantaRoutes } from './routes/grc-vanta.js';
import { grcSecureScoreRoutes } from './routes/grc-secure-score.js';
import { grcPlaybooksRoutes } from './routes/grc-playbooks.js';"""
if IMPORT_ANCHOR in c:
    c = c.replace(IMPORT_ANCHOR, IMPORT_ANCHOR + '\n' + GRC_IMPORTS)

GRC_REGISTERS = """  await scope.register(grcDashboardRoutes, { prefix: '/api/v1/grc-dashboard' });
  await scope.register(grcFrameworksRoutes, { prefix: '/api/v1/grc-frameworks' });
  await scope.register(grcDefenderRoutes, { prefix: '/api/v1/grc-defender' });
  await scope.register(grcFortiGateRoutes, { prefix: '/api/v1/grc-fortigate' });
  await scope.register(grcVantaRoutes, { prefix: '/api/v1/grc-vanta' });
  await scope.register(grcSecureScoreRoutes, { prefix: '/api/v1/grc-secure-score' });
  await scope.register(grcPlaybooksRoutes, { prefix: '/api/v1/grc-playbooks' });"""
for anchor in [
    "await scope.register(riskGrcRoutes, { prefix: '/api/v1/risk-grc' });",
    "await scope.register(itSecurityRoutes, { prefix: '/api/v1/it-security' });",
]:
    if anchor in c:
        c = c.replace(anchor, anchor + '\n' + GRC_REGISTERS)
        break

with open(path, 'w') as f:
    f.write(c)
print('  ✔ server.ts patched')
PYEOF
fi

# ─── Patch sidebar.tsx (idempotent) ───────────────────────────────────────
echo ""
echo "=== Step 4: sidebar.tsx GRC nav items ==="
SIDEBAR="$ZERO_ROOT/apps/web/src/components/shell/sidebar.tsx"
if grep -q 'grc-dashboard' "$SIDEBAR" 2>/dev/null; then
  echo "  ✔ GRC nav items already in sidebar.tsx"
else
  python3 - "$SIDEBAR" <<'PYEOF'
import sys
path = sys.argv[1]
with open(path) as f:
    lines = f.readlines()

anchor_idx = None
indent = '      '
for i, line in enumerate(lines):
    stripped = line.lstrip()
    if "href: '/it-security'" in stripped and 'IT & Security' in stripped and 'ShieldCheck' in stripped:
        anchor_idx = i
        indent = line[:len(line) - len(line.lstrip())]
        break

if anchor_idx is None:
    print('  ⚠ IT & Security anchor not found in sidebar.tsx — manual patch needed')
    sys.exit(0)

grc_items = [
    f"{indent}{{ href: '/it-security/grc-dashboard', label: 'GRC Dashboard', icon: GaugeCircle, module: 'compliance' }},\n",
    f"{indent}{{ href: '/it-security/compliance', label: 'Framework Compliance', icon: ShieldCheck, module: 'compliance' }},\n",
    f"{indent}{{ href: '/it-security/defender-plan', label: 'Defender 90-Day Plan', icon: Shield, module: 'itsec' }},\n",
    f"{indent}{{ href: '/it-security/playbooks', label: 'Security Playbooks', icon: BookOpen, module: 'compliance' }},\n",
    f"{indent}{{ href: '/it-security/fortigate', label: 'FortiGate', icon: Server, module: 'itsec' }},\n",
]
lines = lines[:anchor_idx+1] + grc_items + lines[anchor_idx+1:]
with open(path, 'w') as f:
    f.writelines(lines)
print('  ✔ sidebar.tsx patched')
PYEOF
fi

# ─── Append GRC Prisma models to schema.prisma (idempotent) ───────────────
echo ""
echo "=== Step 5: Prisma schema models ==="
SCHEMA="$ZERO_ROOT/packages/db/prisma/schema.prisma"
if grep -q 'model GrcFramework' "$SCHEMA"; then
  echo "  ✔ GRC models already in schema.prisma"
else
  echo "  Appending GRC models to schema.prisma..."
  cat >> "$SCHEMA" << 'SCHEMAEOF'

// ============================================================================
// GRC Compliance Platform
// ============================================================================

model GrcFramework {
  id            String   @id @default(uuid()) @db.Uuid
  tenantId      String   @db.Uuid
  key           String
  name          String
  version       String
  totalControls Int
  enabledAt     DateTime @db.Timestamptz

  @@unique([tenantId, key])
  @@index([tenantId])
  @@map("grc_framework")
}

model GrcControl {
  id           String @id @default(uuid()) @db.Uuid
  tenantId     String @db.Uuid
  frameworkKey String
  controlId    String
  family       String
  title        String
  description  String @db.Text
  priority     String
  baseline     String

  @@unique([tenantId, frameworkKey, controlId])
  @@index([tenantId, frameworkKey, family])
  @@map("grc_control")
}

model GrcControlAssessment {
  id                 String    @id @default(uuid()) @db.Uuid
  tenantId           String    @db.Uuid
  frameworkKey       String
  controlId          String
  status             String
  implementationNote String?   @db.Text
  evidenceLinks      String[]
  assessedBy         String?
  assessedAt         DateTime? @db.Timestamptz
  nextReviewAt       DateTime? @db.Date
  createdAt          DateTime  @default(now()) @db.Timestamptz
  updatedAt          DateTime  @updatedAt @db.Timestamptz

  @@unique([tenantId, frameworkKey, controlId])
  @@index([tenantId, frameworkKey, status])
  @@map("grc_control_assessment")
}

model GrcPlaybook {
  id          String   @id @default(uuid()) @db.Uuid
  tenantId    String   @db.Uuid
  ref         String
  category    String
  title       String
  description String   @db.Text
  framework   String
  status      String
  version     Int      @default(1)
  createdBy   String
  createdAt   DateTime @default(now()) @db.Timestamptz
  updatedAt   DateTime @updatedAt @db.Timestamptz
  steps       GrcPlaybookStep[]

  @@unique([tenantId, ref])
  @@index([tenantId, category, status])
  @@map("grc_playbook")
}

model GrcPlaybookStep {
  id             String      @id @default(uuid()) @db.Uuid
  playbookId     String      @db.Uuid
  stepOrder      Int
  title          String
  description    String      @db.Text
  responsible    String
  estimatedHours Decimal?    @db.Decimal(6, 2)
  evidence       String?
  playbook       GrcPlaybook @relation(fields: [playbookId], references: [id], onDelete: Cascade)

  @@index([playbookId, stepOrder])
  @@map("grc_playbook_step")
}

model GrcDefenderTask {
  id          String    @id @default(uuid()) @db.Uuid
  tenantId    String    @db.Uuid
  taskRef     String
  title       String
  description String    @db.Text
  category    String
  priority    String
  status      String
  assignedTo  String?
  dueDate     DateTime? @db.Date
  completedAt DateTime? @db.Timestamptz
  notes       String?   @db.Text
  createdAt   DateTime  @default(now()) @db.Timestamptz
  updatedAt   DateTime  @updatedAt @db.Timestamptz

  @@unique([tenantId, taskRef])
  @@index([tenantId, status, priority])
  @@index([tenantId, category])
  @@map("grc_defender_task")
}

model GrcFortiGateConfig {
  id             String    @id @default(uuid()) @db.Uuid
  tenantId       String    @unique @db.Uuid
  host           String
  port           Int       @default(443)
  vdom           String    @default("root")
  apiKey         String
  enabled        Boolean   @default(true)
  lastSyncAt     DateTime? @db.Timestamptz
  lastSyncStatus String?
  createdAt      DateTime  @default(now()) @db.Timestamptz
  updatedAt      DateTime  @updatedAt @db.Timestamptz

  @@map("grc_fortigate_config")
}

model GrcFortiGateAlert {
  id             String    @id @default(uuid()) @db.Uuid
  tenantId       String    @db.Uuid
  alertId        String
  severity       String
  type           String
  description    String    @db.Text
  srcIp          String?
  dstIp          String?
  policy         String?
  status         String
  acknowledgedBy String?
  resolvedAt     DateTime? @db.Timestamptz
  eventTime      DateTime  @db.Timestamptz
  syncedAt       DateTime  @default(now()) @db.Timestamptz

  @@unique([tenantId, alertId])
  @@index([tenantId, status, severity])
  @@index([tenantId, eventTime])
  @@map("grc_fortigate_alert")
}

model GrcFortiGateDevice {
  id         String   @id @default(uuid()) @db.Uuid
  tenantId   String   @db.Uuid
  hostname   String
  ip         String
  mac        String?
  deviceType String?
  os         String?
  interface  String?
  status     String
  lastSeen   DateTime @db.Timestamptz
  syncedAt   DateTime @default(now()) @db.Timestamptz

  @@unique([tenantId, ip])
  @@index([tenantId, status])
  @@map("grc_fortigate_device")
}

model GrcVantaConfig {
  id             String    @id @default(uuid()) @db.Uuid
  tenantId       String    @unique @db.Uuid
  apiKey         String
  orgSlug        String
  enabled        Boolean   @default(true)
  lastSyncAt     DateTime? @db.Timestamptz
  lastSyncStatus String?
  createdAt      DateTime  @default(now()) @db.Timestamptz
  updatedAt      DateTime  @updatedAt @db.Timestamptz

  @@map("grc_vanta_config")
}

model GrcVantaSyncEvent {
  id               String    @id @default(uuid()) @db.Uuid
  tenantId         String    @db.Uuid
  status           String
  controlsImported Int       @default(0)
  controlsFailed   Int       @default(0)
  errorSummary     String?
  startedAt        DateTime  @db.Timestamptz
  completedAt      DateTime? @db.Timestamptz

  @@index([tenantId, startedAt])
  @@map("grc_vanta_sync_event")
}

model GrcSecureScoreSnapshot {
  id         String   @id @default(uuid()) @db.Uuid
  tenantId   String   @db.Uuid
  score      Decimal  @db.Decimal(8, 2)
  maxScore   Decimal  @db.Decimal(8, 2)
  percentile Decimal? @db.Decimal(5, 2)
  snapshotAt DateTime @db.Timestamptz

  @@index([tenantId, snapshotAt])
  @@map("grc_secure_score_snapshot")
}

model GrcSecureScoreRecommendation {
  id                   String   @id @default(uuid()) @db.Uuid
  tenantId             String   @db.Uuid
  remediationId        String
  title                String
  category             String
  scoreImpact          Decimal  @db.Decimal(6, 2)
  status               String
  implementationStatus String
  priority             String
  resourceType         String?
  syncedAt             DateTime @db.Timestamptz

  @@unique([tenantId, remediationId])
  @@index([tenantId, status, priority])
  @@map("grc_secure_score_recommendation")
}
SCHEMAEOF
  echo "  ✔ GRC models appended to schema.prisma"
fi

# ─── Add GRC Prisma migration file (idempotent) ────────────────────────────
echo ""
echo "=== Step 6: Prisma migration file for GRC tables ==="
if grep -rl 'CREATE TABLE.*grc_framework' "$ZERO_ROOT/packages/db/prisma/migrations/" 2>/dev/null | head -1 | grep -q .; then
  echo "  ✔ GRC table migration already present"
else
  echo "  Adding GRC tables migration file..."
  GRC_MIGRATION_DIR="$ZERO_ROOT/packages/db/prisma/migrations/20260810210000_create_grc_tables"
  GRC_MIGRATION_SRC="$SCRIPT_DIR/packages/db/prisma/migrations/20260810210000_create_grc_tables/migration.sql"
  mkdir -p "$GRC_MIGRATION_DIR"
  if [ -f "$GRC_MIGRATION_SRC" ]; then
    cp "$GRC_MIGRATION_SRC" "$GRC_MIGRATION_DIR/migration.sql"
    echo "  ✔ Migration file copied — CI/CD will apply via 'prisma migrate deploy'"
  else
    echo "  ⚠ Migration source not found: $GRC_MIGRATION_SRC"
    echo "  ⚠ Run manually: cd packages/db && npx prisma migrate dev --name create_grc_tables"
  fi
fi

# ─── Commit and push ────────────────────────────────────────────────────────
echo ""
echo "=== Step 7: Commit and push ==="
cd "$ZERO_ROOT"

git add apps/api/src/routes/grc-*.ts 2>/dev/null || true
git add "apps/web/src/app/(app)/it-security/grc-dashboard/" 2>/dev/null || true
git add "apps/web/src/app/(app)/it-security/compliance/" 2>/dev/null || true
git add "apps/web/src/app/(app)/it-security/defender-plan/" 2>/dev/null || true
git add "apps/web/src/app/(app)/it-security/fortigate/" 2>/dev/null || true
git add "apps/web/src/app/(app)/it-security/playbooks/" 2>/dev/null || true
git add apps/web/src/components/shell/sidebar.tsx 2>/dev/null || true
git add apps/api/src/server.ts 2>/dev/null || true
git add packages/db/prisma/schema.prisma 2>/dev/null || true
git add packages/db/prisma/migrations/20260810210000_create_grc_tables/ 2>/dev/null || true

git status
echo ""

if git diff --cached --quiet; then
  echo "  ✔ Nothing new to commit — all changes already in ADO"
else
  git commit -m "feat(grc): add GRC compliance platform — FedRAMP 20x, CMMC L2, Defender, FortiGate, Vanta, Secure Score

13 Prisma models + migration SQL (20260810210000_create_grc_tables) create the
GRC table layer in PostgreSQL. 7 Fastify API routes serve all GRC data endpoints.
5 Next.js pages: GRC Dashboard, Compliance Frameworks, Defender Plan, FortiGate,
Playbooks. Sidebar gains 5 new nav items under IT & Security."
  git push
  echo "  ✔ Pushed to ADO — CI/CD will apply migration and deploy"
fi

echo ""
echo "╔═══════════════════════════════════════════════════════╗"
echo "║  GRC Migration complete!                                  ║"
echo "║  CI/CD will apply the migration to staging → prod.        ║"
echo "║                                                           ║"
echo "║  NEXT: Grant yourself compliance + itsec access           ║"
echo "║  Zero → Settings → Access → find your user               ║"
echo "║  Add: compliance:admin  itsec:admin                       ║"
echo "║                                                           ║"
echo "║  GRC pages on Zero:                                       ║"
echo "║    /it-security/grc-dashboard  (Posture Dashboard)       ║"
echo "║    /it-security/compliance     (FedRAMP 20x, CMMC L2)    ║"
echo "║    /it-security/defender-plan  (44-task Defender plan)   ║"
echo "║    /it-security/fortigate      (Firewall integration)    ║"
echo "║    /it-security/playbooks      (15-category playbooks)   ║"
echo "╚═══════════════════════════════════════════════════════╝"
