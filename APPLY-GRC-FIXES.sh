#!/usr/bin/env bash
# APPLY-GRC-FIXES.sh — Run from ~/code/zero (your ADO clone root).
#
# Makes every GRC module show numbers out-of-the-box and unifies access:
#   • Unify all GRC pages + routes onto the `itsec` module (no more compliance/itsec split)
#   • Auto-seed sample data on first load: Frameworks (FedRAMP 20x + CMMC L2),
#     Secure Score snapshot + recs, Playbooks starter library, FortiGate sample feed
#   • Fix dashboard bugs: /alerts field names, /activity mapping, Vanta control matching,
#     playbook step-count on create
# No schema/migration change — pure code. Verified against strict-mode typecheck.
set -euo pipefail

RELAY_BRANCH="claude/add-branding-footer-NFwhI"
RELAY_URL="https://github.com/trraju-cloud/interscripts-security-portal.git"
RELAY_DIR="/tmp/grc-fixes-relay"

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "  GRC — make every module show numbers + unify access to itsec"
echo "═══════════════════════════════════════════════════════════════"
echo ""

if [ ! -f "package.json" ] || [ ! -d "apps/api" ]; then
  echo "❌  Run this from the root of the Zero ADO repo (~/code/zero)."
  exit 1
fi

rm -rf "$RELAY_DIR"
git clone -b "$RELAY_BRANCH" "$RELAY_URL" "$RELAY_DIR" 2>&1 | tail -2
T="$RELAY_DIR/zero-grc-transfer"

# ── Copy the 6 API route files ───────────────────────────────────────────────
for f in grc-dashboard grc-defender grc-fortigate grc-frameworks grc-playbooks grc-vanta; do
  cp "$T/apps/api/src/routes/$f.ts" "apps/api/src/routes/$f.ts"
done
echo "✔  6 GRC API routes updated (itsec gate + auto-seed + bug fixes)"

# ── Copy the 3 web pages ─────────────────────────────────────────────────────
for p in grc-dashboard compliance playbooks; do
  cp "$T/apps/web/src/app/(app)/it-security/$p/page.tsx" "apps/web/src/app/(app)/it-security/$p/page.tsx"
done
echo "✔  3 GRC pages updated (ModuleGate → itsec)"

# ── Copy the sidebar ─────────────────────────────────────────────────────────
cp "$T/apps/web/src/components/shell/sidebar.tsx" "apps/web/src/components/shell/sidebar.tsx"
echo "✔  Sidebar updated (3 GRC rows → itsec; ESG/DSR left on compliance)"

rm -rf "$RELAY_DIR"

# ── Commit + push (auto-rebase) ──────────────────────────────────────────────
echo ""
echo "── Committing and pushing ───────────────────────────────────────────────────"
git add \
  apps/api/src/routes/grc-dashboard.ts apps/api/src/routes/grc-defender.ts \
  apps/api/src/routes/grc-fortigate.ts apps/api/src/routes/grc-frameworks.ts \
  apps/api/src/routes/grc-playbooks.ts apps/api/src/routes/grc-vanta.ts \
  "apps/web/src/app/(app)/it-security/grc-dashboard/page.tsx" \
  "apps/web/src/app/(app)/it-security/compliance/page.tsx" \
  "apps/web/src/app/(app)/it-security/playbooks/page.tsx" \
  apps/web/src/components/shell/sidebar.tsx

if git diff --cached --quiet; then
  echo "✔  Nothing to commit — already applied."
else
  git commit -m "feat(grc): populate all modules out-of-the-box + unify access to itsec

- Unify GRC pages/routes/sidebar onto the itsec module (drop compliance/itsec split)
- Auto-seed sample data on first load (superseded by real sync/assessment):
  Frameworks (FedRAMP 20x + CMMC L2 w/ realistic spread), Secure Score snapshot +
  recommendations, Playbooks starter library, FortiGate sample alerts/devices
- Dashboard bootstraps the 3 posture components; fix /alerts field names
  (type/description/controlId), /activity field mapping (createdAt/actorEmail)
- Fix Vanta control matching (title/description, not NIST controlId) and
  playbook step-count on create"

  for attempt in 1 2 3 4; do
    if git push origin main 2>&1; then break; fi
    echo "  Push rejected — rebasing (attempt $attempt)..."
    git pull --rebase origin main
    sleep "$((attempt * 2))"
  done
fi

echo ""
echo "══════════════════════════════════════════════════════════════════════════"
echo "  Done. After the pipeline deploys, hard-refresh (Cmd+Shift+R) and open:"
echo "   • GRC Dashboard      → posture score, framework %, Secure Score, alerts"
echo "   • Framework Compliance → FedRAMP 20x + CMMC L2 pre-enabled with progress"
echo "   • Security Playbooks → starter playbook per category"
echo "   • FortiGate          → sample alerts + devices (replace with a real appliance)"
echo "  All seeded values are SAMPLE data — real Graph/appliance syncs overwrite them."
echo "══════════════════════════════════════════════════════════════════════════"
echo ""
