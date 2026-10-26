# Escáner móvil vinculado y recepción — 26 de octubre de 2026

## Implementado

Se mantienen dos modalidades: EventGrid normal (incluye QR independiente) y el escáner opcional vinculado. No se agregó una aplicación aparte. En Recepción, una PC se registra explícitamente como estación; el celular de la misma cuenta y edición la elige, la PC autoriza la solicitud y el celular introduce el código mostrado en la PC. La sugerencia en pantallas pequeñas solo aparece si el servidor devuelve una estación autorizada y disponible; puede descartarse por sesión.

Cada login emite un JWT con una sesión persistente independiente. Logout revoca únicamente esa sesión y su conexión SSE. La API permite consultar y revocar las sesiones propias; no se construyó una nueva pantalla de administración de dispositivos. Cambio de contraseña, recuperación y desactivación conservan la revocación global existente mediante `sessionVersion`. Tokens anteriores se reconocen por digest, mantienen su caducidad y pueden revocarse, pero requieren un nuevo login para vincular dispositivos.

Los códigos tienen seis dígitos, caducidad de 90 segundos, cinco intentos máximos y un solo uso. Los intentos fallidos se confirman en una transacción antes de devolver el error. Se guardan un HMAC y un cifrado AES-GCM, nunca el código en texto plano. Solo la sesión PC correspondiente puede recuperar el código para mostrarlo. Al consumirlo o revocarlo se eliminan ambos valores del enlace. No se incluyen códigos en auditorías o avisos SSE.

Estaciones, enlaces y lecturas se guardan en la base de datos. Una lectura válida reserva una operación pendiente de la estación; otra lectura del mismo participante es idempotente y un participante distinto se rechaza mientras la estación está ocupada. Un identificador de solicitud repetido recupera su resultado. La lectura no confirma asistencia, no registra pagos y no descuenta inventario. La PC abre la ficha existente y usa la confirmación manual existente. Un check-in o cancelación confirmado en el servidor resuelve la lectura al consultar su estado.

SSE solo lleva un aviso con identificador de enlace dirigido a las dos sesiones vinculadas, nunca la ficha del participante. La consulta de estado cada diez segundos recupera los avisos perdidos y el estado tras una recarga. Las respuestas de consultas anteriores a una acción se descartan/coalescen en la interfaz. Una concesión de 45 segundos limita estaciones y móviles desconectados; no se reanima una vinculación vencida. La cámara reutiliza el componente actual y se libera al cerrar, desvincular o detectar pérdida de conexión. No existe check-in offline.

El formulario genera el número interno en el backend y lo muestra tras guardar. Institución sigue siendo opcional. La corrección excepcional del número exige administrador y motivo auditado. El selector distingue explícitamente inscripción, pago y asistencia; no se cambian estados históricos. Se mantienen abonos y liquidación completa. Efectivo y tarjeta se presentan primero si están configurados, sin crear métodos nuevos; cortesía se excluye como forma de pago. Las solicitudes de cortesía pendientes deshabilitan pago/responsable y conservan el flujo administrativo existente.

Los nuevos registros guardan creador real, origen y responsable comercial por separado. El responsable predeterminado presencial es el usuario conectado. Una reasignación requiere administrador y motivo; las etiquetas comerciales configuradas siguen siendo compatibles. La ficha muestra procedencia, responsable, creador/importador, comprador y referencia externa cuando existen, sin inventar responsables para registros históricos.

Excel genera siempre números internos nuevos. El número de origen se guarda como referencia externa, con plataforma, comprador y estado de pago informado por el origen; el estado contable sigue calculándose con importes. Se admiten valores por lote para plataforma, comprador, responsable y método de pago. El importador no se convierte en vendedor. Se detectan duplicados por documento/correo y plataforma + referencia; existe un índice único para la última combinación. Se corrigió un filtro vacío de duplicados que podía seleccionar otra inscripción y se retiró la modificación de importes históricos en la estrategia UPDATE. No se migran los números externos de importaciones antiguas.

## Migraciones y compatibilidad

- PostgreSQL: `backend/prisma/migrations/20261026_device_sessions/migration.sql`, aditiva: tablas de sesiones/estaciones/enlaces/lecturas, columnas opcionales e índice. No contiene DROP, DELETE ni actualizaciones de precios/participantes.
- SQLite: `backend/scripts/reception-metadata-migration.js` añade únicamente columnas opcionales e índice antes de `db push`, sin `--accept-data-loss`. Es idempotente y falla ante referencias duplicadas sin eliminar registros. La prueba de actualización conserva una inscripción histórica con precio 1600 y abono 900. No se ejecutó contra bases locales del usuario ni Render.
- Antes de aplicar cualquier actualización real se requiere respaldo restaurable y almacenamiento persistente. No se ha probado la migración en un motor PostgreSQL real.

## Pruebas

Baseline: 92 aprobadas y una omitida antes de modificar código. Suite ampliada completa: 118 aprobadas, sin omisiones, incluyendo las dos pruebas de navegador opcionales activadas. Se usan exclusivamente SQLite temporal, loopback HTTP, sesiones sintéticas y mocks del proveedor donde se ejercita correo. Ningún correo ni check-in de producción.

`device_sessions.test.ts`: sesiones distintas, logout individual, caducidad, revocación global, cuenta desactivada, adopción de JWT anterior, listado/revocación exclusivamente propios y cierre SSE dirigido.

`linked_scanner.test.ts`: rutas HTTP autenticadas, estación explícita y de la misma cuenta/edición, autorización PC, secreto no expuesto al móvil, código incorrecto/vencido/reutilizado, cinco intentos persistentes, permisos, dos pares simultáneos, lecturas idempotentes, ficha pendiente, invalidez, desconexión, revocación y aislamiento SSE. Su prueba real de navegador (`frontend/tests/linked-scanner.cjs`) abre dos PC a 1440 px y dos móviles a 390 px, vincula ambos pares simultáneamente, comprueba entrega dirigida, abre la ficha, recarga la PC, recupera la lectura y confirma manualmente en la base temporal. Desvincular devuelve el móvil al modo normal sin logout. No hay overflow horizontal.

`reception_metadata.test.ts`: cinco altas concurrentes con numeración única, institución vacía, creador/responsable independientes, corrección administrativa auditada, rechazo a cambios del operador, importación con valores de lote, referencias externas, duplicados y conservación de importes históricos.

Se volvió a ejecutar la regresión de recepción, cortesías, roles, recuperación, inventario, comunicaciones y SSE. La simulación existente incluye olas de 5/10/20 operadores; los resultados medidos se conservan en `RECEPTION_LOAD_RESULTS.json` y `RECEPTION_COURTESY_LOAD_RESULTS.json`. No certifican capacidad en Render ni PostgreSQL. La prueba de regresión SSE abre más de diez sesiones reales adicionales y conserva aislamiento por edición y confirmación irreversible.

Para repetir la prueba de navegador se inicia Vite en loopback puerto 5189 con `VITE_API_URL=http://127.0.0.1:4191/api/v1`, y se ejecuta la suite con `EVENTGRID_SCANNER_BROWSER=true`, `EVENTGRID_REALTIME_BROWSER=true` y `EVENTGRID_PLAYWRIGHT` apuntando al paquete Playwright disponible. El backend de prueba se inicia exclusivamente desde el fixture temporal. CI ejecuta `npm ci`, compilaciones, pruebas sin navegador físico y validación de ambos esquemas.

## Límites y pendientes verificados

- No se probaron cámaras físicas, suspensión/batería de iPhone/Android ni PWA instalada en dispositivos reales. Se usaron navegadores emulados. La PWA conserva su configuración y se incluye en la compilación; no se afirma una nueva certificación de instalación física.
- SSE sigue siendo local al proceso. La base persistida y el sondeo permiten recuperar estado entre instancias; la notificación inmediata entre procesos necesitaría pub/sub compartido. No se añadió Redis ni otro servicio.
- La caducidad/revocación de enlaces se materializa al consultar/operar, no mediante un worker programado. Un dispositivo cerrado deja de ser utilizable al vencer su concesión; al abandonar Recepción desde la SPA se intenta desvincular y la caducidad cubre fallos de red.
- La importación existente sigue procesando filas individualmente; no se convirtió en una transacción de lote completo. El índice único evita referencias duplicadas, pero no se certificó rendimiento de importaciones masivas concurrentes en PostgreSQL.
- No se migraron referencias, precios ni atribuciones comerciales históricas; los campos nuevos permanecen vacíos en esos registros.
- No hay pantalla nueva para gestionar todas las sesiones; están disponibles las rutas autenticadas de listado/revocación y el logout por dispositivo.

## Render: publicación detenida por conservación de datos

El preflight posterior confirmó dos participantes existentes en el backend y SMTP desactivado, sin trabajos de correo pendientes. El servicio sigue sin disco persistente y con despliegue automático desactivado. Un snapshot por API es evidencia, no un respaldo completo restaurable de SQLite. Por instrucción expresa del usuario se mantienen ambos servicios sin desplegar: el frontend nuevo necesita las rutas del backend nuevo. No se reinició ningún servicio, no se cambió configuración, no se crearon servicios ni planes y no se descartó ningún dato. El estado de GitHub/PR/CI se comunica con sus enlaces verificados en el informe final.
