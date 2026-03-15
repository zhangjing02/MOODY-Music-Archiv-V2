# MOODY 存储与 D1 数据维护自修复指南

## 1. 核心技术痛点回顾 (Pitfalls)

### 1.1 字符集与 Shell 编码陷阱 (Charset Mojibake)
- **现象**: 在 Windows PowerShell 或 CMD 中执行带中文字符的 `wrangler d1 execute` 命令时，SQL 语句中的中文路径（如 `music/李宗盛/...`）会变成乱码，导致查询失效或数据损坏。
- **坑位**: 即使通过 `chcp 65001` 切换到 UTF-8，Wrangler 与 D1 之间的管道传输有时仍会出现不可预测的字节切分。
- **最佳实践**: 
    - **优先使用子查询**: 尽量编写不含中文字符的 SQL，例如使用 `SET file_path = (SELECT file_path FROM songs WHERE id = XXX)`。
    - **Python 包装器**: 使用 Python 的 `subprocess.run(cmd, shell=True)` 来执行命令，利用 Python 更好的 Unicode 处理能力。

### 1.2 R2 物理资产与 D1 元数据错位 (Path Misalignment)
- **现象**: 存量数据中的 `file_path` 为相对路径（如 `Artist/Album/Song.mp3`），但 R2 桶中的实际对象 Key 带有 `music/` 前缀。
- **坑位**: 数据迁移后，如果不对 D1 全量更新补全前缀，前端生成的 Storage URL 将指向 404。
- **最佳实践**: 定期执行 `UPDATE songs SET file_path = 'music/' || file_path WHERE file_path NOT LIKE 'music/%';`。

### 1.3 冗余专辑冲突 (Duplicate Album Anomaly)
- **现象**: 数据库中由于不同来源（标准版 vs Deluxe 版）存在重名专辑。用户界面通常只显示第一个，如果该版本在 D1 中是无路径的空占位符，就会导致整张专辑无法“点亮”。
- **坑位**: 单纯靠标题匹配（Title Match）执行更新非常危险，可能误更新到错误的版本。
- **最佳实践**: 通过 `id` 偏移量关联，或在维护脚本中优先选择包含更多 `file_path` 非空的版本。

---

## 2. 数据库维护标准流程 (SOP)

### 2.1 数据点亮检查 (Audit)
1. 调用 `/api/debug/audit` 获取 R2 vs D1 完整对比。
2. 筛选 `found_in_r2 = false` 的记录。
3. 检查 `expected_r2_key` 是否真的存在于 R2（可通过控制台校验）。

### 2.2 批量路径修复
- **Worker API 方案 (推荐)**: 见后续章节代码，通过接口触发表内路径前缀自愈。
- **手动修复**: 
  ```bash
  npx wrangler d1 execute DB --remote --command "UPDATE songs SET file_path = 'music/' || file_path WHERE file_path NOT LIKE 'music/%' AND file_path IS NOT NULL;"
  ```

### 2.3 冗余清理
- 在管理后台检测 `artist_id` 相同且 `title` 相同的 `albums` 条目。
- 统计各版本的有效曲目数（`file_path IS NOT NULL`）。
- **保留原则**: 保留曲目数最多的版本，删除条目数少且无路径的版本。

---

## 3. 下一代架构优化建议
- **Metadata First**: R2 上传后，由后端/Worker 统一计算 MD5 或 UUID 作为 `file_path` 的核心，彻底摆脱中文字符串路径依赖。
- **Hash 定位**: 后续应将 R2 资产文件名逐步迁移为 D1 表中的 `id` 关联（如 `s_1024.mp3`），极大降低审计成本。

---

## 4. GitHub Actions 自动化部署 (CI/CD)

为了实现代码推送后自动更新 Claw Cloud 实例，您需要在 GitHub 仓库中配置以下 Secrets。

### 4.1 必需的 GitHub Secrets
请前往 GitHub 仓库的 `Settings` -> `Secrets and variables` -> `Actions` 下添加：

| Secret 名称 | 描述 | 获取方式 |
| :--- | :--- | :--- |
| `DOCKER_USERNAME` | Docker Hub 用户名 | 您的 Docker Hub 账户名 |
| `DOCKER_PASSWORD` | Docker Hub 访问令牌 (Token) | Docker Hub -> Settings -> Personal Access Tokens |

### 4.2 手动拉取更新
当您推送代码后，GitHub Actions 会自动构建新的镜像并推送到 Docker Hub。
要让服务器生效，您只需：
1. 登录 Claw Cloud 控制台。
2. 找到您的应用，执行 **Restart** (重启) 或 **Update** (更新)。
3. 服务器会拉取最新的 `:latest` 镜像并完成热更新。

### 4.3 注意事项
- 部署脚本默认的应用名称为 `moody`。如果您在 App Launchpad 中使用了不同的名字，请修改 `.github/workflows/deploy.yml` 中的 `kubectl rollout restart deployment/moody` 这一行。
- 更新触发后，Claw Cloud 通常在 30s-60s 内完成滚动更新。
