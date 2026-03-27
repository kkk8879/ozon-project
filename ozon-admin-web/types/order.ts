export type OrderSummary = {
  totalOrders: number;
  pendingOrders: number;
  todayOrders: number;
};

export type OrderStatusOption = {
  label: string;
  value: string;
};

export type OrderItem = {
  id: number;
  orderNo: string;
  storeName: string;
  status: string;
  totalAmount: number;
  currency: string;
  createdAt: string;
  fulfillmentMode?: string | null;
  warehouseId?: string | null;
  warehouseName?: string | null;
  deliveryMethod?: string | null;
  customerName: string;
  country: string;
  city: string;
  address: string;
  itemCount: number;
  note: string;
};

export type SyncLogStoreSnapshot = {
  id: number;
  name: string;
  isActive: boolean;
};

export type SyncLogFailedStore = {
  storeId: number;
  storeName: string;
  message: string;
};

export type SyncTaskLogItem = {
  id: number;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  storeCount: number;
  successStoreCount: number;
  failedStoreCount: number;
  syncedOrderCount: number;
  status: 'success' | 'partial' | 'failed' | string;
  storesSnapshot: SyncLogStoreSnapshot[];
  failureDetail: SyncLogFailedStore[];
  errorMessage: string | null;
};
