import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { OzonOrderProvider } from '../orders/providers/ozon-order-provider';
import { PrismaService } from '../prisma.service';
import { StoresController } from './stores.controller';
import { StoresService } from './stores.service';

@Module({
  imports: [AuditModule],
  controllers: [StoresController],
  providers: [StoresService, PrismaService, OzonOrderProvider],
})
export class StoresModule {}
