@echo off
chcp 65001 >nul
title 作业小站
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo   没有找到 Node.js，请先到 https://nodejs.org 下载安装 LTS 版本。
  echo.
  pause
  exit /b 1
)

echo.
echo   正在启动作业小站...
echo.
node server.js
pause
