import { API_BASE_URL } from '../lib/api-config';
import { getAuthHeaders } from '../lib/auth-role';
import { DashboardSummary } from '../types/dashboard';

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

export const dashboardApi = {
  async getSummary(): Promise<DashboardSummary> {
    const response = await fetch(`${API_BASE_URL}/dashboard/summary`, {
      cache: 'no-store',
      headers: getAuthHeaders(),
    });

    return handleResponse<DashboardSummary>(response);
  },
};
