# MOODY Music Archive - 双端口架构（v3 - 最简单可靠）
# 前端代码保持灵活，可以在任意平台部署

FROM nginx:alpine

# 安装必要工具
RUN apk add --no-cache tzdata ca-certificates

# 设置时区
ENV TZ=Asia/Shanghai

# 拷贝前端静态文件
COPY frontend /usr/share/nginx/html

# 创建主配置文件（监听两个端口）
RUN cat > /etc/nginx/nginx.conf << 'EOF'
user nginx;
worker_processes auto;

error_log /var/log/nginx/error.log warn;
pid /var/run/nginx.pid;

events {
    worker_connections 1024;
}

http {
    include /etc/nginx/mime.types;
    default_type application/octet-stream;

    # 日志格式
    log_format main '$remote_addr - $remote_user [$time_local] "$request" '
                    '$status $body_bytes_sent "$http_referer" '
                    '"$http_user_agent"';

    access_log /var/log/nginx/access.log main;

    sendfile on;
    tcp_nopush on;
    tcp_nodelay on;
    keepalive_timeout 65;
    types_hash_max_size 2048;

    # 前端播放器（80 端口）
    server {
        listen 80;
        server_name ddjokbqwfbce.ap-southeast-1.clawcloudrun.com;
        root /usr/share/nginx/html/src;
        index index.html;

        # 健康检查端点
        location = /health {
            access_log off;
            return 200 "healthy\n";
            add_header Content-Type text/plain;
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

    # 管理后台（80 端口）
    server {
        listen 80;
        server_name qbxnkwidzabx.ap-southeast-1.clawcloudrun.com;
        root /usr/share/nginx/html/admin;
        index index.html;

        # 健康检查端点
        location = /health {
            access_log off;
            return 200 "healthy\n";
            add_header Content-Type text/plain;
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
}
EOF

# 暴露端口
EXPOSE 80

# 启动 Nginx（前台运行，监听两个端口）
CMD ["nginx", "-g", "daemon off;"]
