'use client';

import { useEffect, useMemo, useState } from 'react';
import { GuardedActionButton } from '../../components/guarded-action-button';
import { NoPermissionBanner } from '../../components/no-permission-banner';
import { PageEmpty } from '../../components/page-empty';
import { PageHeader } from '../../components/page-header';
import { PageLoading } from '../../components/page-loading';
import { getPermissionDeniedMessage } from '../../lib/permission-messages';
import {
  getCurrentRole,
  getCurrentUserId,
  getCurrentUsername,
  subscribeRoleChange,
} from '../../lib/auth-role';
import { hasPermission, UserRole } from '../../lib/rbac';
import {
  getTotalPages,
  normalizeCurrentPage,
  paginateItems,
} from '../../lib/pagination-utils';
import { accountApi } from '../../services/account-service';
import { AccountItem } from '../../types/account';

const PAGE_SIZE = 10;

type RoleFilter = 'all' | UserRole;
type StatusFilter = 'all' | 'active' | 'inactive';

function getPasswordStrengthText(password: string) {
  const value = password.trim();
  let score = 0;
  if (value.length >= 8) score += 1;
  if (/[A-Z]/.test(value) && /[a-z]/.test(value)) score += 1;
  if (/\d/.test(value)) score += 1;
  if (/[^\w\s]/.test(value)) score += 1;

  if (value.length === 0) return { score: 0, text: '请输入密码' };
  if (score <= 1) return { score, text: '强度：弱' };
  if (score <= 2) return { score, text: '强度：中' };
  if (score <= 3) return { score, text: '强度：良好' };
  return { score, text: '强度：强' };
}

function generateStrongPassword(length = 14) {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghijkmnpqrstuvwxyz';
  const digits = '23456789';
  const symbols = '!@#$%^&*_-+=';
  const all = `${upper}${lower}${digits}${symbols}`;

  const required = [
    upper[Math.floor(Math.random() * upper.length)],
    lower[Math.floor(Math.random() * lower.length)],
    digits[Math.floor(Math.random() * digits.length)],
    symbols[Math.floor(Math.random() * symbols.length)],
  ];

  while (required.length < length) {
    required.push(all[Math.floor(Math.random() * all.length)]);
  }

  for (let i = required.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [required[i], required[j]] = [required[j], required[i]];
  }

  return required.join('');
}

export default function AccountsPage() {
  const [role, setRole] = useState<UserRole>('viewer');
  const [currentUserId, setCurrentUserId] = useState<number | null>(null);
  const [currentUsername, setCurrentUsername] = useState('');
  const [accounts, setAccounts] = useState<AccountItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [newRole, setNewRole] = useState<UserRole>('operator');
  const [isActive, setIsActive] = useState(true);
  const [keyword, setKeyword] = useState('');
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [jumpPageInput, setJumpPageInput] = useState('1');

  const canRead = hasPermission(role, 'users.read');
  const canUpdate = hasPermission(role, 'users.update');
  const canUnlock = hasPermission(role, 'users.unlock');
  const passwordStrength = useMemo(() => getPasswordStrengthText(password), [password]);

  const clearMessages = () => {
    setErrorMessage('');
    setSuccessMessage('');
  };

  useEffect(() => {
    const refresh = () => {
      setRole(getCurrentRole());
      setCurrentUserId(getCurrentUserId());
      setCurrentUsername(getCurrentUsername());
    };
    refresh();
    return subscribeRoleChange(refresh);
  }, []);

  async function loadAccounts() {
    if (!canRead) {
      setAccounts([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const data = await accountApi.getAccounts();
      setAccounts(data);
      setErrorMessage('');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '获取账号列表失败');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadAccounts();
  }, [canRead]);

  useEffect(() => {
    setCurrentPage(1);
  }, [keyword, roleFilter, statusFilter]);

  const filteredAccounts = useMemo(() => {
    return accounts.filter((item) => {
      const lowerKeyword = keyword.trim().toLowerCase();
      const matchKeyword =
        !lowerKeyword ||
        item.username.toLowerCase().includes(lowerKeyword) ||
        item.displayName.toLowerCase().includes(lowerKeyword);

      const matchRole = roleFilter === 'all' || item.role === roleFilter;
      const matchStatus =
        statusFilter === 'all' ||
        (statusFilter === 'active' ? item.isActive : !item.isActive);

      return matchKeyword && matchRole && matchStatus;
    });
  }, [accounts, keyword, roleFilter, statusFilter]);

  const totalPages = useMemo(
    () => getTotalPages(filteredAccounts.length, PAGE_SIZE),
    [filteredAccounts.length],
  );

  const pagedAccounts = useMemo(
    () => paginateItems(filteredAccounts, currentPage, PAGE_SIZE),
    [filteredAccounts, currentPage],
  );

  useEffect(() => {
    const normalizedPage = normalizeCurrentPage(currentPage, totalPages);
    if (normalizedPage !== currentPage) {
      setCurrentPage(normalizedPage);
    }
  }, [currentPage, totalPages]);

  useEffect(() => {
    setJumpPageInput(String(currentPage));
  }, [currentPage]);

  async function handleCreate() {
    clearMessages();
    if (!username.trim() || !password.trim()) {
      setErrorMessage('用户名和密码不能为空');
      return;
    }

    try {
      setSaving(true);
      const result = await accountApi.createAccount({
        username: username.trim(),
        password: password.trim(),
        role: newRole,
        displayName: displayName.trim() || undefined,
        isActive,
      });
      setSuccessMessage(result.message);
      setUsername('');
      setPassword('');
      setDisplayName('');
      setNewRole('operator');
      setIsActive(true);
      await loadAccounts();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '新增账号失败');
    } finally {
      setSaving(false);
    }
  }

  async function toggleAccountActive(item: AccountItem) {
    clearMessages();
    if (currentUserId !== null && item.id === currentUserId) {
      setErrorMessage('不能停用当前登录账号');
      return;
    }

    try {
      setSaving(true);
      const result = await accountApi.updateAccount(item.id, {
        isActive: !item.isActive,
      });
      setSuccessMessage(result.message);
      await loadAccounts();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '更新账号状态失败');
    } finally {
      setSaving(false);
    }
  }

  async function changeAccountRole(item: AccountItem, next: UserRole) {
    clearMessages();
    if (!canUpdate) {
      setErrorMessage(getPermissionDeniedMessage('users.update'));
      return;
    }

    try {
      setSaving(true);
      const result = await accountApi.updateAccount(item.id, {
        role: next,
      });
      setSuccessMessage(result.message);
      await loadAccounts();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '更新账号角色失败');
    } finally {
      setSaving(false);
    }
  }

  async function editDisplayName(item: AccountItem) {
    clearMessages();
    if (!canUpdate) {
      setErrorMessage(getPermissionDeniedMessage('users.update'));
      return;
    }

    const next = window.prompt(`请输入 ${item.username} 的显示名称`, item.displayName);
    if (next === null) return;
    const trimmed = next.trim();
    if (!trimmed) {
      setErrorMessage('显示名称不能为空');
      return;
    }

    try {
      setSaving(true);
      const result = await accountApi.updateAccount(item.id, {
        displayName: trimmed,
      });
      setSuccessMessage(result.message);
      await loadAccounts();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '更新显示名称失败');
    } finally {
      setSaving(false);
    }
  }

  async function resetPassword(item: AccountItem) {
    clearMessages();
    const nextPassword = window.prompt(
      `请输入 ${item.username} 的新密码（至少8位，含大小写字母、数字、特殊字符）`,
    );
    if (!nextPassword) return;

    try {
      setSaving(true);
      const result = await accountApi.resetPassword(item.id, nextPassword);
      setSuccessMessage(result.message);
      await loadAccounts();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '重置密码失败');
    } finally {
      setSaving(false);
    }
  }

  async function deleteAccount(item: AccountItem) {
    clearMessages();
    if (currentUserId !== null && item.id === currentUserId) {
      setErrorMessage('不能删除当前登录账号');
      return;
    }

    const confirmed = window.confirm(`确认删除账号 ${item.username} 吗？`);
    if (!confirmed) return;

    try {
      setSaving(true);
      const result = await accountApi.deleteAccount(item.id);
      setSuccessMessage(result.message);
      await loadAccounts();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '删除账号失败');
    } finally {
      setSaving(false);
    }
  }

  async function unlockAccount(item: AccountItem) {
    clearMessages();
    if (!canUnlock) {
      setErrorMessage(getPermissionDeniedMessage('users.unlock'));
      return;
    }

    try {
      setSaving(true);
      const result = await accountApi.unlockAccount(item.id);
      setSuccessMessage(result.message);
      await loadAccounts();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '解锁账号失败');
    } finally {
      setSaving(false);
    }
  }

  function jumpToPage() {
    const parsed = Number.parseInt(jumpPageInput, 10);
    if (Number.isNaN(parsed)) {
      setJumpPageInput(String(currentPage));
      return;
    }
    const nextPage = Math.min(Math.max(parsed, 1), totalPages);
    setCurrentPage(nextPage);
  }

  return (
    <div>
      <PageHeader
        title="雍金保理ozon电商管理系统 - 账号管理"
        description="支持账号新增、启停、角色分配、显示名维护、密码重置与解锁。"
      />

      {!canRead ? (
        <NoPermissionBanner permissions={['users.read']} style={{ marginBottom: 12 }} />
      ) : null}

      {(errorMessage || successMessage) && (
        <div
          className={errorMessage ? 'alert-error' : 'alert-success'}
          style={{ marginBottom: 12 }}
        >
          {errorMessage || successMessage}
        </div>
      )}

      <div className="form-card">
        <h2 style={{ marginTop: 0 }}>新增账号</h2>
        <div className="order-advanced-filters">
          <div className="order-filter-item">
            <label className="filter-label">用户名</label>
            <input
              className="input"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="例如 operator01"
            />
          </div>

          <div className="order-filter-item">
            <label className="filter-label">密码</label>
            <input
              className="input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="至少8位，包含大小写字母、数字、特殊字符"
            />
            <div className="table-subtitle" style={{ marginTop: 6 }}>
              {passwordStrength.text}
            </div>
            <button
              type="button"
              className="btn btn-default btn-sm"
              style={{ marginTop: 6 }}
              onClick={() => setPassword(generateStrongPassword())}
            >
              生成强密码
            </button>
          </div>

          <div className="order-filter-item">
            <label className="filter-label">显示名称</label>
            <input
              className="input"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="例如 张三"
            />
          </div>

          <div className="order-filter-item">
            <label className="filter-label">角色</label>
            <select
              className="input"
              value={newRole}
              onChange={(e) => setNewRole(e.target.value as UserRole)}
            >
              <option value="admin">管理员</option>
              <option value="operator">运营</option>
              <option value="viewer">只读</option>
            </select>
          </div>

          <div className="order-filter-item">
            <label className="filter-label">状态</label>
            <select
              className="input"
              value={isActive ? '1' : '0'}
              onChange={(e) => setIsActive(e.target.value === '1')}
            >
              <option value="1">启用</option>
              <option value="0">停用</option>
            </select>
          </div>

          <div className="order-filter-actions">
            <GuardedActionButton
              role={role}
              permission="users.create"
              className="btn btn-primary"
              disabled={saving}
              onClick={handleCreate}
            >
              新增账号
            </GuardedActionButton>
          </div>
        </div>
      </div>

      <div className="list-card">
        <div className="table-toolbar">
          <div>
            <h2 style={{ margin: 0 }}>账号列表</h2>
            <div className="table-subtitle">
              当前筛选 {filteredAccounts.length} 条 | 当前登录：{currentUsername || '-'}
            </div>
          </div>

          <button
            type="button"
            className="btn btn-default btn-sm"
            onClick={() => void loadAccounts()}
            disabled={loading || saving}
          >
            刷新
          </button>
        </div>

        <div className="order-advanced-filters" style={{ marginBottom: 12 }}>
          <div className="order-filter-item">
            <label className="filter-label">关键字</label>
            <input
              className="input"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="用户名或显示名称"
            />
          </div>

          <div className="order-filter-item">
            <label className="filter-label">角色筛选</label>
            <select
              className="input"
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value as RoleFilter)}
            >
              <option value="all">全部角色</option>
              <option value="admin">管理员</option>
              <option value="operator">运营</option>
              <option value="viewer">只读</option>
            </select>
          </div>

          <div className="order-filter-item">
            <label className="filter-label">状态筛选</label>
            <select
              className="input"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            >
              <option value="all">全部状态</option>
              <option value="active">启用</option>
              <option value="inactive">停用</option>
            </select>
          </div>
        </div>

        {loading ? (
          <PageLoading text="账号列表加载中..." />
        ) : filteredAccounts.length === 0 ? (
          <PageEmpty text="当前没有符合筛选条件的账号数据。" />
        ) : (
          <>
            <div className="table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>用户名</th>
                    <th>显示名称</th>
                    <th>角色</th>
                    <th>状态</th>
                    <th>首次改密</th>
                    <th>失败次数</th>
                    <th>锁定到</th>
                    <th>最近登录</th>
                    <th>创建时间</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedAccounts.map((item) => {
                    const isSelf = currentUserId !== null && item.id === currentUserId;
                    const canUnlockByData =
                      item.failedLoginCount > 0 || Boolean(item.lockedUntil);
                    return (
                      <tr key={item.id}>
                        <td>{item.id}</td>
                        <td>{item.username}</td>
                        <td>{item.displayName}</td>
                        <td>
                          <select
                            className="input"
                            style={{ marginTop: 0, minWidth: 120 }}
                            value={item.role}
                            onChange={(e) =>
                              void changeAccountRole(item, e.target.value as UserRole)
                            }
                            disabled={!canUpdate || saving || isSelf}
                            title={isSelf ? '当前账号角色不建议在此修改' : undefined}
                          >
                            <option value="admin">管理员</option>
                            <option value="operator">运营</option>
                            <option value="viewer">只读</option>
                          </select>
                        </td>
                        <td>
                          <span
                            className={`status-tag ${
                              item.isActive ? 'status-active' : 'status-inactive'
                            }`}
                          >
                            {item.isActive ? '启用' : '停用'}
                          </span>
                        </td>
                        <td>{item.mustChangePassword ? '是' : '否'}</td>
                        <td>{item.failedLoginCount}</td>
                        <td>
                          {item.lockedUntil
                            ? new Date(item.lockedUntil).toLocaleString()
                            : '-'}
                        </td>
                        <td>
                          {item.lastLoginAt
                            ? new Date(item.lastLoginAt).toLocaleString()
                            : '-'}
                        </td>
                        <td>{new Date(item.createdAt).toLocaleString()}</td>
                        <td>
                          <div className="table-actions">
                            <GuardedActionButton
                              role={role}
                              permission="users.update"
                              className="table-btn table-btn-edit"
                              disabled={saving || isSelf}
                              onClick={() => void toggleAccountActive(item)}
                              deniedText={isSelf ? '不能停用当前登录账号' : undefined}
                            >
                              {item.isActive ? '停用' : '启用'}
                            </GuardedActionButton>

                            <GuardedActionButton
                              role={role}
                              permission="users.update"
                              className="table-btn table-btn-detail"
                              disabled={saving}
                              onClick={() => void editDisplayName(item)}
                            >
                              显示名
                            </GuardedActionButton>

                            <GuardedActionButton
                              role={role}
                              permission="users.reset_password"
                              className="table-btn table-btn-detail"
                              disabled={saving}
                              onClick={() => void resetPassword(item)}
                            >
                              重置密码
                            </GuardedActionButton>

                            <GuardedActionButton
                              role={role}
                              permission="users.unlock"
                              className="table-btn table-btn-detail"
                              disabled={saving || !canUnlockByData}
                              onClick={() => void unlockAccount(item)}
                              deniedText={!canUnlockByData ? '当前账号未锁定' : undefined}
                            >
                              解锁
                            </GuardedActionButton>

                            <GuardedActionButton
                              role={role}
                              permission="users.delete"
                              className="table-btn table-btn-delete"
                              disabled={saving || isSelf}
                              onClick={() => void deleteAccount(item)}
                              deniedText={isSelf ? '不能删除当前登录账号' : undefined}
                            >
                              删除
                            </GuardedActionButton>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="pagination-bar">
              <div className="pagination-info">
                第 {currentPage} / {totalPages} 页，共 {filteredAccounts.length} 条
              </div>

              <div className="pagination-actions">
                <input
                  type="number"
                  min={1}
                  max={totalPages}
                  value={jumpPageInput}
                  onChange={(e) => setJumpPageInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      jumpToPage();
                    }
                  }}
                  className="input"
                  style={{ width: 96, marginTop: 0 }}
                  aria-label="跳转页码"
                />
                <button type="button" className="btn btn-default" onClick={jumpToPage}>
                  跳转
                </button>
                <button
                  type="button"
                  className="btn btn-default"
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                >
                  上一页
                </button>
                <button
                  type="button"
                  className="btn btn-default"
                  disabled={currentPage === totalPages}
                  onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                >
                  下一页
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
