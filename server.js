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
const User = require('./models/User'); // Usuarios administrativos
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const SECRET = process.env.JWT_SECRET || 'qr_asistencia_secret';

// --------- Auth helpers ---------
function requireAuth(req, res, next) {
    const auth = req.headers['authorization'];
    if (!auth) return res.status(401).json({ error: 'No autorizado' });
    const parts = auth.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') return res.status(401).json({ error: 'Formato de token inválido' });
    const token = parts[1];
    try {
        const payload = jwt.verify(token, SECRET);
        req.user = payload;
        next();
    } catch (e) {
        res.status(403).json({ error: 'Token inválido' });
    }
}

// --- APP INIT (debe ir ANTES de cualquier app.use) ---
const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data.json');

// --- MIDDLEWARES ---
app.use(cors());
app.use(express.json({ limit: '15mb' }));
app.use(express.static(path.join(__dirname)));

// Apply auth to API routes, except login and checkin (used by mobile devices without JWT)
app.use('/api', (req, res, next) => {
    if (req.path === '/auth/login') return next();
    if (req.path === '/checkin') return next();
    requireAuth(req, res, next);
});

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
            console.log('📦 Base de datos en la nube vacía. Buscando datos locales para migrar...');
            if (fs.existsSync(DATA_FILE)) {
                const localData = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
                const newState = new State(localData);
                await newState.save();
                console.log('✅ Migración exitosa: data.json -> MongoDB Cloud');
            } else {
                console.log('ℹ️ No hay datos locales para migrar. Iniciando base de datos limpia.');
                const defaultState = new State({
                    employees: [], logs: [], departments: ['TI', 'RRHH', 'Ventas', 'Operaciones', 'Finanzas'],
                    config: { tokenLife: 30, timeWindow: 30, maxRetries: 3, antiReplay: true },
                    adminConfig: { company: 'Mi Empresa S.A.', logo: '🏢', entryTime: '08:00', exitTime: '18:00', grace: 10 },
                    stats: { present: 0, entries: 0, exits: 0, blocked: 0 },
                    presentSet: [], secretKey: '', usedTokens: [], securityLog: [], currentDate: new Date().toLocaleDateString('es-MX')
                });
                await defaultState.save();
            }
        } else {
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
            // Seed admin user if no users exist
            try {
                const userCount = await User.countDocuments();
                if (userCount === 0) {
                    const adminPw = process.env.DEFAULT_ADMIN_PASSWORD || 'admin123';
                    const hash = await bcrypt.hash(adminPw, 10);
                    const admin = new User({ username: process.env.DEFAULT_ADMIN_USERNAME || 'admin', passwordHash: hash, name: 'Admin', role: 'admin' });
                    await admin.save();
                    console.log('Seed admin user created: admin/********');
                }
            } catch (seedErr) {
                console.warn('Error seed admin:', seedErr.message);
            }
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

// -------------- Auth Endpoints --------------
app.post('/api/auth/login', async (req, res) => {
    try {
        const { username, password } = req.body || {};
        if (!username || !password) return res.status(400).json({ error: 'Credenciales requeridas' });
        // Buscar usuario en DB (Mongo) o en fallback local (si no hay DB aún)
        let user = null;
        try { user = await User.findOne({ username }); } catch { /* ignore */ }
        if (!user) {
            // Si no existe en DB, intentar un usuario por defecto en entorno (solo para demo)
            const defaultUser = process.env.DEFAULT_ADMIN_USERNAME || 'admin';
            const defaultPass = process.env.DEFAULT_ADMIN_PASSWORD || 'admin123';
            if (username === defaultUser && password === defaultPass) {
                const payload = { uid: 'local-admin', username, role: 'admin' };
                const token = jwt.sign(payload, SECRET, { expiresIn: '24h' });
                return res.json({ token, user: { id: payload.uid, username, name: 'Admin Local', role: 'admin' } });
            }
            return res.status(401).json({ error: 'Credenciales inválidas' });
        }
        const valid = await bcrypt.compare(password, user.passwordHash);
        if (!valid) return res.status(401).json({ error: 'Credenciales inválidas' });
        const payload = { uid: user._id, username: user.username, role: user.role || 'admin' };
        const token = jwt.sign(payload, SECRET, { expiresIn: '24h' });
        res.json({ token, user: { id: user._id, username: user.username, name: user.name || user.username, role: user.role || 'admin' } });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Nueva API MVP inspirada en funciones de Jibble (presentes, entradas, reportes, export)
// 1) Presentes actualmente
// GET /api/attendance/present
app.get('/api/attendance/present', async (req, res) => {
    try {
        let data;
        if (useMongo) data = await State.findOne(); else data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
        const presentIds = data.presentSet || [];
        const presentEmployees = (data.employees || []).filter(e => presentIds.includes(e.id));
        res.json({ present: presentEmployees.map(e => ({ id: e.id, name: `${e.firstName} ${e.lastName}`, dept: e.dept, empNum: e.empNum, avatar: e.avatar })) });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// 2) Registrar una entrada/salida vía API
// POST /api/entries
// body: { empId, type: 'entry'|'exit', ts?, lat?, lon?, location? }
app.post('/api/entries', async (req, res) => {
    try {
        const { empId, type, ts, lat, lon, location } = req.body;
        if (!empId || !type || !['entry','exit'].includes(type)) {
            return res.status(400).json({ error: 'Parámetros inválidos' });
        }
        const now = ts ? new Date(ts) : new Date();

        let data = useMongo ? await State.findOne() : JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
        data.logs = data.logs || [];
        const emp = (data.employees || []).find(e => e.id === empId);
        const logEntry = {
            id: Date.now(),
            empId: empId,
            empName: emp ? `${emp.firstName} ${emp.lastName}` : 'Unknown',
            type: type,
            ts: now.toISOString(),
            tokenNonce: null,
            status: 'valid',
            reason: type === 'entry' ? 'Entrada registrada' : 'Salida registrada',
            source: 'api'
        };
        data.logs.push(logEntry);
        if (type === 'entry') {
            data.stats = data.stats || { present: 0, entries: 0, exits: 0, blocked: 0 };
            if (!data.presentSet.includes(empId)) data.presentSet.push(empId);
            data.stats.entries = (data.stats.entries || 0) + 1;
        } else if (type === 'exit') {
            data.stats = data.stats || { present: 0, entries: 0, exits: 0, blocked: 0 };
            data.presentSet = (data.presentSet || []).filter(id => id !== empId);
            data.stats.exits = (data.stats.exits || 0) + 1;
        }
        if (emp) emp.lastAccess = now.toISOString();
        if (req.body.tokenNonce) { data.usedTokens = data.usedTokens || []; data.usedTokens.push(req.body.tokenNonce); }
        if (useMongo) await data.save(); else fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
        res.json({ success: true, log: logEntry });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// 3) Reportes simples de resumen
// GET /api/reports/summary?range=today|week
app.get('/api/reports/summary', async (req, res) => {
    try {
        const range = (req.query.range || 'today').toLowerCase();
        let data = useMongo ? await State.findOne() : JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
        const logs = data.logs || [];
        const now = new Date();
        let start = new Date(); start.setHours(0,0,0,0);
        if (range === 'week') {
            const day = now.getDay() || 7; const diff = day - 1; start.setDate(now.getDate() - diff);
        }
        const filtered = logs.filter(l => new Date(l.ts) >= start);
        const entries = filtered.filter(l => l.type === 'entry').length;
        const exits = filtered.filter(l => l.type === 'exit').length;
        const presentNow = (data.presentSet || []).length;
        res.json({ range, from: start.toISOString(), entries, exits, presentNow, totalLogs: logs.length });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// 4) Exportar logs como CSV
// POST /api/export/logs
// cuerpo: { range: 'today'|'week' }
app.post('/api/export/logs', async (req, res) => {
    try {
        const range = (req.body?.range || 'today').toLowerCase();
        let data = useMongo ? await State.findOne() : JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
        const logs = data.logs || [];
        const now = new Date();
        let start = new Date(); start.setHours(0,0,0,0);
        if (range === 'week') {
            const day = now.getDay() || 7; const diff = day - 1; start.setDate(now.getDate() - diff);
        }
        const filtered = logs.filter(l => new Date(l.ts) >= start);

        const headers = ['id','empId','empName','type','ts','tokenNonce','status','reason','source'];
        const rows = filtered.map(l => [l.id, l.empId, l.empName, l.type, l.ts, l.tokenNonce, l.status, l.reason, l.source]);
        const csv = [headers, ...rows].map(r => r.map(v => String(v).replace(/"/g,'"')).join(','));
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename="logs.csv"');
        res.send(csv.map(r => r).join('\n'));
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

// POST /api/checkin - Registro de acceso desde móviles (sin auth requerida)
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
    res.json({ ip: getLocalIP(), port: PORT, mode: useMongo ? 'Cloud同步' : 'Local (Sin Nube)' });
});

// Iniciar
app.listen(PORT, '0.0.0.0', () => {
    console.log(`=========================================`);
    console.log(`🚀 SISTEMA CLOUD ACTIVO Y LISTO`);
    console.log(`🌍 Modo: ${useMongo ? 'Sincronizado con Atlas' : 'Local (Esperando .env)'}`);
    console.log(`📍 IP: http://${getLocalIP()}:${PORT}`);
    console.log(`=========================================`);

    // Abrir automáticamente el navegador en la PC del usuario
    require('child_process').exec(`start http://localhost:${PORT}`);
});
