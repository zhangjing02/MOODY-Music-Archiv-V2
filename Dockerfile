# MOODY Music Archive - Pure Frontend (Worker Architecture)
# 生产环境完全依赖 Cloudflare Worker，Docker 只用于托管前端静态资源

FROM nginx:alpine

# 安装 tzdata 和 ca-certificates
RUN apk add --no-cache tzdata ca-certificates

# 设置时区
ENV TZ=Asia/Shanghai

# 拷贝前端静态资源到 Nginx
COPY frontend /usr/share/nginx/html

# 创建 nginx 配置
RUN echo 'server { \
    listen 80; \
    server_name _; \
    root /usr/share/nginx/html; \
    index index.html; \
    \
    location / { \
        try_files $uri $uri/ /index.html; \
    } \
    \
    # API 请求代理到 Worker（可选）\
    location /api/ { \
        proxy_pass https://moody-worker.changgepd.workers.dev; \
        proxy_set_header Host $host; \
        proxy_set_header X-Real-IP $remote_addr; \
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for; \
        proxy_set_header X-Forwarded-Proto $scheme; \
    } \
    \
    # 静态资源缓存\
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ { \
        expires 30d; \
        add_header Cache-Control "public, immutable"; \
    } \
}' > /etc/nginx/conf.d/default.conf

# 暴露端口
EXPOSE 80

# 启动 Nginx
CMD ["nginx", "-g", "daemon off;"]
