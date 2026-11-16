# Deployment — 部署指南

## 1. 本地开发

见根目录 `README.md`。要点：
- 依赖：`D:\pgdata_physchem\` 下的 PostgreSQL 18.6。
- DATABASE_URL：`postgresql://postgres@127.0.0.1:55433/physchem_v1?schema=public`
- 因环境子进程回收约束，数据库操作用 `scripts/db-migrate.sh` 一键"启停+迁移"。

## 2. 生产部署（V1 上线前必须完成）

### 2.1 数据库

- 使用正式安装的 PostgreSQL（建议 16/17 LTS），**不再使用本地 trust**。
- 创建专用角色与库，强密码，仅允许应用主机连接。
- 开启 SSL 连接；每日 `pg_dump` 备份并异地保存。
- 应用连接串从环境变量注入，禁止硬编码。

### 2.2 应用（Docker）

```bash
docker compose up -d --build
```

- Next.js standalone 构建，非 root 用户运行。
- Nginx 反向代理 + HTTPS（Let's Encrypt 或自有证书）。
- 环境变量见 `.env.example`，密钥由部署平台注入。

### 2.3 安全清单

- [ ] HTTPS 强制跳转
- [ ] 密码 bcrypt 哈希，日志无明文密码/密钥
- [ ] 服务端密钥环境变量化
- [ ] 每日数据库备份
- [ ] STUDENT / ADMIN 权限隔离，Admin 端点保护
- [ ] 未成年人数据最小化，不采集身份证/精确地址/生物信息

## 3. 监控

- 记录 AI 调用（模型/Prompt 版本/token/延迟/状态）到 `AIInteractionLog`。
- 应用日志结构化，错误不泄漏敏感信息。
- 关键告警：数据库连接失败、AI 连续降级、迁移失败。

## 4. 上线策略

第 5-7 个工作日形成最小闭环后即可让 3 名学生试用，随后按 Phase 迭代。**不要等完整 V1 才试用。**
