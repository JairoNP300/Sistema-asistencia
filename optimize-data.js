/**
 * optimize-data.js
 * Limpia y optimiza data.json al iniciar el sistema.
 * Llamado desde INICIAR_SISTEMA.bat
 */

const fs = require('fs');
const DATA_FILE = 'data.json';

if (!fs.existsSync(DATA_FILE)) {
    console.log('  - Archivo de datos no existe, se creara nuevo al iniciar');
    process.exit(0);
}

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
