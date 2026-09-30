@echo off
title Blog + Music System - STOP
rem Kill services by listening port (path-independent).

echo Stopping backend blog-server (port 2333) ...
powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort 2333 -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique | ForEach-Object { taskkill /PID $_ /T /F 2>$null }"

echo Stopping frontend Shiro (port 2323) ...
powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort 2323 -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique | ForEach-Object { taskkill /PID $_ /T /F 2>$null }"

ping -n 3 127.0.0.1 >nul

echo.
echo Check remaining listeners:
powershell -NoProfile -Command "Write-Host ('  port 2333 left: ' + @(Get-NetTCPConnection -LocalPort 2333 -State Listen -ErrorAction SilentlyContinue).Count); Write-Host ('  port 2323 left: ' + @(Get-NetTCPConnection -LocalPort 2323 -State Listen -ErrorAction SilentlyContinue).Count)"

echo Done.
pause
