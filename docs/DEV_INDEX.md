# MOODY Music Archiv V2 - Dev Index

> Auto-generated: 2026-04-15 (Asia/Shanghai)
> Goal: 开发命令与工作流 quick reference

## 1. 工作目录

- Repo root: `D:\PersonalProject\Music-Archiv-V2`
- Worker: `D:\PersonalProject\Music-Archiv-V2\cloudflare-worker`
- Frontend: `D:\PersonalProject\Music-Archiv-V2\frontend`

## 2. Worker 开发

```powershell
cd D:\PersonalProject\Music-Archiv-V2\cloudflare-worker
npm install
npx wrangler dev
```

Type check：

```powershell
cd D:\PersonalProject\Music-Archiv-V2\cloudflare-worker
npx tsc --noEmit
```

Deploy Worker：

```powershell
cd D:\PersonalProject\Music-Archiv-V2\cloudflare-worker
npx wrangler deploy
```

## 3. D1 Migration 命令

```powershell
cd D:\PersonalProject\Music-Archiv-V2\cloudflare-worker
npx wrangler d1 execute moody-d1-test --remote --file=migrations/001_create_user_profiles.sql
npx wrangler d1 execute moody-d1-test --remote --file=migrations/002_create_roster_system.sql
```

## 4. Frontend 本地调试

静态 Frontend 无需 build：

```powershell
cd D:\PersonalProject\Music-Archiv-V2\frontend
python -m http.server 8000
```

Open:

- Player: `http://localhost:8000`
- Admin: `http://localhost:8000/admin/`

## 5. Docker Build 与 Run

Build image：

```powershell
cd D:\PersonalProject\Music-Archiv-V2
docker build -t moodymusic:latest .
```

Run container（Dockerfile 暴露 8080/8082）：

```powershell
docker run -p 8080:8080 -p 8082:8082 moodymusic:latest
```

## 6. Production Endpoint

- Player: `https://ddjokbqwfbce.ap-southeast-1.clawcloudrun.com`
- Admin: `https://qbxnkwidzabx.ap-southeast-1.clawcloudrun.com`
- Worker API: `https://moody-worker.changgepd.workers.dev`
- Preferred API domain: `https://m-api.changgepd.top`

## 7. Health Check

```powershell
curl https://ddjokbqwfbce.ap-southeast-1.clawcloudrun.com
curl https://qbxnkwidzabx.ap-southeast-1.clawcloudrun.com
curl https://moody-worker.changgepd.workers.dev/api/admin/stats
curl https://m-api.changgepd.top/api/admin/stats
```

## 8. Deployment Runbook（当前流程）

1. Push code to `main`.
2. GitHub Actions builds/pushes Docker image.
3. In ClawCloud, click `Update` on `moodymusic` instance.
4. Do not rely on `Restart` for code updates.
5. If update fails: Stop -> Delete -> recreate with latest image tag.

## 9. 常见故障排查快捷项

Frontend 未更新：

- Hard refresh browser (`Ctrl+Shift+R`)
- Verify container is updated in ClawCloud
- Check response headers with `curl -I <frontend-url>`

API 请求失败：

- Test worker health endpoint (`/api/admin/stats`)
- Redeploy Worker with `npx wrangler deploy`
- Verify `wrangler.toml` bindings (`DB`, `BUCKET`, Supabase vars)

数据未更新：

- Confirm ClawCloud used `Update` (not `Restart`)
- Confirm Worker deployment time and active route
- Validate D1 data in admin/debug endpoints

## 10. 常用索引/扫描命令

列出主要文档：

```powershell
cd D:\PersonalProject\Music-Archiv-V2
Get-ChildItem docs -File
```

列出核心源码文件：

```powershell
Get-ChildItem cloudflare-worker/src -File
Get-ChildItem frontend/admin -File
Get-ChildItem frontend/src/js -File
```

扫描 Route 定义：

```powershell
Select-String -Path cloudflare-worker/src/index.ts -Pattern "app\.(get|post|put|delete)\("
Select-String -Path cloudflare-worker/src/auth.ts -Pattern "app\.(get|post|put|delete)\("
Select-String -Path cloudflare-worker/src/upload.ts -Pattern "(app|uploadApp)\.(get|post|put|delete)\("
```
