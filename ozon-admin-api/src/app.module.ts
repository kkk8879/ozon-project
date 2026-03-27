import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AppController } from './app.controller';
import { AccountsModule } from './accounts/accounts.module';
import { RolesGuard } from './auth/roles.guard';
import { AuditModule } from './audit/audit.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { FxModule } from './fx/fx.module';
import { OrdersModule } from './orders/orders.module';
import { PrismaService } from './prisma.service';
import { StoresModule } from './stores/stores.module';

@Module({
  imports: [
    AuditModule,
    FxModule,
    StoresModule,
    DashboardModule,
    OrdersModule,
    AccountsModule,
  ],
  controllers: [AppController],
  providers: [
    PrismaService,
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
  ],
})
export class AppModule {}
