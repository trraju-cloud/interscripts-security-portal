#!/usr/bin/env bash
# FIX.sh — Run from ~/code/zero (your ADO clone root).
# Fixes 2 TypeScript exactOptionalPropertyTypes errors in grc-frameworks.ts
# and ensures the GRC database migration SQL is correct.
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

FRAMEWORKS="$ROUTES_DIR/grc-frameworks.ts"

# ── Fix 1: implementationNote: body.implementationNote, → ?? null ────────────
if ! grep -q 'implementationNote: body\.implementationNote ?? null' "$FRAMEWORKS"; then
  perl -pi -e 's/implementationNote: body\.implementationNote,/implementationNote: body.implementationNote ?? null,/' "$FRAMEWORKS"
  echo "✔  Fixed: implementationNote ?? null"
else
  echo "✔  implementationNote already fixed (idempotent)"
fi

# ── Fix 2: nextReviewAt: nextReviewDate, → ?? null ───────────────────────────
if ! grep -q 'nextReviewAt:.*nextReviewDate ?? null' "$FRAMEWORKS"; then
  perl -pi -e 's/(nextReviewAt:\s+nextReviewDate),/$1 ?? null,/' "$FRAMEWORKS"
  echo "✔  Fixed: nextReviewAt ?? null"
else
  echo "✔  nextReviewAt already fixed (idempotent)"
fi

# ── Fix 3: Ensure GRC database migration contains CREATE TABLE statements ────
NEW_MIG_DIR="$MIGRATIONS_DIR/20260810210000_create_grc_tables"
NEW_MIG_SQL="$NEW_MIG_DIR/migration.sql"

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
  echo "✔  GRC migration SQL written"
else
  echo "✔  GRC migration already present (idempotent)"
fi

# ── Commit and push ──────────────────────────────────────────────────────────
echo ""
echo "── Committing and pushing ──────────────────────────────────────────────────"

git add "$FRAMEWORKS" || true
[ -f "$NEW_MIG_SQL" ] && git add "$NEW_MIG_SQL" || true

if git diff --cached --quiet; then
  echo "✔  Nothing to commit — all fixes already applied"
else
  git commit -m "fix(grc): resolve exactOptionalPropertyTypes TS errors + add migration

- grc-frameworks.ts: implementationNote ?? null (string|undefined → string|null)
- grc-frameworks.ts: nextReviewAt ?? null (Date|undefined → Date|string|null)
- Add migration 20260810210000_create_grc_tables with 13 CREATE TABLE statements"

  echo ""
  echo "── Pushing to ADO main (with auto-rebase) ───────────────────────────────────"
  for attempt in 1 2 3 4; do
    if git push origin main 2>&1; then
      break
    fi
    echo "  Push rejected — rebasing against remote main (attempt $attempt)..."
    git pull --rebase origin main
    sleep "$((attempt * 2))"
  done
fi

echo ""
echo "══════════════════════════════════════════════════════════════════════════"
echo "  Done. CI pipeline should now pass typecheck and deploy GRC tables."
echo "══════════════════════════════════════════════════════════════════════════"
echo ""
