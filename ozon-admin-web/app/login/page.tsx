'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { setCurrentUser } from '../../lib/auth-role';
import { normalizeRole } from '../../lib/rbac';
import { accountApi } from '../../services/account-service';

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [needChangePassword, setNeedChangePassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!username.trim() || !password.trim()) {
      setErrorMessage('请输入用户名和密码');
      return;
    }

    try {
      setLoading(true);
      setErrorMessage('');
      setSuccessMessage('');
      const result = await accountApi.login(username.trim(), password.trim());
      if (result.requirePasswordChange || result.data.mustChangePassword) {
        setNeedChangePassword(true);
        setSuccessMessage('首次登录需修改密码，请先完成改密');
        return;
      }
      setCurrentUser({
        id: result.data.id,
        role: normalizeRole(result.data.role),
        username: result.data.username,
        displayName: result.data.displayName,
      });
      router.replace('/');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '登录失败');
    } finally {
      setLoading(false);
    }
  }

  async function handleChangeFirstPassword(e: React.FormEvent) {
    e.preventDefault();
    if (!newPassword.trim() || !confirmPassword.trim()) {
      setErrorMessage('请输入新密码并确认');
      return;
    }
    if (newPassword !== confirmPassword) {
      setErrorMessage('两次输入的新密码不一致');
      return;
    }

    try {
      setLoading(true);
      setErrorMessage('');
      setSuccessMessage('');
      const result = await accountApi.changeFirstPassword(
        username.trim(),
        password.trim(),
        newPassword.trim(),
      );
      setNeedChangePassword(false);
      setNewPassword('');
      setConfirmPassword('');
      setSuccessMessage(`${result.message}，请重新登录`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '改密失败');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-card">
      <h1 className="login-title">雍金保理ozon电商管理系统</h1>
      <p className="login-subtitle">{needChangePassword ? '首次改密' : '账号登录'}</p>

      {!needChangePassword ? (
        <form onSubmit={handleLogin} className="login-form">
          <div>
            <label className="filter-label">用户名</label>
            <input
              className="input"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="请输入用户名"
            />
          </div>
          <div>
            <label className="filter-label">密码</label>
            <input
              className="input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="请输入密码"
            />
          </div>

          {errorMessage ? <div className="alert-error">{errorMessage}</div> : null}
          {successMessage ? <div className="alert-success">{successMessage}</div> : null}

          <button type="submit" className="btn btn-primary login-submit" disabled={loading}>
            {loading ? '登录中...' : '登录'}
          </button>
          <button
            type="button"
            className="btn btn-default login-submit"
            onClick={() => {
              window.alert('忘记密码功能即将上线，请联系管理员重置密码。');
            }}
          >
            忘记密码
          </button>
        </form>
      ) : (
        <form onSubmit={handleChangeFirstPassword} className="login-form">
          <div className="table-subtitle">
            当前账号：{username}
          </div>
          <div>
            <label className="filter-label">新密码</label>
            <input
              className="input"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="至少8位，含大小写字母、数字、特殊字符"
            />
          </div>
          <div>
            <label className="filter-label">确认新密码</label>
            <input
              className="input"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="请再次输入新密码"
            />
          </div>

          {errorMessage ? <div className="alert-error">{errorMessage}</div> : null}
          {successMessage ? <div className="alert-success">{successMessage}</div> : null}

          <button type="submit" className="btn btn-primary login-submit" disabled={loading}>
            {loading ? '提交中...' : '完成改密'}
          </button>
        </form>
      )}

      <div className="table-subtitle" style={{ marginTop: 14 }}>
        默认管理员账号：admin / admin123（首次登录需改密）
      </div>
    </div>
  );
}
