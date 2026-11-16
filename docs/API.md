# API Design — REST / Route Handlers

> 详细路由表见 ARCHITECTURE.md 第 4 节。本文补充通用约定。

## 通用约定

- 前缀 `/api`，JSON 请求/响应。
- 写操作需 `Idempotency-Key` 请求头（防重复提交重复加分）。
- 所有入参经 Zod 校验，失败返回 400 + 字段错误。
- 鉴权失败 401；角色不符 403；资源不存在 404。
- 时间字段统一 ISO 8601（UTC，后缀 Z）；前端转 Asia/Shanghai 展示。
- 分页：`?page=&pageSize=`。

## 响应格式

```json
// 成功
{ "data": { ... }, "meta": { ... } }
// 失败
{ "error": { "code": "VALIDATION_ERROR", "message": "...", "details": [...] } }
```

## Phase 1 落地接口

### POST /api/auth/login
请求：`{ "username": "string", "password": "string" }`
响应：`{ "data": { "user": { "id", "username", "displayName", "role" } } }` + Set-Cookie（HttpOnly Session）
失败：401 `INVALID_CREDENTIALS`

### POST /api/auth/logout
清除 Session Cookie。响应 200。

### GET /api/auth/me
响应：`{ "data": { "user": {...}, "profile": {...} | null } }`。未登录 401。

## 后续 Phase 接口（规划，不提前实现）

见 ARCHITECTURE.md 4.2/4.3。每个接口随对应 Phase 实现时补充本文。
