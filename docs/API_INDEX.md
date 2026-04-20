# MOODY Music Archiv V2 - API Index

> Auto-generated: 2026-04-15 (Asia/Shanghai)
> Source of truth: `cloudflare-worker/src/index.ts`, `auth.ts`, `upload.ts`

## 1. Base URL

- Preferred: `https://m-api.changgepd.top`
- Legacy: `https://moody-worker.changgepd.workers.dev`

## 2. 权限说明

- 音乐 browse/play 接口按设计是 public。
- 大量 admin 接口定义在 `index.ts`。
- `index.ts` 里的全局 admin guard 当前是注释状态：
  - `// app.use('/api/admin/*', authMiddleware)` (`index.ts:105`)
  - `// app.use('/api/admin/*', requireAdmin)` (`index.ts:106`)
- `auth.ts` 中部分 admin 接口在路由内联了 middleware 保护。

## 3. Core Service Routes（核心服务）

| Method | Path | Source |
|---|---|---|
| GET | `/` | `index.ts:94` |
| GET | `/storage/*` | `index.ts:112` |

## 4. Public Music Routes（公开音乐接口）

| Method | Path | Source |
|---|---|---|
| GET | `/api/welcome-images` | `index.ts:155` |
| GET | `/api/skeleton` | `index.ts:193` |
| GET | `/api/songs` | `index.ts:241` |
| GET | `/api/search` | `index.ts:355` |

## 5. User/Auth Routes（用户认证接口）

| Method | Path | Auth | Source |
|---|---|---|---|
| GET | `/api/roster` | Public | `auth.ts:233` |
| POST | `/api/user/claim/verify` | Public | `auth.ts:264` |
| POST | `/api/user/claim/finalize` | Public | `auth.ts:338` |
| POST | `/api/user/login` | Public | `auth.ts:453` |
| POST | `/api/user/refresh` | Public | `auth.ts:531` |
| GET | `/api/user/me` | Bearer token | `auth.ts:560` |
| PUT | `/api/user/profile` | Bearer token | `auth.ts:578` |
| POST | `/api/user/bind-email` | Bearer token | `auth.ts:613` |
| POST | `/api/user/reset/request` | Public | `auth.ts:643` |
| POST | `/api/user/reset/confirm` | Public | `auth.ts:700` |
| POST | `/api/user/reset/set-new` | Bearer token | `auth.ts:778` |
| GET | `/api/user/settings` | Bearer token | `auth.ts:810` |
| PUT | `/api/user/settings` | Bearer token | `auth.ts:835` |

## 6. Admin Roster/Auth Routes（`auth.ts` 内受保护）

| Method | Path | Required Role | Source |
|---|---|---|---|
| GET | `/api/admin/roster` | admin/master | `auth.ts:878` |
| POST | `/api/admin/roster/add` | admin/master | `auth.ts:894` |
| POST | `/api/admin/roster/reset` | admin/master | `auth.ts:920` |
| POST | `/api/admin/roster/unclaim` | master | `auth.ts:955` |
| PUT | `/api/admin/user/role` | master | `auth.ts:983` |
| PUT | `/api/admin/questions` | master | `auth.ts:1018` |

## 7. Admin Music/Data Routes（`index.ts`）

| Method | Path | Source |
|---|---|---|
| GET | `/api/admin/stats` | `index.ts:518` |
| POST | `/api/admin/fix-paths` | `index.ts:543` |
| POST | `/api/admin/cleanup-duplicates` | `index.ts:566` |
| POST | `/api/admin/songs/move` | `index.ts:623` |
| POST | `/api/admin/albums/merge` | `index.ts:663` |
| POST | `/api/admin/songs/batch-update` | `index.ts:728` |
| POST | `/api/admin/songs/create-full` | `index.ts:783` |
| GET | `/api/admin/songs/debug` | `index.ts:876` |
| POST | `/api/admin/fix-jacky-smile` | `index.ts:905` |
| GET | `/api/admin/albums/detail` | `index.ts:957` |
| POST | `/api/admin/songs/delete-all` | `index.ts:1002` |
| POST | `/api/admin/songs/batch-insert` | `index.ts:1039` |
| GET | `/api/admin/albums/search` | `index.ts:1108` |
| POST | `/api/admin/albums/delete` | `index.ts:1161` |
| POST | `/api/admin/songs/test-update` | `index.ts:1203` |
| POST | `/api/admin/songs/cleanup-no-path` | `index.ts:1268` |
| POST | `/api/admin/ops/songs/batch-update` | `index.ts:1304` |
| POST | `/api/admin/ops/albums/rename` | `index.ts:1410` |
| POST | `/api/admin/ops/artists/rename` | `index.ts:1476` |
| POST | `/api/admin/ops/albums/merge` | `index.ts:1530` |
| POST | `/api/admin/ops/albums/delete` | `index.ts:1618` |
| POST | `/api/admin/ops/songs/batch-insert` | `index.ts:1691` |
| POST | `/api/admin/albums/cleanup-duplicates` | `index.ts:1841` |

## 8. Upload Routes（`upload.ts`）

| Method | Path | Source |
|---|---|---|
| POST | `/api/admin/upload` | `upload.ts:378` |
| GET | `/api/admin/upload/status` | `upload.ts:384` |

## 9. Debug Routes（调试接口）

| Method | Path | Source |
|---|---|---|
| GET | `/api/debug/r2` | `index.ts:412` |
| GET | `/api/debug/audit` | `index.ts:463` |
| GET | `/api/debug/album-query` | `index.ts:1788` |
| GET | `/api/debug/supabase-test` | `index.ts:1904` |

## 10. Route 扫描命令

```powershell
cd D:\PersonalProject\Music-Archiv-V2
Select-String -Path cloudflare-worker/src/index.ts -Pattern "app\.(get|post|put|delete)\("
Select-String -Path cloudflare-worker/src/auth.ts -Pattern "app\.(get|post|put|delete)\("
Select-String -Path cloudflare-worker/src/upload.ts -Pattern "(app|uploadApp)\.(get|post|put|delete)\("
```
