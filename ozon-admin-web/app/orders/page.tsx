'use client';

import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { DetailCard } from '../../components/detail-card';
import { GuardedActionButton } from '../../components/guarded-action-button';
import { ListPageActions } from '../../components/list-page-actions';
import { ListPageSummary } from '../../components/list-page-summary';
import { NoPermissionBanner } from '../../components/no-permission-banner';
import { PageEmpty } from '../../components/page-empty';
import { PageHeader } from '../../components/page-header';
import { PageLoading } from '../../components/page-loading';
import { auditApi } from '../../services/audit-service';
import { fxApi } from '../../services/fx-service';
import { orderApi } from '../../services/order-service';
import { FxRates } from '../../types/fx';
import {
  OrderItem,
  OrderStatusOption,
  OrderSummary,
  SyncTaskLogItem,
} from '../../types/order';
import {
  downloadCsvFile,
  exportOrdersToCsv,
  filterOrders,
  getOrderStatusClassName,
  getOrderStatusLabel,
  getOrderStoreOptions,
} from '../../lib/order-utils';
import { formatAmountDual, formatOrdersAmountDual } from '../../lib/money-utils';
import { getPermissionDeniedMessage } from '../../lib/permission-messages';
import {
  buildQueryString,
  getQueryValue,
  getValidQueryValue,
} from '../../lib/url-filter-utils';
import {
  getTotalPages,
  normalizeCurrentPage,
  paginateItems,
} from '../../lib/pagination-utils';
import { getCurrentRole, subscribeRoleChange } from '../../lib/auth-role';
import { hasPermission, UserRole } from '../../lib/rbac';

const PAGE_SIZE = 5;
const DEFAULT_SYNC_DAYS = 365;
const DEFAULT_SYNC_LIMIT = 1000;
const DEFAULT_SYNC_MAX_PAGES = 50;

type OrderDetailDraft = {
  note: string;
};

function getSyncStatusLabel(status: string) {
  if (status === 'success') return '成功';
  if (status === 'partial') return '部分成功';
  if (status === 'failed') return '失败';
  return status || '未知';
}

function getSyncStatusClassName(status: string) {
  if (status === 'success') return 'status-active';
  if (status === 'partial') return 'status-pending';
  if (status === 'failed') return 'status-cancelled';
  return 'status-default';
}

function getSyncStoreSummarySafe(log: SyncTaskLogItem) {
  if (!log.storesSnapshot || log.storesSnapshot.length === 0) {
    return `${log.storeCount} 个店铺`;
  }

  const names = log.storesSnapshot.map((store) => store.name);
  const preview = names.slice(0, 2).join('、');
  const remaining = names.length - 2;
  return remaining > 0 ? `${preview} 等 ${names.length} 个` : preview;
}

function getSyncErrorSummary(log: SyncTaskLogItem) {
  if (log.errorMessage && log.errorMessage.trim()) {
    return log.errorMessage;
  }

  if (log.failureDetail && log.failureDetail.length > 0) {
    return log.failureDetail
      .slice(0, 2)
      .map((item) => `${item.storeName}: ${item.message}`)
      .join(' | ');
  }

  return '-';
}

function getSyncStoreSummary(log: SyncTaskLogItem) {
  if (!log.storesSnapshot || log.storesSnapshot.length === 0) {
    return `${log.storeCount} 个店铺`;
  }

  const names = log.storesSnapshot.map((store) => store.name);
  const preview = names.slice(0, 2).join('、');
  const remaining = names.length - 2;
  return remaining > 0 ? `${preview} 等 ${names.length} 个` : preview;
}

function OrdersPageContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const hasInitializedFromUrl = useRef(false);
  const detailSectionRef = useRef<HTMLDivElement | null>(null);

  const [summary, setSummary] = useState<OrderSummary | null>(null);
  const [orders, setOrders] = useState<OrderItem[]>([]);
  const [statuses, setStatuses] = useState<OrderStatusOption[]>([]);
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [selectedStore, setSelectedStore] = useState('all');
  const [searchKeyword, setSearchKeyword] = useState('');
  const [minAmount, setMinAmount] = useState('');
  const [maxAmount, setMaxAmount] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [loading, setLoading] = useState(true);
  const [syncLogLoading, setSyncLogLoading] = useState(false);
  const [syncLogExpanded, setSyncLogExpanded] = useState(false);
  const [syncingOrders, setSyncingOrders] = useState(false);
  const [syncDaysInput, setSyncDaysInput] = useState(String(DEFAULT_SYNC_DAYS));
  const [syncLimitInput, setSyncLimitInput] = useState(String(DEFAULT_SYNC_LIMIT));
  const [syncMaxPagesInput, setSyncMaxPagesInput] = useState(
    String(DEFAULT_SYNC_MAX_PAGES),
  );
  const [currentPage, setCurrentPage] = useState(1);
  const [jumpPageInput, setJumpPageInput] = useState('1');
  const [selectedOrder, setSelectedOrder] = useState<OrderItem | null>(null);
  const [selectedOrderIds, setSelectedOrderIds] = useState<number[]>([]);
  const [detailSaving, setDetailSaving] = useState(false);
  const [isDetailEditing, setIsDetailEditing] = useState(false);
  const [apiError, setApiError] = useState('');
  const [role, setRole] = useState<UserRole>('admin');
  const [syncLogs, setSyncLogs] = useState<SyncTaskLogItem[]>([]);
  const [fxRates, setFxRates] = useState<FxRates | null>(null);
  const [detailDraft, setDetailDraft] = useState<OrderDetailDraft>({
    note: '',
  });
  const canSyncOrders = hasPermission(role, 'orders.sync');
  const canEditOrders = hasPermission(role, 'orders.edit_note');

  async function loadOrdersPageData() {
    try {
      const [summaryData, orderData, statusData, ratesData] = await Promise.all([
        orderApi.getSummary(),
        orderApi.getOrders(),
        orderApi.getStatuses(),
        fxApi.getRates(),
      ]);
      const dynamicStatuses: OrderStatusOption[] = [
        { label: '全部', value: 'all' },
        ...Array.from(new Set(orderData.map((item) => item.status)))
          .sort((a, b) => a.localeCompare(b))
          .map((status) => ({
            label: getOrderStatusLabel(status),
            value: status,
          })),
      ];
      const statusMap = new Map<string, OrderStatusOption>();
      statusData.forEach((item) => statusMap.set(item.value, item));
      dynamicStatuses.forEach((item) => {
        if (!statusMap.has(item.value)) {
          statusMap.set(item.value, item);
        }
      });

      const mergedStatuses = Array.from(statusMap.values()).sort((a, b) => {
        if (a.value === 'all') return -1;
        if (b.value === 'all') return 1;
        return a.value.localeCompare(b.value);
      });

      setSummary(summaryData);
      setOrders(orderData);
      setStatuses(mergedStatuses);
      setFxRates(ratesData);
      setApiError('');
    } catch (error) {
      console.error('获取订单页面数据失败:', error);
      setApiError('后端服务未连接（localhost:3001），请先启动 API 服务。');
    } finally {
      setLoading(false);
    }
  }

  async function loadSyncLogs() {
    try {
      setSyncLogLoading(true);
      const logs = await orderApi.getSyncLogs(10);
      setSyncLogs(logs);
    } catch (error) {
      console.error('获取同步日志失败:', error);
    } finally {
      setSyncLogLoading(false);
    }
  }

  async function handleSyncOrders() {
    if (!canSyncOrders) {
      setApiError(getPermissionDeniedMessage('orders.sync'));
      return;
    }

    const parseIntWithFallback = (value: string, fallback: number) => {
      const parsed = Number.parseInt(value, 10);
      return Number.isNaN(parsed) ? fallback : parsed;
    };
    const clamp = (value: number, min: number, max: number) =>
      Math.min(Math.max(value, min), max);

    const syncDays = clamp(
      parseIntWithFallback(syncDaysInput, DEFAULT_SYNC_DAYS),
      1,
      365,
    );
    const syncLimit = clamp(
      parseIntWithFallback(syncLimitInput, DEFAULT_SYNC_LIMIT),
      1,
      1000,
    );
    const syncMaxPages = clamp(
      parseIntWithFallback(syncMaxPagesInput, DEFAULT_SYNC_MAX_PAGES),
      1,
      200,
    );

    try {
      setSyncingOrders(true);
      const result = await orderApi.syncOrders({
        onlyActive: true,
        limit: syncLimit,
        syncDays,
        maxPages: syncMaxPages,
      });
      setSyncDaysInput(String(syncDays));
      setSyncLimitInput(String(syncLimit));
      setSyncMaxPagesInput(String(syncMaxPages));
      const failedText =
        result.data.failed.length > 0
          ? `\n失败店铺：${result.data.failed
              .map((item) => `${item.storeName}(${item.message})`)
              .join('；')}`
          : '';
      alert(`${result.message}${failedText}`);
      await Promise.all([loadOrdersPageData(), loadSyncLogs()]);
    } catch (error) {
      alert(error instanceof Error ? error.message : '同步失败');
    } finally {
      setSyncingOrders(false);
    }
  }

  useEffect(() => {
    setRole(getCurrentRole());
    return subscribeRoleChange(setRole);
  }, []);

  useEffect(() => {
    loadOrdersPageData();
    loadSyncLogs();
  }, []);

  useEffect(() => {
    const validStatusValues = ['all', ...statuses.map((item) => item.value)];
    const status =
      getValidQueryValue(searchParams.get('status'), validStatusValues) || 'all';

    const store = getQueryValue(searchParams.get('store')) || 'all';
    const keyword = getQueryValue(searchParams.get('keyword'));
    const minAmountParam = getQueryValue(searchParams.get('minAmount'));
    const maxAmountParam = getQueryValue(searchParams.get('maxAmount'));
    const startDateParam = getQueryValue(searchParams.get('startDate'));
    const endDateParam = getQueryValue(searchParams.get('endDate'));

    setSelectedStatus(status);
    setSelectedStore(store);
    setSearchKeyword(keyword);
    setMinAmount(minAmountParam);
    setMaxAmount(maxAmountParam);
    setStartDate(startDateParam);
    setEndDate(endDateParam);
    setCurrentPage(1);
    setSelectedOrder(null);
    setSelectedOrderIds([]);
    setIsDetailEditing(false);

    hasInitializedFromUrl.current = true;
  }, [searchParams, statuses]);

  useEffect(() => {
    if (!hasInitializedFromUrl.current) return;

    const queryString = buildQueryString({
      status: selectedStatus !== 'all' ? selectedStatus : '',
      store: selectedStore !== 'all' ? selectedStore : '',
      keyword: searchKeyword.trim(),
      minAmount: minAmount.trim(),
      maxAmount: maxAmount.trim(),
      startDate,
      endDate,
    });

    const targetUrl = queryString ? `${pathname}?${queryString}` : pathname;
    router.replace(targetUrl, { scroll: false });
  }, [
    selectedStatus,
    selectedStore,
    searchKeyword,
    minAmount,
    maxAmount,
    startDate,
    endDate,
    pathname,
    router,
  ]);

  const storeOptions = useMemo(() => getOrderStoreOptions(orders), [orders]);

  const filteredOrders = useMemo(() => {
    return filterOrders({
      orders,
      selectedStatus,
      selectedStore,
      searchKeyword,
      minAmount,
      maxAmount,
      startDate,
      endDate,
    });
  }, [
    orders,
    selectedStatus,
    selectedStore,
    searchKeyword,
    minAmount,
    maxAmount,
    startDate,
    endDate,
  ]);

  const visibleSyncLogs = useMemo(
    () => (syncLogExpanded ? syncLogs : syncLogs.slice(0, 2)),
    [syncLogExpanded, syncLogs],
  );

  const totalPages = useMemo(
    () => getTotalPages(filteredOrders.length, PAGE_SIZE),
    [filteredOrders],
  );

  const pagedOrders = useMemo(
    () => paginateItems(filteredOrders, currentPage, PAGE_SIZE),
    [filteredOrders, currentPage],
  );

  const totalFilteredAmountText = useMemo(
    () => formatOrdersAmountDual(filteredOrders, fxRates),
    [filteredOrders, fxRates],
  );

  const selectedOrders = useMemo(
    () => orders.filter((order) => selectedOrderIds.includes(order.id)),
    [orders, selectedOrderIds],
  );

  const detailOrderIndex = useMemo(() => {
    if (!selectedOrder) return -1;
    return filteredOrders.findIndex((order) => order.id === selectedOrder.id);
  }, [filteredOrders, selectedOrder]);

  const canSwitchPrev = detailOrderIndex > 0;
  const canSwitchNext =
    detailOrderIndex >= 0 && detailOrderIndex < filteredOrders.length - 1;
  const isAllPageSelected =
    pagedOrders.length > 0 &&
    pagedOrders.every((order) => selectedOrderIds.includes(order.id));
  const isAllFilteredSelected =
    filteredOrders.length > 0 &&
    filteredOrders.every((order) => selectedOrderIds.includes(order.id));

  useEffect(() => {
    setCurrentPage(1);
  }, [
    selectedStatus,
    selectedStore,
    searchKeyword,
    minAmount,
    maxAmount,
    startDate,
    endDate,
  ]);

  useEffect(() => {
    const normalizedPage = normalizeCurrentPage(currentPage, totalPages);
    if (normalizedPage !== currentPage) {
      setCurrentPage(normalizedPage);
    }
  }, [currentPage, totalPages]);

  useEffect(() => {
    setJumpPageInput(String(currentPage));
  }, [currentPage]);

  useEffect(() => {
    const validIdSet = new Set(filteredOrders.map((order) => order.id));
    setSelectedOrderIds((prev) => prev.filter((id) => validIdSet.has(id)));

    if (selectedOrder && !validIdSet.has(selectedOrder.id)) {
      setSelectedOrder(null);
      setIsDetailEditing(false);
    }
  }, [filteredOrders, selectedOrder]);

  useEffect(() => {
    if (!selectedOrder || !detailSectionRef.current) return;
    requestAnimationFrame(() => {
      detailSectionRef.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
    });
  }, [selectedOrder]);

  function resetFilters() {
    setSelectedStatus('all');
    setSelectedStore('all');
    setSearchKeyword('');
    setMinAmount('');
    setMaxAmount('');
    setStartDate('');
    setEndDate('');
  }

  function handleExportCsv() {
    if (filteredOrders.length === 0) {
      alert('当前没有可导出的订单数据');
      return;
    }

    const csvContent = exportOrdersToCsv(filteredOrders);
    const today = new Date();
    const dateText = `${today.getFullYear()}-${String(
      today.getMonth() + 1,
    ).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    downloadCsvFile(`orders-export-${dateText}.csv`, csvContent);
    void auditApi.logClientAction({
      module: 'orders',
      action: 'export_csv_filtered',
      targetType: 'order',
      detail: `导出当前筛选订单 CSV，条数: ${filteredOrders.length}`,
    });
  }

  function handleExportSelectedCsv() {
    if (selectedOrders.length === 0) {
      alert('请先选择需要导出的订单');
      return;
    }

    const csvContent = exportOrdersToCsv(selectedOrders);
    const today = new Date();
    const dateText = `${today.getFullYear()}-${String(
      today.getMonth() + 1,
    ).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    downloadCsvFile(`orders-selected-export-${dateText}.csv`, csvContent);
    void auditApi.logClientAction({
      module: 'orders',
      action: 'export_csv_selected',
      targetType: 'order',
      detail: `导出已选订单 CSV，条数: ${selectedOrders.length}`,
    });
  }

  function scrollToOrderList() {
    const section = document.getElementById('order-list-section');
    if (section) {
      section.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  function jumpToAllOrders() {
    setSelectedStatus('all');
    scrollToOrderList();
  }

  function jumpToPendingOrders() {
    setSelectedStatus('pending');
    scrollToOrderList();
  }

  function jumpToTodayOrders() {
    const today = new Date();
    const todayText = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(
      2,
      '0',
    )}-${String(today.getDate()).padStart(2, '0')}`;
    setStartDate(todayText);
    setEndDate(todayText);
    scrollToOrderList();
  }

  function openOrderDetail(order: OrderItem) {
    if (selectedOrder?.id === order.id && detailSectionRef.current) {
      detailSectionRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
      return;
    }

    setSelectedOrder(order);
    setIsDetailEditing(false);
    setDetailDraft({
      note: order.note,
    });
  }

  function toggleOrderSelection(orderId: number) {
    setSelectedOrderIds((prev) =>
      prev.includes(orderId) ? prev.filter((id) => id !== orderId) : [...prev, orderId],
    );
  }

  function toggleSelectCurrentPage() {
    if (isAllPageSelected) {
      const pageIdSet = new Set(pagedOrders.map((order) => order.id));
      setSelectedOrderIds((prev) => prev.filter((id) => !pageIdSet.has(id)));
      return;
    }

    const pageIds = pagedOrders.map((order) => order.id);
    setSelectedOrderIds((prev) => Array.from(new Set([...prev, ...pageIds])));
  }

  function toggleSelectAllFiltered() {
    if (isAllFilteredSelected) {
      setSelectedOrderIds([]);
      return;
    }

    setSelectedOrderIds(filteredOrders.map((order) => order.id));
  }

  function switchOrderDetail(direction: 'prev' | 'next') {
    if (detailOrderIndex < 0) return;
    const targetIndex = direction === 'prev' ? detailOrderIndex - 1 : detailOrderIndex + 1;
    if (targetIndex < 0 || targetIndex >= filteredOrders.length) return;
    openOrderDetail(filteredOrders[targetIndex]);
  }

  function jumpToPage() {
    const parsed = Number.parseInt(jumpPageInput, 10);
    if (Number.isNaN(parsed)) {
      setJumpPageInput(String(currentPage));
      return;
    }

    const nextPage = Math.min(Math.max(parsed, 1), totalPages);
    setCurrentPage(nextPage);
  }

  async function saveOrderDetail() {
    if (!selectedOrder) return;
    if (!canEditOrders) {
      setApiError(getPermissionDeniedMessage('orders.edit_note'));
      return;
    }

    try {
      setDetailSaving(true);
      const result = await orderApi.updateOrder(selectedOrder.id, {
        note: detailDraft.note.trim(),
      });

      setOrders((prev) =>
        prev.map((order) => (order.id === result.data.id ? result.data : order)),
      );
      setSelectedOrder(result.data);
      setDetailDraft({
        note: result.data.note,
      });
      setIsDetailEditing(false);
      alert(result.message);
    } catch (error) {
      alert(error instanceof Error ? error.message : '保存失败');
    } finally {
      setDetailSaving(false);
    }
  }

  function cancelOrderDetailEdit() {
    if (!selectedOrder) return;
    setIsDetailEditing(false);
    setDetailDraft({
      note: selectedOrder.note,
    });
  }

  return (
    <div>
      <PageHeader
        title="雍金保理ozon电商管理系统 - 订单管理"
        description="支持订单查询、店铺筛选、金额区间筛选、日期筛选、分页浏览、CSV 导出与订单详情查看。"
      />
      {apiError && (
        <div className="alert-error" style={{ marginBottom: 12 }}>
          {apiError}
          {syncLogs.length > 999 && (
            <button
              type="button"
              className="btn btn-default btn-sm"
              onClick={() => setSyncLogExpanded((prev) => !prev)}
            >
              {syncLogExpanded ? '收起' : `查看全部 (${syncLogs.length})`}
            </button>
          )}
        </div>
      )}
      {!canEditOrders && (
        <NoPermissionBanner
          permissions={['orders.sync', 'orders.edit_note']}
          style={{ marginBottom: 12 }}
        />
      )}

      <div
        style={{
          marginBottom: 12,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 12,
          flexWrap: 'wrap',
        }}
      >
        <div
          className="page-card"
          style={{
            padding: 12,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            flexWrap: 'wrap',
            flex: '1 1 640px',
          }}
        >
          <span className="table-subtitle" style={{ marginTop: 0, whiteSpace: 'nowrap' }}>
            同步参数
          </span>
          <label className="table-subtitle" style={{ marginTop: 0, whiteSpace: 'nowrap' }}>
            天数
            <input
              className="input"
              type="number"
              min={1}
              max={365}
              value={syncDaysInput}
              onChange={(event) => setSyncDaysInput(event.target.value)}
              disabled={syncingOrders}
              style={{ width: 92, marginTop: 0, marginLeft: 6, padding: '8px 10px' }}
            />
          </label>
          <label className="table-subtitle" style={{ marginTop: 0, whiteSpace: 'nowrap' }}>
            每页
            <input
              className="input"
              type="number"
              min={1}
              max={1000}
              value={syncLimitInput}
              onChange={(event) => setSyncLimitInput(event.target.value)}
              disabled={syncingOrders}
              style={{ width: 96, marginTop: 0, marginLeft: 6, padding: '8px 10px' }}
            />
          </label>
          <label className="table-subtitle" style={{ marginTop: 0, whiteSpace: 'nowrap' }}>
            页数
            <input
              className="input"
              type="number"
              min={1}
              max={200}
              value={syncMaxPagesInput}
              onChange={(event) => setSyncMaxPagesInput(event.target.value)}
              disabled={syncingOrders}
              style={{ width: 96, marginTop: 0, marginLeft: 6, padding: '8px 10px' }}
            />
          </label>
          <button
            type="button"
            className="btn btn-default btn-sm"
            onClick={() => {
              setSyncDaysInput(String(DEFAULT_SYNC_DAYS));
              setSyncLimitInput(String(DEFAULT_SYNC_LIMIT));
              setSyncMaxPagesInput(String(DEFAULT_SYNC_MAX_PAGES));
            }}
            disabled={syncingOrders}
          >
            恢复默认
          </button>
        </div>

        <GuardedActionButton
          role={role}
          permission="orders.sync"
          className="btn btn-primary"
          onClick={handleSyncOrders}
          disabled={syncingOrders}
        >
          {syncingOrders ? '同步中...' : '同步真实订单(API Key)'}
        </GuardedActionButton>
      </div>

      <div className="list-card" style={{ marginBottom: 18 }}>
        <div className="table-toolbar" style={{ marginBottom: 10 }}>
          <div>
            <h2 style={{ margin: 0 }}>最近同步记录</h2>
            <div className="table-subtitle">
              开始时间、店铺、成功/失败、耗时、错误信息
            </div>
          </div>
          {syncLogs.length > 2 && (
            <button
              type="button"
              className="btn btn-default btn-sm"
              onClick={() => setSyncLogExpanded((prev) => !prev)}
            >
              {syncLogExpanded ? '收起' : `查看全部 (${syncLogs.length})`}
            </button>
          )}
        </div>
        {syncLogLoading ? (
          <PageLoading text="同步日志加载中..." />
        ) : syncLogs.length === 0 ? (
          <PageEmpty text="暂无同步记录。" />
        ) : (
          <>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
              gap: 10,
              marginBottom: 10,
            }}
          >
            {visibleSyncLogs.map((log) => (
              <div
                key={`compact-${log.id}`}
                className="quick-link-card"
                style={{ minHeight: 120, cursor: 'default' }}
                title={getSyncErrorSummary(log)}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <div className="quick-link-title" style={{ marginBottom: 0 }}>
                    {new Date(log.startedAt).toLocaleString()}
                  </div>
                  <span className={`status-tag ${getSyncStatusClassName(log.status)}`}>
                    {getSyncStatusLabel(log.status)}
                  </span>
                </div>
                <div className="quick-link-desc">店铺：{getSyncStoreSummary(log)}</div>
                <div className="quick-link-desc">
                  成功/失败：{log.successStoreCount}/{log.failedStoreCount} | 同步：
                  {log.syncedOrderCount} | 耗时：{(log.durationMs / 1000).toFixed(2)}s
                </div>
              </div>
            ))}
          </div>
          <div
            className="table-wrapper"
            style={{
              maxHeight: 220,
              overflowY: 'auto',
              display: syncLogExpanded ? 'block' : 'none',
            }}
          >
            <table className="data-table">
              <thead>
                <tr>
                  <th>开始时间</th>
                  <th>店铺数</th>
                  <th>成功/失败</th>
                  <th>同步订单</th>
                  <th>耗时</th>
                  <th>状态</th>
                  <th>错误信息</th>
                </tr>
              </thead>
              <tbody>
                {visibleSyncLogs.map((log) => (
                  <tr key={log.id}>
                    <td>{new Date(log.startedAt).toLocaleString()}</td>
                    <td
                      title={log.storesSnapshot.map((store) => store.name).join(', ')}
                      data-store-summary={getSyncStoreSummarySafe(log)}
                      style={{
                        maxWidth: 320,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {getSyncStoreSummary(log)}
                    </td>
                    <td>
                      {log.successStoreCount}/{log.failedStoreCount}
                    </td>
                    <td>{log.syncedOrderCount}</td>
                    <td>{(log.durationMs / 1000).toFixed(2)}s</td>
                    <td>
                      <span
                        className={`status-tag ${getSyncStatusClassName(log.status)}`}
                      >
                        {getSyncStatusLabel(log.status)}
                      </span>
                    </td>
                    <td
                      style={{
                        maxWidth: 280,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {getSyncErrorSummary(log)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </>
        )}
      </div>

      <div className="card-grid">
        <button
          type="button"
          className="stat-card stat-card-clickable stat-card-button"
          onClick={jumpToAllOrders}
          title="点击查看全部订单"
        >
          <div className="stat-title">订单总数</div>
          <div className="stat-value">{loading ? '...' : summary?.totalOrders ?? 0}</div>
          <div className="stat-footer">全部订单总量</div>
        </button>

        <button
          type="button"
          className="stat-card stat-card-clickable stat-card-button"
          onClick={jumpToPendingOrders}
          title="点击筛选待处理订单"
        >
          <div className="stat-title">待处理订单</div>
          <div className="stat-value">{loading ? '...' : summary?.pendingOrders ?? 0}</div>
          <div className="stat-footer">等待后续处理</div>
        </button>

        <button
          type="button"
          className="stat-card stat-card-clickable stat-card-button"
          onClick={jumpToTodayOrders}
          title="点击筛选今日新增订单"
        >
          <div className="stat-title">今日新增</div>
          <div className="stat-value">{loading ? '...' : summary?.todayOrders ?? 0}</div>
          <div className="stat-footer">今天新建的订单</div>
        </button>
      </div>

      <div id="order-list-section" className="list-card anchor-section" style={{ marginTop: 24 }}>
        <div className="orders-toolbar">
          <div className="orders-status-group">
            {statuses.map((status) => (
              <button
                key={status.value}
                type="button"
                className={`status-filter-btn ${
                  selectedStatus === status.value ? 'active' : ''
                }`}
                onClick={() => {
                  setSelectedStatus(status.value);
                  scrollToOrderList();
                }}
              >
                {status.label}
              </button>
            ))}
          </div>

          <div className="batch-toolbar">
            <button type="button" className="btn btn-default btn-sm" onClick={toggleSelectCurrentPage}>
              {isAllPageSelected ? '取消本页全选' : '本页全选'}
            </button>
            <button type="button" className="btn btn-default btn-sm" onClick={toggleSelectAllFiltered}>
              {isAllFilteredSelected ? '取消全部选择' : '选择当前筛选结果'}
            </button>
            <button type="button" className="btn btn-default btn-sm" onClick={handleExportSelectedCsv}>
              导出已选
            </button>
          </div>
        </div>

        <div className="order-advanced-filters">
          <div className="order-filter-item">
            <label className="filter-label">店铺筛选</label>
            <select
              className="input"
              value={selectedStore}
              onChange={(e) => setSelectedStore(e.target.value)}
            >
              <option value="all">全部店铺</option>
              {storeOptions.map((store) => (
                <option key={store} value={store}>
                  {store}
                </option>
              ))}
            </select>
          </div>

          <div className="order-filter-item">
            <label className="filter-label">关键词</label>
            <input
              className="input"
              value={searchKeyword}
              onChange={(e) => setSearchKeyword(e.target.value)}
              placeholder="搜索订单号 / 店铺名"
            />
          </div>

          <div className="order-filter-item">
            <label className="filter-label">最低金额</label>
            <input
              className="input"
              value={minAmount}
              onChange={(e) => setMinAmount(e.target.value)}
              placeholder="例如 100"
              type="number"
            />
          </div>

          <div className="order-filter-item">
            <label className="filter-label">最高金额</label>
            <input
              className="input"
              value={maxAmount}
              onChange={(e) => setMaxAmount(e.target.value)}
              placeholder="例如 300"
              type="number"
            />
          </div>

          <div className="order-filter-item">
            <label className="filter-label">开始日期</label>
            <input
              className="input"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              type="date"
            />
          </div>

          <div className="order-filter-item">
            <label className="filter-label">结束日期</label>
            <input
              className="input"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              type="date"
            />
          </div>

          <ListPageActions>
            <button type="button" className="btn btn-default" onClick={resetFilters}>
              重置筛选
            </button>

            <button type="button" className="btn btn-primary" onClick={handleExportCsv}>
              导出当前筛选 CSV
            </button>
          </ListPageActions>
        </div>

        <ListPageSummary
          items={[
            { label: '当前结果条数', value: filteredOrders.length },
            {
              label: '当前结果金额合计',
              value: totalFilteredAmountText,
            },
            { label: '已选订单', value: selectedOrderIds.length },
          ]}
        />

        <div className="table-toolbar" style={{ marginTop: 20 }}>
          <div>
            <h2 style={{ margin: 0 }}>订单列表</h2>
            <div className="table-subtitle">当前共 {filteredOrders.length} 条记录</div>
          </div>
        </div>

        {loading ? (
          <PageLoading text="订单加载中..." />
        ) : filteredOrders.length === 0 ? (
          <PageEmpty text="当前没有符合条件的订单数据。" />
        ) : (
          <>
            <div className="table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>
                      <input
                        type="checkbox"
                        checked={isAllPageSelected}
                        onChange={toggleSelectCurrentPage}
                        aria-label="选择本页所有订单"
                      />
                    </th>
                    <th>订单号</th>
                    <th>店铺</th>
                    <th>状态</th>
                    <th>金额</th>
                    <th>币种</th>
                    <th>创建时间</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedOrders.map((order) => (
                    <tr key={order.id}>
                      <td>
                        <input
                          type="checkbox"
                          checked={selectedOrderIds.includes(order.id)}
                          onChange={() => toggleOrderSelection(order.id)}
                          aria-label={`选择订单 ${order.orderNo}`}
                        />
                      </td>
                      <td>{order.orderNo}</td>
                      <td>{order.storeName}</td>
                      <td>
                        <span
                          className={`order-status-tag ${getOrderStatusClassName(
                            order.status,
                          )}`}
                        >
                          {getOrderStatusLabel(order.status)}
                        </span>
                      </td>
                      <td>{formatAmountDual(order.totalAmount, order.currency, fxRates)}</td>
                      <td>{order.currency}</td>
                      <td>{new Date(order.createdAt).toLocaleString()}</td>
                      <td>
                        <div className="table-actions">
                          <button
                            type="button"
                            onClick={() => openOrderDetail(order)}
                            className="table-btn table-btn-detail"
                          >
                            详情
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="pagination-bar">
              <div className="pagination-info">
                第 {currentPage} / {totalPages} 页，共 {filteredOrders.length} 条
              </div>

              <div className="pagination-actions">
                <input
                  type="number"
                  min={1}
                  max={totalPages}
                  value={jumpPageInput}
                  onChange={(e) => setJumpPageInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      jumpToPage();
                    }
                  }}
                  className="input"
                  style={{ width: 96, marginTop: 0 }}
                  aria-label="跳转页码"
                />
                <button
                  type="button"
                  className="btn btn-default"
                  onClick={jumpToPage}
                >
                  跳转
                </button>
                <button
                  type="button"
                  className="btn btn-default"
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                >
                  上一页
                </button>

                <button
                  type="button"
                  className="btn btn-default"
                  disabled={currentPage === totalPages}
                  onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                >
                  下一页
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {selectedOrder && (
        <div ref={detailSectionRef}>
          <div className="detail-action-bar">
            <div className="detail-nav-info">
              {detailOrderIndex >= 0
                ? `当前第 ${detailOrderIndex + 1} / ${filteredOrders.length} 条`
                : '当前订单不在筛选结果中'}
            </div>
            <div className="detail-action-buttons">
              <button
                type="button"
                className="btn btn-default btn-sm"
                disabled={!canSwitchPrev}
                onClick={() => switchOrderDetail('prev')}
              >
                上一条
              </button>
              <button
                type="button"
                className="btn btn-default btn-sm"
                disabled={!canSwitchNext}
                onClick={() => switchOrderDetail('next')}
              >
                下一条
              </button>
              {!isDetailEditing ? (
                <GuardedActionButton
                  role={role}
                  permission="orders.edit_note"
                  className="btn btn-primary btn-sm"
                  disabled={detailSaving}
                  onClick={() => setIsDetailEditing(true)}
                >
                  编辑备注
                </GuardedActionButton>
              ) : (
                <>
                  <GuardedActionButton
                    role={role}
                    permission="orders.edit_note"
                    className="btn btn-primary btn-sm"
                    onClick={saveOrderDetail}
                    disabled={detailSaving}
                  >
                    {detailSaving ? '保存中...' : '保存'}
                  </GuardedActionButton>
                  <button
                    type="button"
                    className="btn btn-default btn-sm"
                    onClick={cancelOrderDetailEdit}
                    disabled={detailSaving}
                  >
                    取消
                  </button>
                </>
              )}
            </div>
          </div>

          <DetailCard
            title="订单详情"
            onClose={() => {
              setSelectedOrder(null);
              setIsDetailEditing(false);
            }}
            items={[
              { label: '订单 ID', value: selectedOrder.id },
              { label: '订单号', value: selectedOrder.orderNo },
              { label: '店铺名称', value: selectedOrder.storeName },
              {
                label: '订单状态',
                value: (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <span
                      className={`order-status-tag ${getOrderStatusClassName(
                        selectedOrder.status,
                      )}`}
                    >
                      {getOrderStatusLabel(selectedOrder.status)}
                    </span>
                    <span className="text-muted" style={{ fontSize: 12 }}>
                      状态码：{selectedOrder.status}
                    </span>
                  </div>
                ),
              },
              {
                label: '订单金额',
                value: formatAmountDual(
                  selectedOrder.totalAmount,
                  selectedOrder.currency,
                  fxRates,
                ),
              },
              { label: '币种', value: selectedOrder.currency },
              { label: '发货方式', value: selectedOrder.fulfillmentMode || '-' },
              {
                label: '仓库',
                value:
                  selectedOrder.warehouseName ||
                  (selectedOrder.warehouseId
                    ? `仓库 ${selectedOrder.warehouseId}`
                    : '-'),
              },
              { label: '物流方式', value: selectedOrder.deliveryMethod || '-' },
              {
                label: '创建时间',
                value: new Date(selectedOrder.createdAt).toLocaleString(),
              },
              { label: '客户姓名', value: selectedOrder.customerName },
              { label: '国家', value: selectedOrder.country },
              { label: '城市', value: selectedOrder.city },
              { label: '地址', value: selectedOrder.address },
              { label: '商品数量', value: selectedOrder.itemCount },
              {
                label: '备注',
                value: isDetailEditing ? (
                  <textarea
                    className="input detail-textarea"
                    value={detailDraft.note}
                    onChange={(e) =>
                      setDetailDraft((prev) => ({ ...prev, note: e.target.value }))
                    }
                  />
                ) : (
                  selectedOrder.note
                ),
                fullRow: true,
              },
            ]}
          />
        </div>
      )}
    </div>
  );
}

export default function OrdersPage() {
  return (
    <Suspense fallback={<PageLoading text="订单页面加载中..." />}>
      <OrdersPageContent />
    </Suspense>
  );
}
