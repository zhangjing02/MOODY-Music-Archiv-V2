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

答案直接 `trim()` 后上传原文；服务端统一转小写再哈希比对。用户输入"3楼"或"三楼"等价于管理员配置的对应值。

---

## 认证方式

所有标记 🔒 的接口需要在 Header 中携带：

```
Authorization: Bearer <access_token>
```

`access_token` 来自登录/认领成功的响应，有效期约 **1 小时**。过期后用 `refresh_token` 续签，无需重新登录。

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

> ⚠️ **首次部署后必须调用此接口**，否则任何人都无法通过安全验证完成认领。

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
