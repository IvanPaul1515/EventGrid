@echo off
REM ==============================================================================
REM EventGrid — Script de Respaldo de Base de Datos (Windows)
REM Compatible con SQLite (dev.db) y PostgreSQL (Docker / Local)
REM ==============================================================================

setlocal enabledelayedexpansion

set BACKUP_DIR=backups
if not exist "%BACKUP_DIR%" (
    mkdir "%BACKUP_DIR%"
)

for /f %%I in ('powershell -NoProfile -Command "Get-Date -Format yyyy-MM-dd_HHmmss"') do set TIMESTAMP=%%I

echo ===================================================
echo [EventGrid] Iniciando proceso de respaldo...
echo Timestamp: %TIMESTAMP%
echo ===================================================

REM 1. Respaldo de SQLite local (dev.db) si existe
if exist "backend\prisma\dev.db" (
    echo [SQLite] Respaldando backend\prisma\dev.db...
    copy /Y "backend\prisma\dev.db" "%BACKUP_DIR%\eventgrid_sqlite_%TIMESTAMP%.db" >nul
    if %ERRORLEVEL% EQU 0 (
        echo [SQLite] Respaldo completado: %BACKUP_DIR%\eventgrid_sqlite_%TIMESTAMP%.db
    ) else (
        echo [SQLite] ERROR al copiar dev.db
    )
) else if exist "prisma\dev.db" (
    echo [SQLite] Respaldando prisma\dev.db...
    copy /Y "prisma\dev.db" "%BACKUP_DIR%\eventgrid_sqlite_%TIMESTAMP%.db" >nul
    if %ERRORLEVEL% EQU 0 (
        echo [SQLite] Respaldo completado: %BACKUP_DIR%\eventgrid_sqlite_%TIMESTAMP%.db
    )
)

REM 2. Respaldo de PostgreSQL si Docker está en ejecución
docker ps --format "{{.Names}}" 2>nul | findstr /i "postgres" >nul
if %ERRORLEVEL% EQU 0 (
    echo [PostgreSQL] Contenedor Docker detectado. Ejecutando pg_dump...
    docker exec -t barcamp_postgres pg_dump -U barcamp_admin -d barcamp_rd -F c -b -v > "%BACKUP_DIR%\eventgrid_postgres_%TIMESTAMP%.dump" 2>nul
    if %ERRORLEVEL% EQU 0 (
        echo [PostgreSQL] Respaldo completado: %BACKUP_DIR%\eventgrid_postgres_%TIMESTAMP%.dump
    ) else (
        echo [PostgreSQL] Intentando volcado SQL texto plano...
        docker exec -t barcamp_postgres pg_dump -U barcamp_admin -d barcamp_rd > "%BACKUP_DIR%\eventgrid_postgres_%TIMESTAMP%.sql"
        echo [PostgreSQL] Volcado completado: %BACKUP_DIR%\eventgrid_postgres_%TIMESTAMP%.sql
    )
) else (
    echo [Info] Contenedor PostgreSQL no activo. Se genero el respaldo de SQLite.
)

echo ===================================================
echo [EventGrid] Proceso de respaldo finalizado exitosamente.
echo Ubicacion: %CD%\%BACKUP_DIR%
echo ===================================================
