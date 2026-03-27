# 云迁移检查清单

## 1. 生产环境变量（必须）
- 后端使用 `ozon-admin-api/.env.production.example` 生成生产环境变量。
- 前端使用 `ozon-admin-web/.env.production.example` 生成生产环境变量。
- `DATABASE_URL`、`ORDER_WEBHOOK_SECRET`、Ozon 密钥必须由云平台 Secret/Env 注入，不落盘明文。
- `CORS_ORIGINS` 使用真实前端域名，`NEXT_PUBLIC_API_BASE_URL` 使用真实 API 域名。

## 2. 数据库迁移（必须）
- 生产部署使用 migration，不再使用 `db push`：
  - `npm run prisma:migrate:status`
  - `npm run prisma:migrate:deploy`
- API 生产启动脚本使用：
  - `npm run start:prod:migrated`（`generate + migrate deploy + start`）
- 若目标数据库已存在表结构（非空库），先标记基线再部署：
  - `npx prisma migrate resolve --applied 20260326060000_postgres_baseline`
  - 然后执行 `npm run prisma:migrate:deploy`

## 3. 备份与恢复演练（必须）
- 备份：
  - `.\scripts\ops-db-backup.ps1`
- 恢复（演练库）：
  - `.\scripts\ops-db-restore.ps1 -BackupFile <dump文件路径> -DropRecreate`
- 建议每次发布前做一次“备份 -> 恢复 -> 核验”闭环。

## 4. 云上线前快速体检
- 一键发布闸门（推荐）：
  - `.\scripts\ops-release-gate.ps1`
- 一键预检（环境键 + migration 状态）：
  - `.\scripts\ops-cloud-preflight.ps1`
- 健康检查：
  - `GET /health`
  - `GET /health/ready`

## 5. 运行与回滚准备
- 保留最近可回滚镜像标签。
- 保留最近一次可用数据库备份（含 SHA256 校验）。
- 监控同步失败率与 `/health/ready` 告警。

## 本地启动脚本（开发）
- `.\start-dev.bat`
- `.\stop-dev.bat`
- `.\scripts\dev-up.ps1`
- `.\scripts\dev-down.ps1`
