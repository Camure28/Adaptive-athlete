#!/usr/bin/env bash
# Builds a throwaway local database, applies the migrations, and runs the security tests.
# Requires a local PostgreSQL 15+ you can reach as a superuser (default: sudo -u postgres).
set -euo pipefail
cd "$(dirname "$0")/../.."

DB="${TEST_DB:-adaptive_athlete_test}"
PSQL=(${PSQL_CMD:-sudo -n -u postgres psql} -X -q -v ON_ERROR_STOP=1)

# Each test file gets a fresh database with every migration applied.
for t in supabase/tests/*_test.sql; do
  "${PSQL[@]}" -d postgres -c "drop database if exists ${DB};" -c "create database ${DB};"
  "${PSQL[@]}" -d "${DB}" -f supabase/tests/auth_stub.sql
  for f in supabase/migrations/*.sql; do
    "${PSQL[@]}" -d "${DB}" -f "$f"
  done
  "${PSQL[@]}" -t -d "${DB}" -f "$t" 2>&1 | sed -e "s/^psql:[^:]*:[0-9]*: NOTICE:  //" -e "/^ *$/d"
  "${PSQL[@]}" -d postgres -c "drop database ${DB};"
done
