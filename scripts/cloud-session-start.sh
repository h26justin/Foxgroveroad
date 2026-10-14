#!/usr/bin/env bash
# SessionStart hook: prepares a Claude Code cloud container for this repo.
# Local sessions exit immediately — your own machine already has node_modules
# and whatever env you use.
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-$(dirname "$0")/..}"

# Install exactly what package-lock.json pins. Skip if a cached container
# already has a matching install.
if [ ! -d node_modules ] || [ package-lock.json -nt node_modules/.package-lock.json ]; then
  npm ci --no-audit --no-fund
fi

# Persist placeholder public env so `next build` / `next dev` can boot even
# when the cloud environment has no Supabase values set. Real values set in
# the environment's settings take precedence.
if [ -n "${CLAUDE_ENV_FILE:-}" ]; then
  {
    echo "export NEXT_PUBLIC_SUPABASE_URL=\"\${NEXT_PUBLIC_SUPABASE_URL:-https://placeholder.supabase.co}\""
    echo "export NEXT_PUBLIC_SUPABASE_ANON_KEY=\"\${NEXT_PUBLIC_SUPABASE_ANON_KEY:-placeholder-anon-key}\""
    echo "export NEXT_TELEMETRY_DISABLED=1"
  } >> "$CLAUDE_ENV_FILE"
fi

echo "Foxgroveroad cloud setup done (node $(node -v))."
