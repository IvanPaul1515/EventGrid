# EventGrid con Docker Desktop y PostgreSQL

Esta distribución es independiente de Render. No cambia sus servicios ni migra su SQLite. Requiere Docker Desktop para Windows 11 con contenedores Linux, Compose v2 con soporte `include`, espacio suficiente y salida HTTPS para descargar imágenes y recursos OCR. En Linux se utiliza el mismo Compose detrás de un proxy HTTPS.

## Instalación local aislada

1. Si **no existe** `.env`, copia `.env.example` a `.env`. Si ya existe, consérvalo y prepara un archivo privado `.env.docker` con las variables del ejemplo; añade `--env-file .env.docker` a todos los comandos. Nunca sobrescribas claves existentes.
2. Genera valores aleatorios distintos para `POSTGRES_PASSWORD`, `JWT_SECRET`, `COOKIE_SECRET` y `APP_SECRET` (por ejemplo `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`). Conserva `APP_SECRET` en un gestor de secretos: permite descifrar SMTP después de restaurar la base. No lo regeneres durante actualizaciones.
3. Define `INITIAL_ADMIN_EMAIL` y una contraseña privada de al menos 16 caracteres, con mayúsculas, minúsculas y números. Solo se usan si la base no tiene usuarios. No se crean cuentas demo en una instalación normal. Para una demo **aislada**, los tres valores `DEMO_SEED=true`, `DEMO_QUICK_ACCESS=true` y `BLOCK_REAL_EMAIL=true` habilitan el seed existente y sus cinco accesos rápidos. No uses ese modo con datos reales.
4. Desde la raíz, ejecuta `docker compose config --quiet`, `docker compose build backend frontend` y `docker compose up -d`. PostgreSQL debe estar saludable antes de ejecutar `prisma migrate deploy`; el backend espera a que termine esa migración y el frontend espera su health check.
5. Consulta `docker compose ps`, `docker compose logs --tail 80 migrate backend frontend` y abre `http://localhost:3000`. La salud está en `http://localhost:4000/api/v1/health`. Los puertos y `CORS_ORIGIN` se pueden adaptar. No publiques el puerto de PostgreSQL.

El contexto de construcción es **la raíz**, porque existe un único `package-lock.json` para los workspaces. Las imágenes excluyen `.env`, bases, uploads y dependencias locales. El frontend utiliza `/api/v1` a través de nginx, con rutas SPA y SSE sin buffering. No hay secretos privados en Vite.

La migración inicial del repositorio estaba codificada en UTF-16 y PostgreSQL la rechazaba por bytes nulos. Se conserva su SQL y se guarda en UTF-8. Si una instalación PostgreSQL anterior ya hubiera marcado esa migración como aplicada mediante un baseline manual, verifica sus checksums y esquema en una copia antes de actualizar: no marques migraciones como aplicadas ni modifiques `_prisma_migrations` para ocultar diferencias. La reparación `resolve --rolled-back` utilizada en QA se limitó a la migración que falló antes de ejecutar SQL en una base nueva y aislada; no es un procedimiento automático para bases existentes.

## Persistencia, correo y OCR

`barcamp_pgdata` conserva PostgreSQL y `eventgrid_uploads` conserva logos/documentos. Mantén el mismo nombre de proyecto Compose y esas referencias al actualizar. Si ya había un stack antiguo, respalda primero, conserva su volumen y sus credenciales y verifica las migraciones en una copia antes de actualizar; no inicialices otro volumen como sustituto de su base.

SMTP se configura desde administración y se cifra en la base con `APP_SECRET`. Cambiar demo no borra esa configuración. Se reutiliza **Probar conexión SMTP**, que valida conexión/TLS/autenticación sin enviar mensajes. `BLOCK_REAL_EMAIL=true` mantiene bloqueados los envíos reales; no lo desactives durante QA. No se abren puertos SMTP entrantes ni se reanudan trabajos de correo al arrancar. La red de aplicación permite salida al proveedor autorizado (587/465 según su configuración).

Tesseract y el lector manuscrito se ejecutan **en el navegador**, no requieren otro contenedor ni paquetes OCR en el backend. El primer uso necesita conexión para descargar idiomas/modelos desde los proveedores existentes. Un fallo de descarga muestra un error y permite transcripción manual. Verifica esas salidas HTTPS en el servidor y dispositivo final. No se promete OCR offline ni precisión garantizada en manuscritos.

## Parada y actualización

Usa `docker compose stop` o `docker compose down` **sin eliminar volúmenes**. No uses `down -v`, `volume rm`, `system prune --volumes` ni `prisma migrate reset`: eliminan datos. Docker Hub almacena imágenes, **no** bases de datos ni claves.

Antes de actualizar, respalda y prueba la restauración. Construye/publica una versión identificable, cambia `IMAGE_VERSION`, ejecuta `docker compose pull`, `docker compose run --rm migrate` y después `docker compose up -d`. Revisa logs, salud, login y datos preservados. En desarrollo usa `docker compose build` en vez de `pull`. No reviertas una migración usando una imagen incompatible: prepara primero un plan probado con una copia.

## Respaldo y restauración verificada (PowerShell)

Trabaja en una carpeta privada fuera de Git. No redirijas un dump binario con `>` en versiones antiguas de PowerShell. Crea el archivo dentro del contenedor y cópialo:

```powershell
docker compose exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc -f /tmp/eventgrid.dump'
$dbContainer = docker compose ps -q postgres
docker cp "${dbContainer}:/tmp/eventgrid.dump" C:\RespaldosPrivados\eventgrid.dump
Get-FileHash C:\RespaldosPrivados\eventgrid.dump -Algorithm SHA256
docker compose exec -T backend tar -C /app/backend/uploads -czf /tmp/eventgrid-uploads.tgz .
$apiContainer = docker compose ps -q backend
docker cp "${apiContainer}:/tmp/eventgrid-uploads.tgz" C:\RespaldosPrivados\eventgrid-uploads.tgz
```

Conserva también las claves privadas y variables del destino por un canal seguro. No las agregues al dump ni a Docker Hub. Comprueba que `pg_restore --list` pueda leer el archivo y **restáuralo realmente en una base vacía de prueba**, con el mismo PostgreSQL 16 y sin correo habilitado:

```powershell
docker compose exec -T postgres sh -c 'createdb -U "$POSTGRES_USER" eventgrid_restorecheck'
docker compose exec -T postgres sh -c 'pg_restore --exit-on-error --no-owner -U "$POSTGRES_USER" -d eventgrid_restorecheck /tmp/eventgrid.dump'
docker compose exec -T postgres sh -c 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d eventgrid_restorecheck -c "SELECT count(*) FROM registrations; SELECT count(*) FROM payments; SELECT count(*) FROM merch_movements; SELECT count(*) FROM audit_logs;"'
```

Compara conteos y relaciones de **todas** las tablas, secuencias, asistentes, inventario, tarifas y configuraciones con el origen; valida acceso con cuentas existentes y descifrado SMTP sin enviar. Un hash o una exportación de participantes no sustituye esta prueba. No restaures encima de una base con datos. Para trasladar, copia el dump y uploads por canal privado a un destino vacío, usa `docker cp` y repite `pg_restore --exit-on-error --no-owner` apuntando explícitamente a la nueva base autorizada. Conserva `APP_SECRET` y las claves de autenticación requeridas. No conectes local a producción ni sincronices demo y datos reales automáticamente.

## Docker Hub y servidor definitivo

No se publican imágenes automáticamente. Con autorización separada y tu namespace, usa versiones/commits, nunca una etiqueta ambigua como única referencia:

```powershell
docker build -f backend/Dockerfile --build-arg VCS_REF=<commit> -t <usuario>/eventgrid-backend:<version> .
docker build -f frontend/Dockerfile --build-arg VCS_REF=<commit> -t <usuario>/eventgrid-frontend:<version> .
docker login
docker push <usuario>/eventgrid-backend:<version>
docker push <usuario>/eventgrid-frontend:<version>
docker pull <usuario>/eventgrid-backend:<version>
docker pull <usuario>/eventgrid-frontend:<version>
```

Para AMD64/ARM64 puede usarse `docker buildx build --platform linux/amd64,linux/arm64`, probando ambas arquitecturas antes de una publicación expresamente autorizada. No se afirma compatibilidad ARM64 sin haberla probado.

En el servidor configura HTTPS/proxy inverso, secretos privados, copia de seguridad programada supervisada y gestión de procesos mediante Compose. Expón solo el frontend detrás del proxy; el backend puede permanecer en loopback. Una PostgreSQL gestionada requiere autorización y conexión segura; adapta la URL explícitamente sin publicar 5432. No cambies las claves para resolver errores de descifrado. El procedimiento nativo de Render permanece independiente y siempre exige preservar/restaurar sus datos antes de reiniciar almacenamiento efímero.

Referencia: [orden de arranque de Docker Compose](https://docs.docker.com/compose/how-tos/startup-order/).
