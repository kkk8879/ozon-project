import { API_BASE_URL } from '../lib/api-config';
import { getAuthHeaders } from '../lib/auth-role';
import { SaveStorePayload, StoreItem, StoreLiveDetail } from '../types/store';

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

export const storeApi = {
  async getStores(): Promise<StoreItem[]> {
    const response = await fetch(`${API_BASE_URL}/stores`, {
      cache: 'no-store',
      headers: getAuthHeaders(),
    });

    return handleResponse<StoreItem[]>(response);
  },

  async createStore(payload: SaveStorePayload) {
    const response = await fetch(`${API_BASE_URL}/stores`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeaders(),
      },
      body: JSON.stringify(payload),
    });

    return handleResponse<{
      message: string;
      data: StoreItem;
    }>(response);
  },

  async updateStore(id: number, payload: SaveStorePayload) {
    const response = await fetch(`${API_BASE_URL}/stores/${id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeaders(),
      },
      body: JSON.stringify(payload),
    });

    return handleResponse<{
      message: string;
      data: StoreItem;
    }>(response);
  },

  async deleteStore(id: number) {
    const response = await fetch(`${API_BASE_URL}/stores/${id}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    });

    return handleResponse<{
      message: string;
    }>(response);
  },

  async getStoreLiveDetail(
    id: number,
    params?: {
      syncDays?: number;
      limit?: number;
      maxPages?: number;
    },
  ) {
    const query = new URLSearchParams();
    if (typeof params?.syncDays === 'number') query.set('syncDays', String(params.syncDays));
    if (typeof params?.limit === 'number') query.set('limit', String(params.limit));
    if (typeof params?.maxPages === 'number') query.set('maxPages', String(params.maxPages));
    const queryString = query.toString();

    const response = await fetch(
      `${API_BASE_URL}/stores/${id}/live-detail${queryString ? `?${queryString}` : ''}`,
      {
        cache: 'no-store',
        headers: getAuthHeaders(),
      },
    );

    return handleResponse<{
      message: string;
      data: StoreLiveDetail;
    }>(response);
  },
};
