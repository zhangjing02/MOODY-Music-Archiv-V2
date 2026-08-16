# MOODY 用户系统 API 文档 v2

> **面向移动端（Android）开发者**
> **Base URL**: `https://m-api.changgepd.top`
> 协议: HTTPS，全部响应 `Content-Type: application/json`

---

## 核心理念

MOODY 用户系统采用**「白名单座位认领」**模式，区别于传统注册：

```
管理员预置全班名单  →  用户从座位图找到自己  →  回答3道仅本班同学知道的统一安全问题
→  通过验证  →  设置密码  →  完成注册（用户名由系统自动生成）
```

- **无需输入用户名**：系统自动生成，格式为 `{年份代码}.{座位代码}{真实姓名}`（如 `2006.0301张伟`）
- **密码从不明文传输**：移动端负责 SHA-256 哈希，服务端接收哈希值

---

## 目录

- [加密约定](#加密约定)
- [认证方式](#认证方式)
- [一、座位认领（注册）](#一座位认领注册)
- [二、登录 & Token 管理](#二登录--token-管理)
- [三、密码找回](#三密码找回)
- [四、用户设置](#四用户设置)
- [五、管理员接口](#五管理员接口)
- [六、专辑社交讨论接口](#六专辑社交讨论接口)
- [七、视觉资产与多媒体上传接口](#七视觉资产与多媒体上传接口--admin)
- [八、高级运维与批量操作接口](#八高级运维与批量操作接口--admin)
- [九、首页切片流动态配置接口（Home Feed Blocks）](#九首页切片流动态配置接口home-feed-blocks)
- [错误码速查](#错误码速查)
- [移动端集成流程图](#移动端集成流程图)

---

## 加密约定

### 密码处理（所有涉及密码的接口均适用）

```
用户输入的原始密码  →  trim()  →  SHA-256  →  小写 hex 字符串（64位）  →  上传
```

**Kotlin 实现**：
```kotlin
import java.security.MessageDigest

fun hashPassword(raw: String): String {
    val digest = MessageDigest.getInstance("SHA-256")
    val bytes = digest.digest(raw.trim().toByteArray(Charsets.UTF_8))
    return bytes.joinToString("") { "%02x".format(it) }
}
```

**重要**：服务端将直接把这个 64 位 hex 字符串作为 Supabase 密码存储，不做二次哈希。

### 安全问题答案

答案直接 `trim()` 后上传原文；服务端按明文进行宽容匹配（会处理大小写、空格、`3层/3楼/三层/三楼/第3层` 等常见写法）。

---

## 认证方式

所有标记 🔒 的接口需要在 Header 中携带：

```
Authorization: Bearer <access_token>
```

`access_token` 来自登录/认领成功的响应，有效期约 **1 小时**。过期后用 `refresh_token` 续签，无需重新登录。

### 设备标识与多端互踢 (Session Management)

为了实现「安卓端单一登录」且「不影响网页端」的逻辑，移动端请求必须携带以下自定义 Header：

| Header | 示例值 | 说明 |
|------|------|------|
| `X-Client-Type` | `android` | 客户端类型（`android` 或 `web`） |
| `X-Device-Id` | `registration_id` | **极光推送 Registration ID** (必须唯一且用于推送) |

**互踢逻辑说明**：
1. **触发条件**：当一个新的安卓设备（不同的 `X-Device-Id`）调用登录接口时。
2. **推送提示**：旧设备会收到一条 **JPush 透传消息**：
   - `action`: `KICK_OUT`
   - `reason`: `new_login`
   - **移动端处理**：旧设备收到此消息后，应立即清除 Token 并弹窗提示「您的账号已在其他安卓设备上登录」。
3. **接口封杀 (503)**：一旦发生互踢，旧 Token 在后续请求中会触发 **503 错误**。
   - `code`: `503`
   - `error_key`: `SESSION_KICKED_OUT`
   - **网页端不受此限制**：Web 端登录不会踢掉手机端，且不受 503 校验影响。

---

## 一、座位认领（注册）

### 1.1 获取座位表

```http
GET /api/roster
```

公开接口，无需登录。返回全班名单及当前认领状态，同时返回三道安全问题的问题文本（不含答案）。

**响应示例**：
```json
{
  "code": 200,
  "roster": [
    {
      "id": 1,
      "real_name": "张伟",
      "year_code": "2006",
      "seat_code": "0301",
      "is_claimed": 0,
      "status": "normal"
    },
    {
      "id": 2,
      "real_name": "王芳",
      "year_code": "2006",
      "seat_code": "0302",
      "is_claimed": 1,
      "status": "normal"
    }
  ],
  "security_questions": [
    { "id": 1, "question": "我们的班主任叫什么名字？" },
    { "id": 2, "question": "我们的数学老师叫什么名字？" },
    { "id": 3, "question": "我们的班级在几楼？" }
  ]
}
```

**字段说明**：
| 字段 | 说明 |
|------|------|
| `is_claimed` | `0` = 可认领；`1` = 已被他人认领（置灰） |
| `status` | `normal` = 正常；`reset_pending` = 管理员已重置，等待本人设置新密码 |

---

### 1.2 校验安全问题（Step 1 / 2）

```http
POST /api/user/claim/verify
Content-Type: application/json
```

**Body**：
```json
{
  "roster_id": 1,
  "answers": ["班主任的名字", "数学老师的名字", "楼层"]
}
```

- `answers` 数组顺序必须与 `security_questions` 的 `id` 顺序一致，共 3 个元素

**成功响应（200）**：
```json
{
  "code": 200,
  "message": "验证通过，请在10分钟内完成注册",
  "claim_token": "a1b2c3d4e5f6...",
  "roster": {
    "id": 1,
    "real_name": "张伟",
    "year_code": "2006",
    "seat_code": "0301"
  }
}
```

- `claim_token` 有效期 **10 分钟**，只能使用一次

**错误码**：
| HTTP | 含义 |
|------|------|
| 400 | 参数缺失或 answers 数量不对 |
| 401 | 第 N 道问题答案不正确 |
| 404 | roster_id 不存在 |
| 409 | 该同学已被他人认领 |

---

### 1.3 完成认领注册（Step 2 / 2）

```http
POST /api/user/claim/finalize
Content-Type: application/json
```

**Body**：
```json
{
  "claim_token": "a1b2c3d4e5f6...",
  "password_hash": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  "email": "zhangwei@example.com"
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|:----:|------|
| `claim_token` | string | ✅ | Step 1 返回的令牌 |
| `password_hash` | string | ✅ | SHA-256(原始密码)，64 位小写 hex |
| `email` | string | ❌ | 绑定邮箱，用于找回密码，**强烈建议填写** |

**成功响应（200）**：
```json
{
  "code": 200,
  "message": "认领成功！欢迎 张伟",
  "user": {
    "id": 1,
    "username": "2006.0301张伟",
    "email": "zhangwei@example.com",
    "level": 1,
    "role": "user",
    "avatar_url": null,
    "created_at": "2026-04-13T06:00:00.000Z"
  },
  "token": "eyJhbGci...",
  "refresh_token": "..."
}
```

> 注册即登录，直接存储 `token` 和 `refresh_token` 进入主界面。

---

## 二、登录 & Token 管理

### 2.1 登录

```http
POST /api/user/login
Content-Type: application/json
```

**Body**：
```json
{
  "username": "2006.0301张伟",
  "password_hash": "e3b0c44298fc..."
}
```

**成功响应（200）**：
```json
{
  "code": 200,
  "message": "登录成功",
  "user": {
    "id": 1,
    "username": "2006.0301张伟",
    "email": "zhangwei@example.com",
    "level": 1,
    "role": "user",
    "avatar_url": null,
    "created_at": "2026-04-13T06:00:00.000Z"
  },
  "token": "eyJhbGci...",
  "refresh_token": "...",
  "reset_pending": false
}
```

> ⚠️ **`reset_pending: true` 时**：App 必须强制跳转「设置新密码」页面，调用 [3.3 管理员重置后设置新密码](#33-管理员重置后设置新密码-step-3-仅限-reset_pending)，完成前不得进入主界面。

---

### 2.2 刷新 Token

```http
POST /api/user/refresh
Content-Type: application/json
```

**Body**：
```json
{ "refresh_token": "..." }
```

**成功响应（200）**：
```json
{
  "code": 200,
  "token": "eyJhbGci...",
  "refresh_token": "..."
}
```

> 建议在收到任意接口返回 `401` 时，立即尝试刷新 Token。刷新也失败则引导用户重新登录。

---

### 2.3 获取当前用户信息 🔒

```http
GET /api/user/me
```

**成功响应（200）**：
```json
{
  "code": 200,
  "user": {
    "id": 1,
    "username": "2006.0301张伟",
    "level": 1,
    "role": "user",
    "avatar_url": null,
    "created_at": "2026-04-13T06:00:00.000Z"
  },
  "roster": {
    "id": 1,
    "real_name": "张伟",
    "seat_code": "0301",
    "status": "normal"
  }
}
```

---

## 三、密码找回

### 3.1 申请邮箱验证码（忘记密码）

```http
POST /api/user/reset/request
Content-Type: application/json
```

**Body**：
```json
{ "username": "2006.0301张伟" }
```

**成功响应（200）**：
```json
{
  "code": 200,
  "message": "验证码已发送至 zh***@example.com，15分钟内有效"
}
```

**失败场景**：
| HTTP | 含义 | 处理建议 |
|------|------|---------|
| 403 | 未绑定邮箱 | 提示联系班长（管理员）重置 |
| 404 | 用户不存在 | 检查用户名是否正确 |

---

### 3.2 验证码确认重置

```http
POST /api/user/reset/confirm
Content-Type: application/json
```

**Body**：
```json
{
  "username": "2006.0301张伟",
  "code": "123456",
  "new_password_hash": "e3b0c44298fc..."
}
```

成功返回 `{ "code": 200, "message": "密码重置成功，请使用新密码登录" }`

---

### 3.3 管理员重置后设置新密码 🔒

> 适用场景：登录时收到 `reset_pending: true`，在 App 内强制设置新密码

```http
POST /api/user/reset/set-new
Authorization: Bearer <token>
Content-Type: application/json
```

**Body**：
```json
{ "new_password_hash": "e3b0c44298fc..." }
```

成功返回 `{ "code": 200, "message": "新密码设置成功" }`。完成后继续进入主界面。

---

## 四、用户设置

### 4.1 更新头像 🔒

```http
PUT /api/user/profile
Authorization: Bearer <token>
Content-Type: application/json
```

**Body**：
```json
{ "avatar_url": "https://cdn.example.com/avatar/abc.jpg" }
```

> 用户名由系统生成，不可修改。

---

### 4.2 绑定邮箱 🔒

```http
POST /api/user/bind-email
Authorization: Bearer <token>
Content-Type: application/json
```

**Body**：
```json
{ "email": "my@example.com" }
```

> 可在注册时跳过，注册后在「账户设置」页补绑。绑定后才支持邮箱找回密码。

---

### 4.3 获取播放设置 🔒

```http
GET /api/user/settings
Authorization: Bearer <token>
```

**响应**：
```json
{
  "code": 200,
  "last_volume": 0.8,
  "theme_mode": "dark",
  "auto_play": 1
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `last_volume` | float | 音量，0.0 ~ 1.0 |
| `theme_mode` | string | `"dark"` \| `"light"` |
| `auto_play` | int | `1` = 开启，`0` = 关闭 |

---

### 4.4 更新播放设置 🔒

```http
PUT /api/user/settings
Authorization: Bearer <token>
Content-Type: application/json
```

**Body（字段均可选）**：
```json
{
  "last_volume": 0.8,
  "theme_mode": "light",
  "auto_play": 0
}
```

---

## 五、管理员接口

> 以下接口需要 `admin` 或 `master` 权限的 Token。

### 权限等级

| role | 说明 | 可用接口 |
|------|------|---------|
| `user` | 普通用户 | 所有标准接口 |
| `admin` | 日常管理员 | + 查看名录、新增名录、重置密码标记 |
| `master` | 最高管理员 | + 撤销认领、修改权限、更新安全题答案 |

---

### 5.1 查看全部名录 🔒 (admin)

```http
GET /api/admin/roster
```

响应包含所有人的认领状态、关联账户用户名。

---

### 5.2 新增名录条目 🔒 (admin)

```http
POST /api/admin/roster/add
Content-Type: application/json
```

**Body**：
```json
{
  "real_name": "补录同学",
  "year_code": "2006",
  "seat_code": "0341"
}
```

---

### 5.3 重置某人密码 🔒 (admin)

```http
POST /api/admin/roster/reset
Content-Type: application/json
```

**Body**：
```json
{ "roster_id": 1 }
```

执行后，该用户下次登录时 `reset_pending: true`，App 强制引导其设置新密码。

---

### 5.4 完全撤销认领 🔒 (master)

```http
POST /api/admin/roster/unclaim
Content-Type: application/json
```

**Body**：
```json
{ "roster_id": 1 }
```

> 仅断开名录与账户的关联，不删除 Supabase 账户，座位重新开放认领。

---

### 5.5 修改用户权限 🔒 (master)

```http
PUT /api/admin/user/role
Content-Type: application/json
```

**Body**：
```json
{
  "username": "2006.0302王芳",
  "role": "admin"
}
```

---

### 5.6 更新安全问题答案 🔒 (master)

```http
PUT /api/admin/questions
Content-Type: application/json
```

**Body**：
```json
{
  "answers": ["班主任真实姓名", "数学老师真实姓名", "楼层数字或描述"]
}
```

> 默认已内置答案，可按需调用此接口覆盖。

---

## 错误码速查

| HTTP Code | `code` 字段 | 含义 |
|-----------|------------|------|
| 200 | 200 | 成功 |
| 400 | 400 | 请求参数错误、格式不正确 |
| 401 | 401 | 未登录、Token 过期、答案错误 |
| 403 | 403 | 权限不足或账号未绑定邮箱 |
| 404 | 404 | 资源不存在 |
| 409 | 409 | 资源冲突（已认领、记录重复等） |
| 500 | 500 | 服务器内部错误 |
| 503 | 503 | 会话失效（账号在别处登录） |

**所有错误统一格式**：
```json
{
  "code": 401,
  "message": "Token 已过期，请重新登录"
}
```

---

## 移动端集成流程图

### 注册（认领）流程

```
App 启动
  │
  ├─ 调用 GET /api/roster
  │     └─ 展示座位图（is_claimed=1 的置灰不可点）
  │
  ├─ 用户点击未认领座位
  │     └─ 展示三道安全问题（来自 security_questions）
  │
  ├─ 用户填写答案 → POST /api/user/claim/verify
  │     ├─ 401: 提示哪道题错了，让用户重试
  │     ├─ 409: 提示已被认领
  │     └─ 200: 获得 claim_token（10分钟倒计时）
  │
  ├─ 用户设置密码 → SHA-256(密码) → POST /api/user/claim/finalize
  │     └─ 200: 获得 token + refresh_token
  │
  └─ 存储 token/refresh_token → 进入主界面
```

### 登录流程

```
用户输入用户名 + 密码
  │
  ├─ SHA-256(密码) → POST /api/user/login
  │     ├─ 401: 提示用户名或密码错误
  │     └─ 200:
  │           ├─ reset_pending=true → 强制跳转「设置新密码」页
  │           │         └─ POST /api/user/reset/set-new → 完成 → 进入主界面
  │           └─ reset_pending=false → 直接进入主界面
  │
  └─ 存储 token + refresh_token
```

### Token 续签策略

```
收到 401 响应
  │
  ├─ 调用 POST /api/user/refresh（用 refresh_token）
  │     ├─ 成功: 更新本地 token，重试原请求
  │     └─ 失败(401): 清除所有登录态 → 跳转登录页
  │
  └─ 建议：access_token 快过期时（< 5 分钟）提前主动刷新
```

### 忘记密码流程

```
忘记密码页
  │
  ├─ 有绑定邮箱:
  │     ├─ 输入用户名 → POST /api/user/reset/request → 收验证码
  │     ├─ 输入验证码 + 新密码 → POST /api/user/reset/confirm
  │     └─ 成功 → 引导重新登录
  │
  └─ 无绑定邮箱:
        └─ 提示「请联系班长帮你重置密码」
              └─ 班长（admin）执行 POST /api/admin/roster/reset
                    └─ 用户下次登录时强制设置新密码
```

---

## 六、专辑社交互动接口 (Album Social) 🔒

> 说明：本模块用于专辑详情页面的班级专属讨论区，具备**班级数据物理隔离**与 **JPush 实时透传信号分发**能力。

### 6.1 获取专辑社交聚合内容 🔒

```http
GET /api/albums/:id/social_content
Authorization: Bearer <access_token>
```

**响应示例 (200)**：
```json
{
  "code": 200,
  "message": "success",
  "data": {
    "album_id": 12,
    "class_id": "2006.03",
    "has_post": true,
    "main_post": {
      "id": 101,
      "author_uid": "user-uuid",
      "author_name": "张伟",
      "author_avatar": "https://m-api.changgepd.top/storage/avatars/user1.jpg",
      "content": "这张专辑是我们当年的合唱回忆！",
      "created_at": "2026-08-16T08:00:00.000Z",
      "likes_count": 5,
      "is_liked": true
    },
    "replies": [
      {
        "id": 201,
        "author_uid": "user-uuid-2",
        "author_name": "王芳",
        "author_avatar": null,
        "content": "对啊，当时排练好久",
        "reply_to_name": null,
        "created_at": "2026-08-16T08:15:00.000Z",
        "likes_count": 2,
        "is_liked": false
      }
    ]
  }
}
```

### 6.2 发起专辑主贴 🔒

```http
POST /api/albums/:id/posts
Authorization: Bearer <access_token>
Content-Type: application/json
```

**Body**：
```json
{
  "content": "当年运动会上放这首歌大家都在欢呼！"
}
```

### 6.3 回复主贴 / 同学 🔒

```http
POST /api/albums/posts/:postId/comments
Authorization: Bearer <access_token>
Content-Type: application/json
```

**Body**：
```json
{
  "content": "我也记得！",
  "reply_to_uid": "user-uuid-optional"
}
```

### 6.4 点赞 / 取消点赞 🔒

```http
POST /api/albums/comments/:commentId/like
Authorization: Bearer <access_token>
```

**响应示例 (200)**：
```json
{
  "code": 200,
  "message": "success",
  "data": {
    "is_liked": true,
    "likes_count": 6
  }
}
```

---

## 七、视觉资产与多媒体上传接口 🔒 (admin)

### 7.1 上传视觉资产（海报/封面/写真/插画） 🔒

```http
POST /api/admin/assets/upload
Content-Type: multipart/form-data
```

**FormData 字段**：
| 字段名 | 类型 | 说明 |
|-------|------|------|
| `files` / `file` | File | 图片文件（支持多文件批量上传） |
| `category` | string | `hero` (海报) \| `albums` (专辑封面) \| `artists` (歌手写真) \| `articles` (随笔插图) \| `welcome` \| `avatars` |
| `album_id` | number | 可选。若传递，自动将 R2 Key 绑定到 D1 `albums.cover_url` |
| `artist_id` | number | 可选。若传递，自动将 R2 Key 绑定到 D1 `artists.photo_url` |
| `filename` | string | 可选。自定义文件名 |

**响应示例 (200)**：
```json
{
  "code": 200,
  "message": "成功上传 1 个视觉资产",
  "data": {
    "total": 1,
    "files": [
      {
        "key": "covers/albums/lost_forest.jpg",
        "filename": "lost_forest.jpg",
        "url": "https://m-api.changgepd.top/storage/covers/albums/lost_forest.jpg",
        "category": "albums",
        "size": 482910,
        "dbUpdated": true
      }
    ]
  }
}
```

### 7.2 查询视觉资产列表 🔒

```http
GET /api/admin/assets/list?category=albums
```

---

## 八、高级运维与批量操作接口 🔒 (admin)

| 接口 | 方法 | 描述 |
|------|------|------|
| `/api/admin/ops/songs/batch-update` | `POST` | 批量修正歌曲元数据（曲目名、音轨序号、时长） |
| `/api/admin/ops/albums/rename` | `POST` | 专辑重命名与别名维护 |
| `/api/admin/ops/artists/rename` | `POST` | 歌手姓名规范化与合并 |
| `/api/admin/ops/albums/merge` | `POST` | 智能合并重复专辑记录与曲目迁移 |
| `/api/admin/ops/albums/delete` | `POST` | 级联删除专辑及其下属关联记录 |
| `/api/admin/ops/songs/batch-insert` | `POST` | 批量向指定专辑导入曲目元数据 |

---

## 九、首页切片流动态配置接口（Home Feed Blocks）

首页采用**模块化切片流（Server-Driven UI / Feed Blocks）**架构。客户端与移动端（Android）仅需通过单一接口获取已发布的切片流配置，并按顺序渲染对应组件，支持后台随时热更新首页布局、焦点轮播、推荐曲目、深度唱片故事与歌手网格。

### 9.1 获取首页切片流（客户端 / 移动端公开接口）

```http
GET /api/home/feed
```

- **权限**：公开接口，无需登录与 Authorization Header。
- **数据源回退机制**：
  1. 优先读取 Cloudflare D1 数据库 `app_settings` 表（key: `home_feed`）；
  2. 若 D1 无数据或读取异常，尝试读取 R2 存储桶文件 `config/home_feed.json`；
  3. 若均未配置，自动返回一套**内置高质量默认切片数据**（包含 `hero_banner`、`category_tabs`、`section_title`、`artist_grid`、`essay_card`、`track_list`、`album_row`），确保任何情况下请求都不为空。
- **资源 URL 自动补全**：服务端会自动将相对路径（如 `/storage/covers/...` 或 `music/...`）归一化为以当前 Worker 域名开头的完整可用绝对 URL。

**响应示例 (200)**：
```json
{
  "code": 200,
  "message": "success",
  "data": {
    "version": "1.0.0",
    "updatedAt": "2026-08-16T16:00:00.000Z",
    "items": [
      {
        "id": "block_hero_banner_main",
        "type": "hero_banner",
        "title": "今日焦点",
        "subtitle": "精选专题与唱片故事",
        "sortOrder": 1,
        "visible": true,
        "autoPlay": true,
        "intervalMs": 5000,
        "items": [
          {
            "id": "hero_1",
            "title": "叶惠美 · 二十周年特别志",
            "subtitle": "古典交响与嘻哈重塑千禧流行黄金时代",
            "badge": "经典重温",
            "coverUrl": "https://m-api.changgepd.top/storage/covers/jay_yehuimei.jpg",
            "actionType": "album",
            "actionTarget": "db_1",
            "bgColor": "#1a1c23"
          }
        ]
      },
      {
        "id": "block_category_tabs_main",
        "type": "category_tabs",
        "title": "分类导航",
        "sortOrder": 2,
        "visible": true,
        "items": [
          { "id": "tab_all", "label": "全部精选", "icon": "sparkles", "categoryKey": "all" },
          { "id": "tab_mandopop", "label": "华语流行", "icon": "music_note", "categoryKey": "mandopop" },
          { "id": "tab_nostalgia", "label": "千禧记忆", "icon": "history", "categoryKey": "nostalgia" }
        ]
      },
      {
        "id": "block_sec_artists_title",
        "type": "section_title",
        "title": "时光音乐人",
        "subtitle": "跨越岁月的经典歌者与时代声音",
        "actionText": "查看全部",
        "actionType": "navigate",
        "actionTarget": "/artists",
        "sortOrder": 3,
        "visible": true
      },
      {
        "id": "block_artist_grid_main",
        "type": "artist_grid",
        "title": "推荐歌手",
        "sortOrder": 4,
        "visible": true,
        "layout": "grid",
        "items": [
          {
            "id": "db_1",
            "name": "周杰伦",
            "avatarUrl": "https://m-api.changgepd.top/src/assets/images/jay/avatar.jpg",
            "countText": "14 张专辑 · 140+ 首曲目",
            "tag": "华语天王",
            "category": "华语"
          }
        ]
      },
      {
        "id": "block_essay_card_fantasy",
        "type": "essay_card",
        "title": "唱片故事 · 《范特西》的黄金幻想",
        "subtitle": "从《爱在西元前》到《安静》，一场划时代的音乐冒险",
        "author": "MOODY 选乐志",
        "publishDate": "2001-09-20",
        "excerpt": "2001年的秋天，《范特西》横空出世，以无与伦比的天马行空重塑了华语流行音乐的黄金轮廓...",
        "coverUrl": "https://m-api.changgepd.top/storage/covers/fantasy.jpg",
        "albumId": "db_1",
        "artistName": "周杰伦",
        "tag": "深度品鉴",
        "actionUrl": "/album/db_1",
        "sortOrder": 5,
        "visible": true
      },
      {
        "id": "block_sec_tracks_title",
        "type": "section_title",
        "title": "今日私享单曲",
        "subtitle": "岁月留声，一键开启静心聆听",
        "actionText": "全部曲库",
        "actionType": "navigate",
        "actionTarget": "/songs",
        "sortOrder": 6,
        "visible": true
      },
      {
        "id": "block_track_list_main",
        "type": "track_list",
        "title": "精选单曲推荐",
        "sortOrder": 7,
        "visible": true,
        "items": [
          {
            "id": 1,
            "title": "晴天",
            "artistName": "周杰伦",
            "albumTitle": "叶惠美",
            "coverUrl": "https://m-api.changgepd.top/storage/covers/jay_yehuimei.jpg",
            "filePath": "music/周杰伦/叶惠美/晴天.mp3",
            "audioUrl": "https://m-api.changgepd.top/storage/music/周杰伦/叶惠美/晴天.mp3",
            "duration": 269,
            "badge": "精选"
          }
        ]
      }
    ]
  }
}
```

---

### 9.2 保存首页切片流（管理员控制台发布） 🔒

```http
POST /api/admin/home/feed
# 或 PUT /api/admin/home/feed
Content-Type: application/json
```

- **功能**：接收前端控制台提交的切片数组，进行格式校验后持久化存储至 Cloudflare D1 (`app_settings` 表)，并自动同步镜像至 Cloudflare R2 (`config/home_feed.json`) 双重备份。

**请求体格式 (JSON)**：
```json
{
  "version": "v1.2.0",
  "items": [
    {
      "id": "block_hero_banner_main",
      "type": "hero_banner",
      "title": "今日焦点",
      "sortOrder": 1,
      "visible": true,
      "items": [
        {
          "id": "hero_1",
          "title": "叶惠美 · 二十周年特别志",
          "subtitle": "古典交响与嘻哈重塑千禧流行黄金时代",
          "coverUrl": "/storage/covers/jay_yehuimei.jpg",
          "actionType": "album",
          "actionTarget": "db_1"
        }
      ]
    }
  ]
}
```

**响应示例 (200)**：
```json
{
  "code": 200,
  "message": "success",
  "data": {
    "version": "v1.2.0",
    "updatedAt": "2026-08-16T16:45:00.000Z",
    "count": 1
  }
}
```

---

### 9.3 重置首页切片流为默认配置 🔒

```http
POST /api/admin/home/feed/reset
# 或 DELETE /api/admin/home/feed
```

- **功能**：清除 D1 与 R2 中的自定义配置，使首页恢复为内置的官方默认切片流。

**响应示例 (200)**：
```json
{
  "code": 200,
  "message": "已成功重置首页切片为默认配置",
  "data": {
    "version": "1.0.0",
    "items": []
  }
}
```

---

### 9.4 首页切片 Block Schema 规范定义

每个 Block 均包含通用基类字段，并根据其 `type` 携带对应的特有字段：

#### 通用基础字段 (BaseHomeBlock)
| 字段名 | 类型 | 必填 | 说明 |
|-------|------|------|------|
| `id` | string | 是 | 切片唯一标识，如 `block_hero_1` |
| `type` | string | 是 | 切片类型（见下文枚举） |
| `title` | string | 否 | 分区标题 |
| `subtitle` | string | 否 | 分区副标题 / 描述语 |
| `sortOrder` | number | 否 | 排序权重（从小到大排序） |
| `visible` | boolean | 否 | 是否对客户端可见（默认 `true`） |
| `style` | object | 否 | 样式扩展属性（背景色、边距、列数等） |

#### 各切片类型定义

##### 1. `hero_banner` (焦点大图 / 轮播图)
- `autoPlay`: boolean (是否自动轮播)
- `intervalMs`: number (轮播切换间隔毫秒，如 `5000`)
- `items`: 数组，每个 item 包含：
  - `id`: string (项标识)
  - `title`: string (主标题)
  - `subtitle`: string (副标题)
  - `badge`: string (右上角标签，如 "经典重温")
  - `coverUrl`: string (图片地址)
  - `actionType`: `'album' | 'artist' | 'song' | 'playlist' | 'url' | 'none'` (点击动作)
  - `actionTarget`: string (目标 ID 或跳转 URL)
  - `bgColor`: string (卡片背景主色调，如 `"#1a1c23"`)

##### 2. `category_tabs` (分类磁贴 / 标签导航)
- `items`: 数组，每个 item 包含：
  - `id`: string (标签标识)
  - `label`: string (展示文字，如 "华语流行")
  - `icon`: string (图标名称，如 "music_note")
  - `categoryKey`: string (分类关键字)
  - `filter`: object (可选的过滤参数)

##### 3. `section_title` (分区标题栏)
- `title`: string (主标题)
- `subtitle`: string (副标题)
- `actionText`: string (操作文案，如 "查看全部")
- `actionType`: string (如 `"navigate"`)
- `actionTarget`: string (路由路径，如 `"/artists"`)

##### 4. `artist_grid` (推荐歌手网格)
- `layout`: `'grid' | 'horizontal_scroll' | 'list'` (布局形态)
- `items`: 数组，每个 item 包含：
  - `id`: string (歌手 ID，如 `"db_1"`)
  - `name`: string (歌手姓名)
  - `avatarUrl`: string (头像地址)
  - `countText`: string (作品统计文案)
  - `tag`: string (标签，如 "华语天王")
  - `category`: string (分类，如 "华语")

##### 5. `essay_card` (深度乐评 / 唱片故事大卡片)
- `title`: string (文章/故事主标题)
- `subtitle`: string (副标题)
- `author`: string (作者/选乐人)
- `publishDate`: string (发布日期)
- `excerpt`: string (导读摘录)
- `content`: string (完整内容富文本/Markdown)
- `coverUrl`: string (配图/唱片封面)
- `albumId`: string | number (关联专辑 ID)
- `artistName`: string (关联歌手名)
- `tag`: string (标签，如 "深度品鉴")
- `actionUrl`: string (跳转路径)

##### 6. `track_list` (今日私享单曲 / 推荐曲目列表)
- `items`: 数组，每个 item 包含：
  - `id`: string | number (歌曲 ID)
  - `title`: string (歌曲标题)
  - `artistName`: string (歌手姓名)
  - `albumTitle`: string (专辑名称)
  - `coverUrl`: string (封面图 URL)
  - `filePath`: string (音频相对存储路径)
  - `audioUrl`: string (完整的音频播放 URL)
  - `duration`: number (音频时长秒数)
  - `badge`: string (角标)

##### 7. `album_row` (横滑唱片流 / 经典专辑推荐)
- `items`: 数组，每个 item 包含：
  - `id`: string | number (专辑 ID)
  - `title`: string (专辑名称)
  - `artistName`: string (歌手姓名)
  - `coverUrl`: string (专辑封面 URL)
  - `releaseDate`: string (发行日期)
  - `songCount`: number (歌曲数量)
  - `tag`: string (标签)


