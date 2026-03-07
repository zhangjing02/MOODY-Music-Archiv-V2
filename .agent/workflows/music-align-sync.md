---
description: 歌曲下载后一键对齐、同步、校验的完整流程
---

# 歌曲对齐同步流程 (Music Align & Sync)

当用户将下载的歌曲放到 `E:\Html-work\storage\music\{歌手}\{专辑}\` 目录后，按以下步骤执行。

## 前置条件
- 歌曲已下载到正确的 **歌手/专辑** 目录下
- 后端服务已运行（`go run .\cmd\main.go` in `e:\Html-work\backend`）

## 流程步骤

### 1. 预览对齐（Dry-Run）

先用 dry-run 模式查看哪些文件需要重命名，确认映射无误。若用户指定了歌手名则加 `--artist` 参数，否则全量扫描。

```powershell
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$env:PYTHONIOENCODING='utf-8'
python -u e:\Html-work\backend\cmd\tools\safe_align.py --artist {歌手名} > e:\Html-work\_align_preview.txt 2>&1; type e:\Html-work\_align_preview.txt
```

- 检查输出中 `[RENAME]` 项是否正确（文件名 → 标准名）
- 确认 confidence（置信度）合理（≥30 可接受）
- **如果有异常映射，停下来与用户确认**

### 2. 执行对齐（Apply）

确认 dry-run 无误后，添加 `--apply` 参数执行实际重命名：

// turbo
```powershell
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$env:PYTHONIOENCODING='utf-8'
python -u e:\Html-work\backend\cmd\tools\safe_align.py --artist {歌手名} --apply > e:\Html-work\_align_apply.txt 2>&1; type e:\Html-work\_align_apply.txt
```

- 确认所有操作均为 `[DONE]`
- 确认文件数量与 dry-run 一致

### 3. 同步数据库

调用后端 `/api/sync` 接口，让数据库扫描新文件：

// turbo
```powershell
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Invoke-RestMethod -Uri "http://localhost:8080/api/sync" -Method GET | ConvertTo-Json
```

- 确认返回 `status: success`
- 检查 `message` 中新增歌曲数量是否与预期一致



### 4. 清理临时文件

// turbo
```powershell
Remove-Item e:\Html-work\_align_preview.txt, e:\Html-work\_align_apply.txt -ErrorAction SilentlyContinue
```

### 5. 页面验证

提醒用户刷新浏览器页面 `http://localhost:8080`，检查：
- 歌曲数量是否正确（无重复）
- 点击播放是否正常出声
- 是否有 "暂无音频资源" 的错误

## 安全保证
- `safe_align.py` 使用 `os.rename()` 原地重命名，**绝不删除文件**
- `safe_align.py` **绝不修改** skeleton.json
- 默认 dry-run 模式，必须显式 `--apply` 才执行
- 目标文件已存在时自动跳过
