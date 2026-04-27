@echo off
chcp 65001 >nul
title QR-Asistencia - Detener Sistema
color 0C

echo.
echo ╔════════════════════════════════════════════════════════════════╗
echo ║                                                                ║
echo ║        🛑 QR-ASISTENCIA - DETENER SISTEMA                      ║
echo ║                                                                ║
echo ╚════════════════════════════════════════════════════════════════╝
echo.

echo [1/2] 🔍 Buscando procesos de Node.js...
echo.

REM Buscar y mostrar procesos de node relacionados con el sistema
tasklist /FI "IMAGENAME eq node.exe" /FO TABLE 2>nul | find "node.exe" >nul
if errorlevel 1 (
    echo      ℹ️  No se encontraron procesos de Node.js en ejecución
    echo.
    goto :end
)

echo      ✅ Procesos de Node.js encontrados
echo.

echo [2/2] 🛑 Deteniendo todos los procesos de Node.js...
taskkill /F /IM node.exe >nul 2>&1
if errorlevel 1 (
    echo      ⚠️  No se pudieron detener algunos procesos
    echo      ℹ️  Es posible que ya estuvieran cerrados
) else (
    echo      ✅ Todos los procesos de Node.js han sido detenidos
)

echo.

:end
echo ╔════════════════════════════════════════════════════════════════╗
echo ║                                                                ║
echo ║                    ✅ SISTEMA DETENIDO                         ║
echo ║                                                                ║
echo ║  Para reiniciar el sistema, ejecuta INICIAR_SISTEMA.bat       ║
echo ║                                                                ║
echo ╚════════════════════════════════════════════════════════════════╝
echo.
echo Presiona cualquier tecla para cerrar esta ventana...
pause >nul
exit /b 0
