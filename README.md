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

---

## 🗄️ 多存储桶分布式架构与资源分配策略 (Multi-Bucket Architecture)

> **设计原则：100% 零成本（Zero Cost）与零账单风险（Zero Financial Risk）**
> 为规避云平台因黑客攻击、恶意爬虫穿透或配额超出导致的信用卡突发扣费风险，系统严格执行「多账号物理隔离 + 10GB 免费限额硬截断」策略。每个存储桶设置 **9.50 GB (95%) 物理停机安全红线**，单桶达到警戒线后即刻进入只读保护状态。

### 1. 存储桶配置与角色矩阵

| 配置维度 | 主存储桶 (Bucket 01) | 扩展存储桶 (Bucket 02) |
| :--- | :--- | :--- |
| **存储桶名称** | `moody-music-asset` | `moody-music-asset-02` |
| **Cloudflare 账号** | 账号 1 (`0bd18c2b...`) | 账号 2 (`042076c2...`) |
| **免费额度上限** | 10.00 GB | 10.00 GB |
| **安全停机红线** | **9.50 GB (95%)** | **9.50 GB (95%)** |
| **访问接入方式** | Worker 内部绑定 (`c.env.BUCKET`) + `/storage/*` 反代 | 公网直链 (`pub-9ea7ff...r2.dev`) + 全局 CORS + Range 流式 |
| **D1 路径存储格式**| 相对路径 (例: `music/Beyond/xxx.mp3`) | 绝对 URL (例: `https://pub-9ea7ff...r2.dev/music/xxx.mp3`) |
| **当前运行状态** | **已物理封箱只读 (FROZEN_READONLY)** | **主力扩容接力写入 (ACTIVE)** |
| **当前物理占用** | **8.33 GB (83.3%) / 1,590 首** | **0.27 GB (2.7%) / 58 首** |
| **剩余安全可用** | **1.17 GB (已永久锁定，不再写入)** | **9.23 GB (空间极其充裕，可容纳 ~1,700 首)** |

### 2. 歌手与大碟归属切割规划 (Clean Partitioning Plan)

为保证运维清晰、防止资源碎片化，系统严格遵循 **「严禁同一专辑分桶」** 与 **「歌手整盘收口」** 原则：

#### 🏛️ 第一存储桶 (`moody-music-asset`)：核心录音室大碟大满贯基石（已封箱）
第一存储桶已承载全部早期高频经典曲库，核心歌手全部达成 100% 录音室全专点亮，现已**永久物理封箱为只读**：
* **周杰伦 (Jay Chou)**：全量 15 张正式录音室专辑 **100.00% 完结 (149 首)**（爬虫虚假骨架《天作之合》已清理）。
* **孙燕姿 (Stefanie Sun)**：全量 12 张正式录音室专辑 **100.00% 完结 (133 首)**（重复幽灵空专辑《是時候》已清理）。
* **陶喆 (David Tao)**：全量 8 张正式录音室专辑 **100.00% 完结 (108 首)**（含全部短音轨/Interludes/Skits）。
* **李荣浩 (Ronghao Li)**：全量 7 张正式录音室专辑 **100.00% 完结 (81 首)**。
* **邓紫棋 (G.E.M.)**：全量 7 张核心中文录音室大碟 **100.00% 完结**。
* **林俊杰 (JJ Lin)**：正式大碟经典资产 (179 首)。
* **历史基石资产**：Beyond (82 首)、梁静茹 (134 首)、蔡依林 (89 首) 等。
* *终局物理水位：锁定在 8.33 GB，严格处于 9.50 GB 警戒红线之内，永不产生任何超额账单。*

#### 🚀 第二存储桶 (`moody-music-asset-02`)：新大牌歌手与后续全量大碟基地（写入中）
第二存储桶承载后续所有全新大牌歌手的整盘录音室专辑，享有全新的独立 10.00 GB 免费额度：
* **王菲 (Faye Wong)**：传世经典录音室大碟全线接入，已达成 **100.00% 完结**的大碟包括：《天空》(10首)、《唱遊》(13首)、《只愛陌生人》(12首)、《王菲97》(10首)、《菲靡靡之音》(13首)；《將愛》、《Di-Dar》、《Coming Home》、《十萬個為什麼？》、《敷衍》、《浮躁》、《討好自己》正多线程接力扩容。
* **骨架与幽灵音轨治理**：已在 D1 与本地数据库中精准注销清理《浮躁》(删除 4 首冗余 Music Only 骨架) 与《討好自己》(删除 2 首错位及重复音轨)，保证 100% 纯净。
* **王力宏 (Wang Leehom)**：全量录音室经典专辑（《公转自转》、《心中的日月》、《盖世英雄》、《改变自己》等，已入库 37 首）。
* **张国荣 (Leslie Cheung)**：全量录音室经典专辑（《寵愛》、《紅》、《陪你倒數》、《大熱》等）。
* **陈奕迅 (Eason Chan) 完整后续**：剩余全部录音室大碟。
* **五月天 (Mayday) 完整后续**：剩余全部录音室专辑。
* *后续新增全部新歌手直入第二桶，单歌手资源 100% 独立集中，全流程执行 160k CBR 转码与 9.50 GB 熔断预警。*

### 3. 音频压缩与物理质量保障规范

* **编码标准**：160 kbps CBR (恒定码率) MP3，LAME 编码器，采样率锁定 **44.1 kHz (CD 标准)**。
* **标头完整性**：必须注入完整的 Xing / VBR Header，保证网页端及 Android 端无损快进与 seek 零延迟。
* **单曲体积定律**：在 160k CBR 下，文件体积仅取决于歌曲时长 ($20\text{ KB/s} \times \text{Duration}$)，曲库平均单曲体积稳定为 **5.44 MB**。
* **自动化质检抽检**：每个下载/转码批次均自动化执行 FFprobe 频谱完整性核验，杜绝高频截断与失真。

### 4. 自动化预警与熔断安全机制 (Circuit Breaker)

在上传任何音频文件前，脚本必须执行以下三层防御校验：
1. **容量预先测算**：实时调用 S3 `list_objects_v2` 获取目标桶物理字节数，加上本次待传批次总大小。
2. **95% 熔断拦截**：若计算结果 $\ge 9.50\text{ GB}$，上传进程立即物理阻断退出，发出红色告警并暂停，严禁超额写入。
3. **断点持久化记录**：所有处理状态与异常自动持久化于 `backend/database/catalog_sync.db` 与 `backend/reports/MULTI_BUCKET_EXECUTION_LOG.md`。

---

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

```text
移动端 / 浏览器
       │  HTTPS
       ▼
Cloudflare Worker (m-api.changgepd.ccwu.cc)
   ├── Hono 框架路由
   ├── 动态首页 SDUI 流 (/api/home/feed)
   ├── Cloudflare D1  ── 元数据（歌曲/专辑/用户名册）
   ├── Cloudflare R2  ── 音频 / 封面 / 歌词静态资源
   ├── Supabase Auth  ── 身份认证 / Token 颁发
   └── JPush Gateway  ── 实时信号下发（Social Sync）

前端播放器 & CMS 管理后台
   └── 静态网页 (已支持单一数据源 config.js)
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

## 🌐 域名治理与单源配置 (Single Source of Truth)

本项目现已全面接入**单一配置源机制**，彻底根除了过去修改域名需要搜索替换几十处代码的问题：

- **网页端与管理后台单源配置**：
  - 核心配置文件：[`frontend/src/js/config.js`](./frontend/src/js/config.js) 与 [`frontend/admin/config.js`](./frontend/admin/config.js)
  - 统一注入 `window.MOODY_CONFIG`，自动区分本地开发（`localhost -> 8787`）与生产域名，所有业务代码（`app.js`、`admin.js`、`album-manager.js`、`asset-manager.js`）统一通过常量读取。
- **全自动一键换域脚本**：
  - 在根目录提供全自动运维脚本 [`scripts/switch-domain.js`](./scripts/switch-domain.js)：
    ```bash
    # 一键将 Cloudflare Worker、R2 存储桶、Android、Web 前端与 Admin 后台全链路切换至新域名：
    node scripts/switch-domain.js <新域名> [Cloudflare_Token]
    ```

---

## 📖 移动端快速接入

➡️ **完整接口文档**：[`cloudflare-worker/api_auth_v2.md`](./cloudflare-worker/api_auth_v2.md)

**Base URL**：`https://m-api.changgepd.ccwu.cc`

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
    return api.get("https://m-api.changgepd.ccwu.cc/api/roster")
}

// 3. 登录
suspend fun login(username: String, password: String): LoginResponse {
    return api.post("https://m-api.changgepd.ccwu.cc/api/user/login") {
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
   curl -X PUT https://m-api.changgepd.ccwu.cc/api/admin/questions \
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
