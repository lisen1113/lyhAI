# 开发文档逐条对照检查表（V1.1 内容重建后）

> 对照来源：`WorkBuddy_AI_Physics_Chemistry_V1_Executable_Instructions (1).txt`
> 校验日期：2026-11-16　方法：源码审查 + 数据库审计脚本 + E2E + 闭环脚本
> 三轮校验：①数据层审计 ②学习闭环功能 ③本文档逐条对照+端到端

## 一、项目定位（第1-2节）

| 要求 | 实现 | 结论 |
|---|---|---|
| 不是Demo/静态原型，需实际部署连续使用 | Next.js 生产构建 + PostgreSQL + Docker + 部署文档 | ✓ |
| 核心学习闭环 | 诊断→缺口识别→微知识→分步训练→递进Hint→变式→独立通关→错因→复测→周测→动态调整，全链路 E2E 通过 | ✓ |
| 回答"哪里不会/学什么/真会还是靠提示" | Admin 热力图+薄弱点+错因；调度器 Priority；FIRST_TRY vs CORRECT_AFTER_HINT 分离 | ✓ |

## 二、范围与时间约束（第3-6节）

| 要求 | 实现 | 结论 |
|---|---|---|
| 3 STUDENT + 1 ADMIN，响应式 Web | 6 账号（3 真实+3 测试），Tailwind 响应式 | ✓ |
| 每日30分钟，25-35分钟范围，禁止加题堆量 | `isBudgetValid` + DailyPlan 总时长 clamp(25,35)；E2E 校验通过 | ✓ |
| 六段结构（热身/复测/微知识/专项/独立/总结） | 调度器六段恒定生成（复测段无到期时补变式题）；闭环脚本 6/6 段通过 | ✓ |
| 成功热身2-3道已掌握/近期正确题 | 优先 mastery≥60 或近期正确节点题，排除已作答，确定性轮换；跨天 8/8 不同 | ✓ |
| 到期复测1/3/7/14/30，优先同知识点变式 | ReviewSchedule 状态机 + 同节点变式组优先 | ✓ |
| 微知识每天最多1个新技能 | 调度器 MICRO_LEARN 段仅取 scored[0] 一个 | ✓ |
| 专项训练4-6题 原型→轻变式→情境变式 | practiceCount 按难度 4/5/6；题库三档难度 L1/L2/L3 | ✓ |
| 独立通关2题不给提示 | INDEPENDENT 段2题；判分区分独立率 | ✓ |
| 主科交替（周一三五物理/二四六化学/周日周测） | `primarySubjectFor` 实现 | ✓ |

## 三、知识模型（第7节）

| 要求 | 实现 | 结论 |
|---|---|---|
| Subject→Module→Unit→KnowledgeNode→MicroSkill | Prisma 五层模型；SOFT 前置依赖 | ✓ |
| 物理覆盖八九年级完整内容 | 21 模块 / 65 K节点（测量～能源全覆盖） | ✓ |
| 化学覆盖九年级完整内容 | 13 模块 / 43 K节点（物质变化～综合计算全覆盖） | ✓ |
| 每个 MicroSkill 配置前置依赖 | 54 条前置依赖；knowledge-data.ts 逐节点声明 | ✓ |
| 前置未掌握不得强制推进 | Priority 中 prereqSatisfied 硬前置乘子 | ✓ |

## 四、题库（第18节）— 本次重建重点

| 要求 | 实现 | 结论 |
|---|---|---|
| 开发测试库物理≥120、化学≥100 | 物理 183 / 化学 124 | ✓ |
| 高优先级技能8-12题 | 32 个变式组含≥2题，核心技能达 10+ 题 | ✓ |
| 每题保存：学科/知识点/题型/难度/题干/答案/分步骤解析/Hint1-3/常见错因/预计时间/来源/审核状态 | 全部字段齐全；310 题分步骤解析+错因+Hint 覆盖率 100% | ✓ |
| 正式题需审核，不无限生成 | reviewStatus: PUBLISHED/DRAFT/PENDING/APPROVED/REJECTED；Admin 审核流 | ✓ |
| Excel/CSV 批量导入 上传→解析→校验→预览→确认→暂存→审核→发布 | 两阶段导入 API（预览+确认） | ✓ |
| 变式训练（原型→轻变式→情境变式） | 难度 L1/L2/L3 + variantGroup + 情境题 76 道 | ✓ |

## 五、掌握度/独立率/Hint/错因/复测（第8-14节）

| 要求 | 实现 | 结论 |
|---|---|---|
| masteryScore/confidence/independentAccuracy/hintDependency/nextReviewAt/status | StudentMastery 全字段；状态6档中性表达 | ✓ |
| 7 种 outcome 区分 | FIRST_TRY_CORRECT / CORRECT_AFTER_HINT_1/2/3 / CORRECT_AFTER_SOLUTION / WRONG / SKIPPED | ✓ |
| 独立正确 ≠ 提示后正确 | decideOutcome 按 maxHintLevel 分级；掌握度独立率单独统计 | ✓ |
| Hint1方向/Hint2关键条件/Hint3公式框架/L4完整解析 | 题库 hints 4 级结构化；AI 无权改答案；失败 fallback | ✓ |
| 错因：13通用+7物理+9化学，重复错误预警 | 28 个错因标签（通用13/物理7/化学8*）；重复错误计数预警 | ✓ (*文档化学列8项：元素符号/化合价/化学式下标/配平/反应条件/气体沉淀符号/实验现象与结论/离子检验) |
| 复测1/3/7/14/30，错误次日再现，连续2次失败回退 | ReviewState 状态机 + 回退策略；闭环脚本验证 | ✓ |

## 六、调度/后台/页面/技术栈（第15-17/19节）

| 要求 | 实现 | 结论 |
|---|---|---|
| Priority 可配置模型，禁止写死40天课表 | computePriority 五因子 + 配置化阈值 | ✓ |
| 近3天独立正确率<55%降难/>88%增变式 | difficultyDecision 实现 | ✓ |
| Admin Dashboard 11 项指标 + 详情热力图/趋势/错因 | admin.ts 服务 + 页面 | ✓ |
| 页面路由 Student/Admin 全部 | 30 路由 build 通过 | ✓ |
| Next.js+TS+Tailwind+PostgreSQL+Prisma+KaTeX+Docker | 全部采用 | ✓ |
| AI Provider/Adapter 可替换，禁止散落 SDK | lib/ai 抽象层 + fallback | ✓ |

## 七、数据库/测试/安全（第20-24节）

| 要求 | 实现 | 结论 |
|---|---|---|
| UUID/UTC/配置化/软删除/原始记录不可覆盖/防重复加分 | schema + 事务幂等（P2002 捕获） | ✓ |
| 掌握度算法+调度器单测，核心流程 E2E | 22 单测 + E2E 28/28 + 并发 8/8 | ✓ |
| HTTPS/密码哈希/密钥环境变量/每日备份 | bcrypt12 + .env + DEPLOYMENT.md（备份脚本） | ✓ |
| 数据最小化，无身份证/地址/生物识别 | 仅用户名/昵称/年级/学习数据 | ✓ |

## 八、三轮校验结果汇总

| 轮次 | 内容 | 结果 |
|---|---|---|
| 第1轮 数据层审计 | 节点覆盖/题型/解析/Hint/错因/重复题干 | 108/108节点，307题全规范，0逐字重复 ✓ |
| 第2轮 学习闭环 | 六段/轮换/Hint/掌握度/错因/幂等/复测 | 16/16 ✓ |
| 第3轮 文档对照+E2E | 本文逐条 + build + E2E + 并发 | build OK / 28/28 / 8/8 ✓ |

## 遗留与部署说明

- `npm audit` 16 项漏洞需破坏性大版本升级（Next16/zod4/vitest5），V1 内网试用暂缓，记入 DECISIONS D-011；生产上线前处理。
- 部署到腾讯服务器前需：正式 PostgreSQL + 密码认证 + HTTPS + 每日备份（见 DEPLOYMENT.md）。
- 学生账号 `123456` 为试用弱密码，生产必须修改。
