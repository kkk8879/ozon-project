'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { API_DIRECT_BASE_URL } from '../lib/api-config';
import { getCachedValue, setCachedValue } from '../lib/client-cache';
import { formatAmountDual, formatOrdersAmountDual } from '../lib/money-utils';
import { getOrderStatusClassName, getOrderStatusLabel } from '../lib/order-utils';
import { dashboardApi } from '../services/dashboard-service';
import { fxApi } from '../services/fx-service';
import { orderApi } from '../services/order-service';
import { storeApi } from '../services/store-service';
import { DashboardSummary } from '../types/dashboard';
import { FxRates } from '../types/fx';
import { OrderItem, OrderSummary } from '../types/order';
import { StoreItem } from '../types/store';

type TrendPoint = {
  dateKey: string;
  label: string;
  orderCount: number;
  pendingCount: number;
  totalAmountRub: number;
};

type TrendGranularity = 'day' | 'week' | 'month';
type TrendMetric = 'count' | 'amount';

type TrendDataResult = {
  points: TrendPoint[];
  granularity: TrendGranularity;
};

type DashboardCacheData = {
  summary: DashboardSummary | null;
  orderSummary: OrderSummary | null;
  stores: StoreItem[];
  orders: OrderItem[];
  fxRates: FxRates | null;
};

const RANGE_OPTIONS = [7, 15, 30, 90, 365];
const DEFAULT_RUB_TO_CNY = 0.08;
const DEFAULT_USD_TO_RUB = 90;
const DASHBOARD_CACHE_KEY = 'dashboard:home:v1';
const DASHBOARD_CACHE_TTL_MS = 2 * 60 * 1000;

function toDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function startOfDay(date: Date) {
  const value = new Date(date);
  value.setHours(0, 0, 0, 0);
  return value;
}

function getTrendStartDate(days: number) {
  const today = startOfDay(new Date());
  const start = new Date(today);
  start.setDate(start.getDate() - (days - 1));
  return start;
}

function getTrendGranularity(days: number): TrendGranularity {
  if (days <= 30) return 'day';
  if (days <= 90) return 'week';
  return 'month';
}

function getTrendGranularityLabel(granularity: TrendGranularity) {
  if (granularity === 'day') return '按日';
  if (granularity === 'week') return '按周';
  return '按月';
}

function getRangeOptionLabel(days: number) {
  if (days === 365) return '近1年';
  return `近${days}天`;
}

function toRubAmount(amount: number, currency: string, rates?: FxRates | null) {
  const rubToCny =
    rates && Number(rates.rubToCny) > 0 ? Number(rates.rubToCny) : DEFAULT_RUB_TO_CNY;
  const usdToRub =
    rates && Number(rates.usdToRub) > 0 ? Number(rates.usdToRub) : DEFAULT_USD_TO_RUB;
  const normalized = (currency || 'RUB').trim().toUpperCase();
  const value = Number(amount) || 0;

  if (normalized === 'RUB') return value;
  if (normalized === 'CNY' || normalized === 'RMB') return value / rubToCny;
  if (normalized === 'USD') return value * usdToRub;
  return value;
}

function buildTrendData(
  orders: OrderItem[],
  days: number,
  rates?: FxRates | null,
): TrendDataResult {
  const granularity = getTrendGranularity(days);
  const today = startOfDay(new Date());
  const start = getTrendStartDate(days);
  const endMs = today.getTime() + 24 * 60 * 60 * 1000;

  if (granularity === 'day') {
    const dayMap = new Map<string, TrendPoint>();

    for (let i = days - 1; i >= 0; i -= 1) {
      const current = new Date(today);
      current.setDate(current.getDate() - i);
      const key = toDateKey(current);
      dayMap.set(key, {
        dateKey: key,
        label: `${current.getMonth() + 1}/${current.getDate()}`,
        orderCount: 0,
        pendingCount: 0,
        totalAmountRub: 0,
      });
    }

    orders.forEach((order) => {
      const orderDate = new Date(order.createdAt);
      const key = toDateKey(orderDate);
      const point = dayMap.get(key);
      if (!point) return;
      point.orderCount += 1;
      point.totalAmountRub += toRubAmount(order.totalAmount, order.currency, rates);
      if (order.status === 'pending') point.pendingCount += 1;
    });

    return { points: Array.from(dayMap.values()), granularity };
  }

  if (granularity === 'week') {
    const bucketSize = 7;
    const bucketCount = Math.ceil(days / bucketSize);
    const points: TrendPoint[] = Array.from({ length: bucketCount }, (_, index) => {
      const bucketStart = new Date(start);
      bucketStart.setDate(bucketStart.getDate() + index * bucketSize);
      const key = toDateKey(bucketStart);
      return {
        dateKey: key,
        label: `${bucketStart.getMonth() + 1}/${bucketStart.getDate()}`,
        orderCount: 0,
        pendingCount: 0,
        totalAmountRub: 0,
      };
    });

    const startMs = start.getTime();
    const dayMs = 24 * 60 * 60 * 1000;

    orders.forEach((order) => {
      const orderDate = startOfDay(new Date(order.createdAt));
      const time = orderDate.getTime();
      if (time < startMs || time >= endMs) return;
      const offsetDays = Math.floor((time - startMs) / dayMs);
      const bucketIndex = Math.floor(offsetDays / bucketSize);
      const point = points[bucketIndex];
      if (!point) return;
      point.orderCount += 1;
      point.totalAmountRub += toRubAmount(order.totalAmount, order.currency, rates);
      if (order.status === 'pending') point.pendingCount += 1;
    });

    return { points, granularity };
  }

  const monthMap = new Map<string, TrendPoint>();
  const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
  const endMonth = new Date(today.getFullYear(), today.getMonth(), 1);

  while (cursor <= endMonth) {
    const month = String(cursor.getMonth() + 1).padStart(2, '0');
    const key = `${cursor.getFullYear()}-${month}`;
    monthMap.set(key, {
      dateKey: key,
      label: `${cursor.getMonth() + 1}月`,
      orderCount: 0,
      pendingCount: 0,
      totalAmountRub: 0,
    });
    cursor.setMonth(cursor.getMonth() + 1);
  }

  const startMs = start.getTime();
  orders.forEach((order) => {
    const orderDate = new Date(order.createdAt);
    const time = orderDate.getTime();
    if (time < startMs || time >= endMs) return;
    const key = `${orderDate.getFullYear()}-${String(orderDate.getMonth() + 1).padStart(2, '0')}`;
    const point = monthMap.get(key);
    if (!point) return;
    point.orderCount += 1;
    point.totalAmountRub += toRubAmount(order.totalAmount, order.currency, rates);
    if (order.status === 'pending') point.pendingCount += 1;
  });

  return { points: Array.from(monthMap.values()), granularity };
}

function filterByStatuses(orders: OrderItem[], statuses: string[]) {
  const set = new Set(statuses.map((item) => item.toLowerCase()));
  return orders.filter((order) => set.has((order.status || '').toLowerCase()));
}

export default function DashboardPage() {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [orderSummary, setOrderSummary] = useState<OrderSummary | null>(null);
  const [stores, setStores] = useState<StoreItem[]>([]);
  const [orders, setOrders] = useState<OrderItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [ordersLoading, setOrdersLoading] = useState(true);
  const [trendDays, setTrendDays] = useState(7);
  const [trendMetric, setTrendMetric] = useState<TrendMetric>('count');
  const [apiError, setApiError] = useState('');
  const [fxRates, setFxRates] = useState<FxRates | null>(null);

  useEffect(() => {
    async function loadDashboardData() {
      try {
        const [summaryData, orderSummaryData, storeData, ratesData] = await Promise.all([
          dashboardApi.getSummary(),
          orderApi.getSummary(),
          storeApi.getStores(),
          fxApi.getRates(),
        ]);
        setSummary(summaryData);
        setOrderSummary(orderSummaryData);
        setStores(storeData);
        setFxRates(ratesData);
        setApiError('');
        const existingCache = getCachedValue<DashboardCacheData>(DASHBOARD_CACHE_KEY);
        setCachedValue(
          DASHBOARD_CACHE_KEY,
          {
            summary: summaryData,
            orderSummary: orderSummaryData,
            stores: storeData,
            orders: existingCache?.orders ?? [],
            fxRates: ratesData,
          },
          DASHBOARD_CACHE_TTL_MS,
        );
      } catch {
        setApiError(`后端服务未连接（${API_DIRECT_BASE_URL}），请先启动 API 服务。`);
      } finally {
        setLoading(false);
      }
    }

    const cached = getCachedValue<DashboardCacheData>(DASHBOARD_CACHE_KEY);
    setLoading(!cached);
    void loadDashboardData();
  }, []);

  useEffect(() => {
    const cached = getCachedValue<DashboardCacheData>(DASHBOARD_CACHE_KEY);
    if (!cached) return;
    setSummary(cached.summary);
    setOrderSummary(cached.orderSummary);
    setStores(cached.stores);
    setOrders(cached.orders);
    setFxRates(cached.fxRates);
    setLoading(false);
    setApiError('');
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function loadOrdersData() {
      try {
        setOrdersLoading(true);
        const orderData = await orderApi.getOrders();
        if (cancelled) return;
        setOrders(orderData);
        const existingCache = getCachedValue<DashboardCacheData>(DASHBOARD_CACHE_KEY);
        setCachedValue(
          DASHBOARD_CACHE_KEY,
          {
            summary: existingCache?.summary ?? null,
            orderSummary: existingCache?.orderSummary ?? null,
            stores: existingCache?.stores ?? [],
            orders: orderData,
            fxRates: existingCache?.fxRates ?? null,
          },
          DASHBOARD_CACHE_TTL_MS,
        );
      } catch {
        if (cancelled) return;
        setOrders([]);
      } finally {
        if (cancelled) return;
        setOrdersLoading(false);
      }
    }

    void loadOrdersData();
    return () => {
      cancelled = true;
    };
  }, []);

  const dashboardRecentRows = 3;
  const recentStores = stores.slice(0, dashboardRecentRows);
  const recentOrders = orders.slice(0, dashboardRecentRows);
  const paddedRecentStores = [
    ...recentStores,
    ...Array.from({ length: Math.max(0, dashboardRecentRows - recentStores.length) }, () => null as StoreItem | null),
  ];
  const paddedRecentOrders = [
    ...recentOrders,
    ...Array.from({ length: Math.max(0, dashboardRecentRows - recentOrders.length) }, () => null as OrderItem | null),
  ];

  const todayKey = toDateKey(new Date());
  const storesListLink = '/stores#stores-list-section';
  const activeStoresLink = '/stores?status=active#stores-list-section';
  const ordersListLink = '/orders#order-list-section';
  const pendingOrdersLink = '/orders?status=pending#order-list-section';
  const todayLink = `/orders?startDate=${todayKey}&endDate=${todayKey}#order-list-section`;
  const todayPendingLink = `/orders?startDate=${todayKey}&endDate=${todayKey}&status=pending#order-list-section`;
  const readyToShipLink = '/orders?status=ready_to_ship#order-list-section';
  const deliveredLink = '/orders?status=delivered#order-list-section';
  const ordersBusy = ordersLoading && orders.length === 0;

  const trendResult = useMemo(
    () => buildTrendData(orders, trendDays, fxRates),
    [orders, trendDays, fxRates],
  );
  const trendData = trendResult.points;
  const trendGranularityLabel = getTrendGranularityLabel(trendResult.granularity);
  const maxTrendMetricValue = useMemo(() => {
    if (trendMetric === 'amount') {
      return Math.max(1, ...trendData.map((item) => item.totalAmountRub));
    }
    return Math.max(1, ...trendData.map((item) => item.orderCount));
  }, [trendData, trendMetric]);

  const trendTotalOrders = useMemo(
    () => trendData.reduce((sum, item) => sum + item.orderCount, 0),
    [trendData],
  );
  const trendPendingOrders = useMemo(
    () => trendData.reduce((sum, item) => sum + item.pendingCount, 0),
    [trendData],
  );
  const trendTotalAmountRub = useMemo(
    () => trendData.reduce((sum, item) => sum + item.totalAmountRub, 0),
    [trendData],
  );
  const trendTotalAmountText = useMemo(() => {
    const start = getTrendStartDate(trendDays);
    return formatOrdersAmountDual(
      orders.filter((order) => new Date(order.createdAt) >= start),
      fxRates,
    );
  }, [orders, trendDays, fxRates]);

  const todayOrderAmountText = useMemo(
    () =>
      formatOrdersAmountDual(
        orders.filter((order) => toDateKey(new Date(order.createdAt)) === todayKey),
        fxRates,
      ),
    [orders, todayKey, fxRates],
  );
  const readyToShipAmountText = useMemo(
    () =>
      formatOrdersAmountDual(
        filterByStatuses(orders, ['ready_to_ship', 'awaiting_packaging', 'acceptance_in_progress']),
        fxRates,
      ),
    [orders, fxRates],
  );
  const deliveredAmountText = useMemo(
    () =>
      formatOrdersAmountDual(
        filterByStatuses(orders, ['delivered', 'received', 'closed']),
        fxRates,
      ),
    [orders, fxRates],
  );

  return (
    <div>
      {apiError && <div className="alert-error" style={{ marginBottom: 12 }}>{apiError}</div>}

      <div className="dashboard-hero">
        <div>
          <h1 className="page-title" style={{ marginBottom: 12 }}>仪表盘</h1>
          <p className="page-desc" style={{ marginBottom: 0 }}>
            欢迎来到雍金保理ozon电商管理系统，这里是你的后台总览页面。
          </p>
        </div>
      </div>

      <div className="card-grid">
        <Link href={storesListLink} className="dashboard-stat-link">
          <div className="stat-card stat-card-clickable">
            <div className="stat-title">店铺总数</div>
            <div className="stat-value">{loading ? '...' : summary?.totalStores ?? 0}</div>
            <div className="stat-footer">点击查看全部店铺</div>
          </div>
        </Link>
        <Link href={activeStoresLink} className="dashboard-stat-link">
          <div className="stat-card stat-card-clickable">
            <div className="stat-title">启用店铺</div>
            <div className="stat-value">{loading ? '...' : summary?.activeStores ?? 0}</div>
            <div className="stat-footer">点击查看启用店铺</div>
          </div>
        </Link>
        <Link href={ordersListLink} className="dashboard-stat-link">
          <div className="stat-card stat-card-clickable">
            <div className="stat-title">订单总数</div>
            <div className="stat-value">{loading ? '...' : orderSummary?.totalOrders ?? 0}</div>
            <div className="stat-footer">
              待处理：{loading ? '...' : orderSummary?.pendingOrders ?? 0} | 今日新增：{loading ? '...' : orderSummary?.todayOrders ?? 0}
            </div>
          </div>
        </Link>
        <Link href={pendingOrdersLink} className="dashboard-stat-link">
          <div className="stat-card stat-card-clickable">
            <div className="stat-title">待处理订单</div>
            <div className="stat-value">{loading ? '...' : orderSummary?.pendingOrders ?? 0}</div>
            <div className="stat-footer">点击查看待处理订单</div>
          </div>
        </Link>
      </div>

      <div className="card-grid" style={{ marginTop: 16 }}>
        <Link href={todayLink} className="dashboard-stat-link">
          <div className="stat-card stat-card-clickable">
            <div className="stat-title">今日订单金额</div>
            <div className="stat-value" style={{ fontSize: 20, lineHeight: 1.35, wordBreak: 'break-word' }}>
              {ordersBusy ? '...' : todayOrderAmountText}
            </div>
            <div className="stat-footer">点击查看今日订单</div>
          </div>
        </Link>
        <Link href={readyToShipLink} className="dashboard-stat-link">
          <div className="stat-card stat-card-clickable">
            <div className="stat-title">待发货状态金额</div>
            <div className="stat-value" style={{ fontSize: 20, lineHeight: 1.35, wordBreak: 'break-word' }}>
              {ordersBusy ? '...' : readyToShipAmountText}
            </div>
            <div className="stat-footer">点击查看待发货订单</div>
          </div>
        </Link>
        <Link href={deliveredLink} className="dashboard-stat-link">
          <div className="stat-card stat-card-clickable">
            <div className="stat-title">已完成状态金额</div>
            <div className="stat-value" style={{ fontSize: 20, lineHeight: 1.35, wordBreak: 'break-word' }}>
              {ordersBusy ? '...' : deliveredAmountText}
            </div>
            <div className="stat-footer">点击查看已完成订单</div>
          </div>
        </Link>
      </div>
      <div className="table-subtitle" style={{ marginTop: 8 }}>
        汇率来源：{fxRates?.source || 'realtime'} | RUB→CNY: {fxRates?.rubToCny?.toFixed(6) || '0.080000'} |
        USD→RUB: {fxRates?.usdToRub?.toFixed(4) || '90.0000'}
      </div>

      <div className="page-card dashboard-trend-card">
        <div className="dashboard-trend-header">
          <div>
            <h2 className="section-title" style={{ marginBottom: 6 }}>订单趋势</h2>
            <div className="table-subtitle">
              近{trendDays}天（{trendGranularityLabel}）{trendMetric === 'count' ? '订单数' : '金额'}：
              {trendMetric === 'count'
                ? `${trendTotalOrders}，待处理：${trendPendingOrders}`
                : `${trendTotalAmountRub.toLocaleString('zh-CN', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })} RUB`}
              ，金额合计：{trendTotalAmountText}
            </div>
          </div>
          <div className="dashboard-trend-range">
            <button
              type="button"
              className={`status-filter-btn ${trendMetric === 'count' ? 'active' : ''}`}
              onClick={() => setTrendMetric('count')}
            >
              按数量
            </button>
            <button
              type="button"
              className={`status-filter-btn ${trendMetric === 'amount' ? 'active' : ''}`}
              onClick={() => setTrendMetric('amount')}
            >
              按金额
            </button>
            {RANGE_OPTIONS.map((days) => (
              <button
                key={days}
                type="button"
                className={`status-filter-btn ${trendDays === days ? 'active' : ''}`}
                onClick={() => setTrendDays(days)}
              >
                {getRangeOptionLabel(days)}
              </button>
            ))}
          </div>
        </div>

        <div className="trend-chart">
          {trendData.map((point) => {
            const metricValue = trendMetric === 'amount' ? point.totalAmountRub : point.orderCount;
            const heightPercent = (metricValue / maxTrendMetricValue) * 100;
            const titleText =
              trendMetric === 'amount'
                ? `${point.dateKey} 金额 ${metricValue.toLocaleString('zh-CN', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })} RUB`
                : `${point.dateKey} 订单 ${metricValue} 单`;
            return (
              <div key={point.dateKey} className="trend-bar-col" title={titleText}>
                <div
                  className="trend-bar"
                  style={{ height: `${Math.max(8, Math.round((heightPercent / 100) * 132))}px` }}
                />
                <div className="trend-bar-value">
                  {trendMetric === 'amount'
                    ? Math.round(metricValue).toLocaleString('zh-CN')
                    : point.orderCount}
                </div>
                <div className="trend-bar-label">{point.label}</div>
              </div>
            );
          })}
        </div>

        <div className="dashboard-trend-links">
          <Link href={todayLink} className="quick-link-card">
            <div className="quick-link-title">查看今日订单</div>
            <div className="quick-link-desc">自动带入今天日期筛选</div>
          </Link>
          <Link href={todayPendingLink} className="quick-link-card">
            <div className="quick-link-title">查看今日待处理</div>
            <div className="quick-link-desc">今天范围 + 待处理状态</div>
          </Link>
          <Link href={pendingOrdersLink} className="quick-link-card">
            <div className="quick-link-title">查看全部待处理</div>
            <div className="quick-link-desc">跨日期汇总待处理订单</div>
          </Link>
        </div>
      </div>

      <div className="dashboard-grid dashboard-grid-3">
        <div className="page-card">
          <h2 className="section-title">最近保存的店铺</h2>
          {loading ? (
            <p>加载中...</p>
          ) : (
            <div className="recent-store-list">
              {paddedRecentStores.map((store, index) => (
                <div key={store?.id ?? `store-empty-${index}`} className="recent-store-item">
                  {store ? (
                    <>
                      <div>
                        <div className="recent-store-name">{store.name}</div>
                        <div className="recent-store-meta">Client ID：{store.clientId}</div>
                        <div className="recent-store-meta">
                          状态：
                          <span
                            className={store.isActive ? 'status-tag status-active' : 'status-tag status-inactive'}
                            style={{ marginLeft: 8 }}
                          >
                            {store.isActive ? '启用' : '停用'}
                          </span>
                        </div>
                      </div>
                      <div className="recent-store-time">
                        更新于：
                        <br />
                        {new Date(store.updatedAt).toLocaleString()}
                      </div>
                    </>
                  ) : (
                    <div className="recent-store-meta">暂无店铺数据</div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="page-card">
          <h2 className="section-title">最近订单</h2>
          {loading ? (
            <p>加载中...</p>
          ) : (
            <div className="recent-store-list">
              {paddedRecentOrders.map((order, index) => (
                <div key={order?.id ?? `order-empty-${index}`} className="recent-store-item">
                  {order ? (
                    <>
                      <div>
                        <div className="recent-store-name">{order.orderNo}</div>
                        <div className="recent-store-meta">店铺：{order.storeName}</div>
                        <div className="recent-store-meta">
                          状态：
                          <span
                            className={`order-status-tag ${getOrderStatusClassName(order.status)}`}
                            style={{ marginLeft: 8 }}
                          >
                            {getOrderStatusLabel(order.status)}
                          </span>
                        </div>
                      </div>
                      <div className="recent-store-time">
                        金额：{formatAmountDual(order.totalAmount, order.currency, fxRates)}
                        <br />
                        {new Date(order.createdAt).toLocaleString()}
                      </div>
                    </>
                  ) : (
                    <div className="recent-store-meta">暂无订单数据</div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="page-card">
          <h2 className="section-title">快捷入口</h2>
          <div className="quick-link-list">
            <Link href={storesListLink} className="quick-link-card">
              <div className="quick-link-title">店铺管理</div>
              <div className="quick-link-desc">新增、编辑、删除、查看店铺详情</div>
            </Link>
            <Link href={ordersListLink} className="quick-link-card">
              <div className="quick-link-title">订单管理</div>
              <div className="quick-link-desc">查看订单、筛选状态、金额与店铺</div>
            </Link>
            <Link href="/products" className="quick-link-card">
              <div className="quick-link-title">商品管理</div>
              <div className="quick-link-desc">查看商品与库存信息</div>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
