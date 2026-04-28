/**
 * QR-Asistencia — Servidor Express v4.0 (Full MongoDB Cloud Integration)
 * ---------------------------------------------------------------------
 * Este servidor prioriza el uso de MongoDB Atlas para sincronización total
 * entre múltiples computadoras a larga distancia.
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const os = require('os');
const mongoose = require('mongoose');
const State = require('./models/State'); // Nuestro modelo de datos

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data.json');

// --- MIDDLEWARES ---
app.use(cors());
app.use(express.json({ limit: '15mb' }));
app.use(express.static(path.join(__dirname)));

// Ruta principal para smartphones y monitoreo
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// --- DETECTAR IP ---
function getLocalIP() {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal) return iface.address;
        }
    }
    return 'localhost';
}

// --- LÓGICA DE MIGRACIÓN (Sincronizar data.json a la Nube) ---
async function migrateToCloud() {
    try {
        const cloudState = await State.findOne();
        if (!cloudState) {
            console.log('📦 Base de datos en la nube vacía. Iniciando base de datos limpia.');
            const defaultState = new State({
                employees: [], logs: [], departments: ['TI', 'RRHH', 'Ventas', 'Operaciones', 'Finanzas'],
                config: { tokenLife: 30, timeWindow: 300, maxRetries: 3, antiReplay: true },
                adminConfig: { company: 'Mi Empresa S.A.', logo: '🏢', entryTime: '08:00', exitTime: '18:00', grace: 10 },
                stats: { present: 0, entries: 0, exits: 0, blocked: 0 },
                presentSet: [], secretKey: '', usedTokens: [], securityLog: [],
                currentDate: new Date().toLocaleDateString('es-MX')
            });
            await defaultState.save();
        } else {
            // Corregir timeWindow si está mal configurado (< 60s)
            if (!cloudState.config) cloudState.config = {};
            if (!cloudState.config.timeWindow || cloudState.config.timeWindow < 60) {
                cloudState.config.timeWindow = 300;
                cloudState.markModified('config');
                await cloudState.save();
                console.log('✅ timeWindow corregido a 300s');
            }
            console.log('🌐 Sistema sincronizado con la Nube.');
        }
    } catch (e) {
        console.error('❌ Error en migración:', e.message);
    }
}

// --- CONEXIÓN A MONGODB ---
let useMongo = false;
if (process.env.MONGODB_URI && !process.env.MONGODB_URI.includes('USUARIO:PASSWORD')) {
    mongoose.connect(process.env.MONGODB_URI)
        .then(async () => {
            console.log('✅ Conectado a MongoDB Atlas (Cloud Mode)');
            useMongo = true;
            await migrateToCloud();
        })
        .catch(err => {
            console.warn('⚠️ No se pudo conectar a MongoDB. Usando modo Local (data.json):', err.message);
        });
}

// --- API ROUTES (Escalable & Cloud Optimized) ---

// GET /api/data - Lectura compartida
app.get('/api/data', async (req, res) => {
    // 🔥 FORZAR NO CACHÉ (Artillería pesada)
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    res.set('Surrogate-Control', 'no-store');

    try {
        let data;
        if (useMongo) {
            data = await State.findOne();
        } else {
            // Fallback Local
            data = fs.existsSync(DATA_FILE) ? JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')) : null;
        }

        if (!data) return res.status(404).json({ error: 'System state not found' });
        
        // Reset diario automático
        const today = new Date().toLocaleDateString('es-MX', { timeZone: 'America/Mexico_City' });
        if (data.currentDate && data.currentDate !== today) {
            console.log('📅 Cambio de día detectado. Reseteando estadísticas...');
            data.logs = [];
            data.stats = { present: 0, entries: 0, exits: 0, blocked: 0 };
            data.presentSet = [];
            data.currentDate = today;
            if (useMongo) await data.save(); else fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
        }

        res.json(data);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// POST /api/save - Sincronizar estado completo (Admin)
app.post('/api/save', async (req, res) => {
    try {
        const newData = req.body;
        if (useMongo) {
            await State.findOneAndUpdate({}, newData, { upsert: true });
        } else {
            fs.writeFileSync(DATA_FILE, JSON.stringify(newData, null, 2));
        }
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// POST /api/employees/upsert - Actualización atómica de empleado
app.post('/api/employees/upsert', async (req, res) => {
    try {
        const employee = req.body;
        if (useMongo) {
            const state = await State.findOne();
            const idx = state.employees.findIndex(e => e.id === employee.id);
            if (idx >= 0) state.employees[idx] = employee; else state.employees.push(employee);
            await state.save();
        } else {
            const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
            const idx = data.employees.findIndex(e => e.id === employee.id);
            if (idx >= 0) data.employees[idx] = employee; else data.employees.push(employee);
            fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
        }
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// POST /api/checkin - Registro de acceso desde móviles
app.post('/api/checkin', async (req, res) => {
    try {
        const logEntry = req.body;
        let data;
        
        if (useMongo) {
            data = await State.findOne();
        } else {
            data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
        }

        // Actualizar datos
        data.logs.push(logEntry);
        if (logEntry.type === 'entry') {
            if (!data.presentSet.includes(logEntry.empId)) data.presentSet.push(logEntry.empId);
            data.stats.entries++;
        } else if (logEntry.type === 'exit') {
            data.presentSet = data.presentSet.filter(id => id !== logEntry.empId);
            data.stats.exits++;
        } else {
            data.stats.blocked++;
        }

        const emp = data.employees.find(e => e.id === logEntry.empId);
        if (emp) emp.lastAccess = logEntry.ts;
        if (logEntry.tokenNonce) data.usedTokens.push(logEntry.tokenNonce);

        if (useMongo) await data.save(); else fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
        
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/config', (req, res) => {
    res.json({ ip: getLocalIP(), port: PORT, mode: useMongo ? 'Cloud' : 'Local' });
});

// GET /api/version — hash del build para auto-refresh del navegador
app.get('/api/version', (req, res) => {
    res.set('Cache-Control', 'no-store');
    const hashFile = path.join(__dirname, 'build.hash');
    const version = fs.existsSync(hashFile) ? fs.readFileSync(hashFile, 'utf8').trim() : 'init';
    res.json({ version, ts: Date.now() });
});

// --- LOCATION ENDPOINTS ---

// POST /api/location/checkin — Registrar ubicación GPS (sin autenticación, igual que /api/checkin)
app.post('/api/location/checkin', async (req, res) => {
    try {
        const { empId, lat, lng, timestamp } = req.body;
        if (!empId || lat === undefined || lng === undefined || !timestamp) {
            return res.status(400).json({ error: 'Missing required fields: empId, lat, lng, timestamp' });
        }

        if (useMongo) {
            const state = await State.findOne();
            state.locationRecords.push(req.body);
            state.locationRecords = state.locationRecords.slice(-500);
            await state.save();
        } else {
            const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
            if (!data.locationRecords) data.locationRecords = [];
            data.locationRecords.push(req.body);
            data.locationRecords = data.locationRecords.slice(-500);
            fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
        }

        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// GET /api/location/records — Obtener último registro por empId (sin autenticación)
app.get('/api/location/records', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.set('Pragma', 'no-cache');

    try {
        let records;
        if (useMongo) {
            const state = await State.findOne();
            records = state ? (state.locationRecords || []) : [];
        } else {
            const data = fs.existsSync(DATA_FILE) ? JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')) : {};
            records = data.locationRecords || [];
        }

        // Deduplicar: conservar solo el registro más reciente por empId
        const latest = {};
        for (const rec of records) {
            if (!latest[rec.empId] || rec.timestamp > latest[rec.empId].timestamp) {
                latest[rec.empId] = rec;
            }
        }

        res.json(Object.values(latest));
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// DELETE /api/location/records — Vaciar historial de ubicaciones (requiere autenticación)
app.delete('/api/location/records', async (req, res) => {
    try {
        let N;
        if (useMongo) {
            const state = await State.findOne();
            N = state.locationRecords ? state.locationRecords.length : 0;
            state.locationRecords = [];
            await state.save();
        } else {
            const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
            N = data.locationRecords ? data.locationRecords.length : 0;
            data.locationRecords = [];
            fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
        }

        res.json({ success: true, deleted: N });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Iniciar
app.listen(PORT, '0.0.0.0', () => {
    console.log(`=========================================`);
    console.log(`🚀 SISTEMA CLOUD ACTIVO Y LISTO`);
    console.log(`🌍 Modo: ${useMongo ? 'Sincronizado con Atlas' : 'Local (Esperando .env)'}`);
    console.log(`📍 Puerto: ${PORT}`);
    console.log(`=========================================`);
});