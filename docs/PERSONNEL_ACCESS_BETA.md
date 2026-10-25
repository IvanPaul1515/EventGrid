# Beta: Personal, accesos y comunicaciones

## Implementado

- Tabla de colaboradores: nombre, correo, teléfono y acciones; tarjetas móviles equivalentes. Se conservan función, área, observaciones y estado histórico.
- Cuatro campos en el formulario; teléfono con libphonenumber-js/max, formato incremental nacional e internacional, borrado/cursor y validación. Nuevos números válidos se guardan E.164; números históricos sin editar no se reescriben.
- Navegación «Personal y accesos» con Colaboradores y Usuarios. Rutas /staff y /users conservadas, Usuarios sigue exclusivo de Administrador.
- Crear acceso desde el colaborador: solo solicita rol, cuenta pendiente sin contraseña temporal, edición interna y relación atómica. La cuenta existente requiere confirmación, edición e identidad coincidentes; no se cambia su rol. Duplicados, otra identidad/edición y vinculación repetida se rechazan.
- Usuarios muestra la relación y abre Colaboradores en la edición correspondiente. No hay borrado automático entre entidades.
- Invitación desde la relación reutiliza la selección/confirmación/historial/idempotencia ya existentes. Crear/vincular no envía correos.
- Operador: estado SMTP sin configuración/credenciales, catálogo limitado a DIGITAL_TICKET, vista previa y envío individual sin personalizar asunto/contenido. Política centralizada en operator-policy.ts, extensible para roles futuros.
- Historial del Operador filtrado por usuario emisor y plantilla autorizada en servidor; no consulta campañas ajenas. Configuración, pruebas, edición de plantillas, estadísticas administrativas, validación masiva, lotes y reintentos siguen exclusivos de Administrador.
- Causa del 403: el módulo solicitaba /communications/config, reservado a ADMIN. Ahora utiliza /status para Operador. Un 403 real sustituye la página y no genera banner de conectividad duplicado; ErrorPanel no ofrece reintento en 403.
- Encabezado sin badge de estado ni punto animado; logo y selector autorizado conservados; reloj Santo Domingo intacto. Sidebar sin tarjeta «Edición en Gestión», footer EventGrid discreto.

## Validación

- Backend SQLite y PostgreSQL: generación Prisma y TypeScript; sin conexión PostgreSQL real, cambios de esquema ni migraciones.
- 50 pruebas backend en cinco archivos: permisos, correos manuales, transportes simulados, QR, duplicados, relaciones de personal, teléfonos y aislamiento entre ediciones.
- Integración con once contextos Chrome independientes, HTTP y SSE reales, SQLite temporal aislada: asistencia, pagos, inventario, participantes, personal, usuarios/activación, cronograma, branding, permisos y recuperación tras desconexión sin recarga.
- personnel-beta-regression.cjs: 320/390/844/1440 px, teléfonos nacionales/internacionales, borrado, validación/E.164, vinculación e invitación explícitas, operador sin configuración ni campañas y 403 exclusivo sin contenido debajo.
- Regresiones Staff/Usuarios a 320/390/412/844/1440; móvil/teclado/importe, roles/demo, branding/errores, cámara simulada QR y PWA: aprobadas.
- No se prueban dispositivos físicos ni se envían correos reales. Pruebas de escritura únicamente con mocks o base temporal; Render se inspecciona mediante lecturas.

## Conservación y publicación

No se modifican .env, credenciales, proveedores de correo ni variables Render. La modificación previa del package-lock se conserva fuera del commit; solo se integra la dependencia de telefonía de esta beta.

La comprobación previa de Render detectó seis cuentas iniciales, sin cuentas adicionales, pero **un colaborador guardado**. SQLite es efímera en el servicio gratuito existente; un redeploy del backend puede perder ese registro. El usuario confirmó que ese colaborador es un registro de prueba descartable y autorizó expresamente el despliegue aunque se pierda. No se elimina mediante operaciones manuales. Continúa pendiente el alojamiento persistente para datos reales. SMTP continúa deshabilitado, sin trabajos ni historial.

## Pendientes

- Base persistente y alojamiento definitivo; SSE entre múltiples procesos/instancias.
- Prueba real de entrega mediante proveedor expresamente autorizado.
- Roles personalizados: la política actual permite únicamente DIGITAL_TICKET al Operador.
- Pendientes funcionales anteriores (registro simplificado, entrega de camisetas predeterminada y auditoría completa de rutas de asistencia) no se amplían en esta beta.
