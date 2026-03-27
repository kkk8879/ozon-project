import { API_BASE_URL } from '../lib/api-config';
import { getAuthHeaders } from '../lib/auth-role';
import {
  AccountItem,
  CreateAccountPayload,
  UpdateAccountPayload,
} from '../types/account';

async function handleResponse<T>(response: Response): Promise<T> {
  const result = await response.json();
  if (!response.ok) {
    const message = Array.isArray(result.message)
      ? result.message.join('；')
      : result.message || '请求失败';
    throw new Error(message);
  }
  return result;
}

export const accountApi = {
  async getAccounts(): Promise<AccountItem[]> {
    const response = await fetch(`${API_BASE_URL}/accounts`, {
      cache: 'no-store',
      headers: getAuthHeaders(),
    });
    return handleResponse<AccountItem[]>(response);
  },

  async createAccount(payload: CreateAccountPayload) {
    const response = await fetch(`${API_BASE_URL}/accounts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeaders(),
      },
      body: JSON.stringify(payload),
    });

    return handleResponse<{ message: string; data: AccountItem }>(response);
  },

  async updateAccount(id: number, payload: UpdateAccountPayload) {
    const response = await fetch(`${API_BASE_URL}/accounts/${id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeaders(),
      },
      body: JSON.stringify(payload),
    });
    return handleResponse<{ message: string; data: AccountItem }>(response);
  },

  async resetPassword(id: number, password: string) {
    const response = await fetch(`${API_BASE_URL}/accounts/${id}/reset-password`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeaders(),
      },
      body: JSON.stringify({ password }),
    });

    return handleResponse<{ message: string }>(response);
  },

  async unlockAccount(id: number) {
    const response = await fetch(`${API_BASE_URL}/accounts/${id}/unlock`, {
      method: 'PATCH',
      headers: getAuthHeaders(),
    });
    return handleResponse<{ message: string }>(response);
  },

  async deleteAccount(id: number) {
    const response = await fetch(`${API_BASE_URL}/accounts/${id}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    });
    return handleResponse<{ message: string }>(response);
  },

  async login(username: string, password: string) {
    const response = await fetch(`${API_BASE_URL}/accounts/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ username, password }),
    });

    return handleResponse<{
      message: string;
      data: AccountItem;
      requirePasswordChange: boolean;
    }>(response);
  },

  async changeFirstPassword(
    username: string,
    password: string,
    newPassword: string,
  ) {
    const response = await fetch(`${API_BASE_URL}/accounts/change-first-password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ username, password, newPassword }),
    });

    return handleResponse<{ message: string }>(response);
  },
};
