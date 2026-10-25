# Staff, usuarios, invitaciones y sincronización — 2026-10-24

## Implementación

- Encabezado: sustituye En vivo/Sincronizando por Santiago y hora de America/Santo_Domingo, 12 horas AM/PM; se actualiza cada 15 segundos, sin GPS. El SSE continúa en segundo plano.
- Staff: formulario con nombre, apellido, correo y teléfono opcional. Evento resuelto en servidor. Duplicados normalizados por edición y transacción serializable. Los campos históricos ocultos no se envían al actualizar y se conservan. No crea cuentas ni envía correos.
- Crear usuario: nombre completo, correo y rol. Cuenta pendiente/inactiva vinculada al contexto del servidor; no se genera contraseña temporal. La columna histórica passwordHash recibe un marcador inutilizable hasta la activación. Las cuentas pendientes no pueden activarse mediante el botón de estado ni con tokens antiguos.
- Administradores nuevos se vinculan a una edición y no reciben alcance global. Administradores globales históricos sin edición conservan su acceso. Usuarios, invitaciones y consultas de edición respetan el alcance; solo el administrador global puede crear/clonar ediciones. Se conservan controles internos de reasignación en la edición de cuentas.
- La tabla y tarjetas móviles tienen casillas y selección de todos los usuarios visibles de la página, con contador y alcance explícito. Cambiar página/filtros/edición limpia la selección. La confirmación lista destinatarios, correos, roles y estado; solo autoriza ese lote.
- Cuentas ya activadas se excluyen salvo reinvitación explícita. Un enlace vigente no se reenvía implícitamente. Reinvitación invalida enlaces anteriores sin cambiar la contraseña actual hasta el uso del enlace nuevo.
- PersonnelInvitations conserva la creación de varias cuentas, ahora sin envío: después se seleccionan en la lista general. El envío individual y múltiple comparte UserInvitationModal e InvitationsService del PR #5.
- Historial persistente por destinatario, fechas, vencimiento y resultado. Aceptación por proveedor no equivale a entrega; el webhook autenticado correlaciona messageId. Nunca se devuelven hashes/tokens al administrador.
- Idempotencia por lote, vínculo con actor y destinatarios, bloqueo transaccional de invitaciones simultáneas y aislamiento de fallos individuales. No hay reintentos ni consumidores automáticos. Con proveedor deshabilitado: pendiente, sin construir transporte ni intentar envío. La ruta heredada reset-password solo prepara una invitación, sin contraseñas ni flujo alternativo visible.

## Tiempo real

Se reutilizan RealtimeService, el endpoint SSE y RealtimeContext. Una conexión por sesión/edición. Notificaciones mínimas con dominio cambiado, identificador cuando aplica y timestamp; no se transmiten cuentas completas, correos, importes, contraseñas ni tokens. Los avisos administrativos de usuarios solo se envían a administradores.

Las mutaciones HTTP exitosas notifican después de finalizar la operación persistida; vistas previas y operaciones fallidas no generan avisos definitivos. La activación y el webhook notifican tras su transacción. Eventos anteriores de asistencia/pagos se conservan con payload mínimo.

Dashboard, Participantes, Asistencia, Ventas, Inventario, reservas de camisetas de Staff, Patrocinadores/categorías, Staff, Usuarios/historial de invitaciones, Cronograma, configuración/branding y estado de comunicaciones invalidan sus lecturas pertinentes. No se reenvían operaciones de escritura. Se agrupan ráfagas a 200 ms y se evita ejecutar lecturas solapadas por suscripción. Se sustituyen contadores optimistas por lecturas del backend.

Reconexión limitada a cinco intentos con espera creciente; recuperación al volver online o a primer plano. Una conexión recuperada solicita un snapshot actual, no depende de eventos perdidos. Se limpian timers y conexiones al desmontar/cambiar edición/sesión. Los cambios de acceso notifican a la sesión afectada y se vuelven a comprobar con /auth/me; un heartbeat valida cuenta, rol, edición y vencimiento. Una base inaccesible cierra los streams cuya autorización no puede comprobarse.

Las lecturas silenciosas conservan filtros, búsquedas, selección y formularios. Las fichas abiertas se actualizan; los borradores de formularios y configuración no se sustituyen por eventos externos. Respuestas antiguas no sobrescriben las nuevas en los listados principales.

Regresión encontrada con HTTP real: el filtro del cronograma excluía charlas sin categoría por SQL NULL. Se incluye category=null explícitamente, conservando la exclusión de demostraciones.

## Pruebas

- Frontend TypeScript/build y backend SQLite/PostgreSQL build. Sin cambios de esquema ni migraciones nuevas.
- 45 pruebas en cinco archivos de backend (incluye integración de once navegadores): permisos, QR, asistencia irreversible, concurrencia, entregas/inventario, Staff, usuarios, tokens de 24 horas/expiración/uso único, reinvitación, estados y ausencia de correo automático. Proveedores simulados.
- Prueba multiusuario con HTTP y SSE reales, base SQLite temporal aislada y once contextos Chrome independientes: operación de una cuenta actualiza vistas de otra, sin recarga. Asistencia, altas de participantes, pago, entrega posterior, patrocinador, Staff, alta/activación de cuenta, cronograma, reconexión tras perder un pago, aislamiento de ediciones, dos cuentas operadoras concurrentes, cambios de rol y branding.
- Casos UI a 320/390/412/844/1440 px: campos reducidos, teclado, casillas, selección visible, confirmación única, sin envíos al crear, cuentas activas requieren autorización y reloj independiente de la zona horaria del dispositivo.
- Regresiones de branding/errores, roles/demo, cámara simulada y PWA offline/actualización. No se simulan pruebas físicas de iPhone/Android ni se envían correos reales.

## Conservación y límites

Se conserva la modificación local previa de package-lock.json fuera de estos commits. No se modifican .env, contraseñas existentes, credenciales, SMTP, planes ni servicios de Render.

SSE utiliza memoria del proceso Node existente, sin Redis/WebSockets/servicios adicionales. Funciona en el despliegue de una instancia actual y es independiente del hosting. Para escalar a múltiples procesos/instancias se necesitará distribución de eventos entre procesos; no se afirma soporte de ese despliegue todavía. Las pruebas con once sesiones son funcionales, no un ensayo de carga o de resistencia prolongada.

Comprobación previa de Render: seis cuentas iniciales, tres ediciones sin Staff, participantes, asistencias, patrocinadores o charlas; colas e historiales de correo vacíos; paletas e inventario coinciden con los datos iniciales. SMTP deshabilitado.

Render continúa siendo demostración SQLite efímera. Antes de desplegar se verifican participantes/asistencias/patrocinios, Staff, usuarios no iniciales, cronograma e historiales/colas de correo. No se utiliza para datos reales ni se promete persistencia entre reinicios. Alojamiento definitivo persistente y prueba real de correo autorizado siguen pendientes; SMTP permanece deshabilitado.
