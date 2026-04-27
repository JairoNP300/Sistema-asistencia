@echo off
chcp 65001 >nul
title QR-Asistencia - Sistema Completo
color 0A

echo.
echo ╔════════════════════════════════════════════════════════════════╗
echo ║        🚀 QR-ASISTENCIA - INICIANDO SISTEMA                    ║
echo ╚════════════════════════════════════════════════════════════════╝
echo.

cd /d "%~dp0"

echo [1/4] 📦 Instalando dependencias...
if not exist "node_modules\" (
    call npm install
    if errorlevel 1 (
        echo ❌ Error al instalar dependencias
        pause
        exit /b 1
    )
)
echo ✅ Dependencias listas
echo.

echo [2/4] 🔧 Verificando configuración...
if not exist ".env" (
    (
        echo PORT=3000
        echo MONGODB_URI=mongodb+srv://Zetino19:JairoZetino22@cnad.zyac7wv.mongodb.net/qr_asistencia?retryWrites=true^&w=majority^&appName=CNAD
        echo JWT_SECRET=qr_asistencia_secret_key_production_2024
        echo DEFAULT_ADMIN_USERNAME=admin
        echo DEFAULT_ADMIN_PASSWORD=admin123
        echo NODE_ENV=production
    ) > .env
)
echo ✅ Configuración lista
echo.

echo [3/4] 🔄 Subiendo cambios a GitHub...
git add -A >nul 2>&1
git diff-index --quiet HEAD >nul 2>&1
if errorlevel 1 (
    git commit -m "Auto-update: %date% %time%" >nul 2>&1
    git push origin main >nul 2>&1
    if not errorlevel 1 (
        echo ✅ Cambios subidos - Render se actualizará en ~2 min
    )
) else (
    echo ✅ Sin cambios nuevos
)
echo.

echo [4/4] 🌐 Iniciando servidor...
echo.
echo ╔════════════════════════════════════════════════════════════════╗
echo ║                    ✅ SISTEMA INICIADO                         ║
echo ║                                                                ║
echo ║  🌐 URL PRODUCCIÓN: https://sistema-asistencia-s0m2.onrender.com
echo ║  🖥️  Servidor Local: http://localhost:3000                     ║
echo ║                                                                ║
echo ║  👤 Usuario: admin                                             ║
echo ║  🔑 Contraseña: admin123                                       ║
echo ║                                                                ║
echo ║  ⚠️  Presiona Ctrl+C para detener el servidor                 ║
echo ╚════════════════════════════════════════════════════════════════╝
echo.

REM Abrir URL de Render
start https://sistema-asistencia-s0m2.onrender.com

REM Iniciar servidor (bloquea hasta Ctrl+C)
node server.js

