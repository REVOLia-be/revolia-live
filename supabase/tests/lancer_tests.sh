#!/usr/bin/env bash
# Teste les migrations sur une base Postgres locale jetable.
# Usage : bash supabase/tests/lancer_tests.sh   (Postgres 16 local requis)
set -euo pipefail
cd "$(dirname "$0")"
BASE=revolia_live_test
dropdb --if-exists "$BASE" && createdb "$BASE"
psql -q -v ON_ERROR_STOP=1 -d "$BASE" -f 00_simulation_supabase.sql
for f in ../migrations/*.sql; do
  # pg_cron n'existe pas en local : on saute la planification
  sed -e '/pg_cron/d' -e '/cron.schedule/d' "$f" | psql -q -v ON_ERROR_STOP=1 -d "$BASE"
done
psql -v ON_ERROR_STOP=1 -d "$BASE" -f 10_scenario.sql
psql -v ON_ERROR_STOP=1 -d "$BASE" -f 20_vue_participant.sql
psql -v ON_ERROR_STOP=1 -d "$BASE" -f 30_admin.sql
psql -v ON_ERROR_STOP=1 -d "$BASE" -f 40_photos.sql
psql -v ON_ERROR_STOP=1 -d "$BASE" -f 50_ateliers.sql
psql -v ON_ERROR_STOP=1 -d "$BASE" -f 60_code_permanent_reponses_multiples.sql
echo "✅ Tous les tests SQL sont passés."
