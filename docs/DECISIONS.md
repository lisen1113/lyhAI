# DECISIONS — 技术决策记录

> 记录所有偏离规格之处、规格冲突、以及低风险技术决策。按时间倒序。

---

## D-012 ｜ 热身题重复的修复与选题策略

- **问题**：用户测试发现热身题一直重复。根因是调度器固定 `orderBy createdAt asc` 取前2题且从不排除已作答题。
- **决策**：选题改为「排除学生全部历史已作答 + 基于 studentId+日期的确定性哈希轮换 + 整份计划内 used 集合去重」。确定性（非随机）保证同日幂等、跨天必轮换。复测段恒定存在（无到期项时补一道主科变式题），保证六段结构固定。
- **验证**：跨4天计划热身题 8/8 全部不同。

## D-013 ｜ 题库内容重建策略

- **问题**：旧题库 56% 为同骨架换数字题，物理 92 个节点零题，222 题无错因标签、解析不分步骤。
- **决策**：①新建 V2 高质量题库（情境题、分步骤解析、递进Hint、错因），覆盖全部 108 个 K 级节点；②保留旧变式题（文档要求变式训练/高优先级技能8-12题，同技能骨架相似是设计使然），批量补错因标签与规范解析；③软删除 3 道逐字重复题。
- **理由**：直接删除旧题会导致题量跌破文档底线（物理120/化学100）；变式题本身有训练价值，缺的是标注规范性。
- **验证**：物理183/化学124题，108节点全覆盖，307题解析/Hint/错因覆盖100%。

## D-014 ｜ 学生账号按用户指定设置

- **决策**：真实学生账号 liyuhan/xule/qinjn，密码统一 123456（用户指定，便于学生手机/平板登录）；测试账号 student1-3 保留供自动化。seed 改为 update 时重置密码，保证可重现。
- **风险**：123456 为弱密码，已记入 CHANGELOG/BACKLOG，生产必须修改。

## D-009 ｜ 并发提交幂等：捕获 P2002 回退读取

- **背景**：并发测试发现同一幂等键并发提交 5 次时出现 500，且产生 2 条 attempt。根因是 `(studentId, questionId, sessionId)` 与 `idempotencyKey` 两个唯一约束在并发下触发 P2002，事务内 `findUnique` 二次检查无法阻止竞态。
- **决策**：在 `submitAttempt` 事务外层捕获 `PrismaClientKnownRequestError`（code=P2002），回退读取已由对方请求创建的 attempt，返回幂等结果（`created=false, alreadySubmitted=true`）。
- **验证**：修复后并发测试 8/8 通过，5 次并发提交只产生 1 条 attempt，全部返回 200。
- **状态**：已执行并验证。

## D-010 ｜ 未登录 API 返回 401 JSON 而非重定向

- **背景**：E2E 测试发现未登录访问 `/api/student/plan` 被 middleware 307 重定向到 HTML 登录页，导致前端 fetch 拿不到 JSON。
- **决策**：middleware 对 `/api/*` 未登录请求返回 401 JSON；仅页面路由做 307 重定向。精细角色校验仍在服务端。
- **验证**：E2E 28/28 通过。
- **状态**：已执行并验证。

## D-011 ｜ npm audit 漏洞暂不强制升级

- **背景**：`npm audit` 报告 16 个漏洞（2 critical、5 high），全部需破坏性大版本升级（next 16、zod 4、vitest 5、katex 0.19）才能修复。
- **决策**：V1 内网小规模使用场景下，暂不强制升级以避免破坏性风险引入 BUG；已执行 `npm audit fix`（非破坏性部分）。生产上线前应评估升级（记入 BACKLOG）。关键缓解：密钥环境变量化、HTTPS、权限隔离、输入 Zod 校验。
- **状态**：待生产上线前处理。

## D-001 ｜ 本地数据库采用独立 PostgreSQL 实例（非 winget 安装）

- **背景**：指令要求 PostgreSQL + Prisma。本机未安装 PostgreSQL CLI，但存在另一项目 `yiheit.net` 的 embedded PostgreSQL 18.6（端口 55432）。winget 安装需 UAC 交互，非交互环境无法完成。
- **决策**：复制同一套 PG 18.6 二进制到 `D:\pgdata_physchem\`，初始化独立 data 目录，独立端口 **55433**，数据库名 `physchem_v1`，本地 `trust` 认证（仅监听 127.0.0.1）。不复用另一项目实例，保证数据隔离。
- **理由**：满足指令技术栈、避免重复安装、避免数据流混用。精简包无 psql，日常迁移由 Prisma 完成，`physchem_v1` 库已通过单用户模式创建。
- **影响**：生产环境必须改用正式安装的 PostgreSQL + 密码认证 + HTTPS（见 DEPLOYMENT.md）。本地 trust 仅限开发。
- **状态**：已执行。

## D-002 ｜ 工具调用结束时子进程被回收——数据库按需启停

- **背景**：本环境每个 bash/PowerShell 工具调用结束时，其启动的子进程会被沙箱回收，PG 无法跨调用常驻。
- **决策**：所有需要数据库的操作通过 `scripts/db-migrate.sh` 在**同一条命令内**完成"启动 PG → 执行 prisma/seed → 停止 PG"。生产 Docker 部署无此约束。
- **影响**：本地开发不能依赖长期运行的 DB 服务；应用运行时需保持 DB 启动（开发时手动 `db-start.sh`，注意会话边界）。
- **状态**：已执行。

## D-003 ｜ 中文路径导致 PG 编码错误——数据目录用英文路径

- **背景**：项目路径含中文，initdb 在 post-bootstrap 阶段报 `无效的 UTF8 编码字节顺序`，系中文路径经 cygpath 传给 PG 时的编码问题。
- **决策**：数据库二进制与 data 目录统一放在纯英文路径 `D:\pgdata_physchem\`。项目代码仍留在中文项目目录，Prisma 通过 `DATABASE_URL` 连接，不受影响。
- **状态**：已执行。

## D-004 ｜ Prisma 版本选择

- **背景**：PG 18 较新。
- **决策**：使用 Prisma 5.22+/6.x（支持 PG 18 协议）。若 `prisma migrate` 出现兼容问题，降级到 PG 17（winget 可用）并记录。
- **状态**：待 Phase 0 验证。

## D-005 ｜ Phase 1 提前创建知识体系结构表

- **背景**：Phase 1 seed 需要"基础 KnowledgeTree 可读取"作为完成标准。
- **决策**：在 Phase 1 一并创建 Subject/KnowledgeNode/KnowledgePrerequisite/MicroSkill 表（属 Phase 2 范畴），但管理 UI 与完整知识内容填充留到 Phase 2。
- **理由**：满足 Phase 1 完成标准，避免后续重建表结构。不提前开发业务逻辑，符合"不提前大规模开发后续 Phase"。
- **状态**：已执行。

## D-006 ｜ 认证方案：自定义 Session + bcryptjs

- **背景**：V1 仅 3+1 用户，无需引入 NextAuth 等重型方案。
- **决策**：自实现 session 表 + HttpOnly Cookie + bcryptjs 哈希，middleware + API 双重角色校验。
- **理由**：精简、可控、满足权限隔离与数据最小化。
- **状态**：待 Phase 1 实施。
