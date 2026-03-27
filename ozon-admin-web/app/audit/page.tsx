'use client';

import { useEffect, useMemo, useState } from 'react';
import { GuardedActionButton } from '../../components/guarded-action-button';
import { ListPageActions } from '../../components/list-page-actions';
import { NoPermissionBanner } from '../../components/no-permission-banner';
import { PageEmpty } from '../../components/page-empty';
import { PageHeader } from '../../components/page-header';
import { PageLoading } from '../../components/page-loading';
import { getCurrentRole, subscribeRoleChange } from '../../lib/auth-role';
import { hasPermission, UserRole } from '../../lib/rbac';
import { auditApi } from '../../services/audit-service';
import { fxApi } from '../../services/fx-service';

type AuditLogItem = {
  id: number;
  module: string;
  action: string;
  role: string;
  operator: string | null;
  targetType: string | null;
  targetId: string | null;
  detail: string | null;
  createdAt: string;
};

const MODULE_OPTIONS = [
  { label: '全部模块', value: '' },
  { label: '订单', value: 'orders' },
  { label: '店铺', value: 'stores' },
];

export default function AuditPage() {
  const [role, setRole] = useState<UserRole>('admin');
  const [loading, setLoading] = useState(true);
  const [logs, setLogs] = useState<AuditLogItem[]>([]);
  const [moduleFilter, setModuleFilter] = useState('');
  const [apiError, setApiError] = useState('');
  const [rubToCnyInput, setRubToCnyInput] = useState('');
  const [usdToRubInput, setUsdToRubInput] = useState('');
  const [rateSaving, setRateSaving] = useState(false);
  const [rateInfo, setRateInfo] = useState<string>('');
  const canViewAudit = hasPermission(role, 'audit.read');
  const canManageFx = hasPermission(role, 'fx.update');

  async function loadLogs() {
    if (!canViewAudit) {
      setLogs([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const data = await auditApi.getRecentLogs(30, moduleFilter || undefined);
      setLogs(data);
      setApiError('');
    } catch (error) {
      setApiError(error instanceof Error ? error.message : '获取审计日志失败');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setRole(getCurrentRole());
    return subscribeRoleChange(setRole);
  }, []);

  useEffect(() => {
    async function loadRates() {
      try {
        const rates = await fxApi.getRates();
        setRateInfo(
          `当前汇率：RUB→CNY ${rates.rubToCny.toFixed(6)}，USD→RUB ${rates.usdToRub.toFixed(
            4,
          )}（来源：${rates.source}）`,
        );
      } catch {
        setRateInfo('汇率读取失败');
      }
    }
    void loadRates();
  }, []);

  useEffect(() => {
    void loadLogs();
  }, [moduleFilter, canViewAudit]);

  const groupedCountText = useMemo(() => {
    if (logs.length === 0) return '暂无记录';
    const ordersCount = logs.filter((item) => item.module === 'orders').length;
    const storesCount = logs.filter((item) => item.module === 'stores').length;
    return `最近 ${logs.length} 条，订单 ${ordersCount} 条，店铺 ${storesCount} 条`;
  }, [logs]);

  async function saveManualRates() {
    try {
      setRateSaving(true);
      const payload: {
        rubToCny?: number;
        usdToRub?: number;
      } = {};
      if (rubToCnyInput.trim()) payload.rubToCny = Number(rubToCnyInput.trim());
      if (usdToRubInput.trim()) payload.usdToRub = Number(usdToRubInput.trim());
      const rates = await fxApi.updateManualRates(payload);
      setRateInfo(
        `当前汇率：RUB→CNY ${rates.rubToCny.toFixed(6)}，USD→RUB ${rates.usdToRub.toFixed(
          4,
        )}（来源：${rates.source}）`,
      );
    } catch (error) {
      setApiError(error instanceof Error ? error.message : '保存手动汇率失败');
    } finally {
      setRateSaving(false);
    }
  }

  async function clearManualRates() {
    try {
      setRateSaving(true);
      const rates = await fxApi.updateManualRates({
        clearRubToCny: true,
        clearUsdToRub: true,
      });
      setRubToCnyInput('');
      setUsdToRubInput('');
      setRateInfo(
        `当前汇率：RUB→CNY ${rates.rubToCny.toFixed(6)}，USD→RUB ${rates.usdToRub.toFixed(
          4,
        )}（来源：${rates.source}）`,
      );
    } catch (error) {
      setApiError(error instanceof Error ? error.message : '清空手动汇率失败');
    } finally {
      setRateSaving(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="雍金保理ozon电商管理系统 - 操作审计"
        description="记录关键操作：同步、新增、编辑、删除、导出。支持按模块查看最近日志。"
      />

      {!canViewAudit ? (
        <NoPermissionBanner permissions={['audit.read']} style={{ marginBottom: 12 }} />
      ) : null}

      {!canManageFx ? (
        <NoPermissionBanner permissions={['fx.update']} style={{ marginBottom: 12 }} />
      ) : null}

      <div className="list-card">
        <div className="table-toolbar" style={{ marginBottom: 12 }}>
          <div>
            <h2 style={{ margin: 0 }}>汇率配置</h2>
            <div className="table-subtitle">{rateInfo || '正在读取汇率...'}</div>
          </div>
          <ListPageActions>
            <input
              className="input"
              style={{ width: 140, marginTop: 0 }}
              placeholder="RUB→CNY"
              value={rubToCnyInput}
              onChange={(event) => setRubToCnyInput(event.target.value)}
              disabled={!canManageFx}
            />
            <input
              className="input"
              style={{ width: 140, marginTop: 0 }}
              placeholder="USD→RUB"
              value={usdToRubInput}
              onChange={(event) => setUsdToRubInput(event.target.value)}
              disabled={!canManageFx}
            />
            <GuardedActionButton
              role={role}
              permission="fx.update"
              className="btn btn-primary"
              disabled={rateSaving}
              onClick={() => void saveManualRates()}
            >
              保存手动汇率
            </GuardedActionButton>
            <GuardedActionButton
              role={role}
              permission="fx.update"
              className="btn btn-default"
              disabled={rateSaving}
              onClick={() => void clearManualRates()}
            >
              恢复实时汇率
            </GuardedActionButton>
          </ListPageActions>
        </div>
      </div>

      <div className="list-card">
        <div className="table-toolbar">
          <div>
            <h2 style={{ margin: 0 }}>最近操作记录</h2>
            <div className="table-subtitle">{groupedCountText}</div>
          </div>
          <ListPageActions>
            <select
              className="input"
              style={{ minWidth: 160, marginTop: 0 }}
              value={moduleFilter}
              onChange={(event) => setModuleFilter(event.target.value)}
              disabled={!canViewAudit}
            >
              {MODULE_OPTIONS.map((item) => (
                <option key={item.value || 'all'} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
            <GuardedActionButton
              role={role}
              permission="audit.read"
              className="btn btn-default"
              onClick={() => void loadLogs()}
              disabled={loading}
            >
              刷新
            </GuardedActionButton>
          </ListPageActions>
        </div>

        {!canViewAudit ? (
          <PageEmpty text="你当前是只读角色，无法查看审计日志。" />
        ) : loading ? (
          <PageLoading text="审计日志加载中..." />
        ) : apiError ? (
          <div className="alert-error">{apiError}</div>
        ) : logs.length === 0 ? (
          <PageEmpty text="暂无审计日志。" />
        ) : (
          <div className="table-wrapper" style={{ marginTop: 12 }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>时间</th>
                  <th>模块</th>
                  <th>动作</th>
                  <th>角色</th>
                  <th>目标</th>
                  <th>详情</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id}>
                    <td>{new Date(log.createdAt).toLocaleString()}</td>
                    <td>{log.module}</td>
                    <td>{log.action}</td>
                    <td>
                      <span className="status-tag status-default">{log.role}</span>
                    </td>
                    <td>{log.targetType ? `${log.targetType}#${log.targetId || '-'}` : '-'}</td>
                    <td style={{ maxWidth: 540, whiteSpace: 'pre-wrap' }}>{log.detail || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
