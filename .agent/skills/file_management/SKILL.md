---
name: MOODY 资产一键治理 Skill
description: 自动处理用户上传的歌曲和歌词文件，执行 ID 化重命名、更新 _contents.txt 并同步数据库。
---

# MOODY 资产一键治理 Skill

当用户上传新的歌曲（.mp3, .flac 等）或歌词（.lrc）时，**必须**执行以下标准化治理流程。

## 适用场景
- 用户通过对话上传了歌曲/歌词。
- 用户指定了某个目录需要“理一理”或“一键修复”。
- 文件名不规范，需要与数据库名录对齐。

## 指令流程

### 1. 物理放置 (Placement)
- **歌曲**：移动至 `e:\Html-work\storage\music\{歌手名}\{专辑名}\{原文件名}.ext`。
- **歌词**：移动至 `e:\Html-work\storage\music\{歌手名}\{专辑名}\{原文件名}.lrc`（注意：先放在音乐目录下供后端扫描）。

### 2. 触发云端治理 (Cloud Governance)
通过 `run_command` 调用远程同步接口。该接口会自动执行以下操作：
- 在数据库中寻找匹配的标题条目。
- 将音乐改名为 `s_ID.mp3`。
- 将歌词移动至 `storage/lyrics/` 并改名为 `l_ID.lrc`。
- 为 LRC 注入 `[ti:歌名]`。
- **自动生成该文件夹下的 `_contents.txt`**。

```powershell
# 执行增量同步 (治理)
$body = @{
    path = "{歌手名}/{专辑名}"
    targets = @("music", "lyrics")
} | ConvertTo-Json
Invoke-RestMethod -Uri "http://localhost:8080/api/admin/governance" -Method POST -Body $body -ContentType "application/json"
```

### 3. 结果反馈 (Verification)
- 确认 API 返回 `code: 200`。
- 读取该目录下的 `_contents.txt` 以确认映射关系。
- 告知用户治理已完成，文件已“进化”为系统标准格式。

## 安全准则
- **原子性**：禁止手动在本地修改 `moody.db`，始终通过后端 API 同步。
- **持久化**：`_contents.txt` 是磁盘上的唯一索引备份，禁止删除。
- **兼容性**：支持模糊匹配（如“可爱女人.mp3”自动对接“可爱女人”名录）。
