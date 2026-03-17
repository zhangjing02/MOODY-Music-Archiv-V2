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

# 拷贝后端二进制
COPY --from=builder /app/backend/main .

# 拷贝前端静态资源
COPY frontend ./frontend

# 构造启动脚本 (仅保留 MOODY 主进程)
RUN printf '#!/bin/sh\n\
mkdir -p /app/storage/db\n\
echo "🎵 Starting MOODY Backend (All-in-One) on port 8080..."\n\
./main\n' > start.sh && chmod +x start.sh

# 预设存储目录
RUN mkdir -p storage/music storage/covers storage/lyrics storage/db

# 暴露服务端口
# 8080: 播放、API 与 数据库管理 (New!)
# 8082: 后端管理接口 (治理、上传、统计)
EXPOSE 8080 8082

# 生产环境环境变量
ENV MOODY_PORT=8080
ENV MOODY_ADMIN_PORT=8082
ENV MOODY_VERSION="v12.59 (2026-03-18)"
ENV GIN_MODE=release

# 执行启动脚本
CMD ["/bin/sh", "/app/start.sh"]
