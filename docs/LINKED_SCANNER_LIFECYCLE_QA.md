# Corrección del escáner vinculado

Base revisada: PR #17, `2ecf8e2`. El fetch inicial no encontró cambios posteriores ni modificaciones locales pendientes.

## Causas confirmadas

- La sugerencia móvil consultaba estaciones solo al montarse; registrar una PC no emitía aviso de descubrimiento para sus otras sesiones.
- Desmontar `LinkedScannerPanel` enviaba `/unlink`. Navegar o recargar podía finalizar un vínculo válido y detenía su heartbeat.
- El filtro `activeLinkId: null` ocultaba estaciones con solicitudes vencidas, intentos agotados o sesiones móviles revocadas.
- La clasificación podía tratar un teléfono horizontal como ambiguo y una preferencia antigua podía prevalecer sobre una detección móvil inequívoca.

## Corrección

`ScannerContext` conserva estado y heartbeat dentro de Layout, mientras el panel conserva su interfaz y apertura de fichas en Recepción. Un único sondeo de respaldo cada 15 segundos, eventos SSE y recuperación al volver visible/online. No se registra una estación sin pulsar Habilitar. No se desvincula desde limpiezas de React.

Las señales de descubrimiento no contienen códigos, identificadores de participantes ni datos de la estación y solo llegan a sesiones ADMIN/OPERATOR de la misma cuenta/edición. Los enlaces siguen utilizando aprobación PC, código de seis dígitos de un solo uso, 90 segundos para emparejar y cinco intentos. Estaciones sin pareja: lease de 90 segundos. Vinculaciones activas: margen de reconexión de diez minutos; una expiración efectiva exige volver a emparejar y no se reviven sesiones revocadas.

Se recuperan plazas caducadas sin revocar un enlace posterior legítimo. Cambio incompatible de edición, logout/revocación o desvinculación explícita siguen invalidando el vínculo. El teléfono vinculado no puede confirmar check-in por API. Una lectura aceptada cierra la cámara; QR inválidos/duplicados no se presentan como asistencia confirmada.

La detección combina pantalla, punteros, tacto y señales opcionales del navegador; tablets y laptops táctiles admiten selección manual. Es presentación, nunca autorización.

## QA

- Frontend/backend builds y TypeScript aprobados. Suite aislada: **145/145**, incluidas las tres pruebas opcionales de navegador; **25 pruebas del escáner**.
- Dos PC y dos teléfonos emulados con sesiones independientes de Operador, teléfono abierto primero, descubrimiento SSE sin recargar, aviso descartado respetado, navegación, recarga de ambos dispositivos y pérdida temporal de red.
- QR decodificado por el lector real desde video WebRTC sintético, liberación de tracks y dos asistencias confirmadas manualmente desde la PC. Entrega exclusiva a la estación seleccionada y desvinculación sin logout.
- ADMIN, OPERATOR, VIEWER, cuentas/ediciones distintas, códigos incorrectos/caducados, revocación, plazas antiguas, QR inválido/usado, check-in duplicado e inventario cubiertos con datos sintéticos.
- No se probaron cámaras físicas, Safari iOS ni suspensión real prolongada del sistema operativo.

Render contenía 49 registros importados (28 con pagos). El propietario confirmó expresamente que son pruebas descartables y autorizó su pérdida en este despliegue. Se conserva su exportación privada por API con hash; **es parcial, no una copia íntegra de SQLite**. No se incluyen datos personales en Git. Publicación posterior al CI, backend antes del frontend, sin cambios SMTP/credenciales/almacenamiento.
