---
name: MOODY Cloudflare 中国访问优化 Skill
description: 专门解决 Cloudflare Worker/Pages 在中国大陆由于 .workers.dev 被屏蔽而无法访问的问题。
---

# MOODY Cloudflare 中国访问优化 (Custom Domain)

## 📖 核心原理
Cloudflare 提供的默认子域名 `*.workers.dev` 已经被 GFW 屏蔽。通过在 Cloudflare 后台绑定 **自定义域名 (Custom Domain)**，可以使用 Cloudflare 的全球 Anycast IP 流量，实现中国大陆的直连访问。

## 🛠️ 实施指南

### 1. 后端 Worker 配置
在 `wrangler.toml` 中增加自定义路由配置：
```toml
[[routes]]
pattern = "m-api.yourdomain.com"
custom_domain = true
```

然后在 Cloudflare Worker 的控制台 -> 设置 -> 触发器 -> 自定义域 中添加该域名。

### 2. 前端环境适配
后端 API 地址在前端 `app.js` 中需具备动态识别能力，以区分本地调试与线上生产环境：

```javascript
const API_CONFIG = {
    // 自动识别本地开发环境或生产环境自定义域名
    apiBase: window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
        ? 'http://127.0.0.1:8787'
        : 'https://m-api.yourdomain.com',
};
```

## 📦 部署与验证
1. 执行 `npx wrangler deploy` 推送后端。
2. 在本地执行 Git 操作推送前端。
3. 关闭代理测试连通性。

## ⚠️ 注意事项
- 自定义域名必须是在 Cloudflare 解析的。
- 必须要绑定为 Custom Domain 而非简单的 DNS 记录，CF 会自动管理 SSL 证书。
