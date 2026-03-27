import { API_BASE_URL } from '../lib/api-config';
import { getAuthHeaders } from '../lib/auth-role';

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

export const auditApi = {
  async logClientAction(payload: {
    module: string;
    action: string;
    operator?: string;
    targetType?: string;
    targetId?: string;
    detail?: string;
  }) {
    const response = await fetch(`${API_BASE_URL}/audit-logs/client`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeaders(),
      },
      body: JSON.stringify(payload),
    });

    return handleResponse<{ message: string }>(response);
  },

  async getRecentLogs(limit = 20, module?: string) {
    const query = new URLSearchParams({
      limit: String(limit),
      ...(module ? { module } : {}),
    }).toString();

    const response = await fetch(`${API_BASE_URL}/audit-logs?${query}`, {
      cache: 'no-store',
      headers: getAuthHeaders(),
    });

    return handleResponse<
      Array<{
        id: number;
        module: string;
        action: string;
        role: string;
        operator: string | null;
        targetType: string | null;
        targetId: string | null;
        detail: string | null;
        createdAt: string;
      }>
    >(response);
  },
};
