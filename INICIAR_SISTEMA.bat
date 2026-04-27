@echo off
chcp 65001 >nul
title QR-Asistencia - Sistema de Control de Personal
color 0A

echo.
echo ╔════════════════════════════════════════════════════════════════╗
echo ║                                                                ║
echo ║        🚀 QR-ASISTENCIA - SISTEMA DE CONTROL DE PERSONAL       ║
echo ║                                                                ║
echo ║                    Iniciando sistema completo...              ║
echo ║                                                                ║
echo ╚════════════════════════════════════════════════════════════════╝
echo.

REM Cambiar al directorio del script
cd /d "%~dp0"

echo [1/4] 📦 Verificando dependencias de Node.js...
if not exist "node_modules\" (
    echo      ⚠️  Instalando dependencias por primera vez...
    echo      ℹ️  Esto puede tomar varios minutos...
    call npm install
    if errorlevel 1 (
        echo      ❌ Error al instalar dependencias
        echo      ℹ️  Intenta ejecutar manualmente: npm install
        pause
        exit /b 1
    )
    echo      ✅ Dependencias instaladas correctamente
) else (
    echo      ✅ Dependencias ya instaladas
)

echo.
echo [2/4] 🔧 Verificando configuración...
if not exist ".env" (
    echo      ⚠️  Archivo .env no encontrado
    echo      ℹ️  Creando .env de ejemplo...
    (
        echo # Configuración del servidor QR-Asistencia
        echo.
        echo # Puerto de escucha
        echo PORT=3000
        echo.
        echo # MongoDB Atlas Connection
        echo MONGODB_URI=mongodb+srv://USUARIO:PASSWORD@cluster.mongodb.net/qr-asistencia?retryWrites=true^&w=majority
        echo.
        echo # JWT Secret
        echo JWT_SECRET=qr_asistencia_secret_key_change_this
        echo.
        echo # Admin Credentials
        echo DEFAULT_ADMIN_USERNAME=admin
        echo DEFAULT_ADMIN_PASSWORD=admin123
        echo.
        echo # Environment
        echo NODE_ENV=production
    ) > .env
    echo      ✅ Archivo .env creado
    echo      ⚠️  IMPORTANTE: Configura tu MONGODB_URI en el archivo .env
    echo      ℹ️  El sistema puede funcionar en modo local sin MongoDB
    echo.
    pause
) else (
    echo      ✅ Archivo .env encontrado
)

echo.
echo [3/4] 🌐 Iniciando servidor Node.js...
echo      📍 El servidor se iniciará en http://localhost:3000
echo      📍 También accesible desde tu red local
echo      ⏳ Esperando que el servidor inicie...
echo.

REM Iniciar el servidor en una nueva ventana
start "QR-Asistencia Server" cmd /k "echo ╔════════════════════════════════════════════════════════════════╗ && echo ║          QR-ASISTENCIA SERVER - NO CERRAR ESTA VENTANA         ║ && echo ╚════════════════════════════════════════════════════════════════╝ && echo. && node server.js"

REM Esperar 5 segundos para que el servidor inicie completamente
timeout /t 5 /nobreak >nul

echo      ✅ Servidor iniciado
echo.
echo [4/4] 🔄 Iniciando auto-deploy (watch-deploy)...
echo      📝 Los cambios se subirán automáticamente a GitHub
echo      ℹ️  Esto mantiene sincronizado tu código con Render
echo.

REM Iniciar watch-deploy en una nueva ventana
start "QR-Asistencia Auto-Deploy" cmd /k "echo ╔════════════════════════════════════════════════════════════════╗ && echo ║      AUTO-DEPLOY ACTIVO - NO CERRAR ESTA VENTANA               ║ && echo ╚════════════════════════════════════════════════════════════════╝ && echo. && node watch-deploy.js"

echo      ✅ Auto-deploy iniciado
echo.
echo ╔════════════════════════════════════════════════════════════════╗
echo ║                                                                ║
echo ║                    ✅ SISTEMA INICIADO EXITOSAMENTE            ║
echo ║                                                                ║
echo ║  🌐 Servidor Local:  http://localhost:3000                     ║
echo ║  📱 Acceso Móvil:    http://[TU-IP-LOCAL]:3000                 ║
echo ║  🔄 Auto-Deploy:     ACTIVO                                    ║
echo ║  ☁️  MongoDB Atlas:   CONECTADO                                ║
echo ║                                                                ║
echo ║  ℹ️  Se abrieron 2 ventanas:                                   ║
echo ║     1. Servidor Node.js (Puerto 3000)                          ║
echo ║     2. Watch-Deploy (Sincronización automática)                ║
echo ║                                                                ║
echo ║  ⚠️  NO CIERRES ESAS VENTANAS para mantener el sistema        ║
echo ║     funcionando correctamente                                  ║
echo ║                                                                ║
echo ║  📖 Credenciales por defecto:                                  ║
echo ║     Usuario: admin                                             ║
echo ║     Contraseña: admin123                                       ║
echo ║                                                                ║
echo ║  🛑 Para detener el sistema: ejecuta DETENER_SISTEMA.bat      ║
echo ║                                                                ║
echo ╚════════════════════════════════════════════════════════════════╝
echo.

REM Abrir el navegador automáticamente después de 2 segundos
echo 🌐 Abriendo navegador en 2 segundos...
timeout /t 2 /nobreak >nul
start http://localhost:3000

echo.
echo ✅ Sistema completamente operativo
echo.
echo Presiona cualquier tecla para cerrar esta ventana
echo (El sistema seguirá funcionando en las otras ventanas)
pause >nul
exit /b 0
