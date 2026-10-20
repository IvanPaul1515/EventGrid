#!/bin/bash
# ==============================================================================
# EventGrid — Script de Respaldo de Base de Datos (Linux / macOS / WSL)
# Compatible con SQLite (dev.db) y PostgreSQL (Docker / Local)
# ==============================================================================

set -e

BACKUP_DIR="./backups"
mkdir -p "$BACKUP_DIR"

TIMESTAMP=$(date +"%Y-%m-%d_%H%M%S")

echo "==================================================="
echo "[EventGrid] Iniciando proceso de respaldo..."
echo "Timestamp: $TIMESTAMP"
echo "==================================================="

# 1. Respaldo SQLite
if [ -f "backend/prisma/dev.db" ]; then
    echo "[SQLite] Respaldando backend/prisma/dev.db..."
    cp "backend/prisma/dev.db" "$BACKUP_DIR/eventgrid_sqlite_${TIMESTAMP}.db"
    echo "[SQLite] Respaldo completado: $BACKUP_DIR/eventgrid_sqlite_${TIMESTAMP}.db"
elif [ -f "prisma/dev.db" ]; then
    echo "[SQLite] Respaldando prisma/dev.db..."
    cp "prisma/dev.db" "$BACKUP_DIR/eventgrid_sqlite_${TIMESTAMP}.db"
    echo "[SQLite] Respaldo completado: $BACKUP_DIR/eventgrid_sqlite_${TIMESTAMP}.db"
fi

# 2. Respaldo PostgreSQL si Docker está corriendo
if command -v docker &> /dev/null && docker ps | grep -q "postgres"; then
    echo "[PostgreSQL] Contenedor Docker detectado. Ejecutando pg_dump..."
    docker exec -t barcamp_postgres pg_dump -U barcamp_admin -d barcamp_rd -F c -b -v > "$BACKUP_DIR/eventgrid_postgres_${TIMESTAMP}.dump" 2>/dev/null || \
    docker exec -t barcamp_postgres pg_dump -U barcamp_admin -d barcamp_rd > "$BACKUP_DIR/eventgrid_postgres_${TIMESTAMP}.sql"
    echo "[PostgreSQL] Respaldo completado en $BACKUP_DIR"
else
    echo "[Info] Contenedor PostgreSQL no activo. Se conservo el respaldo SQLite."
fi

echo "==================================================="
echo "[EventGrid] Proceso de respaldo finalizado exitosamente."
echo "Ubicación: $(pwd)/$BACKUP_DIR"
echo "==================================================="
