# 班级与认领系统接口清单（客户端 / 管理后台）

> 适用后端：`cloudflare-worker/src/auth.ts`  
> Base URL：`https://m-api.changgepd.top`

## 0. 管理员权限模型（RBAC）

- `develop-master`（全局最高权限）
  - 可创建/修改/删除班级
  - 可给任意班级分配 `master` / `manager`
  - 可管理全站用户与高风险维护接口
- `class master`（班级级）
  - 仅可管理被分配班级的人员、座位、安全题、认领重置
  - 可执行该班级高敏感操作（如已认领座位强制删除/撤销）
- `class manager`（班级级）
  - 仅可管理被分配班级的人员、座位、安全题、认领重置
  - 不可执行该班级 `master` 专属高敏操作
- 音乐/歌手维护
  - 所有管理员（`develop-master` + 班级 `master/manager`）都可访问 `/api/admin/*` 音乐维护接口

## 1. 客户端 API

| Method | Path | 说明 |
|---|---|---|
| GET | `/api/classes` | 获取班级列表（含每班总人数、已认领人数） |
| GET | `/api/roster?class_id={id}` | 获取指定班级座位与认领状态、安全题题面 |
| POST | `/api/user/claim/verify` | 校验认领安全题，返回 `claim_token` |
| POST | `/api/user/claim/finalize` | 完成认领注册 |
| POST | `/api/user/login` | 用户登录 |
| POST | `/api/user/refresh` | 刷新 token |
| GET | `/api/user/me` | 获取当前用户信息 |
| PUT | `/api/user/profile` | 更新用户资料 |
| POST | `/api/user/reset/self-service` | 班级自助重置（需管理员临时开通通道） |
| POST | `/api/user/reset/set-new` | `reset_pending` 场景下登录后设置新密码 |
| GET | `/api/user/settings` | 获取用户设置 |
| PUT | `/api/user/settings` | 更新用户设置 |

## 2. 管理后台 API

### 2.1 班级管理

| Method | Path | 权限 | 说明 |
|---|---|---|---|
| GET | `/api/admin/classes` | develop-master / class master / class manager | 可见范围自动按权限裁剪 |
| POST | `/api/admin/classes` | develop-master | 新建班级 |
| PUT | `/api/admin/classes/:id` | develop-master | 修改班级信息 |
| DELETE | `/api/admin/classes/:id` | develop-master | 删除班级（支持迁移班级名录） |

### 2.2 班级管理员分配（develop-master）

| Method | Path | 权限 | 说明 |
|---|---|---|---|
| GET | `/api/admin/classes/:id/admins` | develop-master | 查看班级 `master/manager` |
| POST | `/api/admin/classes/:id/admins` | develop-master | 新增或覆盖班级管理员 |
| PUT | `/api/admin/classes/:id/admins/:userId` | develop-master | 修改班级管理员角色 |
| DELETE | `/api/admin/classes/:id/admins/:userId` | develop-master | 移除班级管理员 |

### 2.3 班级内同学与座位管理

| Method | Path | 权限 | 说明 |
|---|---|---|---|
| GET | `/api/admin/classes/:id/roster` | class master / class manager / develop-master | 查询该班级名录 |
| POST | `/api/admin/classes/:id/roster` | class master / class manager / develop-master | 新增该班级名录条目 |
| PUT | `/api/admin/classes/:id/roster/:rosterId` | class master / class manager / develop-master | 更新该条名录 |
| DELETE | `/api/admin/classes/:id/roster/:rosterId` | class master / class manager / develop-master | 删除该条名录（已认领需 `force=true` 且 class master/develop-master） |

### 2.4 班级安全题配置

| Method | Path | 权限 | 说明 |
|---|---|---|---|
| GET | `/api/admin/classes/:id/security-questions` | class master / class manager / develop-master | 查询该班级安全题（含答案） |
| PUT | `/api/admin/classes/:id/security-questions` | class master / class manager / develop-master | 更新该班级安全题与答案 |

### 2.5 认领状态批量管理

| Method | Path | 权限 | 说明 |
|---|---|---|---|
| POST | `/api/admin/classes/:id/reset-claims` | class master / class manager / develop-master | 按班级批量重置认领 |

### 2.6 自助重置通道开关

| Method | Path | 权限 | 说明 |
|---|---|---|---|
| GET | `/api/admin/classes/:id/reset-channel` | class master / class manager / develop-master | 查询当前通道状态 |
| POST | `/api/admin/classes/:id/reset-channel` | class master / class manager / develop-master | 开启/关闭通道 |

## 3. 兼容保留（旧管理接口）

以下接口继续可用，但内部已执行班级权限校验：

| Method | Path | 说明 |
|---|---|---|
| GET | `/api/admin/roster` | 名录查询（会自动限制到可管理班级） |
| POST | `/api/admin/roster/add` | 名录新增（class_id 必须是可管理班级） |
| POST | `/api/admin/roster/reset` | 单人标记 `reset_pending`（按班级权限校验） |
| POST | `/api/admin/roster/unclaim` | 单人解除认领（需 class master/develop-master） |
| PUT | `/api/admin/questions` | 班级安全题答案更新（按班级权限校验） |
| GET | `/api/admin/questions` | 班级安全题查询（按班级权限校验） |

以下接口仅 `develop-master` 可访问：

| Method | Path | 说明 |
|---|---|---|
| GET | `/api/admin/dashboard` | 管理概览 |
| GET | `/api/admin/users` | 用户列表查询 |
| PUT | `/api/admin/users/:id` | 更新用户资料/角色 |
| DELETE | `/api/admin/users/:id` | 删除用户 |
| PUT | `/api/admin/user/role` | 修改用户全局角色 |
| POST | `/api/admin/maintenance/cleanup-claims` | 测试数据清理 |
