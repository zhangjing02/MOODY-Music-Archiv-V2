@echo off
chcp 65001 >nul
title MOODY MUSIC - 明早 08:00 自动上云守护进程
echo =========================================================================
echo       MOODY MUSIC - 明早 08:00 自动上云监控程序
echo =========================================================================
echo.
echo 目标触发时间: 明早 08:00:00 (北京时间 UTC+8)
echo 任务队列:
echo   1. 上传 4 个动态微动背景视频至 Cloudflare R2 云端存储
echo   2. 批量上传点亮本地所有曲目至 D1 数据库与 R2
echo.
echo 提示: 请保持本控制台窗口运行（可最小化）。
echo.

python "%~dp0schedule_ambient_upload_8am.py"

pause
