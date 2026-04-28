@echo off
chcp 65001 >nul
title QR-Asistencia
color 0A
cd /d "%~dp0"

echo Instalando dependencias...
if not exist "node_modules\" call npm install

echo Subiendo cambios iniciales a GitHub...
git add -A >nul 2>&1
git diff-index --quiet HEAD >nul 2>&1
if errorlevel 1 (
    git commit -m "Auto: %date% %time%" >nul 2>&1
    git push origin main >nul 2>&1
)

echo.
echo =====================================================
echo  URL: https://sistema-asistencia-s0m2.onrender.com
echo  Usuario: admin  /  Contrasena: admin123
echo  Auto-deploy activo - cambios se suben solos
echo  El navegador se actualiza automaticamente
echo  Presiona Ctrl+C para detener
echo =====================================================
echo.

start https://sistema-asistencia-s0m2.onrender.com

REM Iniciar servidor Y watch-deploy en paralelo
node -e "const {spawn}=require('child_process');const s=spawn('node',['server.js'],{stdio:'inherit'});const w=spawn('node',['watch-deploy.js'],{stdio:'inherit'});s.on('close',()=>process.exit());process.on('SIGINT',()=>{s.kill();w.kill();process.exit();});"
