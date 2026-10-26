# QA del PR #12: CI y concurrencia SQLite — 26/10/2026

## Estado inicial y evidencia
Base local/remota: 8fae6a16af071513db5a25614da99cb913e4395d; sin commits remotos posteriores al iniciar. PR #12 ya fusionado. Único cambio previo local: package-lock.json (359 adiciones/12 eliminaciones), analizado y preservado íntegramente.

- Ejecución fallida: https://github.com/IvanPaul1515/EventGrid/actions/runs/40350654255 (head 5aa0c918db22d433e73715e50e96223241a411c5).
- Workflow `.github/workflows/isolated-qa.yml`, Ubuntu/Node 24. Ambos builds aprobados; 76 pruebas aprobadas, una omitida y una fallida.
- Prueba: `runs controlled 5/10/20 operator waves with payments, courtesy decisions, shirts and SSE`, manual_registration_courtesy.test.ts:194 original. Esperaba 200 en check-in; obtuvo 503.
- Corrección ya existente: f1787abe64cf5ffe04dec387413f951adc249fd8 incorpora las dos auditorías de rechazos de check-in a writeTransaction.
- Ejecución posterior ya aprobada, comprobada mediante API: https://github.com/IvanPaul1515/EventGrid/actions/runs/40351242560 . Por tanto el fallo proporcionado no corresponde al código final de PR #12.

## Causa y límites de la evidencia
La revisión confirma que las dos auditorías escribían fuera de la coordinación SQLite y podían competir con el escritor de una transacción activa. El único cambio funcional entre las dos ejecuciones fue serializarlas; la carga y los límites se conservaron. El log antiguo no registraba el cuerpo del 503 ni tiempos individuales de cola: no permite determinar retrospectivamente si fue saturación por cantidad o caducidad por espera. La contención es la explicación compatible con el código y la corrección, no una medición de bloqueo del motor antiguo. No se reprodujo el fallo histórico en Windows con el código corregido; sí se reprodujeron los rechazos deliberados de cola de forma determinista y sin base real.

## Revisión del contrato operativo
writeTransaction permanece sin cambios: SQLite admite un escritor activo y hasta 50 entradas en espera. Una entrada adicional recibe 503 antes de llamar al callback o iniciar transacción. Una entrada que esperó más de 10 segundos recibe 503 al llegar al frente; tampoco comienza. No se aumentaron timeout, maxWait ni capacidad. La caducidad se comprueba al salir de la cola, no mediante cancelación de una transacción en curso.
Las transacciones usan timeout de 15 segundos; un fallo posterior al inicio no tiene el mismo contrato que un rechazo previo de cola. La interfaz debe consultar el estado antes de un nuevo intento si el resultado es incierto. No se convierte ningún 503 en 200 ni se reenvía automáticamente el check-in. La prueba de navegador existente verifica la consulta de estado sin un segundo POST.
Las operaciones de recepción, pagos, camisetas, cortesías e incidencias usan el mismo helper. Los callbacks utilizan el cliente tx; los controladores registran sus auditorías adicionales después de completar el servicio. No se identificó anidación de writeTransaction dentro de estos callbacks ni espera circular en el escenario revisado. No se afirma coordinación global de todos los módulos: invitaciones y otras operaciones administrativas conservan transacciones propias. La cola es por proceso, no un bloqueo entre réplicas.
PostgreSQL conserva transacciones serializables y respuesta 409 en conflictos P2034, sin retry del helper. La reserva de numeración tiene su mecanismo acotado preexistente para conflictos: no reenvía pagos ni asistencias.

## Cambios de esta revisión
1. Nueva suite write-transaction.test.ts: límite de 50 en espera, caducidad con reloj controlado, continuidad tras fallo y conflicto sin reintento. Los mocks demuestran que un rechazo de cola no abre transacción ni llama al trabajo. No usan dev.db ni Render.
2. Rondas 5/10/20 fortalecidas: reconcilian exactamente una asistencia, un pago de 100, una entrega e inventario por participante; auditorías SUCCESS/REJECTED; decisión administrativa y saldo/precio consistente; incidencias resueltas y dominios SSE. Se mantienen todas las aserciones previas. Promise.allSettled espera a todos los operadores antes de liberar sus clientes incluso si falla uno.
3. Métricas separan rechazos de negocio esperados, saturación y fallos inesperados. Los rechazos duplicados generan auditoría pero no una segunda asistencia/pago/entrega. Los JSON de docs son una medición local, no capacidad certificada.
4. Lockfile preexistente revisado: solo cambian los metadatos de los tres workspaces, se reemplazan enlaces barcamp-* por eventgrid-* y se agregan dependencias ya declaradas de correo/QR con transitivas. No cambia ninguna versión de paquetes previamente bloqueados. Coincide con los tres package.json; npm ci en carpeta temporal instala 441 paquetes sin regenerarlo. Se versiona exactamente su contenido anterior (SHA256 64f1df2f6076a6220a8ec4e15768f34578265950182842df2486de0ef1591701).
5. CI usa npm ci. La validación de ambos esquemas se ejecuta aun si falla una prueba, siempre que la instalación haya terminado y no se haya cancelado el workflow. No contiene despliegues, secretos de aplicación ni servicios persistentes.

## QA local
- Prueba afectada y nueva suite: 22/22 aprobadas.
- Suite completa: 82/82, seis suites, incluyendo 13 sesiones sobre HTTP/SSE real. Sin correos reales; proveedores simulados.
- Incluye cortesías remotas, rechazo/reutilización, roles, usuarios y desactivación, recuperación y tokens de un uso, tarifa explícita, pagos, incidencias, supervisión e integridad de inventario. Guard de Prisma rechaza bases que no sean fixtures eventgrid-* bajo el directorio temporal; dotenv está simulado. Suites antiguas no aisladas siguen en cuarentena.
- Responsive y demo/recovery 390/1440; recepción 320/390/412/844/1440 con resultado incierto reconciliado; cámara QR Chrome simulada liberada. No se probaron dispositivos físicos.
- Builds frontend y backend y esquemas SQLite/PostgreSQL se verifican antes de publicar. Ninguna migración real.

| Operadores | p95 flujo completo local (ms) | Duplicados rechazados/auditados | Saturación | Errores inesperados |
|---|---:|---:|---:|---:|
| 5 | 687 | 5 | 0 | 0 |
| 10 | 1232 | 10 | 0 | 0 |
| 20 | 2469 | 20 | 0 | 0 |

En la ronda HTTP separada de 20, p95 por petición 314 ms (140 peticiones), cero errores. No confundir estas mediciones con el tiempo del flujo completo. Las pruebas de límites provocan 503 intencionalmente y comprueban ausencia de ejecución; no forman parte de los errores de carga.

## Publicación y pendientes
Rama de corrección: codex/sqlite-ci-verification. El PR y SHA final se informan en la entrega junto con la ejecución real sobre Ubuntu. No declarar aprobada esta revisión hasta comprobar esa ejecución.
PostgreSQL: validación estática disponible; motor, carga y restauración reales siguen pendientes de infraestructura aislada. SQLite temporal no garantiza capacidad de producción; persistencia y backup verificado siguen siendo requisitos antes de actualizar Render.
Render permanece intencionalmente en 6688939, con autoDeploy desactivado. No desplegar, reiniciar, cambiar variables, activar SMTP ni modificar datos. Historiales, importes históricos, estilos, QR/PWA y reglas de cortesía no se modificaron en esta revisión.
