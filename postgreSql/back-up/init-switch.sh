#!/bin/bash
set -e

echo "=== Creando base de datos 'switch' ==="

# Crear la base de datos 'switch'
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    CREATE DATABASE switch;
EOSQL

echo "=== Copiando backup a /tmp para evitar problemas de permisos ==="
cp /docker-entrypoint-initdb.d/switch_transaccional.dump /tmp/switch.dump
chmod 666 /tmp/switch.dump

echo "=== Restaurando base de datos 'switch' ==="
pg_restore --username "$POSTGRES_USER" --dbname "switch" --verbose /tmp/switch.dump || true

# Limpieza
rm -f /tmp/switch.dump

echo "=== Restauración completada ==="