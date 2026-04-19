# 音乐专辑社交评论功能架构与实现方案

## 1. 架构概述

本项目（MoodyMusic）针对“音乐专辑下发帖与评论”功能的社交需求，摒弃传统的 WebSocket 长连接方案，采用**“静默透传推送驱动 + HTTP REST API 降级拉取”**的架构模式。

### 1.1 核心设计理念
- **无流氓保活**：极度尊重用户设备资源，放弃强制后台驻留。
- **降本增效**：后端复用现成的 Neon (Serverless PostgreSQL)，客户端完全复用现有的 Retrofit 网络层，实现零新增依赖门槛。
- **优雅的生命周期**：
  - **听歌后台态**：音乐 Service 保证进程存活，接收到透传消息仅置脏标记（Dirty Flag），不做网络请求，不抢占带宽与 CPU。
  - **前台交互态**：根据推送或下拉动作静默获取数据，丝滑更新 UI。

---

## 2. 数据库设计 (基于 Neon/PostgreSQL)

为了支持“专辑下的帖子及回复”，我们需要设计一个树形/层级结构的评论表。

### 2.1 表结构 `album_comments`

| 字段名 | 类型 | 说明 | 约束/默认值 |
| :--- | :--- | :--- | :--- |
| `id` | `UUID` / `BIGSERIAL` | 评论唯一标识 | PRIMARY KEY |
| `album_id` | `VARCHAR` | 关联的音乐专辑 ID | NOT NULL, INDEX |
| `user_id` | `VARCHAR` | 发布该评论的用户 ID | NOT NULL |
| `content` | `TEXT` | 评论的正文内容 | NOT NULL |
| `parent_id` | `UUID` / `BIGINT` | 父评论 ID（如果是主贴则为 NULL）| NULLABLE |
| `root_id` | `UUID` / `BIGINT` | 根帖子 ID（用于快速查出一个帖子下的所有回复）| NULLABLE, INDEX |
| `created_at` | `TIMESTAMP` | 创建时间 | DEFAULT NOW() |
| `updated_at` | `TIMESTAMP` | 更新时间 | DEFAULT NOW() |

> **设计建议**
> 为了查询性能，对 `album_id` 和 `root_id` 建立索引。在 Neon 的 Serverless 架构下，普通的 B-Tree 索引足以应对百万级别的常规检索。

---

## 3. 后端接口设计 (RESTful API)

后端（假设为 Node.js 或 Go 服务）需要提供以下基础 HTTP 接口供安卓端 Retrofit 调用：

### 3.1 发布主贴/评论
- **Endpoint**: `POST /api/v1/albums/{album_id}/comments`
- **Request Body**:
  ```json
  {
    "user_id": "u_12345",
    "content": "这张专辑的 Bass 简直绝了！",
    "parent_id": null, 
    "root_id": null
  }
  ```
- **业务逻辑**：
  1. 插入数据到 Neon 数据库。
  2. 异步调用**极光推送 API**，向下发通知。

### 3.2 获取某专辑的帖子列表（一级评论）
- **Endpoint**: `GET /api/v1/albums/{album_id}/comments?page=1&size=20`
- **Response**: 返回该专辑下的按时间排序的主贴（`parent_id IS NULL`）。

### 3.3 获取帖子下的回复详情
- **Endpoint**: `GET /api/v1/comments/{root_id}/replies?page=1&size=50`
- **Response**: 返回针对某个主贴的所有回复记录。

---

## 4. 推送与被动刷新策略 (JPush)

后端在处理完 `POST` 发布请求后，需要触发透传消息下发。

### 4.1 极光透传消息构建
我们使用的是**极光自定义消息（透传消息）**，这类消息不会在 Android 状态栏弹出横幅，仅直接抵达代码层。

**极光 API 发送 Payload 示例**:
```json
{
  "platform": "android",
  "audience": {
    "tag": ["album_1024_viewers"]  // 仅推送给正在浏览该专辑的用户
  },
  "message": {
    "msg_content": "有新评论到达",
    "content_type": "text",
    "title": "refresh_comments",
    "extras": {
      "album_id": "1024",
      "action": "FETCH_NEW"
    }
  }
}
```

### 4.2 标签 (Tag) 与别名 (Alias) 策略
为了精准推送避免资源浪费，安卓端应该在进入某张专辑的详情页时，调用极光 SDK 绑定一个标签：`JPushInterface.setTags(context, sequence, ["album_" + albumId])`。退出页面时移除该标签。

---

## 5. 安卓端生命周期处理规范

在安卓端收到 `extras.action == "FETCH_NEW"` 时，严格遵循以下状态机流转：

### 5.1 场景 A：App 在后台听歌 (Service 存活)
- **状态**：音乐 Service 运行中，`AlbumDetailActivity` 处于 `onStop`。
- **动作**：极光 `MessageReceiver` 收到透传，检查到当前页面不可见。
- **处理**：仅在对应的 ViewModel 或全局单例中设置脏标记：`AppData.hasNewComments = true`。**绝对禁止发起网络请求。**

### 5.2 场景 B：用户切回前台 (onResume)
- **状态**：`AlbumDetailActivity` 执行 `onResume`。
- **处理**：
  ```kotlin
  override fun onResume() {
      super.onResume()
      if (AppData.hasNewComments) {
          viewModel.fetchLatestComments(albumId) // 触发 Retrofit 请求
          AppData.hasNewComments = false // 重置状态
      }
  }
  ```

### 5.3 场景 C：用户停留在专辑页 (前台可见)
- **状态**：极光透传到达，生命周期 `isResumed == true`。
- **处理**：直接在后台线程触发 Retrofit 请求获取差异数据（增量），或直接获取第一页，并平滑更新 RecyclerView（配合 `DiffUtil` 使用，避免整个列表闪烁）。

---

> **总结**
> 此方案做到了彻底的轻量化，没有任何依赖地狱。未来无论国内机型如何魔改杀后台策略，这套逻辑都坚如磐石，极度符合 Android “绿色开发”理念。
