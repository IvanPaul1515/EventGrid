# EventGrid — Plataforma de Gestión de Eventos y Participantes

**EventGrid** es una plataforma de software independiente, multifuncional y adaptable diseñada para la gestión integral de eventos de diferentes tipos, formatos y dimensiones: conferencias tecnológicas, congresos empresariales, cumbres profesionales, simposios académicos, talleres y festivales.

La plataforma centraliza en un único entorno modular y seguro la administración de participantes, inscripciones, taquilla y ventas presenciales, inventario de artículos conmemorativos (T-shirts), conciliación de pagos, importación masiva de datos, control de asistencia en tiempo real (Check-in), auditoría completa de operaciones y gestión multievento.

> [!NOTE]
> **EventGrid** es un software neutral e independiente. Puede alojar simultáneamente múltiples ediciones y eventos independientes, manteniendo para cada uno su propia identidad visual, catálogos de entradas, tarifas, participantes, existencias de inventario y libros contables de forma estrictamente aislada.

---

## 🚀 Capacidades y Módulos Principales

### 1. Control de Asistencia y Recepción en Vivo (Check-in)
* **Flujo Seguro en Dos Pasos**: Búsqueda universal por nombre, documento, correo, teléfono o código de ticket. La selección abre la **Ficha Oficial 360°** del participante, eliminando marcajes accidentales desde listas o mediante teclas rápidas.
* **Confirmación con Selector de Tallas**: Al pulsar «Marcar asistencia», la plataforma solicita la confirmación de la talla de camiseta requerida y permite indicar si fue entregada físicamente en ese instante o si queda pendiente.
* **Ficha Oficial 360°**: Visualización integral organizada en:
  1. *Identidad*: Nombres, apellidos, documento de identidad, empresa/institución y vías de contacto.
  2. *Inscripción*: Edición activa, tipo de entrada asignada, fecha de registro y notas.
  3. *Finanzas*: Tarifa oficial, monto pagado, balance pendiente y libro de pagos.
  4. *Artículos / T-shirt*: Talla registrada, estado de entrega física y trazabilidad de cambios.
  5. *Control de Acceso*: Marcaje físico de llegada con registro de fecha, hora exacta y operador responsable.
* **Separación Estricta de Estados**: Tres dimensiones independientes por registro:
  - **Estado de Inscripción**: `CONFIRMED`, `PENDING`, `CANCELLED`.
  - **Estado de Pago**: `PAID`, `PARTIAL`, `PENDING`, `COURTESY`.
  - **Estado de Asistencia**: `attended: boolean` con fecha y auditoría.
* **Prevención de Duplicados y Reversión**: Detección de intentos de reingreso y confirmación irreversible de asistencia; la auditoría conserva el responsable y la fecha. No se ofrece una reversión operativa.

### 2. Inventario de Camisetas y Control de Entrega
* **Gestión por Tallas y Edición**: Inventario independiente por evento para el seguimiento de cantidades iniciales, entregadas y disponibles.
* **Validación de Existencias en Tiempo Real**: Notificación inmediata si una talla seleccionada se encuentra agotada, impidiendo entregas físicas sin existencias disponibles pero permitiendo registrar la asistencia.
* **Descuento Atómico**: El inventario solo se descuenta cuando se confirma la entrega física efectiva. Si únicamente se anota la talla, las existencias permanecen intactas.
* **Módulo Administrativo**: Panel dedicado para agregar nuevas tallas, modificar cantidades, desactivar opciones y consultar estadísticas de rotación.

### 3. Directorio de Participantes y Gestión Multievento
* **Aislamiento Multiedición**: Cada evento o edición conserva su base de datos de inscripciones de forma independiente, posibilitando el análisis del historial multianual de asistencia por persona.
* **Tabla Administrativa Avanzada**: Búsqueda global instantánea, filtros combinados por estado de inscripción, estado de pago o cortesías, ordenación multicriterio, paginación en servidor y diseño 100% responsivo adaptable a cualquier pantalla.
* **Exportación de Reportes**: Generación de reportes tabulares en formato Microsoft Excel (`.xlsx`) y CSV con formato profesional y encabezados tipados.

### 4. Taquilla y Ventas Presenciales (Punto de Venta)
* **Venta en Puerta**: Emisión de tickets correlativos con prefijo personalizable por evento (ej. `EVT-0001`, `CONF-0042`).
* **Tarifas y Congelación de Precios**: Tipos de entrada con captura de precios históricos en el momento de la venta, garantizando que cambios posteriores de tarifas no alteren ventas previas.
* **Cálculo Financiero Dinámico**: Cálculo instantáneo de tarifa, monto recibido, cambio a devolver y balance pendiente.
* **Gestión de Abonos**: Registro progresivo de pagos parciales hasta liquidar la totalidad de la entrada.

### 5. Políticas de Cortesías y Cancelaciones
* **Cortesías Oficiales**: Entradas exentas de pago, excluidas de la recaudación neta del evento, con registro mandatorio del autorizador y motivo de otorgamiento.
* **Cancelación No Destructiva**: Los registros cancelados conservan su trazabilidad histórica sin borrado físico ni alteraciones injustificadas en la contabilidad.

### 6. Motor de Importación Inteligente de Datos
* Compatible con formatos `.xlsx`, `.xls` y `.csv`.
* Diccionario lingüístico de alias para autodetección inteligente de encabezados de columnas.
* Asignación visual e interactiva de campos, validación estructural de tipos de datos e informe de errores previo a la inserción.
* Estrategias configurables de resolución de duplicados (*Omitir*, *Actualizar datos* o *Importar únicamente registros nuevos*).

### 7. Personalización de Identidad Visual y Logos
* **Logotipos por Evento**: Carga directa de imágenes oficiales (PNG, JPG, WEBP, SVG) con previsualización inmediata.
* **Motor Temático Dinámico**: Personalización de colores primarios, secundarios, color de acento, fondos, prefijos de tickets y subtítulos aplicados en tiempo real a la interfaz sin necesidad de recompilar.

### 8. Historial de Actividad, Auditoría y Seguridad (RBAC)
* **Control de Acceso Basado en Roles (RBAC)**:
  - **Administrador (`ADMIN`)**: Control operativo y de configuración total.
  - **Operador (`OPERATOR`)**: Operación de taquilla, registro, check-in e importación.
  - **Consulta (`VIEWER`)**: Supervisión de estadísticas y reportes en modo de solo lectura.
* **Bitácora Inmutable (`/audit`)**: Registro detallado de acciones, usuario responsable, dirección IP, entidad afectada y diff en formato JSON de los cambios efectuados.
* **Herramientas de Respaldo**: Scripts automatizados de backup y restauración de base de datos para entornos Windows (`.bat`) y Linux/macOS (`.sh`).

---

## 🛠️ Stack Tecnológico

| Capa | Tecnologías |
| :--- | :--- |
| **Frontend Web** | React 18, TypeScript, Vite, Tailwind CSS, Lucide Icons, Recharts |
| **Backend REST API** | Node.js, Express, TypeScript, Zod, JWT, bcryptjs, Cookie-Parser |
| **Base de Datos** | PostgreSQL 16 (Producción / Docker) y SQLite (Entorno local de desarrollo) |
| **ORM** | Prisma ORM 6 (Migraciones, esquema relacional, cliente fuertemente tipado) |
| **Hojas de Cálculo** | SheetJS (`xlsx`) para lectura y generación de archivos binarios |
| **Pruebas Automatizadas** | Vitest (90 pruebas automatizadas unitarias y de integración) |
| **Despliegue** | Docker & Docker Compose |

---

## 📋 Requisitos del Sistema

- **Node.js**: v20.x o superior (LTS recomendado)
- **npm**: v10.x o superior
- **Docker y Docker Compose**: (Opcional, para ejecución en contenedores)
- **Git**: Para control de versiones

---

## Instalación y ejecución

La distribución recomendada utiliza **Node.js 22**, PostgreSQL persistente y
Docker Compose. Consulta [DOCKER_DEPLOYMENT.md](DOCKER_DEPLOYMENT.md) para los
comandos de instalación, migración, respaldo y restauración verificada.

1. Conserva cualquier `.env` existente. Prepara un archivo privado a partir de
   `.env.example` únicamente si aún no existe configuración.
2. Genera secretos aleatorios propios para PostgreSQL, JWT, cookies y `APP_SECRET`.
   No reutilices ejemplos ni regeneres `APP_SECRET` al actualizar una instalación.
3. Configura la cuenta administrativa inicial mediante variables privadas. El
   arranque normal no crea cuentas demo ni inicia envíos de correo.
4. Valida Compose, construye las imágenes y arranca los servicios siguiendo la guía.
   Las migraciones deben finalizar antes de iniciar el backend compatible.
5. Publica mediante HTTPS y proxy inverso; conserva los volúmenes de PostgreSQL y
   uploads. No expongas el puerto de la base de datos.

Para desarrollo nativo, ejecuta `npm ci` una sola vez en la raíz de los workspaces,
configura una base **local aislada**, genera el cliente Prisma correspondiente y
utiliza `npm run dev:backend` y `npm run dev:frontend`. No apuntes las pruebas a una
base operativa. SQLite se admite para desarrollo y demo; un archivo en almacenamiento
 efímero no constituye una instalación persistente.

La salud del backend se consulta en `/api/v1/health`. El frontend local utiliza
`http://localhost:5173`; Compose lo publica por defecto en `http://localhost:3000`.
Los puertos y dominios son configurables.

## Demostración y operación

Los cinco accesos demo corresponden a Administrador, Operador, Consulta y dos
escáneres independientes. Solo deben habilitarse en una instalación demo aislada.
El seed nativo requiere `DEMO_QUICK_ACCESS=true`; la distribución Docker exige además
`DEMO_SEED=true` y `BLOCK_REAL_EMAIL=true` para activar el seed de demostración.
No habilites esos valores con datos reales.

En una instalación operativa, conserva el seed demo desactivado y configura un
administrador propio mediante el procedimiento de inicialización. Las cuentas
existentes no se borran ni se desactivan automáticamente. Una cuenta antigua no se
considera demo solamente por su nombre o correo; cualquier retiro requiere evidencia,
respaldo, conservación de un administrador válido y revocación controlada de sesiones.

## Configuración y módulos recientes

- Recepción rápida: búsqueda y cola principal, herramientas secundarias y confirmación
  expresa; no se confirma una asistencia por el mero hecho de escanear.
- Control de asistencia: historial y supervisión con período de la edición, sin ocultar
  participantes pendientes en la búsqueda operativa.
- Personal y accesos: cuatro perfiles visibles y capacidades explícitas de operador,
  verificadas también en la API. Los derechos heredados se conservan hasta su revisión.
- Estadísticas: siete secciones, muestras y criterios descriptivos transparentes,
  monedas identificadas y comparaciones entre ediciones autorizadas.
- Opiniones: encuesta pública voluntaria, buzón independiente y revisión privada;
  enlace persistido por edición, QR PNG/SVG y cartel imprimible mediante Guardar PDF.
  La URL requiere conservar tanto la base de datos como el dominio público configurado.
- Ediciones: asistente de seis pasos con borrador local por cuenta y sesión y creación
  transaccional; no copia asistentes, pagos ni entregas de otra edición.

Los temas, logos, tarifas, permisos y existencias se configuran por edición. SMTP
permanece desactivado hasta una autorización explícita; las vistas previas, el seed,
las importaciones y los reinicios no deben enviar mensajes reales.

## Seguridad y distribución

No incluyas `.env`, bases de datos, respaldos, uploads operativos, certificados ni
secretos en Git o en imágenes. Conserva `APP_SECRET` de forma segura junto con la
estrategia de recuperación; un dump sin las claves necesarias puede no ser restaurable
funcionalmente. Una exportación de participantes por API no es un respaldo completo.

El código conserva la licencia actual `UNLICENSED`. La propuesta
[AGPL-3.0 para revisión](LICENSE_PROPOSAL.md) **no ha sido aplicada**. La preparación
pública y privada, sus límites y el procedimiento de actualización están descritos en
[DISTRIBUTION_PREPARATION.md](DISTRIBUTION_PREPARATION.md). No cambies la visibilidad
ni publiques un historial operativo sin una revisión y autorización expresas.

---

## 🧪 Pruebas Automatizadas

El proyecto cuenta con suites de pruebas que validan autenticación, RBAC, control de asistencia, confirmación con T-shirts, inventario, ventas presenciales, balances contables y el motor de importación:

```bash
npm test --prefix backend
```

---

## 📁 Estructura del Proyecto

```
EventGrid/
├── backend/
│   ├── prisma/
│   │   ├── schema.prisma          # Esquema relacional PostgreSQL
│   │   ├── schema.sqlite.prisma   # Esquema local SQLite
│   │   └── seed.ts                # Semilla de datos y usuarios iniciales
│   ├── scripts/                   # Scripts de migración interna y utilidades
│   ├── src/
│   │   ├── config/                # Base de datos y entorno
│   │   ├── middleware/            # JWT, RBAC, auditoría y errores
│   │   ├── modules/
│   │   │   ├── activity/          # Bitácora de actividad y auditoría
│   │   │   ├── attendance/        # Lógica de Check-in y reversión
│   │   │   ├── auth/              # Autenticación y credenciales
│   │   │   ├── communications/    # Envío de correos y credenciales digitales
│   │   │   ├── demo/              # Gestión de entorno de demostración
│   │   │   ├── events/            # Gestión de eventos, tarifas y personalización
│   │   │   ├── import/            # Motor de importación de Excel
│   │   │   ├── inventory/         # Inventario y control de entrega de camisetas
│   │   │   ├── participants/      # Directorio, fichas 360° y taquilla
│   │   │   └── qr/                # Generación y validación de entradas QR
│   │   └── server.ts              # Servidor Express
│   └── tests/                     # Suites de pruebas con Vitest
├── frontend/
│   ├── src/
│   │   ├── components/            # Componentes modulares y reutilizables
│   │   ├── context/               # Autenticación, Edición y Tema
│   │   ├── pages/                 # Vistas principales de la aplicación
│   │   ├── services/              # Clientes de API REST (Axios)
│   │   └── types/                 # Interfaces y tipos de TypeScript
│   └── index.html
├── scripts/                       # Herramientas de respaldo y restauración DB
├── docker-compose.yml             # Orquestación de contenedores
├── .env.example                   # Plantilla de variables de entorno
└── README.md                      # Documentación del proyecto
```

---

## 📧 Módulo de Comunicaciones y Robustez Operativa (QA)

EventGrid cuenta con un subsistema completo de comunicaciones y transacciones atómicas de alta concurrencia:

### 1. Sistema Centralizado de Comunicaciones y Envíos Masivos
- **Administración SMTP:** Configurable por edición o a nivel global desde **Administración → Configuración de correo**, con cifrado autenticado en reposo (**AES-256-GCM**) y selector de alcance.
- **Redactar y Enviar:** Envío directo e individual con soporte de tokens QR persistentes (`{{qrImageUrl}}`, `{{qrCode}}`) y variables contextuales (`{{participantName}}`, `{{eventName}}`, etc.).
- **7 Plantillas Base Preconfiguradas:** Confirmación de inscripción, entrada digital con QR, actualización de datos, recordatorio previo, agradecimiento post-evento, cobro pendiente y notificación general.
- **Previsualización Segura (Sandboxed Preview):** Vista previa aislada en iframe seguro (`sandbox="" - srcdoc`) con datos dinámicos sin persistencia en base de datos.
- **Asistente de Envíos Masivos por Lotes:** Wizard paso a paso para envíos segmentados (`Todos`, `Confirmados`, `Pagados`, `Pendientes`, etc.) con procesamiento por lotes (`chunks` de 25), trazabilidad con identificador único (`batchId`) y sin límites artificiales de 200 destinatarios.
- **Historial y Auditoría Centralizada:** Registro detallado de envíos (`EmailLog`) con filtros por estado (`SENT`, `SIMULATED`, `FAILED`), edición, fecha, búsqueda textual y código de lote.

### 2. Control de Concurrencia y Transacciones Atómicas
- **Check-in Concurrente:** Bloqueo atómico y transacciones que evitan check-ins duplicados simultáneos, manteniendo la independencia del estado de inscripción (`PENDING` nunca muta erróneamente a `CONFIRMED`).
- **Inventario de Camisetas Atómico:** Protección contra sobregiros e inventario negativo durante entregas simultáneas (`deliveredQuantity < initialQuantity`) y validación estricta de tallas activas.
- **Escaneo QR en Dispositivos Móviles:** Lector de cámara nativo integrado (`html5-qrcode`) con selección de entorno frontal/trasero y regla estricta: el escaneo QR valida la entrada sin marcar automáticamente la asistencia hasta la confirmación expresa del operador.

---

## 🔐 Acceso al Sistema (Entorno de Desarrollo)

| Rol | Correo Electrónico | Contraseña de Prueba | Permisos Principales |
| :--- | :--- | :--- | :--- |
| **Administrador** | `admin@eventgrid.io` | `EventGrid2026!Admin` | Control total, configuración de eventos, tarifas, inventario, cortesías, cancelaciones, reversión de asistencia y auditoría. |
| **Operador** | `operador@eventgrid.io` | `EventGrid2026!Op` | Check-in en recepción con registro de tallas, entregas de camisetas, ventas en taquilla, cobro de abonos, importación de Excel y registro de participantes. |
| **Consulta** | `consulta@eventgrid.io` | `EventGrid2026!View` | Supervisión del tablero de métricas (Dashboard), listados de asistencia y consulta de participantes en modo de solo lectura. |

---

## 📄 Licencia

**EventGrid Platform**. Software para gestión integral de eventos y participantes. Todos los derechos reservados.
