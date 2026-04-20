/**
 * migrate-to-render.js
 * Envía los datos locales (data.json) al servidor de Render en la nube.
 * Ejecutar UNA SOLA VEZ para migrar los empleados.
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const RENDER_URL = 'sistema-asistencia-s0m2.onrender.com';
const DATA_FILE = path.join(__dirname, 'data.json');

function postData(data) {
    return new Promise((resolve, reject) => {
        const body = JSON.stringify(data);
        const options = {
            hostname: RENDER_URL,
            port: 443,
            path: '/api/save',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(body)
            }
        };

        const req = https.request(options, (res) => {
            let responseBody = '';
            res.on('data', (chunk) => responseBody += chunk);
            res.on('end', () => resolve({ status: res.statusCode, body: responseBody }));
        });

        req.on('error', reject);
        req.write(body);
        req.end();
    });
}

async function migrate() {
    console.log('🚀 Iniciando migración de empleados a Render...\n');

    if (!fs.existsSync(DATA_FILE)) {
        console.error('❌ No se encontró el archivo data.json');
        process.exit(1);
    }

    const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    console.log(`📋 Empleados encontrados: ${data.employees.length}`);
    data.employees.forEach(e => console.log(`   - ${e.firstName} ${e.lastName} (${e.empNum})`));

    console.log('\n⏳ Enviando datos a Render...');

    try {
        const result = await postData(data);
        if (result.status === 200) {
            console.log('\n✅ ¡Migración exitosa!');
            console.log('   Los empleados ya están disponibles en:');
            console.log('   https://sistema-asistencia-s0m2.onrender.com');
        } else {
            console.error(`❌ Error del servidor (${result.status}):`, result.body);
        }
    } catch (err) {
        console.error('❌ Error de conexión:', err.message);
        console.log('   Asegúrate de que Render esté activo e intenta de nuevo.');
    }
}

migrate();
