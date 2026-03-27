import { Injectable } from '@nestjs/common';

export type RemoteOrder = {
  orderNo: string;
  status: string;
  totalAmount: number;
  currency: string;
  createdAt?: string;
  fulfillmentMode?: 'FBS' | 'FBO';
  warehouseId?: string;
  warehouseName?: string;
  deliveryMethod?: string;
  customerName: string;
  country: string;
  city: string;
  address: string;
  itemCount: number;
  note: string;
};

type OzonPostingItem = {
  posting_number?: string;
  status?: string;
  created_at?: string;
  in_process_at?: string;
  shipment_date?: string;
  delivering_date?: string;
  customer?: {
    name?: string;
    city?: string;
    country?: string;
    address_tail?: string;
  };
  products?: Array<{
    price?: string | number;
    quantity?: number;
    currency_code?: string;
  }>;
  analytics_data?: {
    city?: string;
    region?: string;
    country?: string;
  };
  financial_data?: {
    products?: Array<{
      price?: string | number;
      quantity?: number;
      currency_code?: string;
    }>;
  };
  delivery_method?: {
    id?: string | number;
    name?: string;
    warehouse_id?: string | number;
    warehouse_name?: string;
    warehouse?: string;
    tpl_provider?: string;
    tpl_provider_id?: string | number;
  };
};

type OzonPostingListResponse = {
  message?: string;
  result?: {
    postings?: OzonPostingItem[];
    has_next?: boolean;
  };
};

type OzonChannel = 'fbs' | 'fbo';

const STATUS_POOL = [
  'pending',
  'paid',
  'ready_to_ship',
  'shipped',
  'delivered',
] as const;

@Injectable()
export class OzonOrderProvider {
  private readonly baseUrl =
    process.env.OZON_API_BASE_URL?.trim() || 'https://api-seller.ozon.ru';
  private readonly syncMode =
    (process.env.OZON_SYNC_MODE?.trim().toLowerCase() || 'auto') as
      | 'auto'
      | 'live'
      | 'mock';
  private readonly pageLimit = this.toIntEnv(
    'OZON_SYNC_PAGE_LIMIT',
    100,
    1,
    1000,
  );
  private readonly maxPages = this.toIntEnv('OZON_SYNC_MAX_PAGES', 10, 1, 200);
  private readonly defaultSyncDays = this.toIntEnv('OZON_SYNC_DAYS', 30, 1, 365);
  private readonly includeFbs = this.toBoolEnv('OZON_SYNC_INCLUDE_FBS', true);
  private readonly includeFbo = this.toBoolEnv('OZON_SYNC_INCLUDE_FBO', true);
  private readonly fbsPath =
    process.env.OZON_SYNC_FBS_PATH?.trim() || '/v3/posting/fbs/list';
  private readonly fboPath =
    process.env.OZON_SYNC_FBO_PATH?.trim() || '/v2/posting/fbo/list';

  async fetchOrdersByApiKey(params: {
    storeId: number;
    storeName: string;
    clientId: string;
    apiKey: string;
    limit?: number;
    syncDays?: number;
    maxPages?: number;
  }): Promise<RemoteOrder[]> {
    const limit = Math.max(1, Math.min(params.limit ?? this.pageLimit, 1000));
    const syncDays = Math.max(
      1,
      Math.min(params.syncDays ?? this.defaultSyncDays, 365),
    );
    const maxPages = Math.max(1, Math.min(params.maxPages ?? this.maxPages, 200));

    if (this.syncMode === 'mock') {
      return this.buildMockOrders(params, limit);
    }

    try {
      const liveOrders = await this.fetchLiveOrders(params, {
        limit,
        syncDays,
        maxPages,
      });

      if (liveOrders.length > 0) {
        return liveOrders;
      }

      if (this.syncMode === 'live') {
        throw new Error('Ozon 返回空订单结果');
      }
    } catch (error) {
      if (this.syncMode === 'live') {
        throw error;
      }
    }

    throw new Error('Ozon 同步失败或返回空数据');
  }

  private async fetchLiveOrders(
    params: {
      storeName: string;
      clientId: string;
      apiKey: string;
    },
    options: {
      limit: number;
      syncDays: number;
      maxPages: number;
    },
  ): Promise<RemoteOrder[]> {
    const channelResults: Array<{
      channel: OzonChannel;
      postings: OzonPostingItem[];
    }> = [];
    const errors: string[] = [];

    const channels: OzonChannel[] = [];
    if (this.includeFbs) channels.push('fbs');
    if (this.includeFbo) channels.push('fbo');
    if (channels.length === 0) channels.push('fbs');

    for (const channel of channels) {
      try {
        const postings = await this.fetchPostingListByChannel(
          channel,
          params,
          options,
        );
        channelResults.push({ channel, postings });
      } catch (error) {
        errors.push(
          `${channel.toUpperCase()}: ${
            error instanceof Error ? error.message : '未知错误'
          }`,
        );
      }
    }

    if (channelResults.length === 0) {
      throw new Error(errors.join(' | ') || 'Ozon 同步失败');
    }

    const byOrderNo = new Map<string, RemoteOrder>();

    channelResults.forEach(({ channel, postings }) => {
      postings.forEach((posting, index) => {
        const order = this.mapPostingToRemoteOrder(
          posting,
          params.storeName,
          index,
          channel,
        );
        if (!order) return;

        const existing = byOrderNo.get(order.orderNo);
        if (!existing) {
          byOrderNo.set(order.orderNo, order);
          return;
        }

        if (
          this.toTimestamp(order.createdAt) > this.toTimestamp(existing.createdAt)
        ) {
          byOrderNo.set(order.orderNo, order);
        }
      });
    });

    return Array.from(byOrderNo.values()).sort(
      (a, b) => this.toTimestamp(b.createdAt) - this.toTimestamp(a.createdAt),
    );
  }

  private async fetchPostingListByChannel(
    channel: OzonChannel,
    params: {
      clientId: string;
      apiKey: string;
    },
    options: {
      limit: number;
      syncDays: number;
      maxPages: number;
    },
  ) {
    const now = new Date();
    const since = new Date(now);
    since.setDate(now.getDate() - options.syncDays);
    const postings: OzonPostingItem[] = [];

    for (let page = 0; page < options.maxPages; page += 1) {
      const offset = page * options.limit;
      const body = {
        dir: 'DESC',
        filter: {
          since: since.toISOString(),
          to: now.toISOString(),
        },
        limit: options.limit,
        offset,
        with: {
          analytics_data: true,
          financial_data: true,
        },
      };

      const path = channel === 'fbs' ? this.fbsPath : this.fboPath;
      const response = await fetch(`${this.baseUrl}${path}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Client-Id': params.clientId,
          'Api-Key': params.apiKey,
        },
        body: JSON.stringify(body),
      });

      const result = (await response.json()) as OzonPostingListResponse;
      if (!response.ok) {
        throw new Error(result.message || `HTTP ${response.status}`);
      }

      const pageItems = result.result?.postings || [];
      postings.push(...pageItems);

      const hasNext = Boolean(result.result?.has_next);
      if (pageItems.length < options.limit || !hasNext) break;
    }

    return postings;
  }

  private mapPostingToRemoteOrder(
    posting: OzonPostingItem,
    storeName: string,
    index: number,
    channel: OzonChannel,
  ): RemoteOrder | null {
    if (!posting.posting_number) return null;

    const financialProducts =
      posting.financial_data?.products || posting.products || [];
    const amount = financialProducts.reduce((sum, product) => {
      const price = Number(product.price ?? 0);
      const quantity = Number(product.quantity ?? 1);
      if (Number.isNaN(price) || Number.isNaN(quantity)) return sum;
      return sum + price * quantity;
    }, 0);

    const itemCount = (posting.products || []).reduce((sum, product) => {
      const quantity = Number(product.quantity ?? 1);
      return sum + (Number.isNaN(quantity) ? 1 : quantity);
    }, 0);

    const status = this.mapOzonStatus(posting.status);
    const currency =
      financialProducts.find((product) => product.currency_code)
        ?.currency_code || 'USD';
    const customer = posting.customer || {};
    const analytics = posting.analytics_data || {};
    const fulfillmentMode = channel.toUpperCase() as 'FBS' | 'FBO';
    const delivery = posting.delivery_method;
    const warehouseIdRaw = delivery?.warehouse_id;
    const warehouseId =
      warehouseIdRaw === undefined || warehouseIdRaw === null
        ? undefined
        : String(warehouseIdRaw);
    const warehouseName =
      delivery?.warehouse_name ||
      delivery?.warehouse ||
      (warehouseId ? `Warehouse ${warehouseId}` : undefined);
    const deliveryMethod =
      delivery?.name ||
      delivery?.tpl_provider ||
      (delivery?.tpl_provider_id ? `TPL ${delivery.tpl_provider_id}` : undefined);

    const createdAt = this.extractCreatedAt(posting);

    return {
      orderNo: posting.posting_number,
      status,
      totalAmount: Number(amount.toFixed(2)),
      currency,
      ...(createdAt ? { createdAt } : {}),
      fulfillmentMode,
      ...(warehouseId ? { warehouseId } : {}),
      ...(warehouseName ? { warehouseName } : {}),
      ...(deliveryMethod ? { deliveryMethod } : {}),
      customerName: customer.name || `Ozon Customer ${index + 1}`,
      country: analytics.country || customer.country || 'Unknown',
      city: analytics.city || customer.city || 'Unknown',
      address: customer.address_tail || `${storeName} Ozon Address`,
      itemCount: itemCount || 1,
      note: `来自 Ozon API 实时同步（${channel.toUpperCase()}）`,
    };
  }

  private mapOzonStatus(rawStatus?: string) {
    const value = (rawStatus || '').toLowerCase();

    if (
      value.includes('cancel') ||
      value.includes('not_accepted') ||
      value.includes('returned') ||
      value.includes('unfulfilled')
    ) {
      return 'cancelled';
    }

    if (
      value.includes('delivered') ||
      value.includes('received') ||
      value.includes('closed')
    ) {
      return 'delivered';
    }

    if (
      value.includes('delivering') ||
      value.includes('awaiting_deliver') ||
      value.includes('in_transit')
    ) {
      return 'shipped';
    }

    if (
      value.includes('awaiting_packaging') ||
      value.includes('acceptance_in_progress') ||
      value.includes('ready_to_ship')
    ) {
      return 'ready_to_ship';
    }

    if (
      value.includes('awaiting_approve') ||
      value.includes('awaiting_registration') ||
      value.includes('payment') ||
      value.includes('paid')
    ) {
      return 'paid';
    }

    return 'pending';
  }

  private extractCreatedAt(posting: OzonPostingItem) {
    const candidates = [
      posting.created_at,
      posting.in_process_at,
      posting.shipment_date,
      posting.delivering_date,
    ].filter(Boolean) as string[];

    for (const value of candidates) {
      const time = new Date(value);
      if (!Number.isNaN(time.getTime())) {
        return time.toISOString();
      }
    }

    return undefined;
  }

  private toTimestamp(value?: string) {
    if (!value) return 0;
    const time = new Date(value).getTime();
    return Number.isNaN(time) ? 0 : time;
  }

  private buildMockOrders(
    params: {
      storeId: number;
      storeName: string;
      apiKey: string;
    },
    limit: number,
  ): Promise<RemoteOrder[]> {
    const { storeId, storeName, apiKey } = params;
    const now = new Date();
    const dayText = now.toISOString().slice(0, 10).replace(/-/g, '');
    const keySeed = this.toSeed(apiKey);
    const result: RemoteOrder[] = [];

    for (let i = 0; i < Math.min(limit, 6); i += 1) {
      const serial = String(i + 1).padStart(3, '0');
      const status = STATUS_POOL[(keySeed + i) % STATUS_POOL.length];
      const amount = Number(((keySeed % 80) + 30 + i * 17.35).toFixed(2));
      const minuteOffset = i * 19;
      const createdAt = new Date(
        now.getTime() - minuteOffset * 60 * 1000,
      ).toISOString();

      result.push({
        orderNo: `OZ${storeId}${dayText}${serial}`,
        status,
        totalAmount: amount,
        currency: 'USD',
        createdAt,
        customerName: `Auto Customer ${storeId}-${i + 1}`,
        country: 'Russia',
        city: 'Moscow',
        address: `${storeName} Address ${i + 1}`,
        itemCount: (keySeed % 3) + i + 1,
        note: '通过店铺 API Key 同步的占位数据（真实接口失败时自动回退）',
      });
    }

    return Promise.resolve(result);
  }

  private toSeed(value: string): number {
    let seed = 0;
    for (let i = 0; i < value.length; i += 1) {
      seed = (seed * 31 + value.charCodeAt(i)) % 100000;
    }
    return seed;
  }

  private toIntEnv(name: string, fallback: number, min: number, max: number) {
    const raw = process.env[name];
    const value = Number(raw);
    if (!raw || Number.isNaN(value)) return fallback;
    return Math.max(min, Math.min(max, Math.floor(value)));
  }

  private toBoolEnv(name: string, fallback: boolean) {
    const raw = process.env[name];
    if (raw === undefined) return fallback;
    return ['1', 'true', 'yes', 'on'].includes(raw.trim().toLowerCase());
  }
}
