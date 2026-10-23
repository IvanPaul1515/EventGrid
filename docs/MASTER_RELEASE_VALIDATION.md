# EventGrid — validación de publicación, 2026-10-22

## Cambios

- QR: detiene y libera la cámara antes de presentar la validación; una confirmación explícita. El flujo manual mantiene su confirmación adicional.
- Asistencia irreversible también por API; confirmación requerida, protección transaccional contra registros y entregas duplicadas.
- Camisetas: entrega posterior predeterminada, entrega inmediata explícita; se conserva el inventario existente. Valores demo solo al crear una configuración demo nueva.
- SSE usa la URL del backend, reconexión limitada y consultas con protección contra respuestas antiguas. Contadores de confirmación de registro diferenciados de asistencia.
- Staff separado de patrocinadores y cuentas. Categorías y contabilidad de patrocinadores conservadas.
- Cuentas nuevas pendientes, sin contraseña visible; invitaciones individuales de 24 horas con hash, uso único, invalidación anterior y lote idempotente. Guardar y previsualizar no envía.
- Horarios nuevos vacíos; formato numérico editable, rangos, orden y conflictos validados. Edición conserva horarios.
- No se modificaron estilos globales ni se rediseñó escritorio.

## Correos: bloqueo de envíos involuntarios

El arranque ya no inicia consumidores de correo. Los métodos antiguos de polling, recuperación y notificación programada no procesan registros persistentes. Cada lote necesita una acción explícita; su autorización solo existe durante esa ejecución y no sobrevive a reinicios. Se conservan colas e historiales sin borrarlos. Las notificaciones programadas quedan retenidas y requieren una nueva acción explícita: no se reactivan por fecha, reinicio ni activación del proveedor. La publicación pública de charlas programadas sigue consultando publishAt.

La prueba de conexión verifica el transporte sin enviar un mensaje. Los estados distinguen aceptación del proveedor y entrega acreditada por webhook autenticado y correlacionado mediante messageId. Los timeouts de resultado ambiguo no se reintentan automáticamente. Errores Zod/configuración/autenticación/proveedor tienen mensajes diferenciados.

Se añadió un adaptador opcional a la API HTTPS de Brevo, reutilizando el transporte existente. No se habilitó. Como la API no documenta CID, el QR se conserva como PNG adjunto nombrado; no se promete imagen incrustada. No se enviaron correos reales.

## Diagnóstico y configuración externa pendiente

- Render: el backend existente utiliza plan free. Render documenta bloqueo de salida a puertos SMTP 25, 465 y 587: https://render.com/docs/free . Esa restricción explica la incompatibilidad de SMTP en ese entorno; no se probó enviando mensajes.
- Local: la causa exacta del timeout anterior no está confirmada. No se copiaron credenciales de producción ni se ejecutaron envíos/conexiones autenticadas reales. Los mocks verifican el manejo de errores, no la conectividad ni entregabilidad real.
- HTTPS requiere autorización/configuración futura del servidor: EMAIL_TRANSPORT=brevo_https y BREVO_API_KEY; proveedor explícitamente habilitado y usuario que pulse Enviar. Enlaces de activación usan FRONTEND_URL o el origen HTTPS autorizado en CORS.
- Webhook: BREVO_WEBHOOK_SECRET obligatorio, identificación exacta de mensaje. Sin webhook válido no se declara entregado.
- Antes de activar envíos: validar remitente/dominio y SPF, DKIM y DMARC según Brevo; revisar rebotes, bloqueos y supresiones en el proveedor. No se modificaron DNS, variables ni credenciales de Render.
- Referencia API: https://developers.brevo.com/reference/send-transac-email . Solo aceptación, no entrega garantizada.

## Validación realizada

- TypeScript y build frontend aprobados.
- Build backend aprobado con generación SQLite y PostgreSQL; ambos esquemas Prisma válidos. No se conectó una base PostgreSQL real ni se ejecutó migración destructiva.
- 38 pruebas backend en cinco archivos: autorización manual de correo, Brevo simulado, roles/patrocinios/QR/asistencia/inventario/staff/invitaciones/horarios, búsqueda y configuración de arranque.
- Regresión de navegador: 320, 390, 412, 844 y 1440 px; formularios, importes, teclado, selectores, permisos y accesos demo; staff e invitaciones con API simulada; QR y liberación de todos los tracks con cámara ficticia de Chrome.
- PWA: 74 recursos públicos, módulos diferidos, actualización del worker, login offline; API y uploads fuera de caché.
- Sin pruebas físicas en iPhone/Android, sin lectores USB físicos y sin envíos reales.

## Conservación y publicación

Cambios de esquema aditivos; no se eliminan tablas, participantes ni historiales. No se ejecutaron reset, clean, force-push, reposiciones automáticas ni importaciones reales.

Antes del despliegue se consultaron las tres ediciones existentes: cero participantes/asistencias/patrocinios/trabajos/historiales de correo, sin proveedor configurado y SMTP desactivado. El backend publicado es una demostración SQLite en almacenamiento efímero de Render, no PostgreSQL persistente. Un reinicio puede perder datos de esa demostración; no debe usarse para datos reales sin infraestructura persistente autorizada. El soporte de PostgreSQL del código se conserva.

package-lock.json tenía una modificación local independiente; se conserva sin incluirla en estos commits. No se modificaron archivos .env ni bases locales.
