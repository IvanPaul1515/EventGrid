@echo off
REM ==============================================================================
REM EventGrid — Script de Restauración de Base de Datos (Windows)
REM Uso: restore_db.bat <ruta_al_archivo_de_respaldo>
REM ==============================================================================

setlocal enabledelayedexpansion

if "%~1"=="" (
    echo ===================================================
    echo [ERROR] Debe especificar la ruta del archivo de respaldo.
    echo Uso: restore_db.bat ..\backups\eventgrid_sqlite_YYYY-MM-DD_HHMMSS.db
    echo ===================================================
    exit /b 1
)

set BACKUP_FILE=%~1

if not exist "%BACKUP_FILE%" (
    echo [ERROR] El archivo de respaldo especificado no existe: %BACKUP_FILE%
    exit /b 1
)

echo ===================================================
echo [EventGrid] ATENCION: Esta accion reemplazara los datos actuales.
echo Archivo a restaurar: %BACKUP_FILE%
echo ===================================================
set /p CONFIRM="Desea continuar? (S/N): "
if /i not "%CONFIRM%"=="S" (
    echo [Cancelado] Operacion cancelada por el usuario.
    exit /b 0
)

REM Si es archivo .db (SQLite)
if /i "%BACKUP_FILE:~-3%"==".db" (
    echo [SQLite] Restaurando base de datos a backend\prisma\dev.db...
    copy /Y "%BACKUP_FILE%" "backend\prisma\dev.db" >nul
    if %ERRORLEVEL% EQU 0 (
        echo [SQLite] Base de datos restaurada exitosamente.
    ) else (
        echo [SQLite] Error al restaurar el archivo .db.
    )
    exit /b 0
)

REM Si es archivo .dump o .sql (PostgreSQL)
docker ps --format "{{.Names}}" 2>nul | findstr /i "postgres" >nul
if %ERRORLEVEL% EQU 0 (
    if /i "%BACKUP_FILE:~-5%"==".dump" (
        echo [PostgreSQL] Restaurando volcado custom .dump...
        docker cp "%BACKUP_FILE%" barcamp_postgres:/tmp/restore.dump
        docker exec -t barcamp_postgres pg_restore -U barcamp_admin -d barcamp_rd --clean --if-exists /tmp/restore.dump
        echo [PostgreSQL] Restauracion finalizada.
    ) else (
        echo [PostgreSQL] Restaurando script .sql...
        type "%BACKUP_FILE%" | docker exec -i barcamp_postgres psql -U barcamp_admin -d barcamp_rd
        echo [PostgreSQL] Restauracion finalizada.
    )
) else (
    echo [ERROR] El contenedor PostgreSQL de Docker no esta en ejecucion.
)

echo [EventGrid] Proceso de restauracion completado.
