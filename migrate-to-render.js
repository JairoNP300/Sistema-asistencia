/**
 * migrate-to-render.js
 * Limpia y envía los datos locales (data.json) a Render.
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const RENDER_URL = 'sistema-asistencia-s0m2.onrender.com';
const DATA_FILE = path.join(__dirname, 'data.json');

function postData(data) {
    return new Promise((resolve, reject) => {
        // Forzamos que la fecha sea la de hoy para evitar bloqueos
        data.currentDate = new Date().toLocaleDateString('es-MX', { timeZone: 'America/Mexico_City' });
        
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
    console.log('🚀 Reiniciando migración forzada...');

    if (!fs.existsSync(DATA_FILE)) {
        console.error('❌ Error: No se encontró data.json');
        return;
    }

    const localData = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    console.log(`📋 Preparando ${localData.employees.length} empleados originales...`);

    try {
        console.log('⏳ Sobrescribiendo base de datos en Render...');
        const result = await postData(localData);
        
        if (result.status === 200) {
            console.log('\n✅ ¡MIGRACIÓN COMPLETADA CON ÉXITO!');
            console.log('   Los empleados de la lista (Jairo, Xiomara, etc.) ya deberían aparecer.');
            console.log('\n👉 URL para verificar: https://sistema-asistencia-s0m2.onrender.com');
        } else {
            console.error('❌ Error al subir:', result.body);
        }
    } catch (err) {
        console.error('❌ Error de conexión:', err.message);
    }
}

migrate();
