# EventGrid — evolución segura, 26 de octubre de 2026

## Base y restricciones
Commit inicial 6688939 (PR #11), precedido por PR #10 (credenciales administrativas para cortesías) y #9 (integridad de recepción y correo manual). Fetch sin divergencia remota; package-lock.json modificado previamente, conservado y excluido de los commits de esta intervención.
Render tiene una inscripción con asistencia y variaciones de inventario. El usuario confirmó: «Conservarlos; mantener Render sin cambios». No desplegar frontend ni backend, ni cambiar variables o datos publicados. El despliegue automático de ambos servicios está desactivado.

## Matriz de diagnóstico al recibir el nuevo alcance
| Requisito | Estado inicial de esta intervención |
|---|---|
| Tarifa 1750 persistida, formulario fijo, históricos | Implementado en PR #11; elección por nombre todavía frágil |
| Solicitudes remotas de cortesía | Implementadas en la rama actual y probadas con aprobación remota, CAS, auditoría y SSE; sustituyen contraseña del operador |
| Protección de usuarios | Parcial: deleteUser físico con fallback; último admin solo global, no por edición |
| Recuperación de contraseña | Pendiente; invitaciones de activación existentes no equivalen a recuperación |
| Tarifa explícita por edición | Pendiente |
| Recepción/QR/camisetas/SSE | Existentes y probados; falta vista rápida identificada e incidencias |
| Supervisión operativa | Implementada en la rama, verificada en API y navegador; solo conexión SSE y operaciones registradas |
| PostgreSQL/backups/restauración | Esquemas y procedimiento preparados; falta ejecutar contra PostgreSQL aislado y ensayar restauración |
| Pruebas antiguas | Suites aisladas disponibles; suites heredadas deben quedar en cuarentena y con barrera de conexión |
| Charlistas | Diseñado pendiente; secundario hasta estabilizar recepción |
| Capacidades avanzadas | RBAC existente; diseño aditivo pendiente, no ampliar permisos automáticamente |

## Validación ya completada antes de ampliar el alcance
69 pruebas en cuatro suites aisladas, con 12 sesiones de navegador sobre SSE real, rondas 5/10/20, aprobación remota desde el formulario, borradores conservados, consistencia de pagos/inventario, última camiseta y duplicados. Builds frontend/backend y esquemas Prisma SQLite/PostgreSQL válidos. PWA, QR con cámara Chrome simulada, responsive 320–1440 y pantallas de error/temas probadas. No equivale a pruebas físicas iPhone/Android ni certificación de producción.

## Preparación de infraestructura
Ver PERSISTENT_HOSTING_RECEPTION.md. No se ejecutó migración real ni se creó infraestructura. La migración aditiva de cortesías no modifica precios ni filas históricas.

## Diseño secundario
Charlistas: reutilizar personas y cronograma mediante relaciones explícitas muchas-a-muchas; separar llegada del evento y estado de cada charla. No emitir otra identidad/QR ni tocar asistencia al cambiar preparación de una charla.
Capacidades: mantener ADMIN/OPERATOR/VIEWER como perfiles base; futuras concesiones por edición, con denegación por defecto, validación backend y auditoría de cambios. Migración sin concesiones implícitas. Requiere intervención separada tras estabilización y persistencia.

## Estado de trabajo
Implementación y QA local completadas. La publicación se verifica mediante el PR y su SHA final; Render permanece sin cambios por instrucción expresa.

## Resultado final de implementación y QA

| Área | Estado final |
|---|---|
| Cortesías | Implementado y probado: solicitud remota por operador, aprobación/rechazo por administrador de la edición, aplicación atómica de importe cero, claves idempotentes, auditoría y SSE. No se solicitan contraseñas administrativas en equipos del operador. La aprobación aplicada no puede reutilizarse. Expiración/cancelación de solicitudes pendientes queda para otra fase. |
| Usuarios | Implementado y probado: desactivación lógica, historial conservado, protección del último administrador global y de cada edición, revocación de sesiones y enlaces al desactivar. Eliminación física no forma parte del flujo. |
| Recuperación | Implementado y probado con proveedor simulado: respuesta neutral, límite de solicitudes, token aleatorio almacenado solo como hash, expiración y uso único, revocación de sesiones. SMTP desactivado no genera envíos ni trabajos para procesar después. Envío real pendiente de autorización futura. |
| Tarifa | Implementado y probado: defaultTicketTypeId explícito por edición, selección administrativa, precio fijo en alta manual y conservación de precios históricos. RD$1,750 solo al crear inicialmente BarCamp 2026. Backfill separado y explícito para una única tarifa compatible; casos ambiguos requieren elección administrativa. No se ejecutó sobre bases reales. |
| Recepción | Implementado y probado: /reception reutiliza búsqueda, ficha, QR, confirmación y camisetas; excluye estadísticas financieras detalladas. Preferencia de entrega inmediata conservada. |
| Incidencias | Implementado y probado: registro manual idempotente, revisión/resolución administrativa, alcance por edición, auditoría y SSE; no alteran pagos ni asistencia. |
| Supervisión | Implementado y probado: conexiones SSE y actividad registrada, sin inferir presencia física ni productividad. Consultas acotadas; no es una herramienta de analítica histórica exhaustiva. |
| PostgreSQL | Esquema válido, cliente generado y TypeScript compilado. Migración SQL aditiva preparada; no aplicada. Ejecución, concurrencia y restauración PostgreSQL bloqueadas por falta de motor aislado disponible. |
| Backups | Copia consistente y restauración SQLite ensayadas exclusivamente en fixture temporal, con reconciliación de importes. Procedimiento PostgreSQL documentado, pendiente de ensayo real. |
| Charlistas y capacidades avanzadas | Diseñados, no implementados. Se conserva RBAC actual; no se conceden permisos implícitos. |
| Render | Bloqueado por preservación de datos, por instrucción expresa. Ambos servicios conservan su despliegue previo 6688939 y autoDeploy desactivado. |

### Archivos principales
- Backend: schemas Prisma y migración 20261026_courtesy_requests; courtesy.policy/routes, recovery.service, userSafety, defaultTicketMigration, incidents.routes, operations.routes; integración en participantes, asistencia, eventos, usuarios, autenticación y SSE.
- Frontend: ReceptionIncidentsPanel, ReceptionOverview, CourtesyRequestsPanel, RecoveryPage; integración en AttendancePage, ParticipantFormModal, SettingsPage, UsersPage, rutas y Sidebar. Firma inferior EVENTGRID / Desarrollado por Iván Marcelino.
- QA: cinco suites autorizadas, safety-guard, vitest.config.ts, scripts de navegador y workflow isolated-qa.yml. Se conservaron las suites antiguas, excluidas de la ejecución predeterminada hasta aislarlas.
- Preparación: PERSISTENT_HOSTING_RECEPTION.md y resultados RECEPTION_LOAD_RESULTS.json / RECEPTION_COURTESY_LOAD_RESULTS.json.

### Resultados verificables
- 78/78 pruebas aprobadas en cinco suites aisladas; incluye correo con mocks, recuperación, roles, idempotencia, auditoría, migración de fixture SQLite antiguo, restauración y 13 sesiones de navegador sobre HTTP/SSE real.
- Rondas 5/10/20 con cero errores inesperados. En la última ronda mixta de 20, p95 del flujo completo 8,143 ms; no representa latencia de una petición individual ni capacidad garantizada de producción. Métricas HTTP separadas en RECEPTION_LOAD_RESULTS.json.
- Build backend y frontend/TypeScript aprobado; validación de ambos esquemas aprobada. Cliente PostgreSQL compilado sin conectarse a ninguna base real; cliente local SQLite restaurado después.
- Navegador Chrome con API simulada: recuperación y accesos demo 390/1440; formulario admin/operador y bloqueo consulta; recepción 320/390/412/844/1440; errores, temas, carga y recuperación de conexión; cámara QR simulada libera pistas y exige una confirmación.
- PWA sobre build final: 76 recursos públicos precargados, API/uploads excluidos de caché, actualización y shell offline aprobados. No se confirma asistencia offline.
- No se efectuaron pruebas físicas en iPhone/Android. No se enviaron correos ni se modificaron datos reales, variables de Render o infraestructura.

### Limitaciones y publicación
El package-lock.json preexistente sigue intacto y fuera de estos commits (359 adiciones/12 eliminaciones). El lock versionado no contiene todas las dependencias ya declaradas por el proyecto; CI usa npm install, no npm ci. Su reconciliación requiere una tarea separada, sin sobrescribir la modificación local.
La puesta en servicio necesita respaldo verificado, persistencia, migración aditiva y selección explícita de tarifa antes de admitir altas. El start de demostración que ejecuta db push/seed no sustituye un despliegue de producción con migraciones revisadas. Ver el procedimiento documentado.
GitHub se integra mediante PR desde codex/reception-courtesy-requests; su enlace y SHA final se registran en la entrega. Render permanece deliberadamente en la versión anterior para conservar la asistencia e inventario existentes.

