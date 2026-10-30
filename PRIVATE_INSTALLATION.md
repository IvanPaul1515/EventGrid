# Instalación privada local

La instalación privada utiliza el proyecto Compose `eventgrid-private`, PostgreSQL
y volúmenes propios. No reutilizar el nombre de otro proyecto ni apuntar a su base
sin un respaldo restaurado y verificado. Render conserva su entorno demo independiente.

## Archivo privado

Preparar `.env.private` desde `.env.example` sin sobrescribir archivos existentes.
El archivo real pertenece al entorno local y está excluido de Git y del contexto Docker.
No imprimir `docker compose config` con valores interpolados ni copiar sus resultados
a tickets, logs públicos o commits. Para validar sintaxis utilizar `config --quiet`.

`INITIAL_ADMIN_EMAIL`, `INITIAL_ADMIN_NAME` e `INITIAL_ADMIN_PASSWORD` configuran el
administrador inicial. El correo real y la contraseña no forman parte del código ni
de esta documentación. Una instalación sin administrador válido falla claramente si
no se proporciona una identidad y una contraseña privada de al menos 16 caracteres,
con mayúsculas, minúsculas y números. No se genera una contraseña predeterminada.

El bootstrap crea un único administrador global activo y guarda solo bcrypt y una
auditoría sin secretos. Si ya existe un administrador válido, no lo recrea ni cambia
su contraseña. Un correo coincidente con una cuenta no administrativa requiere revisión
manual; nunca se eleva esa cuenta automáticamente. El sistema actual dispone de cambio
de contraseña, pero no de una bandera de cambio obligatorio en el primer ingreso.

## SMTP preparado, sin envío

Variables: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM_EMAIL`,
`SMTP_FROM_NAME`, `SMTP_REPLY_TO` y `SMTP_SECURE`. No inventar valores: obtenerlos de
un proveedor autorizado o de una configuración local segura existente. `SMTP_REPLY_TO`
es opcional. Usar comillas simples para conservar literalmente caracteres especiales
del archivo de entorno; validar su interpretación sin mostrar valores.

Compose pasa estos valores en tiempo de ejecución; no los incorpora durante el build.
Cuando están completos y aún no hay configuración global, el bootstrap guarda la
configuración cifrada con `APP_SECRET` y **desactivada**. Conserva cualquier configuración
existente. Si faltan valores, informa únicamente los nombres de las variables pendientes.
No inicia workers, envía pruebas ni reintenta trabajos anteriores.

Mantener `BLOCK_REAL_EMAIL=true` hasta que el administrador autorice una prueba real.
Activar un proveedor no constituye autorización para enviar un trabajo histórico.
La aplicación conserva los controles de autorización manual de comunicaciones.

`SMTP_SECURE=true` utiliza TLS implícito; `false` requiere STARTTLS. La verificación de
certificados permanece activa, con TLS 1.2 como mínimo. La imagen incluye certificados
CA y el backend pertenece a la red de aplicación con salida. PostgreSQL permanece en
su red interna, sin puerto publicado. No hace falta publicar puertos SMTP entrantes.
DNS, puertos y firewall del proveedor deben verificarse desde el contenedor cuando
existan sus parámetros; no se acredita conectividad solo por disponer de variables.

## Arranque y actualización

### Identificar la versión ejecutada

Antes de construir, guardar el código en un commit y comprobar el árbol de trabajo.
Pasar metadatos públicos del build explícitamente, sin modificar `.env.private`:

```powershell
$env:VCS_REF = git rev-parse HEAD
$env:BUILD_DATE = [DateTime]::UtcNow.ToString('yyyy-MM-ddTHH:mm:ssZ')
$env:BUILD_ENV = 'docker-private'
docker compose -f compose.yaml --project-name eventgrid-private --env-file .env.private build frontend
docker compose -f compose.yaml --project-name eventgrid-private --env-file .env.private up -d --no-deps --wait --no-build frontend
```

Una corrección solo de frontend no requiere reiniciar backend ni PostgreSQL.
Si cambia backend, revisar migraciones y respaldo antes de reconstruir/actualizar ese
servicio. No reiniciar PostgreSQL para actualizar código. No reutilizar etiquetas como
prueba de versión: comparar el ID de imagen realmente usado por el contenedor.
Administración muestra commit, versión, fecha UTC y entorno de ambos componentes.
Contrastar con `/build-info.json`, `/api/v1/health` y las etiquetas OCI de la imagen.
Un build sin metadatos se identifica como `unknown`; no asumir que corresponde a HEAD.
La salud y los archivos servidos deben verificarse después de actualizar contenedores.
Una conexión SMTP verificada no acredita autorización del remitente ni entrega al buzón.

Conservar `DEMO_SEED=false` y `DEMO_QUICK_ACCESS=false`. Comprobar espacio suficiente
antes de construir imágenes. Con el secreto administrativo configurado:

```powershell
docker compose -f compose.yaml --project-name eventgrid-private --env-file .env.private config --quiet
docker compose -f compose.yaml --project-name eventgrid-private --env-file .env.private build backend frontend
docker compose -f compose.yaml --project-name eventgrid-private --env-file .env.private up -d --wait
```

Las migraciones deben completar antes de iniciar el backend; el frontend espera su
salud. Conservar los volúmenes de PostgreSQL y uploads, el nombre del proyecto y
`APP_SECRET` durante actualizaciones. No utilizar `down -v`, reinicializar una base
existente ni regenerar claves para solucionar un arranque fallido.

Una base privada nueva no contiene cuentas demo: solo el administrador configurado.
Si se reutiliza una base existente, inventariar usuarios y verificar al administrador
antes de retirar cuentas. El nombre o correo de una persona no demuestra su origen
demo. Conservar cuentas ambiguas e historial; cualquier desactivación autorizada debe
revocar sesiones y quedar auditada. No ejecutar eliminaciones masivas.

## Recuperación de una edición

Crear un proyecto Compose nuevo crea volúmenes nuevos: no traslada automáticamente
ediciones desde SQLite, Render ni otros proyectos. Un administrador creado no implica
que la configuración del evento esté recuperada. El bootstrap informa si no hay ediciones
y nunca crea eventos ficticios ni repite inventarios.

Antes de recuperar, inventariar los volúmenes y las fuentes sin modificarlos. Guardar
un `pg_dump -Fc` del PostgreSQL destino fuera de Git, restaurarlo en una base aislada
y comparar todas las tablas y relaciones. Conservar también el archivo SQLite íntegro
mediante su API de backup y `PRAGMA integrity_check` cuando corresponda. Una extracción
de configuración mediante API es parcial y no sustituye el respaldo completo del origen.

El comando offline `node dist/scripts/recover-edition.js <sha256>` recibe por entrada
estándar el snapshot verificado de configuración: `event`, `tickets`, `inventory.items`,
`merch` y `participants.total`. Solo admite una edición sin participantes, entregas,
reservas ni movimientos, y un destino sin ediciones o inventarios. Conserva IDs, tarifas,
cupos y fechas, inserta en una transacción y registra el hash de origen en auditoría.
No importa usuarios, SMTP, secretos ni trabajos pendientes. No existe una ruta HTTP
ni ejecución automática de esta recuperación. Copiar los uploads verificados al volumen
de uploads, sin incorporarlos a las imágenes ni al repositorio genérico.

Si hay registros o movimientos, este procedimiento se detiene: hace falta una migración
completa con sus relaciones y conciliación. No usarlo para sustituir un origen incompleto,
reiniciar existencias o resolver diferencias entre respaldos históricos. Una segunda
ejecución sobre el destino recuperado se rechaza para impedir duplicados.

## Separación de repositorios

El producto completo permanece sincronizable entre repositorios mediante `development`
y `main`, conservando `legacy`. Los cambios generales pueden publicarse; configuración
real, datos, secretos, respaldos y logs privados permanecen fuera de Git. No cambiar
automáticamente el repositorio, SMTP, credenciales o almacenamiento de Render.
