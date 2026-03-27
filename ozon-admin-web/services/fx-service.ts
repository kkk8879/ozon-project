import { API_BASE_URL } from '../lib/api-config';
import { getAuthHeaders } from '../lib/auth-role';
import { FxRates } from '../types/fx';

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

export const fxApi = {
  async getRates(): Promise<FxRates> {
    const response = await fetch(`${API_BASE_URL}/fx/rates`, {
      cache: 'no-store',
      headers: getAuthHeaders(),
    });
    return handleResponse<FxRates>(response);
  },

  async updateManualRates(payload: {
    rubToCny?: number;
    usdToRub?: number;
    clearRubToCny?: boolean;
    clearUsdToRub?: boolean;
  }) {
    const response = await fetch(`${API_BASE_URL}/fx/rates/manual`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeaders(),
      },
      body: JSON.stringify(payload),
    });
    return handleResponse<FxRates>(response);
  },
};
