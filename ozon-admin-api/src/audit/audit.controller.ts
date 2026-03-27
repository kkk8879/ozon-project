import {
  Body,
  Controller,
  DefaultValuePipe,
  Get,
  Headers,
  ParseIntPipe,
  Post,
  Query,
} from '@nestjs/common';
import { Permissions } from '../auth/permissions.decorator';
import { CreateClientAuditDto } from './dto/create-client-audit.dto';
import { AuditService } from './audit.service';

@Controller('audit-logs')
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  @Permissions('audit.read')
  async getAuditLogs(
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('module') module?: string,
  ) {
    return this.auditService.listLogs(limit, module);
  }

  @Post('client')
  @Permissions('audit.write')
  async createClientAudit(
    @Body() body: CreateClientAuditDto,
    @Headers('x-user-role') role?: string,
  ) {
    await this.auditService.writeLog({
      module: body.module,
      action: body.action,
      role,
      operator: body.operator,
      targetType: body.targetType,
      targetId: body.targetId,
      detail: body.detail,
    });

    return { message: '审计日志写入成功' };
  }
}
