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

### 1.4 样式与封面回退 (Style & Cover Fallback)
- **现象**: 专辑封面缺失时显示系统默认的 `??????` 或第三方不可控的占位图。
- **最佳实践**: 
    - 统一使用本地静态资源 `src/assets/images/vinyl_default.png`。
    - 在前端 `updateView` 逻辑中，不论是加载失败 (`onError`) 还是数据缺失，均强制指向该本地路径。

## 2. 运维与部署标准流程 (SOP)

### 2.1 镜像更新 (Claw Cloud)
> [!WARNING]
> 在 GitHub 进行代码推送 (Push) 后，Claw Cloud 容器并不会自动热重载。
> - **必须点击 `Update`**: 只有点击控制台的 `Update` 按钮，Dockerrun 才会检查 Docker Hub 的版本更新。
> - **Restart 无效**: `Restart` 仅重启当前本地容器，无法加载新代码。

### 2.2 数据点亮检查 (Audit)
系统内置了一系列运维 API，可通过管理后台一键执行：

1. **路径自愈 (`/api/admin/fix-paths`)**: 自动扫描 D1 记录，补全存储所需的 `music/` 前缀。
2. **冗余清理 (`/api/admin/cleanup-duplicates`)**: 智能化识别并删除数据库中的重复专辑占位符，保留最完整的版本。
3. **数据一致性审计 (`/api/debug/audit`)**: 实时比对 R2 物理库存与 D1 元数据，快速定位缺失资产。

---

### 容器部署 (Claw Cloud Run)

前端代码通过 GitHub Actions 自动构建并推送到 Docker Hub。
> [!IMPORTANT]
> **代码推送后如何生效？**
> 由于 VPS 环境不会自动监听 Docker 仓库，您需要在 **Claw Cloud 控制台** 手动操作：
> 1. 登录 Claw Cloud 管理后台。
> 2. 找到 `moodymusic` 实例。
> 3. 点击 **`Update`** 按钮（注意：不是 `Restart`），平台才会拉取最新的镜像代码。

---

---

## 📂 目录结构

- `/cloudflare-worker`: 核心 API 服务代码。
- `/frontend`: 播放器与管理后台前端。
- `/docs`: 技术文档与维护指南。
- `/scripts`: D1 数据初始化与辅助脚本。

## 📄 许可证
MIT License
