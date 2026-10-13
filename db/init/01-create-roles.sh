#!/bin/sh
set -eu
: "${TASK_DB_PASSWORD:?TASK_DB_PASSWORD is required}"
: "${EXPORTER_DB_PASSWORD:?EXPORTER_DB_PASSWORD is required}"

psql --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" --set ON_ERROR_STOP=1 \
  --set task_password="$TASK_DB_PASSWORD" \
  --set exporter_password="$EXPORTER_DB_PASSWORD" <<'SQL'
CREATE ROLE task_app LOGIN PASSWORD :'task_password';
GRANT CONNECT ON DATABASE task_tracker TO task_app;
GRANT USAGE, CREATE ON SCHEMA public TO task_app;

CREATE ROLE metrics_exporter LOGIN PASSWORD :'exporter_password';
GRANT CONNECT ON DATABASE task_tracker TO metrics_exporter;
GRANT pg_monitor TO metrics_exporter;
SQL
