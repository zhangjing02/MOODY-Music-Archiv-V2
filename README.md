# MOODY 音乐库 (V2 Edge Edition)

这是一个基于 Cloudflare 生态系统构建的现代化、高性能音乐存储与流媒体系统。

## 🚀 核心架构

- **前端**: 使用 Vite + React (或 Vanilla JS) 构建的极简播放器。
- **边缘后端 (V2)**: 托管于 **Cloudflare Workers** (使用 Hono 框架)，提供高性能 API 与存储代理。
- **数据库**: **Cloudflare D1** (边缘关系型数据库)，存储艺人、专辑及歌曲元数据。
- **静态存储**: **Cloudflare R2** (对象存储)，存放音频 (`.mp3`)、歌词 (`.lrc`) 及封面资产。
- **缓存层**: 利用 Cloudflare Edge Cache 缓存高频访问的音频流，显著降低 R2 延迟。

---

## 🛠️ 管理与自愈能力

系统内置了一系列运维 API，可通过管理后台一键执行：

1. **路径自愈 (`/api/admin/fix-paths`)**: 自动扫描 D1 记录，补全存储所需的 `music/` 前缀。
2. **冗余清理 (`/api/admin/cleanup-duplicates`)**: 智能化识别并删除数据库中的重复专辑占位符，保留最完整的版本。
3. **数据一致性审计 (`/api/debug/audit`)**: 实时比对 R2 物理库存与 D1 元数据，快速定位缺失资产。

---

## 💻 部署与开发

### Worker 部署
```bash
cd cloudflare-worker
npm install
# 部署至 Cloudflare
npx wrangler deploy
```

### 数据库维护
若需手动更新数据库：
```bash
npx wrangler d1 execute DB --remote --command "SELECT * FROM songs LIMIT 10;"
```

---

## 📂 目录结构

- `/cloudflare-worker`: 核心 API 服务代码。
- `/frontend`: 播放器与管理后台前端。
- `/docs`: 技术文档与维护指南。
- `/scripts`: D1 数据初始化与辅助脚本。

## 📄 许可证
MIT License
