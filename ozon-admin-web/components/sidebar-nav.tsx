'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { getCurrentRole, subscribeRoleChange } from '../lib/auth-role';
import { hasPermission, PermissionCode, UserRole } from '../lib/rbac';

const navItems: Array<{ href: string; label: string; permission?: PermissionCode }> = [
  { href: '/', label: '仪表盘', permission: 'dashboard.read' },
  { href: '/stores', label: '店铺管理', permission: 'stores.read' },
  { href: '/orders', label: '订单管理', permission: 'orders.read' },
  { href: '/audit', label: '操作审计', permission: 'audit.read' },
  { href: '/accounts', label: '账号管理', permission: 'users.read' },
  { href: '/products', label: '商品管理' },
];

export default function SidebarNav() {
  const pathname = usePathname();
  const router = useRouter();
  const [role, setRole] = useState<UserRole>('viewer');

  useEffect(() => {
    setRole(getCurrentRole());
    return subscribeRoleChange(setRole);
  }, []);

  const visibleNavItems = useMemo(
    () =>
      navItems.filter((item) =>
        item.permission ? hasPermission(role, item.permission) : true,
      ),
    [role],
  );

  function isActive(href: string) {
    if (href === '/') return pathname === '/';
    return pathname.startsWith(href);
  }

  return (
    <nav className="sidebar-nav">
      {visibleNavItems.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          onClick={(event) => {
            if (item.href === '/orders' && pathname.startsWith('/orders')) {
              event.preventDefault();
              router.push(`/orders?reset=${Date.now()}`);
            }
          }}
          className={`nav-item ${isActive(item.href) ? 'active' : ''}`}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
