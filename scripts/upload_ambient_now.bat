@echo off
chcp 65001 >nul
title MOODY MUSIC - 立即上传动态背景视频至 R2
echo =========================================================================
echo       MOODY MUSIC - 立即上传动态微动背景视频至 Cloudflare R2
echo =========================================================================
echo.
python "%~dp0upload_ambient_videos.py"
echo.
pause
