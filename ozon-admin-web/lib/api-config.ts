const rawApiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL?.trim();

function resolveApiBaseUrl() {
  if (typeof window !== 'undefined' && window.location?.hostname) {
    const host = window.location.hostname;
    if (host === 'localhost' || host === '127.0.0.1') {
      return 'http://localhost:3001';
    }
  }

  if (rawApiBaseUrl) {
    return rawApiBaseUrl.replace(/\/+$/, '');
  }

  if (typeof window !== 'undefined' && window.location?.hostname) {
    const protocol = window.location.protocol || 'http:';
    return `${protocol}//${window.location.hostname}:3001`;
  }

  return 'http://localhost:3001';
}

export const API_DIRECT_BASE_URL = resolveApiBaseUrl();

export const API_BASE_URL =
  typeof window !== 'undefined' ? '/api-gateway' : API_DIRECT_BASE_URL;
