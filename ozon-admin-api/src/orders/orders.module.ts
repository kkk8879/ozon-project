import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { PrismaService } from '../prisma.service';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { OzonOrderProvider } from './providers/ozon-order-provider';

@Module({
  imports: [AuditModule],
  controllers: [OrdersController],
  providers: [OrdersService, PrismaService, OzonOrderProvider],
})
export class OrdersModule {}
