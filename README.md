# ERP CRM Pro — Multi-Canal Profesional

Sistema ERP + CRM moderno y escalable con arquitectura multi-canal dinámica.

## Stack Tecnológico

- **Frontend**: Next.js 15 · TypeScript · TailwindCSS · Shadcn/UI · Zustand · TanStack Table
- **Backend**: Next.js API Routes · Prisma ORM
- **Base de datos**: PostgreSQL 16
- **Auth**: JWT + Refresh Tokens + RBAC
- **Deploy**: Docker + Docker Compose + Nginx

## Inicio rápido (Desarrollo)

### 1. Requisitos previos
- Node.js 20+
- Docker & Docker Compose
- PostgreSQL (o usar Docker)

### 2. Clonar y configurar

```bash
git clone <repo>
cd erp-crm
cp .env.example .env
# Editar .env con tus valores
```

### 3. Levantar base de datos (Docker)

```bash
docker-compose -f docker-compose.dev.yml up -d
```

### 4. Instalar dependencias y generar Prisma

```bash
npm install
npx prisma generate
npx prisma migrate dev --name init
npx tsx prisma/seed.ts
```

### 5. Iniciar servidor de desarrollo

```bash
npm run dev
```

Abrir http://localhost:3000

## Deploy en producción (Docker)

### 1. Configurar variables de entorno

```bash
cp .env.example .env
# Editar .env con valores de producción seguros
```

Variables obligatorias:
```
DATABASE_URL=postgresql://user:password@host:5432/erp_crm
JWT_SECRET=min-32-chars-aleatorio
JWT_REFRESH_SECRET=min-32-chars-diferente
NEXT_PUBLIC_APP_URL=https://tu-dominio.com
```

### 2. Construir y levantar

```bash
docker-compose build
docker-compose up -d
```

### 3. Migrar y sembrar datos

```bash
docker-compose exec app npx prisma migrate deploy
docker-compose exec app npx tsx prisma/seed.ts
```

## Credenciales de prueba

| Usuario | Email | Password | Rol |
|---------|-------|----------|-----|
| Super Admin | superadmin@erp.local | Admin1234! | Super Admin |
| Admin | admin@erp.local | Admin1234! | Admin |
| Manager | manager@erp.local | Admin1234! | Manager |
| Empleado | employee@erp.local | Admin1234! | Empleado |

## Módulos

### CRM Multi-Canal
- Arquitectura basada en canales (`crm_channels` table)
- Canales activos por defecto: Instagram, Reddit
- Estructura común por canal: Dashboard · Leads · Conversaciones · Seguimientos · Ventas · Tareas · Reportes
- Nuevos canales desde Administración → sin modificar código

### Usuarios y RBAC
- Roles: Super Admin · Admin · Manager · Empleado
- Acceso por canal: tabla `user_channel_access` (N:M)
- Sidebar dinámica según permisos

### Incidencias
- Formulario para empleados
- Panel de gestión para Admin/Manager
- Sistema de comentarios e historial de cambios

### Administración
- Crear/editar/activar/desactivar canales CRM
- Gestión de roles y permisos

## Estructura del proyecto

```
src/
├── app/
│   ├── (auth)/login/          # Autenticación
│   ├── (dashboard)/
│   │   ├── dashboard/         # Resumen general
│   │   ├── crm/[channel]/     # Módulos CRM dinámicos
│   │   ├── users/             # Gestión de usuarios
│   │   ├── incidents/         # Incidencias
│   │   └── admin/             # Administración
│   └── api/                   # API Routes
├── components/
│   ├── layout/                # Sidebar, Header
│   └── ui/                    # Componentes reutilizables
├── lib/
│   ├── auth/                  # JWT, middleware, activity
│   └── prisma/                # Cliente Prisma
├── store/                     # Zustand stores
├── hooks/                     # Custom hooks
└── types/                     # TypeScript types
prisma/
├── schema.prisma              # Esquema completo
└── seed.ts                    # Datos iniciales
docker/
├── nginx/                     # Config Nginx
└── postgres/                  # Init SQL
```

## Añadir un nuevo canal CRM

1. Ir a **Administración → Canales CRM**
2. Clic en **Nuevo canal**
3. Rellenar: nombre, slug, icono, color
4. Activar el canal
5. Ir a **Usuarios** → asignar acceso al canal
6. El canal aparece automáticamente en la sidebar

No es necesario modificar código.

## Seguridad

- JWT Access Token (15min) + Refresh Token (7 días)
- RBAC por endpoint (middleware `requirePermission`)
- Rate limiting en Nginx (30 req/min API, 10 req/min auth)
- Logs de auditoría en `activity_logs`
- Soft delete de usuarios y leads
- bcrypt con coste 12 para contraseñas
- CSRF protection vía same-origin headers
