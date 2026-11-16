# CHANGELOG

所有重要变更按时间倒序记录。格式： `[日期] 阶段 — 变更摘要`。

---

## [2026-11-16] V1.2 题库补齐至 119/119 技能可独立出题

**起因**：专项训练要求「5 题同一技能 + 2 道独立通关题」全部落在一个微技能上，判据是 L2≥3 且 L3≥3。此前 119 个技能中只有 2 个满足，绝大多数技能仅有 L1 各 1 题，导致「学的是重力、练的是摩擦力」——知识与训练对不上，闭环失效。

**Changed Files**

新增题库文件（共 547 题）：
- `question-bank-v12-physics.ts`(30) / `v12-chemistry.ts`(35)：13 个新增考点各补 5 题
- `question-bank-v13-electricity.ts`(65)：电学 13 个技能
- `question-bank-v14-mechanics.ts`(50) / `v14-optics-heat.ts`(20)：力学与光热 14 个技能
- `question-bank-v15-chem-a/b/c.ts`(31/35/30)：化学 M01–M13 加厚
- `question-bank-v16-chem.ts`(72)：化学收尾 14 个技能
- `question-bank-v17-chem.ts`(14)：11 个「只差 1 道 L2」的技能精准补齐
- `question-bank-v18-physics-a.ts`(50)：物理 10 个技能
- `question-bank-v19-physics-b/c.ts`(25/30)：物理最后 11 个技能
- `question-bank-v20-physics-d/e.ts`(32/28)：物理最后 15 个技能收尾

新增/改造校验脚本：
- `scripts/progress.ts`：按「变式密度」输出达标率与逐技能缺口，是补题的唯一依据
- `scripts/check-duplicate-stem.ts`：逐字重复题干门禁
- `scripts/check-near-duplicate.ts`：二元字组 Jaccard 相似度找「同句式换场景」的近似重复，带刻意练习豁免名单
- `scripts/sync-variant-level.ts`：以源文件 `tier` 为唯一事实来源回填 `variantLevel`（v2 seed 不写该字段，重建题目会退回 L1）
- `scripts/backfill-microskill.ts`：v2/v3 seed 建题只写 knowledgeLinks，需按主知识点 code + `-S01` 回填 `microSkillId`
- `scripts/reset-student-data.ts`：把学生恢复为未开始状态（演示前复位 / 清理验证残留）
- `scripts/show-question.ts`：按微技能列出全部题目，补题前查重用

**内容质量修正**

- 7 道题因与同技能其他题「同句式只换场景」而改写提问角度：噪声（PQ9-001/PQ2-012）、温度计（PQ5-029）、分子动理论（PQ3-013）、二力平衡（PQ3-007）、连通器（PQ3-009）、CO₂ 验满（CQ15-049）
- 修正自相矛盾的解析：PQ14-059（视力表平面镜题，答案与解析单位混乱）、CQ15-095（铁粉样品数据超出总质量）
- 错因标签 `PHY_PRESSURE` 不存在，4 道压强题改用 `PHY_FORCE`

**验收脚本隔离（重要）**

- `verify-learning-loop.ts` 会**清空目标学生的全部数据**再验证。此前它直接跑在 `liyuhan` 账号上，会抹掉孩子真实进度。现统一改用 `__verify` 专用账号（`scripts/lib-verify-student.ts`），并从管理员界面的学生列表过滤掉
- 踩坑记录：不能用 `username startsWith "__"` 过滤，SQL 的 LIKE 里 `_` 是单字符通配符，`__%` 会把所有学生都排除。改为按 id 精确排除（`src/lib/services/admin.ts` 的 `listRealStudents`）
- `verify-phase1.ts` 校验的是旧密码 `Student@2026`，已改为当前密码
- `e2e-http.mjs` 的管理员账号由 `admin` 改为实际使用的 `lisen`，学生端改用 `__verify`，支持 `BASE_URL` 环境变量

**Database Changes**

- 题库 464 → **1011 题**（物理 588 / 化学 423）
- 变式层级：L1 254 / L2 374 / L3 383
- 达标技能（L2≥3 且 L3≥3）：2/119 → **119/119（100%）**，物理 70/70、化学 49/49
- 每个技能都能在自身范围内出满「专项 5 题 + 独立 2 题」，不再跨技能串题

**Test Results**

| 项目 | 结果 |
|---|---|
| `audit-content.ts`（内容审计 9 节） | 全部通过 |
| `verify-answers.ts`（答案自洽） | 1011/1011 |
| `check-duplicate-stem.ts` | 无逐字重复 |
| `check-near-duplicate.ts` | 无近似重复（26 组经豁免） |
| `verify-learning-loop.ts`（学习闭环） | 33/33 |
| `verify-scheduler.ts` | 13/13 |
| `verify-training.ts` | 14/14 |
| `verify-ai-assessment.ts` | 10/10 |
| `verify-phase1.ts` | 8/8 |
| `vitest run` | 26/26 |
| `e2e-http.mjs` | 28/28 |
| 学生端 5 个页面 | 全部 200 |
| `tsc --noEmit` / `next build` | 通过 |

---

## [2026-11-16] V1.1 内容与调度修正 — 三轮校验通过

**起因**：用户测试发现热身题重复，要求核对题库/知识体系，强调"不是demo"，需按学习闭环与沪科版教材重建，反复校验3次。

**Changed Files**
- `src/lib/services/scheduler.ts`：选题改为排除历史已作答 + 日期确定性轮换 + 计划内去重；复测段恒定存在（无到期补变式题）
- `src/app/api/student/plan/route.ts`：新增 POST 强制重生成今日计划
- `prisma/question-bank-v2.ts` / `question-bank-v2-ext.ts`：新建 88 道高质量情境题（分步骤解析/Hint/错因）
- `prisma/seed-question-bank-v2.ts` / `seed-error-tags.ts` / `enhance-legacy-questions.ts` / `dedupe-stems.ts`：新题库落库与旧题增强/去重
- `prisma/seed.ts`：新增真实账号 liyuhan/xule/qinjn（123456），密码可被 seed 重置
- `docs/SPEC_COMPLIANCE.md`：开发文档逐条对照检查表

**Database Changes**
- 题库重建：物理 183 / 化学 124 题（共 307），K 级节点 108/108 全覆盖
- 全部题目补齐分步骤解析 + 递进 Hint + 错因标签（覆盖率 100%）
- 错因标签扩至 28 个（13 通用 + 7 物理 + 8 化学）
- 账号：+3 真实学生；软删除 3 道逐字重复题

**Test Results（三轮）**
- 第1轮 数据层审计：节点覆盖 100%、307 题全规范、0 逐字重复 ✓
- 第2轮 学习闭环：16/16（六段/跨天热身8/8不同/Hint/掌握度/错因/幂等/复测）✓
- 第3轮 文档对照 + 端到端：build OK、E2E 28/28（真实账号登录）、并发 8/8 ✓

**Known Issues**：npm audit 16 项需大版本升级（D-011），内网试用暂缓；生产需改弱密码+正式PG+HTTPS。

---

## [2026-11-16] Phase 1 架构设计 — 初版

- 完成并保存架构设计全套文档：ARCHITECTURE / DATABASE / KNOWLEDGE_MODEL / ALGORITHM / API / PRODUCT_SPEC / DEPLOYMENT / DECISIONS / BACKLOG。
- 完成完整 Prisma Schema（25+ 实体，UUID / UTC / 配置化 / 软删除 / 审计日志 / 防重复）。
- 定义知识节点编码规则与物理（21 Module）+ 化学（13 Module）覆盖清单。
- 定义 Mastery / 30 分钟调度 / 间隔复测三大算法与单测要求。
- 完成冲突自检（6 项全部通过），结论：架构无内部冲突，进入 Phase 0/1。
- 决策记录：D-001~D-006（本地独立 PG 实例、按需启停、英文路径、Prisma 版本、Phase1 提前建知识表、认证方案）。

## [2026-11-16] Phase 2–12 全部完成 — 已验证

按用户要求继续推进至任务计划完成，逐 Phase 实现并验证。

- **Phase 2 知识体系**：完整编码物理 117 节点 + 化学 74 节点（共 193 节点、108 MicroSkill、54 前置依赖）；Admin 知识树 UI（搜索/学科筛选）。
- **Phase 3 题库**：物理 121 题 + 化学 101 题（达标 120/100）；参数化变式生成器（数值/选择/判断/填空，自动判分）；CRUD/筛选/审核流转/CSV 两阶段导入；Admin 题库 UI。
- **Phase 4+5 训练引擎与掌握度**：PracticeSession/Attempt/Step、判分、逐级 Hint、Solution、断点恢复；掌握度更新（事务+幂等+MasteryChangeLog 审计）；独立率/提示依赖/封顶逻辑；错因记录与重复预警。验收 14/14。
- **Phase 6+7 复测与调度**：ReviewSchedule 状态机（1/3/7/14/30、Hint 缩短、错误次日、两次失败回退）；DailyPlan 六段调度器（Priority 公式、25-35min 约束、主科交替、动态难度）。验收 13/13。
- **Phase 8+9 AI 与测验**：AI Provider/Adapter 抽象、Prompt 版本、AIInteractionLog、失败 fallback 到固定 Hint（训练不中断）；诊断/周测创建、判分、Mastery 初始化、结果分析。验收 10/10。
- **Phase 10+11 完整 UI**：学生端今日训练六段答题流程（KaTeX 公式、递进 Hint、中性反馈）、知识地图星级、成长记录、到期复测、诊断周测；Admin Dashboard 指标、学生详情热力图/趋势/错因、知识/题库/测验/周报/设置。
- **Phase 12 测试与部署**：单元测试 22/22；E2E 完整闭环 28/28；并发测试 8/8（三人同时训练 + 幂等）；修复两个真实 BUG（并发 P2002 幂等、未登录 API 401）；成就系统（6 个正向成就）。
- 判分逻辑、掌握度、调度器、复测算法均有单元测试；核心流程有 E2E 与验收脚本。
- 遗留：npm audit 16 个漏洞需破坏性升级（记入 DECISIONS D-011 / BACKLOG），生产上线前处理。

## [2026-11-16] Phase 0 + Phase 1 完成 — 已验证

- 项目初始化完成：Next.js 15.5 + TS strict + Tailwind + Prisma 6.19 + ESLint/Prettier + Docker + 全套配置。
- 数据库：首次 Migration `20261116070740_init` 应用成功；seed 完成（admin + student1/2/3 + 知识树 + 2 测试题 + 错因标签 + 合作小组）。
- 用户体系：User/Session/StudentProfile/StudyGroup 等模型；bcrypt 密码哈希；HttpOnly Session Cookie；middleware + 服务端双重角色隔离。
- 页面：登录页、学生端布局+今日训练入口、管理端布局+总览（可见3学生）+学生详情、其余占位页。
- 算法纯函数：mastery / review / scheduler（对应架构文档），单元测试 17 项全部通过。
- 验证结果：
  - `prisma validate` 通过；`prisma migrate dev` 成功；seed 成功。
  - `npm run build` 成功（18 路由，类型检查通过）。
  - Phase 1 数据层验收 8/8 通过。
  - 端到端：管理员/学生登录 200，错误密码 401，/me 会话 200，未登录 401，未登录访问 /admin 307 跳转登录。
- 已知问题：本地 PG 因环境子进程回收无法常驻，需通过 scripts/db-migrate.sh 按需启停（见 DECISIONS D-002）。npm audit 提示依赖存在告警（后续升级处理）。

## [2026-11-16] Phase 0 环境准备

- 项目落址 `D:\李语涵学习助手开发\物理化学AI自适应训练系统V1\`。
- 初始化本地 PostgreSQL 18.6 独立实例：端口 55433，库 `physchem_v1`，本地 trust 认证。
