# 🎵 MOODY — 私人音乐档案库 V2

> 专为同学录场景设计的私有音乐流媒体系统。仅限受邀成员访问，通过「座位认领」方式完成注册。

[![GitHub Actions](https://img.shields.io/github/actions/workflow/status/zhangjing02/MOODY-Music-Archiv-V2/keep-supabase-alive.yml?label=Supabase%20Keepalive&logo=supabase)](https://github.com/zhangjing02/MOODY-Music-Archiv-V2/actions)

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
│   │   ├── upload.ts           # 资产上传处理
│   │   └── types.ts            # TypeScript 类型定义
│   ├── migrations/             # D1 数据库迁移文件（按顺序执行）
│   │   ├── 001_create_user_profiles.sql
│   │   └── 002_create_roster_system.sql
│   ├── api_auth_v2.md          # 📖 移动端接入文档（看这里！）
│   └── wrangler.toml           # Cloudflare Worker 配置
├── frontend/                   # 浏览器播放器
├── .github/workflows/
│   ├── docker-build.yml        # 自动构建 Docker 镜像
│   └── keep-supabase-alive.yml # Supabase 每日保活
└── docs/                       # 技术文档
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
