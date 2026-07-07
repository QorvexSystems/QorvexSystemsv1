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
    reservedStock: number;
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
  reservedStock: number;
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
  payments?: Array<{
    id: string;
    method: string;
    amount: string | number;
    status: string;
    paidAt: string | null;
    createdAt: string;
  }>;
  salesOrder?: {
    id: string;
    orderNumber: string;
    status: string;
  } | null;
  items: Array<{
    id: string;
    description: string;
    sku: string | null;
    barcode: string | null;
    quantity: string;
    unitPrice: string;
    discountTotal: string;
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
  orderId?: string;
  items?: Array<{
    productId: string;
    quantity: number;
  }>;
};

export type ReturnInvoiceLookup = Omit<Invoice, 'items'> & {
  salesOrder?: {
    id: string;
    orderNumber: string;
    status: string;
  } | null;
  items: Array<Invoice['items'][number] & {
    productId: string | null;
    returnedQuantity: string;
    remainingQuantity: string;
    canReturn: boolean;
    product: Product | null;
  }>;
};

export type ReturnRequest = {
  id: string;
  tenantId: string;
  invoiceId: string;
  requestedById: string;
  approvedById: string | null;
  rejectedById: string | null;
  cashSessionId: string | null;
  status: string;
  reason: string;
  adminNote: string | null;
  refundMethod: string | null;
  refundAmount: string;
  approvedAt: string | null;
  rejectedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  requestedBy: {
    id: string;
    name: string;
    email: string;
  };
  approvedBy?: {
    id: string;
    name: string;
    email: string;
  } | null;
  rejectedBy?: {
    id: string;
    name: string;
    email: string;
  } | null;
  cashSession?: CashSession | null;
  invoice: Omit<ReturnInvoiceLookup, 'items'> & {
    items: Array<Invoice['items'][number] & {
      productId: string | null;
      product: Product | null;
    }>;
  };
  items: Array<{
    id: string;
    returnRequestId: string;
    invoiceItemId: string;
    productId: string | null;
    description: string;
    quantity: string;
    unitPrice: string;
    discountTotal: string;
    taxRate: string;
    taxTotal: string;
    subtotal: string;
    total: string;
    restock: boolean;
    product: Product | null;
  }>;
};

export type CreateReturnRequestPayload = {
  invoiceId: string;
  reason: string;
  refundMethod?: string;
  items: Array<{
    invoiceItemId: string;
    quantity: number;
    restock?: boolean;
  }>;
};

export type SalesOrderPriceLevel = 'REGULAR' | 'DISCOUNT_10' | 'PREFERRED_18';

export type SalesOrder = {
  id: string;
  tenantId: string;
  customerId: string | null;
  destination: 'CASH_SALE' | 'QUOTATION';
  clientName: string | null;
  quotationDocumentType: string | null;
  quotationDocumentNumber: string | null;
  orderNumber: string;
  status: string;
  priceLevel: SalesOrderPriceLevel;
  discountRate: string;
  subtotal: string;
  taxTotal: string;
  discountTotal: string;
  total: string;
  notes: string | null;
  createdById: string;
  completedById: string | null;
  claimedById: string | null;
  claimedCashSessionId: string | null;
  invoiceId: string | null;
  sentToCashierAt: string | null;
  claimedAt: string | null;
  claimExpiresAt: string | null;
  releasedAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  createdAt: string;
  updatedAt: string;
  customer: Customer | null;
  createdBy: {
    id: string;
    name: string;
    email: string;
  };
  completedBy: {
    id: string;
    name: string;
    email: string;
  } | null;
  claimedBy: {
    id: string;
    name: string;
    email: string;
  } | null;
  claimedCashSession: {
    id: string;
    cashRegister: {
      id: string;
      name: string;
      location: string | null;
    };
  } | null;
  invoice: {
    id: string;
    invoiceNumber: string;
    total: string;
  } | null;
  items: Array<{
    id: string;
    salesOrderId: string;
    productId: string | null;
    sku: string | null;
    barcode: string | null;
    description: string;
    quantity: string;
    reservedQuantity: number;
    unitPrice: string;
    discountTotal: string;
    taxRate: string;
    taxTotal: string;
    subtotal: string;
    total: string;
    product: Product | null;
  }>;
};

export type CreateSalesOrderPayload = {
  destination: 'CASH_SALE' | 'QUOTATION';
  clientName?: string;
  customerId?: string;
  priceLevel?: SalesOrderPriceLevel;
  quotationDocumentType?: 'RNC' | 'CEDULA';
  quotationDocumentNumber?: string;
  notes?: string;
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
      canTakeOrders: boolean;
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
  claimedSalesOrders?: SalesOrder[];
  invoices?: Invoice[];
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

export type ProductImageUploadResult = {
  imageUrl: string;
  path: string;
  bucket: string;
};

const apiUrl = process.env.NEXT_PUBLIC_API_URL;

if (!apiUrl) {
  throw new Error('NEXT_PUBLIC_API_URL is required to connect the frontend with the CoreStack API.');
}

const apiMessageTranslations: Record<string, string> = {
  'Missing bearer token.': 'Falta el token de sesion.',
  'Invalid or expired token.': 'La sesion no es valida o expiro.',
  'User is not active.': 'El usuario no esta activo.',
  'Missing x-tenant-id header.': 'Falta identificar la empresa de trabajo.',
  'Missing x-tenant-id header for tenant-scoped request.':
    'Falta identificar la empresa de trabajo.',
  'Authenticated user is required.': 'Debes iniciar sesion para continuar.',
  'User does not belong to this tenant.': 'Tu usuario no pertenece a esta empresa.',
  'Role checks require authenticated tenant context.':
    'No se pudo validar el rol para esta empresa.',
  'Insufficient role for this operation.': 'Tu rol no permite realizar esta operacion.',
  'Invalid credentials.': 'Credenciales invalidas.',
  'Tenant not found.': 'Empresa no encontrada.',
  'This user already belongs to this tenant.': 'Este usuario ya pertenece a esta empresa.',
  'Tenant user limit reached.': 'La empresa ya tiene el limite de 4 usuarios activos.',
  'Employee not found for tenant.': 'Empleado no encontrado en esta empresa.',
  'Employee membership not found.': 'No se encontro la membresia del empleado.',
  'Employee management permission is required.': 'Necesitas permiso para gestionar empleados.',
  'This role cannot be assigned to a tenant employee.':
    'Este rol no puede asignarse a un empleado de la empresa.',
  'At least one active admin must remain for the tenant.':
    'Debe quedar al menos un administrador activo en la empresa.',
  'Customer not found for tenant.': 'Cliente no encontrado en esta empresa.',
  'Product not found for tenant.': 'Producto no encontrado en esta empresa.',
  'Product category not found for tenant.': 'Categoria de producto no encontrada en esta empresa.',
  'Product code already exists for this tenant.':
    'Ese codigo de producto ya existe en esta empresa.',
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
  'Tracked inventory products require whole quantities.':
    'Este producto requiere cantidades completas.',
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
  'Open cash session not found for tenant.':
    'No se encontro una sesion de caja abierta en esta empresa.',
  'Manual cash movements must be cash in, cash out, or adjustment.':
    'Los movimientos manuales de caja deben ser entrada, salida o ajuste.',
  'Employee does not have permission for this cash operation.':
    'Tu usuario no tiene permiso para esta operacion de caja.',
  'Employee does not have permission to view cash logs.':
    'Tu usuario no tiene permiso para ver los logs de caja.',
  'An open cash session for this cashier is required to complete POS sales.':
    'Debes abrir una caja con tu usuario antes de completar ventas.',
  'Employee does not have POS access.': 'Tu usuario no tiene permiso para usar la caja.',
  'Employee profile must be active to use POS.':
    'El perfil del empleado debe estar activo para usar el POS.',
  'Cashier can only charge orders sent to cashier.':
    'El cajero solo puede cobrar ordenes enviadas a caja.',
  'Only admins can create direct POS sales.':
    'Solo el administrador puede crear ventas directas desde el POS.',
  'Amount received cannot be negative.': 'El monto recibido no puede ser negativo.',
  'Cash received must cover the invoice total.':
    'El efectivo recibido debe cubrir el total de la factura.',
  'Payment amount must cover the invoice total.':
    'El monto pagado debe cubrir el total de la factura.',
  'Sales order must include at least one item.': 'La orden debe incluir al menos un producto.',
  'Pending sales order not found for tenant.': 'Orden pendiente no encontrada en esta empresa.',
  'Sales order not found for tenant.': 'Orden no encontrada en esta empresa.',
  'Sales order contains an unavailable product.': 'La orden contiene un producto no disponible.',
  'One or more order products do not belong to tenant.':
    'Uno o mas productos de la orden no pertenecen a esta empresa.',
  'Invalid sales order status.': 'Estado de orden invalido.',
  'Employee does not have permission to take orders.':
    'Tu usuario no tiene permiso para tomar ordenes.',
  'Employee does not have permission to view sales orders.':
    'Tu usuario no tiene permiso para ver ordenes.',
  'Employee does not have permission to view this sales order.':
    'Tu usuario no tiene permiso para ver esta orden.',
  'Employee does not have permission to cancel this sales order.':
    'Tu usuario no tiene permiso para cancelar esta orden.',
  'Employee profile must be active to take orders.':
    'El perfil del empleado debe estar activo para tomar ordenes.',
  'Only pending sales orders can be cancelled.': 'Solo las ordenes pendientes pueden cancelarse.',
  'Sales order has already been completed.': 'Esta orden ya fue cobrada.',
  'Sales order has already been cancelled.': 'Esta orden ya fue cancelada.',
  'Sales order is already claimed by another cashier.':
    'Esta orden ya esta siendo atendida por otro cajero.',
  'Only claimed sales orders can be released.': 'Solo se pueden liberar ordenes tomadas por caja.',
  'Employee does not have permission to release this sales order.':
    'Tu usuario no puede liberar esta orden.',
  'An open cash session for this cashier is required to claim sales orders.':
    'Debes abrir caja antes de tomar una orden para cobrar.',
  'Close pending claimed sales orders before closing cash session.':
    'Libera o cobra las ordenes tomadas antes de cerrar la caja.',
  'Could not reserve fiscal sequence.':
    'No se pudo reservar la secuencia fiscal. Intenta nuevamente.',
  'Could not generate a unique barcode.': 'No se pudo generar un codigo de barras unico.',
  'Could not generate a unique product code.': 'No se pudo generar un codigo de producto unico.',
  'Product must have a barcode before printing labels.':
    'El producto debe tener codigo de barras antes de imprimir etiquetas.',
  'Barcode already exists for this tenant.': 'Ese codigo de barras ya existe en esta empresa.',
  'Product image file is required.': 'Debes seleccionar una imagen de producto.',
  'Product image must be JPG, PNG, WEBP, or GIF.': 'La imagen debe ser JPG, PNG, WEBP o GIF.',
  'Product image cannot be larger than 5 MB.': 'La imagen no puede pesar mas de 5 MB.',
  'Product image storage is not configured.': 'El almacenamiento de imagenes no esta configurado.',
  'Product image could not be uploaded.': 'No se pudo subir la imagen del producto.',
  'Product unit requires whole inventory quantities.':
    'Esta unidad requiere cantidades completas en inventario.',
  'Import file is required.': 'Debes seleccionar un archivo de importacion.',
  'Import file cannot be larger than 10 MB.':
    'El archivo de importacion no puede pesar mas de 10 MB.',
  'Import file does not contain sheets.': 'El archivo no contiene hojas para importar.',
  'Opening amount must be greater than zero.': 'El monto inicial debe ser mayor que 0.',
  'Admins cannot complete POS sales. Cashiers must charge orders.':
    'El administrador no puede cobrar en caja. El cajero debe cobrar la orden.',
  'Direct POS sales are disabled. Load an order to charge.':
    'Las ventas directas estan deshabilitadas. Carga una orden para cobrar.',
  'Admins cannot claim sales orders for charging.':
    'El administrador no puede tomar ordenes para cobrar en caja.',
  'Invoice number is required for return lookup.':
    'Debes escribir el numero de factura u orden para buscar la devolucion.',
  'Invoice not found for return lookup.':
    'No se encontro una factura con ese numero.',
  'Invoice status does not allow returns.':
    'El estado de esta factura no permite devoluciones.',
  'Return reason is required.': 'Debes indicar el motivo de la devolucion.',
  'Return request must include at least one item.':
    'La solicitud debe incluir al menos un producto.',
  'Return quantities must be greater than zero.':
    'Las cantidades a devolver deben ser mayores que cero.',
  'Return item does not belong to the selected invoice.':
    'Uno de los productos no pertenece a la factura seleccionada.',
  'Return quantity exceeds invoice remaining quantity.':
    'La cantidad a devolver supera lo disponible en la factura.',
  'Return request not found for tenant.':
    'Solicitud de devolucion no encontrada en esta empresa.',
  'Only requested returns can be approved.':
    'Solo se pueden aprobar devoluciones solicitadas.',
  'Only requested returns can be rejected.':
    'Solo se pueden rechazar devoluciones solicitadas.',
  'Return rejection reason is required.':
    'Debes indicar el motivo del rechazo.',
  'Employee does not have permission to request returns.':
    'Tu usuario no tiene permiso para solicitar devoluciones.',
  'Only admins can approve or reject returns.':
    'Solo administradores pueden aprobar o rechazar devoluciones.',
  'An open cash session is required to approve a return.':
    'Debe haber una caja abierta para aprobar una devolucion.',
  'Select an open cash session for this refund.':
    'Selecciona la caja abierta que entregara el reembolso.',
  'Invalid return request status.': 'Estado de devolucion invalido.',
  'Quotation requires document type and document number.':
    'La cotizacion requiere tipo y numero de documento.',
  'Quotation document type must be RNC or CEDULA.':
    'El tipo de documento de la cotizacion debe ser RNC o cedula.',
  'El RNC debe tener 9 digitos.': 'El RNC debe tener 9 digitos.',
  'El RNC no es valido.': 'El RNC no es valido.',
  'La cedula debe tener 11 digitos.': 'La cedula debe tener 11 digitos.',
  'La cedula no es valida.': 'La cedula no es valida.',
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

async function fetchFormData<T>(path: string, formData: FormData, headers: Record<string, string>) {
  const response = await fetch(`${apiUrl}${path}`, {
    method: 'POST',
    headers,
    body: formData,
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(getApiErrorMessage(body, response.status));
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

  if (message.startsWith('Insufficient available stock for ') && message.endsWith('.')) {
    const productName = message.replace('Insufficient available stock for ', '').replace(/\.$/, '');
    return `Stock disponible insuficiente para ${productName}.`;
  }

  if (message.startsWith('Tracked product ') && message.endsWith(' requires whole quantities.')) {
    const productName = message
      .replace('Tracked product ', '')
      .replace(' requires whole quantities.', '');
    return `${productName} requiere cantidades completas.`;
  }

  if (message.startsWith('Product unit ') && message.includes(' requires whole quantities for ')) {
    const field = message.split(' requires whole quantities for ')[1]?.replace(/\.$/, '');
    return `La unidad seleccionada requiere cantidades completas${field ? ` en ${field}` : ''}.`;
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

export function getSalesOrders(tenantId: string, accessToken: string, status?: string) {
  const query = status ? `?status=${encodeURIComponent(status)}` : '';
  return fetchJson<SalesOrder[]>(`/orders${query}`, {
    headers: tenantHeaders(tenantId, accessToken),
  });
}

export function getSalesOrder(tenantId: string, accessToken: string, orderId: string) {
  return fetchJson<SalesOrder>(`/orders/${orderId}`, {
    headers: tenantHeaders(tenantId, accessToken),
  });
}

export function createSalesOrder(
  tenantId: string,
  accessToken: string,
  payload: CreateSalesOrderPayload,
) {
  return fetchJson<SalesOrder>('/orders', {
    method: 'POST',
    headers: tenantHeaders(tenantId, accessToken),
    body: JSON.stringify(payload),
  });
}

export function claimSalesOrder(
  tenantId: string,
  accessToken: string,
  orderId: string,
  payload: { cashSessionId?: string },
) {
  return fetchJson<SalesOrder>(`/orders/${orderId}/claim`, {
    method: 'POST',
    headers: tenantHeaders(tenantId, accessToken),
    body: JSON.stringify(payload),
  });
}

export function releaseSalesOrder(tenantId: string, accessToken: string, orderId: string) {
  return fetchJson<SalesOrder>(`/orders/${orderId}/release`, {
    method: 'POST',
    headers: tenantHeaders(tenantId, accessToken),
  });
}

export function cancelSalesOrder(
  tenantId: string,
  accessToken: string,
  orderId: string,
  reason?: string,
) {
  return fetchJson<SalesOrder>(`/orders/${orderId}/cancel`, {
    method: 'POST',
    headers: tenantHeaders(tenantId, accessToken),
    body: JSON.stringify({ reason }),
  });
}

export function updateSalesOrder(
  tenantId: string,
  accessToken: string,
  orderId: string,
  payload: CreateSalesOrderPayload,
) {
  return fetchJson<SalesOrder>(`/orders/${orderId}`, {
    method: 'PATCH',
    headers: tenantHeaders(tenantId, accessToken),
    body: JSON.stringify(payload),
  });
}

export function acceptSalesOrder(tenantId: string, accessToken: string, orderId: string) {
  return fetchJson<SalesOrder>(`/orders/${orderId}/accept`, {
    method: 'POST',
    headers: tenantHeaders(tenantId, accessToken),
  });
}

export function searchOrderProducts(tenantId: string, accessToken: string, q: string) {
  return fetchJson<Product[]>(`/orders/products/search?q=${encodeURIComponent(q)}`, {
    headers: tenantHeaders(tenantId, accessToken),
  });
}

export function getOrderProductByBarcode(tenantId: string, accessToken: string, barcode: string) {
  return fetchJson<Product>(`/orders/products/barcode/${encodeURIComponent(barcode)}`, {
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

export function uploadProductImage(tenantId: string, accessToken: string, file: File) {
  const formData = new FormData();
  formData.append('file', file);

  return fetchFormData<ProductImageUploadResult>(
    '/products/image',
    formData,
    tenantHeaders(tenantId, accessToken),
  );
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

export function getReturnRequests(tenantId: string, accessToken: string, status?: string) {
  const query = status ? `?status=${encodeURIComponent(status)}` : '';
  return fetchJson<ReturnRequest[]>(`/returns${query}`, {
    headers: tenantHeaders(tenantId, accessToken),
  });
}

export function lookupReturnInvoice(tenantId: string, accessToken: string, q: string) {
  return fetchJson<ReturnInvoiceLookup>(`/returns/invoice-lookup?q=${encodeURIComponent(q)}`, {
    headers: tenantHeaders(tenantId, accessToken),
  });
}

export function createReturnRequest(
  tenantId: string,
  accessToken: string,
  payload: CreateReturnRequestPayload,
) {
  return fetchJson<ReturnRequest>('/returns', {
    method: 'POST',
    headers: tenantHeaders(tenantId, accessToken),
    body: JSON.stringify(payload),
  });
}

export function approveReturnRequest(
  tenantId: string,
  accessToken: string,
  returnRequestId: string,
  payload: { cashSessionId?: string; refundMethod?: string; adminNote?: string },
) {
  return fetchJson<ReturnRequest>(`/returns/${returnRequestId}/approve`, {
    method: 'POST',
    headers: tenantHeaders(tenantId, accessToken),
    body: JSON.stringify(payload),
  });
}

export function rejectReturnRequest(
  tenantId: string,
  accessToken: string,
  returnRequestId: string,
  payload: { adminNote: string },
) {
  return fetchJson<ReturnRequest>(`/returns/${returnRequestId}/reject`, {
    method: 'POST',
    headers: tenantHeaders(tenantId, accessToken),
    body: JSON.stringify(payload),
  });
}

export function getInvoice(tenantId: string, accessToken: string, invoiceId: string) {
  return fetchJson<Invoice>(`/invoices/${invoiceId}`, {
    headers: tenantHeaders(tenantId, accessToken),
  });
}

export function createInvoice(
  tenantId: string,
  accessToken: string,
  payload: CreateInvoicePayload,
) {
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

export function importProductsFile(tenantId: string, accessToken: string, file: File) {
  const formData = new FormData();
  formData.append('file', file);

  return fetchFormData<ImportBatch>(
    '/imports/products',
    formData,
    tenantHeaders(tenantId, accessToken),
  );
}
