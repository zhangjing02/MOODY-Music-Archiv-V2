# MOODY 音乐库 API 文档 (v14.0)

本文档描述了 MOODY 系统的所有对外接口，基于 **Cloudflare Worker + D1 + R2** 纯边缘计算架构。

**基础 URL**: `https://m-api.changgepd.top`

> 旧域名 `https://moody-worker.changgepd.workers.dev` 仍可使用，但推荐使用自定义域名。

---

## 📋 目录

1. [用户认证系统](#用户认证系统) 🔐 **登录/注册**
2. [系统状态与统计](#系统状态与统计)
3. [数据查询接口](#数据查询接口)
4. [存储服务](#存储服务)
5. [专辑管理](#专辑管理)
6. [歌曲管理](#歌曲管理)
7. [运营友好接口](#运营友好接口) ⭐ **推荐使用**
8. [数据治理](#数据治理)
9. [调试工具](#调试工具)

---

## 关于认证

> **所有接口均可匿名访问**，无需登录即可浏览音乐库、搜索歌曲、播放音乐等。

用户认证系统（注册/登录）目前为后续功能预留：
- 📝 发帖 / 评论
- ❤️ 个人收藏
- 👤 关注歌手
- ⚙️ 个人设置保存
- 🎵 播放历史同步

Admin 管理接口当前**暂未启用权限验证**，后续按需开启。

---

## 用户认证系统

> 基于 **Supabase Auth + JWT (ECC P-256)** 的用户认证系统。密码由 Supabase 托管，Worker 通过 JWKS 公钥验证 JWT，无需存储密钥。

### 认证架构

```
前端 → Worker (jose 验证 JWT) → Supabase Auth (签发 JWT)
                            → D1 (存储用户资料、设置)
```

**Token 说明**:
- 登录/注册成功后返回 `token`（access_token）和 `refresh_token`
- 需要认证的接口需在 Header 中携带: `Authorization: Bearer <token>`
- Token 过期后可用 `refresh_token` 刷新

---

### 🔐 用户注册

注册新用户。内部使用 `{username}@moody.app` 伪邮箱（对用户透明）。

**接口**: `POST /api/user/register`

**请求体**:
```json
{
  "username": "testuser",
  "password": "123456"
}
```

**字段说明**:
| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| username | string | 是 | 用户名，3-20字符，仅支持字母、数字、下划线、中文 |
| password | string | 是 | 密码，至少6个字符 |

**请求示例**:
```bash
curl -X POST "https://m-api.changgepd.top/api/user/register" \
  -H "Content-Type: application/json" \
  -d '{"username": "testuser", "password": "123456"}'
```

**返回示例（成功）**:
```json
{
  "code": 200,
  "message": "注册成功",
  "user": {
    "id": 1,
    "supabase_uid": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "username": "testuser",
    "email": "testuser@moody.app",
    "level": 1,
    "role": "user",
    "avatar_url": null,
    "created_at": "2026-04-10T12:00:00Z"
  },
  "token": "eyJhbGciOiJFUzI1NiIs...",
  "refresh_token": "v1.MrH4..."
}
```

**错误响应**:
| HTTP 状态码 | code | 说明 |
|------------|------|------|
| 400 | 400 | 用户名或密码格式不符合要求 |
| 409 | 409 | 用户名已被注册 |
| 500 | 500 | 服务器错误 |

---

### 🔑 用户登录

用户名 + 密码登录，返回 JWT Token。

**接口**: `POST /api/user/login`

**请求体**:
```json
{
  "username": "testuser",
  "password": "123456"
}
```

**请求示例**:
```bash
curl -X POST "https://m-api.changgepd.top/api/user/login" \
  -H "Content-Type: application/json" \
  -d '{"username": "testuser", "password": "123456"}'
```

**返回示例（成功）**:
```json
{
  "code": 200,
  "message": "登录成功",
  "user": {
    "id": 1,
    "supabase_uid": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "username": "testuser",
    "email": "testuser@moody.app",
    "level": 1,
    "role": "user",
    "avatar_url": null,
    "created_at": "2026-04-10T12:00:00Z"
  },
  "token": "eyJhbGciOiJFUzI1NiIs...",
  "refresh_token": "v1.MrH4..."
}
```

**错误响应**:
| HTTP 状态码 | code | 说明 |
|------------|------|------|
| 400 | 400 | 用户名或密码为空 |
| 401 | 401 | 用户名或密码错误 |

---

### 🔄 刷新 Token

当 access_token 过期时，使用 refresh_token 获取新的 token。

**接口**: `POST /api/user/refresh`

**请求体**:
```json
{
  "refresh_token": "v1.MrH4..."
}
```

**请求示例**:
```bash
curl -X POST "https://m-api.changgepd.top/api/user/refresh" \
  -H "Content-Type: application/json" \
  -d '{"refresh_token": "v1.MrH4..."}'
```

**返回示例**:
```json
{
  "code": 200,
  "message": "刷新成功",
  "token": "eyJhbGciOiJFUzI1NiIs...",
  "refresh_token": "v1.Xk9p..."
}
```

---

### 👤 获取当前用户信息

获取当前登录用户的资料。需要 Bearer Token 认证。

**接口**: `GET /api/user/me`

**请求头**:
```
Authorization: Bearer <token>
```

**请求示例**:
```bash
curl "https://m-api.changgepd.top/api/user/me" \
  -H "Authorization: Bearer eyJhbGciOiJFUzI1NiIs..."
```

**返回示例**:
```json
{
  "code": 200,
  "message": "success",
  "user": {
    "id": 1,
    "supabase_uid": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "username": "testuser",
    "email": "testuser@moody.app",
    "level": 1,
    "role": "user",
    "avatar_url": null,
    "created_at": "2026-04-10T12:00:00Z"
  }
}
```

**错误响应**:
| HTTP 状态码 | code | 说明 |
|------------|------|------|
| 401 | 401 | 未登录或 Token 已过期 |

---

### ✏️ 更新用户资料

更新当前用户的头像或用户名。需要 Bearer Token 认证。

**接口**: `PUT /api/user/profile`

**请求头**:
```
Authorization: Bearer <token>
```

**请求体**:
```json
{
  "avatar_url": "https://example.com/avatar.jpg",
  "username": "newname"
}
```

**请求示例**:
```bash
curl -X PUT "https://m-api.changgepd.top/api/user/profile" \
  -H "Authorization: Bearer eyJhbGciOiJFUzI1NiIs..." \
  -H "Content-Type: application/json" \
  -d '{"avatar_url": "https://example.com/avatar.jpg"}'
```

**返回示例**:
```json
{
  "code": 200,
  "message": "更新成功",
  "user": {
    "id": 1,
    "supabase_uid": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "username": "testuser",
    "email": "testuser@moody.app",
    "level": 1,
    "role": "user",
    "avatar_url": "https://example.com/avatar.jpg",
    "created_at": "2026-04-10T12:00:00Z"
  }
}
```

---

### 📧 绑定邮箱

为当前用户绑定真实邮箱地址。需要 Bearer Token 认证。

**接口**: `POST /api/user/bind-email`

**请求头**:
```
Authorization: Bearer <token>
```

**请求体**:
```json
{
  "email": "user@example.com"
}
```

**请求示例**:
```bash
curl -X POST "https://m-api.changgepd.top/api/user/bind-email" \
  -H "Authorization: Bearer eyJhbGciOiJFUzI1NiIs..." \
  -H "Content-Type: application/json" \
  -d '{"email": "user@example.com"}'
```

**返回示例**:
```json
{
  "code": 200,
  "message": "邮箱绑定成功"
}
```

---

### ⚙️ 获取用户设置

获取当前用户的个性化设置（音量、主题、自动播放等）。需要 Bearer Token 认证。

**接口**: `GET /api/user/settings`

**请求头**:
```
Authorization: Bearer <token>
```

**请求示例**:
```bash
curl "https://m-api.changgepd.top/api/user/settings" \
  -H "Authorization: Bearer eyJhbGciOiJFUzI1NiIs..."
```

**返回示例**:
```json
{
  "code": 200,
  "message": "success",
  "last_volume": 0.7,
  "theme_mode": "dark",
  "auto_play": 1
}
```

---

### ⚙️ 更新用户设置

更新当前用户的个性化设置。需要 Bearer Token 认证。

**接口**: `PUT /api/user/settings`

**请求头**:
```
Authorization: Bearer <token>
```

**请求体**:
```json
{
  "last_volume": 0.8,
  "theme_mode": "light",
  "auto_play": 0
}
```

**字段说明**:
| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| last_volume | number | 否 | 音量 (0-1) |
| theme_mode | string | 否 | 主题模式 ("dark" / "light") |
| auto_play | number | 否 | 自动播放 (1=开启, 0=关闭) |

**请求示例**:
```bash
curl -X PUT "https://m-api.changgepd.top/api/user/settings" \
  -H "Authorization: Bearer eyJhbGciOiJFUzI1NiIs..." \
  -H "Content-Type: application/json" \
  -d '{"last_volume": 0.8, "theme_mode": "dark"}'
```

**返回示例**:
```json
{
  "code": 200,
  "message": "设置已更新"
}
```

---

## 系统状态与统计

### 🔵 系统探活

检查 Worker 服务是否正常运行。

**接口**: `GET /`

**请求示例**:
```bash
curl https://m-api.changgepd.top/
```

**返回示例**:
```
MOODY API Edge Worker is running!
```

---

### 📊 系统统计

获取数据库中艺人、专辑、歌曲的总数。

**接口**: `GET /api/admin/stats`

**请求示例**:
```bash
curl https://m-api.changgepd.top/api/admin/stats
```

**返回示例**:
```json
{
  "code": 200,
  "message": "success",
  "data": {
    "artists": 120,
    "albums": 1562,
    "tracks": 27661
  }
}
```

---

## 数据查询接口

### 🎵 艺人骨架列表

获取艺人列表，包含专辑数量统计。用于首屏极速加载。

**接口**: `GET /api/skeleton`

**参数**:
| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| group | string | 否 | 按首字母筛选（如 "A", "Z"） |

**请求示例**:
```bash
# 获取所有艺人
curl https://m-api.changgepd.top/api/skeleton

# 按首字母筛选
curl https://m-api.changgepd.top/api/skeleton?group=Z
```

**返回示例**:
```json
{
  "code": 200,
  "message": "success",
  "data": {
    "artists": [
      {
        "id": "db_1",
        "name": "周杰伦",
        "group": "Z",
        "category": "华语",
        "avatar": "https://m-api.changgepd.top/storage/avatars/zhoujielun.jpg",
        "albumCount": 14
      }
    ]
  }
}
```

---

### 🎶 完整歌曲数据

获取完整的艺人 -> 专辑 -> 歌曲嵌套结构，包含文件路径。

**接口**: `GET /api/songs`

**参数**:
| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| artistId | string | 否 | 艺人 ID（精确匹配，如 `db_123`） |
| artist | string | 否 | 歌手名（模糊匹配） |
| album | string | 否 | 专辑名（模糊匹配，支持繁简体） |

**请求示例**:
```bash
# 获取所有数据
curl https://m-api.changgepd.top/api/songs

# 按艺人筛选
curl https://m-api.changgepd.top/api/songs?artist=周杰伦

# 按专辑筛选
curl https://m-api.changgepd.top/api/songs?album=Jay
```

**返回示例**:
```json
{
  "code": 200,
  "message": "success",
  "data": [
    {
      "id": "db_1",
      "name": "周杰伦",
      "category": "华语",
      "avatar": "/storage/avatars/zhoujielun.jpg",
      "group": "Z",
      "albums": [
        {
          "title": "Jay",
          "year": "2000",
          "cover": "/storage/covers/c_1.jpg",
          "songs": [
            {
              "title": "可爱女人",
              "path": "music/周杰伦/Jay/s_10001.mp3",
              "lrc_path": "music/周杰伦/Jay/s_10001.lrc",
              "TrackIndex": 1
            }
          ]
        }
      ]
    }
  ]
}
```

---

### 🔍 全局模糊搜索

跨维度搜索歌手、专辑、歌曲名。

**接口**: `GET /api/search`

**参数**:
| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| q | string | 是 | 搜索关键词 |

**请求示例**:
```bash
curl "https://m-api.changgepd.top/api/search?q=晴天"
```

**返回示例**:
```json
{
  "code": 200,
  "message": "找到 15 条相关结果",
  "data": {
    "artists": [],
    "albums": [
      {
        "id": 8,
        "title": "七里香",
        "ArtistID": 1,
        "CoverURL": "/storage/covers/c_8.jpg"
      }
    ],
    "songs": [
      {
        "id": 10025,
        "title": "晴天",
        "ArtistID": 1,
        "Album_ID": 8,
        "FilePath": "music/周杰伦/七里香/s_10025.mp3"
      }
    ]
  }
}
```

---

### 🖼️ 欢迎页背景图

获取欢迎页随机背景图片列表。

**接口**: `GET /api/welcome-images`

**请求示例**:
```bash
curl https://m-api.changgepd.top/api/welcome-images
```

**返回示例**:
```json
{
  "code": 200,
  "message": "success",
  "data": [
    "cover1.jpg",
    "cover2.png",
    "cover3.webp"
  ]
}
```

---

## 存储服务

### 📦 R2 对象存储代理

直接访问 R2 存储的对象（音乐文件、封面、歌词等）。

**接口**: `GET /storage/{path}`

**说明**:
- 自动 CDN 缓存（30天）
- 支持所有媒体类型
- 路径示例：
  - `/storage/music/周杰伦/Jay/song.mp3`
  - `/storage/covers/c_1.jpg`
  - `/storage/lyrics/song.lrc`

**请求示例**:
```bash
# 获取音乐文件
curl https://m-api.changgepd.top/storage/music/周杰伦/Jay/s_10001.mp3

# 获取专辑封面
curl https://m-api.changgepd.top/storage/covers/c_1.jpg -o cover.jpg
```

---

## 专辑管理

### 🔍 搜索专辑

根据关键词或艺人 ID 搜索专辑。

**接口**: `GET /api/admin/albums/search`

**参数**:
| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| keyword | string | 否* | 搜索关键词（专辑名，支持模糊搜索） |
| artist_id | number | 否* | 艺人 ID（精确匹配） |
| limit | number | 否 | 返回数量限制，默认 20 |

*至少提供 `keyword` 或 `artist_id` 中的一个

**请求示例**:
```bash
curl "https://m-api.changgepd.top/api/admin/albums/search?keyword=smile&limit=20"
```

**返回示例**:
```json
{
  "code": 200,
  "message": "success",
  "data": {
    "count": 2,
    "albums": [
      {
        "id": 1562,
        "title": "Smile",
        "artist_id": 109,
        "artist_name": "张学友",
        "release_date": "1985",
        "cover_url": "https://m-api.changgepd.top/storage/covers/c_1562.jpg",
        "song_count": 11
      }
    ]
  }
}
```

---

### 📀 获取专辑详情

获取专辑的完整信息，包括艺人信息和歌曲列表。

**接口**: `GET /api/admin/albums/detail`

**参数**:
| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| album_id | number | 是 | 专辑 ID |

**请求示例**:
```bash
curl "https://m-api.changgepd.top/api/admin/albums/detail?album_id=1562"
```

---

### ✏️ 更新专辑信息

更新专辑的标题、发布日期、封面或艺人。

**接口**: `PATCH /api/admin/albums/:id`

**请求体**:
```json
{
  "title": "Smile (Remastered)",
  "release_date": "1985-10"
}
```

**请求示例**:
```bash
curl -X PATCH "https://m-api.changgepd.top/api/admin/albums/1562" \
  -H "Content-Type: application/json" \
  -d '{"title": "Smile (Remastered)", "release_date": "1985-10"}'
```

---

### 🗑️ 删除专辑

删除专辑及其所有歌曲。

**接口**: `POST /api/admin/albums/delete`

**请求体**:
```json
{
  "album_id": 1562
}
```

---

### 🔀 合并专辑

将一个专辑的所有歌曲合并到另一个专辑，然后删除源专辑。

**接口**: `POST /api/admin/albums/merge`

**请求体**:
```json
{
  "sourceId": 100,
  "targetId": 101
}
```

---

## 歌曲管理

### ✏️ 批量更新歌曲

批量更新歌曲的标题、TrackIndex 等信息。

**接口**: `POST /api/admin/songs/batch-update`

**请求体**:
```json
{
  "updates": [
    {"id": 27661, "title": "轻抚你的脸", "track_index": 1},
    {"id": 27657, "title": "爱的卡帮", "track_index": 2}
  ]
}
```

---

### 🧹 清空专辑下所有歌曲

删除指定专辑下的所有歌曲（保留专辑本身）。

**接口**: `POST /api/admin/songs/delete-all`

**请求体**:
```json
{
  "album_id": 1562
}
```

---

### ➕ 批量插入歌曲

批量插入新歌曲到指定专辑。

**接口**: `POST /api/admin/songs/batch-insert`

**请求体**:
```json
{
  "album_id": 1562,
  "songs": [
    {"title": "新歌曲", "file_path": "music/张学友/Smile/new_song.mp3", "track_index": 12}
  ]
}
```

---

### 🔄 移动歌曲到专辑

将指定歌曲移动到另一个专辑。

**接口**: `POST /api/admin/songs/move`

**请求体**:
```json
{
  "targetAlbumId": 100,
  "songIds": [101, 102, 103]
}
```

或使用 ID 范围：
```json
{
  "targetAlbumId": 100,
  "songIdRange": [101, 200]
}
```

---

### 📝 创建完整元数据

创建完整的艺人、专辑、歌曲元数据。用于后台上传后同步数据到 D1。

**接口**: `POST /api/admin/songs/create-full`

**请求体**:
```json
{
  "songs": [
    {
      "title": "可爱女人",
      "artist_name": "周杰伦",
      "album_title": "Jay",
      "file_path": "music/周杰伦/Jay/s_10001.mp3",
      "track_index": 1
    }
  ]
}
```

---

### 🔍 调试歌曲信息

查询指定 ID 的歌曲详细信息。

**接口**: `GET /api/admin/songs/debug?id={id}`

---

### 📤 文件上传（智能匹配）

上传音频文件并自动匹配到数据库中的歌曲记录。

**接口**: `POST /api/admin/upload`

**请求体** (multipart/form-data):
| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| files | File[] | 是 | 音频文件（支持多个） |
| artistOverride | string | 否 | 歌手名称覆盖 |
| albumOverride | string | 否 | 专辑名称覆盖 |
| titleOverride | string | 否 | 歌曲标题覆盖 |

---

## 运营友好接口

> ⭐ **推荐使用**：这些接口专为运营人员设计，使用**名称**而非 ID，操作简单直观，无需了解数据库结构。

所有运营接口都支持 **dry_run（预览模式）**，可以在不实际修改数据的情况下预览操作结果。

---

### 🎵 批量更新歌曲（按名称）

通过歌手名、专辑名来批量更新歌曲标题和曲目序号。

**接口**: `POST /api/admin/ops/songs/batch-update`

**参数**:
| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| artist_name | string | 是 | 歌手名称（支持模糊匹配） |
| album_title | string | 是 | 专辑名称（支持模糊匹配） |
| updates | array | 是 | 更新列表 |
| dry_run | boolean | 否 | 预览模式（不实际修改），默认 false |

**请求示例**:
```bash
curl -X POST "https://m-api.changgepd.top/api/admin/ops/songs/batch-update" \
  -H "Content-Type: application/json; charset=utf-8" \
  -d '{
    "artist_name": "张学友",
    "album_title": "Smile",
    "dry_run": true,
    "updates": [
      {"old_title": "轻抚你的脸", "new_title": "轻抚你的脸", "track_index": 1}
    ]
  }'
```

---

### 💿 重命名专辑

**接口**: `POST /api/admin/ops/albums/rename`

**参数**:
| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| artist_name | string | 是 | 歌手名称 |
| old_title | string | 是 | 专辑旧标题 |
| new_title | string | 是 | 专辑新标题 |
| dry_run | boolean | 否 | 预览模式 |

---

### 🎤 重命名艺人

**接口**: `POST /api/admin/ops/artists/rename`

**参数**:
| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| old_name | string | 是 | 艺人旧名称 |
| new_name | string | 是 | 艺人新名称 |
| dry_run | boolean | 否 | 预览模式 |

---

### 🔀 合并专辑（按名称）

**接口**: `POST /api/admin/ops/albums/merge`

**参数**:
| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| artist_name | string | 是 | 歌手名称 |
| source_album_title | string | 是 | 源专辑标题（将被删除） |
| target_album_title | string | 是 | 目标专辑标题（保留） |
| dry_run | boolean | 否 | 预览模式 |

---

### 🗑️ 删除专辑（按名称）

**接口**: `POST /api/admin/ops/albums/delete`

**参数**:
| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| artist_name | string | 是 | 歌手名称 |
| album_title | string | 是 | 专辑标题 |
| dry_run | boolean | 否 | 预览模式 |

---

### ➕ 批量插入歌曲（按名称）

**接口**: `POST /api/admin/ops/songs/batch-insert`

**参数**:
| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| artist_name | string | 是 | 歌手名称（不存在会自动创建） |
| album_title | string | 是 | 专辑名称（不存在会自动创建） |
| songs | array | 是 | 歌曲列表 |
| dry_run | boolean | 否 | 预览模式 |

---

### 🌟 运营接口 vs 技术接口对比

| 功能 | 运营接口 ⭐ | 技术接口 |
|------|------------|----------|
| 更新歌曲 | `POST /api/admin/ops/songs/batch-update` | `POST /api/admin/songs/batch-update` |
| 重命名专辑 | `POST /api/admin/ops/albums/rename` | `PATCH /api/admin/albums/:id` |
| 合并专辑 | `POST /api/admin/ops/albums/merge` | `POST /api/admin/albums/merge` |
| 删除专辑 | `POST /api/admin/ops/albums/delete` | `POST /api/admin/albums/delete` |
| 参数方式 | 使用**名称** | 使用 **ID** |
| 预览模式 | ✅ 支持 (`dry_run`) | ❌ 不支持 |
| 模糊匹配 | ✅ 支持 | ❌ 不支持 |

---

## 数据治理

### 🧹 清理无路径歌曲

删除指定专辑下没有 `file_path` 的歌曲记录。

**接口**: `POST /api/admin/songs/cleanup-no-path`

---

### 🧹 清理重复专辑

自动识别并删除重复的专辑占位符。

**接口**: `POST /api/admin/cleanup-duplicates`

---

### 🔧 修复路径前缀

为所有缺少 `music/` 前缀的歌曲路径添加前缀。

**接口**: `POST /api/admin/fix-paths`

---

## 调试工具

### 📊 R2 存储列表

列出 R2 存储桶中的所有 MP3 文件。

**接口**: `GET /api/debug/r2`

---

### 🔍 完整审计报告

对比 D1 数据库和 R2 存储，生成数据一致性报告。

**接口**: `GET /api/debug/audit`

---

### 🔌 Supabase 连通性测试

测试 Worker 到 Supabase 服务的连通性。

**接口**: `GET /api/debug/supabase-test`

---

## 用户系统 Postman 测试指南

### 测试流程

**1. 注册**:
```
POST https://m-api.changgepd.top/api/user/register
Content-Type: application/json

Body (raw JSON):
{
  "username": "testuser",
  "password": "123456"
}
```

**2. 登录**:
```
POST https://m-api.changgepd.top/api/user/login
Content-Type: application/json

Body (raw JSON):
{
  "username": "testuser",
  "password": "123456"
}
```
> 复制返回的 `token` 值，后续请求需要用到。

**3. 获取用户信息**:
```
GET https://m-api.changgepd.top/api/user/me
Authorization: Bearer <粘贴上一步的token>
```

**4. 获取用户设置**:
```
GET https://m-api.changgepd.top/api/user/settings
Authorization: Bearer <token>
```

**5. 更新用户设置**:
```
PUT https://m-api.changgepd.top/api/user/settings
Authorization: Bearer <token>
Content-Type: application/json

Body:
{
  "last_volume": 0.8,
  "theme_mode": "dark"
}
```

---

## ⚠️ 注意事项

1. **删除操作不可恢复**: 删除专辑或歌曲前请确认，操作无法撤销
2. **编码问题**: 批量更新中文标题时，确保请求头包含 `charset=utf-8`
3. **ID 的重要性**: 技术接口操作依赖 ID，请确保使用正确的 `album_id` 和 `song_id`
4. **R2 路径**: 所有文件路径必须以 `music/` 开头（相对 R2 根目录）
5. **运营接口推荐**: 日常运营操作优先使用 `ops` 系列接口，更安全、更直观

---

## 🔗 相关链接

- **Worker API**: `https://m-api.changgepd.top`
- **管理后台**: `https://qbxnkwidzabx.ap-southeast-1.clawcloudrun.com`
- **前端播放器**: `https://ddjokbqwfbce.ap-southeast-1.clawcloudrun.com`

---

**最后更新**: 2026-04-10
**维护者**: zhangjing02
**版本**: v14.0 (纯 Worker 架构 + 用户认证系统)
