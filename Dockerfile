# MOODY Music Archive - 双端口架构
# 前端代码保持灵活，可以在任意平台部署

FROM nginx:alpine

# 安装 supervisord（进程管理器）和 tzdata
RUN apk add --no-cache supervisor tzdata ca-certificates

# 设置时区
ENV TZ=Asia/Shanghai

# 拷贝前端静态文件
COPY frontend /app/frontend

# 创建前端 Nginx 配置（8080 端口）
RUN cat > /etc/nginx/frontend.conf << 'EOF'
server {
    listen 8080;
    server_name _;
    root /app/frontend/src;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    # API 代理到 Worker
    location /api/ {
        proxy_pass https://moody-worker.changgepd.workers.dev;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # 静态资源缓存
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        expires 30d;
        add_header Cache-Control "public, immutable";
    }
}
EOF

# 创建管理后台 Nginx 配置（8082 端口）
RUN cat > /etc/nginx/admin.conf << 'EOF'
server {
    listen 8082;
    server_name _;
    root /app/frontend/admin;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    # API 代理到 Worker
    location /api/ {
        proxy_pass https://moody-worker.changgepd.workers.dev;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # 静态资源缓存
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        expires 30d;
        add_header Cache-Control "public, immutable";
    }
}
EOF

# 创建 supervisord 配置
RUN cat > /etc/supervisord.conf << 'EOF'
[supervisord]
nodaemon=true
user=root
logfile=/var/log/supervisord.log
pidfile=/var/run/supervisord.pid

[program:frontend]
command=/usr/sbin/nginx -c /etc/nginx/frontend.conf -g 'daemon off;'
autostart=true
autorestart=true
stderr_logfile=/var/log/frontend.err.log
stdout_logfile=/var/log/frontend.out.log

[program:admin]
command=/usr/sbin/nginx -c /etc/nginx/admin.conf -g 'daemon off;'
autostart=true
autorestart=true
stderr_logfile=/var/log/admin.err.log
stdout_logfile=/var/log/admin.out.log
EOF

# 暴露端口
EXPOSE 8080 8082

# 启动 supervisord（会自动启动两个 Nginx）
CMD ["/usr/bin/supervisord", "-c", "/etc/supervisord.conf"]
