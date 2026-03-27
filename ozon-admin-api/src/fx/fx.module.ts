import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { FxController } from './fx.controller';
import { FxService } from './fx.service';

@Module({
  controllers: [FxController],
  providers: [FxService, PrismaService],
})
export class FxModule {}
