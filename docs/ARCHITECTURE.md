# V1 Architecture — 初中物理化学 AI 自适应训练系统

> 版本：1.0 ｜ 状态：Phase 0 基线 ｜ 最后更新：2026-11-16
> 本文件是系统技术架构的唯一事实源。任何与本文冲突的实现都必须先在 `DECISIONS.md` 记录并修订本文。

---

## 1. 架构总览

### 1.1 技术栈（冻结）

| 层次 | 选型 | 说明 |
|---|---|---|
| 框架 | Next.js 15（App Router） | Route Handlers 作为 REST API，服务端渲染学生页面 |
| 语言 | TypeScript（strict） | 全链路类型安全 |
| 样式 | Tailwind CSS 3 | 响应式，Windows/Mac/iPad/手机浏览器 |
| 数据库 | PostgreSQL 18（本地 55433） | UUID 主键，UTC 存储，Asia/Shanghai 展示 |
| ORM | Prisma 5/6 | Migration 入库，Prisma Client 类型安全 |
| 公式 | KaTeX | 物理/化学公式渲染 |
| AI | Provider/Adapter 抽象层 | 业务代码零 SDK 散落，可替换 OpenAI/Azure/兼容模型 |
| 认证 | 自定义 Session + bcryptjs | 用户名密码，HttpOnly Cookie，角色隔离 |
| 校验 | Zod | API 入参/环境变量校验 |
| 测试 | Vitest（单测）+ Playwright（E2E，后续 Phase） | 掌握度算法/调度器强制单测 |
| 部署 | Docker + Nginx（生产可选） | 详见 DEPLOYMENT.md |

### 1.2 架构原则

1. **闭环优先**：诊断 → 缺口 → 微知识 → 分步训练 → 递进提示 → 变式 → 独立通关 → 错因 → 间隔复测 → 周测 → 动态调整。
2. **独立率是核心**：`FIRST_TRY_CORRECT` 与 `CORRECT_AFTER_HINT_*` 严格区分，提示后做对绝不等价于首次独立做对。
3. **配置化**：阈值、权重、复测周期、时间预算全部进 `SystemConfig`，不写死。
4. **AI 可降级**：AI 不可用时使用题目自带的固定 Hint + 标准解析，训练不中断。
5. ** protect minors**：数据最小化，学生端无排名/无负面标签，密码哈希，日志脱敏。
6. **可审计**：原始 Attempt 不可覆盖，Mastery 变更写入 `MasteryChangeLog`，防重复提交。

### 1.3 分层结构

```
┌─────────────────────────────────────────────────────┐
│  Browser (响应式: PC / iPad / Phone)                 │
└───────────────────┬─────────────────────────────────┘
                    │ HTTPS
┌───────────────────▼─────────────────────────────────┐
│  Next.js App Router                                  │
│  ├─ Pages (RSC + Client Components)                  │
│  ├─ Route Handlers (/api/*)  ← Zod 校验 + 会话鉴权    │
│  └─ Middleware (角色路由保护)                         │
├──────────────────────────────────────────────────────┤
│  Domain Services (src/lib/services)                  │
│  ├─ auth / mastery / scheduler / review / grading    │
│  ├─ attempt / errorAnalysis / assessment / ai        │
├──────────────────────────────────────────────────────┤
│  Data Access (Prisma Client) ── Repository 模式       │
├───────────────────┬─────────────────────────────────┤
│  AI Adapter Layer │  PostgreSQL 18                  │
│  (OpenAI/Azure/…) │  (UUID / UTC / RLS-ready)        │
└───────────────────┴─────────────────────────────────┘
```

---

## 2. 目录结构

```
物理化学AI自适应训练系统V1/
├── docs/                        # 工程文档（本目录）
│   ├── PRODUCT_SPEC_V1.md
│   ├── ARCHITECTURE.md
│   ├── DATABASE.md
│   ├── KNOWLEDGE_MODEL.md
│   ├── ALGORITHM.md
│   ├── API.md
│   ├── DEPLOYMENT.md
│   ├── DECISIONS.md
│   ├── BACKLOG.md
│   └── CHANGELOG.md
├── prisma/
│   ├── schema.prisma            # 完整数据模型
│   ├── migrations/              # 版本控制的迁移
│   └── seed.ts                  # 3 Student + 1 Admin + 知识树 + 测试题
├── src/
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── page.tsx             # 登录入口
│   │   ├── login/
│   │   ├── (auth)/              # 受保护路由组
│   │   │   ├── student/
│   │   │   │   ├── today/page.tsx
│   │   │   │   ├── session/[sessionId]/page.tsx
│   │   │   │   ├── knowledge/page.tsx
│   │   │   │   ├── review/page.tsx
│   │   │   │   ├── growth/page.tsx
│   │   │   │   └── assessment/page.tsx
│   │   │   └── admin/
│   │   │       ├── dashboard/page.tsx
│   │   │       ├── students/[studentId]/page.tsx
│   │   │       ├── knowledge/page.tsx
│   │   │       ├── questions/page.tsx
│   │   │       ├── assessments/page.tsx
│   │   │       ├── reports/page.tsx
│   │   │       └── settings/page.tsx
│   │   └── api/
│   │       ├── auth/[login|logout|me]
│   │       ├── student/[plan|session|attempt|mastery|review|assessment]
│   │       └── admin/[dashboard|students|knowledge|questions|settings]
│   ├── components/
│   │   ├── ui/                  # 通用原子组件
│   │   ├── student/             # 学生端组件
│   │   └── admin/               # 管理端组件
│   ├── lib/
│   │   ├── db.ts                # Prisma Client 单例
│   │   ├── auth/                # session / password / guards
│   │   ├── services/            # 领域服务
│   │   ├── ai/                  # Provider / Adapter / Prompt / fallback
│   │   ├── algorithms/          # mastery / scheduler / review（纯函数）
│   │   ├── config/              # SystemConfig 读取 + 默认阈值
│   │   └── validations/         # Zod schema
│   └── middleware.ts            # 角色路由保护
├── tests/
│   ├── unit/                    # 掌握度/调度器/复测算法
│   └── e2e/                     # 核心流程（后续 Phase）
├── scripts/
│   ├── db-start.sh              # 启动本地 PG（临时进程，本环境约束）
│   ├── db-migrate.sh            # 启动→migrate→停止 一条龙
│   └── dev-setup.sh
├── .env.example
├── .env                         # 本地密钥（不入库，gitignore）
├── .gitignore
├── package.json
├── tsconfig.json
├── tailwind.config.ts
├── postcss.config.js
├── eslint.config.mjs
├── .prettierrc
├── docker-compose.yml
├── Dockerfile
├── README.md
└── CHANGELOG.md
```

---

## 3. 页面路由

### 3.1 Student（学生端）

| 路由 | 用途 | Phase |
|---|---|---|
| `/student/today` | 今日 30 分钟训练入口与六段流程 | P1 骨架 → P10 完整 |
| `/student/session/[sessionId]` | 单次训练：答题/判分/Hint/解析 | P4/P10 |
| `/student/knowledge` | 知识地图与技能星级 | P2/P10 |
| `/student/review` | 到期复测 | P6/P10 |
| `/student/growth` | 成长记录（修复点/独立率/连续训练） | P10 |
| `/student/assessment` | 诊断与周测 | P9/P10 |

### 3.2 Admin（管理端）

| 路由 | 用途 | Phase |
|---|---|---|
| `/admin/dashboard` | 三学生结果总览 | P11 |
| `/admin/students/[studentId]` | 单学生详情：热力图/趋势/错因 | P11 |
| `/admin/knowledge` | 知识点管理 | P2 |
| `/admin/questions` | 题库 CRUD/导入/审核 | P3 |
| `/admin/assessments` | 测验管理 | P9 |
| `/admin/reports` | 周报 | P11 |
| `/admin/settings` | 系统参数配置 | P11 |

---

## 4. API 设计

统一前缀 `/api`，REST 风格，JSON 响应。所有写操作需会话鉴权 + Zod 校验 + 幂等键（`Idempotency-Key`）防重复提交。

### 4.1 认证

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/auth/login` | `{username, password}` → 设置 HttpOnly Session Cookie |
| POST | `/api/auth/logout` | 清除 Session |
| GET | `/api/auth/me` | 当前用户 + 角色 + 学生档案 |

### 4.2 学生端

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/student/plan?date=` | 获取/生成当日 DailyPlan（六段，25-35min） |
| POST | `/api/student/session` | 开始 PracticeSession |
| GET | `/api/student/session/:id` | 会话详情（含题目、状态、断点） |
| POST | `/api/student/attempt` | 提交作答（幂等），返回判分 + 是否进入 Hint |
| POST | `/api/student/attempt/:id/hint` | 请求下一级 Hint（记录 AttemptHint） |
| GET | `/api/student/mastery` | 当前学生各 Micro Skill 掌握度（中性表达） |
| GET | `/api/student/review` | 到期复测列表 |
| POST | `/api/student/assessment` | 开始诊断/周测 |

### 4.3 管理端

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/admin/dashboard` | 三学生关键指标 |
| GET | `/api/admin/students/:id` | 单学生详情 |
| GET/POST/PATCH | `/api/admin/knowledge` | 知识点 CRUD |
| GET/POST/PATCH/DELETE | `/api/admin/questions` | 题库 CRUD（软删除） |
| POST | `/api/admin/questions/import` | Excel/CSV 导入（解析→预览→暂存→审核→发布） |
| GET/PATCH | `/api/admin/settings` | 系统参数 |

> Phase 1 实际落地：auth 三接口 + 基础页面骨架。其余接口按 Phase 逐步实现，避免提前大规模开发。

---

## 5. 第一阶段任务依赖关系

```
Phase 0 项目初始化
  └─> Phase 1 用户体系与登录
        ├─> Phase 2 知识体系（Subject/KnowledgeNode/Prerequisite）
        │     └─> Phase 3 题库（Question/Hint/ErrorTag）
        │           └─> Phase 4 训练引擎（Session/Attempt/判分）
        │                 └─> Phase 5 Mastery/独立率/错因
        │                       └─> Phase 6 Review 复测
        │                             └─> Phase 7 DailyPlan 调度
        │                                   └─> Phase 9 诊断/周测
        └─> Phase 8 AI Tutor（可与 P2-P9 并行，依赖 Question/Hint）
Phase 10 Student UI（依赖 P4-P9）
Phase 11 Admin 后台（依赖 P2-P9）
Phase 12 测试/部署（贯穿，最终收敛）
```

**本轮范围**：Phase 0 + Phase 1。Phase 2 的 Subject/KnowledgeNode/Prerequisite 模型在 Phase 1 一并建表（因 seed 需要基础知识树），但管理 UI 留到 P2。

---

## 6. 数据库与运行时约束（重要）

- 本机已有一个 embedded PostgreSQL（另一项目 `yiheit.net`，端口 55432），**不复用、不共享数据**。
- 本项目数据库二进制位于 `D:\pgdata_physchem\`，独立 data 目录 `D:\pgdata_physchem\data`，独立端口 **55433**，数据库名 `physchem_v1`，本地认证为 `trust`（仅监听 127.0.0.1）。
- **环境约束**：每个工具调用结束时其启动的子进程会被回收，数据库无法跨调用常驻。故所有需要数据库的操作（migration、seed、测试）必须通过 `scripts/db-migrate.sh` 在**同一条命令内**完成"启动→执行→停止"。生产部署（Docker）无此约束。
- 精简版 PG 无 psql 客户端，数据库 `physchem_v1` 已通过单用户模式创建；日常迁移由 Prisma 完成。

---

## 7. 冲突自检结论（指令第二十六条）

| 检查项 | 结论 | 处理 |
|---|---|---|
| 数据库关系冲突 | 全部实体采用 UUID 主键、显式外键，无循环依赖；MasteryChangeLog 独立表避免覆盖 | 通过 |
| 知识模型覆盖能力 | Subject→Module→Unit→KnowledgeNode→MicroSkill 五级 + Prerequisite 表，覆盖物理 50+/化学 40+ 节点（见 KNOWLEDGE_MODEL.md） | 通过 |
| 30 分钟计划极端情况 | 六段时长可配置；当到期复测过多时限流，优先高优先级；总时长硬约束 25-35min，超出则顺延低优先级项到次日 | 通过，见 ALGORITHM.md |
| Mastery 重复更新风险 | Attempt 表唯一约束（studentId+questionId+sessionId+idempotencyKey），Mastery 变更走事务 + 变更日志 | 通过 |
| AI 故障降级 | Adapter 超时/异常 → 固定 Hint + 标准解析；AIInteractionLog 记录失败；训练主流程不依赖 AI 可用性 | 通过 |
| 未来扩容是否推翻数据库 | UUID 主键、多租户预留 `tenantId`（默认单租户）、AI Provider 抽象、配置化阈值；扩容无需改表结构 | 通过 |

**结论**：架构无内部冲突，可进入 Phase 0/1 实施。所有偏离冻结规格之处记入 DECISIONS.md。
