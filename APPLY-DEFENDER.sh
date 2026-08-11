#!/usr/bin/env bash
# APPLY-DEFENDER.sh — Run from ~/code/zero (your ADO clone root).
#
# Ships the LIVE Microsoft Defender integration for the Defender 90-Day page:
#   • grc_defender_control table (Prisma model + migration)
#   • grc-defender.ts: POST /defender-sync + GET /defender-controls (Graph Secure Score)
#   • defender-plan/page.tsx: "Live Microsoft Defender Controls" panel
#
# Idempotent. Pulls file bodies from the relay repo. Verified against strict-mode
# typecheck (exactOptionalPropertyTypes / noUncheckedIndexedAccess) before shipping.
set -euo pipefail

RELAY_BRANCH="claude/add-branding-footer-NFwhI"
RELAY_URL="https://github.com/trraju-cloud/interscripts-security-portal.git"
RELAY_DIR="/tmp/grc-defender-relay"

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "  GRC — Live Microsoft Defender integration"
echo "═══════════════════════════════════════════════════════════════"
echo ""

if [ ! -f "package.json" ] || [ ! -d "apps/api" ]; then
  echo "❌  Run this from the root of the Zero ADO repo (~/code/zero)."
  exit 1
fi

# ── Fetch relay ──────────────────────────────────────────────────────────────
rm -rf "$RELAY_DIR"
git clone -b "$RELAY_BRANCH" "$RELAY_URL" "$RELAY_DIR" 2>&1 | tail -2
T="$RELAY_DIR/zero-grc-transfer"

# ── 1. Prisma model — idempotent append ──────────────────────────────────────
SCHEMA="packages/db/prisma/schema.prisma"
if grep -q "model GrcDefenderControl" "$SCHEMA"; then
  echo "✔  Prisma model GrcDefenderControl already present (idempotent)"
else
  printf '\n' >> "$SCHEMA"
  cat "$T/packages/db/prisma/grc-defender-control.model.prisma" >> "$SCHEMA"
  echo "✔  Appended model GrcDefenderControl to schema.prisma"
fi

# ── 2. Migration ─────────────────────────────────────────────────────────────
MIG_DIR="packages/db/prisma/migrations/20260811120000_create_grc_defender_control"
mkdir -p "$MIG_DIR"
cp "$T/packages/db/prisma/migrations/20260811120000_create_grc_defender_control/migration.sql" "$MIG_DIR/migration.sql"
echo "✔  Migration 20260811120000_create_grc_defender_control in place"

# ── 3. API routes (full files, based on latest main) ─────────────────────────
cp "$T/apps/api/src/routes/grc-defender.ts" "apps/api/src/routes/grc-defender.ts"
echo "✔  grc-defender.ts updated (defender-sync + defender-controls via shared graph-client)"
cp "$T/apps/api/src/routes/grc-secure-score.ts" "apps/api/src/routes/grc-secure-score.ts"
echo "✔  grc-secure-score.ts rewired onto shared graph-client (ZERO_GRAPH_* creds)"

# ── 4. UI page (full file, based on latest main) ─────────────────────────────
cp "$T/apps/web/src/app/(app)/it-security/defender-plan/page.tsx" \
   "apps/web/src/app/(app)/it-security/defender-plan/page.tsx"
echo "✔  defender-plan/page.tsx updated (Live Defender Controls panel)"

rm -rf "$RELAY_DIR"

# ── 5. Verify Prisma schema validates ────────────────────────────────────────
# `prisma validate` only checks schema syntax, but still requires the datasource's
# env("DATABASE_URL") to resolve. Supply a dummy when it's not set in this shell
# (no DB connection is made for validation) so the check works locally too.
echo ""
echo "── Validating Prisma schema ─────────────────────────────────────────────────"
if DATABASE_URL="${DATABASE_URL:-postgresql://validate:validate@localhost:5432/validate}" \
     pnpm --filter @zero/db exec prisma validate 2>&1 | tail -3; then
  echo "✔  Prisma schema is valid"
else
  echo "❌  Prisma schema failed to validate — aborting before commit."
  echo "    (If this printed only an env/connection error, your schema is fine —"
  echo "     re-run with your real DATABASE_URL exported, or check the message above.)"
  exit 1
fi

# ── 6. Commit and push (auto-rebase) ─────────────────────────────────────────
echo ""
echo "── Committing and pushing ───────────────────────────────────────────────────"
git add "$SCHEMA" "$MIG_DIR/migration.sql" \
        "apps/api/src/routes/grc-defender.ts" \
        "apps/api/src/routes/grc-secure-score.ts" \
        "apps/web/src/app/(app)/it-security/defender-plan/page.tsx"

if git diff --cached --quiet; then
  echo "✔  Nothing to commit — already applied."
else
  git commit -m "feat(grc): live Microsoft Defender + Secure Score via shared graph-client

- New grc_defender_control table (model + migration 20260811120000)
- grc-defender.ts: POST /defender-sync pulls Graph Secure Score control
  posture (secureScores.controlScores + secureScoreControlProfiles),
  GET /defender-controls returns controls with per-category rollups.
- grc-secure-score.ts: /sync rewired off hand-rolled AZURE_* token onto
  the shared lib/graph-client.ts (ZERO_GRAPH_* creds, app 468b4011) that
  the existing Intune/Defender/Entra syncs already use in production.
- Both degrade to simulated data until SecurityEvents.Read.All consent lands.
- defender-plan/page.tsx: Live Microsoft Defender Controls panel with
  Secure Score meter, Sync button, and per-control status table."

  for attempt in 1 2 3 4; do
    if git push origin main 2>&1; then break; fi
    echo "  Push rejected — rebasing (attempt $attempt)..."
    git pull --rebase origin main
    sleep "$((attempt * 2))"
  done
fi

echo ""
echo "══════════════════════════════════════════════════════════════════════════"
echo "  Done. After the pipeline deploys:"
echo "   1. Azure Portal → App registrations → open the GRAPH app"
echo "      client 468b4011-28e9-4ad5-ba9c-021fffddd9fe  (NOT the 2ce1c7a8 SSO app)"
echo "      → API permissions → Microsoft Graph → Application permissions"
echo "      → add SecurityEvents.Read.All → Grant admin consent (dot turns green)."
echo "      (This is the same app that already powers Devices/Incidents sync.)"
echo "   2. Defender 90-Day Plan → 'Sync from Defender'; Secure Score page → Sync."
echo "  Until consent lands both show simulated data (badge says Simulated)."
echo "══════════════════════════════════════════════════════════════════════════"
echo ""
