import { API_BASE_URL } from '../lib/api-config';
import { getAuthHeaders } from '../lib/auth-role';
import {
  OrderItem,
  OrderStatusOption,
  OrderSummary,
  SyncTaskLogItem,
} from '../types/order';

async function handleResponse<T>(response: Response): Promise<T> {
  const result = await response.json();

  if (!response.ok) {
    const message = Array.isArray(result.message)
      ? result.message.join('，')
      : result.message || '请求失败';

    throw new Error(message);
  }

  return result;
}

export const orderApi = {
  async getSummary(): Promise<OrderSummary> {
    const response = await fetch(`${API_BASE_URL}/orders/summary`, {
      cache: 'no-store',
      headers: getAuthHeaders(),
    });

    return handleResponse<OrderSummary>(response);
  },

  async getOrders(): Promise<OrderItem[]> {
    const response = await fetch(`${API_BASE_URL}/orders`, {
      cache: 'no-store',
      headers: getAuthHeaders(),
    });

    return handleResponse<OrderItem[]>(response);
  },

  async getStatuses(): Promise<OrderStatusOption[]> {
    const response = await fetch(`${API_BASE_URL}/orders/statuses`, {
      cache: 'no-store',
      headers: getAuthHeaders(),
    });

    return handleResponse<OrderStatusOption[]>(response);
  },

  async updateOrder(id: number, payload: { status?: string; note?: string }) {
    const response = await fetch(`${API_BASE_URL}/orders/${id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeaders(),
      },
      body: JSON.stringify(payload),
    });

    return handleResponse<{
      message: string;
      data: OrderItem;
    }>(response);
  },

  async batchUpdateStatus(payload: { ids: number[]; status: string }) {
    const response = await fetch(`${API_BASE_URL}/orders/batch/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeaders(),
      },
      body: JSON.stringify(payload),
    });

    return handleResponse<{
      message: string;
      data: OrderItem[];
    }>(response);
  },

  async syncOrders(payload?: {
    storeIds?: number[];
    onlyActive?: boolean;
    limit?: number;
    syncDays?: number;
    maxPages?: number;
  }) {
    const response = await fetch(`${API_BASE_URL}/orders/sync`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeaders(),
      },
      body: JSON.stringify(payload ?? {}),
    });

    return handleResponse<{
      message: string;
      data: {
        stores: number;
        successStores: number;
        syncedOrders: number;
        failed: Array<{
          storeId: number;
          storeName: string;
          message: string;
        }>;
        summary: OrderSummary;
      };
    }>(response);
  },

  async getSyncLogs(limit = 10) {
    const response = await fetch(`${API_BASE_URL}/orders/sync-logs?limit=${limit}`, {
      cache: 'no-store',
      headers: getAuthHeaders(),
    });

    return handleResponse<SyncTaskLogItem[]>(response);
  },
};
