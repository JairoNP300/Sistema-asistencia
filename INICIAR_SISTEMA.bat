@echo off
chcp 65001 >nul
title QR-Asistencia - Iniciando Sistema
color 0A
cd /d "%~dp0"

echo.
echo =====================================================
echo  QR-ASISTENCIA - Sistema de Control de Personal
echo  Iniciando optimizacion del sistema...
echo =====================================================
echo.

REM === VERIFICAR NODE.JS ===
node --version >nul 2>&1
if errorlevel 1 (
    color 0C
    echo  ERROR: Node.js no esta instalado.
    echo  Descargalo en: https://nodejs.org
    echo.
    pause
    exit /b 1
)

REM === LIMPIEZA Y OPTIMIZACION DEL SISTEMA ===
echo [1/5] Limpiando cache de npm...
if exist "node_modules\.cache" rmdir /s /q "node_modules\.cache" 2>nul
echo  - Cache limpiado

echo [2/5] Verificando integridad de datos...
node optimize-data.js
echo  - Datos verificados

echo [3/5] Instalando dependencias...
if not exist "node_modules\express" (
    call npm install
    if errorlevel 1 (
        color 0C
        echo  ERROR: Fallo npm install.
        pause
        exit /b 1
    )
    echo  - Dependencias instaladas
) else (
    echo  - Dependencias ya instaladas
)

echo [4/5] Verificando conexion con GitHub...
git fetch origin main --quiet 2>nul
if errorlevel 1 (
    echo  - Advertencia: No se pudo conectar a GitHub
) else (
    echo  - Conexion con GitHub OK
)

echo [5/5] Subiendo cambios a GitHub...
git add -A >nul 2>&1
git diff-index --quiet HEAD >nul 2>&1
if errorlevel 1 (
    git commit -m "Auto-deploy: %date% %time% - Optimizacion sistema" >nul 2>&1
    git push origin main >nul 2>&1
    if errorlevel 1 (
        echo  - Error al subir cambios, reintentando...
        timeout /t 2 >nul
        git push origin main >nul 2>&1
        if errorlevel 1 (
            echo  - Advertencia: No se pudo subir a GitHub
        ) else (
            echo  - Cambios subidos correctamente (2do intento)
        )
    ) else (
        echo  - Cambios subidos correctamente
    )
) else (
    echo  - No hay cambios pendientes
)

echo.
echo =====================================================
echo  SISTEMA OPTIMIZADO Y LISTO
echo =====================================================
echo  URL: https://sistema-asistencia-s0m2.onrender.com
echo  Admin: Solo contrasena requerida
echo  QR: Acceso directo sin contrasena
echo.
echo  Caracteristicas:
echo  - Deteccion automatica de entradas tardias
echo  - Limpieza automatica de cache
echo  - Auto-deploy cada 30 segundos
echo  - Datos optimizados al iniciar
echo =====================================================
echo.
echo Abriendo navegador...
start https://sistema-asistencia-s0m2.onrender.com

echo Iniciando servidor local...
echo Presiona Ctrl+C para detener
echo.

REM Iniciar servidor Y watch-deploy en paralelo
node -e "const {spawn}=require('child_process');const s=spawn('node',['server.js'],{stdio:'inherit'});const w=spawn('node',['watch-deploy.js'],{stdio:'inherit'});s.on('close',()=>process.exit());process.on('SIGINT',()=>{s.kill();w.kill();process.exit();});"
