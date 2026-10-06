#!/usr/bin/env bash
# Proves a backup can actually be restored: dumps the database at $SOURCE_DATABASE_URL (or restores an existing
# dump given as $1), restores it into a throwaway database on the same server, and checks that the schema and key
# tables arrived intact. Never touches the source data. See docs/09-operations.md, "Backups".
#
#   SOURCE_DATABASE_URL=postgresql://user:pass@host:5432/bambino scripts/test-restore.sh [dump-file]
#
# Needs pg_dump, pg_restore and psql (version 18) on PATH.
set -euo pipefail

: "${SOURCE_DATABASE_URL:?Set SOURCE_DATABASE_URL to the database to back up (or whose server hosts the test)}"
SCRATCH="bambino_restore_test_$(date +%s)"
SERVER_URL="${SOURCE_DATABASE_URL%/*}"
DUMP="${1:-}"
GIVEN_DUMP="${1:-}"
CLEANUP_DUMP=""

if [[ -z "$DUMP" ]]; then
  DUMP="$(mktemp "${TMPDIR:-/tmp}/bambino-backup.XXXXXX")"
  CLEANUP_DUMP="$DUMP"
  echo "Dumping source database (custom format)..."
  pg_dump --format=custom --no-owner --file="$DUMP" "$SOURCE_DATABASE_URL"
fi

cleanup() {
  psql "$SERVER_URL/postgres" -q -c "DROP DATABASE IF EXISTS \"$SCRATCH\"" || true
  [[ -n "$CLEANUP_DUMP" ]] && rm -f "$CLEANUP_DUMP"
}
trap cleanup EXIT

echo "Restoring into scratch database $SCRATCH..."
psql "$SERVER_URL/postgres" -q -c "CREATE DATABASE \"$SCRATCH\""
pg_restore --no-owner --exit-on-error --dbname="$SERVER_URL/$SCRATCH" "$DUMP"

echo "Checking the restored database..."
check() { psql "$SERVER_URL/$SCRATCH" -tA -c "$1"; }
tables=$(check "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public'")
migrations=$(check "SELECT count(*) FROM drizzle.__drizzle_migrations" 2>/dev/null || echo 0)
triggers=$(check "SELECT count(*) FROM pg_trigger WHERE tgname LIKE '%append_only' OR tgname LIKE '%no_delete'")
source_users=$(psql "$SOURCE_DATABASE_URL" -tA -c "SELECT count(*) FROM users")
restored_users=$(check "SELECT count(*) FROM users")

echo "tables=$tables migrations=$migrations integrity_triggers=$triggers users(source/restored)=$source_users/$restored_users"
source_tables=$(psql "$SOURCE_DATABASE_URL" -tA -c "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public'")
[[ "$tables" -ge 50 && ( -n "$GIVEN_DUMP" || "$tables" == "$source_tables" ) ]] || { echo "FAIL: expected $source_tables tables, got $tables"; exit 1; }
[[ "$migrations" -ge 1 ]] || { echo "FAIL: migration history missing"; exit 1; }
[[ "$triggers" -ge 1 ]] || { echo "FAIL: integrity triggers missing"; exit 1; }
if [[ -z "$GIVEN_DUMP" && "$source_users" != "$restored_users" ]]; then
  echo "FAIL: user count differs"; exit 1
fi
echo "Restore test passed."
