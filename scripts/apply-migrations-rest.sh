#!/bin/bash
# Pixora — Apply migrations via Supabase REST API (Kong)
# Use this if direct psql connection doesn't work (Coolify Docker network)
#
# Usage: ./scripts/apply-migrations-rest.sh
#
# This first creates an exec_sql RPC function, then uses it to run migrations.

set -e

SUPABASE_URL="${SUPABASE_URL:-https://pixoradb.pyramedia.cloud}"

# NEVER hardcode the key here — this file is tracked in git.
# Read it from .env.local (gitignored), or pass SERVICE_KEY at call time.
if [ -z "${SERVICE_KEY:-}" ] && [ -f .env.local ]; then
  SERVICE_KEY=$(grep -m1 '^SUPABASE_SERVICE_ROLE_KEY=' .env.local | cut -d= -f2- | tr -d '"'"'"'\r')
fi
if [ -z "${SERVICE_KEY:-}" ]; then
  echo "ERROR: SERVICE_KEY not set and SUPABASE_SERVICE_ROLE_KEY is empty in .env.local." >&2
  echo "  See docs/ROTATE_SECRETS.md — the previously hardcoded key is compromised." >&2
  exit 1
fi

echo "=== Pixora Migration Runner (REST API) ==="
echo "URL: $SUPABASE_URL"
echo ""

# Helper function to run SQL via REST API
run_sql() {
  local sql="$1"
  local description="$2"
  echo "Running: $description..."

  response=$(curl -s -w "\n%{http_code}" -X POST "${SUPABASE_URL}/rest/v1/rpc/exec_sql" \
    -H "apikey: ${SERVICE_KEY}" \
    -H "Authorization: Bearer ${SERVICE_KEY}" \
    -H "Content-Type: application/json" \
    -d "{\"query\": $(echo "$sql" | jq -Rs .)}" 2>&1)

  http_code=$(echo "$response" | tail -1)
  body=$(echo "$response" | head -n -1)

  if [ "$http_code" = "200" ] || [ "$http_code" = "204" ]; then
    echo "  OK"
  else
    echo "  Response ($http_code): $body"
  fi
}

# Step 1: Create the exec_sql function first
echo "Step 1: Creating exec_sql function..."
curl -s -X POST "${SUPABASE_URL}/rest/v1/rpc/query" \
  -H "apikey: ${SERVICE_KEY}" \
  -H "Authorization: Bearer ${SERVICE_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"query": "SELECT 1"}' > /dev/null 2>&1

# If exec_sql doesn't exist, we need to create it via the SQL editor in Supabase Studio
# or via direct psql. Try anyway:
echo ""
echo "If this fails, create the exec_sql function manually in Supabase SQL Editor:"
echo ""
echo "  CREATE OR REPLACE FUNCTION exec_sql(query text)"
echo "  RETURNS void AS \$\$ BEGIN EXECUTE query; END; \$\$ LANGUAGE plpgsql SECURITY DEFINER;"
echo ""

# Step 2: Apply each migration
MIGRATIONS_DIR="$(dirname "$0")/../supabase/migrations"

for migration in $(ls "$MIGRATIONS_DIR"/*.sql | sort); do
  filename=$(basename "$migration")
  sql=$(cat "$migration")
  run_sql "$sql" "$filename"
  echo ""
done

echo "=== Done ==="
echo ""
echo "Verify tables exist by visiting:"
echo "  ${SUPABASE_URL}/rest/v1/profiles?select=id&limit=0"
echo "  (with Authorization: Bearer <service_key> header)"
