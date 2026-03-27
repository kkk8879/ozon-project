import { CSSProperties } from 'react';
import { PermissionCode } from '../lib/rbac';
import { getPermissionsDeniedSummary } from '../lib/permission-messages';

type NoPermissionBannerProps = {
  permissions: PermissionCode[];
  requireAll?: boolean;
  message?: string;
  style?: CSSProperties;
};

export function NoPermissionBanner({
  permissions,
  requireAll = false,
  message,
  style,
}: NoPermissionBannerProps) {
  if (permissions.length === 0) return null;

  return (
    <div className="alert-error" style={style}>
      {message || getPermissionsDeniedSummary(permissions, requireAll)}
    </div>
  );
}
