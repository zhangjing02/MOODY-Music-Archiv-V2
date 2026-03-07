---
description: 歌曲治理与 R2 同步一键流程
---

本工作流用于将新下载/上传的原始歌曲文件进行“治理”并同步到云端。

// turbo-all
1. 执行资产治理 (ID 化、重命名、生成 _contents.txt)
   ```powershell
   # 对特定歌手/专辑执行治理
   $body = @{
       path = "{歌手名}/{专辑名}"
       targets = @("music", "lyrics")
   } | ConvertTo-Json
   Invoke-RestMethod -Uri "http://localhost:8080/api/admin/governance" -Method POST -Body $body -ContentType "application/json"
   ```

2. 执行 R2 增量同步
   ```powershell
   cd backend/tools/migrate
   # 设置临时变量（也可以直接从 .env 读取）
   # $env:MOODY_STORAGE_PATH="E:\Html-work\storage"
   node migrate.mjs
   ```

3. 验证结果
   - 确认输出显示 `Sync Complete!`。
   - 确认 R2 控制台已出现相应 ID 化的文件。
