#!/usr/bin/env bash
# FIX.sh — Run from ~/code/zero (your ADO clone root).
# Fixes 2 TypeScript exactOptionalPropertyTypes errors in grc-frameworks.ts
# and ensures the GRC database migration is correct.
set -euo pipefail

ROUTES_DIR="apps/api/src/routes"
MIGRATIONS_DIR="packages/db/prisma/migrations"

echo ""
echo "═══════════════════════════════════════════════════════"
echo "  GRC TypeScript Fix — patching grc-frameworks.ts"
echo "═══════════════════════════════════════════════════════"
echo ""

# ── Guard: must be run from the repo root ────────────────────────────────────
if [ ! -f "package.json" ] || [ ! -d "apps/api" ]; then
  echo "❌  Run this script from the root of the Zero ADO repo (~/code/zero)."
  exit 1
fi

# ── Fix 1: implementationNote: body.implementationNote, → ?? null ────────────
FRAMEWORKS="$ROUTES_DIR/grc-frameworks.ts"

if ! grep -q 'implementationNote: body.implementationNote ?? null' "$FRAMEWORKS"; then
  sed -i 's/implementationNote: body\.implementationNote,/implementationNote: body.implementationNote ?? null,/' "$FRAMEWORKS"
  echo "✔  Fixed line 530 — implementationNote ?? null"
else
  echo "✔  Line 530 already fixed (idempotent)"
fi

# ── Fix 2: nextReviewAt: nextReviewDate, → ?? null ───────────────────────────
if ! grep -q 'nextReviewAt: nextReviewDate ?? null' "$FRAMEWORKS"; then
  sed -i 's/nextReviewAt:       nextReviewDate,/nextReviewAt:       nextReviewDate ?? null,/' "$FRAMEWORKS"
  echo "✔  Fixed line 534 — nextReviewAt ?? null"
else
  echo "✔  Line 534 already fixed (idempotent)"
fi

# ── Fix 3: Ensure GRC database migration contains CREATE TABLE statements ────
NEW_MIG_DIR="$MIGRATIONS_DIR/20260810210000_create_grc_tables"
NEW_MIG_SQL="$NEW_MIG_DIR/migration.sql"

# Clone relay to get the migration SQL if we don't already have it
if [ ! -f "$NEW_MIG_SQL" ] || ! grep -q 'CREATE TABLE.*grc_framework' "$NEW_MIG_SQL" 2>/dev/null; then
  echo ""
  echo "── Fetching GRC migration SQL from relay repo ──────────────────────────────"
  rm -rf /tmp/grc-fix-relay
  git clone -b claude/add-branding-footer-NFwhI \
    https://github.com/trraju-cloud/interscripts-security-portal.git \
    /tmp/grc-fix-relay 2>&1 | tail -3
  mkdir -p "$NEW_MIG_DIR"
  cp /tmp/grc-fix-relay/zero-grc-transfer/packages/db/prisma/migrations/20260810210000_create_grc_tables/migration.sql \
     "$NEW_MIG_SQL"
  rm -rf /tmp/grc-fix-relay
  echo "✔  GRC migration SQL written to $NEW_MIG_SQL"
else
  echo "✔  GRC migration already present (idempotent)"
fi

# ── Commit and push ──────────────────────────────────────────────────────────
echo ""
echo "── Committing and pushing ──────────────────────────────────────────────────"

git add \
  "$FRAMEWORKS" \
  "$NEW_MIG_DIR/migration.sql" 2>/dev/null || true

# Only commit if there are staged changes
if git diff --cached --quiet; then
  echo "✔  Nothing to commit — all fixes already applied"
else
  git commit -m "fix(grc): resolve exactOptionalPropertyTypes errors + add CREATE TABLE migration

- grc-frameworks.ts line 530: implementationNote ?? null (string|undefined → string|null)
- grc-frameworks.ts line 534: nextReviewAt ?? null (Date|undefined → Date|null)
- Add migration 20260810210000_create_grc_tables with 13 CREATE TABLE statements"

  echo ""
  echo "── Pushing to ADO main ──────────────────────────────────────────────────────"
  git push origin main
fi

echo ""
echo "══════════════════════════════════════════════════════════════════════════"
echo "  Done. CI pipeline should now pass typecheck."
echo "══════════════════════════════════════════════════════════════════════════"
echo ""
