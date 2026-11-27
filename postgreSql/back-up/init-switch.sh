#!/usr/bin/env bash
set -e

DB_NAME="switch"
DUMP_FILE="/var/lib/postgresql/backups/switch_transaccional.dump"

DB_EXISTS=$(psql -U "$POSTGRES_USER" -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='${DB_NAME}'")

if [ "$DB_EXISTS" != "1" ]; then
  echo "Creando base de datos ${DB_NAME}..."
  psql -U "$POSTGRES_USER" -d postgres -c "CREATE DATABASE \"${DB_NAME}\";"
fi

if [ -f "$DUMP_FILE" ]; then
  echo "Restaurando ${DUMP_FILE} en ${DB_NAME}..."
  pg_restore -U "$POSTGRES_USER" -d "${DB_NAME}" --no-owner --no-privileges "$DUMP_FILE"
else
  echo "AVISO: No se encontro ${DUMP_FILE}; se omite restauracion."
fi