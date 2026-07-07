import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuditModule } from './modules/audit/audit.module';
import { AuthModule } from './modules/auth/auth.module';
import { BillingModule } from './modules/billing/billing.module';
import { CashModule } from './modules/cash/cash.module';
import { CustomersModule } from './modules/customers/customers.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { EmployeeLogsModule } from './modules/employee-logs/employee-logs.module';
import { EmployeesModule } from './modules/employees/employees.module';
import { FiscalSequencesModule } from './modules/fiscal-sequences/fiscal-sequences.module';
import { HealthModule } from './modules/health/health.module';
import { ImportsModule } from './modules/imports/imports.module';
import { InventoryModule } from './modules/inventory/inventory.module';
import { InvoicesModule } from './modules/invoices/invoices.module';
import { OrdersModule } from './modules/orders/orders.module';
import { PosModule } from './modules/pos/pos.module';
import { ProductsModule } from './modules/products/products.module';
import { ReturnsModule } from './modules/returns/returns.module';
import { TenantsModule } from './modules/tenants/tenants.module';
import { UsersModule } from './modules/users/users.module';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    PrismaModule,
    HealthModule,
    AuthModule,
    BillingModule,
    CashModule,
    TenantsModule,
    UsersModule,
    CustomersModule,
    EmployeeLogsModule,
    EmployeesModule,
    FiscalSequencesModule,
    ImportsModule,
    ProductsModule,
    InventoryModule,
    InvoicesModule,
    OrdersModule,
    PosModule,
    ReturnsModule,
    DashboardModule,
    AuditModule,
  ],
})
export class AppModule {}
