---
name: MOODY 存储同步 Skill (R2 Manifest)
description: 实现高效、增量、跨机器的资产同步至 Cloudflare R2。
---

# MOODY 存储同步 Skill (R2 Manifest)

本技能用于在多台电脑间同步 `storage/` 目录下的音频、歌词与封面图至 R2。它使用云端的 `manifest.json` 来实现增量同步，无需全量扫描。

## 适用场景
- 新增歌曲、歌词或封面到本地 `storage/`。
- 在不同设备（如家里电脑与公司电脑）之间同步资产。
- 保证 R2 存储与本地 ID 化后的文件结构严格一致。

## 准备工作 (新机器)

1. **环境配置**：
   - 确保已安装 Node.js。
   - 在 `backend/tools/migrate` 目录下，根据 `.env.example` 创建 `.env` 文件。
   - 填写 `MOODY_STORAGE_PATH`、`WORKER_ENDPOINT` 和 `MIGRATE_TOKEN`。

2. **依赖安装**：
   ```bash
   cd backend/tools/migrate
   npm install
   ```

## 同步流程

### 1. 资产治理 (ID化)
在同步前，必须确保本地文件已完成 ID 化。
如果是针对特定专辑，请运行 `MOODY 资产一键治理 Skill`。

### 2. 触发同步
在 `backend/tools/migrate` 目录下运行：
```bash
node migrate.mjs
```

### 3. 工作原理 (Manifest 模式)
- **下载 Manifest**：从 R2 获取现有的 `manifest.json`（包含文件名与大小）。
- **本地对比**：扫描本地 `music/`、`lyrics/`、`covers/`，仅找出 Manifest 中不存在或大小不匹配的文件。
- **差异上传**：仅上传增量文件。
- **更新云端**：上传完成后，自动更新 R2 上的 `manifest.json`。

## 常见问题
- **403 错误**：检查 `.env` 中的 `MIGRATE_TOKEN` 是否与 Cloudflare Worker 中的环境变量一致。
- **同步缓慢**：如果涉及超大文件同步，请确保代理（`SOCKS_PROXY`）连接稳定。
- **文件未更新**：如果文件内容变了但大小没变，Manifest 可能认为它是相同的。此时可以手动删除 R2 上的 `manifest.json` 触发全量重扫。

## 安全准则
- **不要将 `.env` 提交到 GitHub**。
- **不要手动删除 R2 上的 `manifest.json`**，除非确认需要全量强制同步。
