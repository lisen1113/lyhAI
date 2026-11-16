# Algorithms — 掌握度 / 调度 / 复测

> 本文描述三个核心算法。所有阈值、权重、周期均从 `SystemConfig` 读取，禁止写死。
> 对应纯函数位于 `src/lib/algorithms/`，必须有单元测试。

---

## 1. 掌握度模型（Mastery）

### 1.1 数据字段（Student × MicroSkill）

| 字段 | 范围 | 含义 |
|---|---|---|
| `masteryScore` | 0-100 | 综合掌握度 |
| `confidenceScore` | 0-100 | 置信度（样本越多越高） |
| `independentAccuracy` | 0-100 | 首次独立正确率 |
| `hintDependency` | 0-100 | 提示依赖度 |
| `lastPracticedAt` | datetime | 最近练习时间 |
| `nextReviewAt` | datetime | 下次复测时间 |
| `status` | enum | 掌握状态 |

### 1.2 状态分档

| 分数 | status | 学生端表达（中性/积极） |
|---|---|---|
| 0-19 | NOT_STARTED | 未开始 |
| 20-39 | INTRO | 初次接触 |
| 40-59 | LEARNING | 正在学习 |
| 60-74 | BASIC | 基础掌握 |
| 75-89 | PROFICIENT | 熟练掌握 |
| 90-100 | STABLE | 稳定掌握 |

> 学生端永不显示数字分数，只显示状态表达与"技能星级"；管理员端显示真实数值。

### 1.3 单次 Attempt 对 Mastery 的更新

记一次作答结果 `a`，其类型与"能力贡献值" `delta` 映射（配置化）：

| AttemptOutcome | delta | 说明 |
|---|---|---|
| FIRST_TRY_CORRECT | +C1（默认 +8） | 首次独立正确，贡献最大 |
| CORRECT_AFTER_HINT_1 | +C2（默认 +4） | 轻提示后正确 |
| CORRECT_AFTER_HINT_2 | +C3（默认 +2） | 中提示后正确 |
| CORRECT_AFTER_HINT_3 | +C4（默认 +1） | 强提示后正确 |
| CORRECT_AFTER_SOLUTION | 0 | 看解析后正确，不加掌握分 |
| WRONG | -D1（默认 -6） | 错误 |
| SKIPPED | -D2（默认 -2） | 跳过 |

**更新公式**：

```
masteryScore' = clamp(masteryScore + delta × confidenceWeight, 0, 100)
confidenceWeight = clamp(sampleCount / K, 0.2, 1)      // K 默认 5
```

- 样本少时单次影响被压缩，避免抖动；样本多时按完整 delta 调整。
- **独立率**：`independentAccuracy = 首次独立正确次数 / 有效作答次数 × 100`（滑动窗口，默认最近 20 次）。
- **提示依赖**：`hintDependency = 使用提示的作答次数 / 有效作答次数 × 100`（滑动窗口，同 20 次）。
- **buffering**：masteryScore 上升后若 independentAccuracy 低于阈值（默认 60），实际 status 封顶为 BASIC，防止"靠提示刷高掌握度"。

### 1.4 防重复更新（关键）

- `QuestionAttempt` 有唯一约束 `(studentId, questionId, sessionId)`。
- API 接收 `Idempotency-Key`，服务端去重；同一 attempt 只触发一次 Mastery 更新。
- Mastery 更新与 Attempt 写入在**同一数据库事务**内完成。
- 每次更新写一条 `MasteryChangeLog`（旧值、新值、原因、attemptId），可审计、可回溯。

---

## 2. 30 分钟 DailyPlan 调度器

### 2.1 时间预算（配置化，默认）

| 段 | 默认分钟 | 范围 |
|---|---|---|
| 1 成功热身 | 3 | 2-4 |
| 2 到期复测 | 5 | 3-7 |
| 3 微知识学习 | 5 | 4-6（每天最多 1 个新 MicroSkill） |
| 4 专项训练 | 12 | 10-14（4-6 题，原型→轻变式→情境变式） |
| 5 独立通关 | 4 | 3-5（2 题，不给提示） |
| 6 今日总结 | 1 | 1 |
| **合计** | **30** | **目标 25-35，硬约束上限 35** |

### 2.2 主科交替

- 默认：周一/三/五物理，周二/四/六化学，周日周测或薄弱专项。
- 主科 24-27 分钟，非主科仅 3-6 分钟记忆卡/到期复测。
- 主科安排可通过 `SystemConfig.subjectSchedule` 覆盖。

### 2.3 优先级公式

```
Priority = ExamWeight × KnowledgeGap × Repairability × ReviewUrgency × ConfidenceFactor
```

| 因子 | 计算 | 范围 |
|---|---|---|
| `ExamWeight` | 节点考试重要度（seed 配置） | 0.5-1.0 |
| `KnowledgeGap` | 1 - masteryScore/100 | 0-1 |
| `Repairability` | 节点可修复度（seed 配置） | 0.5-1.0 |
| `ReviewUrgency` | 到期复测紧迫度：到期日越近越大，逾期 >1 | 0.5-2.0 |
| `ConfidenceFactor` | 1 - hintDependency/200 + (低置信加权) | 0.6-1.2 |

- 前置知识硬依赖未满足时，`Priority *= 0.3`（降权，引导回退到前置）。
- 近 3 天首次独立正确率 < 55% → 全局难度系数下调一档；> 88% → 增加变式比例。
- 整体成功体验目标 65%-80%（通过难度系数动态调节实现）。

### 2.4 生成流程

```
1. 确定今日主科/副科
2. 收集候选：到期复测项 + 未掌握 MicroSkill + 微弱前置
3. 逐项计算 Priority，降序排列
4. 按六段时间预算依次填充：
   - 热身：从 masteryScore≥75 且近期正确项中选 2-3 题
   - 复测：取到期项，超过时长则按 Priority 截断，余量顺延次日
   - 微知识：取 Priority 最高且前置满足的 1 个新 MicroSkill
   - 专项训练：围绕该 MicroSkill 选 4-6 题（原型→变式）
   - 独立通关：选 2 道同知识点变式题（不给提示）
   - 总结：汇总 + 反馈收集
5. 校验总时长 ∈ [25,35]；若超限，从低优先级段削减
6. 持久化 DailyPlan + DailyPlanItem
```

### 2.5 极端情况处理

| 情况 | 处理 |
|---|---|
| 无任何到期复测 | 复测段并入专项训练，时长重新分配 |
| 学生连续多日未练 | 热身段改为已掌握题快速回顾，不新增 MicroSkill |
| 候选 MicroSkill 前置全不满足 | 回退到最低层前置微知识，不强行推进 |
| 题目不足 | 减少题量但保持 six-stage 结构，不凑数、不加时 |
| 疲劳反馈"有点难"连续 2 次 | 次日降低难度系数，减少变式 |

### 2.6 选题池与变式密度约束（决定闭环是否成立）

**变式层级 `variantLevel`（与难度 `difficulty` 是两个维度）**

| 层级 | 含义 | 作用 |
|---|---|---|
| L1 原型 | 直接套用定义/公式的标准题 | 建立模型，专项第一题必为原型 |
| L2 轻变式 | 换条件、换问法，模型不变 | 检验是否真的理解而非背题 |
| L3 情境变式 | 真实情境包装，需要自己建模 | 迁移应用，独立通关主用 |

**选题池规则**

1. 排除 `isTemplate=true` 的「换数字」模板题（仅当 mastery≥80 的熟练层才启用）
2. 排除该学生已作答过的题（避免重复）
3. 专项训练内按变式阶梯推进，层级不回落：L1 → L2 → L3
4. 独立通关 2 题必须 ≥L2，且与专项训练不重题
5. 全部题目限定在**同一个 microSkill** 内（学什么练什么）

**密度约束推导**

一次完整训练对单个技能的题目需求是：

```
专项训练 5 题 = L1×1 + L2×2 + L3×2
独立通关 2 题 = L2/L3（不得与专项重复）
─────────────────────────────
合计需要：L2 ≥ 3 且 L3 ≥ 3
```

达不到这个密度，调度器就只能跨技能串题——出现「学了重力、练的是摩擦力」，
学生感知到的是"今天的课和刚才讲的没关系"，闭环从根上断裂。
因此**每个微技能都必须满足 L2≥3 且 L3≥3**。

**校验方式**

```bash
npx tsx scripts/progress.ts              # 逐技能列缺口，达标率必须 119/119
npx tsx scripts/check-duplicate-stem.ts  # 逐字重复题干
npx tsx scripts/check-near-duplicate.ts  # 同句式换场景的近似重复
```

`check-near-duplicate.ts` 带豁免名单：相对分子质量计算、化学方程式配平等技能的题目
本身就是「同一算法 + 不同输入」的刻意练习，题干相似属设计意图。

---

## 3. 间隔复测（Review）

### 3.1 默认周期

`1 / 3 / 7 / 14 / 30` 天（配置化 `SystemConfig.reviewIntervals`）。

### 3.2 状态机

每个 `ReviewSchedule` 维护 `stage`（0-4，对应 5 个周期）与 `nextReviewAt`。

```
作答结果 → 更新：
├─ FIRST_TRY_CORRECT（独立正确）
│    → stage += 1，nextReviewAt = now + intervals[stage]
├─ CORRECT_AFTER_HINT_1
│    → stage += 1（进入下一阶段），但提高优先级标记（boost=true）
├─ CORRECT_AFTER_HINT_2 / HINT_3
│    → 缩短下次周期：nextReviewAt = now + intervals[stage] × shrinkFactor（默认 0.5）
├─ WRONG / SKIPPED
│    → 次日复测：nextReviewAt = now + 1 day，连续失败计数 +1
└─ 连续 2 次失败
     → 回退：stage = 0，强制回到微知识卡 + 基础题（remedial=true）
```

- 复测优先使用**同知识点的变式题**（通过 QuestionKnowledge 关联 + 变式标记筛选）。
- `boost` 为真的项在调度器中 `ReviewUrgency` 上调。
- 所有变更写入 `ReviewSchedule` 并记录到 MasteryChangeLog（原因：review）。

### 3.3 与其他模块的关系

- Review 结果 → 更新 Mastery（复用第 1 节公式）。
- ReviewSchedule 到期项 → 进入 DailyPlan 第 2 段。
- 连续失败回退 → DailyPlan 第 3 段强制为 remedial 微知识。

---

## 4. 单元测试要求（强制）

| 测试文件 | 覆盖点 |
|---|---|
| `tests/unit/mastery.test.ts` | delta 映射、clamp、confidenceWeight、封顶逻辑、独立率/提示依赖滑动窗口 |
| `tests/unit/scheduler.test.ts` | Priority 公式、六段时间预算、25-35min 约束、主科交替、极端情况 |
| `tests/unit/review.test.ts` | 5 阶段升级、Hint 缩短、错误次日、连续两次失败回退 |

> Phase 1 先建立测试框架与占位，Phase 5-7 补齐完整用例。
