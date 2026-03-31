# OCI（甲骨文云）快速部署手册

适用于当前项目：
- `docker-compose.yml`
- `ozon-admin-api`
- `ozon-admin-web`

示例域名：
- 前端：`admin.xuzhiqingvip.top`
- API：`api.xuzhiqingvip.top`

## 1. 先放行端口（OCI 控制台）

在 NSG 或 Security List 仅放行：
- 22（SSH）
- 80（HTTP）
- 443（HTTPS）

不要对公网放行：
- 3000（web）
- 3001（api）
- 5432（postgres）

## 2. 服务器初始化

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

重新登录 SSH。

## 3. 拉代码并配置

```bash
sudo mkdir -p /opt/ozon-project
sudo chown -R $USER:$USER /opt/ozon-project
git clone <你的仓库地址> /opt/ozon-project
cd /opt/ozon-project

cp .env.compose.example .env
cp ozon-admin-api/.env.production.example ozon-admin-api/.env
```

编辑根目录 `.env`：

```env
POSTGRES_DB=ozon_admin
POSTGRES_USER=postgres
POSTGRES_PASSWORD=<强密码>
POSTGRES_PORT=5432
API_PORT=3001
WEB_PORT=3000
DATABASE_URL=postgresql://postgres:<强密码>@postgres:5432/ozon_admin?schema=public
NEXT_PUBLIC_API_BASE_URL=https://api.xuzhiqingvip.top
```

编辑 `ozon-admin-api/.env`：
- `DATABASE_URL=postgresql://postgres:<强密码>@postgres:5432/ozon_admin?schema=public`
- `CORS_ORIGINS=https://admin.xuzhiqingvip.top`
- `ORDER_WEBHOOK_SECRET=<随机强字符串>`
- Ozon 同步参数（按需）

## 4. 启动服务

```bash
docker compose up -d --build
docker compose ps
```

## 5. 低配机推荐恢复方式（不重建）

```bash
bash scripts/ops-cloud-recover.sh
```

仅恢复 api + postgres：

```bash
bash scripts/ops-cloud-recover.sh --skip-web
```

## 6. 健康检查

```bash
curl -I http://127.0.0.1:3000
curl -sS http://127.0.0.1:3001/health
curl -sS http://127.0.0.1:3001/health/ready
```

## 7. 反向代理（容器方式）

使用仓库配置：`deploy/oci/nginx-ozon-admin.conf`

```bash
docker rm -f ozon-proxy 2>/dev/null || true
docker run -d --name ozon-proxy \
  --restart unless-stopped \
  --network ozon-project_default \
  -p 80:80 \
  -v /opt/ozon-project/deploy/oci/nginx-ozon-admin.conf:/etc/nginx/conf.d/default.conf:ro \
  nginx:alpine
```

## 8. HTTPS

可接 Cloudflare 或使用 certbot（如宿主机装 nginx）。

## 9. 发布与回滚

发布：

```bash
cd /opt/ozon-project
git pull --ff-only
docker compose up -d --build
```

回滚：

```bash
cd /opt/ozon-project
git checkout <稳定tag或commit>
docker compose up -d --build
```
