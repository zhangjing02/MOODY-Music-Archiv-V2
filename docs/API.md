# MOODY 音乐库 API 文档 (v13.0 纯 Worker 架构)

本文档描述了 MOODY 系统的所有对外接口，基于 **Cloudflare Worker + D1 + R2** 纯边缘计算架构。

**基础 URL**: `https://moody-worker.changgepd.workers.dev`

**架构说明**：
- ❌ **已废弃**: 8080/8082 双端口 Go 后端架构（2025年前）
- ✅ **当前架构**: Cloudflare Worker 边缘计算 + D1 数据库 + R2 对象存储

---

## 📋 目录

1. [系统状态](#系统状态)
2. [数据查询接口](#数据查询接口)
3. [存储服务](#存储服务)
4. [专辑管理](#专辑管理)
5. [歌曲管理](#歌曲管理)
6. [数据治理](#数据治理)
7. [调试工具](#调试工具)
8. [运营友好接口](#运营友好接口) ⭐ **推荐使用**

---

## 系统状态

### 🔵 系统探活

检查 Worker 服务是否正常运行。

**接口**: `GET /`

**请求示例**:
```bash
curl https://moody-worker.changgepd.workers.dev/
```

**返回示例**:
```
MOODY API Edge Worker is running!
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
curl https://moody-worker.changgepd.workers.dev/api/skeleton

# 按首字母筛选
curl https://moody-worker.changgepd.workers.dev/api/skeleton?group=Z
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
        "avatar": "https://moody-worker.changgepd.workers.dev/storage/avatars/zhoujielun.jpg",
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
| album | string | 否 | 专辑名（模糊匹配，支持去括号） |

**请求示例**:
```bash
# 获取所有数据
curl https://moody-worker.changgepd.workers.dev/api/songs

# 按艺人筛选
curl https://moody-worker.changgepd.workers.dev/api/songs?artist=周杰伦

# 按专辑筛选
curl https://moody-worker.changgepd.workers.dev/api/songs?album=Jay
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
curl "https://moody-worker.changgepd.workers.dev/api/search?q=晴天"
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
curl https://moody-worker.changgepd.workers.dev/api/welcome-images
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

### 📊 系统统计

获取数据库中艺人、专辑、歌曲的总数。

**接口**: `GET /api/admin/stats`

**请求示例**:
```bash
curl https://moody-worker.changgepd.workers.dev/api/admin/stats
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
curl https://moody-worker.changgepd.workers.dev/storage/music/周杰伦/Jay/s_10001.mp3

# 获取专辑封面
curl https://moody-worker.changgepd.workers.dev/storage/covers/c_1.jpg -o cover.jpg
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
# 搜索专辑名包含 "smile" 的专辑
curl "https://moody-worker.changgepd.workers.dev/api/admin/albums/search?keyword=smile&limit=20"

# 搜索特定艺人的专辑
curl "https://moody-worker.changgepd.workers.dev/api/admin/albums/search?artist_id=109&limit=50"
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
        "cover_url": "https://moody-worker.changgepd.workers.dev/storage/covers/c_1562.jpg",
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
curl "https://moody-worker.changgepd.workers.dev/api/admin/albums/detail?album_id=1562"
```

**返回示例**:
```json
{
  "code": 200,
  "message": "success",
  "data": {
    "album": {
      "id": 1562,
      "title": "Smile",
      "artist_id": 109,
      "release_date": "1985",
      "cover_url": "https://moody-worker.changgepd.workers.dev/storage/covers/c_1562.jpg"
    },
    "artist": {
      "id": 109,
      "name": "张学友",
      "region": "港台"
    },
    "songs": [
      {
        "id": 27661,
        "title": "轻抚你的脸",
        "file_path": "music/张学友/Smile/s_27661.mp3",
        "lrc_path": null,
        "track_index": 1,
        "storage_id": "primary"
      }
    ],
    "song_count": 11
  }
}
```

---

### ✏️ 更新专辑信息

更新专辑的标题、发布日期、封面或艺人。

**接口**: `PATCH /api/admin/albums/:id`

**参数**:
| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| title | string | 否 | 新的专辑标题 |
| release_date | string | 否 | 发布日期 |
| cover_url | string | 否 | 封面 URL |
| artist_id | number | 否 | 艺人 ID |

**请求示例**:
```bash
curl -X PATCH "https://moody-worker.changgepd.workers.dev/api/admin/albums/1562" \
  -H "Content-Type: application/json" \
  -d '{"title": "Smile (Remastered)", "release_date": "1985-10"}'
```

**返回示例**:
```json
{
  "code": 200,
  "message": "成功更新专辑 1562",
  "meta": {
    "changes": 1
  }
}
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

**请求示例**:
```bash
curl -X POST "https://moody-worker.changgepd.workers.dev/api/admin/albums/delete" \
  -H "Content-Type: application/json" \
  -d '{"album_id": 1562}'
```

**返回示例**:
```json
{
  "code": 200,
  "message": "成功删除专辑及其 11 首歌曲",
  "data": {
    "album_id": 1562,
    "deleted_songs": 11
  }
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

**请求示例**:
```bash
curl -X POST "https://moody-worker.changgepd.workers.dev/api/admin/albums/merge" \
  -H "Content-Type: application/json" \
  -d '{"sourceId": 100, "targetId": 101}'
```

**返回示例**:
```json
{
  "code": 200,
  "message": "成功将专辑 100 合并至 101",
  "data": {
    "songsMoved": 12
  }
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
    {
      "id": 27661,
      "title": "轻抚你的脸",
      "track_index": 1
    },
    {
      "id": 27657,
      "title": "爱的卡帮",
      "track_index": 2
    }
  ]
}
```

**字段说明**:
| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| id | number | 是 | 歌曲 ID |
| title | string | 否 | 新的标题 |
| track_index | number | 否 | 新的 TrackIndex |
| album_id | number | 否 | 新的专辑 ID（用于移动歌曲） |

**请求示例**:
```bash
curl -X POST "https://moody-worker.changgepd.workers.dev/api/admin/songs/batch-update" \
  -H "Content-Type: application/json; charset=utf-8" \
  -d '{
    "updates": [
      {"id": 27661, "title": "轻抚你的脸", "track_index": 1},
      {"id": 27657, "title": "爱的卡帮", "track_index": 2}
    ]
  }'
```

**返回示例**:
```json
{
  "code": 200,
  "message": "成功批量更新 2 条歌曲信息"
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

**请求示例**:
```bash
curl -X POST "https://moody-worker.changgepd.workers.dev/api/admin/songs/delete-all" \
  -H "Content-Type: application/json" \
  -d '{"album_id": 1562}'
```

**返回示例**:
```json
{
  "code": 200,
  "message": "成功删除专辑 1562 下的 11 首歌曲",
  "data": {
    "album_id": 1562,
    "deleted_count": 11
  }
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
    {
      "title": "新歌曲",
      "file_path": "music/张学友/Smile/new_song.mp3",
      "track_index": 12
    }
  ]
}
```

**字段说明**:
| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| title | string | 是 | 歌曲标题 |
| file_path | string | 否 | 文件路径 |
| lrc_path | string | 否 | 歌词路径 |
| track_index | number | 否 | 曲目序号 |
| storage_id | string | 否 | 存储标识，默认 "primary" |

**请求示例**:
```bash
curl -X POST "https://moody-worker.changgepd.workers.dev/api/admin/songs/batch-insert" \
  -H "Content-Type: application/json" \
  -d '{
    "album_id": 1562,
    "songs": [
      {
        "title": "新歌曲",
        "file_path": "music/张学友/Smile/new_song.mp3",
        "track_index": 12
      }
    ]
  }'
```

**返回示例**:
```json
{
  "code": 200,
  "message": "成功插入 1 首歌曲",
  "data": {
    "album_id": 1562,
    "inserted_count": 1,
    "song_ids": [27667]
  }
}
```

---

### 🔄 移动歌曲到专辑

将指定歌曲移动到另一个专辑。

**接口**: `POST /api/admin/songs/move`

**请求体**（二选一）:
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

**请求示例**:
```bash
curl -X POST "https://moody-worker.changgepd.workers.dev/api/admin/songs/move" \
  -H "Content-Type: application/json" \
  -d '{"targetAlbumId": 100, "songIds": [101, 102, 103]}'
```

**返回示例**:
```json
{
  "code": 200,
  "message": "成功移动 3 首歌曲到专辑 100",
  "meta": {
    "changes": 3
  }
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
      "lrc_path": "music/周杰伦/Jay/s_10001.lrc",
      "track_index": 1,
      "duration": 240
    }
  ]
}
```

**字段说明**:
| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| title | string | 是 | 歌曲标题 |
| artist_name | string | 是 | 艺人名称 |
| album_title | string | 是 | 专辑标题 |
| file_path | string | 是 | 文件路径 |
| lrc_path | string | 否 | 歌词路径 |
| track_index | number | 否 | 曲目序号 |
| duration | number | 否 | 时长（秒） |

**请求示例**:
```bash
curl -X POST "https://moody-worker.changgepd.workers.dev/api/admin/songs/create-full" \
  -H "Content-Type: application/json" \
  -d '{
    "songs": [
      {
        "title": "可爱女人",
        "artist_name": "周杰伦",
        "album_title": "Jay",
        "file_path": "music/周杰伦/Jay/s_10001.mp3",
        "track_index": 1
      }
    ]
  }'
```

**返回示例**:
```json
{
  "code": 200,
  "message": "成功创建 1 首歌曲（艺人: 1, 专辑: 1）",
  "data": {
    "created_songs": 1,
    "created_artists": 1,
    "created_albums": 1,
    "song_ids": [10001]
  }
}
```

---

### 🔍 调试歌曲信息

查询指定 ID 的歌曲详细信息。

**接口**: `GET /api/admin/songs/debug`

**参数**:
| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| id | number | 是 | 歌曲 ID |

**请求示例**:
```bash
curl "https://moody-worker.changgepd.workers.dev/api/admin/songs/debug?id=27661"
```

**返回示例**:
```json
{
  "code": 200,
  "message": "success",
  "data": {
    "id": 27661,
    "title": "轻抚你的脸",
    "file_path": "music/张学友/Smile/s_27661.mp3",
    "track_index": 1,
    "album_id": 1562
  }
}
```

---

### 🧪 测试单条更新

测试单个歌曲的更新，返回更新前后的详细信息。

**接口**: `POST /api/admin/songs/test-update`

**请求体**:
```json
{
  "id": 27661,
  "title": "轻抚你的脸",
  "track_index": 1
}
```

**请求示例**:
```bash
curl -X POST "https://moody-worker.changgepd.workers.dev/api/admin/songs/test-update" \
  -H "Content-Type: application/json" \
  -d '{"id": 27661, "title": "轻抚你的脸", "track_index": 1}'
```

**返回示例**:
```json
{
  "code": 200,
  "message": "Update completed",
  "data": {
    "update_success": true,
    "rows_changed": 1,
    "before": {
      "id": 27661,
      "title": "轻抚你的脸",
      "track_index": 0
    },
    "after": {
      "id": 27661,
      "title": "轻抚你的脸",
      "track_index": 1
    }
  }
}
```

---

## 数据治理

### 🧹 清理无路径歌曲

删除指定专辑下没有 `file_path` 的歌曲记录。

**接口**: `POST /api/admin/songs/cleanup-no-path`

**请求体**:
```json
{
  "album_id": 1562
}
```

**请求示例**:
```bash
curl -X POST "https://moody-worker.changgepd.workers.dev/api/admin/songs/cleanup-no-path" \
  -H "Content-Type: application/json" \
  -d '{"album_id": 1562}'
```

**返回示例**:
```json
{
  "code": 200,
  "message": "清理完成：删除了 5 条无 path 的歌曲记录",
  "data": {
    "deleted_count": 5,
    "album_id": 1562
  }
}
```

**使用场景**:
- 清理重复数据（保留有文件的记录，删除无文件的占位符）
- 清理上传失败产生的空记录

---

### 🧹 清理重复专辑

自动识别并删除重复的专辑占位符。

**接口**: `POST /api/admin/cleanup-duplicates`

**请求示例**:
```bash
curl -X POST "https://moody-worker.changgepd.workers.dev/api/admin/cleanup-duplicates"
```

**返回示例**:
```json
{
  "code": 200,
  "message": "清理完成：回收了 68 个冗余专辑占位符",
  "data": {
    "deletedAlbums": 68
  }
}
```

**使用场景**:
- 清理全局重复数据
- 保留包含歌曲最多的专辑版本，删除其他占位符

---

### 🔧 修复路径前缀

为所有缺少 `music/` 前缀的歌曲路径添加前缀。

**接口**: `POST /api/admin/fix-paths`

**请求示例**:
```bash
curl -X POST "https://moody-worker.changgepd.workers.dev/api/admin/fix-paths"
```

**返回示例**:
```json
{
  "code": 200,
  "message": "成功对齐 1523 条音频路径前缀",
  "meta": {
    "changes": 1523
  }
}
```

**使用场景**:
- 修复数据迁移后的路径问题
- 统一 R2 存储路径格式

---

### 🎯 修复特定专辑

智能修复张学友 Smile 专辑的乱码标题（专用接口）。

**接口**: `POST /api/admin/fix-jacky-smile`

**请求示例**:
```bash
curl -X POST "https://moody-worker.changgepd.workers.dev/api/admin/fix-jacky-smile"
```

**返回示例**:
```json
{
  "code": 200,
  "message": "修复完成：更新了 11 首歌曲",
  "data": {
    "updated_count": 11,
    "verification": [
      {"id": 27661, "title": "轻抚你的脸", "track_index": 1},
      {"id": 27657, "title": "爱的卡帮", "track_index": 2}
    ]
  }
}
```

---

## 调试工具

### 📊 R2 存储列表

列出 R2 存储桶中的所有 MP3 文件（用于调试）。

**接口**: `GET /api/debug/r2`

**请求示例**:
```bash
curl https://moody-worker.changgepd.workers.dev/api/debug/r2
```

**返回示例**:
```json
{
  "scanned_objects": 5000,
  "total_mp3_found": 27661,
  "is_truncated": false,
  "prefixes": {
    "music": 27661,
    "covers": 1562,
    "avatars": 120
  },
  "keys": [
    "music/周杰伦/Jay/s_10001.mp3",
    "music/张学友/Smile/s_27661.mp3"
  ]
}
```

---

### 🔍 完整审计报告

对比 D1 数据库和 R2 存储，生成完整的数据一致性报告。

**接口**: `GET /api/debug/audit`

**请求示例**:
```bash
curl https://moody-worker.changgepd.workers.dev/api/debug/audit
```

**返回示例**:
```json
{
  "total_db_songs_with_path": 27661,
  "total_r2_mp3s": 27650,
  "matched": 27650,
  "missing_in_r2": 11,
  "sample_matched": [
    {
      "id": 10001,
      "title": "可爱女人",
      "db_path": "music/周杰伦/Jay/s_10001.mp3",
      "expected_r2_key": "music/周杰伦/Jay/s_10001.mp3",
      "found_in_r2": true
    }
  ],
  "sample_missing": [
    {
      "id": 10002,
      "title": "完美主义",
      "db_path": "music/周杰伦/Jay/s_10002.mp3",
      "expected_r2_key": "music/周杰伦/Jay/s_10002.mp3",
      "found_in_r2": false
    }
  ]
}
```

---

## 📝 完整工作流示例

### 场景 1：修复专辑乱码标题

**问题**: 张学友《Smile》专辑的歌曲标题是乱码。

**解决步骤**:

1. **搜索专辑**
   ```bash
   curl "https://moody-worker.changgepd.workers.dev/api/admin/albums/search?keyword=smile"
   ```

2. **获取专辑详情**
   ```bash
   curl "https://moody-worker.changgepd.workers.dev/api/admin/albums/detail?album_id=1562"
   ```

3. **批量更新歌曲标题**
   ```bash
   curl -X POST "https://moody-worker.changgepd.workers.dev/api/admin/songs/batch-update" \
     -H "Content-Type: application/json; charset=utf-8" \
     -d '{
       "updates": [
         {"id": 27661, "title": "轻抚你的脸", "track_index": 1},
         {"id": 27657, "title": "爱的卡帮", "track_index": 2},
         {"id": 27663, "title": "丝丝记忆", "track_index": 3}
       ]
     }'
   ```

**管理后台操作**:
1. 打开管理后台 → 专辑管理
2. 输入"smile"搜索
3. 点击专辑查看详情
4. 点击"批量编辑歌曲"
5. 修正标题后保存

---

### 场景 2：重建专辑数据

**问题**: 专辑数据完全错误，需要重新录入。

**解决步骤**:

1. **清空专辑下所有歌曲**
   ```bash
   curl -X POST "https://moody-worker.changgepd.workers.dev/api/admin/songs/delete-all" \
     -H "Content-Type: application/json" \
     -d '{"album_id": 1562}'
   ```

2. **批量插入正确的歌曲数据**
   ```bash
   curl -X POST "https://moody-worker.changgepd.workers.dev/api/admin/songs/batch-insert" \
     -H "Content-Type: application/json" \
     -d '{
       "album_id": 1562,
       "songs": [
         {"title": "轻抚你的脸", "file_path": "music/张学友/Smile/s_27661.mp3", "track_index": 1},
         {"title": "爱的卡帮", "file_path": "music/张学友/Smile/s_27657.mp3", "track_index": 2}
       ]
     }'
   ```

**管理后台操作**:
1. 搜索专辑并查看详情
2. 点击"清空所有歌曲"
3. 使用超级上传功能重新上传文件

---

### 场景 3：合并重复专辑

**问题**: 发现同一专辑有多个重复记录。

**解决步骤**:

1. **查看重复专辑**
   ```bash
   curl "https://moody-worker.changgepd.workers.dev/api/admin/albums/search?keyword=Jay"
   ```

2. **合并专辑**
   ```bash
   curl -X POST "https://moody-worker.changgepd.workers.dev/api/admin/albums/merge" \
     -H "Content-Type: application/json" \
     -d '{"sourceId": 100, "targetId": 101}'
   ```

3. **清理全局重复**
   ```bash
   curl -X POST "https://moody-worker.changgepd.workers.dev/api/admin/cleanup-duplicates"
   ```

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

**updates 数组项**:
| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| old_title | string | 是 | 歌曲旧标题（模糊匹配） |
| new_title | string | 是 | 歌曲新标题 |
| track_index | number | 否 | 新的曲目序号 |

**请求示例**:
```bash
# 预览模式（不实际修改）
curl -X POST "https://moody-worker.changgepd.workers.dev/api/admin/ops/songs/batch-update" \
  -H "Content-Type: application/json; charset=utf-8" \
  -d '{
    "artist_name": "张学友",
    "album_title": "Smile",
    "dry_run": true,
    "updates": [
      {"old_title": "轻抚你的脸", "new_title": "轻抚你的脸", "track_index": 1},
      {"old_title": "爱的卡帮", "new_title": "爱的卡帮", "track_index": 2}
    ]
  }'

# 实际执行
curl -X POST "https://moody-worker.changgepd.workers.dev/api/admin/ops/songs/batch-update" \
  -H "Content-Type: application/json; charset=utf-8" \
  -d '{
    "artist_name": "张学友",
    "album_title": "Smile",
    "dry_run": false,
    "updates": [
      {"old_title": "轻抚你的脸", "new_title": "轻抚你的脸", "track_index": 1},
      {"old_title": "爱的卡帮", "new_title": "爱的卡帮", "track_index": 2}
    ]
  }'
```

**返回示例**:
```json
{
  "code": 200,
  "message": "成功更新 2 首歌曲",
  "data": {
    "artist": { "id": 109, "name": "张学友" },
    "album": { "id": 1562, "title": "Smile" },
    "dry_run": false,
    "results": [
      {
        "old_title": "轻抚你的脸",
        "new_title": "轻抚你的脸",
        "track_index": 1,
        "status": "updated",
        "message": "已更新: 轻抚你的脸 → 轻抚你的脸"
      },
      {
        "old_title": "爱的卡帮",
        "new_title": "爱的卡帮",
        "track_index": 2,
        "status": "updated",
        "message": "已更新: 爱的卡帮 → 爱的卡帮"
      }
    ]
  }
}
```

**使用场景**:
- 修复专辑中的歌曲标题乱码
- 调整歌曲的曲目序号
- 批量修改歌曲名称

---

### 💿 重命名专辑

修改专辑的标题。

**接口**: `POST /api/admin/ops/albums/rename`

**参数**:
| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| artist_name | string | 是 | 歌手名称（支持模糊匹配） |
| old_title | string | 是 | 专辑旧标题（支持模糊匹配） |
| new_title | string | 是 | 专辑新标题 |
| dry_run | boolean | 否 | 预览模式，默认 false |

**请求示例**:
```bash
# 预览
curl -X POST "https://moody-worker.changgepd.workers.dev/api/admin/ops/albums/rename" \
  -H "Content-Type: application/json; charset=utf-8" \
  -d '{
    "artist_name": "周杰伦",
    "old_title": "Jay",
    "new_title": "Jay (20周年纪念版)",
    "dry_run": true
  }'

# 实际执行
curl -X POST "https://moody-worker.changgepd.workers.dev/api/admin/ops/albums/rename" \
  -H "Content-Type: application/json; charset=utf-8" \
  -d '{
    "artist_name": "周杰伦",
    "old_title": "Jay",
    "new_title": "Jay (20周年纪念版)",
    "dry_run": false
  }'
```

**返回示例**:
```json
{
  "code": 200,
  "message": "成功将专辑 \"Jay\" 重命名为 \"Jay (20周年纪念版)\"",
  "data": {
    "artist": { "id": 1, "name": "周杰伦" },
    "old_album": { "id": 1, "title": "Jay" },
    "new_title": "Jay (20周年纪念版)"
  }
}
```

---

### 🎤 重命名艺人

修改艺人的名称。

**接口**: `POST /api/admin/ops/artists/rename`

**参数**:
| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| old_name | string | 是 | 艺人旧名称（支持模糊匹配） |
| new_name | string | 是 | 艺人新名称 |
| dry_run | boolean | 否 | 预览模式，默认 false |

**请求示例**:
```bash
# 预览
curl -X POST "https://moody-worker.changgepd.workers.dev/api/admin/ops/artists/rename" \
  -H "Content-Type: application/json; charset=utf-8" \
  -d '{
    "old_name": "周杰伦",
    "new_name": "Jay Chou 周杰伦",
    "dry_run": true
  }'

# 实际执行
curl -X POST "https://moody-worker.changgepd.workers.dev/api/admin/ops/artists/rename" \
  -H "Content-Type: application/json; charset=utf-8" \
  -d '{
    "old_name": "周杰伦",
    "new_name": "Jay Chou 周杰伦",
    "dry_run": false
  }'
```

**返回示例**:
```json
{
  "code": 200,
  "message": "成功将艺人 \"周杰伦\" 重命名为 \"Jay Chou 周杰伦\"",
  "data": {
    "old_artist": { "id": 1, "name": "周杰伦" },
    "new_name": "Jay Chou 周杰伦"
  }
}
```

---

### 🔀 合并专辑（按名称）

将一个专辑的所有歌曲合并到另一个专辑（按名称操作）。

**接口**: `POST /api/admin/ops/albums/merge`

**参数**:
| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| artist_name | string | 是 | 歌手名称（支持模糊匹配） |
| source_album_title | string | 是 | 源专辑标题（将被删除） |
| target_album_title | string | 是 | 目标专辑标题（保留） |
| dry_run | boolean | 否 | 预览模式，默认 false |

**请求示例**:
```bash
# 预览
curl -X POST "https://moody-worker.changgepd.workers.dev/api/admin/ops/albums/merge" \
  -H "Content-Type: application/json; charset=utf-8" \
  -d '{
    "artist_name": "周杰伦",
    "source_album_title": "Jay (再版)",
    "target_album_title": "Jay",
    "dry_run": true
  }'

# 实际执行
curl -X POST "https://moody-worker.changgepd.workers.dev/api/admin/ops/albums/merge" \
  -H "Content-Type: application/json; charset=utf-8" \
  -d '{
    "artist_name": "周杰伦",
    "source_album_title": "Jay (再版)",
    "target_album_title": "Jay",
    "dry_run": false
  }'
```

**返回示例**:
```json
{
  "code": 200,
  "message": "成功将 12 首歌曲从 \"Jay (再版)\" 合并到 \"Jay\"",
  "data": {
    "artist": { "id": 1, "name": "周杰伦" },
    "source_album": { "id": 100, "title": "Jay (再版)" },
    "target_album": { "id": 1, "title": "Jay" },
    "songs_moved": 12
  }
}
```

**使用场景**:
- 合并重复的专辑
- 合并同一专辑的不同版本

---

### 🗑️ 删除专辑（按名称）

删除指定专辑及其所有歌曲（按名称操作）。

**接口**: `POST /api/admin/ops/albums/delete`

**参数**:
| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| artist_name | string | 是 | 歌手名称（支持模糊匹配） |
| album_title | string | 是 | 专辑标题（支持模糊匹配） |
| dry_run | boolean | 否 | 预览模式，默认 false |

**请求示例**:
```bash
# 预览
curl -X POST "https://moody-worker.changgepd.workers.dev/api/admin/ops/albums/delete" \
  -H "Content-Type: application/json; charset=utf-8" \
  -d '{
    "artist_name": "测试歌手",
    "album_title": "测试专辑",
    "dry_run": true
  }'

# 实际执行
curl -X POST "https://moody-worker.changgepd.workers.dev/api/admin/ops/albums/delete" \
  -H "Content-Type: application/json; charset=utf-8" \
  -d '{
    "artist_name": "测试歌手",
    "album_title": "测试专辑",
    "dry_run": false
  }'
```

**返回示例**:
```json
{
  "code": 200,
  "message": "成功删除专辑 \"测试专辑\" 及其 10 首歌曲",
  "data": {
    "artist": { "id": 999, "name": "测试歌手" },
    "deleted_album": { "id": 1234, "title": "测试专辑" },
    "deleted_songs": 10
  }
}
```

**⚠️ 警告**: 删除操作不可恢复，建议先使用 `dry_run: true` 预览！

---

### ➕ 批量插入歌曲（按名称）

向指定专辑批量插入新歌曲（按名称操作）。

**接口**: `POST /api/admin/ops/songs/batch-insert`

**参数**:
| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| artist_name | string | 是 | 歌手名称（如果不存在会自动创建） |
| album_title | string | 是 | 专辑名称（如果不存在会自动创建） |
| songs | array | 是 | 歌曲列表 |
| dry_run | boolean | 否 | 预览模式，默认 false |

**songs 数组项**:
| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| title | string | 是 | 歌曲标题 |
| file_path | string | 否 | 文件路径 |
| track_index | number | 否 | 曲目序号 |

**请求示例**:
```bash
# 预览
curl -X POST "https://moody-worker.changgepd.workers.dev/api/admin/ops/songs/batch-insert" \
  -H "Content-Type: application/json; charset=utf-8" \
  -d '{
    "artist_name": "周杰伦",
    "album_title": "最新专辑",
    "dry_run": true,
    "songs": [
      {"title": "新歌1", "track_index": 1},
      {"title": "新歌2", "track_index": 2}
    ]
  }'

# 实际执行
curl -X POST "https://moody-worker.changgepd.workers.dev/api/admin/ops/songs/batch-insert" \
  -H "Content-Type: application/json; charset=utf-8" \
  -d '{
    "artist_name": "周杰伦",
    "album_title": "最新专辑",
    "dry_run": false,
    "songs": [
      {"title": "新歌1", "track_index": 1},
      {"title": "新歌2", "track_index": 2}
    ]
  }'
```

**返回示例**:
```json
{
  "code": 200,
  "message": "成功插入 2 首歌曲",
  "data": {
    "artist_id": 1,
    "album_id": 20,
    "inserted_count": 2,
    "song_ids": [10001, 10002]
  }
}
```

**特点**:
- 如果歌手不存在，会自动创建
- 如果专辑不存在，会自动创建
- 适合快速添加新内容

---

### 📝 运营接口最佳实践

#### 1. 始终先使用预览模式

```bash
# 第一步：预览
curl -X POST "https://moody-worker.changgepd.workers.dev/api/admin/ops/songs/batch-update" \
  -H "Content-Type: application/json; charset=utf-8" \
  -d '{
    "artist_name": "张学友",
    "album_title": "Smile",
    "dry_run": true,
    "updates": [...]
  }'

# 第二步：检查预览结果，确认无误后再执行
curl -X POST "https://moody-worker.changgepd.workers.dev/api/admin/ops/songs/batch-update" \
  -H "Content-Type: application/json; charset=utf-8" \
  -d '{
    "artist_name": "张学友",
    "album_title": "Smile",
    "dry_run": false,
    "updates": [...]
  }'
```

#### 2. 模糊匹配的优势

```bash
# 不需要输入完整名称，支持模糊匹配
"artist_name": "周杰伦"      # 可以找到 "周杰伦"
"album_title": "Jay"         # 可以找到 "Jay"
"old_title": "晴天"          # 可以找到 "晴天"
```

#### 3. 常见运营场景

**场景 1：修复专辑乱码**
```bash
curl -X POST "https://moody-worker.changgepd.workers.dev/api/admin/ops/songs/batch-update" \
  -H "Content-Type: application/json; charset=utf-8" \
  -d '{
    "artist_name": "张学友",
    "album_title": "Smile",
    "updates": [
      {"old_title": "轻抚你的脸", "new_title": "轻抚你的脸", "track_index": 1},
      {"old_title": "爱的卡帮", "new_title": "爱的卡帮", "track_index": 2}
    ]
  }'
```

**场景 2：重命名专辑**
```bash
curl -X POST "https://moody-worker.changgepd.workers.dev/api/admin/ops/albums/rename" \
  -H "Content-Type: application/json; charset=utf-8" \
  -d '{
    "artist_name": "周杰伦",
    "old_title": "Jay",
    "new_title": "Jay (20周年纪念版)"
  }'
```

**场景 3：合并重复专辑**
```bash
curl -X POST "https://moody-worker.changgepd.workers.dev/api/admin/ops/albums/merge" \
  -H "Content-Type: application/json; charset=utf-8" \
  -d '{
    "artist_name": "周杰伦",
    "source_album_title": "Jay (再版)",
    "target_album_title": "Jay"
  }'
```

**场景 4：删除错误专辑**
```bash
curl -X POST "https://moody-worker.changgepd.workers.dev/api/admin/ops/albums/delete" \
  -H "Content-Type: application/json; charset=utf-8" \
  -d '{
    "artist_name": "测试歌手",
    "album_title": "错误专辑"
  }'
```

---

### 🌟 运营接口 vs 技术接口对比

| 功能 | 运营接口 ⭐ | 技术接口 |
|------|------------|----------|
| 更新歌曲 | `POST /api/admin/ops/songs/batch-update` | `POST /api/admin/songs/batch-update` |
| 重命名专辑 | `POST /api/admin/ops/albums/rename` | `PATCH /api/admin/albums/:id` |
| 合并专辑 | `POST /api/admin/ops/albums/merge` | `POST /api/admin/albums/merge` |
| 删除专辑 | `POST /api/admin/ops/albums/delete` | `POST /api/admin/albums/delete` |
| 参数方式 | 使用**名称**（歌手、专辑、歌曲） | 使用 **ID** |
| 预览模式 | ✅ 支持 (`dry_run`) | ❌ 不支持 |
| 模糊匹配 | ✅ 支持 | ❌ 不支持 |
| 适用人群 | 运营人员、非技术人员 | 开发人员、技术工具 |

**推荐**：日常运营操作优先使用运营接口，更安全、更直观！

---

## ⚠️ 注意事项

1. **删除操作不可恢复**: 删除专辑或歌曲前请确认，操作无法撤销
2. **编码问题**: 批量更新中文标题时，确保请求头包含 `charset=utf-8`
3. **ID 的重要性**: 所有操作都依赖 ID，请确保使用正确的 `album_id` 和 `song_id`
4. **权限验证**: 当前接口未实现权限验证，请勿公开管理后台地址
5. **R2 路径**: 所有文件路径必须以 `music/` 开头（相对 R2 根目录）

---

## 🔗 相关链接

- **管理后台**: `https://qbxnkwidzabx.ap-southeast-1.clawcloudrun.com`
- **Worker API**: `https://moody-worker.changgepd.workers.dev`
- **前端播放器**: `https://ddjokbqwfbce.ap-southeast-1.clawcloudrun.com`

---

## ❌ 已废弃接口（仅供参考）

以下接口来自 **旧版 Go 后端架构（8080/8082）**，现已废弃：

- ❌ `POST /api/admin/governance` - 统一治理中心
- ❌ `POST /api/admin/upload` - 本地上传中心
- ❌ `POST /api/admin/scrub` - 物理文件清理
- ❌ `POST /api/admin/album/update` - 专辑数据重塑
- ❌ `GET /api/metadata/sync` - iTunes 元数据同步
- ❌ `POST /api/skeleton/reload` - 骨架缓存强刷
- ❌ `GET /api/lyrics/raw` - 获取歌词源码
- ❌ `POST /api/lyrics/update` - 保存歌词修改
- ❌ `POST /api/report-error` - 错误监测

**替代方案**:
- 治理操作 → 使用 Worker 的 `batch-update`、`cleanup` 系列接口
- 上传功能 → 使用 Worker 的 `upload` 接口（见 `upload.ts`）
- 元数据同步 → 使用 `create-full` 接口手动创建元数据

---

**最后更新**: 2026-03-19
**维护者**: zhangjing02
**版本**: v13.0 (纯 Worker 架构)
