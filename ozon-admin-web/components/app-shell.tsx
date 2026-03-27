'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ReactNode, useEffect, useMemo, useState } from 'react';
import { getCurrentRole, isAuthenticated, subscribeRoleChange } from '../lib/auth-role';
import { hasPermission, PermissionCode, UserRole } from '../lib/rbac';
import SidebarNav from './sidebar-nav';
import TopbarRoleSwitcher from './topbar-role-switcher';

type AppShellProps = {
  children: ReactNode;
};

function getRequiredPermission(pathname: string): PermissionCode | null {
  if (pathname.startsWith('/stores')) return 'stores.read';
  if (pathname.startsWith('/orders')) return 'orders.read';
  if (pathname.startsWith('/audit')) return 'audit.read';
  if (pathname.startsWith('/accounts')) return 'users.read';
  if (pathname === '/') return 'dashboard.read';
  return null;
}

export function AppShell({ children }: AppShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [authed, setAuthed] = useState(false);
  const [role, setRole] = useState<UserRole>('viewer');

  useEffect(() => {
    const refresh = () => {
      setAuthed(isAuthenticated());
      setRole(getCurrentRole());
      setReady(true);
    };
    refresh();
    return subscribeRoleChange(() => {
      refresh();
    });
  }, []);

  const requiredPermission = useMemo(
    () => getRequiredPermission(pathname),
    [pathname],
  );

  useEffect(() => {
    if (!ready) return;
    const onLogin = pathname === '/login';
    if (!authed && !onLogin) {
      router.replace('/login');
      return;
    }
    if (authed && onLogin) {
      router.replace('/');
      return;
    }
    if (
      authed &&
      requiredPermission &&
      !hasPermission(role, requiredPermission)
    ) {
      router.replace('/');
    }
  }, [authed, pathname, ready, requiredPermission, role, router]);

  if (!ready) return null;

  if (pathname === '/login') {
    return <main className="login-page-wrap">{children}</main>;
  }

  if (!authed) return null;

  return (
    <div className="admin-layout">
      <aside className="sidebar">
        <Link href="/" className="sidebar-brand-link" aria-label="返回首页">
          <div className="sidebar-brand">
            <Image
              src="/company-logo.png"
              alt="雍金保理ozon电商管理系统 logo"
              width={220}
              height={120}
              sizes="220px"
              className="sidebar-logo-image"
              priority
            />
            <div className="sidebar-logo">雍金保理ozon电商管理系统</div>
          </div>
        </Link>
        <SidebarNav />
      </aside>

      <div className="main-area">
        <header className="topbar">
          <div className="topbar-title">雍金保理ozon电商管理系统</div>
          <div className="topbar-user">
            <TopbarRoleSwitcher />
          </div>
        </header>

        <main className="page-content">{children}</main>
      </div>
    </div>
  );
}

