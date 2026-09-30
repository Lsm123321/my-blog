@echo off
title Blog + Music System - START
rem Relative paths: keep this bat in the smart_pro13 root folder,
rem the whole project folder can be moved anywhere and still work.
cd /d "%~dp0"

echo ============================================
echo   Blog + Music System - START
echo ============================================

echo [1/2] Starting backend blog-server (port 2333) ...
rem Runs prebuilt dist. If you changed backend source, run "npm run build" in blog-server first.
cd /d "%~dp0blog-server"
start "blog-server-2333" cmd /k "npm run start"

echo [2/2] Starting frontend Shiro (port 2323) ...
cd /d "%~dp0Shiro\apps\web"
start "shiro-web-2323" cmd /k "npm run dev"

echo Waiting for services ...
ping -n 9 127.0.0.1 >nul

echo.
echo ============================================
echo   All services started
echo --------------------------------------------
echo   Blog home:      http://localhost:2323
echo   Music page:     http://localhost:2323/music
echo   Backend API:    http://localhost:2333/api/v2
echo   Admin panel:    http://localhost:2333/admin
echo --------------------------------------------
echo   To stop everything, run stop.bat
echo ============================================
pause
