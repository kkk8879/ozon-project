'use client';

import { normalizeRole, UserRole } from './rbac';

const STORAGE_KEY = 'ozon_admin_role';
const USERNAME_KEY = 'ozon_admin_username';
const DISPLAY_NAME_KEY = 'ozon_admin_display_name';
const USER_ID_KEY = 'ozon_admin_user_id';
const ROLE_CHANGE_EVENT = 'ozon-role-changed';

export function getCurrentRole(): UserRole {
  if (typeof window === 'undefined') return 'viewer';
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (!stored) return 'viewer';
  return normalizeRole(stored);
}

export function setCurrentRole(role: UserRole) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, role);
  window.dispatchEvent(new CustomEvent(ROLE_CHANGE_EVENT, { detail: role }));
}

export function getCurrentUsername() {
  if (typeof window === 'undefined') return '';
  return window.localStorage.getItem(USERNAME_KEY) || '';
}

export function getCurrentDisplayName() {
  if (typeof window === 'undefined') return '';
  return window.localStorage.getItem(DISPLAY_NAME_KEY) || '';
}

export function getCurrentUserId() {
  if (typeof window === 'undefined') return null;
  const raw = window.localStorage.getItem(USER_ID_KEY);
  if (!raw) return null;
  const id = Number.parseInt(raw, 10);
  return Number.isNaN(id) ? null : id;
}

export function isAuthenticated() {
  if (typeof window === 'undefined') return false;
  const username = window.localStorage.getItem(USERNAME_KEY);
  const role = window.localStorage.getItem(STORAGE_KEY);
  return Boolean(username && role);
}

export function setCurrentUser(payload: {
  id: number;
  role: UserRole;
  username: string;
  displayName?: string;
}) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(USER_ID_KEY, String(payload.id));
  window.localStorage.setItem(STORAGE_KEY, payload.role);
  window.localStorage.setItem(USERNAME_KEY, payload.username);
  if (payload.displayName) {
    window.localStorage.setItem(DISPLAY_NAME_KEY, payload.displayName);
  } else {
    window.localStorage.removeItem(DISPLAY_NAME_KEY);
  }
  window.dispatchEvent(new CustomEvent(ROLE_CHANGE_EVENT, { detail: payload.role }));
}

export function clearCurrentUser() {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(USER_ID_KEY);
  window.localStorage.removeItem(STORAGE_KEY);
  window.localStorage.removeItem(USERNAME_KEY);
  window.localStorage.removeItem(DISPLAY_NAME_KEY);
  window.dispatchEvent(new CustomEvent(ROLE_CHANGE_EVENT, { detail: 'viewer' }));
}

export function subscribeRoleChange(onChange: (role: UserRole) => void) {
  if (typeof window === 'undefined') return () => {};

  const handleStorage = (event: StorageEvent) => {
    if (event.key !== STORAGE_KEY) return;
    onChange(normalizeRole(event.newValue));
  };

  const handleCustom = (event: Event) => {
    const detail = (event as CustomEvent<UserRole>).detail;
    onChange(normalizeRole(detail));
  };

  window.addEventListener('storage', handleStorage);
  window.addEventListener(ROLE_CHANGE_EVENT, handleCustom);

  return () => {
    window.removeEventListener('storage', handleStorage);
    window.removeEventListener(ROLE_CHANGE_EVENT, handleCustom);
  };
}

export function getAuthHeaders(): HeadersInit {
  const userId = getCurrentUserId();
  return {
    'x-user-role': getCurrentRole(),
    ...(userId !== null ? { 'x-user-id': String(userId) } : {}),
  };
}
