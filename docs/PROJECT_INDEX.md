# MOODY Music Archiv V2 - Project Index

> Auto-generated: 2026-04-15 (Asia/Shanghai)
> Scope: 当前 workspace 的代码与配置

## 1. 项目定位

MOODY V2 是一个纯 Worker 架构的音乐归档与播放系统：

- Backend/API：Cloudflare Worker (`Hono`) + D1 + R2
- Frontend：静态 HTML/CSS/JS（player + admin）
- Hosting：Docker + Nginx 托管静态资源，业务 API 全部由 Worker 处理

## 2. 运行拓扑

1. Browser 先从 Docker Nginx 获取 player/admin 静态页面。
2. Frontend 发起 `/api/*` 与 `/storage/*` 请求。
3. Nginx 将这些请求 proxy 到 Cloudflare Worker。
4. Worker 负责读写 D1 metadata 与 R2 object。

## 3. 仓库结构（核心）

```text
Music-Archiv-V2/
|- cloudflare-worker/                 # API 与核心业务逻辑
|  |- src/
|  |  |- index.ts                     # 主路由入口（music/admin/debug）
|  |  |- auth.ts                      # Auth 与 roster 路由
|  |  |- upload.ts                    # Upload 与匹配逻辑
|  |  `- types.ts                     # Worker bindings 类型定义
|  |- migrations/                     # D1 migration 文件
|  |  |- 001_create_user_profiles.sql
|  |  `- 002_create_roster_system.sql
|  |- wrangler.toml                   # Worker bindings/routes/vars
|  `- api_auth_v2.md                  # Mobile Auth 接入文档
|- frontend/
|  |- index.html                      # Player 入口页
|  |- admin/
|  |  |- index.html                   # Admin 入口页
|  |  |- admin.js                     # Admin 主逻辑
|  |  |- album-manager.js             # 专辑管理逻辑
|  |  `- admin.css
|  `- src/
|     |- js/
|     |  |- app.js                    # App 主流程
|     |  |- player.js                 # 播放器行为
|     |  |- user_system.js            # 用户系统前端逻辑
|     |  `- ...
|     `- css/
|        |- style.css                 # 主样式
|        `- user_system.css
|- .github/workflows/
|  |- deploy.yml
|  |- keep-supabase-alive.yml
|  `- ...
|- docs/
|  |- API.md
|  |- PROJECT_INDEX.md                # 当前文件
|  |- API_INDEX.md
|  `- DEV_INDEX.md
`- Dockerfile                         # Nginx 运行镜像定义
```

## 4. 关键入口文件

- Worker 启动入口：`cloudflare-worker/src/index.ts`
- Auth 路由注册：`cloudflare-worker/src/index.ts` 中 `registerAuthRoutes(app)`
- Upload 路由注册：`cloudflare-worker/src/index.ts` 中 `registerUploadRoutes(app)`
- Frontend 播放器入口：`frontend/index.html`
- Frontend 管理后台入口：`frontend/admin/index.html`
- 部署镜像入口：`Dockerfile`

## 5. Infra 与 Binding 索引

根据 `cloudflare-worker/wrangler.toml`：

- Worker name：`moody-worker`
- Main file：`src/index.ts`
- Custom domain route：`m-api.changgepd.top`
- D1 binding：`DB` -> `moody-d1-test`
- R2 binding：`BUCKET` -> `moody-music-asset`
- Env vars：`SUPABASE_URL`、`SUPABASE_ANON_KEY`、`SUPABASE_SERVICE_KEY`

## 6. 数据模型速览

代码与文档中核心 table：

- `artists`
- `albums`
- `songs`
- `user_profiles`
- `student_roster`
- `security_questions`
- `claim_tokens`

## 7. 建议阅读顺序

1. `README.md`（项目背景与部署说明）
2. `cloudflare-worker/src/index.ts`（API 全局入口）
3. `cloudflare-worker/src/auth.ts`（Auth 与 Admin 权限逻辑）
4. `cloudflare-worker/src/upload.ts`（Upload 匹配流水线）
5. `docs/API_INDEX.md`（Route 速查）
6. `docs/DEV_INDEX.md`（命令与 runbook）
