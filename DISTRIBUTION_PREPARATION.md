# Preparación de distribución de EventGrid

## Separación de instalaciones

El repositorio completo contiene frontend, backend, API, esquemas, migraciones y
Docker. `EventGrid-Backend` es el nombre solicitado para la copia privada completa;
no significa que deba excluir el frontend. Los secretos y datos de cada instalación
permanecen fuera de ambos repositorios, en variables privadas y almacenamiento persistente.

La copia pública existente no cambia de visibilidad. La propuesta AGPL sigue pendiente
de aprobación. No se ha publicado una nueva distribución licenciada ni se ha cambiado
automáticamente el repositorio que utilizan los servicios de Render.

Render se conserva como demostración aislada con sus cinco accesos. Para operación,
utilizar PostgreSQL persistente y la inicialización administrativa de Docker, sin seed
demo. No asumir que una cuenta heredada es de prueba por su nombre o su dirección.
El retiro de cuentas requiere evidencia de su origen, un administrador operativo válido,
respaldo verificado y revocación de sesiones. Ninguna cuenta se retira en esta intervención.

## Revisión de secretos e historial

Se revisaron todas las referencias locales accesibles, incluidos objetos históricos
y archivos eliminados: 3,538 objetos y 1,751 blobs en el corte inicial de revisión.
La búsqueda complementaria de claves privadas, tokens de proveedores y URLs con
credenciales encontró siete referencias: ejemplos locales, marcadores y sustituciones
de variables. No se publican sus valores.

Gitleaks 8.30.1, descargado del proyecto oficial y verificado contra el SHA-256 del
artefacto, se ejecutó con `git --log-opts=--all`, redacción completa y sin aplicar
excepciones de comentarios. Señaló un candidato histórico en una prueba: un
`codeOrToken` de 32 caracteres con marcador de fixture, no una credencial de proveedor.
El informe redactado se conserva fuera del repositorio. No se añadieron exclusiones
generales para silenciar hallazgos.

Esta comprobación no acredita credenciales de terceros ni permite garantizar ausencia
absoluta de secretos. No incluye repositorios ajenos, referencias inaccesibles,
artefactos remotos, logs privados o copias de terceros. Antes de una nueva publicación
pública, repetir el análisis sobre su commit final y revisar manualmente recursos,
fixtures, licencias de terceros y cualquier configuración institucional específica.

Si se confirma un secreto real: detener su publicación, identificar el proveedor y el
alcance, obtener autorización para revocarlo/rotarlo, actualizar la instalación por
canales privados y verificar recuperación. No basta con borrar el archivo del último
commit. No se reescribe historial ni se cambian credenciales automáticamente.

## Incorporación de cambios públicos en una instalación privada

1. Mantener los secretos, la base y los uploads fuera de Git. No versionar copias de
   datos operativos para trasladarlas entre repositorios.
2. Revisar los cambios públicos de código y migraciones en `development`, conservando
   ajustes privados y su identidad Git. No sobrescribir `.env` ni copiar defaults sobre
   registros de configuración existentes.
3. Ejecutar unit tests relacionados, revisar el PR y esperar el CI obligatorio.
4. Respaldar PostgreSQL y archivos necesarios; restaurar en una base aislada y comparar
   integridad, relaciones y recuentos. Conservar también las claves de cifrado privadas.
5. Aplicar migraciones aditivas y desplegar backend compatible antes del frontend.
   Verificar salud, login, roles, QR, SSE y actualización de PWA.
6. Registrar los commits realmente publicados. No confundir una copia de código o una
   integración en GitHub con una migración de datos o un despliegue ya efectuado.

## Pendientes que requieren evidencia de la instalación

Las ediciones históricas de demostración no se eliminan por su año. Los endpoints de
Render permiten comprobar registros visibles, pero no todas las tablas internas ni
la restaurabilidad íntegra de su SQLite. Preparar su retiro exige una inspección completa
de relaciones; ante dudas se conserva el registro. No se ejecuta una limpieza automática.

Un cambio de dominio requiere mantener el dominio anterior o una redirección soportada
para conservar QRs impresos. No se promete que un dominio ajeno pueda redirigirse sin
control sobre él. El QR persiste en PostgreSQL/SQLite; un despliegue que pierde SQLite
también pierde identificadores y configuraciones nuevas.
