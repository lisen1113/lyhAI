# Database Design — PostgreSQL + Prisma

> 完整 Schema 见 `prisma/schema.prisma`。本文说明设计决策与约束。

---

## 1. 通用约定

- **主键**：全部 UUID（`uuid()`），由数据库/应用生成，便于未来扩容与合并。
- **时间**：存储 UTC（`DateTime @default(now())`）；前端按 Asia/Shanghai 展示。
- **软删除**：Question 使用 `deletedAt`，不物理删除。其他实体按需。
- **不可覆盖**：QuestionAttempt / AttemptStep / AttemptHint 一旦写入不可更新（应用层不提供 update）。
- **可审计**：Mastery 变更写 `MasteryChangeLog`。
- **多租户预留**：核心表带 `tenantId`（默认 `default`），当前单租户，未来扩容无需改表。
- **防重复**：QuestionAttempt 对 `(studentId, questionId, sessionId)` 唯一；API 层 Idempotency-Key。

---

## 2. 实体清单（25 个）

### 身份与组织
| 实体 | 说明 |
|---|---|
| User | 用户（STUDENT/ADMIN），用户名密码哈希，角色 |
| StudentProfile | 学生档案（年级、目标分数、一模日期、学习偏好） |
| StudyGroup | 学习小组（合作目标，非排名） |
| StudentGroup | 学生与小组多对多 |

### 知识体系
| 实体 | 说明 |
|---|---|
| Subject | 学科（PH/CH） |
| KnowledgeNode | 知识节点（五级结构的统一表，含 code/层级/类型） |
| KnowledgePrerequisite | 前置依赖（HARD/SOFT） |
| MicroSkill | 微技能（挂在 KnowledgeNode 下，含情境/概念/公式/坑/例题） |

### 题库
| 实体 | 说明 |
|---|---|
| Question | 题目（题型/难度/题干/图片/答案/解析/预计时间/来源/审核状态/软删除） |
| QuestionKnowledge | 题目↔知识点映射（主/次） |
| QuestionHint | 三级固定 Hint + Level4 解析 |
| ErrorTag | 错因标签（通用 + 物理 + 化学） |
| QuestionErrorTag | 题目↔常见错因 |

### 训练与作答
| 实体 | 说明 |
|---|---|
| DailyPlan | 每日计划（日期、学生、主科、总时长、状态） |
| DailyPlanItem | 计划项（段类型、时长、题目/微技能、顺序） |
| PracticeSession | 训练会话（开始/结束、断点、状态） |
| QuestionAttempt | 作答记录（outcome 枚举、时间、幂等键）— **不可覆盖** |
| AttemptStep | 分步作答明细 |
| AttemptHint | 提示使用明细（第几级、时间） |
| StudentError | 学生错因记录（用于重复错误预警） |

### 掌握与复测
| 实体 | 说明 |
|---|---|
| StudentMastery | 学生×MicroSkill 的掌握度各字段 |
| MasteryChangeLog | 掌握度变更审计日志 |
| ReviewSchedule | 间隔复测状态机 |

### 测验与报告
| 实体 | 说明 |
|---|---|
| Assessment | 诊断/周测 |
| AssessmentQuestion | 测验↔题目 |
| AssessmentAttempt | 测验作答 |
| WeeklyReport | 周报 |

### AI 与系统
| 实体 | 说明 |
|---|---|
| Achievement | 成就定义 |
| StudentAchievement | 学生已获成就 |
| AIInteractionLog | AI 调用日志（模型/Prompt版本/输入输出/token/延迟/状态） |
| SystemConfig | 系统参数（阈值/权重/周期，全部配置化） |

---

## 3. 关键约束

1. **用户名唯一**：`User.username @unique`。
2. **角色隔离**： middleware + API 双重校验；学生不能访问 `/admin/*`，管理员不参与日常训练。
3. **Attempt 幂等**：`@@unique([studentId, questionId, sessionId])`。
4. **Mastery 唯一**：`@@unique([studentId, microSkillId])`。
5. **Review 唯一**：`@@unique([studentId, microSkillId])`。
6. **知识编码唯一**：`KnowledgeNode.code @unique`，`MicroSkill.code @unique`。
7. **枚举**：角色、outcome、状态、段类型、审核状态、错因类别等用 Prisma enum。
8. **级联**：删除 User 级联其 Profile/Mastery/Attempt（但生产不删用户，用状态禁用）。

---

## 4. 数据最小化（未成年人）

- 不采集身份证、精确家庭地址、生物识别。
- StudentProfile 仅存年级、化名/昵称、目标、一模日期、偏好。
- 密码用 bcryptjs 哈希，日志不记录明文密码/密钥。
- 生产强制 HTTPS，密钥仅从环境变量加载，每日数据库备份，权限隔离。
