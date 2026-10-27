# Wallet y escáner dedicado

## Qué está implementado

- Apple: datos `eventTicket`, identificador estable, imágenes PNG del logo, QR existente y ensamblado/firma CMS mediante `passkit-generator`. Se verifica clave/certificado, vigencia, Team ID, Pass Type ID y cadena contra huellas de raíces públicas de Apple. Certificados y claves solo se leen desde variables seguras.
- Google: clase por edición y objeto por inscripción/versión de credencial, OAuth oficial y JWT RS256 Save to Wallet. Se exige habilitación explícita, emisor aprobado y clase aprobada comprobada por API. Se actualiza/crea el mismo objeto en solicitudes repetidas. Rotar el QR crea otra versión para no entregar la nueva credencial a quien conservase el pase comprometido anterior.
- QR: Wallet, correo y entrada web utilizan el mismo payload de `QrService`; añadir un pase no hace check-in. Cancelación, QR revocado, pagos pendientes y cortesías pendientes se revalidan antes de emitir.
- Correo: solo la entrada digital recibe enlaces cuando el proveedor está listo. Son capacidades individuales cifradas, limitadas a esa inscripción/edición/QR y con siete días de vigencia; no son sesiones administrativas. Se envían en fragmento URL, se eliminan de la barra y se intercambian por POST para evitar logs de acceso. Respuestas privadas sin caché ni Referer.
- Entrada web: muestra nombre, evento, registro, fecha/lugar, QR y estado actual; se eliminó el token como texto. Los botones no aparecen sin proveedor listo.
- Escáner: pantalla móvil dedicada, sin menú ni herramientas administrativas mientras está vinculado. Dos acciones: Leer QR y Desvincular, esta última con confirmación. Estado único según conexión/lectura/confirmación. Panel PC compacto con iconos, solicitudes y acciones espaciadas. Se mantienen sesiones, códigos, SSE, permisos y liberación de cámara.

## Activación externa pendiente

Esta publicación no acredita una prueba en Apple Wallet/Google Wallet físicos. Sin certificados y emisor oficiales verificados, ambos proveedores permanecen deshabilitados y ocultos. No se modifican variables de Render durante esta intervención.

Configuración común en almacenamiento seguro del alojamiento:

- `WALLET_PUBLIC_BASE_URL`: URL HTTPS del router, por ejemplo `https://backend.example/api/v1/wallet`.
- `WALLET_LINK_SECRET`: secreto aleatorio dedicado recomendado; si falta, se deriva una clave separada del secreto JWT existente.
- `WALLET_ISSUER_NAME`: identidad legítima del emisor. `WALLET_ASSET_BASE_URL`: origen HTTPS de recursos públicos cuando el logo no esté en `/uploads/`.

Apple requiere cuenta Developer, Pass Type ID y certificado válido con su clave RSA correspondiente, WWDR y raíz Apple. Variables: `APPLE_WALLET_PASS_TYPE_ID`, `APPLE_WALLET_TEAM_ID`, `APPLE_WALLET_CERT_PEM_BASE64`, `APPLE_WALLET_KEY_PEM_BASE64`, `APPLE_WALLET_WWDR_PEM_BASE64`, `APPLE_WALLET_ROOT_PEM_BASE64`, opcional `APPLE_WALLET_KEY_PASSPHRASE`. Los valores base64 contienen PEM, nunca se guardan en Git. El logo debe existir en recursos locales del proyecto/edición. Solo tras verificar aceptación real debe activarse `APPLE_WALLET_ENABLED=true`. La revocación del certificado requiere deshabilitar/rotar la configuración; no se sondea CRL/OCSP.

Google requiere cuenta emisora habilitada para publicar, service account autorizada y clase aprobada por edición. Variables: `GOOGLE_WALLET_ISSUER_ID`, `GOOGLE_WALLET_CLIENT_EMAIL`, `GOOGLE_WALLET_KEY_PEM_BASE64`, `GOOGLE_WALLET_ORIGINS` (orígenes HTTPS separados por comas), `GOOGLE_WALLET_ISSUER_APPROVED=true` y `GOOGLE_WALLET_ENABLED=true`. El endpoint administrativo `GET /api/v1/wallet/:registrationId/google-class` prepara una clase DRAFT; no la publica ni la aprueba. Crear/revisar esa clase mediante las herramientas oficiales de Google antes de habilitar. Una clase DRAFT o un fallo de verificación mantiene el botón oculto.

No hay registro de dispositivos Apple/APNs ni sincronización automática de cambios de estado con Wallet. La página web consulta el estado actual; un pase guardado es una instantánea. EventGrid rechaza QR cancelados/usados aunque la Wallet conserve el pase. No activar pases reales sobre SQLite efímera: primero persistencia e identidades estables de producción.

## QA enfocado

- 9 pruebas Wallet (proveedores/firmante simulados, JWT real con clave efímera solo en memoria), 25 de escáner incluida integración real HTTP/SSE con cámara WebRTC sintética, 12 de comunicaciones y 5 de autorización manual de correo: 51 comprobaciones relacionadas aprobadas, sin repetir la suite completa local.
- Builds frontend/backend y TypeScript aprobados. La cámara se carga de forma diferida para no aumentar el paquete inicial de la aplicación.
- Sin envíos de correo, transferencias, certificados reales ni datos personales en las pruebas. Pendientes: certificados/emisor y aceptación en dispositivos reales; Safari/iPhone/Android físicos.

Fuentes oficiales: [Apple Passes](https://developer.apple.com/documentation/walletpasses/building-a-pass), [Apple PKI](https://www.apple.com/certificateauthority/), [Google event tickets](https://developers.google.com/wallet/tickets/events/web/javascript-button). Biblioteca de firma: [passkit-generator](https://github.com/alexandercerutti/passkit-generator).
