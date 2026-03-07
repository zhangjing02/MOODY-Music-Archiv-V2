# 🎵 MOODY Music Archive - 核心 API 接口手册 (V2.0)

本手册定义了 MOODY 系统的所有对外服务（8080）与管理后台（8082）接口。

---

## 🏗️ 全局配置
- **主服务端点**: `http://localhost:8080/api` (播放、搜索、基础查询)
- **管理服务端点**: `http://localhost:8082/api` (治理、清理、上传、统计)

---

## 1. 基础查询 (GET) - 端点: 8080

### 🟢 系统探活
- **接口**: `GET /api/status`
- **说明**: 检查后端服务是否就绪。

### 🎶 歌曲全元数据查询
- **接口**: `GET /api/songs`
- **参数**:
  - `artist`: 歌手名模糊匹配
  - `artistId`: 精确匹配 (如 `db_123`)
  - `album`: 专辑名模糊匹配
- **用途**: 获取完整的歌手 -> 专辑 -> 歌曲嵌套结构，包含物理路径。

### 📁 分组骨架树 (Skeleton)
- **接口**: `GET /api/skeleton`
- **参数**: `group` (可选，如 `A-Z`)
- **说明**: 用于首屏极速加载，仅包含基础层级。

### 🔍 全局模糊搜索
- **接口**: `GET /api/search?q=关键词`
- **说明**: 跨维度搜索歌手、专辑、歌曲名。

### 🖼️ 欢迎页背景名录
- **接口**: `GET /api/welcome-images`
- **返回**: `storage/welcome_covers` 下的可供随机显示的图片文件名列表。

---

## 2. 核心运维接口 (Governance) - 端点: 8082

### 🛠️ 统一治理中心 (The Master Connector)
这是系统最强大的接口，用于处理新歌入库、歌词绑定与数据库清理。

- **接口**: `POST /api/admin/governance`
- **Payload**:
```json
{
  "path": "周杰伦/Jay",   // 可选：限定操作目录
  "targets": ["sync-music", "sync-lyrics", "clean"] // 操作目标
}
```
- **Targets 可选值**:
  - `sync-music`: 扫描并 ID 化音频文件。
  - `sync-lyrics`: 扫描并绑定歌词。
  - `clean`: 执行全套大扫除（清理路径污染、合并重复、删孤儿记录）。

### 📊 数据大盘概览
- **接口**: `GET /api/admin/stats`
- **返回**: 统计库中歌手、专辑、歌曲的总数。

### 🚀 跨资产上传中心
- **接口**: `POST /api/admin/upload` (Multipart Form)
- **参数**: 
  - `files`: 文件对象数组
  - `artistOverride`: (选填) 强制指定歌手
  - `albumOverride`: (选填) 强制指定专辑
- **说明**: 文件落盘后会自动触发定向 Sync，并实时同步至 R2。

### 🔨 强力物理对齐 (Scrub)
- **接口**: `POST /api/admin/scrub`
- **说明**: 物理删除磁盘上名为 `s_ID.mp3` 但在数据库中不存在的沉余文件。

---

## 3. 专家级工具 (Expert Tools)

### 💊 专辑数据重塑
- **接口**: `POST /api/admin/album/update`
- **用途**: 用于修正机翻专辑名、手动补全缺失曲目。支持 `tracks` map 覆盖标题。

### 📡 iTunes 艺术家大满贯录入
- **接口**: `GET /api/metadata/sync?artist=歌手名`
- **说明**: 从 iTunes API 抓取该歌手完整名录并固化到本地数据库，形成空位占位符。

### 🔃 骨架缓存强刷
- **接口**: `POST /api/skeleton/reload`
- **说明**: 手动修改数据库后，通知后端重载内存缓存。

---

## 4. 歌词在线编辑 (Lyrics Engine)

### 📥 获取歌词源码
- **接口**: `GET /api/lyrics/raw?path=relative/path/to/lrc`
- **返回**: 纯文本 LRC 内容。

### 📤 保存修改
- **接口**: `POST /api/lyrics/update`
- **Payload**: `{"path": "...", "content": "..."}`

---

## 5. 错误监测
- **接口**: `POST /api/report-error`
- **说明**: 收集前端播放器加载失败的元数据。
