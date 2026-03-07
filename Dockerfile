# 第一阶段：构建 (Build)
# 使用官方 Go 语言镜像作为构建环境，基于 Alpine Linux (体积小)
FROM golang:1.24-alpine AS builder

# 安装必要的系统工具 (gcc/musl-dev 用于编译 SQLite CGO)
RUN apk add --no-cache gcc musl-dev

# 设置工作目录
WORKDIR /app

# 1. 先拷贝依赖描述文件，利用 Docker 缓存层加速构建
COPY backend/go.mod backend/go.sum ./backend/
WORKDIR /app/backend
RUN go mod download

# 2. 拷贝后端源代码
COPY backend/ ./

# 3. 编译 Go 程序
# CGO_ENABLED=1: 必须开启，因为我们用了 SQLite (modernc.org/sqlite 是纯 Go 的话可以是 0，但你的 go.mod 引用了 modernc.org/libc，通常建议 CGO_ENABLED=0 如果库支持，或者根据库文档。
# modernc.org/sqlite 是 CGO-free 的纯 Go SQLite 移植版，所以 CGO_ENABLED=0 也是可以的，这样兼容性更好。
# 让我们使用 CGO_ENABLED=0 来构建静态二进制文件。
RUN CGO_ENABLED=0 GOOS=linux go build -o main ./cmd/main.go

# 第二阶段：运行 (Runtime)
# 使用最精简的 Alpine 镜像
FROM alpine:latest

# 安装基础证书 (访问 HTTPS 需要) 和时区数据
RUN apk add --no-cache ca-certificates tzdata

WORKDIR /app

# 从构建阶段拷贝编译好的二进制文件
COPY --from=builder /app/backend/main .

# !!! 更改：使用官方脚本安装 FileBrowser (更健壮) !!!
RUN apk add --no-cache curl bash && curl -fsSL https://raw.githubusercontent.com/filebrowser/get/master/get.sh | bash

# 从项目根目录拷贝前端静态文件
COPY frontend ./frontend

# 拷贝启动脚本并赋予执行权限
# 这里的 printf 确保了脚本使用 LF (Unix) 换行符，完全绕过了 Windows 编辑的问题
RUN printf "#!/bin/sh\n\
    mkdir -p /app/storage/db\n\
    echo 'Starting FileBrowser on port 8081...'\n\
    /usr/local/bin/filebrowser -r /app/storage -d /app/storage/db/filebrowser.db -p 8081 -a 0.0.0.0 &\n\
    sleep 2\n\
    echo 'Starting MOODY Backend on port 8080...'\n\
    ./main\n" > start.sh && chmod +x start.sh

# 创建挂载点目录 (Zeabur Volume 将挂载到这里)
# storage/music, storage/covers, storage/db
RUN mkdir -p storage/music storage/covers storage/lyrics storage/db

# 暴露端口 (8080: MOODY, 8081: FileBrowser)
EXPOSE 8080 8081

# 设置环境变量
ENV MOODY_PORT=8080
ENV GIN_MODE=release

# 启动命令 (使用脚本同时启动两个服务)
CMD ["/bin/sh", "/app/start.sh"]
