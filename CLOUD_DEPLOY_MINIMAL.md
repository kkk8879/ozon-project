# 云端最小部署手册（命令版）

目标：在一台 Linux 服务器上，以最小步骤运行 `postgres + api + web`。

## 1. 首次准备

```bash
sudo apt update
sudo apt install -y ca-certificates curl git
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
$(. /etc/os-release && echo "$VERSION_CODENAME") stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo usermod -aG docker $USER
```

重新登录 SSH，使 `docker` 组生效。

## 2. 拉代码

```bash
sudo mkdir -p /opt/ozon-project
sudo chown -R $USER:$USER /opt/ozon-project
git clone <你的仓库地址> /opt/ozon-project
cd /opt/ozon-project
```

## 3. 配置环境变量

```bash
cp .env.compose.example .env
cp ozon-admin-api/.env.production.example ozon-admin-api/.env
```

根目录 `.env` 最少需要：

```env
POSTGRES_DB=ozon_admin
POSTGRES_USER=postgres
POSTGRES_PASSWORD=<强密码>
POSTGRES_PORT=5432

API_PORT=3001
WEB_PORT=3000
DATABASE_URL=postgresql://postgres:<强密码>@postgres:5432/ozon_admin?schema=public
NEXT_PUBLIC_API_BASE_URL=https://api.<你的域名>
```

`ozon-admin-api/.env` 至少需要：
- `DATABASE_URL`
- `CORS_ORIGINS=https://admin.<你的域名>`
- `ORDER_WEBHOOK_SECRET=<随机强字符串>`
- Ozon 实时同步相关参数（如启用）

## 4. 启动（标准）

```bash
docker compose up -d --build
docker compose ps
```

## 5. 健康检查

```bash
curl -sS http://127.0.0.1:3001/health
curl -sS http://127.0.0.1:3001/health/ready
curl -I http://127.0.0.1:3000
```

## 6. 低配机器最小稳定恢复（不重构建）

适用于 1C1G/1C2G 机器卡在构建的情况。

优先使用脚本：

```bash
cd /opt/ozon-project
bash scripts/ops-cloud-recover.sh
```

常用参数：

```bash
# 只恢复 postgres + api
bash scripts/ops-cloud-recover.sh --skip-web

# 不拉代码，直接恢复
bash scripts/ops-cloud-recover.sh --no-pull
```

手动命令（备用）：

```bash
cd /opt/ozon-project
git pull --ff-only
docker compose stop
docker compose up -d --no-build
docker compose ps
docker compose logs --tail=80 api
docker compose logs --tail=80 web
```

## 7. 升级发布

```bash
cd /opt/ozon-project
git pull --ff-only
docker compose up -d --build
docker image prune -f
```

## 8. 快速回滚

```bash
cd /opt/ozon-project
git checkout <稳定tag或commit>
docker compose up -d --build
```

数据库恢复使用：
- `scripts/ops-db-backup.ps1`
- `scripts/ops-db-restore.ps1`
