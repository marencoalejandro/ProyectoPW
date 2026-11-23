# Orígenes SV · ERP y POS para restaurante

Sistema web de gestión para **Restaurante Orígenes SV** (El Salvador), con tres sucursales de ejemplo. Cubre el ciclo completo de la operación diaria:

- **Punto de venta (POS)** con *Factura* y *Comprobante de Crédito Fiscal (CCF)*, IVA 13 % y pago en efectivo, tarjeta o Bitcoin/Chivo Wallet.
- **Caja por turnos**: apertura con fondo inicial, arqueo por medio de pago y cierre con diferencias.
- **Inventario por receta y por sucursal**, con descuento automático en cada venta, alertas de stock mínimo y kardex de movimientos.
- **Compras y cuentas por pagar**, con proveedores, facturas de contado o crédito y control de vencimientos.
- **Recursos humanos y planilla quincenal** (ISSS, AFP y renta).
- **Reportes** de ventas por día, sucursal, medio de pago y tipo de documento, y productos más vendidos.

---

## Contenido

1. [Arquitectura](#arquitectura)
2. [Estructura del repositorio](#estructura-del-repositorio)
3. [Requisitos](#requisitos)
4. [Puesta en marcha](#puesta-en-marcha)
5. [Variables de entorno](#variables-de-entorno)
6. [Usuarios de demostración](#usuarios-de-demostración)
7. [Roles y permisos](#roles-y-permisos)
8. [Backend](#backend)
9. [Frontend](#frontend)
10. [Base de datos](#base-de-datos)
11. [Reglas de negocio importantes](#reglas-de-negocio-importantes)
12. [Seguridad](#seguridad)
13. [Pruebas](#pruebas)
14. [Scripts disponibles](#scripts-disponibles)
15. [Documentación relacionada](#documentación-relacionada)
16. [Solución de problemas](#solución-de-problemas)

---

## Arquitectura

```
┌────────────────────┐   HTTP + cookies HttpOnly   ┌────────────────────┐    SQL     ┌──────────────┐
│  Frontend (SPA)    │ ──────────────────────────▶ │  Backend (API REST)│ ─────────▶ │  PostgreSQL  │
│  React + Vite      │ ◀────────────────────────── │  Node.js + Express │ ◀───────── │  15+         │
│  :5173             │   JSON  /api/v1             │  :3000             │            │              │
└────────────────────┘                             └────────────────────┘            └──────────────┘
```

| Capa | Tecnologías |
|---|---|
| Frontend | React 19, Vite 8, Tailwind CSS 4, React Router 7, Axios, Headless UI, Framer Motion, React Hot Toast, Lucide React, React Compiler |
| Backend | Node.js ≥ 22 (ESM), Express 5, `pg`, Zod 4, `jsonwebtoken`, `bcryptjs`, Helmet, CORS, `express-rate-limit`, `cookie-parser` |
| Base de datos | PostgreSQL ≥ 15 (SQL plano: esquema, migraciones y datos de demostración) |
| Pruebas | `node:test` + `supertest` (integración contra PostgreSQL real) |

### Recorrido de una petición

```
routes ──▶ middlewares (sesión · rol · CSRF · sucursal) ──▶ controller (valida con Zod)
       ──▶ service (reglas de negocio y transacción)    ──▶ repository (SQL parametrizado)
```

Cada módulo del backend sigue esa misma separación, de modo que la lógica de negocio vive solo en `service` y el SQL solo en `repository`.

---

## Estructura del repositorio

```
.
├── README.md                     ← este documento
├── backend/                      API REST (Express)
│   ├── package.json
│   ├── .env.example
│   ├── scripts/
│   │   ├── db-setup.js           crea la BD, aplica esquema y migraciones
│   │   ├── db-reset.js           reinicia datos y carga la demo
│   │   └── lib/migrator.js       motor de migraciones
│   ├── src/
│   │   ├── server.js             arranque (puerto, cierre ordenado)
│   │   ├── app.js                construcción de la app Express
│   │   ├── config/env.js         lectura y validación de variables de entorno
│   │   ├── db/pool.js            pool de PostgreSQL y transacciones
│   │   ├── lib/                  errors, money, validate, cookies
│   │   ├── middleware/           auth, csrf, error, rateLimit, sucursal
│   │   └── modules/
│   │       ├── auth/             login, refresh, logout, tokens, sesiones
│   │       ├── sucursales/
│   │       ├── clientes/         clientes fiscales (CCF)
│   │       ├── inventario/       platillos, insumos, recetas, stock, kardex
│   │       ├── caja/             turnos y arqueo
│   │       ├── ventas/           registro, consulta y anulación
│   │       ├── compras/          proveedores, compras y pagos
│   │       ├── nomina/           empleados y planilla quincenal
│   │       └── reportes/
│   └── tests/integration/        auth, pos, operaciones, backoffice
├── frontend/                     SPA (React + Vite)
│   ├── package.json
│   ├── .env.example
│   ├── GUIA_COMPONENTES_FRONTEND.md
│   ├── public/
│   └── src/
│       ├── main.jsx · App.jsx    arranque y enrutado (carga diferida)
│       ├── api/                  cliente Axios y un archivo por módulo
│       ├── auth/access.js        reglas de acceso por rol (menú y rutas)
│       ├── context/              AuthContext y ProtectedRoute
│       ├── hooks/                useResource, useSucursales
│       ├── lib/                  format, money, masks, forms, apiError
│       ├── components/           ui/, caja/, layouts/, RequireAccess
│       ├── pages/                Auth, Caja, Inventario, Compras, RRHH, Reportes
│       └── styles/index.css      Tailwind y tipografía Oxygen
├── database/
│   ├── schema.sql                línea base del esquema
│   ├── seeds.sql                 datos de demostración
│   ├── reset.sql                 vaciado de datos
│   ├── migrations/               cambios incrementales (AAAAMMDD_NN_nombre.sql)
│   └── diagnosticos/             consultas de apoyo (CCF históricos)
└── docs/
    └── contratos-api.md          contratos de la API (rutas, entradas y salidas)
```

---

## Requisitos

- **Node.js 22** o superior
- **PostgreSQL 15** o superior
- npm (incluido con Node.js)

---

## Puesta en marcha

### 1. Crear el rol de PostgreSQL (una sola vez)

En `psql`, con un usuario administrador:

```sql
CREATE ROLE origenes_app LOGIN PASSWORD 'una-contraseña-larga' CREATEDB;
```

El permiso `CREATEDB` permite que los scripts creen la base de datos de la aplicación y la de pruebas.

### 2. Backend

```powershell
cd backend
copy .env.example .env     # completar DB_PASSWORD, JWT_SECRET y CSRF_SECRET
npm install
npm run db:setup           # crea la BD, instala el esquema y aplica migraciones
npm run db:reset           # opcional: carga los datos de demostración (borra los datos actuales)
npm run dev                # API en http://localhost:3000/api/v1
```

Para generar cada secreto (`JWT_SECRET` y `CSRF_SECRET`, distintos entre sí):

```powershell
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

### 3. Frontend

```powershell
cd frontend
copy .env.example .env     # VITE_API_URL=http://localhost:3000/api/v1
npm install
npm run dev                # http://localhost:5173
```

Abrir `http://localhost:5173` e iniciar sesión con un [usuario de demostración](#usuarios-de-demostración).

---

## Variables de entorno

Los archivos `.env` **nunca** se versionan; solo las plantillas `.env.example`.

### `backend/.env`

| Variable | Valor por defecto | Descripción |
|---|---|---|
| `NODE_ENV` | `development` | Entorno de ejecución. |
| `PORT` | `3000` | Puerto del API. |
| `API_PREFIX` | `/api/v1` | Prefijo común de todas las rutas. |
| `CORS_ORIGINS` | `http://localhost:5173` | Orígenes permitidos, separados por coma y sin `/` final. |
| `DB_HOST` · `DB_PORT` | `localhost` · `5432` | Servidor PostgreSQL. |
| `DB_NAME` | `restaurante_sv` | Base de la aplicación. |
| `DB_USER` · `DB_PASSWORD` | `origenes_app` · *(vacío)* | Credenciales. |
| `DB_SSL` | `false` | Conexión con SSL. |
| `DB_TIMEZONE` | `America/El_Salvador` | Zona horaria de las sesiones SQL. |
| `DB_NAME_TEST` | `origenes_test` | Base de `npm test`. **Se borra y recrea** en cada corrida; debe contener «test». |
| `JWT_SECRET` · `CSRF_SECRET` | *(vacío)* | Secretos largos y aleatorios (mínimo 32 caracteres). |
| `ACCESS_TOKEN_MINUTES` | `15` | Vida del token de acceso. |
| `REFRESH_TOKEN_DAYS` | `7` | Vida del token de renovación. |
| `COOKIE_SECURE` | `false` | Poner `true` en producción con HTTPS. |
| `COOKIE_SAMESITE` | `strict` | Usar `none` solo si frontend y API están en sitios distintos (exige `COOKIE_SECURE=true`). |

### `frontend/.env`

| Variable | Valor por defecto | Descripción |
|---|---|---|
| `VITE_API_URL` | `http://localhost:3000/api/v1` | URL base del API. |
| `VITE_APP_URL` | `http://localhost:5173` | URL pública de la aplicación. |
| `VITE_APP_NAME` | `Origenes SV` | Nombre mostrado. |

---

## Usuarios de demostración

Tras `npm run db:reset` existen tres sucursales (**Central**, **Escalón** y **Santa Tecla**), con menú, insumos, recetas, ventas, compras y planillas de ejemplo. **Todos los usuarios usan la contraseña `Admin1234`.**

| Correo | Rol | Cargo | Sucursal |
|---|---|---|---|
| `admin@origenes.sv` | ADMIN | Gerente | *(ninguna: administración central)* |
| `gerente.central@origenes.sv` | ADMIN | Gerente | Central |
| `gerente.escalon@origenes.sv` | ADMIN | Gerente | Escalón |
| `gerente.santatecla@origenes.sv` | ADMIN | Gerente | Santa Tecla |
| `rrhh@origenes.sv` | RRHH | RRHH | Central |
| `prueba@origenes.sv` | EMPLEADO | Cajero | Central |
| `ana.rivas@origenes.sv`, `carlos.molina@origenes.sv`, `diego.alvarado@origenes.sv`… | EMPLEADO | Cajero / Barista | Según sucursal |

> Los datos y contraseñas de demostración son solo para desarrollo. No cargar `seeds.sql` en un entorno real.

---

## Roles y permisos

El acceso se decide por **rol** (`ADMIN`, `RRHH`, `EMPLEADO`) y por **sucursal**. El **cargo** (Cajero, Barista, Gerente, RRHH) es el puesto laboral y solo influye en abrir turnos.

| Rol | Puede |
|---|---|
| **ADMIN sin sucursal** (administración central) | Todo, en todas las sucursales. Es el único que modifica menú, insumos y recetas, y que crea cuentas ADMIN. No tiene caja propia. |
| **ADMIN con sucursal** (gerente) | Caja, ventas, **anulaciones**, inventario y ajustes, compras, proveedores y reportes **de su sucursal**; ver los empleados de su sucursal. |
| **RRHH** | Empleados y planilla de todas las sucursales. No accede a caja, ventas ni clientes. |
| **EMPLEADO** | Ventas, clientes y consulta de menú e inventario de su sucursal. Solo los cargos Cajero o Gerente abren turno. |

Un usuario con sucursal que pide datos de otra recibe `403`. La administración central puede indicar `sucursalId` en cada consulta.

### Pantallas del frontend

| Ruta | Pantalla | Roles |
|---|---|---|
| `/login` | Inicio de sesión | público |
| `/caja` | Turno de caja (apertura, arqueo y cierre) | Empleado, Admin |
| `/caja/pos` | Punto de venta | Empleado, Admin |
| `/caja/comprobantes` · `/caja/comprobantes/:id` | Comprobantes, reimpresión y anulación | Empleado, Admin |
| `/inventario` | Existencias, alertas, ajustes y kardex | Admin |
| `/menu` | Menú, recetas y precios | Admin |
| `/compras` · `/proveedores` | Compras, cuentas por pagar y proveedores | Admin |
| `/reportes` | Reportes de ventas y productos | Admin |
| `/empleados` | Gestión de personal | Admin, RRHH |
| `/planilla` | Planilla quincenal | RRHH, administración central |

La ruta de inicio depende del rol; la administración central entra por Inventario. El frontend solo oculta lo que no corresponde: **Express vuelve a validar todo**.

---

## Backend

### Módulos y rutas

Todas las rutas cuelgan de `API_PREFIX` (`/api/v1`). El detalle completo de entradas, salidas y errores está en [`docs/contratos-api.md`](docs/contratos-api.md).

| Módulo | Rutas principales |
|---|---|
| **auth** | `GET /auth/csrf` · `POST /auth/login` · `POST /auth/refresh` · `GET /auth/me` · `POST /auth/logout` |
| **sucursales** | `GET /sucursales` |
| **clientes** | `GET/POST /clientes` · `PUT /clientes/:id` |
| **inventario** | `/platillos` (+ `/:id`, `/:id/receta`) · `/insumos` · `/inventario` (+ `/alertas`, `/ajustes`, `/movimientos`) |
| **caja** | `POST /turnos` · `GET /turnos/actual` · `GET /turnos/:id` · `POST /turnos/:id/cierre` · `GET /turnos` |
| **ventas** | `POST /ventas` · `GET /ventas` · `GET /ventas/:id` · `POST /ventas/:id/anulacion` |
| **compras** | `/proveedores` · `/compras` (+ `PUT /compras/:id/pago`) |
| **nomina** | `/empleados` · `/planillas` |
| **reportes** | `GET /reportes/ventas` · `GET /reportes/productos` |

### Convenciones de la API

| Tema | Regla |
|---|---|
| Listados | `{ "items": [...] }` (algunos agregan `resumen` o `totales`). |
| Dinero y cantidades | Siempre **cadenas decimales** (`"3.50"`, `"18.000"`); nunca `float`. Internamente se calcula en centavos enteros. |
| Precios | `platillos.precio` es el precio al público **con IVA incluido**. |
| Fechas | Columnas de fecha como `"AAAA-MM-DD"`; fechas con hora en ISO 8601 UTC. |
| Errores | `{"error":{"code":"STOCK_INSUFICIENTE","message":"…","details":[…]}}` |
| Códigos HTTP | 400 datos inválidos · 401 sin sesión · 403 sin permiso o CSRF inválido · 404 no existe · 409 conflicto de negocio · 429 demasiados intentos |
| Escrituras | `POST`/`PUT` exigen el encabezado `X-CSRF-Token` (el cliente Axios lo agrega solo). |

Las respuestas `400 DATOS_INVALIDOS` incluyen `details: [{ campo, mensaje }]` para marcar los campos del formulario.

### Piezas transversales

- `lib/errors.js`: jerarquía `AppError` (`badRequest`, `unauthorized`, `forbidden`, `notFound`, `conflict`).
- `lib/validate.js`: esquemas Zod reutilizables (`id`, `fecha`, `decimal`, `texto`…) y `parse()`.
- `lib/money.js`: conversiones `toCents`/`fromCents` y desglose de IVA.
- `db/pool.js`: pool de `pg` y `withTransaction()`, que garantiza que cada operación de negocio sea atómica.
- `middleware/sucursal.js`: `resolverSucursal()` y `exigirAccesoSucursal()` aplican la regla de aislamiento por sucursal.

---

## Frontend

Aplicación de una sola página con **carga diferida por ruta** (`React.lazy`) y guardias de acceso.

- **`src/api/`**: instancia de Axios (`withCredentials`, CSRF automático, y renovación de sesión ante un `401` con una única llamada compartida entre peticiones simultáneas) más un archivo por módulo (`cajaApi`, `catalogoApi`, `comprasApi`, `rrhhApi`, `reportesApi`, `clientesApi`, `authApi`).
- **`src/auth/access.js`**: fuente única de las reglas de acceso; el menú lateral, las rutas protegidas y la redirección posterior al login consultan las mismas secciones.
- **`src/context/`**: `AuthContext` (sesión) y `ProtectedRoute`.
- **`src/pages/Caja/CajaProvider.jsx`**: comparte el turno abierto entre las pantallas de caja.
- **`src/components/ui/`**: biblioteca de componentes reutilizables (`Button`, `Field`, `Modal`, `DataTable`, `MaskedInput`, `BranchSelect`, `MetricCard`, `Feedback`…). Ver [`frontend/GUIA_COMPONENTES_FRONTEND.md`](frontend/GUIA_COMPONENTES_FRONTEND.md).
- **`MaskedInput`**: máscaras para DUI, NIT, NRC y teléfono salvadoreños.
- **Estilos**: Tailwind CSS 4 con tipografía **Oxygen** (licencia OFL incluida en `src/assets/fonts/oxygen/`).

Comandos: `npm run dev`, `npm run build`, `npm run preview`, `npm run lint`.

---

## Base de datos

### Modelo

Tablas principales del esquema (`database/schema.sql`):

| Área | Tablas |
|---|---|
| Organización | `sucursales`, `usuarios` |
| Catálogo e inventario | `platillos`, `insumos`, `recetas`, `inventario_sucursal` (+ movimientos/kardex) |
| Caja y ventas | `turnos_caja`, `ventas`, `detalle_venta`, clientes fiscales |
| Compras | `proveedores`, `compras`, `detalle_compra` |
| Planilla | `pagos_planilla` |
| Seguridad y control | sesiones revocables, `schema_migrations` |

### Migraciones

- `npm run db:setup` en una base **vacía** ejecuta `database/schema.sql` (línea base; ya incluye las migraciones `20261110` y `20261119`) y luego las migraciones posteriores.
- En una base **existente**, `npm run db:migrate` detecta qué migraciones históricas ya están aplicadas y ejecuta solo las pendientes. Todo queda registrado en `schema_migrations`.
- `npm run db:reset` vacía los datos (`reset.sql`) y carga la demo (`seeds.sql`). **Borra los datos actuales.**

| Migración | Propósito |
|---|---|
| `20261110_cuadre_medios` | Cuadre de caja por medio de pago. |
| `20261119_validaciones_compras` | Restricciones de compras. |
| `20261121_01_cliente_ccf` | Clientes fiscales para CCF. |
| `20261121_02_ccf_con_cliente` | Regla «todo CCF tiene cliente». |
| `20261121_03_sesiones` | Sesiones de usuario revocables. |
| `20261121_04_turno_abierto_unico` | Un cajero no puede tener dos turnos abiertos en la misma sucursal. |
| `20261121_05_ventas_idempotencia` | Clave de operación para reintentos de venta. |
| `20261121_06_indices_consulta` | Índices para consultas frecuentes. |
| `20261121_07_anulacion_y_movimientos` | Anulación de ventas y kardex. |

`20261121_02` crea la regla «todo CCF tiene cliente» como `NOT VALID` si existen CCF históricos sin ficha: se aplica a toda venta nueva y las antiguas se vinculan con `database/diagnosticos/clientes_ccf_historicos.sql` antes de validarla.

---

## Reglas de negocio importantes

### Ventas e IVA

- El servidor decide precio, número de documento, IVA y datos fiscales; el navegador solo envía ids y cantidades.
- `total` = suma de líneas; `subtotal` = `total / 1.13` redondeado a centavos; `iva` = `total − subtotal`.
- Todo ocurre en **una transacción**: si falta un insumo no se guarda nada (`409 STOCK_INSUFICIENTE` con detalle por insumo).
- **Idempotencia**: reintentar con la misma `claveOperacion` (o encabezado `Idempotency-Key`) y el mismo pedido devuelve la venta ya creada; con otro pedido, `409 CLAVE_REUTILIZADA`.
- El **CCF exige cliente** (NIT, y NRC cuando corresponde). Cada comprobante guarda una «fotografía fiscal» de los datos del momento.

### Anulación de ventas

Solo gerente de la sucursal o administración central, con motivo de 5 a 200 caracteres y únicamente en turnos **abiertos**. Devuelve al stock exactamente lo que la venta descontó (según el kardex), registra movimientos `ANULACION_VENTA` y conserva el número: el correlativo fiscal no se reutiliza. La venta deja de contar en el arqueo y en los reportes.

### Caja

- Un cajero no puede tener dos turnos abiertos en la misma sucursal; solo los cargos Cajero y Gerente pueden abrirlo.
- Arqueo por medio de pago: `diferencia = declarado − esperado`. Solo el efectivo suma el fondo inicial. Las ventas anuladas no cuentan.

### Inventario

- Cada platillo tiene receta; vender descuenta insumos de la sucursal. Los productos de **REVENTA** se descuentan por unidad.
- Ajustes manuales con motivo (`MERMA`, `CADUCIDAD`, `DANO`, `CONTEO`, `CORRECCION`) y kardex de cada cambio (`VENTA`, `ANULACION_VENTA`, `COMPRA`, `AJUSTE`). El stock nunca queda negativo.

### Compras

CONTADO queda pagada al instante; CRÉDITO queda pendiente (vence a 30 días si no se indica). El número de factura es único por proveedor. Marcar el pago no vuelve a sumar stock.

### Planilla quincenal

Cálculo en `backend/src/modules/nomina/calculo.js`, en centavos enteros:

- Bruto quincenal = salario mensual / 2.
- ISSS 3 % con tope de salario cotizable de $1,000 mensuales; AFP 7.25 %.
- Renta según la tabla de retención quincenal sobre `bruto − ISSS − AFP`.
- Generar dos veces la misma quincena no duplica ni recalcula pagos.

> ⚠️ Los porcentajes, topes y tramos son parámetros legales que cambian. **Verificarlos con las fuentes oficiales (ISSS, Superintendencia del Sistema Financiero y Ministerio de Hacienda) antes de usar salarios reales.**

---

## Seguridad

| Medida | Detalle |
|---|---|
| Sesión | JWT de corta vida (`os_at`, 15 min) y refresh token opaco rotado (`os_rt`, 7 días), ambos en cookies **HttpOnly**. Nada en `localStorage`. |
| Sesión revocable | Cada petición verifica el JWT **y** que la sesión siga activa y el usuario vigente. Logout, baja o cambio de rol/contraseña cortan el acceso al instante. |
| Detección de robo | Un refresh token ya rotado (pasada la gracia de 30 s para pestañas simultáneas) revoca la sesión completa. Solo se guarda el SHA-256 del token. |
| CSRF | Doble envío firmado: `X-CSRF-Token` obligatorio en `POST`/`PUT`. |
| Contraseñas | bcrypt; mínimo 8 caracteres con letras y números. |
| Entradas | Validación con Zod; SQL siempre parametrizado. |
| Cabeceras y CORS | Helmet; CORS solo para `CORS_ORIGINS`. |
| Fuerza bruta | Límite de intentos de login por IP y correo; limitador general de la API (`429`). |
| Secretos | Solo en `.env` (no versionado). |

---

## Pruebas

```powershell
cd backend
npm test
```

Las pruebas de integración usan una base PostgreSQL real (`DB_NAME_TEST`, debe contener «test»), que se **borra y recrea** con esquema, migraciones y datos de demo al comienzo de cada archivo. Se ejecutan en serie (`--test-concurrency=1`).

| Archivo | Cubre |
|---|---|
| `auth.test.js` | Login, refresh con rotación, logout, baja de empleado y ciclo de sesión. |
| `pos.test.js` | Venta de Latte Grande con descuento por receta, venta fallida sin guardar nada, dos cajeros por el último vaso, idempotencia, CCF con y sin cliente/NRC, fotografía fiscal, arqueo y cierre concurrente con cobro. |
| `operaciones.test.js` | Anulación de ventas, movimientos y acceso al comprobante por sucursal. |
| `backoffice.test.js` | Ajustes de stock y kardex, reportes, compra a crédito y pago, alertas por sucursal, planilla duplicada y permisos (403). |

---

## Scripts disponibles

### `backend/`

| Comando | Acción |
|---|---|
| `npm run dev` | API con recarga automática (`node --watch`). |
| `npm start` | API en modo normal. |
| `npm run db:setup` | Crea la BD, instala el esquema y aplica migraciones. |
| `npm run db:migrate` | Aplica solo las migraciones pendientes. |
| `npm run db:reset` | Reinicia datos y carga la demostración (**destructivo**). |
| `npm test` | Pruebas de integración. |

### `frontend/`

| Comando | Acción |
|---|---|
| `npm run dev` | Servidor de desarrollo (Vite). |
| `npm run build` | Compilación de producción en `dist/`. |
| `npm run preview` | Sirve la compilación localmente. |
| `npm run lint` | ESLint. |

---

## Documentación relacionada

- [`docs/contratos-api.md`](docs/contratos-api.md): contratos completos del API (rutas, cuerpos, respuestas y errores).
- [`backend/.env.example`](backend/.env.example) · [`frontend/.env.example`](frontend/.env.example): plantillas de configuración.

---

## Solución de problemas

| Síntoma | Causa probable y solución |
|---|---|
| El API no arranca y se queja de variables | Falta completar `DB_PASSWORD`, `JWT_SECRET` o `CSRF_SECRET` en `backend/.env` (secretos de al menos 32 caracteres). |
| `db:setup` falla al crear la base | El rol de PostgreSQL no tiene `CREATEDB`, o la contraseña de `.env` no coincide. |
| El navegador rechaza las peticiones (CORS) | `CORS_ORIGINS` debe contener exactamente el origen del frontend, sin `/` final. |
| Siempre responde `401` o `403` en `POST`/`PUT` | Sin cookies o sin `X-CSRF-Token`: usar la instancia `api/axios.js` y comprobar que frontend y API comparten dominio, o configurar `COOKIE_SAMESITE=none` con `COOKIE_SECURE=true` y HTTPS. |
| `npm test` se niega a ejecutarse | `DB_NAME_TEST` debe contener «test» (por seguridad, esa base se borra en cada corrida). |
| `429` al iniciar sesión | Se superó el límite de intentos de inicio de sesión (ventana de 15 minutos); esperar. |
