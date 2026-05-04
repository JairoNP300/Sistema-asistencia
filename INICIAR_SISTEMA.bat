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

REM === LIMPIEZA Y OPTIMIZACION DEL SISTEMA ===
echo [1/5] Limpiando cache de npm...
if exist "node_modules\.cache" rmdir /s /q "node_modules\.cache" 2>nul

echo [2/5] Verificando integridad de datos...
node -e "
const fs = require('fs');
const DATA_FILE = 'data.json';
if (fs.existsSync(DATA_FILE)) {
    try {
        const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
        // Limpiar logs antiguos (mantener ultimos 1000)
        if (data.logs && data.logs.length > 1000) {
            data.logs = data.logs.slice(-1000);
            console.log('  - Logs optimizados:', data.logs.length, 'registros');
        }
        // Limpiar tokens usados antiguos (mantener ultimos 500)
        if (data.usedTokens && data.usedTokens.length > 500) {
            data.usedTokens = data.usedTokens.slice(-500);
            console.log('  - Tokens optimizados:', data.usedTokens.length, 'tokens');
        }
        // Limpiar security log (mantener ultimos 200)
        if (data.securityLog && data.securityLog.length > 200) {
            data.securityLog = data.securityLog.slice(-200);
            console.log('  - Security log optimizado:', data.securityLog.length, 'registros');
        }
        // Asegurar estructura de stats
        if (!data.stats) data.stats = { present: 0, entries: 0, exits: 0, blocked: 0, lateEntries: 0 };
        if (data.stats.lateEntries === undefined) data.stats.lateEntries = 0;
        // Guardar datos optimizados
        fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
        console.log('  - Datos verificados y optimizados OK');
    } catch (e) {
        console.log('  - Error al verificar datos:', e.message);
    }
} else {
    console.log('  - Archivo de datos no existe, se creara nuevo');
}
"

echo [3/5] Instalando dependencias...
if not exist "node_modules\" (
    call npm install
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
echo  
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
