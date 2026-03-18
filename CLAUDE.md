# CLAUDE.md

本文件为 Claude Code (claude.ai/code) 提供项目指导，包含架构说明、开发流程和关键实现细节。

---

## 📋 项目概述

**MOODY 音乐库 V2** 是一个现代化的音乐存储与流媒体系统，采用混合云架构：

- **边缘后端**：Cloudflare Worker (TypeScript/Hono) - 生产环境的真实数据存储
- **源站后端**：Go REST API (端口 8080/8082) - 本地开发和管理接口
- **前端界面**：极简播放器 + 管理后台
- **存储系统**：Cloudflare R2（生产）+ 本地文件系统（开发）

### 技术栈
- **后端**：Go 1.24+，标准库 `net/http`（非 Gin 框架）
- **边缘计算**：Cloudflare Workers + Hono + D1 数据库
- **存储**：AWS S3 SDK v2（对接 Cloudflare R2）
- **元数据**：dhowden/tag（MP3 标签解析）
- **前端**：Vite + Vanilla JS（无框架）

---

## 🌐 生产环境配置

### 域名和端口
```
前端播放器：https://ddjokbqwfbce.ap-southeast-1.clawcloudrun.com
管理后台：  https://qbxnkwidzabx.ap-southeast-1.clawcloudrun.com
Worker API： https://moody-worker.changgepd.workers.dev
```

### ⚠️ 重要架构理解

**为什么采用 Worker 边缘上传？**
- Go 后端（运行在 ClawCloud）到 Cloudflare R2 的跨云上传延迟高
- Cloudflare Worker 与 R2 同地域，上传速度提升 10x+
- Worker 直接绑定 D1 和 R2，无需网络调用
- 参考 `云端上传架构设计方案.md` 了解完整决策过程

**双数据库架构**：
1. **Cloudflare D1**：生产环境的真实数据库，存储所有艺人、专辑、歌曲数据
2. **本地 SQLite**：仅为空架构（`storage/db/moody.db`），**不存储实际数据**

**数据流向**：
```
用户请求 → Cloudflare Worker（边缘缓存）
           ↓ 缓存命中 → 直接返回
           ↓ 缓存未命中 → Cloudflare D1 数据库
```

**本地开发环境**：
- Go 后端会启动服务（8080/8082），但数据库为空
- 需要通过 Cloudflare Worker API 获取真实数据
- 本地主要用于管理后台功能（上传、治理等）

---

## 🔧 开发命令

### Go 后端（本地开发）
```bash
cd backend

# 编译
go build -o main ./cmd/main.go

# 运行（默认端口 8080 + 8082）
./main

# 使用环境变量
MOODY_STORAGE_PATH=/path/to/storage \
MOODY_DB_PATH=/path/to/db \
MOODY_FRONTEND_PATH=/path/to/frontend \
./main

# 运行测试
go test ./...
```

**前端测试**：
```bash
cd frontend/tests
npm install
npm test  # 运行前端测试套件
```

### 前端（本地调试）
```bash
cd frontend

# 前端为纯静态 HTML/CSS/JS，无需构建
# 直接用浏览器打开 index.html 即可

# 或使用简易 HTTP 服务器
python -m http.server 8000
# 然后访问 http://localhost:8000
```

### Cloudflare Worker（生产 API）
```bash
cd cloudflare-worker

# 安装依赖
npm install

# 本地开发（使用 wrangler）
npx wrangler dev

# 部署到 Cloudflare
npx wrangler deploy

# 类型检查
npx tsc --noEmit
```

**Wrangler 配置**：
- `wrangler.toml` 定义了 D1 数据库绑定（`moody-d1-test`）
- R2 bucket 绑定（`moody-music-asset`）
- 部署前确保已登录：`npx wrangler login`

### Docker（生产部署）
```bash
# 构建镜像（注意：Go 1.24 需要 golang:1.24-alpine 基础镜像）
docker build -t moodymusic:latest .

# 运行容器
docker run -p 8080:8080 -p 8082:8082 \
  -e MOODY_STORAGE_PATH=/app/storage \
  moodymusic:latest
```

**Docker 构建注意事项**：
- 使用 `CGO_ENABLED=0` 构建纯 Go 二进制，避免动态链接依赖
- 显式指定 `GOARCH=amd64` 以适配 ClawCloud 平台
- 前端静态资源直接复制到容器内（无需构建过程）

---

## 🏗️ 核心架构

### 双服务设计
Go 后端同时运行两个 HTTP 服务：
- **端口 8080**（`main`）：公共 API，提供播放器接口和媒体流
- **端口 8082**（`admin`）：管理 API，提供数据治理、批量上传等功能

### 多存储策略
存储层通过代理系统抽象化（`backend/pkg/s3client/`）：

1. **主存储**：Cloudflare R2（S3 兼容对象存储）
2. **备用存储**：本地文件系统（`storage/music/`、`storage/covers/`、`storage/lyrics/`）
3. **智能路由**：处理器自动尝试 R2，失败时回退到本地存储

**环境变量配置**：
```bash
# R2 配置
R2_ACCOUNT_ID=your_account_id
R2_ACCESS_KEY_ID=your_access_key
R2_SECRET_ACCESS_KEY=your_secret_key
R2_BUCKET_NAME=moody-music-asset
R2_ENDPOINT=https://your_account_id.r2.cloudflarestorage.com

# 本地存储路径
MOODY_STORAGE_PATH=./storage
```

### 目录结构
```
Music-Archiv-V2/
├── backend/                     # Go 后端应用
│   ├── cmd/                    # 入口点
│   │   ├── main.go             # 双服务初始化
│   │   └── tools/              # 管理工具（数据迁移、R2 同步等）
│   ├── internal/
│   │   ├── database/           # SQLite 操作与迁移
│   │   ├── handler/            # HTTP 处理器（公共 + 管理）
│   │   ├── model/              # 数据结构
│   │   └── service/            # 业务逻辑（标签解析、搜索等）
│   └── pkg/s3client/           # R2/S3 存储客户端
├── cloudflare-worker/          # 边缘计算层
│   ├── src/index.ts           # Worker 主文件
│   ├── wrangler.toml          # Cloudflare 配置
│   └── *.sql                  # 数据修复脚本
├── frontend/                   # 播放器界面
│   ├── admin/                 # 管理后台
│   └── src/                   # 播放器源码
├── storage/                    # 本地存储（开发模式）
│   ├── music/                 # MP3 文件
│   ├── covers/                # 专辑封面
│   ├── lyrics/                # LRC 歌词文件
│   └── db/                    # SQLite 数据库（空架构）
└── scripts/                    # 数据修复脚本
```

---

## 🔌 核心 API 接口

### 公共 API（端口 8080）
```
GET /api/skeleton              # 轻量级艺人列表（快速加载）
GET /api/songs                 # 完整层级数据（艺人→专辑→歌曲）
GET /api/search?q={query}      # 全局搜索
GET /api/welcome-images        # 背景图片
GET /api/status                # 健康检查
```

### 管理 API（端口 8082）
```
POST /api/admin/governance     # 主治理工具（路径修复、重复清理）
GET  /api/admin/stats          # 系统统计
POST /api/admin/upload         # 批量文件上传
POST /api/admin/scrub          # 物理清理孤立文件
POST /api/admin/fix-paths      # 自动修复缺失的 music/ 前缀
```

### Cloudflare Worker API（生产环境）
```
GET  /api/skeleton             # 艺人骨架数据
GET  /api/songs                # 完整歌曲数据
GET  /api/admin/stats          # 系统大盘
POST /api/admin/songs/batch-update  # 批量更新歌曲信息
POST /api/admin/albums/merge   # 合并专辑
```

---

## 💾 数据库架构

### Cloudflare D1（生产环境）
**核心表结构**：
```sql
-- 艺人表
artists (id, name, region, bio, photo_url)

-- 专辑表
albums (id, title, release_date, genre, cover_url, artist_id)

-- 歌曲表
songs (id, title, duration, file_path, lrc_path, album_id, storage_id, track_index)

-- 用户相关
users, playlists, playlist_songs
```

**重要字段说明**：
- `file_path`：相对路径，带 `music/` 前缀（如 `music/李宗盛/不舍/s_10025.mp3`）
- `storage_id`：多存储后端支持（R2 vs 本地）
- `track_index`：歌曲在专辑中的排序
- **UTF-8 编码严格强制**：所有文本字段使用 UTF-8

### 本地 SQLite（开发环境）
- **仅为空架构**，不存储实际数据
- 用于测试和开发时的结构参考
- 实际数据全部在 Cloudflare D1

---

## 🔍 数据验证与修复流程

### 典型问题场景
1. **专辑名错别字**：如"不舍"显示为"不拾"
2. **歌曲名混杂英文**：如"I Do Love You"应为"我是真的爱你"
3. **路径前缀缺失**：缺少 `music/` 前缀导致文件无法访问

### 修复流程（基于李宗盛专辑修复经验）

#### 步骤 1：SQL 脚本修复数据库层面
```sql
-- cloudflare-worker/fix_jonathan_albums.sql

-- 1. 合并冗余专辑
UPDATE songs SET album_id = 735 WHERE album_id = 736;
UPDATE songs SET album_id = 738 WHERE album_id = 1752;

-- 2. 标题规范化
UPDATE albums SET title = '不捨' WHERE id = 735;
UPDATE albums SET title = '我们就是这样' WHERE id = 738;

-- 3. 清理冗余占位符
DELETE FROM albums WHERE id IN (736, 1752);
```

#### 步骤 2：Python 脚本批量更新歌曲标题
```python
# scripts/fix_utf8_titles.py

API_BASE = "https://moody-worker.changgepd.workers.dev"

updates = [
    {"id": 10025, "title": "我是真的爱你"},
    {"id": 10026, "title": "不舍的牵绊"},
    # ... 更多歌曲
]

response = requests.post(
    f"{API_BASE}/api/admin/songs/batch-update",
    data=json.dumps({"updates": updates}, ensure_ascii=False).encode('utf-8'),
    headers={"Content-Type": "application/json"}
)
```

**关键点**：
- 必须使用 `ensure_ascii=False` 确保中文字符正确传输
- 使用 Cloudflare Worker 的批量更新 API（不是本地 Go 后端）

#### 步骤 3：验证修复结果
```bash
# 通过 API 验证
curl "https://moody-worker.changgepd.workers.dev/api/songs" > data.json

# 使用 Node.js 解析验证
node -e "
const data = JSON.parse(fs.readFileSync('data.json', 'utf8'));
const artist = data.data.find(a => a.name === '李宗盛');
// 检查歌曲标题是否全部为中文
"
```

### 数据治理工具

**自动化维护功能**：
1. **路径自愈**：扫描并修复缺失的 `music/` 前缀
2. **重复清理**：识别并删除冗余的专辑占位符
3. **数据审计**：对比 R2 物理文件 vs D1 元数据
4. **批量上传**：拖拽上传 + 自动元数据提取

---

## 🚀 部署流程

### CI/CD 流程
1. 推送代码到 `main` 分支
2. GitHub Actions 自动构建 Docker 镜像
3. 镜像推送到 Docker Hub (`clawcloud/moodymusic:latest`)

### ⚠️ ClawCloud 部署（关键步骤）

**重要**：代码推送后，容器不会自动更新！必须手动操作：

1. 登录 ClawCloud 管理控制台
2. 找到 `moodymusic` 实例
3. 点击 **"Update"** 按钮（不是 "Restart"）
4. 等待容器拉取最新镜像并重启

**原因**：
- "Restart" 仅重启当前容器，不会拉取新代码
- "Update" 会检查 Docker Hub 的版本更新并拉取

### 健康检查
```bash
# 检查公共 API
curl https://ddjokbqwfbce.ap-southeast-1.clawcloudrun.com/api/status

# 检查管理 API
curl https://qbxnkwidzabx.ap-southeast-1.clawcloudrun.com/api/admin/stats

# 检查 Worker API
curl https://moody-worker.changgepd.workers.dev/api/admin/stats
```

---

## 📝 常见开发任务

### 添加新音乐
1. 使用管理上传 API：`POST /api/admin/upload`（端口 8082）
2. 或手动放置文件到 `storage/music/` 并运行治理工具
3. 系统自动提取元数据并更新数据库

### 修复损坏路径
```bash
curl -X POST http://localhost:8082/api/admin/fix-paths
```

### 清理重复数据
```bash
curl -X POST http://localhost:8082/api/admin/governance \
  -H "Content-Type: application/json" \
  -d '{"action": "cleanup_duplicates"}'
```

### 批量更新歌曲信息
```python
# 通过 Cloudflare Worker API
import requests, json

API_BASE = "https://moody-worker.changgepd.workers.dev"
updates = [
    {"id": 10025, "title": "新的歌曲名"},
    # ... 更多更新
]

response = requests.post(
    f"{API_BASE}/api/admin/songs/batch-update",
    data=json.dumps({"updates": updates}, ensure_ascii=False).encode('utf-8'),
    headers={"Content-Type": "application/json"}
)
```

---

## ⚠️ 重要实现细节

### 上传流程与 autoIDify
**文件上传的关键步骤**（v12.60+）：
1. **前端**：用户拖拽文件到管理后台
2. **本地重命名**：Go 后端通过 `autoIDify` 为文件生成唯一 ID（如 `s_10025.mp3`）
3. **本地暂存**：重命名后的文件暂存在 `storage/music/` 目录
4. **Worker 上传**：通过 Worker API 将重命名后的文件上传到 R2
5. **D1 记录**：元数据写入 Cloudflare D1 数据库

**为什么本地重命名后上传？**
- 参考 `上传失败问题修复报告.md`
- 避免 Worker 和本地同时生成 ID 导致冲突
- 确保 file_path 字段与 R2 物理路径一致

### 文件路径处理
- 所有音乐文件必须在数据库中带 `music/` 前缀
- 治理工具（`/api/admin/fix-paths`）可自动修复缺失前缀
- 存储代理自动在 R2 和本地文件系统间路由

### 标签解析（MP3 元数据）
使用 `dhowden/tag` 库提取：
- 艺人、专辑、标题、年份、流派
- 内嵌封面图（提取到 `storage/covers/`）
- 时长、BPM、情绪（如果可用）

### 边缘计算（Cloudflare Worker）
Worker 作为智能代理：
- **缓存策略**：媒体资产 30 天缓存头
- **API 代理**：可从 Cloudflare D1 提供服务，而不是源站
- **存储代理**：在边缘位置缓存 R2 资产

### 字符编码处理
- **严格 UTF-8**：所有数据库字段使用 UTF-8 编码
- **ID3 标签**：MP3 标签使用正确的编码检测解码
- **中文字符**：元数据完全支持 CJK 字符
- **JSON 序列化**：Python 脚本必须使用 `ensure_ascii=False`

### 错误处理
- 存储不可用时服务优雅降级
- 自动回退到备用存储后端
- 详尽的日志记录用于调试

---

## 🔧 故障排查

### 端口冲突
```bash
# 检查端口占用
netstat -an | grep ":8080"
netstat -an | grep ":8082"

# 终止进程
kill -9 <PID>
```

### 数据库锁定
- 检查是否有多个实例在运行
- SQLite 不支持高并发写入

### R2 连接问题
- 验证环境变量
- 检查端点 URL 格式
- 确认访问密钥有效性

### 路径问题
- 运行治理工具自动修复路径
- 检查 `music/` 前缀是否存在

### 数据未更新
- 确认在 ClawCloud 点击了 "Update" 而不是 "Restart"
- 检查 Worker 是否需要重新部署
- 验证 Cloudflare D1 数据库状态

---

## 📚 相关文档

- `README.md` - 中文项目概述
- `docs/CLAUDE.md` - 旧版本（已过时，指静态 HTML 版本）
- `李宗盛专辑修复总结.md` - 数据修复案例
- `.agent/skills/` - AI 自动化脚本
- `.agent/workflows/` - 自动化工作流

---

## 🎯 快速参考

### 环境变量速查
```bash
# 核心路径
MOODY_STORAGE_PATH=./storage
MOODY_DB_PATH=./storage/db/moody.db
MOODY_FRONTEND_PATH=./frontend

# 服务器配置
MOODY_PORT=8080
MOODY_ADMIN_PORT=8082

# Cloudflare R2
R2_ACCOUNT_ID=your_account_id
R2_ACCESS_KEY_ID=your_access_key
R2_SECRET_ACCESS_KEY=your_secret_key
R2_BUCKET_NAME=moody-music-asset
```

### 域名速查
```
生产前端：https://ddjokbqwfbce.ap-southeast-1.clawcloudrun.com
生产管理：https://qbxnkwidzabx.ap-southeast-1.clawcloudrun.com
Worker API：https://moody-worker.changgepd.workers.dev
```

### 常用 API
```bash
# 获取艺人列表
curl https://moody-worker.changgepd.workers.dev/api/skeleton

# 获取完整数据
curl https://moody-worker.changgepd.workers.dev/api/songs

# 系统统计
curl https://moody-worker.changgepd.workers.dev/api/admin/stats

# 本地健康检查
curl http://localhost:8080/api/status
```

---

## 💡 最佳实践

1. **数据优先**：以数据库为准，不轻易根据磁盘文件修改数据库
2. **UTF-8 优先**：所有文本数据使用 UTF-8 编码
3. **批量操作**：使用 Cloudflare D1 的 batch API 提高性能
4. **测试先行**：先在测试环境验证，再应用到生产环境
5. **备份意识**：重要操作前先备份导出数据
6. **手动部署**：ClawCloud 需要手动点击 Update，不要依赖自动重启

---

**最后更新**：2026-03-18
**维护者**：zhangjing02
**版本**：v12.60+ (autoIDify 本地重命名架构)

---

## 🔍 进一步阅读

### 项目演进历史
- `云端上传架构设计方案.md` - 为什么选择 Worker 边缘上传而非 Go 后端直传
- `上传失败问题修复报告.md` - v12.60 之前的上传问题排查与解决方案
- `李宗盛专辑修复总结.md` - UTF-8 编码修复与数据治理实战案例

### AI 自动化能力
- `.agent/skills/` - 可复用的自动化脚本（如数据验证、批量更新）
- `.agent/workflows/` - 多步骤任务编排（如完整的数据修复流程）
