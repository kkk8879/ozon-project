import { ButtonHTMLAttributes } from 'react';
import { PermissionCode, UserRole, hasPermission } from '../lib/rbac';
import { getPermissionDeniedMessage } from '../lib/permission-messages';

type GuardedActionButtonProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'onClick'
> & {
  role: UserRole;
  permission: PermissionCode;
  onClick?: () => void;
  deniedText?: string;
};

export function GuardedActionButton({
  role,
  permission,
  onClick,
  deniedText,
  title,
  disabled,
  children,
  ...rest
}: GuardedActionButtonProps) {
  const allowed = hasPermission(role, permission);
  const deniedMessage = deniedText || getPermissionDeniedMessage(permission);
  const finalDisabled = Boolean(disabled) || !allowed;
  const finalTitle = finalDisabled && !allowed ? deniedMessage : title;

  return (
    <button
      {...rest}
      type={rest.type || 'button'}
      title={finalTitle}
      disabled={finalDisabled}
      onClick={() => {
        if (!allowed || finalDisabled) return;
        onClick?.();
      }}
    >
      {children}
    </button>
  );
}

