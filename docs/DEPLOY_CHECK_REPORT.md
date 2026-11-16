# 部署前检查报告

**项目**：初中物理化学 AI 自适应训练系统 V1.0
**目标服务器**：腾讯云轻量应用服务器　`lhins-izb6ll7s`（surface-advisor-shanghai，上海四区）
**公网 IP**：123.207.183.23　**已有生产业务**：surfacedmp.com
**报告时间**：2026-11-16 20:50
**检查范围**：应用侧（本地实测，已完成）＋ 服务器侧（只读检查清单，**未执行**）
**执行状态**：未登录服务器、未做任何变更、未部署

---

## 一、结论摘要

> **当前状态：不具备直接部署条件。**
> 发现 **8 项 P0 阻断缺陷**，其中 3 项属于「照现有配置一执行就必然失败」，必须先修复本地代码与配置。
> 另有 5 项属于服务器侧未知量（内存/磁盘/端口/快照/构建通道），需授权后只读核查。

| 维度 | 结论 |
|---|---|
| 应用功能完整性 | ✅ 通过（119/119 知识点达标，1011 题，闭环验证 33/33） |
| 代码层网络规范（规则 10） | ✅ 通过 —— 全库 **0 处**硬编码 IP / 绝对 URL |
| 数据库迁移状态 | ✅ 干净，3 个迁移，`Database schema is up to date`，无漂移 |
| 容器化配置 | ❌ 不满足 —— 现有 `Dockerfile` / `docker-compose.yml` 是开发基线，7 处不合规 |
| 生产可用性（登录） | ❌ 不满足 —— Cookie `secure` 强制导致 HTTP 下无法保持登录 |
| 健康检查接口（规则 16） | ❌ 不存在 `/api/health` |
| 服务器资源余量（规则 15） | ⏳ 未知，需授权后只读检查 |
| 构建通道（规则 12） | ⏳ 未定 —— **本机没有安装 Docker** |

---

## 二、检查方法

1. **应用侧静态审计**：逐一读取 `Dockerfile`、`docker-compose.yml`、`next.config.mjs`、`.env.example`、`src/lib/auth/session.ts`、`src/middleware.ts`、`prisma/schema.prisma`、全部 seed 与迁移文件。
2. **实测验证**：`prisma migrate status`、`next build` 产物结构、API 路由清单、`grep` 全库硬编码地址、Cookie 属性。
3. **服务器侧**：**未登录**。本报告仅给出只读检查命令与判定阈值，供获得授权后执行。

---

## 三、P0 阻断缺陷（必须先修）

### P0-1　`next.config.mjs` 缺少 `output: "standalone"`

**证据**

```js
const nextConfig = {
  distDir: process.env.NEXT_DIST_DIR || ".next",
};
```

```
$ ls -d .next-build/standalone
NO standalone 目录
```

**后果**：`Dockerfile` 第 19 行 `COPY --from=builder /app/.next/standalone ./` 找不到源目录，**镜像构建必然失败**。这是第一个"一跑就挂"的点。

**修复**：`nextConfig` 增加 `output: "standalone"`。

---

### P0-2　`public/` 目录不存在

**证据**

```
$ ls public
（空 / 目录不存在）
```

**后果**：`Dockerfile` 第 18 行 `COPY --from=builder /app/public ./public` 失败，构建中断。

**修复**：创建 `public/` 并放至少一个占位文件（如 `favicon.svg`），确保目录被纳入构建上下文。

---

### P0-3　缺少 `.dockerignore`

**证据**：项目根目录无 `.dockerignore`，而 `Dockerfile` 第 11 行是 `COPY . .`。

**后果（安全 + 效率双重）**

- `.env`（含本地数据库连接串）会被打进构建上下文，可能残留在镜像层缓存中，**密钥泄漏风险**；
- `node_modules`（数百 MB）、`.next`、`.next-stale-*`（47 MB）、`.git` 全部上传，构建极慢；
- 若本地 Windows 的 `node_modules` 被复制进 Linux 构建，可能引入平台相关的错误文件。

**修复**：新增 `.dockerignore`，排除 `node_modules`、`.next*`、`.git`、`.env*`、`docs`、`scripts`、`tests` 等。

---

### P0-4　生产环境 Cookie 强制 `secure`，HTTP 访问下登录必然失效

**证据**（`src/lib/auth/session.ts:23-32`）

```ts
store.set(SESSION_COOKIE, token, {
  httpOnly: true,
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",   // ← 问题在这
  path: "/",
  maxAge: SESSION_TTL_DAYS * 24 * 60 * 60,
});
```

**后果**：容器内 `NODE_ENV=production`，而规则 8 要求通过 `http://123.207.183.23:8088` 访问（**纯 HTTP，无 TLS**）。浏览器会拒绝保存带 `Secure` 属性的 Cookie，表现为：**输入账号密码后"登录成功"但立刻退回登录页**，且没有任何报错提示——最容易被误判为"部署失败"。

**修复**：改为由环境变量显式控制，默认关闭：

```ts
secure: process.env.COOKIE_SECURE === "true",
```

本阶段 `.env` 中设 `COOKIE_SECURE=false`；将来挂 HTTPS 时改 `true` 即可，无需改代码。

---

### P0-5　`/api/health` 健康检查接口不存在

**证据**

```
$ ls src/app/api/health
NO /api/health

$ find src/app/api -name route.ts
/admin/assessments  /admin/knowledge  /admin/questions  /admin/questions/import
/auth/login  /auth/logout  /auth/me
/student/assessment  /student/attempt  /student/attempt/error  /student/explain
/student/mastery  /student/plan  /student/plan/learn  /student/question
/student/review  /student/session  /student/session/[sessionId]
```

**后果**：规则 16 要求"启动后先通过 `127.0.0.1:8088/api/health` 验证"，当前无此接口，验证步骤无法执行；`docker healthcheck` 也失去依据。

**修复**：新增 `src/app/api/health/route.ts`，返回应用状态 + 数据库连通性（`SELECT 1`），正常 200 / 异常 503，且**不得**回显连接串。中间件 matcher 未覆盖 `/api`，该路由天然免鉴权，无需额外放行。

---

### P0-6　现有 `docker-compose.yml` 内含 nginx，会与 surfacedmp.com 抢 80/443

**证据**

```yaml
  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
```

**后果**：若直接沿用该文件，`docker compose up` 会尝试绑定主机 80/443。现有生产站已占用 → 启动失败；更糟的情况是引发**现有站点中断**。这直接违反规则 1、2、3。

**修复**：生产 compose **删除整个 nginx 服务**（第一阶段不改 Nginx，按规则 8 直连 8088）。

---

### P0-7　`prisma/seed.ts` 账号与密码全部过时，且缺少 `lisen`

**证据**（`prisma/seed.ts`）

```ts
const adminHash = await bcrypt.hash("Admin@2026", 12);
// admin: username "admin", 密码 Admin@2026
const students = [
  { username: "liyuhan", displayName: "李语涵", password: "123456" },
  { username: "xule",    displayName: "xule",   password: "123456" },
  { username: "qinjn",   displayName: "qinjn",  password: "123456" },
  { username: "student1", ... "Student@2026" },   // 多余测试账号
  { username: "student2", ... },
  { username: "student3", ... },
];
```

**后果**：生产库若执行 `npm run prisma:seed`，会得到：密码 `123456`、管理员叫 `admin`、**`lisen` 根本不存在**、`xule`/`qinjn` 显示名是英文用户名、外加 3 个多余账号。与《使用说明》完全不符，三个孩子无法用 `123456` 登录。

**修复**：新建 `prisma/seed-production.ts`（幂等），只创建 1 管理员 + 3 学生，密码从环境变量 `SEED_PASSWORD` 读取，显示名为中文；**不创建** `student1-3`。数据类 seed（知识树 / 错因标签 / 题库 / 成就）沿用现有脚本。

---

### P0-8　`DATABASE_URL` 主库版本与容器不一致（会埋下后期迁移隐患）

**证据**：本地开发为 PostgreSQL **18.6**；`docker-compose.yml` 使用 `postgres:17-alpine`。

**后果**：本次部署建议**全新初始化**（三个孩子数据为空，无需数据搬迁），因此不涉及 dump 跨版本恢复。但版本不一致会在后续升级、扩展、`pg_upgrade` 时造成困扰。

**修复**：统一为 `postgres:18-alpine`（与开发一致），首次拉取后按 digest 固定版本。

---

## 四、规则逐条合规对照（22 条）

| # | 规则 | 当前状态 | 需要做什么 | 责任方 |
|---|---|---|---|---|
| 1 | 不动 surfacedmp.com 代码/数据库/容器/卷/网络/环境变量 | ⚠️ 现配置会抢 80/443 | 删 nginx；独立项目名/网络/卷；只读备份 | 我方 |
| 2 | 不停/重启/重建现有容器 | ⚠️ 依赖操作纪律 | 所有命令带 `-p phychem-trainer`；禁止裸 `docker compose down` | 我方 |
| 3 | 第一阶段不改 Nginx | ✅ 不涉及 | 全程不读写 `/etc/nginx` | 我方 |
| 4 | 只部署在 `/opt/phychem-trainer` | ✅ 规划如此 | 目录结构见计划书 | 我方 |
| 5 | 独立 Compose 项目名 `phychem-trainer` | ❌ 无 `name` 字段 | compose 顶部加 `name: phychem-trainer` | 我方 |
| 6 | 独立 PG 容器/用户/库/卷 | ⚠️ 部分满足 | 容器 `phychem-db`、用户 `physchem`、库 `physchem_v1`、卷 `phychem-trainer_pgdata` | 我方 |
| 7 | 5432 不得映射公网 | ⚠️ 现映射 `127.0.0.1:55433` | 生产**不映射任何端口** | 我方 |
| 8 | 临时经 `123.207.183.23:8088` 访问 | ⏳ 待放行 | 安全组放行 8088（需你确认） | 你 + 我方 |
| 9 | 容器内 3000，主机 8088:3000 | ❌ 现为 `3000:3000` | 改 `8088:3000` | 我方 |
| 10 | 相对路径、不硬编码公网 IP | ✅ **实测 0 处** | 无需改动 | — |
| 11 | CPU/内存/日志限制 | ❌ 完全没有 | 加 `mem_limit`/`cpus`/`logging` | 我方 |
| 12 | 外部构建，服务器只拉取运行 | ❌ 本机无 Docker | **需你决定构建通道** | 你 |
| 13 | 部署前健康/资源/端口检查 | ⏳ 命令已备 | 授权后只读执行 | 我方 |
| 14 | 备份现有业务 + 创建快照 | ⏳ 未做 | 只读备份 + 控制台快照 | 你 + 我方 |
| 15 | 内存<1.5G / 磁盘<15G / 8088 占用 → 停止 | ⏳ 未知 | 硬性 Gate，见计划书 | 我方 |
| 16 | 先 127.0.0.1:8088 验证，再放行端口 | ❌ 接口缺失 | 先补健康接口，再按序验证 | 我方 |
| 17 | 失败只删本项目资源 | ✅ 已设计失败矩阵 | 禁止 `system prune -a`、禁止 `down --volumes` | 我方 |
| 18 | 每日备份，保留≥14 天 | ⏳ 未配置 | cron + `-mtime +14` | 我方 |
| 19 | 明确版本号 + 一键回滚 | ⏳ 未建立 | 镜像 tag `1.0.0` + `rollback.sh` | 我方 |
| 20 | 双系统同时验证 | ⏳ 未执行 | 阶段 8 双验收 | 我方 |
| 21 | 不执行不可逆数据库操作 | ✅ 无 DROP / 无覆盖恢复 | 迁移仅新增；恢复演练不做真实覆盖 | 我方 |
| 22 | 当前只出报告与计划 | ✅ **本报告即为此产物** | 等待明确授权 | — |

---

## 五、风险清单（非阻断，但需知情）

| 级别 | 风险 | 说明与缓解 |
|---|---|---|
| P1 | Prisma 引擎未随 standalone 打包 | Next standalone 有时漏掉 `node_modules/.prisma/client/*.node`，容器启动报 "Query engine not found"。缓解：构建后校验该目录存在；缺失则加 `outputFileTracingIncludes`。 |
| P1 | 构建阶段无数据库 | `next build` 若触发静态预渲染中的 DB 查询会失败。现状 14 个页面中多数 `force-dynamic`，风险较低。缓解：构建时注入假 `DATABASE_URL`，并检查构建日志无 DB 报错。 |
| P1 | 首次 `init.sql` 与 Prisma 迁移状态脱节 | 若采用"SQL 初始化"方案，`_prisma_migrations` 表不存在，日后 `migrate deploy` 会重复执行。缓解：V1 冻结 schema；升级时改用镜像内迁移或手工记录。 |
| P2 | 服务器为 2C2G 或更小 | 现有业务 + 新系统可能吃紧。缓解：按实测空闲内存分级设定限额（见计划书），必要时只跑 app 不跑 db（改用已有 PG 不可行，须独立）。 |
| P2 | 安全组放行 8088 后暴露公网 | 无 TLS、无 WAF。缓解：本阶段仅临时访问，后续挂 Nginx 反代 + 证书。 |
| P2 | 时区 | 容器统一 `TZ=Asia/Shanghai`，PG 另设 `PGTZ`，避免"今日计划"按 UTC 跨日算错。 |

---

## 六、服务器侧待检查清单（只读，需授权后执行）

> 以下命令**全部只读**，不创建、不修改、不删除任何资源。执行前请确认授权。

### 6.1 系统与 Docker 基线

```bash
uname -a; cat /etc/os-release | head -3; timedatectl | head -6
docker version --format '{{.Server.Version}}'
docker compose version
docker ps --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}'
docker network ls; docker volume ls; docker system df
```

### 6.2 资源余量（规则 15 判定依据）

```bash
free -m                 # 关注 MemAvailable
df -h / /opt /var       # 关注 /opt 可用空间
nproc; cat /proc/loadavg; uptime
df -i /opt              # inode 是否耗尽
```

### 6.3 端口占用

```bash
sudo ss -lntp | grep -E ':(8088|3000|5432|80|443)\b' || echo "以上端口均空闲"
```

### 6.4 现有业务健康（部署前基线）

```bash
curl -sS -o /dev/null -w 'https:%{http_code} time:%{time_total}s\n' https://surfacedmp.com/
curl -sS -o /dev/null -w 'http:%{http_code}\n' http://surfacedmp.com/
docker inspect --format '{{.Name}} restarts={{.RestartCount}} health={{if .State.Health}}{{.State.Health.Status}}{{else}}n/a{{end}}' $(docker ps -q)
```

### 6.5 判定阈值（任一不满足 → **停止部署并报告**）

| 检查项 | 通过条件 | 不通过动作 |
|---|---|---|
| 可用内存 | `MemAvailable` ≥ **1500 MB** | 停止，报告实际值 |
| `/opt` 可用磁盘 | ≥ **15 GB** | 停止，报告实际值 |
| 8088 端口 | 未被监听 | 停止，报告占用进程 |
| surfacedmp.com | HTTP 状态 200/301/302 | 停止（先处理现有故障） |
| Docker + Compose V2 | 均可用 | 停止，报告版本 |
| 现有容器重启次数 | 记录基线值即可 | 部署后需对比不变 |

---

## 七、待你决策的 5 件事

| # | 事项 | 选项 | 影响 |
|---|---|---|---|
| 1 | **镜像构建通道**（本机无 Docker） | A. 腾讯云容器镜像服务 TCR，外部构建后推送<br>B. 你提供一台有 Docker 的机器，`docker save` + scp<br>C. 服务器上构建（**违反规则 12**，不建议） | 决定阶段 3 全部步骤 |
| 2 | 镜像仓库地址与命名空间 | 例：`ccr.ccs.tencentyun.com/<命名空间>/phychem-trainer` | 决定 `.env` 的 `APP_IMAGE` |
| 3 | 服务器快照方式 | A. 你在控制台手动创建（推荐）<br>B. 提供 `tccli` 密钥由我执行 | 规则 14 硬性要求 |
| 4 | 数据库初始化方案 | A. `db-init/001_schema.sql` 首启自动建表（服务器无需 prisma CLI，镜像更小）<br>B. 镜像内附带 prisma CLI 执行 `migrate deploy`（更标准，镜像更大） | 决定镜像内容 |
| 5 | 学生初始密码 | 沿用 `123456`，或改为更强的初始密码（首次登录强制修改需额外开发，V1 未实现） | 决定 seed 参数 |

---

## 八、实测证据汇总

| 检查 | 命令 | 结果 |
|---|---|---|
| 迁移状态 | `npx prisma migrate status` | 3 migrations，`Database schema is up to date!` |
| 硬编码地址 | `grep -rn "localhost\|127.0.0.1\|123.207\|http://" src/` | **无输出**（0 处） |
| 绝对 URL fetch | `grep -rn 'fetch("http' src/` | **无输出**（全相对路径） |
| standalone 产物 | `ls -d .next-build/standalone` | 不存在（确认 P0-1） |
| health 路由 | `ls src/app/api/health` | 不存在（确认 P0-5） |
| public 目录 | `ls public` | 空/不存在（确认 P0-2） |
| dockerignore | `ls .dockerignore` | 不存在（确认 P0-3） |
| 本地 Docker | `docker --version` | `command not found`（阻断构建通道） |
| 题库达标 | `npx tsx scripts/progress.ts` | 1011 题，119/119 达标 100% |

---

## 九、下一步

1. 你确认第七节 5 项决策；
2. 我按计划书阶段 0 修复 8 个 P0（全部在本地代码，**不触碰服务器**）；
3. 你授权只读检查 → 我执行第六节清单并出实测数据；
4. 资源、端口、业务健康全部通过后，再申请执行备份、快照与部署。

**在获得明确授权前，我不会登录服务器、不会执行任何部署动作。**

---

*报告人：AI 开发助手　｜　核对方式：本地实跑 + 静态审计　｜　未覆盖项：服务器侧全部指标（待授权）*
