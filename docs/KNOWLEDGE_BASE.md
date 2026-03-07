# 🧠 MOODY 工程化重构知识库 (Engineers' Knowledge Base)

本文件记录在项目重构过程中遇到的核心技术难题、环境坑点以及最终解决方案，旨在沉淀经验，避免“同样的石头绊倒两次”。

---

## 🛑 故障排查与教训 (Troubleshooting & Lessons)

### 1. SQLite 路径陷阱 (Error 14: unable to open database file)
- **现象**: 在重构目录结构后，频繁出现 `out of memory (14)` 错误。
- **原因**: SQLite 在 Go 中使用相对路径（如 `./storage/db/moody.db`）时，其解析基准是**命令行的执行路径**而非可执行文件所在的路径。多层目录结构下，手动切换 `cd` 会导致路径失效。
- **对策**: 
    - **禁止**在库初始化中使用相对路径字符串。
    - **方案**: 在 `main.go` 启动时，通过 `os.Getwd()` 获取绝对路径，并结合 `filepath.Dir()` 判断项目根目录，最终拼接成**全路径**传递给 `sql.Open`。

### 2. 端口及进程锁死 (Socket Address Bind Error)
- **现象**: 重新编译运行后端时报错 `Only one usage of each socket address is normally permitted`。
- **原因**: 之前的后端进程（`main.exe`）未被正确终止，依然持有 `8080` 端口。Windows 系统下，Ctrl+C 有时无法彻底杀掉子进程。
- **对策**: 
    - 运行前必须执行进程清理：`Get-Process -Name main -ErrorAction SilentlyContinue | Stop-Process -Force`。
    - 在后端代码中预留优雅关闭逻辑。

### 3. 环境路径差异 (Go Command Not Found)
- **现象**: 在子终端中直接调用 `go run` 提示找不到命令。
- **原因**: 不同 IDE 窗口或临时 shell 窗口的 `PATH` 环境变量可能不一致。
- **对策**: 
    - 第一次连接环境时，务必使用 `where.exe go` 锁定编译器物理路径。
    - 在本地执行脚本或命令时，建议使用变量 `$goPath = (where.exe go)[0]` 或直接硬编码物理路径 `D:\DevelopeTools\GO\bin\go.exe` 以确保 100% 成功率。

### 4. 架构重构后的数据一致性 (Schema Mismatch)
- **现象**: 编译报错 `s.Artist undefined`。
- **原因**: 数据库从单表平铺模型转向“歌手-专辑-歌曲”多表关联模型，导致旧代码中的字段名失效。
- **对策**: 
    - 修改 DB Schema 后，必须同步更新 `internal/model` 下的结构体定义。
    - 接口 Handler 应随着 SQL 语句的变更（如增加字段或 JOIN）同步通过 `rows.Scan` 调整映射关系。

### 5. UI 与播放器状态不同步 (UI/Player Desync)
- **现象**: 点击不可播放的歌曲时，UI 行立即高亮，但播放器由于报错而停留并继续播放上一首歌。
- **原因**: 业务逻辑层（`app.js`）采用了“抢跑（Eager）”更新模式，在调用播放引擎之前就修改了 UI 状态。
- **对策**: 
    - **中心化驱动**: 废除 UI 层的独立状态修改，所有 UI 变更必须由底层引擎（`player.js`）在确保操作成功（如 `audio.play()` 成功 resolve）后，通过回调或事件触发。
    - **先预检，后提交（Check-then-Commit）**: 
        1. **预检（Check）**: 使用 HEAD 请求检查资源可达性。
        2. **执行（Execute）**: 调用底层播放 API。
        3. **提交（Commit）**: 只有当播放确认开始后，才更新全局 UI（如进度条、高亮行、滚动歌词）。

---

## 🏛️ 标准操作规范 (Best Practices)

- **资源隔离**: 动态数据（音乐、歌词、封面、DB）必须统一存放在 `storage/` 目录下，严禁混入 `frontend/` 或 `backend/` 源代码区。
- **目录规范**: 遵循 `cmd/` (入口) + `internal/` (核心 logic) 的分层模式。
- **代码文档**: 所有的 `Struct` (类) 和 `Function` (方法) 必须包含中文注释，解释其设计意图而非仅仅复述代码。

---
> **最后更新时间**: 2026-01-28
> **维护者**: Antigravity
