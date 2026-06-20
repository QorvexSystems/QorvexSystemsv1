# Documentacion completa - Qorvex Systems / Ferreteria RIVNU

Fecha de corte: 2026-06-20

Este documento describe el estado actual del proyecto QorvexSystemsv1 en este workspace. Qorvex Systems es el proveedor/core del sistema. Ferreteria RIVNU es el cliente operativo que usa el POS, la caja, la facturacion, inventario y dashboard.

## 1. Resumen

El sistema actual incluye:

- Monorepo con frontend Next.js, backend NestJS y paquete Prisma.
- PostgreSQL 16 en Docker.
- Login con email/contrasena, bcrypt y JWT.
- Aislamiento por tenant usando `x-tenant-id`.
- Branding cliente para Ferreteria RIVNU y marca secundaria `Powered by Qorvex`.
- Dashboard operativo con KPIs reales desde PostgreSQL.
- POS con busqueda, escaneo por codigo/QR, carrito, calculo de impuestos, monto recibido y devuelta.
- Facturacion POS con e-NCF demo y factura imprimible.
- Productos con SKU, codigo de barras, imagen, categoria, precio, costo, stock y minimo.
- Clientes.
- Empleados, roles y permisos.
- Caja: apertura con monto inicial, cierre con conteo, esperado, diferencia y reporte de movimientos.
- Bloqueo de logout cuando el usuario tiene una caja abierta.
- Inventario con movimientos automaticos y ajustes.
- Secuencias fiscales.
- Importaciones como modulo preparado.
- Logs de empleados y auditoria.

## 2. Stack

| Capa | Tecnologia |
| --- | --- |
| Monorepo | pnpm workspaces |
| Frontend | Next.js 15, React 19, TypeScript, Tailwind CSS |
| UI | Componentes propios estilo shadcn/ui, lucide-react, sonner |
| Estado web | TanStack Query, localStorage para sesion |
| Formularios | React Hook Form, Zod |
| Graficas | Recharts |
| Backend | NestJS 11, TypeScript, REST API |
| Auth | bcryptjs, JWT |
| ORM | Prisma |
| DB | PostgreSQL 16 |
| Codigo/QR | `@zxing/browser` |

## 3. Estructura

```text
apps/
  api/        API NestJS
  web/        Frontend Next.js
packages/
  database/   Prisma schema, migraciones, seed y cliente generado
  config/     Paquete compartido placeholder
  types/      Tipos compartidos placeholder
  utils/      Utilidades compartidas placeholder
docs/
  DOCUMENTACION_COMPLETA.md
```

## 4. Scripts

| Comando | Uso |
| --- | --- |
| `corepack pnpm dev` | Levanta API y web |
| `corepack pnpm dev:api` | API en `localhost:4000` |
| `corepack pnpm dev:web` | Web en `localhost:3000` |
| `corepack pnpm build` | Build completo |
| `corepack pnpm lint` | Typecheck/lint |
| `corepack pnpm db:generate` | Genera Prisma Client |
| `corepack pnpm db:migrate` | Aplica migraciones locales |
| `corepack pnpm db:migrate:deploy` | Aplica migraciones versionadas |
| `corepack pnpm db:seed` | Carga datos demo |
| `corepack pnpm db:studio` | Prisma Studio |

## 5. Variables de entorno

`.env.example`:

```env
DATABASE_URL="postgresql://qorvex:qorvex@localhost:5432/qorvex?schema=public"
POSTGRES_USER="qorvex"
POSTGRES_PASSWORD="qorvex"
POSTGRES_DB="qorvex"
API_PORT=4000
NEXT_PUBLIC_API_URL="http://localhost:4000"
JWT_SECRET="change-me"
JWT_EXPIRES_IN="15m"
```

`.env` esta ignorado por Git.

## 6. Docker y base local

`docker-compose.yml` define:

| Servicio | Imagen | Puerto | DB |
| --- | --- | --- | --- |
| `postgres` | `postgres:16` | `5432:5432` | `qorvex` |

Contenedor esperado:

```text
qorvex-postgres
```

## 7. Branding

### Qorvex Systems

- Es el core/proveedor del sistema.
- Tiene tenant propio.
- En la interfaz aparece como `Powered by Qorvex`.
- No es el negocio operativo del POS.

### Ferreteria RIVNU

- Es el cliente operativo.
- Usa POS, caja, facturacion, inventario, clientes, empleados y dashboard.
- Logo local: `apps/web/public/tenants/Ferreteria_RIVNU.jpeg`.
- Todos sus datos operativos se filtran por `tenantId`.

## 8. Autenticacion

Endpoint:

```text
POST /auth/login
```

Flujo:

1. Busca usuario por email.
2. Requiere `User.status = ACTIVE`.
3. Compara contrasena con bcrypt.
4. Filtra membresias activas.
5. Genera JWT con `sub` y `email`.
6. Devuelve token, usuario, tenant, rol y permisos.

Sesion web:

- `apps/web/lib/auth-session.ts`.
- Guarda token, tenant, rol, permisos, usuario y expiracion en `localStorage`.
- Crea cookie simple para ayudar al flujo frontend.

## 9. Autorizacion

Guards backend:

| Guard | Archivo | Funcion |
| --- | --- | --- |
| `JwtAuthGuard` | `apps/api/src/common/guards/jwt-auth.guard.ts` | Valida Bearer token, usuario activo y membresias activas |
| `TenantMembershipGuard` | `apps/api/src/common/guards/tenant-membership.guard.ts` | Exige `x-tenant-id` y valida pertenencia al tenant |
| `RolesGuard` | `apps/api/src/common/guards/roles.guard.ts` | Valida roles declarados con `@Roles(...)` |

Reglas frontend:

- Sin sesion redirige a `/login`.
- Admin/super admin pueden navegar todo.
- Cajero con POS solo accede a `/pos`.
- Cajero con reimpresion puede abrir la ruta de impresion de factura.
- Si el usuario tiene caja abierta, no puede cerrar sesion hasta cerrarla.

## 10. Roles y permisos

Roles actuales:

| Rol | Uso |
| --- | --- |
| `SUPER_ADMIN` | Plataforma/core |
| `QORVEX_SUPER_ADMIN` | Reservado para super admin Qorvex |
| `ADMIN` | Administrador del tenant cliente |
| `CASHIER` | Cajero POS |

Roles asignables desde empleados:

- `ADMIN`
- `CASHIER`

Permisos de `Membership`:

| Campo | Uso |
| --- | --- |
| `canUsePos` | Usar POS |
| `canOpenCashSession` | Abrir caja |
| `canCloseCashSession` | Cerrar caja |
| `canApplyDiscount` | Descuentos |
| `canCancelInvoice` | Cancelar factura |
| `canVoidInvoice` | Anular factura |
| `canAdjustInventory` | Ajustar inventario |
| `canManageProducts` | Gestionar productos |
| `canManageEmployees` | Gestionar empleados |
| `canViewReports` | Ver reportes |
| `canManageFiscalSequences` | Secuencias fiscales |
| `canViewCashLogs` | Logs de caja |
| `canReprintReceipt` | Reimprimir factura |

Credenciales demo:

```text
superadmin@qorvex.local / DemoPassword123!
admin@rivnu.local / DemoPassword123!
cajero@rivnu.local / DemoPassword123!
```

## 11. Frontend

Rutas:

| Ruta | Pantalla | Acceso |
| --- | --- | --- |
| `/login` | Login RIVNU | Publica |
| `/dashboard` | Panel | Admin |
| `/pos` | Caja POS | Admin/Cajero POS |
| `/products` | Productos | Admin |
| `/products/new` | Nuevo producto | Admin |
| `/products/:id/edit` | Editar producto | Admin |
| `/customers` | Clientes | Admin |
| `/invoices` | Facturas | Admin |
| `/invoices/:id` | Detalle factura | Admin |
| `/invoices/:id/print` | Impresion factura | Admin/Cajero con reimpresion |
| `/employees` | Empleados | Admin |
| `/employees/new` | Nuevo empleado | Admin |
| `/employees/:id` | Detalle empleado | Admin |
| `/employees/:id/edit` | Editar empleado | Admin |
| `/cash/logs` | Logs de caja | Admin |
| `/cash/sessions` | Sesiones de caja | Admin |
| `/inventory` | Inventario | Admin |
| `/settings` | Configuracion | Admin |
| `/settings/imports` | Importaciones | Admin |
| `/settings/fiscal-sequences` | Secuencias fiscales | Admin |

Menu:

- Archivo: `apps/web/components/layout/sidebar.tsx`.
- Desktop inicia colapsado.
- Mobile usa barra inferior con scroll horizontal.

## 12. Backend y endpoints

Modulos:

| Modulo | Ruta base |
| --- | --- |
| Health | `/health` |
| Auth | `/auth` |
| Tenants | `/tenants` |
| Dashboard | `/dashboard` |
| Products | `/products` |
| POS | `/pos` |
| Invoices | `/invoices` |
| Customers | `/customers` |
| Employees | `/employees` |
| Users | `/users` |
| Cash | `/cash` |
| Inventory | `/inventory` |
| Fiscal sequences | `/fiscal-sequences` |
| Imports | `/imports` |
| Employee logs | `/employee-logs` |
| Audit | `/audit` |
| Billing | `/billing` |

Endpoints principales:

| Metodo | Ruta | Uso |
| --- | --- | --- |
| `GET` | `/health` | Healthcheck |
| `POST` | `/auth/login` | Login |
| `GET` | `/tenants` | Listar tenants |
| `GET` | `/dashboard/summary` | KPIs |
| `GET` | `/products` | Listar productos |
| `GET` | `/products/search` | Buscar productos |
| `GET` | `/products/barcode/:barcode` | Producto por codigo |
| `POST` | `/products` | Crear producto |
| `GET` | `/products/:id` | Ver producto |
| `POST` | `/products/:id/generate-barcode` | Generar codigo interno |
| `POST` | `/products/:id/label` | Etiqueta |
| `PATCH` | `/products/:id` | Editar producto |
| `DELETE` | `/products/:id` | Desactivar producto |
| `GET` | `/pos/products/search` | Busqueda POS |
| `GET` | `/pos/products/barcode/:barcode` | Escaneo POS |
| `POST` | `/pos/sales/preview` | Vista previa venta |
| `POST` | `/pos/sales/complete` | Completar venta |
| `GET` | `/invoices` | Listar facturas |
| `POST` | `/invoices` | Crear factura manual |
| `GET` | `/invoices/:id` | Detalle factura |
| `PATCH` | `/invoices/:id` | Actualizar factura |
| `GET` | `/customers` | Listar clientes |
| `POST` | `/customers` | Crear cliente |
| `PATCH` | `/customers/:id` | Editar cliente |
| `DELETE` | `/customers/:id` | Desactivar cliente |
| `GET` | `/employees` | Listar empleados |
| `POST` | `/employees` | Crear empleado |
| `PATCH` | `/employees/:id` | Editar empleado |
| `GET` | `/cash/registers` | Cajas fisicas |
| `GET` | `/cash/sessions` | Sesiones caja |
| `GET` | `/cash/sessions/current` | Caja abierta del usuario |
| `POST` | `/cash/sessions/open` | Abrir caja |
| `POST` | `/cash/sessions/:id/close` | Cerrar caja |
| `GET` | `/cash/movements` | Movimientos caja |
| `POST` | `/cash/movements` | Movimiento manual |
| `GET` | `/inventory/movements` | Movimientos inventario |
| `POST` | `/inventory/movements` | Ajuste inventario |
| `GET` | `/fiscal-sequences` | Secuencias fiscales |
| `GET` | `/imports` | Lotes importacion |
| `GET` | `/employee-logs` | Logs empleados |
| `GET` | `/audit/logs` | Auditoria |
| `GET` | `/billing/provider` | Proveedor billing |

## 13. Flujos de negocio

### POS

1. Usuario debe tener POS y empleado activo.
2. Debe tener caja abierta.
3. Productos se consultan desde DB.
4. Backend recalcula subtotal, ITBIS y total.
5. Se reserva secuencia fiscal.
6. Se crea `Invoice`.
7. Se crean `InvoiceItem`.
8. Se descuenta stock.
9. Se crea `InventoryMovement.SALE`.
10. Se crea `Payment`.
11. Se crea `CashMovement.SALE_PAYMENT`.
12. Se crean logs `CREATE_SALE` e `ISSUE_INVOICE`.
13. Se crea `ElectronicDocument` demo.
14. Se abre factura para imprimir.

### Devuelta

Campos:

- `Invoice.amountReceived`
- `Invoice.changeAmount`

Regla:

- En efectivo, el monto recibido debe cubrir el total.
- Si recibido > total, `changeAmount = amountReceived - total`.

### Caja

1. Apertura requiere `canOpenCashSession` o admin.
2. Se registra monto inicial.
3. Se crea `CashSession.OPEN`.
4. Se crea `CashMovement.OPENING`.
5. Ventas crean `CashMovement.SALE_PAYMENT`.
6. Cierre requiere `canCloseCashSession` o admin.
7. Esperado = apertura + ventas + entradas + ajustes - salidas - devoluciones.
8. Diferencia = contado - esperado.
9. Se crea `CashMovement.CLOSING`.
10. La pantalla de sesiones muestra reporte detallado de movimientos.

Multiples cajas:

- La logica permite varias sesiones abiertas si son cajas fisicas distintas.
- No permite dos sesiones abiertas para la misma `CashRegister`.
- La DB seed trae solo `Caja Principal`; para varias cajas reales se deben crear mas `CashRegister`.

### Logout con caja abierta

- Cualquier usuario con caja abierta no puede cerrar sesion.
- Se redirige a `/cash/sessions` si tiene acceso.
- Si es cajero se redirige a `/pos`.

### Productos e inventario

- Admin/super admin crean, editan y desactivan productos.
- El delete es logico: `Product.status = INACTIVE`.
- Crear producto con stock genera `INITIAL_STOCK`.
- Editar stock genera `ADJUSTMENT_IN` o `ADJUSTMENT_OUT`.
- Venta POS genera `SALE`.

### Empleados

- Solo admin/plataforma crea o edita empleados.
- Roles permitidos para tenant: `ADMIN`, `CASHIER`.
- No permite dejar un tenant sin admin activo.

## 14. Base de datos

Fuente principal:

```text
packages/database/prisma/schema.prisma
```

Migraciones:

| Migracion | Uso |
| --- | --- |
| `20260617172000_init` | Base inicial |
| `20260617223000_rivnu_operations` | Empleados, caja, secuencias, importaciones, enums operativos |
| `20260618011000_product_image_url` | `Product.imageUrl` |
| `20260619032000_limit_operational_roles` | Roles actuales |
| `20260619043000_invoice_cash_change` | `amountReceived` y `changeAmount` |

Tablas de negocio:

- `Tenant`
- `CompanyBranding`
- `User`
- `Membership`
- `Customer`
- `ProductCategory`
- `Product`
- `InventoryMovement`
- `Invoice`
- `InvoiceItem`
- `Payment`
- `ElectronicDocument`
- `EmployeeProfile`
- `CashRegister`
- `CashSession`
- `CashMovement`
- `EmployeeActivityLog`
- `FiscalSequence`
- `ImportBatch`
- `ImportRowError`
- `AuditLog`

## 15. Enums

| Enum | Valores |
| --- | --- |
| `TenantStatus` | `ACTIVE`, `INACTIVE`, `SUSPENDED` |
| `UserStatus` | `ACTIVE`, `INVITED`, `DISABLED`, `INACTIVE`, `BLOCKED` |
| `MembershipStatus` | `ACTIVE`, `INVITED`, `DISABLED`, `INACTIVE`, `SUSPENDED` |
| `Role` | `SUPER_ADMIN`, `ADMIN`, `CASHIER`, `QORVEX_SUPER_ADMIN` |
| `CustomerStatus` | `ACTIVE`, `INACTIVE` |
| `ProductStatus` | `ACTIVE`, `INACTIVE`, `DISCONTINUED` |
| `InventoryMovementType` | `INITIAL_STOCK`, `PURCHASE`, `INBOUND`, `OUTBOUND`, `ADJUSTMENT`, `ADJUSTMENT_IN`, `ADJUSTMENT_OUT`, `SALE`, `RETURN`, `DAMAGE`, `TRANSFER_IN`, `TRANSFER_OUT` |
| `InvoiceStatus` | `DRAFT`, `ISSUED`, `PAID`, `PARTIALLY_PAID`, `CANCELLED`, `VOIDED`, `CREDITED`, `VOID`, `PENDING_ECF`, `ACCEPTED`, `REJECTED` |
| `PaymentMethod` | `CASH`, `CARD`, `TRANSFER`, `CHECK`, `OTHER` |
| `PaymentStatus` | `PENDING`, `COMPLETED`, `FAILED`, `CANCELLED` |
| `ElectronicDocumentProvider` | `MOCK`, `GAE`, `DGII`, `DGII_DIRECT` |
| `ElectronicDocumentStatus` | `PENDING`, `PROCESSING`, `SIGNED`, `SENT`, `ACCEPTED`, `REJECTED`, `FAILED`, `CANCELLED` |
| `DocumentType` | `RNC`, `CEDULA`, `PASSPORT`, `CONSUMER_FINAL`, `OTHER` |
| `InvoiceFiscalStatus` | `NOT_APPLICABLE`, `PENDING_SEQUENCE`, `READY_TO_SEND`, `PENDING_SIGNATURE`, `SIGNED`, `SENT`, `ACCEPTED`, `REJECTED`, `FAILED`, `CANCELLED` |
| `InvoiceDocumentType` | `CONSUMER_ELECTRONIC_32`, `FISCAL_CREDIT_ELECTRONIC_31`, `DEBIT_NOTE_ELECTRONIC_33`, `CREDIT_NOTE_ELECTRONIC_34` |
| `BarcodeType` | `EAN13`, `UPC_A`, `CODE128`, `INTERNAL_CODE128`, `QR`, `UNKNOWN` |
| `ProductUnit` | `UNIT`, `BOX`, `PACK`, `BAG`, `ROLL`, `METER`, `FOOT`, `POUND`, `GALLON`, `LITER`, `KILOGRAM`, `SERVICE` |
| `TaxCategory` | `ITBIS_18`, `ITBIS_16`, `EXEMPT` |
| `CashRegisterStatus` | `ACTIVE`, `INACTIVE` |
| `CashSessionStatus` | `OPEN`, `CLOSED`, `CANCELLED` |
| `CashMovementType` | `OPENING`, `SALE_PAYMENT`, `CASH_IN`, `CASH_OUT`, `REFUND`, `CLOSING`, `ADJUSTMENT` |
| `EmployeeLogAction` | `OPEN_CASH_SESSION`, `CLOSE_CASH_SESSION`, `CREATE_SALE`, `CANCEL_SALE`, `ISSUE_INVOICE`, `CANCEL_INVOICE`, `APPLY_DISCOUNT`, `CHANGE_PRODUCT_PRICE`, `ADD_PRODUCT`, `UPDATE_PRODUCT`, `DELETE_PRODUCT`, `CHANGE_BARCODE`, `PRINT_RECEIPT`, `REPRINT_RECEIPT`, `CASH_IN`, `CASH_OUT`, `INVENTORY_ADJUSTMENT` |
| `EmployeeStatus` | `ACTIVE`, `INACTIVE`, `BLOCKED`, `TERMINATED` |
| `FiscalSequenceStatus` | `ACTIVE`, `INACTIVE`, `EXPIRED`, `EXHAUSTED` |
| `ImportType` | `PRODUCTS`, `CATEGORIES`, `CUSTOMERS`, `INITIAL_INVENTORY`, `FISCAL_SEQUENCES`, `HISTORICAL_INVOICES`, `INVOICE_ITEMS`, `PAYMENTS` |
| `ImportStatus` | `DRAFT`, `VALIDATING`, `READY`, `IMPORTED`, `FAILED`, `CANCELLED` |

## 16. Diccionario de tablas

### `Tenant`

Campos: `id`, `name`, `commercialName`, `legalName`, `slug`, `rnc`, `email`, `phone`, `address`, `status`, `createdAt`, `updatedAt`.

Relaciones: branding, membresias, clientes, categorias, productos, inventario, facturas, pagos, documentos electronicos, auditoria, empleados, cajas, sesiones, movimientos, logs, secuencias e importaciones.

### `CompanyBranding`

Campos: `id`, `tenantId`, `logoUrl`, `primaryColor`, `accentColor`, `loginTitle`, `loginSubtitle`, `createdAt`, `updatedAt`.

Relacion: pertenece a `Tenant`.

### `User`

Campos: `id`, `email`, `name`, `phone`, `passwordHash`, `status`, `createdAt`, `updatedAt`.

Relaciones: membresias, auditoria, perfiles de empleado, facturas emitidas, movimientos, pagos, sesiones de caja, importaciones.

### `Membership`

Campos: `id`, `userId`, `tenantId`, `role`, `status`, permisos booleanos, `createdAt`, `updatedAt`.

Restriccion: unico `(userId, tenantId)`.

### `Customer`

Campos: `id`, `tenantId`, `name`, `documentType`, `documentNumber`, `email`, `phone`, `address`, `status`, `createdAt`, `updatedAt`.

Relaciones: pertenece a `Tenant`, tiene facturas.

### `ProductCategory`

Campos: `id`, `tenantId`, `name`, `description`, `status`, `createdAt`, `updatedAt`.

Relaciones: pertenece a `Tenant`, tiene productos.

### `Product`

Campos: `id`, `tenantId`, `categoryId`, `name`, `sku`, `barcode`, `barcodeType`, `generatedBarcode`, `barcodeLabelPrintedAt`, `barcodeLabelPrintCount`, `barcodeLastScannedAt`, `barcodeCreatedById`, `description`, `imageUrl`, `brand`, `unit`, `price`, `salePrice`, `cost`, `margin`, `taxCategory`, `taxRate`, `trackInventory`, `stock`, `minStock`, `status`, `createdAt`, `updatedAt`.

Restricciones: unico `(tenantId, sku)` y `(tenantId, barcode)`.

### `InventoryMovement`

Campos: `id`, `tenantId`, `productId`, `type`, `quantity`, `previousStock`, `newStock`, `unitCost`, `reason`, `reference`, `invoiceId`, `createdById`, `createdAt`.

Relaciones: producto, factura opcional y usuario creador opcional.

### `Invoice`

Campos: `id`, `tenantId`, `customerId`, `documentType`, `invoiceNumber`, `ncf`, `eNcf`, `status`, `fiscalStatus`, `subtotal`, `taxTotal`, `discountTotal`, `total`, `paidAmount`, `amountReceived`, `changeAmount`, `balance`, `paymentMethod`, `issuedById`, `cashSessionId`, `issuedAt`, `dueDate`, `createdAt`, `updatedAt`.

Restriccion: unico `(tenantId, invoiceNumber)`.

### `InvoiceItem`

Campos: `id`, `invoiceId`, `productId`, `sku`, `barcode`, `description`, `quantity`, `unitPrice`, `discountTotal`, `taxRate`, `taxTotal`, `subtotal`, `total`.

### `Payment`

Campos: `id`, `tenantId`, `invoiceId`, `method`, `amount`, `status`, `userId`, `cashSessionId`, `paidAt`, `createdAt`.

### `ElectronicDocument`

Campos: `id`, `tenantId`, `invoiceId`, `provider`, `status`, `xmlUrl`, `pdfUrl`, `trackId`, `externalId`, `errorMessage`, `requestPayload`, `responsePayload`, `createdAt`, `updatedAt`.

### `EmployeeProfile`

Campos: `id`, `tenantId`, `userId`, `employeeCode`, `jobTitle`, `hireDate`, `documentType`, `documentNumber`, `address`, `emergencyContactName`, `emergencyContactPhone`, `notes`, `status`, `createdAt`, `updatedAt`.

Restricciones: unico `(tenantId, userId)` y `(tenantId, employeeCode)`.

### `CashRegister`

Campos: `id`, `tenantId`, `name`, `location`, `status`, `createdAt`, `updatedAt`.

### `CashSession`

Campos: `id`, `tenantId`, `cashRegisterId`, `openedById`, `closedById`, `status`, `openingAmount`, `closingAmount`, `expectedAmount`, `difference`, `openedAt`, `closedAt`.

Relaciones: caja fisica, usuario que abre, usuario que cierra, movimientos, facturas, pagos y logs.

### `CashMovement`

Campos: `id`, `tenantId`, `cashSessionId`, `userId`, `type`, `amount`, `method`, `reason`, `reference`, `invoiceId`, `createdAt`.

### `EmployeeActivityLog`

Campos: `id`, `tenantId`, `userId`, `cashSessionId`, `action`, `entity`, `entityId`, `amount`, `metadata`, `ip`, `userAgent`, `invoiceId`, `createdAt`.

### `FiscalSequence`

Campos: `id`, `tenantId`, `documentType`, `prefix`, `startNumber`, `endNumber`, `nextNumber`, `validUntil`, `status`, `createdAt`, `updatedAt`.

### `ImportBatch`

Campos: `id`, `tenantId`, `type`, `filename`, `status`, `totalRows`, `validRows`, `invalidRows`, `importedRows`, `createdById`, `createdAt`, `confirmedAt`.

### `ImportRowError`

Campos: `id`, `importBatchId`, `rowNumber`, `field`, `message`, `rawData`.

### `AuditLog`

Campos: `id`, `tenantId`, `userId`, `action`, `entity`, `entityId`, `metadata`, `createdAt`.

## 17. Relaciones principales

```text
Tenant 1--1 CompanyBranding
Tenant 1--N Membership
User 1--N Membership
Tenant 1--N Customer
Tenant 1--N ProductCategory
ProductCategory 1--N Product
Tenant 1--N Product
Product 1--N InventoryMovement
Product 1--N InvoiceItem
Tenant 1--N Invoice
Customer 1--N Invoice
User 1--N Invoice como issuedBy
Invoice 1--N InvoiceItem
Invoice 1--N Payment
Invoice 1--1 ElectronicDocument
Invoice 1--N CashMovement
Invoice 1--N InventoryMovement
Tenant 1--N CashRegister
CashRegister 1--N CashSession
User 1--N CashSession como openedBy/closedBy
CashSession 1--N CashMovement
CashSession 1--N Invoice
CashSession 1--N Payment
Tenant 1--N EmployeeProfile
User 1--N EmployeeProfile
Tenant 1--N FiscalSequence
Tenant 1--N ImportBatch
ImportBatch 1--N ImportRowError
Tenant 1--N AuditLog
User 1--N AuditLog
```

## 18. Seed y datos iniciales

Fuente:

```text
packages/database/prisma/seed.ts
```

El seed:

- Borra datos previos de desarrollo.
- Crea tenant `Qorvex Systems`.
- Crea tenant `Ferreteria RIVNU`.
- Crea branding RIVNU con logo local.
- Crea usuarios demo.
- Crea categorias de ferreteria.
- Crea 18 productos de ferreteria con stock.
- Crea movimientos de inventario inicial.
- Crea clientes demo.
- Crea `Caja Principal`.
- Crea sesion de caja seed.
- Crea secuencias fiscales `E32` y `E31`.
- Crea facturas demo pagada, emitida y cancelada.
- Crea documento electronico demo.
- Crea logs de empleados y auditoria.
- Crea lote de importacion demo.

Categorias seed:

- Herramientas manuales
- Herramientas electricas
- Materiales de construccion
- Plomeria
- Electricidad
- Pinturas
- Tornilleria
- Seguridad industrial
- Jardineria
- Ferreteria general

Clientes seed:

- Constructora Duarte SRL
- Servicios Electricos del Norte
- Cliente Consumidor Final

## 19. Traducciones UI

Archivo:

```text
apps/web/lib/display-labels.ts
```

Ejemplos:

| Valor DB | Texto usuario |
| --- | --- |
| `ACTIVE` | Activo |
| `INACTIVE` | Inactivo |
| `OPEN` | Abierta |
| `CLOSED` | Cerrada |
| `PAID` | Pagada |
| `ISSUED` | Emitida |
| `CANCELLED` | Cancelada |
| `CASH` | Efectivo |
| `CARD` | Tarjeta |
| `TRANSFER` | Transferencia |
| `OPENING` | Apertura de caja |
| `SALE_PAYMENT` | Pago de venta |
| `CLOSING` | Cierre de caja |
| `INITIAL_STOCK` | Stock inicial |
| `SALE` | Venta |
| `ADMIN` | Administrador |
| `CASHIER` | Cajero |

## 20. Facturacion electronica

El modelo ya tiene estructura para DGII/e-CF:

- `ElectronicDocument`
- `ElectronicDocumentProvider`
- `ElectronicDocumentStatus`
- `InvoiceFiscalStatus`
- `InvoiceDocumentType`
- `FiscalSequence`

Estado actual:

- Es demo/mock.
- El POS crea `ElectronicDocument` con `DGII_DIRECT`.
- Se marca como `SIGNED`.
- No hay XML DGII real, firma digital real, envio real ni validacion oficial.

## 21. Importaciones

Existe estructura:

- `ImportBatch`
- `ImportRowError`
- `ImportType`
- `ImportStatus`

Pantalla:

- `/settings/imports`

Estado actual:

- Solo listado/lote demo.
- Falta procesamiento real de archivos.

## 22. Auditoria

`AuditLog` registra acciones tecnicas/de negocio como productos, clientes, inventario y facturas.

`EmployeeActivityLog` registra operacion diaria como:

- abrir/cerrar caja
- crear venta
- emitir factura
- agregar/actualizar/desactivar producto
- cambiar barcode
- entradas/salidas de caja

## 23. Limitaciones pendientes

1. No hay integracion real DGII/e-CF.
2. No hay refresh tokens ni recuperacion de contrasena.
3. La sesion web usa `localStorage`; produccion deberia usar estrategia mas segura.
4. Importaciones aun no procesan archivos reales.
5. La logica permite multiples cajas, pero falta CRUD UI para crear varias `CashRegister`.
6. La DB seed trae una sola caja fisica.
7. Imagenes se guardan como `imageUrl`; no hay storage/upload real.
8. Proveedor no existe como tabla separada; hoy se usa `Product.brand`.

## 24. Archivos clave

| Area | Archivo |
| --- | --- |
| Prisma schema | `packages/database/prisma/schema.prisma` |
| Seed | `packages/database/prisma/seed.ts` |
| API main | `apps/api/src/main.ts` |
| Auth | `apps/api/src/modules/auth/auth.service.ts` |
| POS | `apps/api/src/modules/pos/pos.service.ts` |
| Caja | `apps/api/src/modules/cash/cash.service.ts` |
| Productos | `apps/api/src/modules/products/products.service.ts` |
| Empleados | `apps/api/src/modules/employees/employees.service.ts` |
| API frontend | `apps/web/lib/api.ts` |
| Sesion web | `apps/web/lib/auth-session.ts` |
| Autorizacion web | `apps/web/lib/authorization.ts` |
| Traducciones | `apps/web/lib/display-labels.ts` |
| Login | `apps/web/app/(auth)/login/page.tsx` |
| Shell | `apps/web/components/layout/app-shell.tsx` |
| Sidebar | `apps/web/components/layout/sidebar.tsx` |
| POS view | `apps/web/components/operations/pos-view.tsx` |
| Sesiones caja | `apps/web/components/operations/cash-sessions-view.tsx` |
| Productos view | `apps/web/components/operations/products-view.tsx` |
| Facturas view | `apps/web/components/operations/invoices-view.tsx` |

## 25. Criterio de verdad

La fuente principal de estructura de DB es:

```text
packages/database/prisma/schema.prisma
```

La fuente principal de datos iniciales es:

```text
packages/database/prisma/seed.ts
```

Si se corre `corepack pnpm db:seed`, los IDs y registros actuales pueden cambiar porque es un seed de desarrollo.
