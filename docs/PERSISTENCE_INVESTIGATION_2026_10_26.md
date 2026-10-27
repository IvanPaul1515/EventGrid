# Persistencia: investigación y estrategia sin intervenir Render

## Resultado

Con los accesos actuales no se encontró una vía soportada para obtener la SQLite completa y consistente de la instancia activa sin sustituirla. No es una afirmación sobre capacidades internas del operador de Render: soporte podría evaluar una extracción desde el host, pero no se dispone de esa operación ni se contactó a terceros. No se solicita nuevamente autorización para perder datos.

Se verificó el servicio `eventgrid-demo-api`: plan Free, una instancia, autoDeploy desactivado, commit publicado `2c26bfb`. PostgreSQL `eventgrid-demo-db` existe en la misma región y workspace, plan Free, disponible y con vencimiento **2026-11-21**. Su allowlist vacía bloquea la consulta SQL externa del conector. No se cambió esa lista ni ninguna variable, almacenamiento, plan o servicio. El Free PostgreSQL puede sobrevivir a despliegues de la aplicación, pero su vencimiento impide presentarlo como una solución permanente sin un destino posterior autorizado.

## Vías comprobadas

| Vía | Comprobación | Resultado |
|---|---|---|
| MCP Render | Inventario real de herramientas y lectura del servicio | Inspección/despliegues/logs, sin ejecución en la instancia ni descarga de su filesystem |
| SSH y Shell Dashboard | Matriz oficial y plan real Free | No soportados; que aparezca `sshAddress` en metadatos no concede esa capacidad |
| CLI/API | Referencia de comandos y capacidades | No ofrecen un backup remoto de la SQLite del proceso; el CLI no está instalado localmente y no elimina la restricción del plan |
| Jobs/instancias efímeras | Documentación de jobs | Otro proceso/build, no el disco vivo que contiene la SQLite; los jobs además son facturables. No se crearon |
| Red privada | Documentación y plan | Free web puede iniciar conexiones, pero no recibir conexiones privadas; no sirve para montar o descargar su filesystem |
| Rollback/build/cache | Documentación de filesystem efímero | Recuperar el build anterior no recupera las escrituras de la SQLite viva |
| Endpoints actuales | Inspección del código publicado `2c26bfb` y 61 consultas autenticadas de dominio | Exportaciones por módulo, sin ruta de backup íntegro, SQL administrativo ni descarga de archivos arbitrarios |
| `createEditionBackup` | Servicio y único llamador `purgeEdition` | JSON parcial de una edición ligado al vaciado; no se ejecutó. Guarda en `backups`, fuera del único directorio estático `/uploads` |
| SSE | Implementación publicada | Eventos de invalidación, no acceso a todas las tablas o al fichero SQLite |

No se probaron vulnerabilidades, traversal ni ejecución de código para eludir permisos. No se añadió endpoint público o privado de extracción. El acceso HTTP utilizó autenticación demo normal —que puede actualizar `lastLoginAt`— y solo GET para los datos de dominio; no se crearon participantes, pagos, check-ins, envíos ni cambios de configuración.

## Datos: recuperables frente a no recuperables

La inspección amplió y corrigió el inventario previo: **sí existen** lecturas para tarifas inactivas (`includeInactive=true`), historial de invitaciones sin secretos, entregas de staff y notificaciones programadas. No deben clasificarse íntegramente como inaccesibles.

| Datos | Qué permite recuperar la API | Límite que impide un backup completo |
|---|---|---|
| Usuarios | ID, email, nombre, rol, edición, activación, fechas, estado visible de invitaciones | No `passwordHash` ni `sessionVersion` completo de todas las cuentas; no inferirlos de contraseñas iniciales |
| Ediciones/configuración | Configuración visual y operacional publicada | Los binarios referenciados en `/uploads` deben respaldarse aparte; una URL no respalda su contenido |
| Tarifas | Activas y no activas con endpoint específico | Hay que consultar ambas, no solo el detalle del evento |
| Métodos y responsables | Activos y los referenciados en fichas | No hay lectura íntegra equivalente demostrada para inactivos no referenciados |
| Participantes/inscripciones | Listado paginado y ficha con pagos, asistencia, relaciones y fechas | Secuencia de varias consultas, sin transacción global común; no certifica un snapshot consistente ante escrituras concurrentes |
| Pagos/asistencias/inventario | Fichas e inventario, incluidas entregas de staff | Deben compararse relaciones, importes y estados; no usar solo los contadores del dashboard |
| Auditoría | Listado paginado | Las vistas pueden transformar campos y no sustituyen las filas SQLite originales |
| Importaciones | Lotes y reportes de errores | El reporte no garantiza todas las columnas originales de `ImportError` o el archivo fuente |
| Cronograma | Items, notificaciones programadas e historial reciente | Historial limitado a 50 entradas sin paginación; no demostrar ausencia de entradas anteriores si se alcanza el límite |
| Invitaciones | Estado e historial público de cada cuenta | No hashes de token ni estado íntegro de dispatch interno; no reconstruir tokens válidos |
| SMTP | Configuración pública y presencia de secreto | No contraseña cifrada; no intentar descifrar o cambiar credenciales. En el snapshot observado `hasPassword=false` y SMTP desactivado |
| Logs/jobs de correo | Rutas de historial y detalle autorizadas | Verificar paginación, snapshots internos, filtros y campos omitidos antes de declarar completitud; no reintentar trabajos |
| Contadores internos | No existe lectura de `RegistrationSequence.current` | No se puede deducir de `MAX(registrationNumber)`: puede haber números reservados, fallidos o eliminados |
| Login/reset y metadatos SQLite | Sin exportación íntegra de intentos, resets, hashes y catálogo interno | Su existencia o cantidad no puede deducirse de que las vistas estén vacías |

La nueva consulta observó seis usuarios, tres ediciones y dos participantes en una edición. Cronograma/historial/notificaciones, staff e importaciones devolvieron cero filas; SMTP desactivado en las tres ediciones. Son observaciones de esas rutas, no una certificación de cero filas en tablas internas. Los cuatro modelos de sesiones/escáner introducidos por PR #16 aún no están publicados: no atribuirles una pérdida histórica en el backend anterior.

Los snapshots privados siguen fuera de Git, en `C:/Users/scout/.codex/backups/eventgrid-migration-investigation-20261026/` y `eventgrid-preservation-pr16-20261026/`. No se incluyen nombres, documentos, teléfonos, direcciones ni secretos en este informe o en fixtures versionados.

## Hallazgos del historial PostgreSQL

La reproducción aislada de las migraciones, normalizando **solo en memoria de QA** el SQL inicial UTF-16LE, crea 30 tablas frente a 38 del esquema actual. Faltan:

- `staff_members`, `user_invitations`, `invitation_dispatches`.
- `schedule_items`, `schedule_change_logs`, `scheduled_notifications`.
- `sponsors`, `sponsor_payments`.

También faltan siete columnas: `event_settings.schedulePdfUrl`, `event_settings.sponsorCategoryValues`, `users.accountStatus`, `users.staffArea`, `users.assignedEventId`, `email_logs.dispatchKey` y `email_logs.messageId`.

`0_init/migration.sql` tiene BOM UTF-16LE. No se editó ni se cambió el checksum de una migración publicada. Antes de usar `migrate deploy` hay que inspeccionar `_prisma_migrations` del destino y decidir entre reconciliación aditiva o un **baseline completo y UTF-8 para una base realmente vacía**, con historial separado y probado. No marcar migraciones como aplicadas para ocultar diferencias. El SQL completo generado por Prisma se ensayó localmente; no se aplicó a Render.

## Procedimiento preferido: conservar todo

1. Obtener acceso soportado al fichero vivo, o una extracción consistente del operador de Render. No implica que soporte haya aceptado o pueda ofrecerla.
2. Usar la SQLite Online Backup API mediante `sqlite_snapshot.py`, con origen de solo lectura. Incluye el estado confirmado en WAL, comprueba integridad/FK, no sobrescribe archivos y genera hash y manifiesto privado completo. Copiar solo `dev.db` mientras hay WAL no es suficiente.
3. Respaldar también `/uploads` y preservar las variables/secretos mediante un mecanismo autorizado; nunca incorporarlos a Git o al manifiesto público.
4. Inspeccionar el PostgreSQL destino con acceso autorizado, sin ampliar su red en esta intervención. Respaldar cualquier contenido previo. No asumir que está vacío.
5. Corregir/baselinear el esquema completo de forma revisable. Importar a destino vacío en una transacción, con los mismos IDs y relaciones, hashes opacos sin modificarlos, versiones de sesión, precios históricos y contador original. Convertir JSON, booleanos, fechas UTC y decimales sin redondeo silencioso.
6. Comparar cada campo exportado, conteos, relaciones, importes, inventario, tarifas, configuración y contadores. Un reintento debe verificar el mismo snapshot y no crear pagos/inscripciones nuevos.
7. Antes del corte, acordar una ventana sin escrituras y capturar un snapshot final o deltas verificables. No hay hoy un bloqueo global de escrituras autorizado/publicado; no inventar consistencia entre 61 GET.
8. Solo con autorización de corte: usar la URL interna del PostgreSQL correcto, conservar secretos, SMTP desactivado y demo aislada; desplegar backend, comprobar y después frontend compatible. No ejecutar seed/reset para "reconstruir" relaciones sin control.
9. Validar login por rol, relaciones, registros protegidos, importaciones, pagos, inventario, QR, SSE y escáner. Un rollback de código debe seguir apuntando a la base persistente compatible, nunca regresar a una SQLite vacía.
10. Para las siguientes versiones: migraciones aditivas revisadas, `pg_dump -Fc` consistente fuera del servicio, hash, restauración periódica, política de vencimiento/capacidad y QA publicado. Free Render PostgreSQL no tiene PITR/retención automática garantizada y vence; resolver el destino posterior sin contratar servicios de pago ni crear cuentas sin autorización.

## Alternativa de reconstrucción: preparada, no autorizada

Si no se obtiene la copia completa, mantener los datos actuales intactos. Una reconstrucción parcial necesita una autorización futura distinta, con pérdidas enumeradas y sin presentarla como migración sin pérdida.

- Conservar IDs originales de usuarios, participantes, ediciones e inscripciones; importar pagos y auditoría con sus actores, fechas y relaciones. No recrear por nombres o asignar nuevas identidades por email.
- Si falta un hash, no adivinar la contraseña ni asignar una contraseña compartida. Usar un hash de un secreto aleatorio desconocido y entregar un token privado de recuperación, tras verificación humana de identidad, de un solo uso y corta caducidad. Conservar rol/edición/activación; no reactivar cuentas deshabilitadas. No emitir tokens ni enviar correo en esta fase.
- Reutilizar la confirmación de recuperación existente. Para un corte real, implementar y probar un límite explícito de aceptación de sesiones anteriores: no inventar un `sessionVersion` que supuestamente sea mayor que uno desconocido. Las sesiones heredadas no deben readoptarse tras una reconstrucción de seguridad.
- Mantener los números existentes. Si el contador original no aparece, **bloquear nuevas asignaciones** hasta recuperarlo o autorizar un espacio/prefijo nuevo separado. No usar el máximo visible como sustituto del historial de reservas ni prometer continuidad exacta.
- Verificar duplicados por edición + fuente + referencia, documento y señales auxiliares; no fusionar personas por nombre/email compartido. Detener contradicciones, no omitir ni sobreescribir filas silenciosamente.
- Mantener movimientos financieros originales. Ante importes o estados dudosos, revisión administrativa; no inventar pagos, devoluciones, asistencia ni cortesías.
- Mantener envíos históricos y estados inciertos; no drenar/reintentar colas ni activar proveedores al restaurar.

## Pruebas ejecutadas y límites

- Tres pruebas Python: snapshot con WAL y una transacción no confirmada, rechazo de sobreescritura y rechazo de FK incoherentes. La transacción no confirmada no se copió.
- Ensayo local con PostgreSQL **18.6 embebido/WASM (PGlite 0.5.12)**: 38 tablas, 15 filas sintéticas; comparación de todos los campos, hashes/ciphertext opacos, versión de sesión, JSON, UTC, booleanos, precios, FK circular opcional, SMTP apagado y secuencia 120 → 121 aunque solo existan dos inscripciones.
- Reintento idempotente y detección de destino modificado; API parcial rechazada antes de insertar.
- Cuatro casos negativos: pérdida de precisión monetaria, tabla desconocida, duplicado de negocio y destino con datos. Los destinos se conservaron sin inserciones parciales.
- Dos pruebas del flujo existente de recuperación: una sola confirmación gana bajo concurrencia, contraseña nueva sin SMTP, mismo ID/rol/edición, rechazo de token vencido/reutilizado y de cuenta desactivada.
- Docker local no arrancó (timeout). No se certificó PostgreSQL 16 de Render, conectividad Prisma/PostgreSQL, rendimiento de red, `pg_dump`/`pg_restore` nativos ni el corte real. Son gates pendientes, no funcionalidades terminadas.

Las herramientas son offline y no se importan desde el servidor ni añaden rutas. El módulo de ensayo no acepta una URL de Render ni abre puertos; las pruebas usan un motor en memoria. No se añadió PGlite a las dependencias de la aplicación.

## Fuentes

- https://render.com/docs/ssh
- https://render.com/docs/free
- https://render.com/docs/one-off-jobs
- https://render.com/docs/private-network
- https://render.com/docs/postgresql-backups
- https://sqlite.org/backup.html
- https://www.postgresql.org/docs/16/backup-dump.html
- https://pglite.dev/docs/
