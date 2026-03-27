'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  clearCurrentUser,
  getCurrentDisplayName,
  getCurrentRole,
  getCurrentUsername,
  subscribeRoleChange,
} from '../lib/auth-role';
import { ROLE_LABELS, UserRole } from '../lib/rbac';

export default function TopbarRoleSwitcher() {
  const router = useRouter();
  const [role, setRole] = useState<UserRole>('viewer');
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');

  useEffect(() => {
    setRole(getCurrentRole());
    setDisplayName(getCurrentDisplayName());
    setUsername(getCurrentUsername());
    return subscribeRoleChange((nextRole) => {
      setRole(nextRole);
      setDisplayName(getCurrentDisplayName());
      setUsername(getCurrentUsername());
    });
  }, []);

  const nameText = displayName || username || '未登录';

  return (
    <div className="topbar-account">
      <span className="topbar-user-name">{nameText}</span>
      <span className="topbar-user-role">{ROLE_LABELS[role]}</span>
      <button
        type="button"
        className="btn btn-default btn-sm"
        onClick={() => {
          clearCurrentUser();
          router.replace('/login');
        }}
      >
        退出登录
      </button>
    </div>
  );
}

