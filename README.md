# 🎵 MOODY — 私人音乐档案库 V2

> 专为同学录场景设计的私有音乐流媒体系统。仅限受邀成员访问，通过「座位认领」方式完成注册。

[![GitHub Actions](https://img.shields.io/github/actions/workflow/status/zhangjing02/MOODY-Music-Archiv-V2/keep-supabase-alive.yml?label=Supabase%20Keepalive&logo=supabase)](https://github.com/zhangjing02/MOODY-Music-Archiv-V2/actions)

## Data Platform Plan (2026-04)

### 1. Goals

- Keep audio assets (songs / lyrics / covers) stable and cost-efficient.
- Make business data easier to operate, query, and migrate in the future.
- Preserve production stability during transition (no big-bang rewrite).
- Keep mobile and frontend contracts stable (`code/message/data` + consistent seat code).

### 2. Current Baseline

- `Cloudflare R2`: audio/media files (large objects).
- `Cloudflare D1`: core business metadata (artists, albums, songs, roster).
- `Supabase Auth`: account identity, JWT/session lifecycle.
- `Cloudflare Worker`: unified API gateway and business orchestration.

This baseline remains valid and should not be disrupted in one shot.

### 3. Data Placement Strategy

#### 3.1 Keep In Cloudflare

- Large files: songs (`.mp3`), lyrics (`.lrc`), covers.
- Edge-hot metadata that serves playback path resolution.
- Data requiring low-latency Worker-local reads.

#### 3.2 Move/Build In Supabase

- Social domain: posts, comments, likes, reports, moderation logs.
- Optional non-playback business data needing richer SQL/admin tooling.
- Continue using Supabase as identity source.

#### 3.3 Hybrid Principle

- R2 remains file source of truth.
- Supabase is social/business source of truth (where suitable).
- D1 can remain edge cache/read model for high-frequency APIs.
- Worker remains the only public API boundary.

### 4. Seat/Roster Standard (implemented on 2026-04-22)

- Standard seat code format: `A01` ~ `H08` (64 seats).
- `/api/roster` returns full 64-seat matrix with stable order and `sort_index`.
- Account generation uses normalized seat code in username:
  `${yearCode}.${seatCode}${realName}`.
- Login includes compatibility lookup for legacy seat-code-era usernames.

### 5. Social Feature Architecture (posts/comments)

#### 5.1 Recommended Storage

- Primary DB: **Supabase Postgres**.
- Attachments/images: start with Supabase Storage for convenience; keep option to move hot/large assets to R2.
- API access: through Worker only (avoid direct public DB writes initially).

#### 5.2 Suggested Tables (V1)

- `posts`: id, author_uid, title, content, created_at, updated_at, visibility, status.
- `comments`: id, post_id, author_uid, content, parent_comment_id, created_at, status.
- `post_likes`: post_id, user_uid, created_at (unique composite).
- `comment_likes`: comment_id, user_uid, created_at (unique composite).
- `reports`: target_type, target_id, reporter_uid, reason, status, created_at.
- `moderation_actions`: admin_uid, target_type, target_id, action, note, created_at.

#### 5.3 API Conventions

- Keep response contract:
  - success: `{ code: 200, message: "success", data: ... }`
  - business failure: unique `code` + `error_key`.
- Cursor-based pagination for posts/comments.
- Soft delete + moderation status to reduce irreversible errors.

### 6. Migration Roadmap

#### Phase 0: Stabilize (done/in progress)

- Seat code standardization and roster response stability.
- Frontend consumes server `seat_code` and `sort_index` directly.

#### Phase 1: Social Domain First

- Launch posts/comments in Supabase from day one.
- Worker handles auth verification and RBAC before writes.
- Add moderation endpoints and audit logs.

#### Phase 2: Optional Business Data Split

- Identify non-playback tables that benefit from Supabase tooling.
- Introduce short dual-write for selected domains.
- Add consistency audits and gradual read cut-over.

#### Phase 3: Edge Optimization

- Keep hot read models in D1 where latency matters.
- Periodic projection/sync from Supabase -> D1 for read-heavy endpoints.

### 7. Operational Checklist

- Observability:
  - request-id tracing in Worker.
  - error-code dashboards by endpoint.
  - D1/Supabase consistency checks for dual-write phases.
- Security:
  - enforce auth in Worker.
  - least-privilege service keys.
  - rate limits for posting/commenting/reporting APIs.
- Data safety:
  - backups/export for Supabase social tables.
  - versioned migration scripts.
  - rollback playbooks per phase.

### 8. Decision Summary

- Do not migrate everything blindly to one side.
- Keep **R2 for media**, keep **Worker as API boundary**.
- Use **Supabase for social and management-heavy domains**.
- Keep **D1 for edge-efficient playback metadata** and optional read projections.

This gives a balanced result across performance, maintainability, and portability.

---

## 🏗️ 系统架构

```
移动端 / 浏览器
       │  HTTPS
       ▼
Cloudflare Worker (m-api.changgepd.top)
   ├── Hono 框架路由
   ├── Cloudflare D1  ── 元数据（歌曲/专辑/用户名册）
   ├── Cloudflare R2  ── 音频 / 封面 / 歌词静态资源
   ├── Supabase Auth  ── 身份认证 / Token 颁发
   └── JPush Gateway  ── 实时信号下发（Social Sync）

前端播放器 (Claw Cloud Docker)
   └── Nginx 托管 Vanilla JS 播放器
```

### 核心技术栈

| 层 | 技术 | 说明 |
|----|------|------|
| 边缘 API | Cloudflare Workers + Hono | 全球分布式，p99 < 50ms |
| 关系数据库 | Cloudflare D1 (SQLite) | 歌曲/专辑/用户名册元数据 |
| 对象存储 | Cloudflare R2 | 音频(.mp3) / 封面 / 歌词(.lrc) |
| 身份认证 | Supabase Auth | JWT 颁发、Token 刷新、邮件重置 |
| 消息推送 | 极光推送 (JPush) | **Social Sync 核心**：基于 Tag 的实时信号分发 |
| 前端托管 | Claw Cloud Run (Docker) | Nginx 托管静态播放器 |
| CI/CD | GitHub Actions | 构建推送 + Supabase 保活 |

---

## 📂 目录结构

```
Music-Archiv-V2/
├── cloudflare-worker/          # 核心 API（Cloudflare Workers + Hono）
│   ├── src/
│   │   ├── index.ts            # 路由注册入口、音乐 API
│   │   ├── auth.ts             # 用户认证系统（认领/登录/管理）
│   │   ├── album_social.ts     # 社交模块（聚合接口、班级隔离、JPush 信号）
│   │   ├── upload.ts           # 资产上传处理
│   │   └── types.ts            # TypeScript 类型定义
│   ├── migrations/             # D1 数据库迁移文件（按顺序执行）
│   │   ├── 001_create_user_profiles.sql
│   │   └── 002_create_roster_system.sql
│   ├── api_auth_v2.md          # 📖 移动端接入文档
│   └── wrangler.toml           # Cloudflare Worker 配置
├── frontend/                   # 浏览器播放器
├── .github/workflows/
│   ├── docker-build.yml        # 自动构建 Docker 镜像
│   └── keep-supabase-alive.yml # Supabase 每日保活
└── docs/                       # 技术文档
```

---

## 💬 专辑社交 V2 (班级隔离)

### 1. 设计核心

- **班级隔离**：同一个专辑，不同班级的同学看到的讨论内容是完全独立的。
- **访客限制**：未认领座位的访客无法查看或发表内容（返回 403）。
- **实时同步**：基于 JPush 的 `album_{albumId}_class_{classId}` 标签进行精准推送。

### 2. 核心接口

| 接口 | 类型 | 说明 |
|------|------|------|
| `GET /api/albums/:id/social_content` | AUTH | 获取聚合内容（最早的一条为主贴，其余为回复） |
| `POST /api/albums/:id/posts` | AUTH | 发起本班级在该专辑下的首条讨论 |
| `POST /api/albums/posts/:postId/comments` | AUTH | 发表回复（自动继承班级 ID） |

### 3. JPush 信号格式

```json
{
  "audience": { "tag": ["album_123_class_2024.A"] },
  "message": {
    "msg_content": "refresh_comments",
    "extras": { 
      "album_id": "123", 
      "class_id": "2024.A",
      "action": "FETCH_NEW" 
    }
  }
}
```

---

## 👤 用户系统说明

### 设计理念

本系统采用**「白名单座位认领」**而非开放注册：

1. 管理员预置全班同学名录（姓名 + 座位号）
2. 设置三道只有本班同学才知道答案的安全问题
3. 同学打开 App，从座位图找到自己，回答安全问题
4. 通过验证后设置密码，完成注册

**用户名由系统自动生成**，格式：`{年份}.{座位}{姓名}`，例如 `2006.0301张伟`。

### 账户管理流程

```
管理员配置安全题答案（首次必做）
         │
用户：认领座位 → 回答安全题 → 设置密码 → 自动登录
         │
正常使用：登录 → 播放音乐 → Token 自动续签
         │
忘记密码：
  ├─ 有邮箱：自助发验证码重置
  └─ 无邮箱：联系班长（admin）→ 强制设置新密码流程
```

### 权限体系

| 角色 | 获取方式 | 能力 |
|------|---------|------|
| `user` | 完成认领后自动授予 | 播放音乐、修改个人设置 |
| `admin` | master 授权 | 额外：重置密码、新增名录 |
| `master` | 内置初始账号 | 额外：撤销认领、修改权限、更新安全题 |

---

## 📖 移动端快速接入

➡️ **完整接口文档**：[`cloudflare-worker/api_auth_v2.md`](./cloudflare-worker/api_auth_v2.md)

**Base URL**：`https://m-api.changgepd.top`

### 最小集成示例（Kotlin）

```kotlin
// 1. 密码哈希（所有密码都要这样处理）
fun hashPassword(raw: String): String {
    val digest = MessageDigest.getInstance("SHA-256")
    val bytes = digest.digest(raw.trim().toByteArray(Charsets.UTF_8))
    return bytes.joinToString("") { "%02x".format(it) }
}

// 2. 获取座位表
suspend fun getRoster(): RosterResponse {
    return api.get("https://m-api.changgepd.top/api/roster")
}

// 3. 登录
suspend fun login(username: String, password: String): LoginResponse {
    return api.post("https://m-api.changgepd.top/api/user/login") {
        body = mapOf(
            "username" to username,
            "password_hash" to hashPassword(password)
        )
    }
}
```

### 关键注意事项

- ✅ 密码必须先 SHA-256 再上传，**明文密码不可接受**
- ✅ 登录响应中 `reset_pending: true` 时，**必须强制设置新密码，不得绕过**
- ✅ 收到 `401` 时，先尝试用 `refresh_token` 刷新，失败再引导重新登录
- ✅ `claim_token` 仅有 **10 分钟**有效期，认领流程要在用户体验上加以引导

---

## 🚀 部署指南

### 首次部署

**环境准备**：
- Cloudflare 账号（Workers、D1、R2 均在免费额度内）
- Supabase 账号（免费 Tier）
- GitHub 账号

**步骤**：

1. **配置 GitHub Secrets**（`Settings → Secrets and variables → Actions`）：
   - `SUPABASE_URL` — Supabase 项目 URL
   - `SUPABASE_ANON_KEY` — Supabase anon 公开密钥

2. **配置 Cloudflare Worker Secrets**（在 Cloudflare Dashboard 配置，不提交到 Git）：
   ```
   SUPABASE_SERVICE_KEY  ← Supabase service_role 密钥（用于管理员密码重置）
   ```

3. **应用数据库迁移**：
   ```bash
   npx wrangler d1 execute <your-db-name> --remote --file=migrations/001_create_user_profiles.sql
   npx wrangler d1 execute <your-db-name> --remote --file=migrations/002_create_roster_system.sql
   ```

4. **部署 Worker**：
   ```bash
   npx wrangler deploy
   ```

5. **⚠️ 首次必做：设置安全题答案**（否则无人能注册）：
   ```bash
   # 用 master 账号调用
   curl -X PUT https://m-api.changgepd.top/api/admin/questions \
     -H "Authorization: Bearer <master_token>" \
     -H "Content-Type: application/json" \
     -d '{"answers": ["班主任名字", "数学老师名字", "楼层"]}'
   ```

### 前端更新（浏览器播放器）

推送代码到 `main` 分支后，GitHub Actions 自动构建 Docker 镜像。

> ⚠️ Claw Cloud 不会自动拉取新镜像：登录控制台 → 找到 `moodymusic` 实例 → 点击 **`Update`**（不是 Restart）。

---

## 🔧 日常运维

### Supabase 保活

已配置 GitHub Action（`keep-supabase-alive.yml`），每天 UTC 06:00 自动 ping Supabase，防止免费项目因不活跃（连续 7 天无请求）被暂停。

可在 `Actions` 标签页手动触发验证。

### D1 管理接口

| 接口 | 说明 |
|------|------|
| `POST /api/admin/fix-paths` | 自动扫描并补全 `music/` 路径前缀 |
| `POST /api/admin/cleanup-duplicates` | 清理重复专辑记录 |
| `GET /api/debug/audit` | 比对 R2 实物与 D1 元数据，定位缺失资产 |

---

## 📄 许可

MIT License — 本项目仅供私人存档，请勿用于商业用途。
