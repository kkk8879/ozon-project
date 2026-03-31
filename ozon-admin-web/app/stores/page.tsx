'use client';

import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { API_DIRECT_BASE_URL } from '../../lib/api-config';
import { DetailCard } from '../../components/detail-card';
import { GuardedActionButton } from '../../components/guarded-action-button';
import { ListPageActions } from '../../components/list-page-actions';
import { ListPageSummary } from '../../components/list-page-summary';
import { NoPermissionBanner } from '../../components/no-permission-banner';
import { PageEmpty } from '../../components/page-empty';
import { PageHeader } from '../../components/page-header';
import { PageLoading } from '../../components/page-loading';
import { auditApi } from '../../services/audit-service';
import { orderApi } from '../../services/order-service';
import { storeApi } from '../../services/store-service';
import { OrderItem } from '../../types/order';
import { SaveStorePayload, StoreItem } from '../../types/store';
import { getCurrentRole, subscribeRoleChange } from '../../lib/auth-role';
import { hasPermission, UserRole } from '../../lib/rbac';
import { getPermissionDeniedMessage } from '../../lib/permission-messages';
import {
  downloadCsvFile,
  exportStoresToCsv,
  filterStores,
  getStoreStats,
} from '../../lib/store-utils';
import { getOrderStatusClassName, getOrderStatusLabel } from '../../lib/order-utils';
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
import { getCachedValue, setCachedValue } from '../../lib/client-cache';

const PAGE_SIZE = 5;
const STORES_CACHE_KEY = 'stores:page:v1';
const STORES_CACHE_TTL_MS = 2 * 60 * 1000;

type StoresCacheData = {
  stores: StoreItem[];
  orders: OrderItem[];
};

type StoreDetailDraft = {
  name: string;
  clientId: string;
  isActive: boolean;
  apiKey: string;
};

function StoresPageContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const hasInitializedFromUrl = useRef(false);
  const formSectionRef = useRef<HTMLDivElement | null>(null);
  const detailSectionRef = useRef<HTMLDivElement | null>(null);

  const [name, setName] = useState('');
  const [clientId, setClientId] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [stores, setStores] = useState<StoreItem[]>([]);
  const [orders, setOrders] = useState<OrderItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [tableLoading, setTableLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedStore, setSelectedStore] = useState<StoreItem | null>(null);
  const [showStoreForm, setShowStoreForm] = useState(false);
  const [isDetailEditing, setIsDetailEditing] = useState(false);
  const [apiError, setApiError] = useState('');
  const [role, setRole] = useState<UserRole>('admin');
  const [detailDraft, setDetailDraft] = useState<StoreDetailDraft>({
    name: '',
    clientId: '',
    isActive: true,
    apiKey: '',
  });
  const canCreateStore = hasPermission(role, 'stores.create');
  const canUpdateStore = hasPermission(role, 'stores.update');
  const canDeleteStore = hasPermission(role, 'stores.delete');
  const canManageStores = canCreateStore && canUpdateStore && canDeleteStore;

  async function loadStores() {
    try {
      const cached = getCachedValue<StoresCacheData>(STORES_CACHE_KEY);
      if (stores.length === 0 && cached) {
        setStores(cached.stores);
        setOrders(cached.orders);
        setTableLoading(false);
      } else {
        setTableLoading(stores.length === 0);
      }

      const storeData = await storeApi.getStores();
      setStores(storeData);
      setApiError('');
      setTableLoading(false);

      const orderData = await orderApi.getOrders();
      setOrders(orderData);

      setCachedValue(
        STORES_CACHE_KEY,
        {
          stores: storeData,
          orders: orderData,
        },
        STORES_CACHE_TTL_MS,
      );
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '获取店铺数据失败，请检查接口服务。');
      setApiError(`后端服务未连接（${API_DIRECT_BASE_URL}），请先启动 API 服务。`);
    } finally {
      setTableLoading(false);
    }
  }

  function scrollToForm() {
    if (formSectionRef.current) {
      formSectionRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  function resetForm() {
    setName('');
    setClientId('');
    setApiKey('');
    setIsActive(true);
    setEditingId(null);
    setErrorMessage('');
  }

  function openCreateForm() {
    if (!canCreateStore) {
      setErrorMessage(getPermissionDeniedMessage('stores.create'));
      return;
    }
    resetForm();
    setSuccessMessage('');
    setShowStoreForm(true);
    requestAnimationFrame(scrollToForm);
  }

  function handleEdit(store: StoreItem) {
    if (!canUpdateStore) {
      setErrorMessage(getPermissionDeniedMessage('stores.update'));
      return;
    }
    setName(store.name);
    setClientId(store.clientId);
    setApiKey('');
    setIsActive(store.isActive);
    setEditingId(store.id);
    setShowStoreForm(true);
    setErrorMessage('');
    setSuccessMessage('');
    requestAnimationFrame(scrollToForm);
  }

  async function handleDelete(id: number) {
    if (!canDeleteStore) {
      setErrorMessage(getPermissionDeniedMessage('stores.delete'));
      return;
    }
    setErrorMessage('');
    setSuccessMessage('');

    const confirmed = window.confirm('确定要删除这条店铺数据吗？');
    if (!confirmed) return;

    try {
      await storeApi.deleteStore(id);

      if (editingId === id) {
        resetForm();
        setShowStoreForm(false);
      }

      if (selectedStore?.id === id) {
        setSelectedStore(null);
        setIsDetailEditing(false);
      }

      setSuccessMessage('店铺删除成功');
      await loadStores();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '删除失败，请检查接口服务。');
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMessage('');
    setSuccessMessage('');

    const isEditingMode = editingId !== null;
    if (isEditingMode && !canUpdateStore) {
      setErrorMessage(getPermissionDeniedMessage('stores.update'));
      return;
    }
    if (!isEditingMode && !canCreateStore) {
      setErrorMessage(getPermissionDeniedMessage('stores.create'));
      return;
    }

    if (!name.trim()) {
      setErrorMessage('店铺名称不能为空');
      return;
    }

    if (!clientId.trim()) {
      setErrorMessage('Client ID 不能为空');
      return;
    }

    if (!isEditingMode && !apiKey.trim()) {
      setErrorMessage('新增店铺时 API Key 不能为空');
      return;
    }

    if (apiKey.trim() && apiKey.trim().length < 8) {
      setErrorMessage('API Key 长度不能少于 8 位');
      return;
    }

    setLoading(true);

    try {
      const payload: SaveStorePayload = {
        name: name.trim(),
        clientId: clientId.trim(),
        isActive,
      };

      if (apiKey.trim()) {
        payload.apiKey = apiKey.trim();
      }

      if (isEditingMode) {
        await storeApi.updateStore(editingId, payload);
      } else {
        await storeApi.createStore(payload);
      }

      resetForm();
      setShowStoreForm(false);
      setSuccessMessage(isEditingMode ? '店铺更新成功' : '店铺保存成功');
      await loadStores();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '请求失败，请检查接口服务。');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setRole(getCurrentRole());
    return subscribeRoleChange(setRole);
  }, []);

  useEffect(() => {
    loadStores();
  }, []);

  useEffect(() => {
    const status =
      getValidQueryValue(searchParams.get('status'), ['all', 'active', 'inactive']) ||
      'all';
    const keyword = getQueryValue(searchParams.get('keyword'));

    setSelectedStatus(status);
    setSearchKeyword(keyword);
    setCurrentPage(1);
    setSelectedStore(null);
    setIsDetailEditing(false);

    hasInitializedFromUrl.current = true;
  }, [searchParams]);

  useEffect(() => {
    if (!hasInitializedFromUrl.current) return;

    const queryString = buildQueryString({
      status: selectedStatus !== 'all' ? selectedStatus : '',
      keyword: searchKeyword.trim(),
    });

    const targetUrl = queryString ? `${pathname}?${queryString}` : pathname;
    router.replace(targetUrl);
  }, [selectedStatus, searchKeyword, pathname, router]);

  const filteredStores = useMemo(() => {
    return filterStores({
      stores,
      searchKeyword,
      selectedStatus,
    });
  }, [stores, searchKeyword, selectedStatus]);

  const totalPages = useMemo(() => {
    return getTotalPages(filteredStores.length, PAGE_SIZE);
  }, [filteredStores]);

  const pagedStores = useMemo(() => {
    return paginateItems(filteredStores, currentPage, PAGE_SIZE);
  }, [filteredStores, currentPage]);

  const storeStats = useMemo(() => {
    return getStoreStats(filteredStores);
  }, [filteredStores]);

  const detailStoreIndex = useMemo(() => {
    if (!selectedStore) return -1;
    return filteredStores.findIndex((store) => store.id === selectedStore.id);
  }, [filteredStores, selectedStore]);

  const canSwitchPrev = detailStoreIndex > 0;
  const canSwitchNext =
    detailStoreIndex >= 0 && detailStoreIndex < filteredStores.length - 1;

  const selectedStoreOrders = useMemo(() => {
    if (!selectedStore) return [];
    return orders
      .filter((order) => order.storeName === selectedStore.name)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [orders, selectedStore]);

  const selectedStoreStatusBreakdown = useMemo(() => {
    const statusMap = new Map<string, number>();
    selectedStoreOrders.forEach((order) => {
      statusMap.set(order.status, (statusMap.get(order.status) || 0) + 1);
    });

    return Array.from(statusMap.entries())
      .map(([status, count]) => ({ status, count }))
      .sort((a, b) => b.count - a.count);
  }, [selectedStoreOrders]);

  const selectedStoreCurrencyBreakdown = useMemo(() => {
    const amountMap = new Map<string, number>();
    selectedStoreOrders.forEach((order) => {
      const currency = (order.currency || 'UNKNOWN').toUpperCase();
      amountMap.set(currency, (amountMap.get(currency) || 0) + order.totalAmount);
    });

    return Array.from(amountMap.entries())
      .map(([currency, totalAmount]) => ({
        currency,
        totalAmount: Number(totalAmount.toFixed(2)),
      }))
      .sort((a, b) => b.totalAmount - a.totalAmount);
  }, [selectedStoreOrders]);

  const selectedStoreFulfillmentBreakdown = useMemo(() => {
    const modeMap = new Map<string, number>();
    selectedStoreOrders.forEach((order) => {
      const mode = (order.fulfillmentMode || '').trim().toUpperCase() || 'UNKNOWN';
      modeMap.set(mode, (modeMap.get(mode) || 0) + 1);
    });

    return Array.from(modeMap.entries())
      .map(([mode, count]) => ({ mode, count }))
      .sort((a, b) => b.count - a.count);
  }, [selectedStoreOrders]);

  const selectedStoreWarehouseBreakdown = useMemo(() => {
    const warehouseMap = new Map<string, number>();
    selectedStoreOrders.forEach((order) => {
      const name = (order.warehouseName || '').trim();
      const id = (order.warehouseId || '').trim();
      const key = name || (id ? `仓库 ${id}` : '未返回仓库');
      warehouseMap.set(key, (warehouseMap.get(key) || 0) + 1);
    });

    return Array.from(warehouseMap.entries())
      .map(([warehouse, count]) => ({ warehouse, count }))
      .sort((a, b) => b.count - a.count);
  }, [selectedStoreOrders]);

  const selectedStoreDeliveryMethodBreakdown = useMemo(() => {
    const methodMap = new Map<string, number>();
    selectedStoreOrders.forEach((order) => {
      const method = (order.deliveryMethod || '').trim() || '未返回物流方式';
      methodMap.set(method, (methodMap.get(method) || 0) + 1);
    });

    return Array.from(methodMap.entries())
      .map(([method, count]) => ({ method, count }))
      .sort((a, b) => b.count - a.count);
  }, [selectedStoreOrders]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchKeyword, selectedStatus]);

  useEffect(() => {
    const normalizedPage = normalizeCurrentPage(currentPage, totalPages);
    if (normalizedPage !== currentPage) {
      setCurrentPage(normalizedPage);
    }
  }, [currentPage, totalPages]);

  useEffect(() => {
    if (!selectedStore) return;
    const exists = filteredStores.some((store) => store.id === selectedStore.id);
    if (!exists) {
      setSelectedStore(null);
      setIsDetailEditing(false);
    }
  }, [filteredStores, selectedStore]);

  useEffect(() => {
    if (!selectedStore || !detailSectionRef.current) return;
    requestAnimationFrame(() => {
      detailSectionRef.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
    });
  }, [selectedStore]);

  function handleExportCsv() {
    if (filteredStores.length === 0) {
      alert('当前没有可导出的店铺数据');
      return;
    }

    const csvContent = exportStoresToCsv(filteredStores);
    const today = new Date();
    const dateText = `${today.getFullYear()}-${String(
      today.getMonth() + 1,
    ).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    downloadCsvFile(`stores-export-${dateText}.csv`, csvContent);
    void auditApi.logClientAction({
      module: 'stores',
      action: 'export_csv',
      targetType: 'store',
      detail: `导出店铺 CSV，条数: ${filteredStores.length}`,
    });
  }

  function resetFilters() {
    setSearchKeyword('');
    setSelectedStatus('all');
  }

  function openStoreDetail(store: StoreItem) {
    if (selectedStore?.id === store.id && detailSectionRef.current) {
      detailSectionRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
      return;
    }

    setSelectedStore(store);
    setIsDetailEditing(false);
    setDetailDraft({
      name: store.name,
      clientId: store.clientId,
      isActive: store.isActive,
      apiKey: '',
    });
  }

  function switchStoreDetail(direction: 'prev' | 'next') {
    if (detailStoreIndex < 0) return;
    const targetIndex = direction === 'prev' ? detailStoreIndex - 1 : detailStoreIndex + 1;
    if (targetIndex < 0 || targetIndex >= filteredStores.length) return;
    openStoreDetail(filteredStores[targetIndex]);
  }

  function cancelStoreDetailEdit() {
    if (!selectedStore) return;
    setIsDetailEditing(false);
    setDetailDraft({
      name: selectedStore.name,
      clientId: selectedStore.clientId,
      isActive: selectedStore.isActive,
      apiKey: '',
    });
  }

  async function saveStoreDetail() {
    if (!selectedStore) return;
    if (!canUpdateStore) {
      setErrorMessage(getPermissionDeniedMessage('stores.update'));
      return;
    }
    setErrorMessage('');
    setSuccessMessage('');

    if (!detailDraft.name.trim()) {
      setErrorMessage('店铺名称不能为空');
      return;
    }

    if (!detailDraft.clientId.trim()) {
      setErrorMessage('Client ID 不能为空');
      return;
    }

    if (detailDraft.apiKey.trim() && detailDraft.apiKey.trim().length < 8) {
      setErrorMessage('API Key 长度不能少于 8 位');
      return;
    }

    setLoading(true);
    try {
      const payload: SaveStorePayload = {
        name: detailDraft.name.trim(),
        clientId: detailDraft.clientId.trim(),
        isActive: detailDraft.isActive,
      };
      if (detailDraft.apiKey.trim()) {
        payload.apiKey = detailDraft.apiKey.trim();
      }

      const result = await storeApi.updateStore(selectedStore.id, payload);
      const updated = result.data;

      setStores((prev) =>
        prev.map((store) => (store.id === updated.id ? updated : store)),
      );
      setSelectedStore(updated);
      setDetailDraft({
        name: updated.name,
        clientId: updated.clientId,
        isActive: updated.isActive,
        apiKey: '',
      });
      setIsDetailEditing(false);
      setSuccessMessage('店铺详情已保存');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '保存失败，请检查接口服务。');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="雍金保理ozon电商管理系统 - 店铺管理"
        description="支持店铺新增、编辑、删除、状态筛选、关键词查询、分页浏览、CSV 导出与详情查看。"
      />
      {apiError && (
        <div className="alert-error" style={{ marginBottom: 12 }}>
          {apiError}
        </div>
      )}

      {!canManageStores && (
        <NoPermissionBanner
          permissions={['stores.create', 'stores.update', 'stores.delete']}
          requireAll
          style={{ marginBottom: 12 }}
        />
      )}

      {showStoreForm && canManageStores && (
        <div ref={formSectionRef} className="form-card">
          <h2 style={{ marginTop: 0 }}>{editingId ? `编辑店铺 #${editingId}` : '新增店铺'}</h2>

          <form
            onSubmit={handleSubmit}
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 16,
              maxWidth: 500,
            }}
          >
            <div>
              <label>店铺名称</label>
              <br />
              <input
                className="input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="例如：店铺A"
              />
            </div>

            <div>
              <label>Client ID</label>
              <br />
              <input
                className="input"
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                placeholder="请输入 Client ID"
              />
            </div>

            <div>
              <label>API Key {editingId ? '（可留空，留空则不修改）' : ''}</label>
              <br />
              <input
                className="input"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={editingId ? '如需修改 API Key 请填写新值' : '请输入 API Key'}
              />
            </div>

            <div>
              <label>状态</label>
              <br />
              <select
                className="input"
                value={isActive ? 'true' : 'false'}
                onChange={(e) => setIsActive(e.target.value === 'true')}
              >
                <option value="true">启用</option>
                <option value="false">停用</option>
              </select>
            </div>

            {errorMessage && <div className="alert-error">{errorMessage}</div>}
            {successMessage && <div className="alert-success">{successMessage}</div>}

            <div className="form-actions">
              <button type="submit" disabled={loading} className="btn btn-primary">
                {loading ? (editingId ? '更新中...' : '保存中...') : editingId ? '更新店铺' : '保存店铺'}
              </button>

              <button
                type="button"
                onClick={() => {
                  resetForm();
                  setShowStoreForm(false);
                }}
                className="btn btn-default"
              >
                取消
              </button>
            </div>
          </form>
        </div>
      )}

      <div id="stores-list-section" className="list-card anchor-section">
        <div className="stores-filter-toolbar">
          <div className="orders-status-group">
            <button
              type="button"
              className={`status-filter-btn ${selectedStatus === 'all' ? 'active' : ''}`}
              onClick={() => setSelectedStatus('all')}
            >
              全部
            </button>
            <button
              type="button"
              className={`status-filter-btn ${selectedStatus === 'active' ? 'active' : ''}`}
              onClick={() => setSelectedStatus('active')}
            >
              启用
            </button>
            <button
              type="button"
              className={`status-filter-btn ${selectedStatus === 'inactive' ? 'active' : ''}`}
              onClick={() => setSelectedStatus('inactive')}
            >
              停用
            </button>
            <GuardedActionButton
              role={role}
              permission="stores.create"
              className="add-store-inline-btn"
              onClick={openCreateForm}
            >
              新增店铺
            </GuardedActionButton>
          </div>
        </div>

        <div className="store-advanced-filters">
          <div className="order-filter-item">
            <label className="filter-label">关键词</label>
            <input
              className="input"
              value={searchKeyword}
              onChange={(e) => setSearchKeyword(e.target.value)}
              placeholder="搜索店铺名称 / Client ID / ID"
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

        {!showStoreForm && successMessage && (
          <div style={{ marginTop: 14 }} className="alert-success">
            {successMessage}
          </div>
        )}
        {!showStoreForm && errorMessage && (
          <div style={{ marginTop: 14 }} className="alert-error">
            {errorMessage}
          </div>
        )}

        <div className="table-toolbar" style={{ marginTop: 20 }}>
          <div>
            <h2 style={{ margin: 0 }}>已保存店铺</h2>
            <div className="table-subtitle">
              共 {filteredStores.length} 条记录
              {searchKeyword.trim() || selectedStatus !== 'all' ? '（筛选结果）' : ''}
            </div>
          </div>
        </div>

        <ListPageSummary
          items={[
            { label: '当前结果条数', value: storeStats.total },
            { label: '启用店铺', value: storeStats.active },
            { label: '停用店铺', value: storeStats.inactive },
          ]}
        />

        {tableLoading ? (
          <PageLoading text="店铺列表加载中..." />
        ) : filteredStores.length === 0 ? (
          <PageEmpty
            text={
              searchKeyword.trim() || selectedStatus !== 'all'
                ? '没有找到符合条件的店铺数据。'
                : '当前还没有店铺数据。'
            }
          />
        ) : (
          <>
            <div className="table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>店铺名称</th>
                    <th>Client ID</th>
                    <th>API Key</th>
                    <th>状态</th>
                    <th>创建时间</th>
                    <th>更新时间</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedStores.map((store) => (
                    <tr key={store.id}>
                      <td>{store.id}</td>
                      <td>{store.name}</td>
                      <td>{store.clientId}</td>
                      <td>{store.apiKey}</td>
                      <td>
                        <span
                          className={
                            store.isActive
                              ? 'status-tag status-active'
                              : 'status-tag status-inactive'
                          }
                        >
                          {store.isActive ? '启用' : '停用'}
                        </span>
                      </td>
                      <td>{new Date(store.createdAt).toLocaleString()}</td>
                      <td>{new Date(store.updatedAt).toLocaleString()}</td>
                      <td>
                        <div className="table-actions">
                          <button
                            type="button"
                            onClick={() => openStoreDetail(store)}
                            className="table-btn table-btn-detail"
                          >
                            详情
                          </button>

                          <GuardedActionButton
                            role={role}
                            permission="stores.update"
                            className="table-btn table-btn-edit"
                            onClick={() => handleEdit(store)}
                          >
                            编辑
                          </GuardedActionButton>

                          <GuardedActionButton
                            role={role}
                            permission="stores.delete"
                            className="table-btn table-btn-delete"
                            onClick={() => handleDelete(store.id)}
                          >
                            删除
                          </GuardedActionButton>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="pagination-bar">
              <div className="pagination-info">
                第 {currentPage} / {totalPages} 页，共 {filteredStores.length} 条
              </div>

              <div className="pagination-actions">
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

      {selectedStore && (
        <div ref={detailSectionRef}>
          <div className="detail-action-bar">
            <div className="detail-nav-info">
              {detailStoreIndex >= 0
                ? `当前第 ${detailStoreIndex + 1} / ${filteredStores.length} 条`
                : '当前店铺不在筛选结果中'}
            </div>
            <div className="detail-action-buttons">
              <button
                type="button"
                className="btn btn-default btn-sm"
                disabled={!canSwitchPrev}
                onClick={() => switchStoreDetail('prev')}
              >
                上一条
              </button>
              <button
                type="button"
                className="btn btn-default btn-sm"
                disabled={!canSwitchNext}
                onClick={() => switchStoreDetail('next')}
              >
                下一条
              </button>
              {!isDetailEditing ? (
                <GuardedActionButton
                  role={role}
                  permission="stores.update"
                  className="btn btn-primary btn-sm"
                  onClick={() => setIsDetailEditing(true)}
                >
                  编辑并保存
                </GuardedActionButton>
              ) : (
                <>
                  <GuardedActionButton
                    role={role}
                    permission="stores.update"
                    className="btn btn-primary btn-sm"
                    disabled={loading}
                    onClick={saveStoreDetail}
                  >
                    保存
                  </GuardedActionButton>
                  <button
                    type="button"
                    className="btn btn-default btn-sm"
                    onClick={cancelStoreDetailEdit}
                  >
                    取消
                  </button>
                </>
              )}
            </div>
          </div>

          <DetailCard
            title="店铺详情"
            onClose={() => {
              setSelectedStore(null);
              setIsDetailEditing(false);
            }}
            items={[
              { label: '店铺 ID', value: selectedStore.id },
              {
                label: '店铺名称',
                value: isDetailEditing ? (
                  <input
                    className="input detail-edit-field"
                    value={detailDraft.name}
                    onChange={(e) =>
                      setDetailDraft((prev) => ({ ...prev, name: e.target.value }))
                    }
                  />
                ) : (
                  selectedStore.name
                ),
              },
              {
                label: 'Client ID',
                value: isDetailEditing ? (
                  <input
                    className="input detail-edit-field"
                    value={detailDraft.clientId}
                    onChange={(e) =>
                      setDetailDraft((prev) => ({ ...prev, clientId: e.target.value }))
                    }
                  />
                ) : (
                  selectedStore.clientId
                ),
              },
              {
                label: 'API Key',
                value: isDetailEditing ? (
                  <input
                    className="input detail-edit-field"
                    value={detailDraft.apiKey}
                    placeholder="留空则不更新 API Key"
                    onChange={(e) =>
                      setDetailDraft((prev) => ({ ...prev, apiKey: e.target.value }))
                    }
                  />
                ) : (
                  selectedStore.apiKey
                ),
              },
              {
                label: '状态',
                value: isDetailEditing ? (
                  <select
                    className="input detail-edit-field"
                    value={detailDraft.isActive ? 'true' : 'false'}
                    onChange={(e) =>
                      setDetailDraft((prev) => ({
                        ...prev,
                        isActive: e.target.value === 'true',
                      }))
                    }
                  >
                    <option value="true">启用</option>
                    <option value="false">停用</option>
                  </select>
                ) : (
                  <span
                    className={
                      selectedStore.isActive
                        ? 'status-tag status-active'
                        : 'status-tag status-inactive'
                    }
                  >
                    {selectedStore.isActive ? '启用' : '停用'}
                  </span>
                ),
              },
              {
                label: '创建时间',
                value: new Date(selectedStore.createdAt).toLocaleString(),
              },
              {
                label: '更新时间',
                value: new Date(selectedStore.updatedAt).toLocaleString(),
              },
              {
                label: '订单总量',
                value: (
                  <div className="store-detail-metric-main">
                    {selectedStoreOrders.length}
                    <span className="store-detail-metric-sub">与订单管理同步</span>
                  </div>
                ),
              },
              {
                label: '状态分布',
                value: selectedStoreStatusBreakdown.length > 0
                  ? (
                    <div className="store-detail-chip-list">
                      {selectedStoreStatusBreakdown.slice(0, 8).map((item) => (
                        <span key={item.status} className="store-detail-chip">
                          <span>{getOrderStatusLabel(item.status)}</span>
                          <strong>{item.count}</strong>
                        </span>
                      ))}
                    </div>
                  )
                  : '-',
              },
              {
                label: '发货方式（FBS/FBO）',
                value: selectedStoreFulfillmentBreakdown.length > 0
                  ? (
                    <div className="store-detail-chip-list">
                      {selectedStoreFulfillmentBreakdown.map((item) => (
                        <span key={item.mode} className="store-detail-chip">
                          <span>{item.mode}</span>
                          <strong>{item.count}</strong>
                        </span>
                      ))}
                    </div>
                  )
                  : '-',
              },
              {
                label: '仓库分布',
                value: selectedStoreWarehouseBreakdown.length > 0
                  ? (
                    <div className="store-detail-chip-list">
                      {selectedStoreWarehouseBreakdown.slice(0, 8).map((item) => (
                        <span key={item.warehouse} className="store-detail-chip">
                          <span>{item.warehouse}</span>
                          <strong>{item.count}</strong>
                        </span>
                      ))}
                    </div>
                  )
                  : '-',
              },
              {
                label: '物流方式',
                value: selectedStoreDeliveryMethodBreakdown.length > 0
                  ? (
                    <div className="store-detail-chip-list">
                      {selectedStoreDeliveryMethodBreakdown.slice(0, 8).map((item) => (
                        <span key={item.method} className="store-detail-chip">
                          <span>{item.method}</span>
                          <strong>{item.count}</strong>
                        </span>
                      ))}
                    </div>
                  )
                  : '-',
              },
              {
                label: '币种金额分布',
                value: selectedStoreCurrencyBreakdown.length > 0
                  ? (
                    <div className="store-detail-chip-list">
                      {selectedStoreCurrencyBreakdown.map((item) => (
                        <span key={item.currency} className="store-detail-chip">
                          <span>{item.currency}</span>
                          <strong>{item.totalAmount.toFixed(2)}</strong>
                        </span>
                      ))}
                    </div>
                  )
                  : '-',
              },
              {
                label: '最近订单',
                value: selectedStoreOrders.length > 0
                  ? (
                    <div className="store-detail-order-list">
                      {selectedStoreOrders.slice(0, 5).map((item) => (
                        <div key={item.id} className="store-detail-order-item">
                          <span className="store-detail-order-no">{item.orderNo}</span>
                          <span className={`order-status-tag ${getOrderStatusClassName(item.status)}`}>
                            {getOrderStatusLabel(item.status)}
                          </span>
                          <span className="store-detail-order-amount">{item.totalAmount} {item.currency}</span>
                          <span className="store-detail-order-time">{new Date(item.createdAt).toLocaleString()}</span>
                        </div>
                      ))}
                    </div>
                  )
                  : '-',
                fullRow: true,
              },
            ]}
          />
        </div>
      )}
    </div>
  );
}

export default function StoresPage() {
  return (
    <Suspense fallback={<PageLoading text="店铺页面加载中..." />}>
      <StoresPageContent />
    </Suspense>
  );
}
