# EventGrid — Sistema de Gestión de Eventos y Participantes
### Plataforma Administrativa Oficial para BarCamp RD

**EventGrid** es una plataforma web administrativa modular, segura y de alto rendimiento diseñada para la gestión integral de registros, control de asistencia en recepción, conciliación de pagos, importación masiva de datos y administración multiedición del evento tecnológico **BarCamp RD**, celebrado en la **Pontificia Universidad Católica Madre y Maestra (PUCMM)**, Santiago de los Caballeros, República Dominicana.

Inspirada en las mejores prácticas operativas y de auditoría de plataformas como Eventbrite, **EventGrid** está optimizada para la operación logística en mesa de recepción, reemplazando las hojas de cálculo tradicionales por una base de datos relacional robusta con sincronización en tiempo real.

---

## 🚀 Capacidades y Módulos Principales

### 1. Control de Asistencia y Recepción en Tiempo Real (Check-in)
* **Flujo Seguro en Dos Pasos**: La búsqueda y selección de participantes abre su Ficha Oficial. Se evita cualquier marcaje accidental directamente desde la lista o mediante la tecla `Enter`.
* **Ficha Oficial 360°**: Visualización organizada en 4 secciones:
  1. *Información Personal*: Datos de contacto, documento de identidad e institución/empresa.
  2. *Información de Inscripción*: Edición, tipo de entrada, origen del registro y observaciones.
  3. *Información Financiera*: Desglose de tarifa, montos pagados, balances pendientes y libro de pagos.
  4. *Control de Entrada*: Marcaje físico con botón dedicado, hora exacta y operador responsable.
* **Métricas en Vivo**: Contadores instantáneos de *Total Registrados*, *Asistieron* y *Pendientes por Llegar* con porcentaje de participación.
* **Reversión Administrativa**: Reversión de asistencias exclusiva para Administradores con justificación obligatoria en bitácora.

### 2. Directorio de Participantes y Gestión Multiedición
* **Aislamiento Multiedición**: Cada edición (BarCamp 2024, 2025, 2026 y futuras) mantiene sus registros independientes, permitiendo consultar el historial interanual de cada persona.
* **Tabla Administrativa Avanzada**: Búsqueda universal, filtros por forma de pago, estado o cortesía, ordenamiento por columnas y selección de campos visibles.
* **Exportación Profesional**: Descarga de reportes completos en formato Microsoft Excel (`.xlsx`) y CSV con formato y anchos de columna automáticos.

### 3. Taquilla y Ventas Presenciales («Nueva Venta»)
* **Punto de Venta Integrado**: Registro de ventas presenciales en recepción con generación automática de número de ticket correlativo (ej. `BC26-0042`).
* **Tarifas y Tipos de Entrada**: Configuración de entradas (Preventa, General, Cortesía) con captura de precios congelados en el momento de la emisión.
* **Cálculo Financiero Dinámico**: Cálculo en tiempo real de tarifa, monto recibido, monto a cobrar, **cambio a devolver** y **balance pendiente**.
* **Gestión de Abonos y Pagos Parciales**: Libro contable por participante para liquidar saldos pendientes.

### 4. Políticas de Cortesías y Cancelaciones
* **Cortesías Oficiales**: Exentas de cobro (RD$ 0.00), excluidas de la recaudación neta del evento, con registro obligatorio de autorizador, motivo y fecha.
* **Cancelación No Destructiva**: Los registros cancelados conservan sus datos y pagos históricos sin borrado físico ni reembolsos automáticos sin comprobación.

### 5. Motor de Importación Inteligente de Excel (6 Pasos)
* Compatible con formatos `.xlsx`, `.xls` y `.csv`.
* Diccionario de alias lingüísticos para detección automática de cabeceras históricas de BarCamp.
* Mapeo visual interactivo, vista previa y validación previa de integridad.
* Estrategias configurables de resolución de duplicados (Omitir, Actualizar o Solo Nuevos).

### 6. Control de Acceso (RBAC) y Seguridad
* Autenticación basada en sesiones y tokens JWT seguros con cookies `HttpOnly`.
* Tres roles claramente definidos: **Administrador**, **Operador** y **Consulta**.
* Bitácora de Auditoría para trazabilidad de creación, edición, pagos, exportaciones y reversiones.

---

## 🛠️ Stack Tecnológico

| Capa | Tecnologías |
| :--- | :--- |
| **Frontend** | React 18, TypeScript, Vite, Tailwind CSS, Lucide Icons, Recharts |
| **Backend** | Node.js, Express, TypeScript, Zod, JWT, bcryptjs, Cookie-Parser |
| **Base de Datos** | PostgreSQL 16 (Producción / Docker) y SQLite (Entorno de desarrollo local) |
| **ORM** | Prisma ORM 6 (Migraciones, Client, Relaciones tipadas) |
| **Hojas de Cálculo** | SheetJS (`xlsx`) para lectura y generación de archivos binarios |
| **Pruebas** | Vitest para pruebas unitarias e integración de API |
| **Despliegue** | Docker & Docker Compose |

---

## 📋 Requisitos del Sistema

- **Node.js**: v20.x o superior (LTS recomendado)
- **npm**: v10.x o superior
- **Docker y Docker Compose**: (Opcional, para ejecución en contenedores PostgreSQL)
- **Git**: Para control de versiones

---

## 💻 Instalación y Configuración Local

### 1. Clonar el Repositorio
```bash
git clone <URL_DEL_REPOSITORIO>
cd cool-mendel
```

### 2. Configurar Variables de Entorno
Copia el archivo de plantilla `.env.example` en la raíz y en el directorio `backend`:
```bash
cp .env.example .env
cp backend/.env.example backend/.env
```
> [!IMPORTANT]
> En entornos de producción, genera claves aleatorias seguras para `JWT_SECRET` y `COOKIE_SECRET` (por ejemplo con `openssl rand -hex 32`).

### 3. Instalar Dependencias
```bash
# Dependencias raíz
npm install

# Dependencias de Backend y Frontend
npm install --prefix backend
npm install --prefix frontend
```

### 4. Inicializar Base de Datos con Prisma
```bash
cd backend

# Generar cliente de Prisma
npx prisma generate

# Sincronizar esquema de base de datos
npx prisma db push

# Poblar ediciones, métodos de pago, tipos de entrada y usuarios iniciales
npm run prisma:seed

cd ..
```

### 5. Iniciar Servidores de Desarrollo
Puedes iniciar ambos servicios concurrentemente o por separado:

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

Para ejecutar el ecosistema completo (Base de datos PostgreSQL + Backend API + Frontend Nginx):

```bash
docker compose up -d --build
```

Para detener los servicios:
```bash
docker compose down
```

---

## 🧪 Pruebas Automatizadas

El proyecto cuenta con suites de pruebas automatizadas que validan RBAC, control de asistencia, ventas presenciales, balances y el motor de importación:

```bash
cd backend
npx vitest run
```

---

## 📁 Estructura del Proyecto

```
EventGrid/
├── backend/
│   ├── prisma/
│   │   ├── schema.prisma          # Esquema relacional PostgreSQL / Prisma
│   │   ├── schema.sqlite.prisma   # Esquema local para desarrollo
│   │   ├── seed.ts                # Inicialización de usuarios y ediciones BarCamp
│   │   ├── seed_participants.ts   # Generación de participantes de prueba
│   │   └── seed_ticket_types.ts   # Tipos de entrada y tarifas
│   ├── src/
│   │   ├── config/                # Conexión DB y configuración de entorno
│   │   ├── middleware/            # JWT Auth, RBAC, auditoría y errores
│   │   ├── modules/
│   │   │   ├── attendance/        # Lógica de Check-in y reversión
│   │   │   ├── auth/              # Inicio, cierre de sesión y tokens
│   │   │   ├── events/            # Multiedición, personalización y tarifas
│   │   │   ├── import/            # Motor de análisis e importación Excel
│   │   │   └── participants/      # Directorio, ventas presenciales y abonos
│   │   └── server.ts              # Punto de entrada del servidor Express
│   └── tests/                     # Suites de pruebas con Vitest
├── frontend/
│   ├── src/
│   │   ├── components/            # Componentes reutilizables y modales
│   │   │   ├── attendance/        # Modales de asistencia
│   │   │   ├── common/            # Header, Sidebar, Layout, Rutas protegidas
│   │   │   ├── participants/      # Ficha 360°, abonos y cortesías
│   │   │   └── sales/             # Punto de venta presencial (OnsiteSaleModal)
│   │   ├── context/               # Contextos de Autenticación, Edición y Tema
│   │   ├── pages/                 # Páginas de la aplicación administrativa
│   │   ├── services/              # Clientes de API REST (Axios)
│   │   └── types/                 # Definiciones de TypeScript
│   └── index.html
├── docker-compose.yml             # Orquestación de contenedores
├── .env.example                   # Plantilla de variables de entorno
└── README.md                      # Documentación del proyecto
```

---

## 🔐 ACCESO AL SISTEMA (Entorno de Desarrollo)

| Rol | Correo Electrónico | Contraseña de Prueba | Permisos Principales |
| :--- | :--- | :--- | :--- |
| **Administrador** | `admin@barcamp.org.do` | `Admin123!` | Control total, configuración de ediciones, tarifas, cortesías, cancelaciones, reversión de asistencia y auditoría. |
| **Operador** | `operador@barcamp.org.do` | `Operador123!` | Check-in en mesa de recepción, ventas presenciales, cobro de abonos, importación de Excel y registro de participantes. |
| **Consulta** | `consulta@barcamp.org.do` | `Consulta123!` | Modo lectura para monitorear métricas, consultar fichas de participantes y exportar reportes sin permisos de escritura. |

---

## 📄 Licencia

Desarrollado para el comité organizador de **BarCamp RD** en la **Pontificia Universidad Católica Madre y Maestra (PUCMM)**. Todos los derechos reservados.
