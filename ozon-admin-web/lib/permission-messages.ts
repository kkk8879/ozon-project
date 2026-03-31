import { PermissionCode } from './rbac';

const PERMISSION_LABELS: Record<PermissionCode, string> = {
  'dashboard.read': '查看仪表盘',
  'stores.read': '查看店铺',
  'stores.create': '新增店铺',
  'stores.update': '编辑店铺',
  'stores.delete': '删除店铺',
  'orders.read': '查看订单',
  'orders.sync': '同步订单',
  'orders.update_status': '修改订单状态',
  'orders.edit_note': '编辑订单备注',
  'orders.export': '导出订单',
  'audit.read': '查看审计日志',
  'audit.write': '写入审计日志',
  'fx.read': '查看汇率',
  'fx.update': '修改汇率',
  'users.read': '查看账号',
  'users.create': '新增账号',
  'users.update': '编辑账号',
  'users.unlock': '解锁账号',
  'users.reset_password': '重置密码',
  'users.delete': '删除账号',
};

export function getPermissionLabel(permission: PermissionCode): string {
  return PERMISSION_LABELS[permission] || permission;
}

export function getPermissionDeniedMessage(permission: PermissionCode): string {
  return `当前角色无权执行：${getPermissionLabel(permission)}`;
}

export function getPermissionsDeniedSummary(
  permissions: PermissionCode[],
  requireAll = false,
): string {
  const labels = permissions.map(getPermissionLabel).join('、');
  if (requireAll) {
    return `当前角色权限不足，需具备以下全部权限：${labels}`;
  }
  return `当前角色权限不足，至少需具备以下权限之一：${labels}`;
}
