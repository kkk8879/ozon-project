import { Controller, Get } from '@nestjs/common';
import { Permissions } from '../auth/permissions.decorator';
import { DashboardService } from './dashboard.service';

@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('summary')
  @Permissions('dashboard.read')
  async getSummary() {
    return this.dashboardService.getSummary();
  }
}
