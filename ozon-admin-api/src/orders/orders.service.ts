import {
  BadRequestException,
  Injectable,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma.service';
import { BatchUpdateOrderStatusDto } from './dto/batch-update-order-status.dto';
import { SyncOrdersDto } from './dto/sync-orders.dto';
import { UpdateOrderDto } from './dto/update-order.dto';
import { OzonOrderProvider } from './providers/ozon-order-provider';

const ORDER_STATUS_VALUES = [
  'pending',
  'paid',
  'ready_to_ship',
  'shipped',
  'delivered',
  'cancelled',
] as const;

const ORDER_STATUS_ALIAS_MAP: Record<string, string> = {
  awaiting_packaging: 'ready_to_ship',
  acceptance_in_progress: 'ready_to_ship',
  awaiting_deliver: 'shipped',
  in_transit: 'shipped',
  received: 'delivered',
  closed: 'delivered',
  not_accepted: 'cancelled',
  returned: 'cancelled',
  unfulfilled: 'cancelled',
};

type StoreSnapshot = {
  id: number;
  name: string;
  isActive: boolean;
};

type FailedStore = {
  storeId: number;
  storeName: string;
  message: string;
};

type OrderRecord = {
  id: number;
  orderNo: string;
  storeName: string;
  status: string;
  totalAmount: number;
  currency: string;
  createdAt: Date;
  fulfillmentMode: string | null;
  warehouseId: string | null;
  warehouseName: string | null;
  deliveryMethod: string | null;
  customerName: string;
  country: string;
  city: string;
  address: string;
  itemCount: number;
  note: string;
};

type OzonWebhookEvent = {
  orderNo: string;
  status: string;
  createdAt?: string;
  storeIdHint?: number;
  clientIdHint?: string;
};

type WebhookStoreLite = {
  id: number;
  name: string;
  clientId: string;
};

@Injectable()
export class OrdersService implements OnModuleInit, OnModuleDestroy {
  private readonly autoSyncEnabled = this.toBoolEnv(
    'ORDER_AUTO_SYNC_ENABLED',
    true,
  );
  private readonly autoSyncIntervalMs =
    this.toIntEnv('ORDER_AUTO_SYNC_INTERVAL_MINUTES', 2, 1, 1440) * 60 * 1000;
  private readonly autoSyncStartupDelayMs =
    this.toIntEnv('ORDER_AUTO_SYNC_STARTUP_DELAY_SECONDS', 30, 0, 600) * 1000;
  private readonly autoSyncDays = this.toOptionalIntEnv(
    'ORDER_AUTO_SYNC_DAYS',
    1,
    90,
  );
  private readonly autoSyncLimit = this.toIntEnv(
    'ORDER_AUTO_SYNC_LIMIT',
    1000,
    1,
    1000,
  );
  private readonly autoSyncMaxPages = this.toIntEnv(
    'ORDER_AUTO_SYNC_MAX_PAGES',
    10,
    1,
    200,
  );
  private readonly manualFullSyncDays = this.toIntEnv(
    'ORDER_MANUAL_FULL_SYNC_DAYS',
    365,
    1,
    365,
  );
  private readonly manualFullSyncMaxPages = this.toIntEnv(
    'ORDER_MANUAL_FULL_SYNC_MAX_PAGES',
    50,
    1,
    200,
  );
  private autoSyncTimer: NodeJS.Timeout | null = null;
  private autoSyncRunning = false;
  private readonly webhookEnabled = this.toBoolEnv(
    'ORDER_WEBHOOK_ENABLED',
    true,
  );
  private readonly webhookSecret =
    process.env.ORDER_WEBHOOK_SECRET?.trim() || '';

  constructor(
    private readonly prisma: PrismaService,
    private readonly ozonOrderProvider: OzonOrderProvider,
    private readonly auditService: AuditService,
  ) {}

  onModuleInit() {
    this.startAutoSyncTimer();
  }

  onModuleDestroy() {
    if (this.autoSyncTimer) {
      clearInterval(this.autoSyncTimer);
      this.autoSyncTimer = null;
    }
  }

  async getOrders() {
    const orders = await this.prisma.order.findMany({
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
    return orders.map((item) => this.toOrderView(item));
  }

  async getSummary() {
    const orders = await this.prisma.order.findMany({
      select: {
        createdAt: true,
        status: true,
      },
    });
    return this.buildSummary(orders);
  }

  async getAvailableStatuses() {
    const grouped = await this.prisma.order.groupBy({
      by: ['status'],
    });

    const baseStatuses = Array.from(ORDER_STATUS_VALUES);
    const rawStatuses = grouped
      .map((item) => (item.status || '').trim())
      .filter((value) => value.length > 0);

    const mergedStatuses = Array.from(new Set([...baseStatuses, ...rawStatuses]))
      .sort((a, b) => a.localeCompare(b));

    return [
      { label: '全部', value: 'all' },
      ...mergedStatuses.map((status) => ({
        label: this.toStatusLabel(status),
        value: status,
      })),
    ];

  }

  async getSyncLogs(limit: number) {
    const take = Math.max(1, Math.min(limit, 50));
    const logs = await this.prisma.syncTaskLog.findMany({
      orderBy: { id: 'desc' },
      take,
    });

    return logs.map((item) => ({
      id: item.id,
      startedAt: item.startedAt,
      finishedAt: item.finishedAt,
      durationMs: item.durationMs,
      storeCount: item.storeCount,
      successStoreCount: item.successStoreCount,
      failedStoreCount: item.failedStoreCount,
      syncedOrderCount: item.syncedOrderCount,
      status: item.status,
      storesSnapshot: this.parseJson(item.storesSnapshot, [] as StoreSnapshot[]),
      failureDetail: this.parseJson(item.failureDetail || '', [] as FailedStore[]),
      errorMessage: item.errorMessage,
    }));
  }

  async updateOrder(id: number, body: UpdateOrderDto, role?: string) {
    const existing = await this.prisma.order.findUnique({
      where: { id },
    });
    if (!existing) {
      throw new NotFoundException('订单不存在');
    }

    if (body.status) {
      this.assertStatus(body.status);
    }

    const updated = await this.prisma.order.update({
      where: { id },
      data: {
        ...(body.status ? { status: body.status } : {}),
        ...(typeof body.note === 'string' ? { note: body.note.trim() } : {}),
        syncedAt: new Date(),
      },
    });
    await this.auditService.writeLog({
      module: 'orders',
      action: 'update_note',
      role,
      targetType: 'order',
      targetId: updated.id,
      detail: `更新订单备注: ${updated.orderNo}`,
    });

    return {
      message: '订单更新成功',
      data: this.toOrderView(updated),
    };
  }

  async batchUpdateStatus(body: BatchUpdateOrderStatusDto, role?: string) {
    this.assertStatus(body.status);
    const uniqueIds = Array.from(new Set(body.ids));

    const existingOrders = await this.prisma.order.findMany({
      where: {
        id: { in: uniqueIds },
      },
      select: { id: true },
    });

    if (existingOrders.length !== uniqueIds.length) {
      const existed = new Set(existingOrders.map((item) => item.id));
      const notFoundIds = uniqueIds.filter((id) => !existed.has(id));
      throw new NotFoundException(`以下订单不存在：${notFoundIds.join(', ')}`);
    }

    await this.prisma.order.updateMany({
      where: {
        id: { in: uniqueIds },
      },
      data: {
        status: body.status,
        syncedAt: new Date(),
      },
    });

    const updatedOrders = await this.prisma.order.findMany({
      where: {
        id: { in: uniqueIds },
      },
      orderBy: {
        id: 'asc',
      },
    });
    await this.auditService.writeLog({
      module: 'orders',
      action: 'batch_update_status',
      role,
      targetType: 'order',
      targetId: uniqueIds.join(','),
      detail: `批量更新状态为 ${body.status}，共 ${updatedOrders.length} 条`,
    });

    return {
      message: `已批量更新 ${updatedOrders.length} 条订单`,
      data: updatedOrders.map((item) => this.toOrderView(item)),
    };
  }

  async syncOrdersByApiKey(body: SyncOrdersDto, role?: string) {
    const startedAt = new Date();
    let storeSnapshots: StoreSnapshot[] = [];
    let successCount = 0;
    let syncedOrderCount = 0;
    let failed: FailedStore[] = [];
    let status = 'failed';
    let errorMessage = '';

    try {
      const isSystemSync = role === 'system';
      const resolvedSyncDays =
        body.syncDays ??
        (isSystemSync ? this.autoSyncDays : this.manualFullSyncDays);
      const resolvedMaxPages =
        body.maxPages ??
        (isSystemSync ? this.autoSyncMaxPages : this.manualFullSyncMaxPages);
      const onlyActive = body.onlyActive ?? true;
      const where = body.storeIds?.length
        ? {
            id: { in: body.storeIds },
            ...(onlyActive ? { isActive: true } : {}),
          }
        : onlyActive
          ? { isActive: true }
          : {};

      const stores = await this.prisma.store.findMany({
        where,
        orderBy: { id: 'asc' },
      });
      storeSnapshots = stores.map((store) => ({
        id: store.id,
        name: store.name,
        isActive: store.isActive,
      }));

      if (stores.length === 0) {
        throw new BadRequestException(
          '未找到可同步的店铺，请检查店铺状态或筛选条件',
        );
      }

      const fetchedGroups = await Promise.all(
        stores.map(async (store) => {
          try {
            const fetched = await this.ozonOrderProvider.fetchOrdersByApiKey({
              storeId: store.id,
              storeName: store.name,
              clientId: store.clientId,
              apiKey: store.apiKey,
              limit: body.limit,
              syncDays: resolvedSyncDays,
              maxPages: resolvedMaxPages,
            });

            return {
              store,
              fetched,
              success: true as const,
              errorMessage: '',
            };
          } catch (error) {
            const primaryErrorMessage =
              error instanceof Error ? error.message : '同步失败';
            const canFallbackToIncremental = !isSystemSync;

            if (canFallbackToIncremental) {
              try {
                const fallbackFetched =
                  await this.ozonOrderProvider.fetchOrdersByApiKey({
                    storeId: store.id,
                    storeName: store.name,
                    clientId: store.clientId,
                    apiKey: store.apiKey,
                    limit: body.limit,
                    syncDays: this.autoSyncDays ?? 30,
                    maxPages: this.autoSyncMaxPages,
                  });

                return {
                  store,
                  fetched: fallbackFetched,
                  success: true as const,
                  errorMessage: '',
                };
              } catch (fallbackError) {
                const fallbackErrorMessage =
                  fallbackError instanceof Error
                    ? fallbackError.message
                    : '回退增量同步失败';

                return {
                  store,
                  fetched: [] as Awaited<
                    ReturnType<OzonOrderProvider['fetchOrdersByApiKey']>
                  >,
                  success: false as const,
                  errorMessage: `${primaryErrorMessage}；回退增量同步失败：${fallbackErrorMessage}`,
                };
              }
            }

            return {
              store,
              fetched: [] as Awaited<
                ReturnType<OzonOrderProvider['fetchOrdersByApiKey']>
              >,
              success: false as const,
              errorMessage: primaryErrorMessage,
            };
          }
        }),
      );

      for (const group of fetchedGroups) {
        if (!group.success) continue;

        for (const item of group.fetched) {
          const statusValue = this.normalizeStatus(item.status);
          const createdAtDate = item.createdAt
            ? new Date(item.createdAt)
            : null;
          const validCreatedAt =
            createdAtDate && !Number.isNaN(createdAtDate.getTime())
              ? createdAtDate
              : null;
          await this.prisma.order.upsert({
            where: {
              storeId_orderNo: {
                storeId: group.store.id,
                orderNo: item.orderNo,
              },
            },
            create: {
              storeId: group.store.id,
              orderNo: item.orderNo,
              storeName: group.store.name,
              status: statusValue,
              totalAmount: item.totalAmount,
              currency: item.currency,
              createdAt: validCreatedAt || new Date(),
              fulfillmentMode: item.fulfillmentMode || null,
              warehouseId: item.warehouseId || null,
              warehouseName: item.warehouseName || null,
              deliveryMethod: item.deliveryMethod || null,
              customerName: item.customerName,
              country: item.country,
              city: item.city,
              address: item.address,
              itemCount: item.itemCount,
              note: item.note,
              source: 'ozon_live',
              syncedAt: new Date(),
            },
            update: {
              storeName: group.store.name,
              status: statusValue,
              totalAmount: item.totalAmount,
              currency: item.currency,
              ...(validCreatedAt ? { createdAt: validCreatedAt } : {}),
              fulfillmentMode: item.fulfillmentMode || null,
              warehouseId: item.warehouseId || null,
              warehouseName: item.warehouseName || null,
              deliveryMethod: item.deliveryMethod || null,
              customerName: item.customerName,
              country: item.country,
              city: item.city,
              address: item.address,
              itemCount: item.itemCount,
              note: item.note,
              source: 'ozon_live',
              syncedAt: new Date(),
            },
          });
        }
      }

      successCount = fetchedGroups.filter((group) => group.success).length;
      syncedOrderCount = fetchedGroups.reduce(
        (sum, group) => sum + group.fetched.length,
        0,
      );
      failed = fetchedGroups
        .filter((group) => !group.success)
        .map((group) => ({
          storeId: group.store.id,
          storeName: group.store.name,
          message: group.errorMessage,
        }));
      if (failed.length > 0) {
        errorMessage = failed
          .slice(0, 3)
          .map((item) => `${item.storeName}: ${item.message}`)
          .join(' | ');
      }

      if (successCount === 0) {
        status = 'failed';
      } else if (failed.length > 0) {
        status = 'partial';
      } else {
        status = 'success';
      }

      const summary = await this.getSummary();
      await this.auditService.writeLog({
        module: 'orders',
        action: 'sync_orders',
        role,
        targetType: 'sync',
        targetId: String(startedAt.getTime()),
        detail: `同步店铺 ${successCount}/${stores.length}，同步订单 ${syncedOrderCount}`,
      });

      return {
        message: `同步完成：成功店铺 ${successCount}/${stores.length}，订单 ${syncedOrderCount} 条`,
        data: {
          stores: stores.length,
          successStores: successCount,
          syncedOrders: syncedOrderCount,
          failed,
          summary,
        },
      };
    } catch (error) {
      status = 'failed';
      errorMessage = error instanceof Error ? error.message : '同步失败';
      await this.auditService.writeLog({
        module: 'orders',
        action: 'sync_orders_failed',
        role,
        targetType: 'sync',
        targetId: String(startedAt.getTime()),
        detail: errorMessage,
      });
      throw error;
    } finally {
      const finishedAt = new Date();
      const durationMs = Math.max(
        0,
        finishedAt.getTime() - startedAt.getTime(),
      );
      const failedStoreCount = failed.length;
      const storeCount = storeSnapshots.length;

      await this.saveSyncLogSafe({
        startedAt,
        finishedAt,
        durationMs,
        storeCount,
        successStoreCount: successCount,
        failedStoreCount,
        syncedOrderCount,
        status,
        storesSnapshot: storeSnapshots,
        failureDetail: failed,
        errorMessage,
      });
    }
  }

  async handleOzonWebhook(
    payload: unknown,
    headers: Record<string, string | string[] | undefined>,
  ) {
    if (!this.webhookEnabled) {
      throw new BadRequestException('Webhook 功能未启用');
    }

    this.assertWebhookSecret(headers);

    const events = this.extractWebhookEvents(payload);
    if (events.length === 0) {
      return {
        message: '未识别到可处理的 webhook 事件',
        data: {
          received: 0,
          processed: 0,
          ignored: 0,
        },
      };
    }

    const stores = (await this.prisma.store.findMany({
      select: {
        id: true,
        name: true,
        clientId: true,
      },
    })) as WebhookStoreLite[];
    const storeById = new Map<number, WebhookStoreLite>(
      stores.map((item) => [item.id, item] as [number, WebhookStoreLite]),
    );
    const storeByClientId = new Map<string, WebhookStoreLite>(
      stores.map((item) => [item.clientId, item] as [string, WebhookStoreLite]),
    );
    const defaultClientIdHint =
      this.readHeaderValue(headers, 'x-ozon-client-id') ||
      this.readHeaderValue(headers, 'client-id');

    let processed = 0;
    let ignored = 0;

    for (const event of events) {
      const store =
        (typeof event.storeIdHint === 'number'
          ? storeById.get(event.storeIdHint)
          : undefined) ||
        (event.clientIdHint
          ? storeByClientId.get(event.clientIdHint)
          : undefined) ||
        (defaultClientIdHint
          ? storeByClientId.get(defaultClientIdHint)
          : undefined);

      if (!store) {
        ignored += 1;
        continue;
      }

      const normalizedStatus = this.normalizeStatus(event.status);
      const createdAt = this.toValidDate(event.createdAt);

      await this.prisma.order.upsert({
        where: {
          storeId_orderNo: {
            storeId: store.id,
            orderNo: event.orderNo,
          },
        },
        create: {
          storeId: store.id,
          orderNo: event.orderNo,
          storeName: store.name,
          status: normalizedStatus,
          totalAmount: 0,
          currency: 'RUB',
          createdAt,
          fulfillmentMode: null,
          warehouseId: null,
          warehouseName: null,
          deliveryMethod: null,
          customerName: 'Webhook Customer',
          country: 'Unknown',
          city: 'Unknown',
          address: `${store.name} Ozon Address`,
          itemCount: 1,
          note: '来自 Ozon Webhook 增量更新',
          source: 'ozon_webhook',
          syncedAt: new Date(),
        },
        update: {
          storeName: store.name,
          status: normalizedStatus,
          ...(event.createdAt ? { createdAt } : {}),
          fulfillmentMode: null,
          warehouseId: null,
          warehouseName: null,
          deliveryMethod: null,
          source: 'ozon_webhook',
          syncedAt: new Date(),
        },
      });

      processed += 1;
    }

    return {
      message: 'Webhook 增量更新完成',
      data: {
        received: events.length,
        processed,
        ignored,
      },
    };
  }

  private assertStatus(status: string) {
    if (
      !ORDER_STATUS_VALUES.includes(
        status as (typeof ORDER_STATUS_VALUES)[number],
      )
    ) {
      throw new BadRequestException('订单状态不合法');
    }
  }

  private normalizeStatus(status: string) {
    const normalized = status.trim().toLowerCase().replace(/[\s-]+/g, '_');
    if (!normalized) return 'pending';

    if (
      ORDER_STATUS_VALUES.includes(
        normalized as (typeof ORDER_STATUS_VALUES)[number],
      )
    ) {
      return normalized;
    }

    return ORDER_STATUS_ALIAS_MAP[normalized] || normalized;
  }

  private toStatusLabel(status: string) {
    const map: Record<string, string> = {
      pending: '待处理',
      paid: '已付款',
      ready_to_ship: '待发货',
      shipped: '已发货',
      delivered: '已完成',
      cancelled: '已取消',
      awaiting_packaging: '待打包',
      awaiting_deliver: '待揽收',
      delivering: '配送中',
      accepted: '已接单',
      not_accepted: '未接收',
      returned: '已退回',
      unfulfilled: '未履约',
      created: '已创建',
      processing: '处理中',
    };

    return map[status] || status;
  }

  private buildSummary(
    orders: Array<{
      status: string;
      createdAt: Date;
    }>,
  ) {
    const totalOrders = orders.length;
    const pendingOrders = orders.filter(
      (order) => order.status === 'pending',
    ).length;
    const today = new Date().toISOString().slice(0, 10);
    const todayOrders = orders.filter((order) =>
      order.createdAt.toISOString().startsWith(today),
    ).length;

    return {
      totalOrders,
      pendingOrders,
      todayOrders,
    };
  }

  private toOrderView(item: OrderRecord) {
    return {
      id: item.id,
      orderNo: item.orderNo,
      storeName: item.storeName,
      status: item.status,
      totalAmount: item.totalAmount,
      currency: item.currency,
      createdAt: item.createdAt.toISOString(),
      fulfillmentMode: item.fulfillmentMode,
      warehouseId: item.warehouseId,
      warehouseName: item.warehouseName,
      deliveryMethod: item.deliveryMethod,
      customerName: item.customerName,
      country: item.country,
      city: item.city,
      address: item.address,
      itemCount: item.itemCount,
      note: item.note,
    };
  }

  private async saveSyncLogSafe(params: {
    startedAt: Date;
    finishedAt: Date;
    durationMs: number;
    storeCount: number;
    successStoreCount: number;
    failedStoreCount: number;
    syncedOrderCount: number;
    status: string;
    storesSnapshot: StoreSnapshot[];
    failureDetail: FailedStore[];
    errorMessage: string;
  }) {
    try {
      await this.prisma.syncTaskLog.create({
        data: {
          startedAt: params.startedAt,
          finishedAt: params.finishedAt,
          durationMs: params.durationMs,
          storeCount: params.storeCount,
          successStoreCount: params.successStoreCount,
          failedStoreCount: params.failedStoreCount,
          syncedOrderCount: params.syncedOrderCount,
          status: params.status,
          storesSnapshot: JSON.stringify(params.storesSnapshot),
          failureDetail:
            params.failureDetail.length > 0
              ? JSON.stringify(params.failureDetail)
              : null,
          errorMessage: params.errorMessage || null,
        },
      });
    } catch (error) {
      console.error('写入同步日志失败:', error);
    }
  }

  private parseJson<T>(input: string, fallback: T): T {
    try {
      if (!input) return fallback;
      return JSON.parse(input) as T;
    } catch {
      return fallback;
    }
  }

  private assertWebhookSecret(
    headers: Record<string, string | string[] | undefined>,
  ) {
    if (!this.webhookSecret) return;

    const secretHeader = this.readHeaderValue(headers, 'x-webhook-secret');
    const authorization = this.readHeaderValue(headers, 'authorization');
    const bearerToken = authorization?.toLowerCase().startsWith('bearer ')
      ? authorization.slice(7).trim()
      : '';
    const providedSecret = secretHeader || bearerToken;

    if (!providedSecret || providedSecret !== this.webhookSecret) {
      throw new BadRequestException('Webhook 鉴权失败');
    }
  }

  private readHeaderValue(
    headers: Record<string, string | string[] | undefined>,
    key: string,
  ) {
    const value = headers[key];
    if (Array.isArray(value)) return value[0] || '';
    return value || '';
  }

  private extractWebhookEvents(payload: unknown): OzonWebhookEvent[] {
    const root = this.toRecord(payload);
    if (!root) return [];

    const eventsFromItems = this.extractFromItems(root.items);
    if (eventsFromItems.length > 0) return eventsFromItems;

    const eventsFromEvents = this.extractFromItems(root.events);
    if (eventsFromEvents.length > 0) return eventsFromEvents;

    const result = this.toRecord(root.result);
    if (result) {
      const eventsFromPostings = this.extractFromItems(result.postings);
      if (eventsFromPostings.length > 0) return eventsFromPostings;
    }

    const single = this.extractSingleEvent(root);
    return single ? [single] : [];
  }

  private extractFromItems(items: unknown): OzonWebhookEvent[] {
    if (!Array.isArray(items)) return [];
    return items
      .map((item) => this.extractSingleEvent(item))
      .filter((event): event is OzonWebhookEvent => Boolean(event));
  }

  private extractSingleEvent(input: unknown): OzonWebhookEvent | null {
    const row = this.toRecord(input);
    if (!row) return null;

    const orderNo =
      this.readString(row, 'posting_number') ||
      this.readString(row, 'order_number') ||
      this.readString(row, 'orderNo') ||
      this.readString(row, 'postingNumber');
    if (!orderNo) return null;

    const status =
      this.readString(row, 'status') ||
      this.readString(row, 'posting_status') ||
      this.readString(row, 'new_status') ||
      'pending';

    const createdAt =
      this.readString(row, 'created_at') ||
      this.readString(row, 'in_process_at') ||
      this.readString(row, 'event_time') ||
      this.readString(row, 'createdAt') ||
      undefined;

    const storeIdHint =
      this.readNumber(row, 'store_id') ?? this.readNumber(row, 'storeId');
    const clientIdHint =
      this.readString(row, 'client_id') ||
      this.readString(row, 'clientId') ||
      this.readString(row, 'seller_id') ||
      '';

    return {
      orderNo,
      status,
      createdAt,
      storeIdHint: storeIdHint ?? undefined,
      clientIdHint: clientIdHint || undefined,
    };
  }

  private toRecord(value: unknown): Record<string, unknown> | null {
    if (typeof value !== 'object' || value === null) return null;
    return value as Record<string, unknown>;
  }

  private readString(row: Record<string, unknown>, key: string) {
    const value = row[key];
    if (typeof value === 'string') return value.trim();
    if (typeof value === 'number') return String(value);
    return '';
  }

  private readNumber(row: Record<string, unknown>, key: string) {
    const value = row[key];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string') {
      const parsed = Number(value);
      if (!Number.isNaN(parsed)) return parsed;
    }
    return undefined;
  }

  private toValidDate(input?: string) {
    if (!input) return new Date();
    const parsed = new Date(input);
    return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
  }

  private startAutoSyncTimer() {
    if (!this.autoSyncEnabled) return;

    setTimeout(() => {
      void this.runAutoSyncOnce();
    }, this.autoSyncStartupDelayMs);

    this.autoSyncTimer = setInterval(() => {
      void this.runAutoSyncOnce();
    }, this.autoSyncIntervalMs);
  }

  private async runAutoSyncOnce() {
    if (this.autoSyncRunning) return;
    this.autoSyncRunning = true;

    try {
      await this.syncOrdersByApiKey({
        onlyActive: true,
        limit: this.autoSyncLimit,
        maxPages: this.autoSyncMaxPages,
        ...(this.autoSyncDays ? { syncDays: this.autoSyncDays } : {}),
      }, 'system');
    } catch (error) {
      console.error('自动同步执行失败:', error);
    } finally {
      this.autoSyncRunning = false;
    }
  }

  private toIntEnv(name: string, fallback: number, min: number, max: number) {
    const raw = process.env[name];
    const value = Number(raw);
    if (!raw || Number.isNaN(value)) return fallback;
    return Math.max(min, Math.min(max, Math.floor(value)));
  }

  private toOptionalIntEnv(name: string, min: number, max: number) {
    const raw = process.env[name];
    if (!raw) return undefined;
    const value = Number(raw);
    if (Number.isNaN(value)) return undefined;
    return Math.max(min, Math.min(max, Math.floor(value)));
  }

  private toBoolEnv(name: string, fallback: boolean) {
    const raw = process.env[name];
    if (raw === undefined) return fallback;
    return ['1', 'true', 'yes', 'on'].includes(raw.trim().toLowerCase());
  }
}
