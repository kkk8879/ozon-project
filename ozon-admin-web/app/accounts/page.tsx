'use client';

import { useEffect, useMemo, useState } from 'react';
import { GuardedActionButton } from '../../components/guarded-action-button';
import { NoPermissionBanner } from '../../components/no-permission-banner';
import { PageEmpty } from '../../components/page-empty';
import { PageHeader } from '../../components/page-header';
import { PageLoading } from '../../components/page-loading';
import {
  getCurrentRole,
  getCurrentUserId,
  getCurrentUsername,
  subscribeRoleChange,
} from '../../lib/auth-role';
import { hasPermission, UserRole } from '../../lib/rbac';
import { accountApi } from '../../services/account-service';
import { AccountItem } from '../../types/account';

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

  const canRead = hasPermission(role, 'users.read');

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

  async function handleCreate() {
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

  async function resetPassword(item: AccountItem) {
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

  const totalText = useMemo(() => `共 ${accounts.length} 个账号`, [accounts.length]);

  return (
    <div>
      <PageHeader
        title="雍金保理ozon电商管理系统 - 账号管理"
        description="支持账号新增、启停、角色分配、密码重置与删除。"
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
              placeholder="至少8位，含大小写字母、数字、特殊字符"
            />
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
              {totalText} | 当前登录：{currentUsername || '-'}
            </div>
          </div>
        </div>

        {loading ? (
          <PageLoading text="账号列表加载中..." />
        ) : accounts.length === 0 ? (
          <PageEmpty text="暂无账号数据。" />
        ) : (
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
                {accounts.map((item) => {
                  const isSelf = currentUserId !== null && item.id === currentUserId;
                  const canUnlock =
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
                            changeAccountRole(item, e.target.value as UserRole)
                          }
                          disabled={!hasPermission(role, 'users.update') || saving || isSelf}
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
                            onClick={() => toggleAccountActive(item)}
                            deniedText={isSelf ? '不能停用当前登录账号' : undefined}
                          >
                            {item.isActive ? '停用' : '启用'}
                          </GuardedActionButton>

                          <GuardedActionButton
                            role={role}
                            permission="users.reset_password"
                            className="table-btn table-btn-detail"
                            disabled={saving}
                            onClick={() => resetPassword(item)}
                          >
                            重置密码
                          </GuardedActionButton>

                          <GuardedActionButton
                            role={role}
                            permission="users.update"
                            className="table-btn table-btn-detail"
                            disabled={saving || !canUnlock}
                            onClick={() => unlockAccount(item)}
                            deniedText={!canUnlock ? '当前账号未锁定' : undefined}
                          >
                            解锁
                          </GuardedActionButton>

                          <GuardedActionButton
                            role={role}
                            permission="users.delete"
                            className="table-btn table-btn-delete"
                            disabled={saving || isSelf}
                            onClick={() => deleteAccount(item)}
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
        )}
      </div>
    </div>
  );
}
