# Estabilización local de EventGrid — 22 de octubre de 2026

Durante la estabilización inicial se conservaron los 15 archivos modificados y los 12 nuevos del estado inicial. No se reemplazó el proyecto ni se descartaron cambios. En esa fase no hubo commits, pull, push, merge, deploy, migraciones ni modificaciones de datos reales. La preparación posterior para GitHub se documenta al final. No se cambió la identidad Git ni se añadieron firmas o coautores. SMTP y la configuración de alojamiento permanecen sin cambios; no se enviaron correos.

## Correcciones realizadas

- TypeScript: las dos referencias inexistentes a `handleResetFilters` usan `clearFilters`; el registro PWA utiliza `import.meta.env.PROD`.
- QR: operaciones de cámara serializadas, generaciones para cancelar operaciones obsoletas, control del estado real de la biblioteca y cierre antes de desmontar el visor. Se atiende también el intervalo entre la creación del stream y el primer frame. Se mantiene el visor cuadrado y los modos separados.
- QR: bloqueo inmediato de validaciones y check-ins concurrentes; resultados de solicitudes anteriores no reemplazan una sesión nueva. Se puede continuar después de un código inválido. La talla se inicializa desde el participante leído.
- PWA: registro exclusivo en producción; actualización espera `controllerchange` antes de recargar. También se detectan workers que ya estaban esperando cuando aparece el banner.
- PWA: cada build genera una versión de caché a partir del HTML, módulos, worker y recursos públicos. Se precargan todos los módulos diferidos. Si falta un recurso obligatorio, la instalación falla y se conserva el worker anterior.
- PWA: lista explícita de archivos públicos y rutas SPA; API, métodos de escritura, peticiones con Authorization, recursos externos y uploads quedan fuera del almacenamiento del worker. Solo se limpian cachés con el prefijo propio de EventGrid.
- Cabecera: se eliminaron las variantes `xs:` sin configurar, se permite leer el nombre completo y se añade el año si el nombre no lo incluye. El desplegable adapta su ancho en móvil.
- Móviles: campos de texto, selectores y áreas de texto con 16 px sin bloquear el zoom manual. Las reglas móviles también contemplan dispositivos táctiles en horizontal hasta 1023 px.
- Móviles: altura disponible mediante `visualViewport`, respetando el zoom manual; scroll y áreas seguras en formularios, confirmaciones, paneles laterales y modales del cronograma. Las reglas de escritorio de tipografía y distribución se conservan.
- Importes: componente reutilizable con borrador editable, sin reinsertar cero al borrar. `01750` se normaliza a `1750`, y al salir se muestra `1,750.00`, con moneda indicada por el contexto. Los resúmenes relacionados muestran separadores y dos decimales.
- Búsqueda: normalización de tildes, mayúsculas y espacios; coincidencia de palabras de nombres y apellidos en distinto orden. Aplicada a participantes, asistencia y sus exportaciones, conservando las búsquedas existentes de documentos, teléfonos y tickets.
- Banner: una petición fallida desactiva el indicador de servidor lento.
- Patrocinios: orden estable de hooks en los formularios intervenidos y reinicio del formulario de pago al abrir otro patrocinador.
- Se conserva la apertura de fichas desde cualquier parte de la fila o tarjeta; su lógica no se reconstruyó.

## Archivos intervenidos en esta tarea

Rutas relativas a la raíz del proyecto:

| Área | Archivos |
|---|---|
| Búsqueda backend | `backend/src/modules/participants/participants.service.ts`, `backend/src/modules/attendance/attendance.service.ts`, nuevo `backend/src/utils/participantSearch.ts` |
| Entrada y PWA | `frontend/index.html`, `frontend/src/App.tsx`, `frontend/src/serviceWorkerRegistration.ts`, `frontend/public/sw.js`, `frontend/vite.config.ts` |
| Marco y conexión | `frontend/src/components/common/Header.tsx`, `Layout.tsx`, `ConnectionBanner.tsx`, nuevo `CurrencyInput.tsx` |
| Móvil | `frontend/src/index.css`, nuevo `frontend/src/hooks/useMobileViewport.ts` |
| Participantes | `frontend/src/pages/ParticipantsPage.tsx`; en `frontend/src/components/participants/`: `ParticipantFormModal.tsx`, `ParticipantDetailDrawer.tsx`, `RecordPaymentModal.tsx`, `AssignCourtesyModal.tsx`, `ReasonModal.tsx`, `DeleteConfirmModal.tsx`, `DeleteExcelModal.tsx` |
| QR y asistencia | `frontend/src/components/qr/QrScanModal.tsx`, `frontend/src/components/attendance/CheckInConfirmModal.tsx` |
| Ventas | `frontend/src/components/sales/OnsiteSaleModal.tsx` |
| Patrocinios | En `frontend/src/components/sponsors/`: `SponsorFormModal.tsx`, `RecordSponsorPaymentModal.tsx`, `SponsorDetailDrawer.tsx`, `AnnullPaymentModal.tsx` |
| Cronograma | `frontend/src/pages/SchedulePage.tsx` |
| Limpieza mínima | `frontend/src/pages/LoginPage.tsx`: solo tres espacios finales, conservando su contenido previo |
| Verificación | Nuevos `backend/tests/participant_search_normalization.test.ts`, `frontend/tests/mobile-regression.cjs`, `frontend/tests/pwa-regression.cjs` y este informe |

Los demás archivos originales de carga, estados vacíos/error, iconos, manifest, dashboard, sidebar, navegación, inventario y patrocinadores permanecen conservados. No se cambiaron colores, fuentes, identidad visual ni se reconstruyeron módulos.

## Verificación

| Comprobación | Resultado |
|---|---|
| TypeScript frontend | Correcto, sin los tres errores iniciales |
| Build frontend (`npm run build --prefix frontend`) | Correcto |
| Build backend (`npm run build --prefix backend`) | Correcto; generación local del cliente Prisma SQLite y TypeScript, sin migraciones ni consultas de negocio |
| Pruebas de normalización | 2 pruebas correctas; sin conectar a una base de datos |
| Interfaz a 320, 390, 412, 844 y 1440 px | Formularios dentro de la altura disponible, cabecera sin desbordamiento, importes editables, 16 px en móviles y tamaño original en escritorio |
| Viewport de teclado simulado | Modal y acciones dentro de 380 px disponibles |
| Edición con nombre largo a 320 px | Nombre completo y año visibles |
| Cámara de prueba del navegador | Visor cuadrado, separación de modos, validación manual, cierre y reapertura rápida sin streams activos al terminar |
| Doble envío QR/check-in | Una petición de validación y una de asistencia con respuestas simuladas |
| PWA en preview local | 71 recursos públicos precargados; manifest e iconos válidos; cambio de worker y recarga correctos; interfaz de acceso disponible offline; API y uploads ausentes de caché |
| Consola de las pruebas de interfaz/PWA | Sin errores JavaScript no controlados |

Las pruebas del navegador utilizan una cámara simulada y respuestas de API interceptadas. No acreditan un check-in contra datos reales ni una prueba física en Safari. Se inspeccionaron capturas móviles y de escritorio; no se dispone de una comparación visual automatizada contra una captura anterior a esta tarea.

Para repetir las pruebas del navegador se necesita Playwright y Google Chrome instalados. Puede usarse `EVENTGRID_PLAYWRIGHT` para indicar la ruta al paquete Playwright existente, sin añadir dependencias al proyecto. El script móvil usa el servidor Vite en `http://127.0.0.1:5178`; el de PWA usa un build y Vite preview en `http://127.0.0.1:4178`. `EVENTGRID_TEST_URL` permite cambiar esas direcciones. El script PWA modifica temporalmente la versión de `frontend/dist/sw.js` para comprobar la actualización y la restaura en `finally`; no modifica el worker fuente.

```powershell
node frontend/tests/mobile-regression.cjs
node frontend/tests/pwa-regression.cjs
```

## Límites y comprobaciones pendientes

- Validación física en iPhone/Safari y Android: teclado, permisos de cámara, lectura de tickets impresos, instalación desde el navegador y ejecución standalone con notch/áreas seguras reales.
- Prueba integrada con backend y una base exclusivamente de pruebas; no se ejecutó la batería histórica que crea participantes, pagos o inventario en la base configurada.
- La normalización de nombres es compatible con SQLite/PostgreSQL sin migraciones: consulta únicamente IDs y nombres de participantes de la edición y mantiene el resto de filtros y paginación en SQL. En ediciones muy grandes conviene medir su coste antes de decidir una búsqueda indexada específica de la base de datos.
- El modo offline ofrece la interfaz pública; autenticación, búsquedas, check-in, pagos e inventario requieren conexión. No se añadieron colas offline de operaciones.

## Git al finalizar la estabilización inicial (histórico)

Rama `main`, HEAD `2877bc2`. No hay commits nuevos frente a la referencia local `origin/main`; no se contactó al remoto para actualizarla. Todos los cambios siguen locales y sin preparar para commit. No se eliminaron archivos del proyecto. No se crearon commits ni mensajes con coautorías o firmas automáticas.

## Integración para revisión en GitHub

- Rama de trabajo: `codex/mobile-pwa-render-integration`. Se ejecutó `git fetch origin`; `origin/main` avanzó de `2877bc2` a `6fbd193`.
- Se conservaron los commits remotos `e8342ad` (conexión PostgreSQL en Render) y `6fbd193` (inicialización de la base demo antes de arrancar la API), integrándolos en la rama de trabajo sin conflictos. No se fusionó esta rama en `main`.
- Tras integrar, los 50 archivos locales originales se compararon mediante SHA-256 contra un respaldo previo: ninguno había cambiado. Las actualizaciones posteriores de este informe son deliberadas.
- `backend/package.json`, `backend/src/config/env.ts` y `docs/render-demo-deployment.md` coinciden con `origin/main`: se preservan las correcciones remotas de conexión, arranque y aislamiento de la demo.
- La compilación con el cliente PostgreSQL detectó acciones de auditoría ausentes en sus enums y entidades con capitalización incorrecta. Se añadieron ocho acciones y la entidad `EMAIL_BATCH_JOB` al esquema PostgreSQL, y se normalizaron las entidades de auditoría en usuarios y comunicaciones. Se conservan las acciones detalladas y todos los valores previos. No se aplicaron cambios a una base de datos.
- Nueva cobertura: `backend/tests/render_startup_config.test.ts` verifica la conservación de URLs PostgreSQL, el fallback SQLite solo fuera de producción, la secuencia de arranque y la compatibilidad de auditorías con los enums PostgreSQL. Carga de `.env` simulada; sin conexiones ni datos reales.
- Verificación posterior: nueve pruebas unitarias correctas, validación de ambos esquemas Prisma, compilación backend con cliente PostgreSQL y con cliente SQLite, compilación frontend y regresiones móviles/PWA correctas. El cliente local se deja generado para SQLite, como antes.
- El arranque remoto conserva `db push && seed && API`. No se ejecutó `npm start`, seed ni `db push` contra la base configurada. Este flujo sigue destinado a una base demo aislada; no sustituye una validación física ni una prueba integrada en PostgreSQL real.
- Los commits nuevos separan búsqueda, mejoras móviles/PWA, integración de `main`, compatibilidad PostgreSQL y documentación. Se utiliza la identidad Git existente y mensajes técnicos sin coautores ni firmas adicionales.
- No se realizó despliegue ni se modificaron servicios o variables de Render.
