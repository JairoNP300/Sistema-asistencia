@echo off
chcp 65001 >nul
title QR-Asistencia
color 0A
cd /d "%~dp0"

echo Instalando dependencias...
if not exist "node_modules\" call npm install

echo Subiendo cambios a GitHub...
git add -A >nul 2>&1
git diff-index --quiet HEAD >nul 2>&1
if errorlevel 1 (
    git commit -m "Auto-update: %date% %time%" >nul 2>&1
    git push origin main >nul 2>&1
    echo Cambios subidos. Render actualizara en ~2 minutos.
) else (
    echo Sin cambios nuevos.
)

echo.
echo =====================================================
echo  URL PRODUCCION: https://sistema-asistencia-s0m2.onrender.com
echo  Usuario: admin  /  Contrasena: admin123
echo  Presiona Ctrl+C para detener el servidor local
echo =====================================================
echo.

start https://sistema-asistencia-s0m2.onrender.com
node server.js

