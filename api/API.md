# 🎵 MOODY Music Archive - 运维 API 接口文档

---

## 🏗️ 全局前置说明

- **本地开发**: `http://localhost:8080/api`
- **线上生产 (Zeabur)**: `https://moodymusic.zeabur.app/api`

---

## 1. 基础查询 (GET)

### 🟢 系统探活

检查服务是否在线。

- **接口**: `GET /api/status`
- **返回**:
```json
{"code": 200, "message": "Service is running"}
```

### 🎶 歌曲详情查询

按歌手/专辑查询数据库中的歌曲元数据，常用于排查脏数据。

- **接口**: `GET /api/songs`
- **参数**:
  - `artist` (可选): 歌手名模糊匹配，如 `?artist=周杰伦`
  - `album` (可选): 专辑名模糊匹配，如 `?album=七里香`
  - `artistId` (可选): 按歌手 ID 精确查询
- **示例**: `GET /api/songs?artist=周杰伦&album=Jay`
- **返回**: 歌手 → 专辑 → 歌曲层级结构，包含 `file_path`、`lrc_path` 等字段。

### 📁 骨架树拉取

一次性获取全站歌手/专辑/歌曲的字母分组层级树，用于前端首屏渲染。

- **接口**: `GET /api/skeleton`
- **返回**: 按首字母分组的歌手 → 专辑 → 歌曲树形结构。

### 🔍 全局搜索

跨歌手、专辑、歌曲的全文搜索。

- **接口**: `GET /api/search`
- **参数**: `q` (必传): 搜索关键词，如 `?q=晴天`

---

## 2. ⭐ 统一运维接口 (Governance)

**这是最核心的管理入口**，通过 `targets` 参数选择要执行的操作，通过 `path` 参数控制作用范围。

- **接口**: `POST /api/admin/governance`
- **Content-Type**: `application/json`

### 请求参数

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `path` | string | 否 | 限定操作范围，如 `"周杰伦/Jay"`。为空则全库。 |
| `targets` | string[] | 否 | 指定要执行的动作列表。为空则默认 `["sync-music", "sync-lyrics"]`。 |

### `targets` 可选值

| 值 | 含义 | 受 `path` 影响 |
|------|------|------|
| `sync-music` | 扫描音频文件，与名录匹配后入库并 ID 化 | ✅ |
| `sync-lyrics` | 扫描歌词文件，自动绑定到对应歌曲 | ✅ |
| `clean` | **全套大扫除**（等价于下面三项的合集） | 部分 |
| `clean-lyrics` | 仅清理被 `.mp3` 路径污染的歌词字段 | ✅ |
| `clean-duplicates` | 仅执行去重合并（同名艺人 + 同名专辑） | ❌ 全局 |
| `clean-orphans` | 仅清理孤儿实体（无歌曲的专辑、无专辑的歌手） | ❌ 全局 |

> 如果 `targets` 为空或不传，默认行为等同于 `["sync-music", "sync-lyrics"]`（向后兼容旧版调用）。

### 常用场景示例

**场景 1：全套大扫除 + 歌词重绑定**
```json
{"targets": ["clean", "sync-lyrics"]}
```

**场景 2：只同步某个歌手某张专辑的歌词**
```json
{"path": "周杰伦/Jay", "targets": ["sync-lyrics"]}
```

**场景 3：只清理被污染的歌词路径**
```json
{"targets": ["clean-lyrics"]}
```

**场景 4：只做去重合并**
```json
{"targets": ["clean-duplicates"]}
```

**场景 5：默认行为（向后兼容，等同于旧版一键治理）**
```json
{}
```

### 返回示例

```json
{
    "code": 200,
    "message": "运维指令已执行。大扫除完成: 清理3条污染路径, 合并0艺人/0专辑, 删除0孤儿专辑/0孤儿歌手 | 同步完成: 0首音频, 5首歌词",
    "data": {
        "scope": "",
        "targets": ["clean", "sync-lyrics"],
        "status": "done",
        "cleaned_lrc_paths": 3,
        "merged_artists": 0,
        "merged_albums": 0,
        "orphan_albums_deleted": 0,
        "orphan_artists_deleted": 0,
        "synced_music": 0,
        "synced_lyrics": 5
    }
}
```

---

## 3. 其他管理接口 (POST)

### 💊 专辑数据定向覆写

当专辑出现错别字、英文机翻等脏数据时，定向修正标题和曲目。

- **接口**: `POST /api/admin/album/update`
- **请求 Body**:
```json
{
  "artist_name": "李宗盛",
  "old_album_title": "我(們)就是這樣",
  "new_album_title": "我们就是这样",
  "tracks": {
    "0": "如风往事",
    "1": "希望"
  },
  "add_missing_tracks": [
     {"index": 10, "title": "隐藏曲"}
  ]
}
```

### 🔨 强力对齐 (Scrub)

剔除无挂载文件的脏名录 + 物理清扫磁盘上的冗余影子文件。

- **接口**: `POST /api/admin/scrub`
- **参数**: 无

### 🔄 全库全量重扫 (Full Sync)

核弹级操作。从头扫描全部文件并强力对齐。

- **接口**: `POST /api/sync/full`
- **参数**: 无（可选 `?artist_name=周杰伦` 限定单歌手）

### 🔃 强刷前端缓存树

当你手动修改了数据库后，用此接口强制刷新前端显示。

- **接口**: `POST /api/skeleton/reload`
- **参数**: 无

### 📡 客户端错误遥测

前端播放器自动上报的音频/歌词加载错误，聚合在 `client_errors` 表中，方便开发者排查。

- **接口**: `POST /api/report-error`
- **请求 Body**:
```json
{
  "type": "audio",
  "songId": 12345,
  "message": "404 Not Found"
}
```
- **查看方式**: 直接在 SQLite 中查询 `SELECT * FROM client_errors ORDER BY occurrence_count DESC`。

---

## 4. 用户相关 (可选)

### 用户登录
- **接口**: `POST /api/user/login`

### 用户设置
- **接口**: `GET/POST /api/user/settings`

---
