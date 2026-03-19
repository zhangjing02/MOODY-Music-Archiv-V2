# MOODY Music Archive - 双端口架构（v2）
# 前端代码保持灵活，可以在任意平台部署

FROM nginx:alpine

# 安装必要工具
RUN apk add --no-cache tzdata ca-certificates bash

# 设置时区
ENV TZ=Asia/Shanghai

# 拷贝前端静态文件
COPY frontend /usr/share/nginx/html

# 创建前端 Nginx 配置（8080 端口 - 播放器）
RUN cat > /etc/nginx/conf.d/frontend.conf << 'EOF'
server {
    listen 8080;
    server_name _;
    root /usr/share/nginx/html/src;
    index index.html;

    # 添加健康检查端点
    location /health {
        access_log off;
        return 200 "healthy\n";
    }

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
RUN cat > /etc/nginx/conf.d/admin.conf << 'EOF'
server {
    listen 8082;
    server_name _;
    root /usr/share/nginx/html/admin;
    index index.html;

    # 添加健康检查端点
    location /health {
        access_log off;
        return 200 "healthy\n";
    }

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

# 删除默认配置
RUN rm -f /etc/nginx/conf.d/default.conf

# 创建启动脚本，同时启动两个 Nginx
RUN cat > /start.sh << 'EOF'
#!/bin/bash
echo "Starting MOODY Music Archive..."

# 启动前端 Nginx（8080 端口，后台运行）
echo "Starting frontend on port 8080..."
/usr/sbin/nginx -c /etc/nginx/conf.d/frontend.conf &

# 启动管理后台 Nginx（8082 端口，前台运行）
echo "Starting admin on port 8082..."
exec /usr/sbin/nginx -c /etc/nginx/conf.d/admin.conf
EOF

RUN chmod +x /start.sh

# 暴露端口
EXPOSE 8080 8082

# 启动服务
CMD ["/start.sh"]
