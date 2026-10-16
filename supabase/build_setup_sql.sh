#!/usr/bin/env bash
# Concatenates all migrations into supabase/setup.sql for pasting into the Supabase SQL Editor
# on a NEW, empty project. For later changes, apply only the new migration files.
set -euo pipefail
cd "$(dirname "$0")"
{
  echo "-- Adaptive Athlete database setup. Generated from supabase/migrations by build_setup_sql.sh."
  echo "-- Run once on a new, empty Supabase project (SQL Editor → New query → paste → Run)."
  echo "begin;"
  for f in migrations/*.sql; do echo; echo "-- ===== $f ====="; cat "$f"; done
  echo; echo "commit;"
} > setup.sql
echo "Wrote supabase/setup.sql ($(wc -l < setup.sql) lines)"
