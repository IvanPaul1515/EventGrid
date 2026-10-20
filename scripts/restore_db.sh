#!/bin/bash
# ==============================================================================
# EventGrid — Script de Restauración de Base de Datos (Linux / macOS / WSL)
# Uso: ./scripts/restore_db.sh <ruta_al_archivo_de_respaldo>
# ==============================================================================

set -e

if [ -z "$1" ]; then
    echo "==================================================="
    echo "[ERROR] Debe especificar la ruta del archivo de respaldo."
    echo "Uso: ./scripts/restore_db.sh backups/eventgrid_sqlite_YYYY-MM-DD_HHMMSS.db"
    echo "==================================================="
    exit 1
fi

BACKUP_FILE="$1"

if [ ! -f "$BACKUP_FILE" ]; then
    echo "[ERROR] El archivo de respaldo no existe: $BACKUP_FILE"
    exit 1
fi

echo "==================================================="
echo "[EventGrid] ATENCIÓN: Esta acción reemplazará la base de datos actual."
echo "Archivo a restaurar: $BACKUP_FILE"
echo "==================================================="
read -p "¿Desea continuar? (s/N): " CONFIRM
if [[ "$CONFIRM" != "s" && "$CONFIRM" != "S" ]]; then
    echo "[Cancelado] Operación abortada por el usuario."
    exit 0
fi

# Si es archivo SQLite (.db)
if [[ "$BACKUP_FILE" == *.db ]]; then
    echo "[SQLite] Restaurando base de datos a backend/prisma/dev.db..."
    cp "$BACKUP_FILE" "backend/prisma/dev.db"
    echo "[SQLite] Base de datos restaurada exitosamente."
    exit 0
fi

# Si es PostgreSQL
if command -v docker &> /dev/null && docker ps | grep -q "postgres"; then
    if [[ "$BACKUP_FILE" == *.dump ]]; then
        echo "[PostgreSQL] Restaurando volcado .dump..."
        docker cp "$BACKUP_FILE" barcamp_postgres:/tmp/restore.dump
        docker exec -t barcamp_postgres pg_restore -U barcamp_admin -d barcamp_rd --clean --if-exists /tmp/restore.dump
        echo "[PostgreSQL] Restauración completada."
    else
        echo "[PostgreSQL] Restaurando script .sql..."
        cat "$BACKUP_FILE" | docker exec -i barcamp_postgres psql -U barcamp_admin -d barcamp_rd
        echo "[PostgreSQL] Restauración completada."
    fi
else
    echo "[ERROR] Contenedor PostgreSQL no detectado."
    exit 1
fi

echo "[EventGrid] Proceso finalizado."
