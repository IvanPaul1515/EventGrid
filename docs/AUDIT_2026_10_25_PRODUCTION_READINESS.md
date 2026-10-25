# EventGrid: recepción, seguridad y preparación de producción

Fecha: 25 de octubre de 2026. Base auditada: fcf06f2 (PR #8). git fetch confirmó que origin/main coincidía con el directorio local. Se revisaron las implementaciones y documentos de los PR #5, #6, #7 y #8; la modificación preexistente del package-lock se mantiene fuera de esta intervención.

## Resumen y alcance

Revisión focalizada del código de autenticación, formularios, recepción, inventario, escrituras de asistencia, importaciones, SSE y comunicaciones, con regresiones de módulos relacionados. No es una certificación de seguridad, una auditoría de infraestructura externa ni una prueba física de dispositivos. No se modifican datos reales, secretos, proveedores ni esquemas.

## Matriz de requisitos

| Área | Estado inicial | Resultado de esta intervención |
|---|---|---|
| Sesión y errores | Recuperación implementada, 401 destacado; fallos DB clasificados como token inválido | Presentación normal de sesión finalizada; expiración temporizada; DB 500 separado de 401 |
| Registro/tarifa | Doble entrada de tarifa y precio fijo 1750 | Un selector incluye cortesía; precio consultivo de edición; pago inicial cero; historial no se sobreescribe |
| Camisetas | Manual inicialmente false con efecto que sobreescribe; QR pendiente | Entrega inmediata con talla disponible; preferencia pendiente estable; stock desconocido no autoriza entrega |
| Asistencia definitiva | Endpoint directo protegido; edición e importación permitían marcado indirecto | Escrituras administrativas/importadas rechazadas; bajas de asistidos protegidas; timestamps/responsable conservados |
| SSE | Compartido por sesión, con reconexión y aislamiento existentes | Reutilizado; pruebas de diagnósticos, cuentas inactivas y tokens vencidos; no nueva infraestructura |
| Correos/invitaciones | Autorización explícita, idempotencia y tokens existentes | Conservados; errores seguros, estados inciertos consistentes, lotes interrumpidos visibles, revisión administrativa explícita que clasifica intentos previos como inciertos sin enviar ni reanudar |
| Perfiles de correo | Una configuración efectiva por edición y transporte opcional | Diseño de migración separado; sin perfiles nuevos ni credenciales activadas |
| Carga | Once sesiones funcionales anteriores | Ondas HTTP reales de 5/10/20 operadores en SQLite aislada; informe JSON de latencias, errores y memoria |
| Roles | Tres roles y capacidades distribuidas en rutas | Conservados; límites de acciones sensibles y cierre de accesos QR/plantillas por ID fuera de edición |
| Hosting definitivo | Render temporal, SQLite efímera | Estrategia PostgreSQL, archivos persistentes, backups, restauración y múltiples procesos documentada |

## Hallazgos y evidencia

| Gravedad | Hallazgo comprobado | Evidencia y corrección |
|---|---|---|
| Alta | Edición admitía status ATTENDED y escribía attended/attendedAt sin check-in; importación aceptaba asistidos | participants.dto/service e import.service; prueba administrativa/importada y conservación de evidencia. Solo check-in puede generar asistencia real |
| Alta | Administrador limitado omitía validación por ID y podía obtener QR ajeno; escaneo devolvía datos de otra edición | qr.routes/controller y prueba scoped-admin; ahora se valida edición y se oculta registro extranjero |
| Alta | Plantilla por ID no comprobaba alcance del administrador de edición | communications.controller; impide editar plantilla ajena o global desde cuenta limitada |
| Media | Pago e inscripción se escribían en pasos separados; los totales de abonos se calculaban antes de su transacción | create/update/onsiteSale/recordPayment ahora atómicos y serializables; comparación de total persistido con suma contable y pagos concurrentes |
| Media | Borrar un asistido permitía perder historial y volver a registrarlo | Baja individual condicional y borrados masivos serializables rechazan asistidos. Las limpiezas explícitas de datos sintéticos demo siguen separadas |
| Media | SQLite bajo 20 operadores agotaba apertura de transacciones; después se detectaron pérdidas de auditoría por bloqueo | writeTransaction acota escritores SQLite de recepción y auditoría: máximo 50 pendientes, operación no iniciada tras 10 s se rechaza, sin reintentos ciegos. PostgreSQL conserva concurrencia serializable |
| Media | Error DB se convertía en 401 en authenticateToken | Solo errores JWT causan sesión inválida; prueba de caída DB devuelve 500, sin borrar credenciales válidas |
| Media | Una respuesta antigua de /auth/me podía restaurar usuario tras cerrar sesión | refreshSession comprueba que sigue siendo el mismo token antes de actualizar estado |
| Media | Desconexión tras check-in podía mostrarse como fallo y permitir reintento sin lectura | attendance.service reconcilia con GET; recuerda resultado incierto y vuelve a consultar antes de otro POST; prueba de respuesta perdida sin segundo envío |
| Media | Error de transporte incierto no era consistente entre invitación, correo individual e historial del lote | Clasificación conservadora compartida; UNKNOWN no se confunde con FAILED; errores DNS/TLS/autenticación/cuota tienen mensajes sin datos internos |
| Baja | Formulario/efectos: 1750 fijo, pagos inventados, decisión de entrega sobrescrita y ATTENDED editable | Formulario de tarifa efectiva, pago cero, opción cortesía única; entrega inicial por participante sin efecto que cambie la decisión manual |
| Baja | Etiquetas afirmaban aceptación por Brevo aun usando SMTP y entrega al buzón | Proveedor genérico y entrega confirmada al servidor destinatario; no promete lectura ni bandeja principal |

## Inventario de escrituras de asistencia

- attendance.service.checkIn: actualización condicional attended=false, stock y evidencia en una transacción. Reversión directa rechazada.
- participants.create/update/onsiteSale: no escriben asistencia; DTO y servicio impiden ATTENDED administrativo.
- import.validateRows/execute: fila asistida inválida y guardia previa a cualquier actualización; no se cambia evidencia en importaciones UPDATE.
- events.service: lecturas/reportes, sin una escritura adicional de check-in.
- qr.service: valida/regenera credenciales; no registra asistencia por escanear.
- demo.service y generadores demo: datos sintéticos explícitos, administrativos y segregados; no son una ruta de asistencia real.
- Bajas individuales/importadas/purga: no se permite eliminar inscripciones asistidas para volver a registrarlas.
- Cambios de estado, pagos, cortesías y camisetas no reinician attendedAt ni attendedByUserId.

## Pruebas y resultados

Resultados: 67 pruebas aprobadas en seis archivos de backend con base temporal y mocks; once contextos Chrome con HTTP/SSE reales, sin recarga, aislamiento y reconexión. Compilaciones frontend/TypeScript y backend SQLite/PostgreSQL aprobadas (PostgreSQL solo compilación, sin servidor real). Regresiones de tarifas/cortesías, entrega predeterminada y pendiente estable, respuesta de check-in perdida sin segundo POST, sesión sin 401 visible, light/dark y temas, roles/demo, Staff/usuarios/invitaciones, QR/cámara simulada y PWA aprobadas. Navegador a 320/390/412/844/1440 px.

No se ejecutan indiscriminadamente las suites antiguas: algunas cargan backend/.env y dev.db; qa_ticket_email busca un registro real y otras suites realizan limpiezas. Solo se ejecutaron las suites expresamente aisladas/mocks. Aislar todas las pruebas heredadas es trabajo pendiente antes de habilitar CI general. RECEPTION_LOAD_RESULTS.json contiene la última ejecución reproducible local, no una promesa de capacidad del servidor definitivo. Registros exclusivamente @example.invalid y SQLite temporal aislada; proveedores simulados.



| Operadores | Solicitudes | p50 ms | p95 ms | Máximo ms | Errores HTTP | Delta RSS MiB |
|---|---|---|---|---|---|---|
| 5 | 35 | 30 | 130 | 199 | 0 | 16.8 |
| 10 | 70 | 56 | 162 | 182 | 0 | 5.3 |
| 20 | 140 | 84 | 389 | 552 | 0 | 12.2 |

La última ejecución no mostró avisos de auditoría. Se verificó que sumas contables y entregas de inventario coinciden con los registros persistidos.

No se probaron iPhone/Android físicos ni entrega SMTP real. El estado de proveedor apagado se comprueba por lectura en Render antes y después de la publicación.

## Varios procesos SSE

La instancia actual conserva conexiones en memoria. Para varias instancias, usar una interfaz de publicación/suscripción que mantenga el mismo contrato DATA_CHANGED mínimo. PostgreSQL persistente permite una bandeja outbox transaccional y NOTIFY como señal; cada proceso consulta eventos autorizados, invalida consultas y recupera snapshot al reconectar. La autorización se vuelve a comprobar por conexión; no se transmiten nombres, importes ni secretos en el bus. Identificadores/versiones permiten deduplicación. Los procesos deben compartir ese bus antes de habilitar balanceo. No se añade Redis ni se afirma soporte multi-instancia actualmente.

## Perfiles múltiples de correo (diseño; activación diferida)

La estructura actual EmailConfig, con unicidad por edición/configuración global, requiere una migración aditiva para más de un perfil. No se introduce un segundo sistema ni una migración apresurada.

Modelo propuesto: MailProfile(id, eventId opcional, nombre, tipo SMTP/HTTPS, host/puerto/TLS, remitente/reply-to, referencia a secreto cifrado, habilitado=false, usos permitidos, límites); MailProfileUse(profileId, uso, prioridad explícita) con una selección efectiva por edición/uso. Usos: ACCESS_INVITATION, ACCESS_RECOVERY, DIGITAL_TICKET, INDIVIDUAL_CONFIRMATION, CAMPAIGN. El administrador global autoriza expresamente la herencia de un perfil global; nunca heredar otra edición.

Migración: crear perfiles deshabilitados a partir de configuraciones existentes sin descifrar/regrabar secretos; mapear un perfil legado predeterminado; mantener lectura compatible; agregar profileId/messageId/operationId al historial; comprobar integridad y rollback antes de activar. La interfaz de transporte existente sigue siendo la única que entrega mensajes.

La selección se fija en la operación confirmada. Un timeout, reset o aceptación desconocida NO provoca failover. Cambiar de proveedor exige nueva confirmación, advertencia de duplicado y auditoría. Límites por perfil/edición y operación idempotente; sin colas históricas reactivadas al habilitar un perfil.

## Hosting definitivo y persistencia

Requisitos iniciales propuestos, pendientes de ensayo en infraestructura real: Node.js 24 (familia del runtime local probado); PostgreSQL persistente compatible con Prisma 6; comenzar la evaluación con 2 vCPU/2 GiB para backend, medir antes de dimensionar. Esa cifra no es capacidad validada. La compilación frontend puede ejecutarse fuera del servidor.

HTTPS obligatorio para autenticación, PWA y cámara; proxy inverso que preserve SSE, no almacene respuestas API, desactive buffering en streams y soporte conexiones prolongadas. Compilar frontend con VITE_API_URL apropiado. Proceso Node gestionado por systemd/PM2 en una sola instancia mientras SSE siga local; cierre SIGTERM y observabilidad. Volumen persistente de archivos/uploads y backups, fuera del directorio de build.

Variables: NODE_ENV, PORT, DATABASE_URL, JWT_SECRET, COOKIE_SECRET, CORS_ORIGIN, VITE_API_URL, origen frontend usado en enlaces y llave de cifrado existente. Secretos fuera de Git, permisos mínimos, rotación planificada. SMTP/API de salida únicamente habilitada tras autorización, remitentes verificados y prueba controlada.

Migración: inventario/backup íntegro SQLite y archivos, comprobar relaciones y conteos, migrar a PostgreSQL de ensayo con columnas/estados compatibles, verificar hashes/QR/evidencia/pagos/stock, restaurar un backup en otra base y comprobarlo, ensayo de rollback y ventana de corte. Nunca ejecutar db push destructivo contra datos reales. Gestionar migraciones explícitas verificadas, backups diarios y política RPO/RTO aprobada.

No se supone que eventgrid.barcamp.org.do esté configurado ni que su servidor admita Node.js. No se migra al destino definitivo en esta intervención.

## Capacidades y auditoría

Se conservan ADMIN, OPERATOR y VIEWER. Las rutas backend aplican autorización; el menú no la sustituye. ADMIN administra usuarios/Staff/configuración/campañas; OPERATOR registra participantes/pagos/asistencia/entregas y solo DIGITAL_TICKET individual; VIEWER conserva lecturas existentes y no puede mutar. El futuro editor de roles debe mapear acciones explícitas, no conceder capacidades por navegación. El alcance de edición se aplica independientemente del rol.

Auditoría de check-in, pagos, registros/cortesías, cambios de rol, invitaciones, envíos y configuración: conservar identificador de operación, actor y cambios, sin contraseñas ni tokens. La captura de código QR en auditoría se reemplaza por longitud del dato. La auditoría genérica sigue siendo best-effort ante indisponibilidad de DB; para producción estricta, consolidar todas las evidencias en la misma transacción/outbox del cambio.

## Riesgos y límites pendientes

- SQLite Render sigue siendo efímera y de demostración. No utilizar datos reales; la serialización es mitigación local, no reemplaza PostgreSQL persistente ni coordina varios procesos.
- Las ondas de 5/10/20 son ensayos breves; faltan resistencia prolongada, ensayo PostgreSQL real, pruebas de red física y capacidad de hosting definitivo.
- Perfiles múltiples, recuperación de acceso dedicada y editor de roles quedan para migración/implementación independiente.
- No se afirma una auditoría exhaustiva de dependencias/infraestructura ni ausencia absoluta de vulnerabilidades.
- La auditoría genérica no garantiza persistencia si toda la base falla. No se añade un servicio externo para ocultar ese límite.
- Publicación condicionada a preflight sin datos que deban conservarse. La autorización anterior para descartar un colaborador de prueba no se aplica a registros nuevos.

## Archivos y estado de publicación

Backend: auth/rateLimiter/audit; participants DTO/servicio; import; attendance/inventory; QR; comunicaciones/cola/invitaciones; utils writeTransaction y mailFailure. Frontend: AuthContext, ErrorPanel/appError, ParticipantFormModal, confirmación manual/QR, attendance.service, estados y lotes de correo. Pruebas: roles_sponsors_qr, branding-errors, functional y reception-audit-regression.

PR #9 fusionado: https://github.com/IvanPaul1515/EventGrid/pull/9. Commit de código integrado y desplegado: 80db9fb7fa41ec649f7b1e57f869a4c5ff8a248e.

- Backend eventgrid-demo-api: deploy dep-dbf94qtg1s2s73eu7mlg, estado live, commit 80db9fb.
- Frontend eventgrid-preview: deploy dep-dbf95qnavr4c73d96bk0, estado live, commit 80db9fb.
- Aplicación: https://eventgrid-preview.onrender.com.
- Verificación publicada: login y tres accesos demo, 403/404, recuperación de conectividad, formularios sin pago predeterminado, cortesía a cero, eliminación de ATTENDED administrativo, sesión finalizada mediante 401 simulado sin número visible y nuevo login seguro, Personal/accesos y permisos de comunicaciones a 390/1440 px.
- QR con cámara Chrome simulada: viewport cuadrado, modos separados y tracks liberados. PWA con 74 recursos públicos, shell offline y API/uploads fuera de caché. Backend healthy y base conectada; SSE operativo.
- Logs recientes de backend sin errores. SMTP deshabilitado en las tres ediciones, sin trabajos ni historial de envío. No se activan proveedores ni se modifican variables o secretos.
- Contadores de participantes/asistencia/patrocinadores permanecen en cero. Se conservan seis cuentas iniciales, paletas e inventario inicial; sin cuentas adicionales, colaboradores o cronogramas.
- Las tres ediciones publicadas tienen ticketTypes vacío: no se inventan ni se crean precios oficiales. Para registrar entradas pagadas se necesita configurar una tarifa de la edición. La tarifa efectiva y pagos exacto/parcial/superior se prueban en datos aislados, no escribiendo catálogos en Render.
- El directorio local y origin/main contienen el código integrado. La modificación previa de package-lock sigue pendiente y conservada. Esta actualización de cierre modifica solo el informe; no se reinician servicios por documentación, y el código ejecutable coincide con 80db9fb.

Antes de próximos despliegues con información que deba conservarse, capturar también todos los catálogos y configuraciones de cada edición (tarifas, métodos, responsables y campos personalizados), además de participantes, pagos, existencias y comunicaciones. No basta comprobar conteos operativos.

Como revisión adicional pendiente, verificar round-trip de fechas de compra entre UTC y hora local al editar formularios; no se ha demostrado ni corregido ese escenario en esta ejecución.
