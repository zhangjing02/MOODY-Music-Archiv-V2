# MOODY API 接口文档 (V2)

本文档定义了边缘 Worker 提供的核心业务接口及运维管理接口。

## 1. 业务接口 (Public Client APIs)

### 1.1 获取完整歌曲树
- **端点**: `GET /api/songs`
- **参数**: 
    - `artistId` (可选): 艺人 ID (带 `db_` 前缀)
    - `artist` (可选): 艺人名称模糊搜索
    - `album` (可选): 专辑标题模糊搜索
- **响应**: 层级化的 `Artist -> Albums -> Songs` 结构。

### 1.2 全局搜索
- **端点**: `GET /api/search?q={keyword}`
- **描述**: 对艺人、专辑、歌曲执行 D1 并发检索。

### 1.3 资源代理
- **端点**: `GET /storage/{key}`
- **描述**: 直接访问 R2 物理资产，带边缘缓存及 ETag 验证。

---

## 2. 运维与自愈接口 (Admin/Maintenance APIs)

### 2.1 路径批量自修复
- **端点**: `POST /api/admin/fix-paths`
- **逻辑**: 为数据库中缺失前缀的 `file_path` 记录补全 `music/`。
- **背景**: 彻底解决迁移后音频 404 及“点亮”异常问题。

### 2.2 冗余专辑清理
- **端点**: `POST /api/admin/cleanup-duplicates`
- **逻辑**: 对比重名专辑，保留曲目最完整的有效版本，删除空占位符。

### 2.3 数据审计
- **端点**: `GET /api/debug/audit`
- **响应**: 列出 D1 中所有带路径的记录及其在 R2 中的实时存在状态。

---

## 3. 错误处理
所有接口统一返回以下格式：
```json
{
  "code": 200,
  "message": "success",
  "data": {}
}
```
500 序列错误会附带具体的异常内容便于 UI 端 Toast 提示。
