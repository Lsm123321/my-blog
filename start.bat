@echo off
title Blog + Music System - START
rem Relative paths: keep this bat in the smart_pro13 root folder,
rem the whole project folder can be moved anywhere and still work.
cd /d "%~dp0"

rem ===============================================================
rem  Usage:
rem    start.bat         production mode (default): pages open fast,
rem                      best for daily use / demo.
rem                      After editing source code, re-run build:
rem                        blog-server:  npm run build
rem                        Shiro web:    npm run build
rem    start.bat dev     development mode: hot reload, code edits
rem                      take effect instantly. First visit to each
rem                      page compiles on demand (3-10s is normal).
rem ===============================================================

if /i "%~1"=="dev" goto dev_mode

echo ============================================
echo   Blog + Music System - START (production)
echo ============================================

echo [1/4] Backend: checking build output (dist) ...
cd /d "%~dp0blog-server"
rem src has newer .ts than dist\main.js, or dist missing -> rebuild (takes seconds)
powershell -NoProfile -Command "$s=(gci -Recurse src -Filter *.ts | sort LastWriteTime -desc | select -First 1).LastWriteTime; $d=[datetime]::MinValue; if(Test-Path 'dist\main.js'){$d=(gci 'dist\main.js').LastWriteTime}; if($s -gt $d){exit 1}" >nul 2>&1
if errorlevel 1 (
    echo       source newer than dist, rebuilding backend ...
    call :kill_services
    call npm run build || goto fail
)

echo [2/4] Frontend: checking build output (.next) ...
cd /d "%~dp0Shiro\apps\web"
rem required-server-files.json only exists after a production build
if not exist ".next\required-server-files.json" (
    echo       no production build found, building frontend ...
    echo       ^(first run takes a few minutes^)
    call :kill_services
    call npm run build || goto fail
)

echo [3/4] Backend: starting on port 2333 ...
cd /d "%~dp0blog-server"
start "blog-server-2333" cmd /k "npm run start:prod"

echo [4/4] Frontend: starting on port 2323 ...
cd /d "%~dp0Shiro\apps\web"
start "shiro-web-2323" cmd /k "npm run start:prod"

goto wait_ready

:dev_mode
echo ============================================
echo   Blog + Music System - START (dev, hot reload)
echo ============================================
echo [1/2] Starting backend blog-server (port 2333, nest start) ...
cd /d "%~dp0blog-server"
start "blog-server-2333" cmd /k "npm run start"

echo [2/2] Starting frontend Shiro (port 2323, next dev) ...
cd /d "%~dp0Shiro\apps\web"
start "shiro-web-2323" cmd /k "npm run dev"

:wait_ready
echo Waiting for services to be ready ...
powershell -NoProfile -Command "for($i=0;$i -lt 120;$i++){try{$c=New-Object Net.Sockets.TcpClient('127.0.0.1',2333);$c.Close();exit 0}catch{Start-Sleep -m 500}};exit 1" >nul 2>&1
powershell -NoProfile -Command "for($i=0;$i -lt 240;$i++){try{$c=New-Object Net.Sockets.TcpClient('127.0.0.1',2323);$c.Close();exit 0}catch{Start-Sleep -m 500}};exit 1" >nul 2>&1

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
exit /b 0

:fail
echo.
echo [ERROR] Build failed. See messages above.
pause
exit /b 1

:kill_services
rem build 会重建 .next / dist，运行中的服务会因缓存目录被删而崩溃
rem （dev server 报 "Unable to write SST file" 后退出），build 前必须先清场
powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort 2323,2333 -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique | ForEach-Object { taskkill /PID $_ /T /F 2>$null }" >nul 2>&1
goto :eof
