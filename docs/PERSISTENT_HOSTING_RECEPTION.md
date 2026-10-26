# Preparación para alojamiento persistente

No se ha migrado infraestructura ni se presupone que eventgrid.barcamp.org.do exista o admita Node.js.

## Requisitos y configuración
- Runtime Node compatible con package.json/lock y las compilaciones verificadas; fijar y probar la versión en el destino.
- PostgreSQL persistente, usuario de aplicación limitado y credenciales externas al repositorio. DATABASE_URL debe apuntar a PostgreSQL y seleccionar schema.prisma con el detector existente.
- HTTPS y proxy que dirija /api/v1 al backend y sirva el frontend con fallback SPA. Preservar Authorization, cookies y las cabeceras de edición; CORS_ORIGIN limitado al origen real; TRUST_PROXY ajustado a los saltos reales.
- SSE: desactivar buffering y caché de las rutas /events/:id/stream y /realtime/stream; permitir conexiones largas y heartbeats. La implementación actual es por proceso: usar una instancia o preparar distribución de eventos antes de escalar horizontalmente.
- Supervisión del proceso, logs con rotación y acceso restringido, métricas y comprobaciones HTTP de salud. No registrar cuerpos con credenciales, tokens o información sensible.
- Directorio uploads persistente (logos, cronogramas y archivos) o almacenamiento de objetos con acceso y copias controlados. No asumir persistencia del filesystem del proveedor.
- PWA: HTTPS, manifest/iconos accesibles y service worker con MIME correcto. La API y uploads no se cachean como datos offline; no hay check-in offline.
- SMTP/Brevo permanecen desactivados. Cualquier habilitación futura requiere autorización separada y no debe reactivar trabajos antiguos.

## Migración futura, sin ejecutarla ahora
1. Inventariar tablas, catálogos, usuarios, archivos, auditorías, pagos, camisetas y solicitudes de cortesía. Detener escrituras para obtener una copia consistente.
2. Exportar una copia verificada de SQLite y uploads en almacenamiento protegido. Conservar IDs, fechas, importes y relaciones. No convertir contraseñas ni exponer hashes/tokens.
3. Preparar PostgreSQL aislado y comparar schema.prisma con su esquema real. Revisar baseline e historial de migraciones antes de utilizar migrate deploy: las migraciones antiguas no son una certificación del esquema completo actual.
4. La migración 20261026_courtesy_requests es aditiva: crea tabla, índices y claves; no borra registros ni modifica precios. Se generó sin conectar a una base PostgreSQL y debe ensayarse en el destino aislado.
5. Importar usando una herramienta revisada, validar referencias y reconciliar totales, ingresos, asistencia irreversible, stock, staff, solicitudes y auditorías. No activar correos durante importación/arranque.
6. Probar login/roles/ediciones, QR, concurrencia real PostgreSQL, SSE a través del proxy y PWA. No extrapolar las métricas SQLite locales a producción.
7. Cambiar el tráfico únicamente tras verificar integridad y disponer de rollback compatible con los datos. Un rollback de código no restaura la base.

## Copias y restauración
- Programar backups PostgreSQL (por ejemplo pg_dump en formato custom) y copias de uploads en un destino independiente, cifrado y con retención acordada. Credenciales en un almacén seguro, sin imprimir la conexión en logs.
- Definir RPO/RTO con el responsable; verificar el resultado de cada copia y alertar fallos.
- Ensayar restauración con pg_restore en una base aislada junto a su snapshot de uploads. Comparar conteos, relaciones y totales y probar la aplicación con correo desactivado.
- Conservar copia previa a cada migración y registrar versión de código/esquema. No borrar la fuente durante la transición.

## Límite actual de Render
SQLite efímero puede perder registros, configuración e inventario al recrear una instancia. Una inicialización que conserva valores en una base existente no resuelve ese límite. No desplegar si hay datos que deban conservarse sin una estrategia aprobada de preservación. No se han creado servicios, contratado planes ni cambiado variables.

## Actualización de esquema y operación — 26 octubre 2026
La migración aditiva `20261026_courtesy_requests` incluye solicitudes de cortesía, recuperación, incidencias, `users.sessionVersion` y `events.defaultTicketTypeId`. No contiene DROP ni borrado de datos. Añadir la columna de tarifa no elige un nombre ni un ID arbitrario.

Para datos existentes, `scripts/backfill-official-tickets.ts` es una operación explícita y separada del arranque: solo selecciona una tarifa si hay exactamente una candidata activa con precio positivo; no modifica importes y audita la selección. Con cero o varias candidatas exige decisión administrativa desde Entradas. No se ejecutó sobre datos del usuario ni Render. SQLite anterior al cambio se actualizó y verificó en una copia temporal de fixture; los importes históricos quedaron intactos.

PostgreSQL: se generó el SQL aditivo y se compiló el backend con el cliente PostgreSQL. No había PostgreSQL local ni motor Docker activo; no se inició ni instaló infraestructura. No se ha ensayado la migración ni pg_dump/pg_restore contra un servidor PostgreSQL. La restauración comprobada corresponde exclusivamente a SQLite temporal (`VACUUM INTO` y apertura de la copia con reconciliación de conteos y sumas).

El script npm start actual está orientado a la demo: ejecuta db push y seed. En el destino persistente debe separarse la migración revisada/respaldada del inicio del proceso y utilizar `node backend/dist/server.js` después de aplicar el esquema autorizado. No utilizar el arranque demo como procedimiento de migración de producción. El historial antiguo de migraciones requiere comparación con el destino real antes de migrate deploy.

Recuperación: requiere origen HTTPS canónico en FRONTEND_URL (o un origen HTTPS configurado), proveedor ya autorizado/habilitado y PASSWORD_RESET_TTL_MINUTES opcional (5–60, por defecto 15). Con proveedor deshabilitado no se crea trabajo pendiente ni se envía; la respuesta no revela cuentas. No se cambiaron variables ni secretos. Los tokens se guardan solo como hash y el enlace usa fragmento para no aparecer en la ruta HTTP del servidor; se elimina del historial visible al abrirlo.

SSE multinodo: la versión probada usa un solo proceso. Antes de añadir instancias, se necesitará un adaptador de publicación/suscripción con aislamiento por edición, señales mínimas, revalidación de permisos y resync tras reconexión. No se añadió Redis ni otro servicio. Las conexiones no miden presencia física ni productividad.

Datos e historial: la administración normal desactiva cuentas; las relaciones de cortesías e incidencias conservan referencias históricas. Una eliminación permanente requiere procedimiento separado; no se implementa ni ejecuta automáticamente.
