# 初中物理化学 AI 自适应训练系统 V1.0

面向 3 名九年级学生 + 1 名管理员的自适应训练系统。核心闭环：诊断 → 缺口 → 微知识 → 分步训练 → 递进提示 → 变式 → 独立通关 → 错因 → 间隔复测 → 周测 → 动态调整。

> 当前状态：**Phase 0 + Phase 1**（架构设计 + 项目初始化 + 用户体系与登录）。业务训练功能按 Phase 逐步交付。
> 完整规格见 `docs/PRODUCT_SPEC_V1.md`，架构见 `docs/ARCHITECTURE.md`。

---

## 技术栈

Next.js 15 (App Router) · TypeScript strict · Tailwind CSS · PostgreSQL · Prisma · bcryptjs · Zod · KaTeX · Vitest

## 目录结构

见 `docs/ARCHITECTURE.md` 第 2 节。

---

## 本地启动

### 环境要求

- Node.js 22+、npm 10+
- PostgreSQL（本地已配置独立实例，见下）

### 数据库（本地开发）

本项目的 PostgreSQL 18.6 位于 `D:\pgdata_physchem\`，独立端口 **55433**，库 `physchem_v1`，本地 trust 认证（仅 127.0.0.1）。**不与机器上其他 PG 实例共享数据。**

> 注意：当前开发环境在工具调用结束时会回收子进程，数据库无法长期常驻。迁移/seed 使用一键脚本：

```bash
# 安装依赖
npm install

# 生成 Prisma Client
npm run prisma:generate

# 一键：启动PG → 执行迁移 → 停止PG
bash scripts/db-migrate.sh "npx prisma migrate dev --name init"

# 按以下顺序 seed（均可重复执行，幂等）：
# 1) 基础：3 学生 + 1 管理员 + 合作小组 + 示例知识树 + 2 道测试题
bash scripts/db-migrate.sh "npm run prisma:seed"
# 2) 完整知识体系：物理 117 节点 / 化学 74 节点 / 108 微技能 / 54 前置依赖
bash scripts/db-migrate.sh "npm run prisma:seed:knowledge"
# 3) 题库：物理 121 题 / 化学 101 题
bash scripts/db-migrate.sh "npx tsx prisma/seed-questions.ts"
# 4) 成就定义：6 个正向成就
bash scripts/db-migrate.sh "npm run prisma:seed:achievements"

# 启动应用（需数据库在线；本环境可在同一会话内先 db-start.sh）
bash scripts/db-start.sh
npm run dev
```

访问 http://localhost:3000

### 验证与测试

```bash
npm run typecheck        # 类型检查
npm test                 # 单元测试（22 项：掌握度/调度/复测/判分）
# 数据层验收（需 DB）：
bash scripts/db-migrate.sh "npx tsx scripts/verify-phase1.ts"          # Phase1 验收 8/8
bash scripts/db-migrate.sh "npx tsx scripts/verify-training.ts"        # 训练引擎 14/14
bash scripts/db-migrate.sh "npx tsx scripts/verify-scheduler.ts"       # 调度器 13/13
bash scripts/db-migrate.sh "npx tsx scripts/verify-ai-assessment.ts"   # AI+测验 10/10
# E2E 闭环与并发（需先启动 PG + npm run start，见 scripts/e2e-http.mjs）
node scripts/e2e-http.mjs          # 28/28
node scripts/verify-concurrency.mjs # 8/8
```

### 账号（seed 生成）

| 角色 | 用户名 | 密码 | 说明 |
|---|---|---|---|
| 管理员 | `admin` | `Admin@2026` | 管理后台 |
| 学生 | `liyuhan` | `123456` | 真实学生账号 |
| 学生 | `xule` | `123456` | 真实学生账号 |
| 学生 | `qinjn` | `123456` | 真实学生账号 |
| 学生 | `student1`~`student3` | `Student@2026` | 自动化测试账号（E2E/并发） |

> 生产环境必须修改默认密码（尤其 `123456`）。

### 题库内容（严格对齐开发文档）

- **覆盖**：物理 65 个 + 化学 43 个 K 级知识节点，全部有题（100%）；共 300+ 题（物理 183 / 化学 124）。
- **分层**：每节点按「原型题(L1)→轻变式(L2)→情境变式(L3)」组织；32 个变式组含≥2 题，另有 76 道独立情境题。
- **规范**：每题含分步骤解析（考点→分析→运算→结论→规范答案）、递进 Hint1/2/3 + 完整解析 L4、错因标签（28 个：13 通用 + 7 物理 + 8 化学）。
- **学习闭环**：支撑诊断→微知识→分步训练→递进提示→变式训练→独立通关→错因分析→间隔复测→周测→动态调整。
- 内容源文件：`prisma/question-bank-v2.ts`、`prisma/question-bank-v2-ext.ts`；seed：`npm run prisma:seed:bank-v2`。

---

## 文档索引

| 文档 | 内容 |
|---|---|
| `docs/PRODUCT_SPEC_V1.md` | 冻结产品规格 |
| `docs/ARCHITECTURE.md` | 架构、目录、路由、API、任务依赖、冲突自检 |
| `docs/DATABASE.md` | 数据库设计与约束 |
| `docs/KNOWLEDGE_MODEL.md` | 知识编码规则与覆盖清单 |
| `docs/ALGORITHM.md` | Mastery / 调度 / 复测算法 |
| `docs/API.md` | API 约定 |
| `docs/DEPLOYMENT.md` | 部署指南 |
| `docs/DECISIONS.md` | 技术决策记录 |
| `docs/BACKLOG.md` | 范围外需求 |
| `docs/CHANGELOG.md` | 变更日志 |

---

## 开发优先级

学习效果 > 内容正确性 > 学习闭环 > 数据准确性 > 使用体验 > 功能数量 > 视觉复杂度
