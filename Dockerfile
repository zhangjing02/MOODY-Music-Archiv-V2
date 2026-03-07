# [Multi-Stage Build] MOODY Music Archive for ClawCloud Run

# Stage 1: Build Backend
FROM golang:1.24-alpine AS builder
RUN apk add --no-cache gcc musl-dev
WORKDIR /app
COPY backend/go.mod backend/go.sum ./backend/
WORKDIR /app/backend
RUN go mod download
COPY backend/ ./
# 使用 CGO_ENABLED=0 构建纯 Go 二进制，适配 Alpine 运行环境
RUN CGO_ENABLED=0 GOOS=linux go build -o main ./cmd/main.go

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
RUN printf "#!/bin/sh\n\
    mkdir -p /app/storage/db\n\
    echo '🚀 Starting FileBrowser (Asset Manager) on port 8081...'\n\
    /usr/local/bin/filebrowser -r /app/storage -d /app/storage/db/filebrowser.db -p 8081 -a 0.0.0.0 &\n\
    sleep 2\n\
    echo '🎵 Starting MOODY Backend (Main Service) on port 8080...'\n\
    ./main\n" > start.sh && chmod +x start.sh

# 预设存储目录 (建议在 ClawCloud 挂载 Persistent Storage 至 /app/storage)
RUN mkdir -p storage/music storage/covers storage/lyrics storage/db

# 暴露服务端口
# 8080: 播放与主 API
# 8081: 物理文件管理 (FileBrowser)
# 8082: 后端管理接口 (治理、上传、统计)
EXPOSE 8080 8081 8082

# 生产环境环境变量
ENV MOODY_PORT=8080
ENV MOODY_ADMIN_PORT=8082
ENV GIN_MODE=release

# 执行启动脚本
CMD ["/bin/sh", "/app/start.sh"]
