# 云服务器最小化上线步骤（命令版）

> 目标：在一台 Linux 云服务器上，用 Docker Compose 跑起 `postgres + api + web`。  
> 适用：当前项目结构（`docker-compose.yml` + `ozon-admin-api` + `ozon-admin-web`）。

## 1. 服务器准备（仅首次）

```bash
sudo apt update
sudo apt install -y ca-certificates curl git
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo usermod -aG docker $USER
```

重新登录一次 SSH，让 `docker` 组生效。

## 2. 拉代码并进入目录

```bash
cd /opt
sudo mkdir -p ozon-project
sudo chown -R $USER:$USER /opt/ozon-project
git clone <你的仓库地址> /opt/ozon-project
cd /opt/ozon-project
```

## 3. 配置环境变量（必须）

先复制模板：

```bash
cp .env.compose.example .env
cp ozon-admin-api/.env.production.example ozon-admin-api/.env
```

编辑根目录 `.env`（给 compose 用）：

```env
POSTGRES_DB=ozon_admin
POSTGRES_USER=postgres
POSTGRES_PASSWORD=<强密码>
POSTGRES_PORT=5432

DATABASE_URL=postgresql://postgres:<强密码>@postgres:5432/ozon_admin?schema=public

API_PORT=3001
WEB_PORT=3000
NEXT_PUBLIC_API_BASE_URL=https://api.<你的域名>
```

编辑 `ozon-admin-api/.env`（给 API 用）：

- `DATABASE_URL`（建议与上面一致，主机名用 `postgres`）
- `ORDER_WEBHOOK_SECRET`
- `CORS_ORIGINS`（填前端真实域名）
- Ozon 相关密钥（如你启用真实同步）

## 4. 启动服务

```bash
docker compose up -d --build
docker compose ps
```

查看日志：

```bash
docker compose logs -f api
docker compose logs -f web
```

## 5. 健康检查

```bash
curl -sS http://127.0.0.1:3001/health
curl -sS http://127.0.0.1:3001/health/ready
curl -I http://127.0.0.1:3000
```

## 6. 发布前闸门（建议）

在本地或运维机器执行（你已具备）：

```powershell
.\scripts\ops-release-gate.ps1
```

要求看到 `Release gate PASSED` 再上线。

## 7. 升级发布

```bash
cd /opt/ozon-project
git pull
docker compose up -d --build
docker image prune -f
```

## 8. 快速回滚（最小）

如果新版本异常：

1. 回到上一个 Git tag/commit
2. 重新构建启动

```bash
git checkout <上一个稳定tag或commit>
docker compose up -d --build
```

数据库回滚使用你已验证过的 dump：
- 备份：`scripts/ops-db-backup.ps1`
- 恢复：`scripts/ops-db-restore.ps1`
