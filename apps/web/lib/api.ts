export type Tenant = {
  id: string;
  name: string;
  slug: string;
};

export type DashboardSummary = {
  totalBilledMonth: number;
  totalBilledToday: number;
  pendingInvoices: number;
  paidInvoices: number;
  draftInvoices: number;
  cancelledInvoices: number;
  activeCustomers: number;
  activeProducts: number;
  activeEmployees: number;
  openCashSessions: number;
  lowStockProducts: number;
  recentInvoices: Array<{
    id: string;
    invoiceNumber: string;
    customerName: string;
    status: string;
    total: number;
    cashierName: string | null;
    issuedAt: string | null;
    createdAt: string;
  }>;
  recentInventoryAlerts: Array<{
    id: string;
    name: string;
    sku: string | null;
    stock: number;
    minStock: number;
  }>;
  recentCashMovements: CashMovement[];
  recentEmployeeLogs: EmployeeLog[];
  fiscalSequenceAlerts: Array<{
    id: string;
    documentType: string;
    prefix: string;
    nextNumber: number;
    endNumber: number;
    remaining: number;
    validUntil: string | null;
  }>;
  employeeSummary: {
    activeEmployees: number;
    openCashSessions: number;
  };
  salesSeries: Array<{
    month: string;
    total: number;
  }>;
};

export type LoginResponse = {
  accessToken: string;
  tokenType: 'Bearer';
  expiresIn: string;
  user: {
    id: string;
    email: string;
    name: string;
  };
  memberships: Array<{
    id: string;
    tenantId: string;
    tenantName: string;
    tenantSlug: string;
    role: string;
    permissions: Record<string, boolean>;
  }>;
};

export type Customer = {
  id: string;
  name: string;
  documentType: string;
  documentNumber: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  status: string;
  createdAt: string;
};

export type Product = {
  id: string;
  name: string;
  sku: string | null;
  barcode: string | null;
  barcodeType: string | null;
  generatedBarcode: boolean;
  barcodeLabelPrintCount: number;
  description: string | null;
  imageUrl: string | null;
  brand: string | null;
  unit: string;
  price: string;
  salePrice: string;
  cost: string | null;
  taxRate: string;
  trackInventory: boolean;
  stock: number;
  minStock: number;
  status: string;
  category?: {
    id: string;
    name: string;
  } | null;
};

export type InventoryMovement = {
  id: string;
  type: string;
  quantity: number;
  previousStock: number | null;
  newStock: number | null;
  reason: string | null;
  reference: string | null;
  createdAt: string;
  product: Product;
};

export type Invoice = {
  id: string;
  invoiceNumber: string;
  documentType: string;
  eNcf: string | null;
  ncf: string | null;
  status: string;
  fiscalStatus: string;
  subtotal: string;
  taxTotal: string;
  discountTotal: string;
  total: string;
  paidAmount: string;
  amountReceived: string;
  changeAmount: string;
  balance: string;
  paymentMethod: string | null;
  issuedAt: string | null;
  createdAt: string;
  tenant?: {
    id: string;
    name: string;
    commercialName: string | null;
    legalName: string | null;
    rnc: string | null;
    phone: string | null;
    address: string | null;
  };
  customer: Customer | null;
  issuedBy?: {
    id: string;
    name: string;
    email: string;
  } | null;
  items: Array<{
    id: string;
    description: string;
    sku: string | null;
    barcode: string | null;
    quantity: string;
    unitPrice: string;
    taxRate: string;
    taxTotal: string;
    subtotal: string;
    total: string;
  }>;
};

export type CreateInvoicePayload = {
  customerId?: string;
  invoiceNumber?: string;
  documentType?: string;
  paymentMethod?: string;
  status: 'DRAFT' | 'ISSUED' | 'PAID';
  issuedAt?: string;
  items: Array<{
    productId: string;
    description: string;
    quantity: number;
  }>;
};

export type PosSalePayload = {
  customerId?: string;
  documentType: string;
  paymentMethod: string;
  amountReceived?: number;
  cashSessionId?: string;
  items: Array<{
    productId: string;
    quantity: number;
  }>;
};

export type Employee = {
  id: string;
  tenantId: string;
  userId: string;
  employeeCode: string | null;
  jobTitle: string | null;
  status: string;
  createdAt: string;
  user: {
    id: string;
    name: string;
    email: string;
    phone: string | null;
    status: string;
    memberships: Array<{
      id: string;
      role: string;
      status: string;
      canUsePos: boolean;
      canOpenCashSession: boolean;
      canCloseCashSession: boolean;
      canApplyDiscount: boolean;
      canCancelInvoice: boolean;
      canVoidInvoice: boolean;
      canAdjustInventory: boolean;
      canManageProducts: boolean;
      canManageEmployees: boolean;
      canViewReports: boolean;
      canManageFiscalSequences: boolean;
      canViewCashLogs: boolean;
      canReprintReceipt: boolean;
    }>;
  };
};

export type CashSession = {
  id: string;
  status: string;
  openingAmount: string;
  closingAmount: string | null;
  expectedAmount: string | null;
  difference: string | null;
  openedAt: string;
  closedAt: string | null;
  cashRegister: {
    id: string;
    name: string;
    location: string | null;
  };
  openedBy?: {
    id: string;
    name: string;
    email: string;
  };
  closedBy?: {
    id: string;
    name: string;
    email: string;
  } | null;
  movements?: CashSessionMovement[];
};

export type CashSessionMovement = {
  id: string;
  type: string;
  amount: number | string;
  method: string | null;
  reason: string | null;
  reference: string | null;
  createdAt: string;
  user?: {
    id: string;
    name: string;
    email: string;
  };
  invoice?: {
    id: string;
    invoiceNumber: string;
    total: number | string;
  } | null;
};

export type CashRegister = {
  id: string;
  name: string;
  location: string | null;
  status: string;
};

export type CashMovement = {
  id: string;
  type: string;
  amount: number | string;
  method: string | null;
  reason: string | null;
  reference: string | null;
  cashierName?: string;
  registerName?: string;
  invoiceNumber?: string | null;
  createdAt: string;
  user?: {
    id: string;
    name: string;
    email: string;
  };
  cashSession?: CashSession;
};

export type EmployeeLog = {
  id: string;
  action: string;
  entity: string;
  entityId: string | null;
  amount: number | string | null;
  employeeName?: string;
  invoiceNumber?: string | null;
  createdAt: string;
  user?: {
    id: string;
    name: string;
    email: string;
  };
};

export type FiscalSequence = {
  id: string;
  documentType: string;
  prefix: string;
  startNumber: number;
  endNumber: number;
  nextNumber: number;
  validUntil: string | null;
  status: string;
};

export type ImportBatch = {
  id: string;
  type: string;
  filename: string;
  status: string;
  totalRows: number;
  validRows: number;
  invalidRows: number;
  importedRows: number;
  createdAt: string;
  createdBy: {
    id: string;
    name: string;
    email: string;
  } | null;
  errors: Array<{
    id: string;
    rowNumber: number;
    field: string | null;
    message: string;
  }>;
};

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

const apiMessageTranslations: Record<string, string> = {
  'Missing bearer token.': 'Falta el token de sesion.',
  'Invalid or expired token.': 'La sesion no es valida o expiro.',
  'User is not active.': 'El usuario no esta activo.',
  'Missing x-tenant-id header.': 'Falta identificar la empresa de trabajo.',
  'Missing x-tenant-id header for tenant-scoped request.': 'Falta identificar la empresa de trabajo.',
  'Authenticated user is required.': 'Debes iniciar sesion para continuar.',
  'User does not belong to this tenant.': 'Tu usuario no pertenece a esta empresa.',
  'Role checks require authenticated tenant context.': 'No se pudo validar el rol para esta empresa.',
  'Insufficient role for this operation.': 'Tu rol no permite realizar esta operacion.',
  'Invalid credentials.': 'Credenciales invalidas.',
  'Tenant not found.': 'Empresa no encontrada.',
  'This user already belongs to this tenant.': 'Este usuario ya pertenece a esta empresa.',
  'Employee not found for tenant.': 'Empleado no encontrado en esta empresa.',
  'Employee membership not found.': 'No se encontro la membresia del empleado.',
  'Employee management permission is required.': 'Necesitas permiso para gestionar empleados.',
  'This role cannot be assigned to a tenant employee.': 'Este rol no puede asignarse a un empleado de la empresa.',
  'At least one active admin must remain for the tenant.': 'Debe quedar al menos un administrador activo en la empresa.',
  'Customer not found for tenant.': 'Cliente no encontrado en esta empresa.',
  'Product not found for tenant.': 'Producto no encontrado en esta empresa.',
  'Product category not found for tenant.': 'Categoria de producto no encontrada en esta empresa.',
  'No active product found for barcode.': 'No se encontro un producto activo con ese codigo.',
  'Inventory movement would leave product stock below zero.':
    'El movimiento dejaria el inventario del producto por debajo de cero.',
  'Invoice must include at least one item.': 'La factura debe incluir al menos un producto.',
  'Invoice items must reference products so totals are recalculated from database.':
    'Los productos de la factura deben existir para recalcular los totales desde la base de datos.',
  'One or more invoice products do not belong to tenant.':
    'Uno o mas productos de la factura no pertenecen a esta empresa.',
  'Tracked inventory products require integer quantities.':
    'Los productos con inventario requieren cantidades enteras.',
  'Invoice not found for tenant.': 'Factura no encontrada en esta empresa.',
  'Sale must include at least one item.': 'La venta debe incluir al menos un producto.',
  'Fiscal credit invoices require an RNC customer.':
    'Las facturas de credito fiscal requieren un cliente con RNC.',
  'One or more POS products do not belong to tenant.':
    'Uno o mas productos de la venta no pertenecen a esta empresa.',
  'No active fiscal sequence available for this document type.':
    'No hay una secuencia fiscal activa disponible para este tipo de comprobante.',
  'This cash register or cashier already has an open session.':
    'Esta caja o este cajero ya tiene una sesion abierta. Cierra la sesion abierta antes de abrir otra.',
  'This cash register already has an open session.':
    'Esta caja ya tiene una sesion abierta. Selecciona otra caja o cierra la sesion abierta.',
  'Cash register not found for tenant.': 'Caja no encontrada en esta empresa.',
  'Open cash session not found for tenant.': 'No se encontro una sesion de caja abierta en esta empresa.',
  'Manual cash movements must be cash in, cash out, or adjustment.':
    'Los movimientos manuales de caja deben ser entrada, salida o ajuste.',
  'Employee does not have permission for this cash operation.':
    'Tu usuario no tiene permiso para esta operacion de caja.',
  'Employee does not have permission to view cash logs.':
    'Tu usuario no tiene permiso para ver los logs de caja.',
  'An open cash session for this cashier is required to complete POS sales.':
    'Debes abrir una caja con tu usuario antes de completar ventas.',
  'Employee does not have POS access.': 'Tu usuario no tiene permiso para usar la caja.',
  'Employee profile must be active to use POS.': 'El perfil del empleado debe estar activo para usar el POS.',
  'Amount received cannot be negative.': 'El monto recibido no puede ser negativo.',
  'Cash received must cover the invoice total.': 'El efectivo recibido debe cubrir el total de la factura.',
  'Payment amount must cover the invoice total.': 'El monto pagado debe cubrir el total de la factura.',
  'Could not generate a unique barcode.': 'No se pudo generar un codigo de barras unico.',
  'Product must have a barcode before printing labels.':
    'El producto debe tener codigo de barras antes de imprimir etiquetas.',
  'Barcode already exists for this tenant.': 'Ese codigo de barras ya existe en esta empresa.',
};

async function fetchJson<T>(path: string, options?: RequestInit) {
  const response = await fetch(`${apiUrl}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(getApiErrorMessage(body, response.status));
  }

  if (response.status === 204) {
    return null as T;
  }

  const body = await response.text();

  if (!body.trim()) {
    return null as T;
  }

  return JSON.parse(body) as T;
}

function getApiErrorMessage(body: string, status: number) {
  if (!body) {
    return `No se pudo completar la solicitud (${status}).`;
  }

  try {
    const parsed = JSON.parse(body) as { message?: string | string[] };
    const message = Array.isArray(parsed.message)
      ? parsed.message.map(translateApiMessage).join(', ')
      : parsed.message;

    if (message) {
      return translateApiMessage(message);
    }
  } catch {
    // The API occasionally returns plain text from proxies/dev servers.
  }

  return translateApiMessage(body);
}

function translateApiMessage(message: string) {
  if (apiMessageTranslations[message]) {
    return apiMessageTranslations[message];
  }

  if (message.startsWith('Insufficient stock for ') && message.endsWith('.')) {
    const productName = message.replace('Insufficient stock for ', '').replace(/\.$/, '');
    return `Stock insuficiente para ${productName}.`;
  }

  return message;
}

export function getTenants() {
  return fetchJson<Tenant[]>('/tenants');
}

export function login(email: string, password: string) {
  return fetchJson<LoginResponse>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

function tenantHeaders(tenantId: string, accessToken: string) {
  return {
    'x-tenant-id': tenantId,
    Authorization: `Bearer ${accessToken}`,
  };
}

export function getDashboardSummary(tenantId: string, accessToken: string) {
  return fetchJson<DashboardSummary>('/dashboard/summary', {
    headers: tenantHeaders(tenantId, accessToken),
  });
}

export function getCustomers(tenantId: string, accessToken: string) {
  return fetchJson<Customer[]>('/customers', {
    headers: tenantHeaders(tenantId, accessToken),
  });
}

export function createCustomer(
  tenantId: string,
  accessToken: string,
  payload: Record<string, string | undefined>,
) {
  return fetchJson<Customer>('/customers', {
    method: 'POST',
    headers: tenantHeaders(tenantId, accessToken),
    body: JSON.stringify(payload),
  });
}

export function updateCustomer(
  tenantId: string,
  accessToken: string,
  customerId: string,
  payload: Record<string, string | undefined>,
) {
  return fetchJson<Customer>(`/customers/${customerId}`, {
    method: 'PATCH',
    headers: tenantHeaders(tenantId, accessToken),
    body: JSON.stringify(payload),
  });
}

export function deleteCustomer(tenantId: string, accessToken: string, customerId: string) {
  return fetchJson<Customer>(`/customers/${customerId}`, {
    method: 'DELETE',
    headers: tenantHeaders(tenantId, accessToken),
  });
}

export function getProducts(tenantId: string, accessToken: string, q?: string) {
  const query = q ? `?q=${encodeURIComponent(q)}` : '';
  return fetchJson<Product[]>(`/products${query}`, {
    headers: tenantHeaders(tenantId, accessToken),
  });
}

export function getProduct(tenantId: string, accessToken: string, productId: string) {
  return fetchJson<Product>(`/products/${productId}`, {
    headers: tenantHeaders(tenantId, accessToken),
  });
}

export function searchPosProducts(tenantId: string, accessToken: string, q: string) {
  return fetchJson<Product[]>(`/pos/products/search?q=${encodeURIComponent(q)}`, {
    headers: tenantHeaders(tenantId, accessToken),
  });
}

export function getPosProductByBarcode(tenantId: string, accessToken: string, barcode: string) {
  return fetchJson<Product>(`/pos/products/barcode/${encodeURIComponent(barcode)}`, {
    headers: tenantHeaders(tenantId, accessToken),
  });
}

export function createProduct(
  tenantId: string,
  accessToken: string,
  payload: Record<string, string | number | boolean | undefined>,
) {
  return fetchJson<Product>('/products', {
    method: 'POST',
    headers: tenantHeaders(tenantId, accessToken),
    body: JSON.stringify(payload),
  });
}

export function updateProduct(
  tenantId: string,
  accessToken: string,
  productId: string,
  payload: Record<string, string | number | boolean | undefined>,
) {
  return fetchJson<Product>(`/products/${productId}`, {
    method: 'PATCH',
    headers: tenantHeaders(tenantId, accessToken),
    body: JSON.stringify(payload),
  });
}

export function deleteProduct(tenantId: string, accessToken: string, productId: string) {
  return fetchJson<Product>(`/products/${productId}`, {
    method: 'DELETE',
    headers: tenantHeaders(tenantId, accessToken),
  });
}

export function generateProductBarcode(tenantId: string, accessToken: string, productId: string) {
  return fetchJson<Product>(`/products/${productId}/generate-barcode`, {
    method: 'POST',
    headers: tenantHeaders(tenantId, accessToken),
  });
}

export function getProductLabel(tenantId: string, accessToken: string, productId: string) {
  return fetchJson<{
    productId: string;
    name: string;
    sku: string | null;
    barcode: string;
    barcodeType: string;
    price: number;
    printedAt: string;
    printCount: number;
  }>(`/products/${productId}/label`, {
    method: 'POST',
    headers: tenantHeaders(tenantId, accessToken),
  });
}

export function getInventoryMovements(tenantId: string, accessToken: string) {
  return fetchJson<InventoryMovement[]>('/inventory/movements', {
    headers: tenantHeaders(tenantId, accessToken),
  });
}

export function getInvoices(tenantId: string, accessToken: string) {
  return fetchJson<Invoice[]>('/invoices', {
    headers: tenantHeaders(tenantId, accessToken),
  });
}

export function getInvoice(tenantId: string, accessToken: string, invoiceId: string) {
  return fetchJson<Invoice>(`/invoices/${invoiceId}`, {
    headers: tenantHeaders(tenantId, accessToken),
  });
}

export function createInvoice(tenantId: string, accessToken: string, payload: CreateInvoicePayload) {
  return fetchJson<Invoice>('/invoices', {
    method: 'POST',
    headers: tenantHeaders(tenantId, accessToken),
    body: JSON.stringify(payload),
  });
}

export function completePosSale(tenantId: string, accessToken: string, payload: PosSalePayload) {
  return fetchJson<Invoice>('/pos/sales/complete', {
    method: 'POST',
    headers: tenantHeaders(tenantId, accessToken),
    body: JSON.stringify(payload),
  });
}

export function getEmployees(tenantId: string, accessToken: string) {
  return fetchJson<Employee[]>('/employees', {
    headers: tenantHeaders(tenantId, accessToken),
  });
}

export function getEmployee(tenantId: string, accessToken: string, employeeId: string) {
  return fetchJson<Employee>(`/employees/${employeeId}`, {
    headers: tenantHeaders(tenantId, accessToken),
  });
}

export function createEmployee(
  tenantId: string,
  accessToken: string,
  payload: Record<string, string | boolean | undefined>,
) {
  return fetchJson<Employee>('/employees', {
    method: 'POST',
    headers: tenantHeaders(tenantId, accessToken),
    body: JSON.stringify(payload),
  });
}

export function updateEmployee(
  tenantId: string,
  accessToken: string,
  employeeId: string,
  payload: Record<string, string | boolean | undefined>,
) {
  return fetchJson<Employee>(`/employees/${employeeId}`, {
    method: 'PATCH',
    headers: tenantHeaders(tenantId, accessToken),
    body: JSON.stringify(payload),
  });
}

export function getCashSessions(tenantId: string, accessToken: string) {
  return fetchJson<CashSession[]>('/cash/sessions', {
    headers: tenantHeaders(tenantId, accessToken),
  });
}

export function getCashRegisters(tenantId: string, accessToken: string) {
  return fetchJson<CashRegister[]>('/cash/registers', {
    headers: tenantHeaders(tenantId, accessToken),
  });
}

export function getCurrentCashSession(tenantId: string, accessToken: string) {
  return fetchJson<CashSession | null>('/cash/sessions/current', {
    headers: tenantHeaders(tenantId, accessToken),
  });
}

export function openCashSession(
  tenantId: string,
  accessToken: string,
  payload: { cashRegisterId: string; openingAmount: number },
) {
  return fetchJson<CashSession>('/cash/sessions/open', {
    method: 'POST',
    headers: tenantHeaders(tenantId, accessToken),
    body: JSON.stringify(payload),
  });
}

export function closeCashSession(
  tenantId: string,
  accessToken: string,
  cashSessionId: string,
  payload: { closingAmount: number; notes?: string },
) {
  return fetchJson<CashSession>(`/cash/sessions/${cashSessionId}/close`, {
    method: 'POST',
    headers: tenantHeaders(tenantId, accessToken),
    body: JSON.stringify(payload),
  });
}

export function getCashMovements(tenantId: string, accessToken: string) {
  return fetchJson<CashMovement[]>('/cash/movements', {
    headers: tenantHeaders(tenantId, accessToken),
  });
}

export function getEmployeeLogs(tenantId: string, accessToken: string) {
  return fetchJson<EmployeeLog[]>('/employee-logs', {
    headers: tenantHeaders(tenantId, accessToken),
  });
}

export function getFiscalSequences(tenantId: string, accessToken: string) {
  return fetchJson<FiscalSequence[]>('/fiscal-sequences', {
    headers: tenantHeaders(tenantId, accessToken),
  });
}

export function getImportBatches(tenantId: string, accessToken: string) {
  return fetchJson<ImportBatch[]>('/imports', {
    headers: tenantHeaders(tenantId, accessToken),
  });
}
