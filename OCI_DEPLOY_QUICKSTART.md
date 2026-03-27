# OCI（甲骨文云）快速部署手册

> 适用当前项目：`docker-compose.yml + ozon-admin-api + ozon-admin-web`  
> 系统：Ubuntu 22.04/24.04

## 0. 先决条件

- 已有 OCI 实例（建议 A1 Flex）
- 已绑定公网 IP
- 已有域名（本项目使用：`admin.xuzhiqingvip.top`、`api.xuzhiqingvip.top`）
- 本地项目已通过发布闸门：`.\scripts\ops-release-gate.ps1`

## 1. OCI 控制台网络放行（重要）

在 OCI 的 NSG 或 Security List 里只放行：

- 入站 `22`（SSH）
- 入站 `80`（HTTP，签证书用）
- 入站 `443`（HTTPS）

不要对公网放行：

- `3000`（Web 内部端口）
- `3001`（API 内部端口）
- `5432`（PostgreSQL）

## 2. 服务器初始化

```bash
sudo apt update
sudo apt install -y ca-certificates curl git nginx

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

重新登录 SSH 一次。

## 3. 拉代码并配置环境

```bash
sudo mkdir -p /opt/ozon-project
sudo chown -R $USER:$USER /opt/ozon-project
git clone <你的仓库地址> /opt/ozon-project
cd /opt/ozon-project
```

复制配置模板：

```bash
cp .env.compose.example .env
cp ozon-admin-api/.env.production.example ozon-admin-api/.env
```

编辑根目录 `.env`（compose 使用）：

```env
POSTGRES_DB=ozon_admin
POSTGRES_USER=postgres
POSTGRES_PASSWORD=<强密码>
POSTGRES_PORT=5432

DATABASE_URL=postgresql://postgres:<强密码>@postgres:5432/ozon_admin?schema=public

API_PORT=3001
WEB_PORT=3000
NEXT_PUBLIC_API_BASE_URL=https://api.xuzhiqingvip.top
```

编辑 `ozon-admin-api/.env`（API 使用）：

- `DATABASE_URL=postgresql://postgres:<强密码>@postgres:5432/ozon_admin?schema=public`
- `ORDER_WEBHOOK_SECRET=<强随机串>`
- `CORS_ORIGINS=https://admin.xuzhiqingvip.top`
- 真实 Ozon 参数（如果要启用真实同步）

## 4. 启动 Docker 服务

```bash
cd /opt/ozon-project
docker compose up -d --build
docker compose ps
```

本机健康检查：

```bash
curl -sS http://127.0.0.1:3001/health
curl -sS http://127.0.0.1:3001/health/ready
curl -I http://127.0.0.1:3000
```

## 5. 配置 Nginx 反向代理

把模板拷到 Nginx：

```bash
sudo cp /opt/ozon-project/deploy/oci/nginx-ozon-admin.conf /etc/nginx/sites-available/ozon-admin.conf
```

模板已写入你的域名：`admin.xuzhiqingvip.top`、`api.xuzhiqingvip.top`。

启用站点：

```bash
sudo ln -sf /etc/nginx/sites-available/ozon-admin.conf /etc/nginx/sites-enabled/ozon-admin.conf
sudo nginx -t
sudo systemctl reload nginx
```

## 6. 申请 HTTPS 证书（Let's Encrypt）

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d admin.xuzhiqingvip.top -d api.xuzhiqingvip.top
```

完成后验证：

- `https://admin.xuzhiqingvip.top`
- `https://api.xuzhiqingvip.top/health`

## 7. 日常发布

```bash
cd /opt/ozon-project
git pull
docker compose up -d --build
docker compose logs --tail=200 api
docker compose logs --tail=200 web
```

## 8. 回滚（最小）

```bash
cd /opt/ozon-project
git checkout <上一个稳定tag或commit>
docker compose up -d --build
```

数据库回滚按你已验证流程：

- 备份：`scripts/ops-db-backup.ps1`
- 恢复：`scripts/ops-db-restore.ps1`
