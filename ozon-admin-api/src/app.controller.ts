import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { Public } from './auth/public.decorator';
import { PrismaService } from './prisma.service';

@Controller()
export class AppController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @Public()
  getRoot() {
    return {
      name: 'Yongjin Ozon Admin API',
      status: 'ok',
      timestamp: new Date().toISOString(),
      endpoints: ['/health', '/health/ready', '/hello'],
    };
  }

  @Get('hello')
  @Public()
  getHello() {
    return {
      project: 'Yongjin Ozon Admin API',
      status: 'running',
      timestamp: new Date().toISOString(),
    };
  }

  @Get('health')
  @Public()
  getHealth() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
    };
  }

  @Get('health/ready')
  @Public()
  async getReadiness() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return {
        status: 'ready',
        database: 'ok',
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      throw new ServiceUnavailableException({
        status: 'not_ready',
        database: 'error',
        timestamp: new Date().toISOString(),
        message: error instanceof Error ? error.message : 'database unavailable',
      });
    }
  }
}
