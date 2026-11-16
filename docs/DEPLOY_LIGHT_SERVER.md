# 腾讯云轻量应用服务器部署手册（IP:端口直连 + 全新 PostgreSQL）

> 场景：3 名学生用手机/平板通过 `http://服务器公网IP:端口` 登录训练。
> 假设：Ubuntu 22.04 LTS（若为 CentOS/TencentOS，包管理命令替换为 yum/dnf）。
> 安全提醒：IP 直连走 HTTP，密码（含 123456）明文传输。建议尽快绑定域名+HTTPS（见第 6 节）。

## 0. 部署前需要你提供的信息（敏感，勿公开发送）

| 项目 | 用途 | 示例 |
|---|---|---|
| 公网 IP | SSH 登录 + 学生访问地址 | 1.2.3.4 |
| SSH 端口 | 登录 | 22 |
| 登录用户名 | 登录 | root / ubuntu |
| 登录方式 | 密码 或 私钥文件路径 | — |
| 服务器系统 | 决定命令 | Ubuntu 22.04 |
| 期望应用端口 | 学生访问的端口 | 3000（需防火墙放行） |

> 我会用这些信息直接 SSH 部署。也可以我生成完整脚本，你在服务器上粘贴执行。

---

## 1. 服务器初始化（一次性）

```bash
# 以 root 或有 sudo 权限用户执行
sudo apt update && sudo apt upgrade -y
sudo apt install -y curl git build-essential

# 安装 Node.js 22（Next.js 15 需要 18.18+，推荐 22 LTS）
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
node -v && npm -v

# 安装 PostgreSQL 16
sudo apt install -y postgresql postgresql-contrib
sudo systemctl enable --now postgresql
```

## 2. 创建数据库与专用角色

```bash
sudo -u postgres psql <<'SQL'
CREATE USER physchem WITH PASSWORD '请替换为强密码';
CREATE DATABASE physchem_v1 OWNER physchem;
GRANT ALL PRIVILEGES ON DATABASE physchem_v1 TO physchem;
\c physchem_v1
GRANT ALL ON SCHEMA public TO physchem;
SQL
```

## 3. 部署应用代码

```bash
# 放到 /opt/physchem
sudo mkdir -p /opt/physchem && sudo chown -R $USER:$USER /opt/physchem
cd /opt/physchem

# 上传项目（二选一）
# A. 从 Git（若已推送仓库）：git clone <repo> .
# B. 本地打包上传：在 Windows 本地执行 scp -r <项目目录>/* user@IP:/opt/physchem/

# 安装依赖并构建
npm ci --omit=dev 2>/dev/null || npm install --omit=dev
# 注意：构建需要 devDependencies（typescript/tailwind），改用：
npm install
npm run build
```

## 4. 配置环境变量

```bash
cd /opt/physchem
cat > .env <<'ENV'
DATABASE_URL="postgresql://physchem:请替换为强密码@127.0.0.1:5432/physchem_v1?schema=public"
AUTH_SECRET="请用 openssl rand -base64 32 生成"
NEXT_PUBLIC_APP_URL="http://服务器公网IP:端口"
PORT=3000
ENV
chmod 600 .env
```

## 5. 迁移 + 灌入数据

```bash
cd /opt/physchem
npx prisma migrate deploy
npm run prisma:seed          # 账号 + 基础数据
npm run prisma:seed:knowledge # 完整知识树
npm run prisma:seed:errortags # 错因标签
npm run prisma:seed:bank-v2   # 高质量题库
# 注意：seed 顺序不可颠倒
```

## 6. 启动应用（systemd 常驻）

```bash
sudo tee /etc/systemd/system/physchem.service > /dev/null <<'EOF'
[Unit]
Description=PhysChem AI Trainer
After=network.target postgresql.service

[Service]
Type=simple
User=root
WorkingDirectory=/opt/physchem
EnvironmentFile=/opt/physchem/.env
ExecStart=/usr/bin/npm run start
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF
sudo systemctl daemon-reload
sudo systemctl enable --now physchem
sudo systemctl status physchem
```

## 7. 防火墙放行端口

```bash
# 腾讯云控制台「防火墙」也要放行该端口（轻量服务器有两层防火墙！）
sudo ufw allow 3000/tcp
sudo ufw status
```

> **关键**：轻量服务器必须在腾讯云控制台的「防火墙」标签页也添加放行规则，仅系统内 ufw 放行不够。

## 8. 验证

学生用手机/平板浏览器打开：`http://服务器公网IP:3000/login`

| 账号 | 密码 |
|---|---|
| liyuhan | 123456 |
| xule | 123456 |
| qinjn | 123456 |
| admin | Admin@2026（请修改） |

验证清单：
- [ ] 学生能登录，看到今日训练六段
- [ ] 热身题每次不同（刷新页面/换天）
- [ ] Admin 能看到 3 名学生指标
- [ ] 手机、平板浏览布局正常（响应式）

## 9. 每日备份（数据安全）

```bash
sudo tee /etc/cron.daily/physchem-backup > /dev/null <<'EOF'
#!/bin/bash
BACKUP_DIR=/var/backups/physchem
mkdir -p $BACKUP_DIR
pg_dump -U physchem physchem_v1 | gzip > $BACKUP_DIR/db_$(date +%F).sql.gz
find $BACKUP_DIR -name "*.sql.gz" -mtime +30 -delete
EOF
sudo chmod +x /etc/cron.daily/physchem-backup
```

## 10. 后续：绑定域名 + HTTPS（强烈建议）

学生密码是 123456，HTTP 明文传输有风险。建议：
1. 腾讯云购买/解析域名到该服务器 IP
2. 安装 Nginx 反向代理 3000 端口
3. 用 certbot 申请免费 SSL 证书
4. 强制 HTTPS 跳转

这一步我可以在部署后继续帮你完成。

---

## 备注：本地与生产差异

| 项目 | 本地（当前） | 生产（服务器） |
|---|---|---|
| 数据库 | 独立 PG 实例 55433，trust 认证 | 正式 PG 16，密码认证 |
| 访问 | http://localhost:3200 | http://IP:3000 |
| 常驻 | 后台任务 | systemd 服务 |
| 备份 | 无 | 每日 pg_dump |
