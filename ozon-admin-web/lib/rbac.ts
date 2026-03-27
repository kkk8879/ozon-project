export const USER_ROLES = ['admin', 'operator', 'viewer'] as const;

export type UserRole = (typeof USER_ROLES)[number];

export type PermissionCode =
  | 'dashboard.read'
  | 'stores.read'
  | 'stores.create'
  | 'stores.update'
  | 'stores.delete'
  | 'orders.read'
  | 'orders.sync'
  | 'orders.update_status'
  | 'orders.edit_note'
  | 'orders.export'
  | 'audit.read'
  | 'audit.write'
  | 'fx.read'
  | 'fx.update'
  | 'users.read'
  | 'users.create'
  | 'users.update'
  | 'users.reset_password'
  | 'users.delete';

export const ROLE_LABELS: Record<UserRole, string> = {
  admin: '管理员',
  operator: '运营',
  viewer: '只读',
};

const ROLE_PERMISSION_MAP: Record<UserRole, PermissionCode[]> = {
  admin: [
    'dashboard.read',
    'stores.read',
    'stores.create',
    'stores.update',
    'stores.delete',
    'orders.read',
    'orders.sync',
    'orders.update_status',
    'orders.edit_note',
    'orders.export',
    'audit.read',
    'audit.write',
    'fx.read',
    'fx.update',
    'users.read',
    'users.create',
    'users.update',
    'users.reset_password',
    'users.delete',
  ],
  operator: [
    'dashboard.read',
    'stores.read',
    'orders.read',
    'orders.sync',
    'orders.update_status',
    'orders.edit_note',
    'orders.export',
    'audit.read',
    'audit.write',
    'fx.read',
    'users.read',
  ],
  viewer: [
    'dashboard.read',
    'stores.read',
    'orders.read',
    'orders.export',
    'audit.write',
    'fx.read',
  ],
};

export function normalizeRole(input: unknown): UserRole {
  if (typeof input !== 'string') return 'viewer';
  const value = input.trim().toLowerCase();
  if (value === 'admin' || value === 'operator' || value === 'viewer') {
    return value;
  }
  return 'viewer';
}

export function hasPermission(role: UserRole, permission: PermissionCode): boolean {
  return (ROLE_PERMISSION_MAP[role] || []).includes(permission);
}
