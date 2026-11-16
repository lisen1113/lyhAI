# 生产部署运维手册（phychem-trainer）

> 目标机：腾讯云轻量 `lhins-izb6ll7s`（123.207.183.23，上海四区）
> 目录：`/opt/phychem-trainer`　项目名：`phychem-trainer`　端口：`8088 → 3000`
> **红线**：不触碰 surfacedmp.com 的任何容器/网络/卷/Nginx/环境变量；只管理 `-p phychem-trainer`。

---

## 一、文件布局

把本目录内容复制到 `/opt/phychem-trainer`：

```
/opt/phychem-trainer/
├── compose.yml            ← deploy/compose.yml
├── .env                   ← 由 deploy/.env.prod.example 复制并填写（chmod 600）
├── db-init/
│   └── 001_schema.sql     ← 应急兜底（正常流程不挂载）
├── scripts/
│   ├── seed.sh            ← 一次性初始化（迁移 + 灌数据 + 建账号）
│   ├── backup-db.sh       ← 每日备份
│   └── rollback.sh        ← 一键回滚
├── backups/               ← 备份文件（chmod 700）
└── logs/                  ← 运维日志
```

---

## 二、首次部署顺序

```bash
# 0. 预检（全部只读）
free -m; df -h /opt; sudo ss -lntp | grep 8088
curl -sI https://surfacedmp.com/ | head -1

# 1. 准备目录与配置
install -d -m 755 /opt/phychem-trainer/{db-init,backups,logs,scripts}
cd /opt/phychem-trainer
cp <本目录>/compose.yml .
cp <本目录>/scripts/*.sh scripts/ && chmod +x scripts/*.sh
cp <本目录>/.env.prod.example .env && chmod 600 .env
vi .env          # 填 PG_PASSWORD（openssl rand -hex 24）、SEED_PASSWORD、镜像地址

# 2. 拉取镜像（只拉不构建）
echo "$GHCR_TOKEN" | docker login ghcr.io -u <用户名> --password-stdin
docker compose -p phychem-trainer pull

# 3. 启动数据库
docker compose -p phychem-trainer up -d db
until [ "$(docker inspect -f '{{.State.Health.Status}}' phychem-db)" = "healthy" ]; do sleep 2; done

# 4. 初始化数据（迁移 + 知识树 + 题库 + 账号）
./scripts/seed.sh            # 结尾会打印 119/119 达标率

# 5. 启动应用
docker compose -p phychem-trainer up -d app

# 6. 本机验证（先内网，再开安全组）
curl -s http://127.0.0.1:8088/api/health
```

安全组放行 8088 后：

```bash
curl -s -o /dev/null -w '%{http_code}\n' http://123.207.183.23:8088/login
curl -sI https://surfacedmp.com/ | head -1      # 现有业务必须仍正常
```

---

## 三、日常操作

| 操作 | 命令 |
|---|---|
| 看状态 | `docker compose -p phychem-trainer ps` |
| 看日志 | `docker compose -p phychem-trainer logs --tail=100 app` |
| 重启应用 | `docker compose -p phychem-trainer up -d --no-deps --force-recreate app` |
| 资源占用 | `docker stats --no-stream phychem-app phychem-db` |
| 健康检查 | `curl -s http://127.0.0.1:8088/api/health` |
| 手动备份 | `./scripts/backup-db.sh` |

### 发布新版本

```bash
cd /opt/phychem-trainer
cp .env .env.bak.$(date +%Y%m%d-%H%M%S)
sed -i 's|^APP_IMAGE=.*|APP_IMAGE=ghcr.io/<owner>/lyh-ai:1.0.1|' .env
sed -i 's|^APP_VERSION=.*|APP_VERSION=1.0.1|' .env
docker compose -p phychem-trainer pull app
docker compose -p phychem-trainer up -d --no-deps app
curl -s http://127.0.0.1:8088/api/health
```

> 涉及数据库结构变更的版本，另需用 tools 镜像执行 `npx prisma migrate deploy`，**执行前必须先备份**。

### 回滚

```bash
./scripts/rollback.sh 1.0.0
```

---

## 四、备份

`backup-db.sh` 写入 `backups/physchem_YYYYmmdd-HHMMSS.dump`，保留 15 份。
定时任务（独立文件，不影响现有 cron）：

```bash
cat > /etc/cron.d/phychem-trainer-backup <<'EOF'
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
10 3 * * * root /opt/phychem-trainer/scripts/backup-db.sh >> /opt/phychem-trainer/logs/backup.log 2>&1
EOF
chmod 644 /etc/cron.d/phychem-trainer-backup
```

恢复（**仅在确认要丢弃现有数据时**，先停 app，再快照）：

```bash
docker compose -p phychem-trainer stop app
docker exec -i phychem-db pg_restore -U physchem -d physchem_v1 --clean --if-exists < backups/physchem_xxx.dump
docker compose -p phychem-trainer start app
```

---

## 五、应急兜底

若 `prisma migrate deploy` 无法执行（镜像损坏 / 网络受限），可用 `db-init/001_schema.sql` 直接建表：

```bash
docker exec -i phychem-db psql -U physchem -d physchem_v1 < db-init/001_schema.sql
```

但这样不会写入 `_prisma_migrations` 记录，后续迁移前需用 `npx prisma migrate resolve --applied <迁移名>` 逐条登记，否则会重复建表报错。

---

## 六、故障速查

| 现象 | 排查 |
|---|---|
| `/api/health` 返回 503 `db:down` | `docker logs phychem-db`；检查 `PG_PASSWORD` 与 `DATABASE_URL` 是否一致 |
| 登录成功但立刻退回登录页 | `COOKIE_SECURE` 必须为 `false`（HTTP 访问），或前端未使用相对路径 |
| 容器反复重启 | `docker compose -p phychem-trainer logs app`，常见为迁移未跑、端口冲突 |
| 8088 打不开 | 先 `curl 127.0.0.1:8088`；内网通 → 查安全组；内网不通 → 查容器状态 |
| 内存吃紧 | `docker stats`；下调 `.env` 中 `APP_MEM`/`DB_MEM` 后 `up -d` |

**任何情况下都不要执行** `docker system prune -a`、`docker volume prune`、对其他项目 `down`。
