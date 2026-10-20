# EventGrid — Plataforma de Gestión de Eventos y Participantes

**EventGrid** es una plataforma de software independiente, multifuncional y adaptable diseñada para la gestión integral de eventos de diferentes tipos, formatos y tamaños: conferencias académicas, desconferencias tecnológicas, congresos empresariales, festivales y talleres prácticos.

La plataforma centraliza en un único entorno modular y seguro la administración de participantes, inscripciones, taquilla y ventas presenciales, conciliación de pagos, importación masiva de datos, control de asistencia en tiempo real (Check-in), auditoría de operaciones y gestión multievento.

> [!NOTE]
> **EventGrid** es un software neutral e independiente. Puede alojar simultáneamente múltiples ediciones y eventos independientes (como **BarCamp RD**, cumbres técnicas o simposios institucionales), manteniendo para cada uno su propia identidad visual, catálogos, tarifas, participantes y libros contables de forma estrictamente aislada.

---

## 🚀 Capacidades y Módulos Principales

### 1. Control de Asistencia y Recepción en Vivo (Check-in)
* **Flujo Seguro en Dos Pasos**: Búsqueda universal por nombre, documento, correo, teléfono o código de ticket. La selección abre la **Ficha Oficial 360°** del participante, eliminando marcajes accidentales desde listas o mediante teclas rápidas.
* **Ficha Oficial 360°**: Visualización integral organizada en:
  1. *Identidad*: Nombres, apellidos, documento de identidad, empresa/institución y vías de contacto.
  2. *Inscripción*: Edición activa, tipo de entrada asignada, fecha de registro y notas.
  3. *Finanzas*: Tarifa oficial, monto pagado, balance pendiente y libro de pagos.
  4. *Control de Acceso*: Marcaje físico de llegada con registro de fecha, hora exacta y operador responsable.
* **Edición Directa en Ficha**: Capacidad de actualizar datos de contacto directamente en la ficha lateral con botones de navegación rápida (`Anterior` / `Siguiente`) entre asistentes.
* **Separación Estricta de Estados**: Tres dimensiones independientes por registro:
  - **Estado de Inscripción**: `CONFIRMED`, `PENDING`, `CANCELLED`.
  - **Estado de Pago**: `PAID`, `PARTIAL`, `PENDING`, `COURTESY`.
  - **Estado de Asistencia**: `attended: boolean` con fecha y auditoría.
* **Reversión Administrativa**: Reversión controlada de asistencia exclusiva para administradores con justificación obligatoria en la bitácora de seguridad.
* **Mesa de Recepción**: Widget en vivo de ventas del día y monitoreo de conectividad con el servidor (*En línea / Sin conexión*).

### 2. Directorio de Participantes y Gestión Multievento
* **Aislamiento Multiedición**: Cada evento o edición conserva su base de datos de inscripciones de forma independiente, posibilitando el análisis del historial multianual de asistencia por persona.
* **Tabla Administrativa Avanzada**: Búsqueda global, filtros combinados por estado de inscripción, estado de pago o cortesías, ordenación multicriterio, paginación en servidor y personalización de columnas visibles.
* **Exportación de Reportes**: Generación de reportes tabulares en formato Microsoft Excel (`.xlsx`) y CSV con formato profesional y encabezados tipados.

### 3. Taquilla y Ventas Presenciales (Punto de Venta)
* **Venta en Puerta**: Emisión de tickets correlativos con prefijo personalizable por evento (ej. `BC26-0001`, `CONF-0042`).
* **Tarifas y Congelación de Precios**: Tipos de entrada con captura de precios históricos en el momento de la venta, garantizando que cambios posteriores de tarifas no alteren ventas previas.
* **Cálculo Financiero Dinámico**: Cálculo instantáneo de tarifa, monto recibido, cambio a devolver y balance pendiente.
* **Gestión de Abonos**: Registro progresivo de pagos parciales hasta liquidar la totalidad de la entrada.

### 4. Políticas de Cortesías y Cancelaciones
* **Cortesías Oficiales**: Entradas exentas de pago (RD$ 0.00), excluidas de la recaudación neta del evento, con registro mandatorio del autorizador y motivo de otorgamiento.
* **Cancelación No Destructiva**: Los registros cancelados conservan su trazabilidad histórica sin borrado físico ni alteraciones injustificadas en la contabilidad.

### 5. Motor de Importación Inteligente de Datos (6 Pasos)
* Compatible con formatos `.xlsx`, `.xls` y `.csv`.
* Diccionario lingüístico de alias para autodetección inteligente de encabezados de columnas.
* Asignación visual e interactiva de campos, validación estructural de tipos de datos e informe de errores previo a la inserción.
* Estrategias configurables de resolución de duplicados (*Omitir*, *Actualizar datos* o *Importar únicamente registros nuevos*).

### 6. Personalización de Identidad Visual y Logos
* **Logotipos por Evento**: Carga directa de imágenes oficiales (PNG, JPG, WEBP, SVG hasta 2MB) con previsualización en caliente y eliminación segura.
* **Motor Temático Dinámico**: Personalización de colores primarios, secundarios, color de acento, fondos, prefijos de tickets y subtítulos institucionales aplicados en tiempo real a la interfaz sin necesidad de recompilar.

### 7. Historial de Actividad, Auditoría y Seguridad (RBAC)
* **Control de Acceso Basado en Roles (RBAC)**:
  - **Administrador (`ADMIN`)**: Control operativo y de configuración total.
  - **Operador (`OPERATOR`)**: Operación de taquilla, registro, check-in e importación.
  - **Consulta (`VIEWER`)**: Supervisión de estadísticas y reportes en modo de solo lectura.
* **Bitácora Inmutable (`/audit` y `/activity`)**: Registro detallado de acciones, usuario responsable, dirección IP, entidad afectada y diff en formato JSON de los cambios efectuados.
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
| **Pruebas Automatizadas** | Vitest (58 pruebas unitarias y de integración) |
| **Despliegue** | Docker & Docker Compose |

---

## 📋 Requisitos del Sistema

- **Node.js**: v20.x o superior (LTS recomendado)
- **npm**: v10.x o superior
- **Docker y Docker Compose**: (Opcional, para ejecución en contenedores)
- **Git**: Para control de versiones

---

## 💻 Instalación y Ejecución Local

### 1. Clonar el Repositorio
```bash
git clone https://github.com/IvanPaul1515/EventGrid.git
cd EventGrid
```

### 2. Configurar Variables de Entorno
```bash
cp .env.example .env
cp backend/.env.example backend/.env
```

### 3. Instalar Dependencias
```bash
npm install
npm install --prefix backend
npm install --prefix frontend
```

### 4. Inicializar Base de Datos con Prisma
```bash
cd backend
npx prisma generate
npx prisma db push
npm run prisma:seed
cd ..
```

### 5. Iniciar Servidores de Desarrollo
```bash
# Terminal 1: Backend API (Puerto 4000)
npm run dev:backend

# Terminal 2: Frontend Web (Puerto 5173)
npm run dev:frontend
```

El sistema estará accesible en:
- **Frontend Web**: [http://localhost:5173](http://localhost:5173)
- **Backend API**: [http://localhost:4000/api/v1](http://localhost:4000/api/v1)
- **Health Check**: [http://localhost:4000/api/v1/health](http://localhost:4000/api/v1/health)

---

## 🐳 Despliegue con Docker Compose (Producción)

```bash
docker compose up -d --build
```

Para detener los contenedores:
```bash
docker compose down
```

---

## 🧪 Pruebas Automatizadas

El proyecto cuenta con 8 suites de pruebas que validan autenticación, RBAC, control de asistencia, ventas presenciales, balances contables y el motor de importación:

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
│   ├── scripts/                   # Scripts de migración interna
│   ├── src/
│   │   ├── config/                # Base de datos y entorno
│   │   ├── middleware/            # JWT, RBAC, auditoría y errores
│   │   ├── modules/
│   │   │   ├── activity/          # Bitácora de actividad y auditoría
│   │   │   ├── attendance/        # Lógica de Check-in y reversión
│   │   │   ├── auth/              # Autenticación y credenciales
│   │   │   ├── events/            # Gestión de eventos, tarifas y logos
│   │   │   ├── import/            # Motor de importación de Excel
│   │   │   └── participants/      # Directorio, fichas 360° y taquilla
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

## 🔐 ACCESO AL SISTEMA (Entorno de Desarrollo)

| Rol | Correo Electrónico | Contraseña de Prueba | Permisos Principales |
| :--- | :--- | :--- | :--- |
| **Administrador** | `admin@barcamp.org.do` | `BarCamp2026!Admin` | Control total, configuración de eventos, tarifas, cortesías, cancelaciones, reversión de asistencia y auditoría. |
| **Operador** | `operador@barcamp.org.do` | `BarCamp2026!Op` | Check-in en recepción, ventas en taquilla, cobro de abonos, importación de Excel y registro de participantes. |
| **Consulta** | `consulta@barcamp.org.do` | `BarCamp2026!View` | Supervisión del tablero de métricas (Dashboard), listados de asistencia y consulta de participantes en modo de solo lectura. |

---

## 📄 Licencia

**EventGrid Platform**. Software para gestión integral de eventos y participantes. Todos los derechos reservados.
