# 🚀 迁移到纯 Worker 架构 - 完整部署指南

## 📊 架构变化

### ❌ 旧架构（双后端，数据不同步）

```
前端播放器 → Worker API → D1 数据库
                          ↓
                      R2 存储

管理后台 → Go 后端 → 本地 SQLite (空)
                ↓
              R2 存储 (经常失败)
                ↓
              尝试同步到 D1 (不可靠)
```

### ✅ 新架构（纯 Worker，单一数据源）

```
前端播放器 → Worker API → D1 数据库
                          ↓
                      R2 存储

管理后台 → Worker API → D1 数据库
                          ↓
                      R2 存储

Go 后端 → 完全废弃（或仅用于本地开发）
```

---

## 🎯 优势

1. **✅ 单一数据源**：所有数据都在 Cloudflare D1，不再有同步问题
2. **✅ 统一后端**：只有 Worker，不再有 Go/Worker 混乱
3. **✅ 边缘优化**：Worker 提供全球边缘缓存，访问更快
4. **✅ 可靠性强**：直接上传到 R2，不再经过 Go 后端中转
5. **✅ 维护简单**：只需要维护一个后端（Worker）

---

## 📋 迁移步骤

### 步骤 1：备份现有数据（重要！）

```bash
# 1. 导出 D1 数据库
cd cloudflare-worker
npx wrangler d1 export moody-d1-test --output=backup_$(date +%Y%m%d).sql

# 2. 列出 R2 所有文件（作为备份记录）
npx wrangler r2 object list moody-music-asset > r2_backup_$(date +%Y%m%d).txt
```

### 步骤 2：部署新的 Worker 代码

```bash
# 1. 进入 Worker 目录
cd cloudflare-worker

# 2. 确认修改内容
git diff src/index.ts
git diff src/upload.ts

# 应该看到：
# - 新增文件上传 API
# - 集成 upload.ts 模块

# 3. 安装依赖（如有新增）
npm install

# 4. 部署到 Cloudflare
npx wrangler deploy

# 5. 验证部署成功
curl https://moody-worker.changgepd.workers.dev/api/admin/upload/status
# 应该返回统计信息
```

### 步骤 3：修改前端配置

前端代码已经修改完成（`frontend/admin/admin.js`），但需要重新部署：

**选项 A：使用 Worker 托管前端（推荐）**

```bash
# 1. 将前端文件复制到 Worker 的 public 目录
mkdir -p cloudflare-worker/public
cp -r frontend/* cloudflare-worker/public/

# 2. 修改 wrangler.toml，添加以下配置：
# [assets]
# directory = "public"
# binding = "ASSETS"

# 3. 重新部署 Worker
cd cloudflare-worker
npx wrangler deploy
```

**选项 B：继续使用 ClawCloud 托管前端**

```bash
# 前端代码已经修改完成，只需更新 ClawCloud 容器
# 但注意：前端现在会直接调用 Worker API，不再依赖 Go 后端
```

### 步骤 4：停止 Go 后端（重要！）

```bash
# 在 ClawCloud 控制台：
# 1. 找到 moodymusic 容器
# 2. 点击 "Stop" 按钮停止容器
# 3. （可选）删除容器以节省资源
```

**⚠️ 为什么必须停止 Go 后端？**
- 避免端口冲突
- 避免数据混乱
- 强制使用新的 Worker 上传流程

### 步骤 5：验证迁移效果

```bash
# 1. 测试 Worker 上传 API
curl -X POST https://moody-worker.changgepd.workers.dev/api/admin/upload \
  -F "files=@test.mp3" \
  -F "artistOverride=测试艺人" \
  -F "albumOverride=测试专辑"

# 应该返回：
# {
#   "code": 200,
#   "message": "上传完成: 成功 1 首，失败 0 首",
#   "data": {
#     "uploaded": 1,
#     "failed": 0,
#     "songs": [...]
#   }
# }

# 2. 验证 D1 数据
curl https://moody-worker.changgepd.workers.dev/api/admin/stats
# 检查歌曲数量是否增加

# 3. 验证 R2 文件
npx wrangler r2 object list moody-music-asset --prefix="music/测试艺人/"

# 4. 前端验证
# 打开管理后台：https://qbxnkwidzabx.ap-southeast-1.clawcloudrun.com/admin
# 上传一首歌曲，检查：
# - 上传成功提示
# - 前端播放器能否立即搜索到
```

---

## 🔄 完整的上传流程（新架构）

```
1. 用户填写：梁静茹 / 一夜成名
2. 选择 10 首 MP3 文件
3. 点击上传

4. Worker 自动执行：
   ✅ 检查 D1：艺人"梁静茹"是否存在？不存在则创建
   ✅ 检查 D1：专辑"一夜成名"是否存在？不存在则创建
   ✅ 构建 R2 路径：music/梁静茹/一夜成名/
   ✅ 逐个上传文件：
      - 生成唯一 ID：s_12345.mp3
      - 上传到 R2：music/梁静茹/一夜成名/s_12345.mp3
      - 写入 D1：歌曲记录（包含 file_path）
   ✅ 返回详细结果（成功/失败/详情）

5. 前端立即可以：
   - 搜索到新上传的歌曲
   - 播放新上传的歌曲
```

---

## 🎯 上传流程详细检查列表

### 实现的检查逻辑

✅ **艺人检查**：
- 查询 D1：`SELECT id FROM artists WHERE name = ?`
- 不存在则创建：`INSERT INTO artists (name, region) VALUES (?, '华语')`

✅ **专辑检查**：
- 查询 D1：`SELECT id FROM albums WHERE artist_id = ? AND title = ?`
- 不存在则创建：`INSERT INTO albums (artist_id, title) VALUES (?, ?)`

✅ **文件名生成**：
- 自动生成：`s_{songId}.mp3`
- 避免：文件名冲突
- 确保：可追踪性

✅ **R2 路径规范**：
- 格式：`music/{艺人}/{专辑}/s_{ID}.mp3`
- 示例：`music/梁静茹/一夜成名/s_12345.mp3`

✅ **元数据提取**：
- 当前：从文件名提取标题
- TODO：集成 MP3 标签解析库（jsmediatags）

---

## 📊 前后对比

### 修复前（Go 后端）

```javascript
// 前端调用
xhr.open('POST', '/api/admin/upload', true);  // 调用 Go 后端

// Go 后端处理
1. 保存到本地 storage/music/
2. 写入本地 SQLite（空）
3. 尝试上传到 R2（经常失败）
4. 尝试同步到 D1（可能失败）

// 问题
- 数据在两个地方（本地 SQLite + D1）
- 前端看不到数据（因为前端读 D1）
- 上传显示成功但实际失败
```

### 修复后（Worker）

```javascript
// 前端调用
xhr.open('POST', 'https://moody-worker.../api/admin/upload', true);  // 调用 Worker

// Worker 处理
1. 检查 D1：艺人/专辑是否存在
2. 上传到 R2：直接写入 R2 Bucket
3. 写入 D1：直接写入 D1 数据库
4. 返回结果：包含成功/失败详情

// 优势
- 单一数据源（只有 D1）
- 前端立即可见
- 失败有明确错误提示
```

---

## ⚠️ 常见问题

### Q1：Worker 的请求大小限制？

**A**：Cloudflare Worker 的请求大小限制是 **100MB**，你每次上传 10 首（每首 5-10MB），总共 50-100MB，**刚好在限制内**。

**建议**：
- 每次上传不超过 10 首歌曲
- 如果有更多，分批上传

### Q2：上传速度会变慢吗？

**A**：**不会**，反而可能更快！

**原因**：
- Worker 部署在全球边缘节点
- 直接上传到 R2（不经过 Go 后端中转）
- 避免了跨云传输（ClawCloud → R2）

### Q3：如何处理大文件（>100MB）？

**A**：当前方案的限制，可以考虑：

1. **分片上传**（复杂）：
   - 将大文件切分为多个小块
   - 逐个上传到 R2
   - Worker 端合并

2. **使用 R2 Presigned URL**（推荐）：
   - Worker 生成临时上传 URL
   - 前端直接上传到 R2
   - 绕过 Worker 的大小限制

### Q4：Go 后端完全废弃了吗？

**A**：**生产环境可以废弃**，但本地开发可能还有用：

**生产环境**：
- ✅ 完全不需要
- 可以停止 ClawCloud 容器
- 节省成本

**本地开发**：
- 可以保留用于本地测试
- 但数据不会同步到 D1

### Q5：如何迁移现有数据？

**A**：你当前的 D1 数据已经有所有数据了，不需要迁移！

**原因**：
- 前端播放器一直从 Worker/D1 读取数据
- Go 后端的本地 SQLite 是空的
- 所以直接切换即可

---

## ✅ 验证清单

部署完成后，请逐项检查：

### Worker 部署
- [ ] Worker 代码已部署成功
- [ ] `curl https://moody-worker.../api/admin/upload/status` 返回正常
- [ ] Worker 日志无错误（`npx wrangler tail`）

### 前端配置
- [ ] 前端已修改为调用 Worker API
- [ ] 管理后台可以正常打开
- [ ] 上传界面显示正常

### 上传功能
- [ ] 填写艺人/专辑信息
- [ ] 选择 MP3 文件
- [ ] 点击上传
- [ ] 显示成功消息（包含详细信息）
- [ ] 前端播放器可以立即搜索到

### 数据验证
- [ ] D1 数据库有新记录
- [ ] R2 存储有新文件
- [ ] 前端可以正常播放

### Go 后端
- [ ] ClawCloud 容器已停止（或删除）
- [ ] 节省成本

---

## 🎉 完成！

迁移完成后，你将拥有：

✅ **简洁的架构**：只有 Worker + D1 + R2
✅ **可靠的上传**：不再有"显示成功但实际失败"的问题
✅ **单一数据源**：所有数据在 D1，前端立即可见
✅ **快速的性能**：Worker 边缘缓存 + R2 直接存储

---

**迁移完成日期**：2026-03-18
**架构版本**：v13.0 (纯 Worker)
**维护者**：Claude Code AI Assistant
