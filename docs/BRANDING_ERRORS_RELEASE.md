# Branding, carga y errores — 2026-10-24

## Alcance

Se conservan arquitectura, diseño general, formularios, permisos/API, accesos demo y PWA. No hay cambios de backend, esquema, datos, SMTP ni credenciales. La modificación local previa de package-lock.json queda fuera de los commits y se conserva.

Archivos principales: LoginPage, AppLoadingScreen, ErrorPanel, ErrorBoundary, ProtectedRoute, AuthContext, EditionContext, ThemeContext, ConnectionBanner, services/api, App, Layout, DashboardPage, ParticipantsPage y CommunicationsPage.

Login: «Gestión de Eventos y Accesos», copyright dinámico independiente de la edición y «Desarrollado por Iván Marcelino» debajo del copyright. Se conserva el logo y encabezado visual del evento. Accesos demo intactos.

Carga: EVENTGRID sin año unido; edición contextual solo si está disponible. Icono neutro y variables CSS existentes. Cargas locales continúan siendo locales. A los 8 segundos se indica demora; solicitudes Axios vencen a los 30 segundos y el fallback de módulos a los 35. Reintento manual, sin bucles ni reenvío automático de escrituras.

Errores: 404 para rutas desconocidas, 403 por permisos, 401 con acción explícita de login, 500 y 502/503, red inaccesible, timeout y offline. Error Boundary de sección y exterior para fallos de renderizado; detalles solo en consola de desarrollo. Respuestas HTTP 5xx no exponen mensajes internos. Errores 400/422 siguen en formularios, sin navegación global. Los formularios conservan sus valores durante fallos recuperables; una sesión vencida retira contenido protegido y exige autenticarse, sin guardar contraseñas ni borradores sensibles.

Auth ya no elimina credenciales por un fallo de red: exige validar la sesión antes de mostrar contenido, permite reintento manual y borra el token cuando hay 401 real. Las cancelaciones de solicitudes no se presentan como fallos de red. Ediciones: error recuperable, control de respuestas antiguas y estado sin ediciones sin skeleton infinito.

Tema: se reutilizan tokens CSS. Login, carga y errores funcionan sin configuración remota; con edición disponible usan su paleta. Antes de autenticarse puede no existir una edición disponible: se usa el tema predeterminado. El contraste del texto de botones primarios se calcula sobre el color configurado. Sin cambios de estilos globales ni otro motor de tema.

Sin conexión: indicador explícito y reintento de conectividad, sin modo offline de check-in. Nunca se repiten automáticamente check-ins ni envíos de correo. Un timeout de escritura no demuestra si el servidor alcanzó a procesarla: consultar estado antes de confirmar otro intento.

## QA

Build frontend incluye TypeScript. Build backend y 38 pruebas existentes con mocks/base aislada. Navegador Chrome con tamaños móviles/escritorio; escenarios controlados de login, 404, 403, 401, 5xx, desconexión, timeout, reintento de sesión/edición y Error Boundary. Regresiones existentes de roles, QR/cámara simulada, inventario, staff/invitaciones y PWA. Ningún correo real ni datos reales modificados. No se afirma prueba física en iPhone/Android ni instalación nativa real de PWA.

## Pendientes de la siguiente fase (no implementados aquí)

1. Simplificar tipo de entrada/tarifa/cortesía: formulario actual conserva los tres conceptos.
2. Cambiar predeterminado de camisetas a «Entregar ahora»: actualmente sigue «Entregar más tarde», según la publicación anterior. Esta nueva preferencia queda pendiente deliberadamente.
3. Auditar todas las rutas indirectas de modificación de asistencia: el endpoint de reversión está bloqueado y el check-in transaccional tiene pruebas; no se declara completa una auditoría de todas las rutas de escritura/importación.
4. Envío real por proveedor autorizado: SMTP continúa desactivado; adaptador HTTPS de Brevo probado con mocks. Falta configuración autorizada y prueba real.
5. Alojamiento definitivo persistente: la demostración Render usa SQLite efímero; no es alojamiento de datos reales. No se migra infraestructura en esta intervención.

## Requisitos de alojamiento definitivo

- Node.js compatible con el proyecto (validar Node 22 o superior en el servidor destino), npm y build TypeScript/Vite; frontend estático y backend Node separados o proxy /api.
- PostgreSQL persistente recomendado, DATABASE_URL, cliente Prisma generado para el proveedor y estrategia de migraciones revisada sin pérdida de datos. No usar SQLite efímero para registros reales.
- HTTPS y certificado, proxy inverso compatible con Express y SSE (sin buffering del stream), CORS y VITE_API_URL adecuados al dominio elegido.
- Variables seguras JWT, cifrado de secretos, CORS_ORIGIN, FRONTEND_URL; separar demostración de producción y deshabilitar accesos demo en instalaciones reales.
- Gestión de procesos, arranque/reinicio supervisado, logs y health check; no iniciar consumidores automáticos de correo.
- Persistencia de archivos subidos, backups de base y archivos con restauración comprobada.
- Salida HTTPS al proveedor de correo o SMTP permitido; remitente verificado, SPF/DKIM/DMARC y webhook autenticado. Activación y envíos requieren autorización explícita.
- Verificar primero las capacidades del servidor y DNS. eventgrid.barcamp.org.do es una posibilidad, no un dominio configurado o verificado.

## Publicación segura

Esta intervención solo cambia frontend y documentación. Se publica el frontend en el servicio existente. El backend mantiene su código idéntico a b73dea9 y se comprueba operativo; no se fuerza un reinicio innecesario de SQLite efímero ni se ejecuta inicialización/migración de base. Los commits de despliegue pueden diferir sin diferencias de código backend. SMTP y credenciales permanecen intactos.
