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

## Separación de repositorios

El producto completo permanece sincronizable entre repositorios mediante `development`
y `main`, conservando `legacy`. Los cambios generales pueden publicarse; configuración
real, datos, secretos, respaldos y logs privados permanecen fuera de Git. No cambiar
automáticamente el repositorio, SMTP, credenciales o almacenamiento de Render.
