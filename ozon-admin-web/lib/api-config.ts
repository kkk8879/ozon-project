const rawApiBaseUrl =
  process.env.NEXT_PUBLIC_API_BASE_URL?.trim() || 'http://localhost:3001';

export const API_BASE_URL = rawApiBaseUrl.replace(/\/+$/, '');
