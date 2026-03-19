# MOODY 音乐库管理 API 文档

本文档描述了所有专辑和歌曲管理相关的 API 接口。

**基础 URL**: `https://moody-worker.changgepd.workers.dev`

---

## 📋 目录

1. [专辑管理](#专辑管理)
   - [搜索专辑](#搜索专辑)
   - [获取专辑详情](#获取专辑详情)
   - [删除专辑](#删除专辑)
2. [歌曲管理](#歌曲管理)
   - [批量更新歌曲](#批量更新歌曲)
   - [清空专辑下所有歌曲](#清空专辑下所有歌曲)
   - [批量插入歌曲](#批量插入歌曲)
3. [清理工具](#清理工具)
   - [清理无路径歌曲](#清理无路径歌曲)
   - [清理重复专辑](#清理重复专辑)

---

## 专辑管理

### 🔍 搜索专辑

根据关键词模糊搜索专辑。

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

**管理后台操作**:
1. 在"专辑管理"页面搜索专辑
2. 点击搜索结果中的专辑即可查看详情

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

**管理后台操作**:
1. 搜索并选择专辑
2. 点击"删除专辑"按钮
3. 确认删除

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

**管理后台操作**:
1. 搜索并选择专辑
2. 点击"批量编辑歌曲"按钮
3. 在文本框中编辑歌曲列表（格式：`歌曲标题,TrackIndex`）
4. 点击"保存更改"

**文本框示例**:
```
轻抚你的脸,1
爱的卡帮,2
丝丝记忆,3
局外人,4
怀抱的您,5
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

**管理后台操作**:
1. 搜索并选择专辑
2. 点击"清空所有歌曲"按钮
3. 确认清空

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

## 清理工具

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

## ⚠️ 注意事项

1. **删除操作不可恢复**: 删除专辑或歌曲前请确认，操作无法撤销
2. **编码问题**: 批量更新中文标题时，确保请求头包含 `charset=utf-8`
3. **ID 的重要性**: 所有操作都依赖 ID，请确保使用正确的 `album_id` 和 `song_id`
4. **权限验证**: 当前接口未实现权限验证，请勿公开管理后台地址

---

## 🔗 相关链接

- **管理后台**: `https://qbxnkwidzabx.ap-southeast-1.clawcloudrun.com`
- **Worker API**: `https://moody-worker.changgepd.workers.dev`
- **前端播放器**: `https://ddjokbqwfbce.ap-southeast-1.clawcloudrun.com`

---

**最后更新**: 2026-03-19
**维护者**: zhangjing02
