# 部署计划（分阶段 · 可回滚）

**项目**：初中物理化学 AI 自适应训练系统 V1.0
**目标**：腾讯云轻量应用服务器 `lhins-izb6ll7s`（上海四区，123.207.183.23）
**现有生产**：surfacedmp.com（**全程零触碰**）
**状态**：**计划待批准 —— 尚未执行任何服务器操作**

> **修订（2026-11-16 21:50）**：本计划已落地为仓库内可执行文件 ——
> `Dockerfile.prod`、`deploy/compose.yml`、`deploy/scripts/{seed,backup-db,rollback}.sh`、
> `deploy/.env.prod.example`、`.github/workflows/build-images.yml`。
> 若本文档中的示例与仓库文件不一致，**以仓库文件为准**。
>
> 另有两处方案更新：
> 1. 建表改用 tools 容器内执行 `prisma migrate deploy`（保留 `_prisma_migrations` 迁移状态）；
>    `db-init/001_schema.sql` 降级为应急兜底，**不再自动挂载**，避免重复建表。
> 2. 初始化顺序新增第 0 步 `seed-base.ts`（学科记录），否则 `seed-knowledge` 会报
>    `Subject PH not found` —— 该问题已在全新库上实测复现并修复。

---

## 0. 架构与边界

```
                     公网
        ┌──────────────┴───────────────┐
        │                              │
   :443/:80                        :8088（本阶段临时）
        │                              │
┌───────▼─────────┐          ┌─────────▼──────────────┐
│  现有 Nginx      │          │  Docker 端口映射        │
│  （不动）        │          │  8088 → 3000           │
│       │          │          │        │               │
│  ┌────▼─────┐   │          │  ┌─────▼──────────────┐ │
│  │surfacedmp│   │          │  │ phychem-app        │ │
│  │ 容器/卷   │   │          │  │ Next.js 15 (node)  │ │
│  └──────────┘   │          │  └─────┬──────────────┘ │
└─────────────────┘          │        │ phychem-trainer-net（独立网络）
                             │  ┌─────▼──────────────┐ │
                             │  │ phychem-db         │ │
                             │  │ PostgreSQL 18      │ │
                             │  │ 无端口映射          │ │
                             │  └─────┬──────────────┘ │
                             │        │                │
                             │  phychem-trainer_pgdata │
                             └─────────────────────────┘
```

**隔离原则**：新系统与现有业务**不共享**任何容器、网络、卷、端口、Nginx 配置、环境变量。唯一的物理共享是宿主机的 CPU/内存/磁盘——因此有阶段 1 的资源闸门。

### 目录规划（规则 4）

```
/opt/phychem-trainer/                 ← 唯一允许写入的业务目录
├── compose.yml                       ← 生产 compose（含 name: phychem-trainer）
├── .env                              ← 权限 600，含数据库密码与镜像版本
├── db-init/
│   └── 001_schema.sql                ← 首次启动自动建表（方案 A）
├── backups/                          ← 每日 pg_dump，保留 15 份
├── logs/                             ← 部署与运维日志
└── scripts/
    ├── backup-db.sh
    ├── deploy.sh
    └── rollback.sh                   ← 一键回滚（规则 19）
```

---

## 1. 命名与规格

| 项 | 取值 | 对应规则 |
|---|---|---|
| Compose 项目名 | `phychem-trainer` | 5 |
| 应用容器 | `phychem-app`，镜像 `phychem-trainer:<版本>` | 19 |
| 数据库容器 | `phychem-db`，`postgres:18-alpine` | 6、8 |
| 数据库用户 / 库 | `physchem` / `physchem_v1` | 6 |
| 数据卷 | `phychem-trainer_pgdata` | 6 |
| 网络 | `phychem-trainer-net`（bridge，独立） | 1 |
| 应用端口 | 容器 3000 → 主机 **8088** | 9 |
| 数据库端口 | **不映射** | 7 |
| 时区 | `TZ=Asia/Shanghai`（应用）、`PGTZ`（数据库） | — |

### 资源限额（规则 11）——按阶段 1 实测结果取档

| 实测 `MemAvailable` | app `mem_limit` / `cpus` | db `mem_limit` / `cpus` | 说明 |
|---|---|---|---|
| ≥ 3 GB | 1024m / 1.0 | 768m / 1.0 | 宽裕，留足余量 |
| 1.5 – 3 GB | 768m / 0.8 | 512m / 0.5 | **默认档** |
| < 1.5 GB | — | — | **停止部署**（规则 15） |

日志限额：app `max-size=20m, max-file=5`；db `max-size=10m, max-file=3`（合计上限约 130 MB，防磁盘被日志吃满）。

---

## 2. 阶段总览

| 阶段 | 内容 | 停机风险 | 需授权 | 预计 |
|---|---|---|---|---|
| 0 | 本地代码修复 8 个 P0 | 无（不碰服务器） | 否 | 40 min |
| 1 | 服务器只读预检 | 无 | **是** | 10 min |
| 2 | 备份现有业务 + 创建快照 | 无 | **是** | 20–40 min |
| 3 | 构建镜像并传输 | 无 | **是** | 30 min |
| 4 | 初始化 `/opt/phychem-trainer` | 无 | **是** | 10 min |
| 5 | 数据库初始化 + 灌数据 | 无 | **是** | 15 min |
| 6 | 启动 + 本机健康验证 | 无 | **是** | 10 min |
| 7 | 安全组放行 8088 | 无 | **是（你操作）** | 5 min |
| 8 | 双系统验收 | 无 | **是** | 15 min |
| 9 | 每日备份定时任务 | 无 | **是** | 5 min |
| 10 | 版本发布与回滚演练 | 无 | **是** | 10 min |

> 全程**不重启、不停止、不重建**现有容器；不读写 `/etc/nginx`。

---

## 3. 阶段 0：本地代码修复（8 项 P0）

> 全部在本地仓库完成，不涉及服务器。下面给出可直接落地的改动。

### 0.1 `next.config.mjs` —— 增加 standalone 输出

```js
const nextConfig = {
  distDir: process.env.NEXT_DIST_DIR || ".next",
  output: "standalone",                       // ← 新增
};
```

### 0.2 新增 `public/` 目录

放入 `public/favicon.svg`（或任意占位文件），确保目录进入构建上下文。

### 0.3 新增 `.dockerignore`

```
node_modules
.next
.next-*
.next-stale-*
.git
.gitignore
.env
.env.*
!.env.example
docs
scripts
tests
coverage
*.log
README.md
```

### 0.4 新增 `src/app/api/health/route.ts`

```ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const startedAt = Date.now();
  let db = "down";
  try {
    await prisma.$queryRaw`SELECT 1`;
    db = "ok";
  } catch {
    db = "down";
  }
  const ok = db === "ok";
  return NextResponse.json(
    {
      status: ok ? "ok" : "degraded",
      version: process.env.APP_VERSION ?? "unknown",
      db,
      latencyMs: Date.now() - startedAt,
      time: new Date().toISOString(),
    },
    { status: ok ? 200 : 503 }
  );
}
```

> 不返回连接串、不返回主机名；中间件 matcher 未覆盖 `/api`，天然免鉴权。

### 0.5 `src/lib/auth/session.ts` —— Cookie 安全开关

```diff
-    secure: process.env.NODE_ENV === "production",
+    // 本阶段经 http://IP:8088 访问，必须允许非 HTTPS 下保存 Cookie。
+    // 将来挂 HTTPS 后把 COOKIE_SECURE 设为 true 即可，无需改代码。
+    secure: process.env.COOKIE_SECURE === "true",
```

### 0.6 `src/app/api/health` 配套：`APP_VERSION` 注入

compose 中增加 `APP_VERSION=${APP_VERSION}`，`.env` 里与镜像 tag 保持一致，便于线上排查。

### 0.7 新增 `prisma/seed-production.ts`（生产专用，幂等）

要点：

- 只创建 4 个账号：`lisen`(ADMIN)、`liyuhan`/`xule`/`qinjn`(STUDENT)；
- 密码读 `process.env.SEED_PASSWORD`，**不写死**；
- 显示名用中文（徐乐、秦鉴楠），`studentProfile.grade = 9`；
- **不创建** `student1/2/3`，**不建**演示知识点；
- 已存在则 `update` 密码与显示名（可安全重跑）。

### 0.8 数据库初始化脚本生成

```bash
cd prisma/migrations
cat 20261116070740_init/migration.sql \
    20261116100446_add_variant_level_and_micro_skill_link/migration.sql \
    20261116194000_plan_per_subject/migration.sql \
  > ../../deploy/db-init/001_schema.sql
```

### 0.9 本地验证（必须全绿才进阶段 1）

```bash
npx tsc --noEmit
npx vitest run
npx tsx scripts/audit-content.ts
npx tsx scripts/verify-answers.ts
npx tsx scripts/verify-learning-loop.ts
npx tsx scripts/progress.ts            # 119/119
NEXT_DIST_DIR=.next-standalone npx next build
test -f .next-standalone/standalone/server.js && echo "standalone OK"
curl -s localhost:3200/api/health | head -5   # 200 + db:ok
```

---

## 4. 阶段 1：服务器只读预检（规则 13、15）

> **前置授权**：需要 SSH 登录权限。所有命令只读。

### 4.1 执行命令（整体粘贴）

```bash
echo "===== 1. 系统 ====="
uname -a; cat /etc/os-release | head -3; timedatectl | head -6
echo "===== 2. Docker ====="
docker version --format '{{.Server.Version}}'; docker compose version
docker ps --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}'
docker compose ls; docker volume ls; docker network ls
echo "===== 3. 资源 ====="
free -m; df -h / /opt /var; df -i /opt; nproc; uptime
docker system df
echo "===== 4. 端口 ====="
sudo ss -lntp | grep -E ':(8088|3000|5432|80|443)\b' || echo "目标端口全部空闲"
echo "===== 5. 现有业务 ====="
curl -sS -o /dev/null -w 'https:%{http_code} time:%{time_total}s\n' https://surfacedmp.com/
curl -sS -o /dev/null -w 'http:%{http_code}\n' http://surfacedmp.com/
docker inspect --format '{{.Name}} restarts={{.RestartCount}} health={{if .State.Health}}{{.State.Health.Status}}{{else}}n/a{{end}}' $(docker ps -q)
echo "===== 6. 防护检查 ====="
ls -d /opt/phychem-trainer 2>/dev/null && echo "WARN: 目录已存在" || echo "目录不存在（正常）"
```

### 4.2 闸门判定（任一不过 → **停止并报告**，规则 15）

| # | 检查 | 通过条件 | 不过则 |
|---|---|---|---|
| G1 | 可用内存 | `MemAvailable` ≥ **1500 MB** | 停止，报实际值，建议升配 |
| G2 | `/opt` 剩余 | ≥ **15 GB**（且 `df -i` 未耗尽） | 停止，报实际值 |
| G3 | 8088 端口 | 未监听 | 停止，报占用进程 |
| G4 | 现有站点 | HTTP 200/301/302 | 停止（先修现有故障） |
| G5 | Docker / Compose | 均可用，Compose ≥ v2 | 停止，报版本 |
| G6 | 现有容器 | 记录 `RestartCount` 基线 | 部署后须对比不变 |

**G1–G6 全绿才进入阶段 2。** 预检原始输出存档到 `/opt/phychem-trainer/logs/preflight-<日期>.log`。

---

## 5. 阶段 2：备份现有业务 + 快照（规则 14）

### 5.1 只读备份（不修改任何现有资源）

```bash
BK=/root/preflight-$(date +%F)
mkdir -p "$BK"

docker ps --format '{{.Names}}\t{{.Image}}\t{{.Status}}' > "$BK/containers.txt"
docker inspect $(docker ps -q)                       > "$BK/inspect.json"
docker volume ls                                     > "$BK/volumes.txt"
docker network ls                                    > "$BK/networks.txt"
docker compose ls                                    > "$BK/compose-projects.txt" 2>/dev/null || true
cp -a /etc/nginx "$BK/nginx-config-backup" 2>/dev/null || true   # 只复制，不修改

# 若识别到现有数据库容器，另做一次只读逻辑备份（不停止容器）
docker ps --format '{{.Names}}\t{{.Image}}' | grep -Ei 'postgres|mysql|mariadb'
# 确认容器名后（示例，按实际替换 <db>）：
#   docker exec <db> pg_dumpall -U postgres > "$BK/existing-db.sql"
#   docker exec <db> mysqldump  --all-databases -uroot -p... > "$BK/existing-db.sql"
```

> 备份体积若超过 `/root` 剩余空间，先看 `docker system df` 与 `du -sh`，改用腾讯云 COS 或跳过逻辑备份（快照兜底），但**必须记录该决定**。

### 5.2 创建云快照（规则 14 硬性要求）

- 控制台路径：轻量应用服务器 → 实例 `lhins-izb6ll7s` → 快照 → 创建快照；
- 命名：`pre-phychem-20261116`；
- **必须等到快照状态变为「已完成」**才继续，否则回滚能力不成立。

> 若由我执行，需要你提供具备快照权限的 `tccli` 密钥；否则请你在控制台完成后告知我。

---

## 6. 阶段 3：构建镜像并传输（规则 12）

> 本机**未安装 Docker**（已实测 `docker: command not found`），因此必须在外部构建。三选一：

### 方案 A（推荐）腾讯云容器镜像服务 TCR

```bash
# 在具备 Docker 的机器 / CI 上执行
docker build -f Dockerfile.prod -t phychem-trainer:1.0.0 .
docker tag phychem-trainer:1.0.0 ccr.ccs.tencentyun.com/<命名空间>/phychem-trainer:1.0.0
docker push ccr.ccs.tencentyun.com/<命名空间>/phychem-trainer:1.0.0

# 服务器拉取（需已 docker login）
docker pull ccr.ccs.tencentyun.com/<命名空间>/phychem-trainer:1.0.0
```

### 方案 B 离线传输（无镜像仓库时）

```bash
docker save phychem-trainer:1.0.0 | gzip -9 > phychem-trainer-1.0.0.tar.gz
scp phychem-trainer-1.0.0.tar.gz root@123.207.183.23:/opt/phychem-trainer/
ssh root@123.207.183.23 'gunzip -c /opt/phychem-trainer/phychem-trainer-1.0.0.tar.gz | docker load'
```

### 方案 C 服务器构建 —— **不采用**（违反规则 12，且会挤占现有业务资源）

### 生产 `Dockerfile.prod`（外部构建用，服务器不执行）

```dockerfile
# syntax=docker/dockerfile:1.7
FROM node:22-bookworm-slim AS base
ENV NEXT_TELEMETRY_DISABLED=1

FROM base AS deps
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci --no-audit --no-fund && npx prisma generate

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# 构建期不需要真实数据库；显式给占位串，避免误连
ENV DATABASE_URL="postgresql://build:build@127.0.0.1:5432/build?schema=public"
RUN npm run build \
 && test -f .next/standalone/server.js \
 || (echo "FATAL: .next/standalone 缺失，检查 next.config 的 output"; exit 1)
RUN find .next/standalone \( -name '*query_engine*' -o -name 'libquery_engine*' \) | grep -q . \
 || echo "WARN: standalone 未见 Prisma 引擎，需在 next.config 增加 outputFileTracingIncludes"

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0 TZ=Asia/Shanghai
RUN apt-get update && apt-get install -y --no-install-recommends openssl \
 && rm -rf /var/lib/apt/lists/* \
 && groupadd -g 1001 nodejs && useradd -u 1001 -g nodejs -m nextjs
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
USER nextjs
EXPOSE 3000
HEALTHCHECK --interval=20s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
```

---

## 7. 阶段 4：初始化目录（规则 4、5）

```bash
install -d -m 755 /opt/phychem-trainer/{db-init,backups,logs,scripts}
chmod 700 /opt/phychem-trainer/backups
cd /opt/phychem-trainer
```

### 7.1 `compose.yml`

```yaml
name: phychem-trainer                 # 规则 5：独立项目名

services:
  db:
    image: postgres:18-alpine
    container_name: phychem-db
    restart: unless-stopped
    environment:
      POSTGRES_DB: physchem_v1
      POSTGRES_USER: physchem
      POSTGRES_PASSWORD: ${PG_PASSWORD:?missing}
      TZ: Asia/Shanghai
      PGTZ: Asia/Shanghai
    volumes:
      - pgdata:/var/lib/postgresql/data
      - ./db-init:/docker-entrypoint-initdb.d:ro    # 仅空卷首启执行
    networks: [internal]
    # 规则 7：不映射任何端口（含 127.0.0.1）
    mem_limit: 512m
    cpus: 0.5
    shm_size: 128m
    security_opt: ["no-new-privileges:true"]
    logging:
      driver: json-file
      options: { max-size: "10m", max-file: "3" }
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U physchem -d physchem_v1"]
      interval: 10s
      timeout: 5s
      retries: 10
      start_period: 30s

  app:
    image: ${APP_IMAGE:?missing}
    container_name: phychem-app
    restart: unless-stopped
    depends_on:
      db: { condition: service_healthy }
    environment:
      NODE_ENV: production
      PORT: "3000"
      HOSTNAME: 0.0.0.0
      TZ: Asia/Shanghai
      APP_VERSION: ${APP_VERSION:-1.0.0}
      COOKIE_SECURE: "false"          # 规则 8：本阶段 HTTP 访问
      DATABASE_URL: postgresql://physchem:${PG_PASSWORD}@db:5432/physchem_v1?schema=public
      AI_PROVIDER: none
    ports:
      - "${APP_PORT:-8088}:3000"      # 规则 9
    networks: [internal]
    mem_limit: 768m
    cpus: 0.8
    security_opt: ["no-new-privileges:true"]
    logging:
      driver: json-file
      options: { max-size: "20m", max-file: "5" }

volumes:
  pgdata:
    name: phychem-trainer_pgdata      # 规则 6

networks:
  internal:
    name: phychem-trainer-net         # 规则 1：独立网络
    driver: bridge
```

### 7.2 `.env`

```bash
cd /opt/phychem-trainer
cat > .env <<EOF
APP_IMAGE=ccr.ccs.tencentyun.com/<命名空间>/phychem-trainer:1.0.0
APP_VERSION=1.0.0
APP_PORT=8088
PG_PASSWORD=$(openssl rand -hex 24)
SEED_PASSWORD=123456
EOF
chmod 600 .env
```

### 7.3 语法校验（不启动）

```bash
cd /opt/phychem-trainer
docker compose -p phychem-trainer config >/dev/null && echo "compose 语法 OK"
docker compose -p phychem-trainer config | grep -E 'published|host_ip' || echo "确认：db 无 published 端口"
```

---

## 8. 阶段 5：数据库初始化 + 灌数据

### 8.1 建表（方案 A：首启自动执行）

`db-init/001_schema.sql` 由阶段 0.8 生成，上传：

```bash
scp deploy/db-init/001_schema.sql root@123.207.183.23:/opt/phychem-trainer/db-init/
```

启动数据库，等待健康：

```bash
cd /opt/phychem-trainer
docker compose -p phychem-trainer up -d db
for i in $(seq 1 30); do
  st=$(docker inspect -f '{{.State.Health.Status}}' phychem-db 2>/dev/null)
  [ "$st" = "healthy" ] && { echo "db healthy"; break; }; sleep 2
done
docker exec phychem-db psql -U physchem -d physchem_v1 -c '\dt' | head -20
```

> 预期看到 `User`、`Question`、`MicroSkill` 等表。**若表为空**，说明 init 脚本未执行（卷非空或编码问题）→ 停止排查，不要手动乱建。

### 8.2 灌数据（严格按序，**跳过 `seed.ts`**）

顺序依据实测依赖关系确定：

| 步骤 | 脚本 | 作用 | 注意 |
|---|---|---|---|
| 0 | `seed-base.ts` | 学科记录（物理 / 化学） | **必须先跑**，否则知识树报 `Subject PH not found` |
| 1 | `seed-knowledge.ts` | 210 个节点（36 模块/55 单元/119 知识点）+ 119 微技能 + 前置关系 | 依赖步骤 0 |
| 2 | `seed-error-tags.ts` | 28 个错因标签 | 题库要绑定 |
| 3 | `seed-questions.ts` | 基础题库（PQ-*） | 依赖节点 |
| 4 | `seed-question-bank-v2.ts` | PQ2-* | **不写 microSkillId** |
| 5 | `seed-question-bank-v3.ts` | PQ3-* | **不写 microSkillId** |
| 6 | `seed-question-bank-v5v6.ts` | v5–v20 全部题库 | 主体，约 700+ 题 |
| 7 | `backfill-microskill.ts` | 按主知识点回填 `microSkillId` | **必跑**，否则丢题 |
| 8 | `sync-variant-level.ts` | 校准 `variantLevel` 与 tier | **必跑**，否则层级错 |
| 9 | `seed-achievements.ts` | 6 个成就 | — |
| 10 | `seed-production.ts` | 4 个账号（`lisen` + 3 名学生） | **禁用 `seed.ts`** |

> ⚠️ **`prisma/seed.ts` 绝对不可在生产执行**：它会写入 14 个演示知识点、2 道演示题、`student1-3` 测试账号，并把密码设为 `123456`，同时**不创建 `lisen`**。

执行方式（在服务器上用一次性 node 容器跑，不在镜像里塞 devDependencies）：

```bash
cd /opt/phychem-trainer
# 先把 prisma/ 与 scripts/ 同步到 /opt/phychem-trainer/tools/（含 tsx 依赖）
docker run --rm --network phychem-trainer-net \
  -v /opt/phychem-trainer/tools:/app -w /app \
  -e DATABASE_URL="postgresql://physchem:$PG_PASSWORD@db:5432/physchem_v1?schema=public" \
  -e SEED_PASSWORD="$SEED_PASSWORD" \
  node:22-bookworm-slim sh -lc "npm ci --no-audit --no-fund >/dev/null && \
    npx tsx prisma/seed-knowledge.ts && \
    npx tsx prisma/seed-error-tags.ts && \
    npx tsx prisma/seed-questions.ts && \
    npx tsx prisma/seed-question-bank-v2.ts && \
    npx tsx prisma/seed-question-bank-v3.ts && \
    npx tsx prisma/seed-question-bank-v5v6.ts && \
    npx tsx scripts/backfill-microskill.ts && \
    npx tsx scripts/sync-variant-level.ts && \
    npx tsx prisma/seed-achievements.ts && \
    npx tsx prisma/seed-production.ts"
```

> 该容器是一次性任务容器（`--rm`），不属于 phychem-trainer 项目资源，跑完自动消失。它需要外网拉取 npm 依赖；若服务器外网受限，改为在阶段 3 一并构建一个 `phychem-trainer-seed:<版本>` 镜像，用同一镜像跑 seed。

### 8.3 数据校验（不通过 → 停止）

```bash
docker exec phychem-db psql -U physchem -d physchem_v1 -c "
SELECT 'users' t, count(*) FROM \"User\"
UNION ALL SELECT 'nodes', count(*) FROM \"KnowledgeNode\"
UNION ALL SELECT 'skills', count(*) FROM \"MicroSkill\"
UNION ALL SELECT 'questions', count(*) FROM \"Question\" WHERE \"deletedAt\" IS NULL
UNION ALL SELECT 'tags', count(*) FROM \"ErrorTag\";"
```

| 指标 | 期望值 | 判定 |
|---|---|---|
| users | 4 | 必须 |
| nodes | 210 | 必须 |
| skills | 119 | 必须 |
| questions（活跃） | ≈1011（允许 ±几题） | `progress.ts` 的 119/119 才是硬标准 |
| tags | 28 | 必须 |

**达标率校验**（在 tools 容器内）：

```bash
npx tsx scripts/progress.ts    # 期望：达标 119/119 = 100%，物理 70/70，化学 49/49
```

---

## 9. 阶段 6：启动应用 + 本机健康验证（规则 16）

```bash
cd /opt/phychem-trainer
docker compose -p phychem-trainer up -d app

for i in $(seq 1 30); do
  code=$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:8088/api/health)
  [ "$code" = "200" ] && { echo "health 200"; break; }; sleep 3
done
curl -s http://127.0.0.1:8088/api/health; echo
docker compose -p phychem-trainer ps
docker stats --no-stream phychem-app phychem-db
```

**通过条件**：`/api/health` 返回 `200` 且 `"db":"ok"`。

**未通过 → 立即停止**，按第 13 节失败矩阵处理，**不要**放行安全组。

登录冒烟（本机，不经公网）：

```bash
curl -s -c /tmp/c.txt -X POST http://127.0.0.1:8088/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"test","password":"***"}' | head -c 300; echo
grep -c physchem_session /tmp/c.txt     # 期望 1
```

---

## 10. 阶段 7：安全组放行 8088（需你操作）

- 控制台：轻量应用服务器 → `lhins-izb6ll7s` → 防火墙 → 添加规则；
- 协议 TCP，端口 **8088**，来源建议先限「你的家庭/学校出口 IP」，验证通过后再考虑放开 `0.0.0.0/0`；
- **不要**放行 3000、5432。

放行后我立即执行外网验证：

```bash
curl -s -o /dev/null -w 'ext login page:%{http_code}\n' http://123.207.183.23:8088/login
curl -s http://123.207.183.23:8088/api/health
```

---

## 11. 阶段 8：双系统验收（规则 20）

| # | 项目 | 方法 | 通过标准 |
|---|---|---|---|
| 1 | 学习系统健康 | `curl 127.0.0.1:8088/api/health` | 200 + `db:ok` |
| 2 | 外网可访问 | `curl http://123.207.183.23:8088/login` | 200 |
| 3 | 学生登录 | 浏览器登录 `test` | 进入今日训练 |
| 4 | 计划生成 | 观察今日训练六段 | 12 项左右、专项 5 题、独立 2 题 |
| 5 | 答题闭环 | 做完 1 题 + 看解析 + 选错因 | 数据落库 |
| 6 | 学生端 5 页面 | `/student/{today,knowledge,review,growth,assessment}` | 全部 200 |
| 7 | 管理员登录 | `lisen` | 进入总览，看到 3 名学生 |
| 8 | **现有站点** | `curl -I https://surfacedmp.com/` | 状态码与阶段 1 基线**一致** |
| 9 | **现有容器** | `docker inspect ... RestartCount` | 与基线**完全相同** |
| 10 | 资源 | `docker stats --no-stream`、`free -m` | 内存未触顶、无 OOM |

**8、9 任一不符 → 判定部署影响现有业务，立即执行第 14 节回滚。**

---

## 12. 阶段 9：每日备份（规则 18）

### 12.1 `scripts/backup-db.sh`

```bash
#!/usr/bin/env bash
set -euo pipefail
DIR=/opt/phychem-trainer/backups
KEEP=14
STAMP=$(date +%Y%m%d-%H%M%S)
mkdir -p "$DIR"

docker exec phychem-db pg_dump -U physchem -d physchem_v1 -Fc \
  > "$DIR/physchem_$STAMP.dump.tmp"
mv "$DIR/physchem_$STAMP.dump.tmp" "$DIR/physchem_$STAMP.dump"

# 校验：能读出目录即视为有效备份
pg_restore -l "$DIR/physchem_$STAMP.dump" >/dev/null 2>&1 \
  || docker exec -i phychem-db pg_restore -l < "$DIR/physchem_$STAMP.dump" >/dev/null

# 保留最近 15 份（>=14 天）
ls -1t "$DIR"/physchem_*.dump | tail -n +$((KEEP+1)) | xargs -r rm -f
echo "[$(date -Is)] backup ok: $DIR/physchem_$STAMP.dump"
```

### 12.2 定时任务（独立文件，不动现有 cron）

```bash
chmod +x /opt/phychem-trainer/scripts/backup-db.sh
cat > /etc/cron.d/phychem-trainer-backup <<'EOF'
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
10 3 * * * root /opt/phychem-trainer/scripts/backup-db.sh >> /opt/phychem-trainer/logs/backup.log 2>&1
EOF
chmod 644 /etc/cron.d/phychem-trainer-backup
```

验证：手动跑一次 → 检查 `backups/` 有文件、`logs/backup.log` 有 `backup ok`。

> 容器若被卸载，`pg_dump` 仍可通过 `docker run --rm` 读卷完成，脚本已用 `docker exec`（要求容器在跑）；容器停止期间备份会失败并记录日志，属可接受降级。

---

## 13. 失败处置矩阵（规则 17）

| 失败点 | 现象 | 处置 | 禁止动作 |
|---|---|---|---|
| 阶段 1 闸门不过 | 内存/磁盘/端口/站点异常 | 停止，出报告，不创建任何资源 | 不得腾挪现有资源 |
| 镜像构建失败 | `standalone 缺失` 等 | 本地修复重打 tag，不动服务器 | 不得在服务器构建 |
| db 启动失败 | `unhealthy` | `docker compose -p phychem-trainer logs db`，修 `.env` 后重试一次 | 不得改现有 PG |
| 建表为空 | `\dt` 无表 | 检查 db-init 挂载与卷是否非空；必要时 `down` 本项目后重建卷（**仅本项目**） | 不得 `docker volume prune` |
| health 非 200 | 503 / 超时 | 看 `logs app`；常见：DATABASE_URL 错、引擎缺失、seed 未跑 | 不得放行 8088 |
| 登录失败 | 200 但立刻退出 | 检查 `COOKIE_SECURE`；看是否仍为 `true` | — |
| 影响现有业务 | 站点 5xx / 容器重启 | **立即回滚**（第 14 节）并通知 | 不得继续排查 |
| 需要清理 | — | 只允许 `docker compose -p phychem-trainer down` + 删除 `/opt/phychem-trainer` | **禁止** `docker system prune -a`、`down --volumes` 于其他项目 |

---

## 14. 回滚手册（规则 19）

### 14.1 版本发布方式

- 镜像 tag 严格语义化：`1.0.0`、`1.0.1`…，`.env` 中 `APP_IMAGE` + `APP_VERSION` 同步；
- 每次发布前记录：`docker image ls | grep phychem-trainer` 输出，append 到 `logs/releases.log`。

### 14.2 一键回滚脚本 `scripts/rollback.sh`

```bash
#!/usr/bin/env bash
set -euo pipefail
cd /opt/phychem-trainer
TARGET=${1:?用法: rollback.sh <上一个版本tag>}

docker image inspect "phychem-trainer:$TARGET" >/dev/null 2>&1 \
  || { echo "镜像 phychem-trainer:$TARGET 不存在，中止"; exit 1; }

cp .env ".env.bak.$(date +%Y%m%d-%H%M%S)"
sed -i "s|^APP_IMAGE=.*|APP_IMAGE=phychem-trainer:$TARGET|" .env
sed -i "s|^APP_VERSION=.*|APP_VERSION=$TARGET|" .env

docker compose -p phychem-trainer up -d --no-deps app

for i in $(seq 1 20); do
  code=$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:8088/api/health || true)
  [ "$code" = "200" ] && { echo "回滚成功 → $TARGET"; exit 0; }
  sleep 3
done
echo "回滚后健康检查未通过，请查看 logs app"; exit 1
```

用法：

```bash
/opt/phychem-trainer/scripts/rollback.sh 1.0.0
```

### 14.3 数据库回滚边界（规则 21）

- 本阶段 schema 冻结，**不含破坏性变更**，回滚镜像即可，无需动库；
- 若确需回库：停 app → `pg_restore` 覆盖**本项目**数据库 → 启 app；**执行前必须先快照**；
- 严禁：`DROP DATABASE`、`TRUNCATE`、对现有业务库的任何写入。

### 14.4 完全撤离（最坏情况）

```bash
cd /opt/phychem-trainer
docker compose -p phychem-trainer down            # 只停本项目容器与网络
docker volume rm phychem-trainer_pgdata           # 仅在确认要丢弃数据时
cd / && rm -rf /opt/phychem-trainer
```
> 现有业务容器、网络、卷、Nginx 配置全程不受影响。

---

## 15. 时间线

| 时段 | 动作 | 参与 |
|---|---|---|
| T0 | 阶段 0 本地修复 + 验证 | 我 |
| T0+1h | 你确认 5 项决策（报告第七节） | 你 |
| T1 | 阶段 1 预检 → 出实测报告 | 我（需 SSH 授权） |
| T2 | 阶段 2 备份 + 你创建快照 | 我 + 你 |
| T3 | 阶段 3 构建推送 | 我 / CI |
| T4 | 阶段 4–6 部署到 8088 并本机验证 | 我 |
| T5 | 阶段 7 你放行安全组 | 你 |
| T6 | 阶段 8 双系统验收 | 我 + 你 |
| T7 | 阶段 9–10 备份、版本、回滚演练与交付报告 | 我 |

---

## 16. 执行前必须得到的 3 个授权

1. **SSH 只读授权** —— 允许我登录执行阶段 1（只读命令）；
2. **变更授权** —— 阶段 2–6（备份、目录创建、容器启动）；
3. **端口放行确认** —— 阶段 7 由你在控制台完成。

未取得对应授权前，我停在当前阶段，不会继续。

---

*本计划与《部署前检查报告》配套使用。任何与规则冲突的现场情况，以「不触碰现有业务」为最高优先级，就地停止并报告。*
