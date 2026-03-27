import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { OzonOrderProvider, RemoteOrder } from '../orders/providers/ozon-order-provider';
import { PrismaService } from '../prisma.service';
import { CreateStoreDto } from './dto/create-store.dto';
import { UpdateStoreDto } from './dto/update-store.dto';

@Injectable()
export class StoresService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly ozonOrderProvider: OzonOrderProvider,
  ) {}

  async getStores() {
    const stores = await this.prisma.store.findMany({
      orderBy: {
        id: 'desc',
      },
    });

    return stores.map((store) => ({
      ...store,
      apiKey: this.maskApiKey(store.apiKey),
    }));
  }

  async createStore(body: CreateStoreDto, role?: string) {
    const existedStore = await this.prisma.store.findFirst({
      where: {
        clientId: body.clientId,
      },
    });

    if (existedStore) {
      throw new BadRequestException('该 Client ID 已存在，不能重复创建');
    }

    const newStore = await this.prisma.store.create({
      data: {
        name: body.name,
        clientId: body.clientId,
        apiKey: body.apiKey,
        isActive: body.isActive ?? true,
      },
    });
    await this.auditService.writeLog({
      module: 'stores',
      action: 'create',
      role,
      targetType: 'store',
      targetId: newStore.id,
      detail: `新增店铺: ${newStore.name}`,
    });

    return {
      message: '店铺保存成功',
      data: {
        ...newStore,
        apiKey: this.maskApiKey(newStore.apiKey),
      },
    };
  }

  async updateStore(id: number, body: UpdateStoreDto, role?: string) {
    const existingStore = await this.prisma.store.findUnique({
      where: { id },
    });

    if (!existingStore) {
      throw new NotFoundException('店铺不存在');
    }

    const duplicateClientIdStore = await this.prisma.store.findFirst({
      where: {
        clientId: body.clientId,
        NOT: {
          id,
        },
      },
    });

    if (duplicateClientIdStore) {
      throw new BadRequestException('该 Client ID 已被其他店铺使用');
    }

    const updateData: {
      name: string;
      clientId: string;
      apiKey?: string;
      isActive?: boolean;
    } = {
      name: body.name,
      clientId: body.clientId,
    };

    if (body.apiKey && body.apiKey.trim()) {
      updateData.apiKey = body.apiKey.trim();
    }

    if (typeof body.isActive === 'boolean') {
      updateData.isActive = body.isActive;
    }

    const updatedStore = await this.prisma.store.update({
      where: { id },
      data: updateData,
    });
    await this.auditService.writeLog({
      module: 'stores',
      action: 'update',
      role,
      targetType: 'store',
      targetId: updatedStore.id,
      detail: `更新店铺: ${updatedStore.name}`,
    });

    return {
      message: '店铺更新成功',
      data: {
        ...updatedStore,
        apiKey: this.maskApiKey(updatedStore.apiKey),
      },
    };
  }

  async deleteStore(id: number, role?: string) {
    const existingStore = await this.prisma.store.findUnique({
      where: { id },
    });

    if (!existingStore) {
      throw new NotFoundException('店铺不存在');
    }

    const deletedStore = await this.prisma.store.delete({
      where: { id },
    });
    await this.auditService.writeLog({
      module: 'stores',
      action: 'delete',
      role,
      targetType: 'store',
      targetId: deletedStore.id,
      detail: `删除店铺: ${deletedStore.name}`,
    });

    return {
      message: '店铺删除成功',
    };
  }

  async getStoreLiveDetail(
    id: number,
    options: {
      syncDays?: number;
      limit?: number;
      maxPages?: number;
    },
  ) {
    const store = await this.prisma.store.findUnique({
      where: { id },
    });

    if (!store) {
      throw new NotFoundException('店铺不存在');
    }

    const syncDays = this.clamp(options.syncDays, 1, 365, 30);
    const limit = this.clamp(options.limit, 1, 1000, 100);
    const maxPages = this.clamp(options.maxPages, 1, 200, 5);

    try {
      const orders = await this.ozonOrderProvider.fetchOrdersByApiKey({
        storeId: store.id,
        storeName: store.name,
        clientId: store.clientId,
        apiKey: store.apiKey,
        syncDays,
        limit,
        maxPages,
      });

      const statusBreakdown = this.buildStatusBreakdown(orders);
      const currencyBreakdown = this.buildCurrencyBreakdown(orders);
      const latestOrders = orders
        .slice()
        .sort((a, b) => this.toTimestamp(b.createdAt) - this.toTimestamp(a.createdAt))
        .slice(0, 5)
        .map((order) => ({
          orderNo: order.orderNo,
          status: order.status,
          amount: order.totalAmount,
          currency: order.currency,
          createdAt: order.createdAt || null,
        }));

      return {
        message: '店铺真实详情拉取成功',
        data: {
          storeId: store.id,
          storeName: store.name,
          generatedAt: new Date().toISOString(),
          params: {
            syncDays,
            limit,
            maxPages,
          },
          totalOrders: orders.length,
          statusBreakdown,
          currencyBreakdown,
          latestOrders,
        },
      };
    } catch (error) {
      throw new BadRequestException(
        `拉取店铺真实详情失败：${error instanceof Error ? error.message : '未知错误'}`,
      );
    }
  }

  private buildStatusBreakdown(orders: RemoteOrder[]) {
    const map = new Map<string, number>();

    orders.forEach((order) => {
      const key = (order.status || 'unknown').trim().toLowerCase() || 'unknown';
      map.set(key, (map.get(key) || 0) + 1);
    });

    return Array.from(map.entries())
      .map(([status, count]) => ({ status, count }))
      .sort((a, b) => b.count - a.count);
  }

  private buildCurrencyBreakdown(orders: RemoteOrder[]) {
    const map = new Map<string, number>();

    orders.forEach((order) => {
      const key = (order.currency || 'UNKNOWN').toUpperCase();
      map.set(key, (map.get(key) || 0) + order.totalAmount);
    });

    return Array.from(map.entries())
      .map(([currency, totalAmount]) => ({
        currency,
        totalAmount: Number(totalAmount.toFixed(2)),
      }))
      .sort((a, b) => b.totalAmount - a.totalAmount);
  }

  private clamp(value: number | undefined, min: number, max: number, fallback: number) {
    if (typeof value !== 'number' || Number.isNaN(value)) return fallback;
    return Math.min(Math.max(value, min), max);
  }

  private toTimestamp(value?: string) {
    if (!value) return 0;
    const time = new Date(value).getTime();
    return Number.isNaN(time) ? 0 : time;
  }

  private maskApiKey(apiKey: string) {
    if (!apiKey) return '';

    if (apiKey.length <= 8) {
      return '*'.repeat(apiKey.length);
    }

    const start = apiKey.slice(0, 4);
    const end = apiKey.slice(-4);
    const masked = '*'.repeat(apiKey.length - 8);

    return `${start}${masked}${end}`;
  }
}
