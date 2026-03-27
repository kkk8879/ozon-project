import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async writeLog(params: {
    module: string;
    action: string;
    role?: string;
    operator?: string;
    targetType?: string;
    targetId?: string | number;
    detail?: string;
  }) {
    await this.prisma.auditLog.create({
      data: {
        module: params.module,
        action: params.action,
        role: params.role || 'unknown',
        operator: params.operator?.trim() || null,
        targetType: params.targetType?.trim() || null,
        targetId:
          params.targetId === undefined || params.targetId === null
            ? null
            : String(params.targetId),
        detail: params.detail?.trim() || null,
      },
    });
  }

  async listLogs(limit: number, module?: string) {
    const take = Math.max(1, Math.min(limit, 100));
    const logs = await this.prisma.auditLog.findMany({
      where: module?.trim() ? { module: module.trim() } : undefined,
      orderBy: { id: 'desc' },
      take,
    });

    return logs.map((row) => ({
      id: row.id,
      module: row.module,
      action: row.action,
      role: row.role,
      operator: row.operator,
      targetType: row.targetType,
      targetId: row.targetId,
      detail: row.detail,
      createdAt: row.createdAt,
    }));
  }
}

