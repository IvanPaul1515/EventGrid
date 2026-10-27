# Matriz de intervención — recepción y conciliación

Base revisada: `c957120` (PR #16), sin commits remotos posteriores al fetch inicial. Se preservó la investigación de persistencia en `9bbc0c1`; no incorpora cambios al servidor en ejecución. Esta matriz registra el diagnóstico inicial, no declara funcionalidades pendientes como terminadas.

| Área | Estado inicial | Trabajo necesario |
|---|---|---|
| Sesiones, códigos, relay dirigido y confirmación PC | Existente y probado | Conservar seguridad; corregir presentación según dispositivo y hacer compacto el control PC |
| Interfaz celular/PC/tablet | Incompleta | No ofrecer estación PC en teléfono; detección auxiliar y corrección manual de ambigüedad |
| Recepción rápida | Existente, incompleta | Reordenar menú, conservar Dashboard al login, completar siguiente participante sin salir de la ruta |
| Excel universitario | Incompleto | Separar RNC/documento, categoría/tarifa y Pago Total/importe; ignorar totales y columnas vacías |
| Referencias externa/interna | Existente | Ampliar búsqueda y conciliación sucesiva sin duplicar |
| Pago Total booleano | Error confirmado | No parsearlo como moneda; acreditar 28 SÍ y conservar 21 NO en el archivo real, según tarifa aplicable verificada |
| Pagos externos/locales y discrepancias | Pendiente | Canal separado del método, evidencia e idempotencia; historial inmutable |
| Plazos y seguimiento de impagos | Pendiente | Configuración por edición, revisión explícita y anulación administrativa segura |
| Excepciones | Cortesías existentes | Reutilizar autorización remota, agregar tipo y referencia del acuerdo |
| Cancelaciones | Existentes, incompletas | Guardar metadatos y bloquear cancelación ordinaria de asistentes; revalidación transaccional |
| Reembolsos | Pendiente | Estados administrativos y movimientos compensatorios sin ejecutar devoluciones reales |
| Comunicaciones | Tracking/preview/manualidad existentes | Plantillas y selección de destinatarios para pagos, anulaciones y reembolsos sin automatizar envíos |
| Dashboard financiero | Incompleto | Totales de origen, saldos vigentes y devoluciones confirmadas; no atribuir cobros externos a caja |
| Dashboard comunicaciones | Existente | Ampliar códigos y elegibilidad conservando métricas y estados inciertos |
| Migraciones PostgreSQL | Bloqueo demostrado | Ocho tablas y siete columnas ausentes en el historial; baseline/reconciliación antes del corte |
| Publicación Render | Bloqueada para datos protegidos | La última autorización de descarte excluye los datos expresamente protegidos; no reiniciar ni alterar almacenamiento/variables sin conservación verificada o autorización específica |

Baseline: 118 pruebas aprobadas y dos pruebas opcionales de navegador omitidas (120 casos). El archivo real se leyó en memoria desde Descargas; no se importó ni se añadieron datos personales al repositorio. Hallazgos: una hoja, rango A1:Q58, encabezado fila 6, 49 participantes, 28 SÍ/21 NO; la columna 8 solo contiene el total y 9/11/13 no contienen datos útiles.

## Implementación posterior al diagnóstico

- Escáner: presentación compacta en PC, vinculación opcional en teléfono y selección manual para dispositivos ambiguos. Se conservan las sesiones independientes, los códigos temporales, la entrega dirigida y la confirmación manual. Navegador verificado con dos PC y dos móviles emulados.
- Recepción: orden de navegación corregido, confirmación con nombre y siguiente participante conservando `/reception`. Los errores conservan la ficha.
- Excel: encabezado desplazado, columnas duplicadas/vacías, RNC separado, categoría separada, espera y Pago Total booleano. Se conserva la fila original; no se importa asistencia ni se concede cortesía desde Excel.
- Conciliación: referencia externa + edición/fuente y documento; correo compartido no une personas. Reimportaciones idempotentes y transacciones con secuencia atómica. NO→SÍ usa tarifa histórica; SÍ→NO abre revisión sin borrar pagos. Ausentes se conservan.
- Tarifas ambiguas: se crea revisión sin acreditar dinero; administrador puede aprobar una regla para nuevos registros del lote o resolver individualmente. La resolución no acredita dinero: se vuelve a importar la fuente.
- Finanzas: canales EXTERNAL/ONSITE/LEGACY, importador separado de receptor del dinero, saldos activos, ingresos acreditados y devoluciones confirmadas. Los movimientos históricos se clasifican LEGACY una sola vez, conservando importes.
- Impagos: fecha por edición con visualización de Santo Domingo, lista administrativa, previsualización firmada de diez minutos y confirmación explícita. Asistencia, abonos, excepciones, discrepancias y devoluciones excluyen la cancelación ordinaria en lote. No hay cron de cancelación.
- Excepciones: solicitud existente ampliada a cortesía, patrocinador, invitado y acuerdo, con referencia y decisión desde otra sesión administrativa. No se convierten automáticamente en pagos.
- Cancelación: metadatos, auditoría, conservación de número, pagos y QR histórico. Asistentes no admiten cancelación ordinaria. El editor general no permite eludir cancelación/reactivación.
- Reembolsos: solicitud, revisión, aprobación, rechazo, pendiente y devolución confirmada; reservas concurrentes limitadas al pago original. Referencia/método/confirmación obligatorios. No ejecuta transferencias. Una entrada no asistida debe cancelarse antes de confirmar la devolución.
- Comunicaciones: entrada digital solo para entrada válida, recordatorio de saldo, anulación por impago, cancelación voluntaria y avisos separados de solicitud/aprobación/pendiente/devolución. Elegibilidad compartida en selección y envío, revalidada antes de cada intento de cola. SMTP continúa apagado; vistas/importaciones no envían.
- Migraciones: reparación aditiva de ocho tablas, siete columnas y etiquetas de auditoría ausentes, seguida de las entidades financieras. Cadena comparada con esquema actual: columnas, índices, claves foráneas y enumeraciones coinciden en PGlite. Los archivos históricos aplicados no se reescriben.

## Estado real de Render antes de publicar esta intervención

La consulta actual contradice el estado antiguo del diagnóstico: ambos servicios ya estaban en `c957120` antes de nuestra publicación. Backend `dep-dbft2b2fngtc73f8tt30`, frontend `dep-dbft39ui0phs73bouv0g`. No se provocaron esos despliegues durante esta intervención.

El inventario privado de 59 consultas devolvió cero participantes en las tres ediciones, seis cuentas conocidas del seed, cero importaciones/Staff/tareas programadas y SMTP desactivado sin contraseña SMTP almacenada. Los dos participantes protegidos del inventario anterior ya no están en la instancia actual. Se conservan los archivos privados anteriores; siguen siendo exportaciones parciales, no una copia íntegra restaurable de la SQLite original.

La autorización del prompt actual permite actualizar fixtures demo descartables. Esta constatación habilita publicar la instancia actual, conservando variables y sin importar datos reales. No se atribuye a un despliegue nuevo la conservación de participantes que ya estaban ausentes.

## Límites y siguiente preparación

- Render sigue siendo demostración con SQLite efímera. No es alojamiento definitivo ni una solución de persistencia.
- La migración se ensayó con 40 tablas y 15 filas sintéticas, campo por campo, incluyendo hashes/ciphertext, roles, secuencia y relaciones. PGlite es PostgreSQL 18.6 embebido: no equivale a Prisma por red sobre PostgreSQL 16.
- `0_init` conserva su codificación UTF-16 original. El ensayo la decodifica en memoria; no se garantiza `prisma migrate deploy` directo sobre esa historia. Para un PostgreSQL persistente nuevo: baseline UTF-8 revisado sobre destino vacío, sellado explícito de migraciones, importación offline y ensayo con el motor definitivo antes del corte. No aplicar la cadena a una base ya creada por `db push` sin reconciliar su historial.
- Una tarifa/responsabilidad comercial histórica no se corrige automáticamente por Excel. Las discrepancias de identidad conservan la evidencia para revisión humana.
- Las cámaras físicas, Safari iOS y PWA instalada en dispositivo real requieren prueba física posterior. El QA móvil realizado usa emulación Chromium.
- Envíos reales, ejecución bancaria de reembolsos y migración de alojamiento definitivo quedan fuera de esta publicación. SMTP no se habilita.

## QA de esta versión

Suite aislada completa: **134/134**, incluidas las tres pruebas opcionales de navegador. Dos PC y dos teléfonos emulados; 13 sesiones SSE; interfaz financiera a 390 px; oleadas de 5/10/20 operadores e importaciones. Compilación frontend y TypeScript backend aprobados, ambos esquemas Prisma válidos. Se corrigió además la conversión de timestamps SQLite como texto en seguimiento de comunicaciones, con prueba de regresión. Ningún proveedor real fue contactado.
