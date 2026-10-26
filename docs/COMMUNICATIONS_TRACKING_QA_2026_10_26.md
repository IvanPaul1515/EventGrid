# EventGrid — comunicaciones y seguimiento por participante (26/10/2026)

## Base y alcance
Base: main 33b2edf, PR #12 y #13 integrados, sin divergencia ni cambios locales al iniciar. Se reutilizan CommunicationsService, plantillas, EmailLog, EmailBatchItem/Job, autorización de lotes, política DIGITAL_TICKET, auditoría, transporte y SSE. No se agregan tablas, proveedores, dependencias ni migraciones. No se cambian SMTP/Brevo ni credenciales.

## Cambios implementados
- Participantes: sobre accesible en acciones de tarjeta/tabla, con estado persistido y una sola consulta de badges por página. No se añade una columna. El clic no abre también la ficha; Enter/Espacio en controles internos ya no activa la navegación de la fila.
- Panel y ficha: historial paginado con nombre, registro, correo, última fecha de intento, intentos registrados, plantillas, asunto, responsable, estado, identificador y motivo seguro. Vacío es un resultado normal. «Ver comunicación» muestra metadatos guardados; no inventa una copia del HTML histórico, que EmailLog no almacena.
- Comunicaciones: inicio Resumen; pestaña Participantes con debounce y paginación SQL; plantillas oficiales del operador como tarjetas con acción contextual. Mis envíos mantiene su filtro personal. Las funciones administrativas de edición, campañas y revisión de lotes se conservan.
- Envío contextual: selecciona participante/plantilla autorizada, consulta los antecedentes de esa plantilla en backend, genera vista previa y muestra destinatario exacto, registro, asunto y estado del proveedor. No ofrece HTML/asunto editables al operador. Solo Confirmar envío llama al endpoint de envío; un lock inmediato impide doble clic. Un resultado incierto exige consulta de historial antes de un nuevo intento; la revisión administrativa y auditoría de reenvíos se reutilizan.
- Se rechaza un envío contextual si el correo cambió desde la vista previa. Los endpoints legacy conservan su contrato opcional, y el backend sigue revalidando permisos/proveedor/destinatario.
- Dashboard: bloque compacto, después de los KPIs existentes, con aceptados, pendientes, fallidos/inciertos y confirmados sin entrada digital. Sin gráficos grandes adicionales.
- Vista PC/iPhone compartida por el envío, la vista previa modal y el editor existente. PC aprovecha el ancho; móvil usa un marco de hasta 375 px, borde visible y scroll interno. El HTML generado y la vista previa contienen viewport y estilos fluidos para tablas, imágenes, QR, botones/enlaces y textos largos. El iframe usa sandbox sin permisos de scripts ni mismo origen; CSP bloquea scripts, formularios y recursos no autorizados. No equivale a certificar Apple Mail.

## Permisos y privacidad
Administrador: estadísticas/plantillas de la edición seleccionada y herramientas administrativas existentes. Operador: solo DIGITAL_TICKET; estadísticas y seguimiento de esa plantilla en su edición, incluidos antecedentes de otros responsables para evitar duplicados. Mis envíos conserva únicamente los iniciados por él. No puede editar plantillas, configurar SMTP, lanzar campañas, ni autorizar reintentos inciertos. Consulta no accede al módulo ni a su historial.
Las rutas tracking resuelven edición y validan pertenencia de cada inscripción; rechazan accesos cruzados. La ficha legacy limita sus metadatos iniciales a 20 elementos y a la capacidad del rol, oculta errores privados al operador y no devuelve historial de otras ediciones a cuentas con alcance limitado. Los errores mostrados se reducen a códigos conocidos como EAUTH; no se devuelven contraseñas/tokens ni el error crudo del transporte.

## Definiciones de estadísticas
- Fuente: proyección de solo lectura de EmailLog y los estados de EmailBatchItem no representados ya por su log. Se elimina el espejo de lote por messageId o lote/inscripción/estado.
- Registros no equivale a participantes ni a mensajes distintos. Intentos suma intentos persistidos (incluye simulaciones identificadas por separado); preparado/pendiente/cancelado sin intento no suman como transmisión. Los intentos históricos del lote ya representados en logs no vuelven a sumarse al mostrar un estado reencolado.
- Aceptados: SENT legacy, ACCEPTED_BY_SMTP, ACCEPTED_BY_PROVIDER y DELIVERED. Solo DELIVERED expresa confirmación del proveedor al servidor destinatario; no garantiza lectura ni bandeja principal.
- Simulados se muestran por separado y nunca cuentan como aceptación ni contacto real. Participantes únicos contactados usa participantId distinto, independientemente del número de intentos; no es el número de direcciones ni de envíos.
- Pendientes de entrada digital: inscritos CONFIRMED, no demo, con formato básico de correo válido y sin DIGITAL_TICKET aceptada. Los confirmados con dirección inválida se cuentan como exclusiones. No se marca a todos los participantes como pendientes.
- Estados distinguen preparado, pendiente/aplazado, procesamiento, aceptado, entregado confirmado, fallido/bloqueado/rechazado, incierto, simulado y cancelado.
- Gráficos: últimos 30 días UTC con actividad, distribución de estados, registros por plantilla y evolución temporal. No se descargan todos los participantes ni todos los mensajes al navegador.
- SSE invalida el resumen, el listado, badges e historial sin perder filtros/selección. Se emite tras envíos explícitos, fragmentos de lotes autorizados y actualizaciones verificadas por webhook. No inicia ni reanuda tareas.

## QA
- 93 pruebas aisladas aprobadas, incluyendo las 11 nuevas de seguimiento, la suite de correo manual y 13 sesiones de navegador sobre HTTP/SSE real. Proveedores simulados; bases temporales protegidas por safety-guard. No se ejecutaron envíos reales.
- Nuevos casos: vacío/paginación/búsqueda por apellidos, correo, documento y registro; espejos de lotes; estados; simulaciones; reencolado sin doble conteo; privacidad; badges; operador DIGITAL_TICKET; plantilla no autorizada; preview QR; bloqueo de HTML/edición/campañas/reenvío incierto; destinatario cambiado; invalidación SSE tras simulación explícita.
- Chrome con API simulada: administrador/operador a 320, 390 y 1440 px; resumen, búsqueda, historial y detalles, antecedente anterior, selección oficial, PC/móvil, HTML largo con tabla ancha/QR/enlace/botón, scripts bloqueados, un único envío explícito simulado y sobre de Participantes. También se comprueba el selector controlado del editor original.
- Regresiones: alta manual/cortesías y pantallas de branding/errores, sesiones, temas y recuperación. No se probaron equipos físicos iPhone/Android.
- Builds frontend/backend, TypeScript y validación SQLite/PostgreSQL aprobados. Cliente PostgreSQL generado y backend compilado, sin conexión a un motor PostgreSQL. El SQL de seguimiento se ejecutó contra SQLite aislada; ejecución real PostgreSQL sigue pendiente.
- PWA sobre el build final aprobada: 77 recursos públicos, módulos lazy precargados, API/uploads excluidos de caché, actualización controlada y shell/login offline. GitHub Actions debe aprobar el head del PR antes de integrar.

## Render y publicación segura
Ambos servicios partían de 33b2edf, con autoDeploy desactivado. Preflight leído sin envíos: tres ediciones sin participantes ni asistencias, 282 camisetas iniciales sin movimientos en 2026, 6 cuentas iniciales, SMTP desactivado y cero logs/trabajos de correo. Los registros sintéticos de la publicación anterior ya no estaban presentes antes de esta tarea; SQLite continúa siendo efímera.
Antes de desplegar se volverá a comprobar y respaldar la configuración visible. Si aparece información que no puede conservarse, se detiene el backend y también el frontend dependiente. No se asume autorización para perder datos ni se crean servicios/planes.
PR, SHA de integración, ejecución CI y resultado real del despliegue se entregan al finalizar y quedan identificados en el historial Git/Render. Las evidencias y snapshots externos no se versionan. No se realizarán pruebas de envío contra destinatarios reales ni se habilitará el proveedor.

## Límites
No hay HTML histórico completo donde el modelo no lo persiste; la vista de detalles es explícita al respecto. La lista ampliable de plantillas para operadores sigue como diseño futuro: esta intervención no concede otras capacidades. Con proveedor desactivado, el envío real está bloqueado; cambiarlo no ejecuta históricos. La persistencia SQLite, restauración PostgreSQL, pruebas físicas y renderizado idéntico en clientes de correo reales siguen fuera de lo comprobado.
