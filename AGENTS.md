# EventGrid — reglas de publicación

Instrucción permanente del propietario: cada intervención aprobada en GitHub debe incluir la actualización de los servicios correspondientes de Render y QA de la versión publicada, sin esperar otro recordatorio.

Flujo obligatorio: código local → pruebas → GitHub → CI aprobado → respaldo verificado y migraciones seguras → Render → QA publicado.

- Utilizar los servicios existentes `eventgrid-demo-api` y `eventgrid-preview` de My Workspace. No crear servicios de pago ni cambiar planes.
- Conservar participantes, asistencias, pagos, inventario, tarifas, configuración y relaciones. Comprobar restauración e integridad del respaldo antes de reiniciar una base efímera.
- Resolver los impedimentos de persistencia buscando vías soportadas de extracción y restauración; no dejar versiones atrasadas sin investigar una solución concreta.
- Una exportación por API es parcial si omite tablas, secretos o estado interno. No presentarla como respaldo íntegro ni garantizar datos que no se hayan recuperado.
- Si conservar íntegramente los datos resulta técnicamente imposible con los accesos disponibles, explicar el impedimento y solicitar autorización específica para la operación destructiva necesaria antes de ejecutarla. La autorización de despliegue no autoriza pérdida de datos.
- Desplegar backend compatible antes del frontend dependiente. No publicar una combinación incompatible.
- Mantener accesos demo, temas, permisos, QR, PWA y SMTP desactivado. No enviar correos reales, alterar credenciales ni ejecutar migraciones destructivas sin autorización específica.
- Informar los commits realmente publicados en cada servicio y los resultados del QA. Diferenciar código integrado de código desplegado.
- No utilizar reset/clean/force-push ni agregar coautores o firmas automáticas de herramientas.
