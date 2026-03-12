# [Multi-Stage Build] MOODY Music Archive for ClawCloud Run

# Stage 1: Build Backend
FROM golang:1.24-alpine AS builder
RUN apk add --no-cache gcc musl-dev
WORKDIR /app
COPY backend/go.mod backend/go.sum ./backend/
WORKDIR /app/backend
RUN go mod download
COPY backend/ ./
# 使用 CGO_ENABLED=0 构建 pure Go 二进制，显式指定 GOARCH=amd64 适配 ClawCloud
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -o main ./cmd/main.go

# Stage 2: Runtime Environment
FROM alpine:latest
RUN apk add --no-cache ca-certificates tzdata curl bash
WORKDIR /app

# 安装 FileBrowser 辅助管理工具
RUN curl -fsSL https://raw.githubusercontent.com/filebrowser/get/master/get.sh | bash

# 拷贝后端二进制
COPY --from=builder /app/backend/main .

# 拷贝前端静态资源 (V2 架构为纯静态)
COPY frontend ./frontend

# 构造启动脚本 (支持多进程：后台执行 FileBrowser + 前台执行 MOODY)
# 支持 FB_NOAUTH 环境变量设置为 TRUE 以开启免密模式
# 究极修复逻辑：如果开启免密，直接在二进制启动命令中注入 --noauth，这比 config set 更具强制力
RUN printf '#!/bin/sh\n\
mkdir -p /app/storage/db\n\
if [ "$FB_NOAUTH" = "TRUE" ]; then\n\
  echo "🔓 [MOODY] Forced No-Auth Mode Enabled..."\n\
  # 即使使用命令行 noauth，我们仍初始化一个空的 db 以保存其他设置\n\
  /usr/local/bin/filebrowser config init -d /app/storage/db/filebrowser.db 2>/dev/null || true\n\
  /usr/local/bin/filebrowser -r /app/storage -d /app/storage/db/filebrowser.db -p 8081 -a 0.0.0.0 --noauth &\n\
else\n\
  echo "🔐 [MOODY] Starting in AUTH mode (User: admin)..."\n\
  /usr/local/bin/filebrowser config init -d /app/storage/db/filebrowser.db 2>/dev/null || true\n\
  FB_PASS="${FB_PASSWORD:-Moody2025!}"\n\
  /usr/local/bin/filebrowser config set --auth.method=password -d /app/storage/db/filebrowser.db 2>/dev/null || true\n\
  /usr/local/bin/filebrowser users add admin "$FB_PASS" -d /app/storage/db/filebrowser.db 2>/dev/null || \\\n\
  /usr/local/bin/filebrowser users update admin --password="$FB_PASS" -d /app/storage/db/filebrowser.db 2>/dev/null || true\n\
  /usr/local/bin/filebrowser -r /app/storage -d /app/storage/db/filebrowser.db -p 8081 -a 0.0.0.0 &\n\
fi\n\
sleep 2\n\
echo "🎵 Starting MOODY Backend (Main Service) on port 8080..."\n\
./main\n' > start.sh && chmod +x start.sh

# 预设存储目录
RUN mkdir -p storage/music storage/covers storage/lyrics storage/db

# 暴露服务端口
EXPOSE 8080 8081 8082

# 生产环境环境变量
ENV MOODY_PORT=8080
ENV MOODY_ADMIN_PORT=8082
ENV GIN_MODE=release

# 执行启动脚本
CMD ["/bin/sh", "/app/start.sh"]
