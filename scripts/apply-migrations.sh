#!/bin/bash
# Pixora — Apply all migrations to Supabase PostgreSQL
# Usage: ./scripts/apply-migrations.sh
#
# Prerequisites:
#   - psql installed (brew install postgresql or apt install postgresql-client)
#   - Database accessible from your machine
#
# Connection details (from Coolify Supabase setup):
#   Host: pixoradb.pyramedia.cloud
#   Port: 5432 (direct) or through Kong
#   User: postgres
#   DB: postgres

set -e

DB_HOST="${DB_HOST:-pixoradb.pyramedia.cloud}"
DB_PORT="${DB_PORT:-5432}"
DB_USER="${DB_USER:-postgres}"
DB_NAME="${DB_NAME:-postgres}"

# NEVER hardcode the password here — this file is tracked in git.
# Supply it at call time:  DB_PASS='...' ./scripts/apply-migrations.sh
if [ -z "${DB_PASS:-}" ]; then
  echo "ERROR: DB_PASS is not set." >&2
  echo "  Run:  DB_PASS='<postgres-password>' ./scripts/apply-migrations.sh" >&2
  echo "  See docs/ROTATE_SECRETS.md — the previously hardcoded password is compromised." >&2
  exit 1
fi

echo "=== Pixora Migration Runner ==="
echo "Host: $DB_HOST:$DB_PORT"
echo ""

MIGRATIONS_DIR="$(dirname "$0")/../supabase/migrations"

for migration in $(ls "$MIGRATIONS_DIR"/*.sql | sort); do
  filename=$(basename "$migration")
  echo "Applying: $filename..."
  PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -f "$migration" 2>&1
  echo "  Done: $filename"
  echo ""
done

echo "=== All migrations applied ==="
echo ""
echo "Verifying tables..."
PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;
"

echo ""
echo "Verifying RLS..."
PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "
SELECT tablename, rowsecurity FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;
"
