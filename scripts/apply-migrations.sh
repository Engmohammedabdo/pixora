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
DB_PASS="${DB_PASS:-2rkM9uecL5ZB2aC6ZZxk1Yj5iPan34GK}"

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
