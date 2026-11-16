# 生产部署记录（V1.0.0）

> 部署时间：2026-11-16 23:38 – 23:50（GMT+8）
> 服务器：腾讯云轻量应用服务器 `lhins-izb6ll7s`（上海四区），公网 IP `123.207.183.23`
> 该机同时运行既有生产业务 surfacedmp.com（caddy + uvicorn + 原生 PostgreSQL 16），本次部署与其完全隔离。

## 一、最终架构

| 组件 | 说明 |
|---|---|
| 容器编排 | Docker Compose 项目 `phychem-trainer`（独立项目名、独立网络、独立数据卷） |
| 应用 | `phychem-app:1.0.0`（Next.js 15 standalone，484MB），`0.0.0.0:8088 -> 3000` |
| 数据库 | `postgres:18-alpine`，**不映射任何端口**，仅在 `phychem-trainer-net` 内可见 |
| 数据卷 | `phychem-trainer_pgdata` → 挂载到 `/var/lib/postgresql` |
| 运维工具 | `phychem-tools:1.0.0`（2.07GB，含 prisma / 全部 seed 脚本），仅初始化时一次性使用 |
| 对外访问 | `http://123.207.183.23:8088` |

### 与宿主业务的隔离点

- 独立 Compose 项目名、独立 bridge 网络、独立 named volume
- 数据库零端口映射，**不占用宿主 127.0.0.1:5432**（该端口属既有业务）
- 8088 为新增端口，与 caddy 的 80/443 无交集
- 资源上限：app `768m / 0.8 CPU`，db `512m / 0.5 CPU`
- 日志上限：app `20m×5`，db `10m×3`

## 二、与原始方案的偏差（受服务器实际环境约束）

| 原方案 | 实际执行 | 原因 |
|---|---|---|
| GitHub Actions 构建 → GHCR 拉取 | **服务器本地 `docker build`** | 该机 Docker Hub 被阻断（`registry-1.docker.io` 连接重置）；GHCR 包默认私有无法免认证拉取 |
| Dockerfile 直连 `deb.debian.org` | 切 `http://mirrors.cloud.tencent.com` | 容器内访问官方源极慢；且 `bookworm-slim` 无 CA 根证书，走 https 会 `No system certificates available`，故必须用 http（apt 靠 GPG 验签保证完整性） |
| `npm ci` / Prisma 引擎走默认源 | `registry.npmmirror.com` + 对应引擎镜像 | 生产机公网出口受限 |
| `postgres:18-alpine` 挂 `/var/lib/postgresql/data` | 挂 `/var/lib/postgresql` | PG 18+ 官方镜像改为版本化数据目录，旧挂载点会被判定为「残留数据」并拒绝启动 |

## 三、服务器基础环境

| 项 | 值 |
|---|---|
| 系统 | Ubuntu 24.04.5 LTS，内核 6.8.0-147-generic |
| 规格 | 4 vCPU / 3.7GB 内存 / 2GB swap / 59GB 磁盘 |
| Docker | 29.1.3（apt `docker.io`） |
| Compose | 2.40.3（apt `docker-compose-v2`） |
| buildx | 0.30.1（apt `docker-buildx`，必需：老式构建器不支持 BuildKit 与命名 dockerignore） |
| 镜像加速 | `/etc/docker/daemon.json` → `https://mirror.ccs.tencentyun.com` |

## 四、初始化结果

执行 `deploy/scripts/seed.sh`，11 步全部通过：

```
1/11 prisma migrate deploy（建表 32 张）
2/11 seed-base          学科：物理 PH / 化学 CH
3/11 seed-knowledge     知识点 210 / 微技能 119
4/11 seed-error-tags    错因标签 28（目标 29，差 1 个化学标签，不阻塞）
5/11 seed-questions     生成器题库
6/11 seed-question-bank-v2
7/11 seed-question-bank-v3
8/11 seed-question-bank-v5v6（含 v21 物理补丁）
9/11 backfill-microskill
10/11 sync-variant-level
11/11 seed-achievements + seed-production
```

题库总量 **1093 题**，变式层级分布：L1 240 / L2 454 / L3 399。
知识点密度验收：**36 个章节全部达标**，无未达标项。

## 五、账号

| 用户名 | 姓名 | 角色 | 年级 | 初始密码 |
|---|---|---|---|---|
| `lisen` | 李森 | ADMIN | — | 见交付说明 |
| `liyuhan` | 李语涵 | STUDENT | 9 | 见交付说明 |
| `xule` | 徐乐 | STUDENT | 9 | 见交付说明 |
| `qinjn` | 秦鉴楠 | STUDENT | 9 | 见交付说明 |
| `test` | 测试账号 | STUDENT | 9 | 见交付说明 |

> 密码不写入本文件。学生初始密码由 `.env` 的 `SEED_PASSWORD` 决定，生产 `.env` 权限 600，不入库。

## 六、验收结果（从公网实测）

| 检查 | 结果 |
|---|---|
| `GET /api/health` | `{"status":"ok","version":"1.0.0","db":"ok"}` |
| `GET /` | 307 → `/login` |
| 登录 `liyuhan` / `lisen` / `test` | 200，返回用户信息 |
| 错误密码 | 401 `INVALID_CREDENTIALS` |
| 会话 Cookie | `physchem_session`，HTTP 下**无 Secure 标记**（符合预期） |
| `GET /api/student/plan?subject=PH` | 200，12 条，主科 PH，28 分钟 |
| `GET /api/student/plan?subject=CH` | 200，12 条，主科 CH，28 分钟（**两科同日并存**） |
| `GET /api/student/question?id=…` | 200，返回真实题干 |
| `GET /api/student/mastery` `/review` | 200 |
| surfacedmp.com | 仍 HTTP 200，caddy 未重启 |
| 资源占用 | app 86MB / db 52MB，宿主可用 2.6GB |

## 七、备份与回滚

- **每日备份**：`/etc/cron.d/phychem-backup`，每日 03:30 执行 `deploy/scripts/backup-db.sh`
- 产物：`/opt/phychem-trainer/backups/physchem_YYYYMMDD-HHMMSS.dump`（pg_dump 自定义格式，含完整性校验），保留最近 15 份
- 首次备份已验证：`physchem_20261116-234936.dump`（721KB）
- 回滚：`deploy/scripts/rollback.sh`（详见 `deploy/README.md`）

## 八、常用运维命令

```bash
cd /opt/phychem-trainer

# 查看状态
sudo docker compose -f deploy/compose.yml --env-file .env ps
sudo docker stats --no-stream

# 重启应用
sudo docker compose -f deploy/compose.yml --env-file .env restart app

# 查看日志
sudo docker logs -f --tail 100 phychem-app

# 进入数据库
sudo docker exec -it phychem-db psql -U physchem -d physchem_v1

# 手动备份
sudo bash deploy/scripts/backup-db.sh
```

## 九、已知事项

1. 错因标签 28 个（目标 29），缺 1 个化学标签，不影响训练逻辑。
2. 当前经 `http://IP:8088` 访问，`COOKIE_SECURE=false`；将来若绑定域名并启用 HTTPS，需改为 `true`。
3. 该机曾发生腾讯云 Lighthouse 服务关联角色自动删除域名 A 记录（2026-11-16 10:58），与本系统无关；域名解析现已改由 DNSPod 手工维护。
