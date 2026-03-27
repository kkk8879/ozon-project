export const APP_ROLES = ['admin', 'operator', 'viewer'] as const;

export type AppRole = (typeof APP_ROLES)[number];

export const APP_PERMISSIONS = [
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
] as const;

export type AppPermission = (typeof APP_PERMISSIONS)[number];

export const ROLE_PERMISSIONS: Record<AppRole, AppPermission[]> = {
  admin: [...APP_PERMISSIONS],
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

export function normalizeRole(input: unknown): AppRole {
  if (typeof input !== 'string') return 'viewer';
  const value = input.trim().toLowerCase();
  if (value === 'admin' || value === 'operator' || value === 'viewer') {
    return value;
  }
  return 'viewer';
}

export function roleHasPermissions(
  role: AppRole,
  requiredPermissions: readonly AppPermission[],
) {
  const own = new Set(ROLE_PERMISSIONS[role] || []);
  return requiredPermissions.every((permission) => own.has(permission));
}
