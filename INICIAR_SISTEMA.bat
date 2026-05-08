@echo off
chcp 65001 >nul
title QR-Asistencia
color 0A
cd /d "%~dp0"

echo Instalando dependencias...
if not exist "node_modules\" call npm install

echo Verificando estado de Git...
git pull origin main >nul 2>&1

echo Subiendo cambios recientes a GitHub...
git add -A >nul 2>&1
git diff-index --quiet HEAD >nul 2>&1
if errorlevel 1 (
    git commit -m "Auto: %date% %time% - Actualizacion del sistema" >nul 2>&1
    git push origin main >nul 2>&1
    echo Cambios subidos exitosamente a GitHub
) else (
    echo No hay cambios pendientes para subir
)

echo.
echo =====================================================
echo  URL: https://sistema-asistencia-s0m2.onrender.com
echo  Link permanente: https://sistema-asistencia-s0m2.onrender.com/checkin.html
echo  Usuario: admin  /  Contrasena: admin123
echo  Auto-deploy activo - cambios se suben solos
echo  El navegador se actualiza automaticamente
echo  Presiona Ctrl+C para detener
echo =====================================================
echo.

echo Abriendo sistema principal...
start https://sistema-asistencia-s0m2.onrender.com

timeout /t 3 >nul

echo Abriendo link permanente en nueva ventana...
start https://sistema-asistencia-s0m2.onrender.com/checkin.html

REM Iniciar servidor Y watch-deploy en paralelo
echo Iniciando servidor local...
node -e "const {spawn}=require('child_process');const s=spawn('node',['server.js'],{stdio:'inherit'});const w=spawn('node',['watch-deploy.js'],{stdio:'inherit'});s.on('close',()=>process.exit());process.on('SIGINT',()=>{s.kill();w.kill();process.exit());});"
