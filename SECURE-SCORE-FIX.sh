#!/usr/bin/env bash
# SECURE-SCORE-FIX.sh — Run from ~/code/zero (your ADO clone root).
#
# Makes GRC Secure Score reuse the EXISTING zero-api Graph app registration
# instead of requiring 3 brand-new env vars / a new app reg / a new KV secret.
#
# The API already has these injected in production:
#   AUTH_MICROSOFT_ENTRA_ID_TENANT_ID  → tenant  850cfd86-...
#   AUTH_MICROSOFT_ENTRA_ID_ID         → client  2ce1c7a8-...  (zero-api)
#   ZERO_GRAPH_CLIENT_SECRET           → that app's secret (from Key Vault)
#
# This patch makes getMsGraphToken() fall back to those when the dedicated
# AZURE_* vars are not set. AZURE_* still win if you ever set them.
set -euo pipefail

F="apps/api/src/routes/grc-secure-score.ts"

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "  GRC Secure Score — reuse existing zero-api Graph app reg"
echo "═══════════════════════════════════════════════════════════"
echo ""

if [ ! -f "package.json" ] || [ ! -d "apps/api" ]; then
  echo "❌  Run this from the root of the Zero ADO repo (~/code/zero)."
  exit 1
fi
if [ ! -f "$F" ]; then
  echo "❌  $F not found — is GRC deployed on this branch?"
  exit 1
fi

if grep -q 'AUTH_MICROSOFT_ENTRA_ID_TENANT_ID' "$F"; then
  echo "✔  Fallback already present (idempotent) — nothing to change."
else
  perl -pi -e "s/process\.env\['AZURE_TENANT_ID'\];/process.env['AZURE_TENANT_ID'] ?? process.env['AUTH_MICROSOFT_ENTRA_ID_TENANT_ID'];/" "$F"
  perl -pi -e "s/process\.env\['AZURE_CLIENT_ID'\];/process.env['AZURE_CLIENT_ID'] ?? process.env['AUTH_MICROSOFT_ENTRA_ID_ID'];/" "$F"
  perl -pi -e "s/process\.env\['AZURE_CLIENT_SECRET'\];/process.env['AZURE_CLIENT_SECRET'] ?? process.env['ZERO_GRAPH_CLIENT_SECRET'];/" "$F"
  echo "✔  Patched getMsGraphToken() with production Graph fallback:"
  echo "     tenant  ← AUTH_MICROSOFT_ENTRA_ID_TENANT_ID"
  echo "     client  ← AUTH_MICROSOFT_ENTRA_ID_ID"
  echo "     secret  ← ZERO_GRAPH_CLIENT_SECRET"
fi

echo ""
echo "── Verifying the 3 lines ────────────────────────────────────────────────────"
grep -n "process.env\['AZURE_TENANT_ID'\]\|process.env\['AZURE_CLIENT_ID'\]\|process.env\['AZURE_CLIENT_SECRET'\]" "$F" || true

echo ""
echo "── Committing and pushing ───────────────────────────────────────────────────"
git add "$F"
if git diff --cached --quiet; then
  echo "✔  Nothing to commit."
else
  git commit -m "feat(grc): Secure Score reuses existing zero-api Graph app reg

getMsGraphToken() falls back to AUTH_MICROSOFT_ENTRA_ID_TENANT_ID /
AUTH_MICROSOFT_ENTRA_ID_ID / ZERO_GRAPH_CLIENT_SECRET (already injected
in prod) when dedicated AZURE_* vars are unset. No new app reg, KV
secret, or bicep change needed — only SecurityEvents.Read.All consent
on the zero-api app reg."

  for attempt in 1 2 3 4; do
    if git push origin main 2>&1; then break; fi
    echo "  Push rejected — rebasing (attempt $attempt)..."
    git pull --rebase origin main
    sleep "$((attempt * 2))"
  done
fi

echo ""
echo "══════════════════════════════════════════════════════════════════════════"
echo "  Done. Remaining manual step (Azure Portal, one time):"
echo "  App registrations → zero-api (2ce1c7a8-6881-4075-8cef-c66d66d02e83)"
echo "    → API permissions → Add → Microsoft Graph → Application permissions"
echo "    → SecurityEvents.Read.All → Add → Grant admin consent (dot goes green)"
echo "  Then POST /api/v1/grc-secure-score/sync to pull real data."
echo "══════════════════════════════════════════════════════════════════════════"
echo ""
