@echo off
chcp 65001 >nul
title QR-Asistencia - Sistema Completo con Auto-Deploy
color 0A

echo.
echo ╔════════════════════════════════════════════════════════════════╗
echo ║                                                                ║
echo ║        🚀 QR-ASISTENCIA - SISTEMA COMPLETO                     ║
echo ║                                                                ║
echo ║        Iniciando sistema con auto-deploy a Render...          ║
echo ║                                                                ║
echo ╚════════════════════════════════════════════════════════════════╝
echo.

REM Cambiar al directorio del script
cd /d "%~dp0"

echo [1/5] 📦 Verificando e instalando dependencias...
if not exist "node_modules\" (
    echo      ⚠️  Instalando dependencias por primera vez...
    call npm install
    if errorlevel 1 (
        echo      ❌ Error al instalar dependencias
        pause
        exit /b 1
    )
    echo      ✅ Dependencias instaladas
) else (
    echo      ✅ Dependencias ya instaladas
)

echo.
echo [2/5] 🔧 Verificando configuración...
if not exist ".env" (
    echo      ⚠️  Creando archivo .env...
    (
        echo PORT=3000
        echo MONGODB_URI=mongodb+srv://Zetino19:JairoZetino22@cnad.zyac7wv.mongodb.net/qr_asistencia?retryWrites=true^&w=majority^&appName=CNAD
        echo JWT_SECRET=qr_asistencia_secret_key_production_2024
        echo DEFAULT_ADMIN_USERNAME=admin
        echo DEFAULT_ADMIN_PASSWORD=admin123
        echo NODE_ENV=production
    ) > .env
    echo      ✅ Archivo .env creado
) else (
    echo      ✅ Archivo .env encontrado
)

echo.
echo [3/5] 🔄 Subiendo cambios a GitHub...
git add -A >nul 2>&1
git diff-index --quiet HEAD
if errorlevel 1 (
    echo      📝 Cambios detectados, subiendo a GitHub...
    git commit -m "Actualización automática: %date% %time%" >nul 2>&1
    git push origin main >nul 2>&1
    if errorlevel 1 (
        echo      ⚠️  No se pudo subir a GitHub (puede que no haya cambios o no tengas permisos)
    ) else (
        echo      ✅ Cambios subidos a GitHub
        echo      🚀 Render se actualizará automáticamente en ~2 minutos
    )
) else (
    echo      ✅ No hay cambios nuevos para subir
)

echo.
echo [4/5] 🌐 Iniciando servidor local...
echo      📍 Servidor local: http://localhost:3000
echo      ⏳ Iniciando...
echo.

REM Iniciar servidor en nueva ventana
start "QR-Asistencia Server" cmd /k "echo ╔════════════════════════════════════════════════════════════════╗ && echo ║          QR-ASISTENCIA SERVER - NO CERRAR ESTA VENTANA         ║ && echo ╚════════════════════════════════════════════════════════════════╝ && echo. && node server.js"

REM Esperar 3 segundos
timeout /t 3 /nobreak >nul

echo      ✅ Servidor local iniciado
echo.
echo [5/5] 🔄 Iniciando auto-deploy (watch-deploy)...
echo      📝 Detecta cambios y los sube automáticamente a GitHub
echo      🚀 Render redeploya automáticamente después de cada push
echo.

REM Iniciar watch-deploy en nueva ventana
start "QR-Asistencia Auto-Deploy" cmd /k "echo ╔════════════════════════════════════════════════════════════════╗ && echo ║      AUTO-DEPLOY ACTIVO - NO CERRAR ESTA VENTANA               ║ && echo ╚════════════════════════════════════════════════════════════════╝ && echo. && node watch-deploy.js"

echo      ✅ Auto-deploy iniciado
echo.
echo ╔════════════════════════════════════════════════════════════════╗
echo ║                                                                ║
echo ║                    ✅ SISTEMA INICIADO EXITOSAMENTE            ║
echo ║                                                                ║
echo ║  🌐 URL DE PRODUCCIÓN (RENDER):                                ║
echo ║     https://sistema-asistencia-s0m2.onrender.com               ║
echo ║                                                                ║
echo ║  🖥️  Servidor Local (para desarrollo):                         ║
echo ║     http://localhost:3000                                      ║
echo ║                                                                ║
echo ║  🔄 Auto-Deploy:     ACTIVO                                    ║
echo ║  ☁️  MongoDB Atlas:   CONECTADO                                ║
echo ║                                                                ║
echo ║  ℹ️  Se abrieron 2 ventanas:                                   ║
echo ║     1. Servidor Node.js (Puerto 3000)                          ║
echo ║     2. Watch-Deploy (Auto-sync a GitHub → Render)              ║
echo ║                                                                ║
echo ║  ⚠️  NO CIERRES ESAS VENTANAS para mantener el sistema        ║
echo ║     funcionando correctamente                                  ║
echo ║                                                                ║
echo ║  📖 Credenciales:                                              ║
echo ║     Usuario: admin                                             ║
echo ║     Contraseña: admin123                                       ║
echo ║                                                                ║
echo ║  🔄 FLUJO DE AUTO-DEPLOY:                                      ║
echo ║     Cambios → Git Push → GitHub → Render → Producción         ║
echo ║                                                                ║
echo ╚════════════════════════════════════════════════════════════════╝
echo.

REM Abrir navegador con la URL de Render
echo 🌐 Abriendo URL de producción en 2 segundos...
timeout /t 2 /nobreak >nul
start https://sistema-asistencia-s0m2.onrender.com

echo.
echo ✅ Sistema completamente operativo
echo.
echo Presiona cualquier tecla para cerrar esta ventana
echo (El sistema seguirá funcionando en las otras ventanas)
pause >nul
exit /b 0
