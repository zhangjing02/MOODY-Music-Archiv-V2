# MOODY 内部开发知识库 (AI 持久化规则)

## 🏗️ 基础设施核心快照 (Infrastructure Snapshot)

### 1. 运行环境 (Runtime)
- **平台**: ClawCloud Run (ap-southeast-1)
- **镜像**: `昌哥/moodymusic:v12.58`
- **控制台 Env**: [Notion 详细列表](https://www.notion.so/MOODY-ClawCloud-R2-324840be9e1a81668c88cd42c70c33a7#🛠️-完整环境变量)

### 2. 存储与数据库 (Storage & DB)
- **R2 桶**: `moody-music-asset`
- **R2 端点**: `https://ae40b1192ed8367788d0341995e103e03463c471ace560c81a21b66b07c5.r2.cloudflarestorage.com/moody-music-asset`
- **D1 数据库 ID**: `a9591a5a-1c83-4c27-ad19-70a3aa4f11fc`
- **本地存储**: `e:\Html-work`

### 3. 网络与域名 (Networking)
- **生产 API**: `https://api-r2.changgepd.top`
- **资产直链**: `https://r2.changgepd.top`
- **Worker 转发层**: `https://moody-worker.changgepd.workers.dev`

---

## 🎲 自动化与代码 (Automation & Assets)
- **GitHub**: `https://github.com/zhangjing02/MOODY-Music-Archiv-V2`
- **Docker Hub**: `changgepd/moodymusic`
- **Hugging Face**: `hf_iox...` (用于备份同步)

---

## 🎯 核心原则 (Core Principles)

### 1. 三击不中对齐原则 (Three-Strike Baseline Alignment)
**定义**：连续 3 次尝试失败且未锁定本质原因时，必须立即停止“盲试”，向用户发起“物理配置对齐请求”（核实截图/Token）。

### 2. 配置即资产原则 (Config-as-an-Asset)
**定义**：任何环境变更（如 ClawCloud 控制台修改、Token 重写）必须第一时间同步至 [Notion 项目配置中心](https://www.notion.so/MOODY-ClawCloud-R2-324840be9e1a81668c88cd42c70c33a7)。

---
*注：⚠️ 故障排查红线规则已根据用户要求移至文档最下方。*
