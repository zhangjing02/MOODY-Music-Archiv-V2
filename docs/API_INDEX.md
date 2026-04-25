# MOODY Music Archiv V2 - API Index

> Source of truth: `cloudflare-worker/src/auth.ts`, `cloudflare-worker/src/index.ts`, `cloudflare-worker/src/upload.ts`

## 1. Base URL

- Preferred: `https://m-api.changgepd.top`
- Legacy: `https://moody-worker.changgepd.workers.dev`

## 2. Auth & RBAC

- Public music browse APIs: no auth required.
- User APIs: Bearer token where noted.
- Admin APIs (`/api/admin/*`): now protected in `index.ts` via `authMiddleware + requireAdmin`.
- Admin model:
  - `develop-master` (global super admin)
  - class-level `master` / `manager` (stored in `class_admin_roles`)
- Detailed classroom/client split: [`docs/CLASSROOM_API.md`](./CLASSROOM_API.md)

## 3. Core Routes

| Method | Path | Source |
|---|---|---|
| GET | `/` | `index.ts` |
| GET | `/storage/*` | `index.ts` |

## 4. Client Classroom/Auth Routes

| Method | Path |
|---|---|
| GET | `/api/classes` |
| GET | `/api/roster` |
| POST | `/api/user/claim/verify` |
| POST | `/api/user/claim/finalize` |
| POST | `/api/user/login` |
| POST | `/api/user/refresh` |
| GET | `/api/user/me` |
| PUT | `/api/user/profile` |
| POST | `/api/user/bind-email` |
| POST | `/api/user/reset/request` |
| POST | `/api/user/reset/confirm` |
| POST | `/api/user/reset/self-service` |
| POST | `/api/user/reset/set-new` |
| GET | `/api/user/settings` |
| PUT | `/api/user/settings` |

## 5. Admin Classroom Routes (`auth.ts`)

| Method | Path | Required Permission |
|---|---|---|
| GET | `/api/admin/classes` | develop-master or assigned class admin |
| POST | `/api/admin/classes` | develop-master |
| PUT | `/api/admin/classes/:id` | develop-master |
| DELETE | `/api/admin/classes/:id` | develop-master |
| GET | `/api/admin/classes/:id/admins` | develop-master |
| POST | `/api/admin/classes/:id/admins` | develop-master |
| PUT | `/api/admin/classes/:id/admins/:userId` | develop-master |
| DELETE | `/api/admin/classes/:id/admins/:userId` | develop-master |
| GET | `/api/admin/classes/:id/roster` | class master/manager or develop-master |
| POST | `/api/admin/classes/:id/roster` | class master/manager or develop-master |
| PUT | `/api/admin/classes/:id/roster/:rosterId` | class master/manager or develop-master |
| DELETE | `/api/admin/classes/:id/roster/:rosterId` | class master/manager or develop-master (claimed-delete requires class master/develop-master) |
| GET | `/api/admin/classes/:id/security-questions` | class master/manager or develop-master |
| PUT | `/api/admin/classes/:id/security-questions` | class master/manager or develop-master |
| POST | `/api/admin/classes/:id/reset-claims` | class master/manager or develop-master |
| GET | `/api/admin/classes/:id/reset-channel` | class master/manager or develop-master |
| POST | `/api/admin/classes/:id/reset-channel` | class master/manager or develop-master |

## 6. Compatibility Admin Routes (`auth.ts`)

| Method | Path | Notes |
|---|---|---|
| GET | `/api/admin/roster` | scoped by class admin permissions |
| POST | `/api/admin/roster/add` | scoped by class admin permissions |
| POST | `/api/admin/roster/reset` | scoped by class admin permissions |
| POST | `/api/admin/roster/unclaim` | scoped; requires class master/develop-master |
| PUT | `/api/admin/questions` | scoped by class admin permissions |
| GET | `/api/admin/questions` | scoped by class admin permissions |
| GET | `/api/admin/dashboard` | develop-master only |
| GET | `/api/admin/users` | develop-master only |
| PUT | `/api/admin/users/:id` | develop-master only |
| DELETE | `/api/admin/users/:id` | develop-master only |
| PUT | `/api/admin/user/role` | develop-master only |
| PUT | `/api/admin/roster/:id` | scoped by class admin permissions |
| DELETE | `/api/admin/roster/:id` | scoped; claimed-delete requires class master/develop-master |
| POST | `/api/admin/maintenance/cleanup-claims` | develop-master only |

## 7. Admin Music/Data Routes (`index.ts`)

All `/api/admin/*` music/data routes are now protected by `authMiddleware + requireAdmin`.

## 8. Upload Routes (`upload.ts`)

| Method | Path |
|---|---|
| POST | `/api/admin/upload` |
| GET | `/api/admin/upload/status` |
