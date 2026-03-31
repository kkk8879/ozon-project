# 云迁移检查清单（上线前必做）

## 1. 环境变量与密钥
- 后端使用 `ozon-admin-api/.env.production.example` 生成生产配置。
- 前端使用 `ozon-admin-web/.env.production.example` 生成生产配置。
- 以下项必须通过密钥管理或环境注入，禁止提交到仓库：
  - `DATABASE_URL`
  - `ORDER_WEBHOOK_SECRET`
  - Ozon API 密钥
- `CORS_ORIGINS` 必须是线上前端域名。
- `NEXT_PUBLIC_API_BASE_URL` 必须是线上 API 域名。

## 2. 数据库迁移策略
- 生产环境只用 migration，不使用 `db push`。
- 发布前执行：
  - `npm run prisma:migrate:status`
  - `npm run prisma:migrate:deploy`
- API 生产启动建议：
  - `npm run start:prod:migrated`
- 非空数据库先 baseline：
  - `npx prisma migrate resolve --applied 20260326060000_postgres_baseline`
  - 再执行 `npm run prisma:migrate:deploy`

## 3. 备份与恢复演练
- 备份：`.\scripts\ops-db-backup.ps1`
- 恢复（演练库）：`.\scripts\ops-db-restore.ps1 -BackupFile <dump文件> -DropRecreate`
- 发布前至少完成一次“备份 -> 恢复 -> 校验”。

## 4. 上线前健康预检
- 发布闸门：`.\scripts\ops-release-gate.ps1`
- 云端预检：`.\scripts\ops-cloud-preflight.ps1`
- 健康检查接口：
  - `GET /health`
  - `GET /health/ready`

## 5. 网络与安全最小原则
- 对公网仅开放：`22/80/443`
- 不开放：`3000/3001/5432`

## 6. 回滚准备
- 保留最近稳定镜像标签。
- 保留最近可用数据库备份（含校验）。
- 保留可直接执行的回滚命令。

## 7. 发布后验收
- 登录、列表、详情、同步、导出全链路验证。
- 检查“最近同步记录”是否正常写入。
- 检查自动同步任务是否按预期运行。
- 检查角色权限是否按账户生效。
