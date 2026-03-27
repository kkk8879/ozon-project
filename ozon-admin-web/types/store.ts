export type StoreItem = {
  id: number;
  name: string;
  clientId: string;
  apiKey: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type SaveStorePayload = {
  name: string;
  clientId: string;
  apiKey?: string;
  isActive: boolean;
};

export type StoreLiveOrderPreview = {
  orderNo: string;
  status: string;
  amount: number;
  currency: string;
  createdAt: string | null;
};

export type StoreLiveDetail = {
  storeId: number;
  storeName: string;
  generatedAt: string;
  params: {
    syncDays: number;
    limit: number;
    maxPages: number;
  };
  totalOrders: number;
  statusBreakdown: Array<{
    status: string;
    count: number;
  }>;
  currencyBreakdown: Array<{
    currency: string;
    totalAmount: number;
  }>;
  latestOrders: StoreLiveOrderPreview[];
};
