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
const State = require('./models/State');
const User = require('./models/User');
const TimeEntry = require('./models/TimeEntry');
const TimeOffRequest = require('./models/TimeOffRequest');
const WorkSchedule = require('./models/WorkSchedule');
const Group = require('./models/Group');
const Project = require('./models/Project');
const Approval = require('./models/Approval');
const Invoice = require('./models/Invoice');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
let XLSX;
try { XLSX = require('xlsx'); } catch(e) { XLSX = null; }
const { haversineDistance, isInsideGeofence, calculateWorkingDays, computeInvoiceTotals } = require('./utils/verifier');
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


// ============================================================
// JIBBLE INTEGRATION — ALL NEW API ROUTES
// ============================================================

// ---- TIMER: Clock In ----
app.post('/api/timer/clockin', async (req, res) => {
  try {
    const { empId, projectId, source, location, selfieBase64, pin, notes } = req.body;
    if (!empId) return res.status(400).json({ error: 'empId requerido' });

    // Load employee with pinHash
    let emp = null;
    if (useMongo) {
      const st = await State.findOne();
      emp = (st.employees || []).find(e => e.id === empId);
    }

    if (!emp) return res.status(404).json({ error: 'Empleado no encontrado' });

    const vcfg = emp.verificationConfig || {};

    // Selfie check
    if (vcfg.selfieRequired && !selfieBase64) {
      return res.status(400).json({ error: 'SELFIE_REQUIRED' });
    }

    // PIN check
    if (vcfg.pinRequired) {
      if (!pin) return res.status(400).json({ error: 'PIN_REQUIRED' });
      const now = new Date();
      if (emp.pinLockedUntil && emp.pinLockedUntil > now) {
        return res.status(401).json({ error: 'PIN_LOCKED', lockedUntil: emp.pinLockedUntil });
      }
      // Need pinHash — re-query with select
      let empWithPin = null;
      if (useMongo) {
        const st = await State.findOne();
        empWithPin = (st.employees || []).find(e => e.id === empId);
      }
      const pinHash = empWithPin && empWithPin.pinHash;
      const valid = pinHash ? await bcrypt.compare(String(pin), pinHash) : false;
      if (!valid) {
        const attempts = (emp.pinAttempts || 0) + 1;
        if (useMongo) {
          const st = await State.findOne();
          const idx = st.employees.findIndex(e => e.id === empId);
          if (idx >= 0) {
            st.employees[idx].pinAttempts = attempts;
            if (attempts >= 3) st.employees[idx].pinLockedUntil = new Date(Date.now() + 5 * 60 * 1000);
            await st.save();
          }
        }
        return res.status(401).json({ error: 'INVALID_PIN', attemptsLeft: Math.max(0, 3 - attempts) });
      }
      // Reset attempts on success
      if (useMongo) {
        const st = await State.findOne();
        const idx = st.employees.findIndex(e => e.id === empId);
        if (idx >= 0) { st.employees[idx].pinAttempts = 0; st.employees[idx].pinLockedUntil = null; await st.save(); }
      }
    }

    // GPS / Geofence check
    let geofenceValid = null;
    let geofenceId = null;
    if (vcfg.gpsRequired && location) {
      const adminCfg = useMongo ? (await State.findOne())?.adminConfig : null;
      const geofences = (adminCfg && adminCfg.geofences) || [];
      if (geofences.length > 0) {
        const match = geofences.find(g => isInsideGeofence(location, g));
        if (!match) {
          return res.status(403).json({ error: 'GEOFENCE_VIOLATION', currentLocation: location, allowedGeofences: geofences });
        }
        geofenceValid = true;
        geofenceId = match.id || match._id;
      }
    }

    // Create TimeEntry
    const entry = await TimeEntry.create({
      empId, projectId: projectId || null,
      clockIn: new Date(),
      source: source || 'manual',
      offlineSync: false,
      location: location || null,
      selfieUrl: selfieBase64 ? 'data:image/jpeg;base64,' + selfieBase64.slice(0, 50) + '...' : null,
      geofenceId, geofenceValid,
      notes: notes || null
    });

    res.json({ success: true, timerId: entry._id, clockIn: entry.clockIn });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ---- TIMER: Clock Out ----
app.post('/api/timer/clockout', async (req, res) => {
  try {
    const { timerId } = req.body;
    if (!timerId) return res.status(400).json({ error: 'timerId requerido' });
    const entry = await TimeEntry.findById(timerId);
    if (!entry) return res.status(404).json({ error: 'TimeEntry no encontrado' });
    if (entry.clockOut) return res.status(409).json({ error: 'Ya tiene clockOut registrado' });
    const clockOut = new Date();
    const durationMs = clockOut - entry.clockIn;
    entry.clockOut = clockOut;
    entry.durationMs = durationMs;
    await entry.save();
    // Auto-create approval
    await Approval.create({ type: 'timesheet', refId: String(entry._id), empId: entry.empId, status: 'pending' });
    res.json({ success: true, durationMs, clockOut });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ---- TIMER: Active entries ----
app.get('/api/timer/active', async (req, res) => {
  try {
    const active = await TimeEntry.find({ clockOut: null }).lean();
    const today = new Date(); today.setHours(0,0,0,0);
    const weekStart = new Date(today); weekStart.setDate(today.getDate() - today.getDay());
    const result = await Promise.all(active.map(async e => {
      const dayEntries = await TimeEntry.find({ empId: e.empId, clockIn: { $gte: today }, clockOut: { $ne: null } }).lean();
      const weekEntries = await TimeEntry.find({ empId: e.empId, clockIn: { $gte: weekStart }, clockOut: { $ne: null } }).lean();
      const dayMs = dayEntries.reduce((s, x) => s + (x.durationMs || 0), 0);
      const weekMs = weekEntries.reduce((s, x) => s + (x.durationMs || 0), 0);
      return { ...e, accumulatedTodayMs: dayMs, accumulatedWeekMs: weekMs };
    }));
    res.json({ active: result });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ---- TIMER: Offline sync ----
app.post('/api/sync/offline', async (req, res) => {
  try {
    const { entries } = req.body;
    if (!Array.isArray(entries)) return res.status(400).json({ error: 'entries debe ser array' });
    let synced = 0, skipped = 0;
    for (const e of entries) {
      const exists = await TimeEntry.findOne({ empId: e.empId, clockIn: new Date(e.clockIn) });
      if (exists) { skipped++; continue; }
      await TimeEntry.create({ ...e, offlineSync: true, clockIn: new Date(e.clockIn), clockOut: e.clockOut ? new Date(e.clockOut) : null });
      synced++;
    }
    res.json({ success: true, synced, skipped });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ---- TIME OFF ----
app.post('/api/timeoff', async (req, res) => {
  try {
    const { empId, type, startDate, endDate, reason } = req.body;
    if (!empId || !type || !startDate || !endDate) return res.status(400).json({ error: 'Campos requeridos: empId, type, startDate, endDate' });
    const days = calculateWorkingDays(startDate, endDate);
    // Check balance
    if (useMongo && ['vacation','sick','personal'].includes(type)) {
      const st = await State.findOne();
      const emp = (st.employees || []).find(e => e.id === empId);
      const balance = emp && emp.timeOffBalance ? (emp.timeOffBalance[type] || 0) : 0;
      if (days > balance) return res.status(400).json({ error: 'INSUFFICIENT_BALANCE', available: balance, requested: days });
    }
    const request = await TimeOffRequest.create({ empId, type, startDate, endDate, days, reason: reason || '', status: 'pending' });
    await Approval.create({ type: 'timeoff', refId: String(request._id), empId, status: 'pending' });
    res.json({ success: true, requestId: request._id, daysRequested: days });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/timeoff', async (req, res) => {
  try {
    const { empId, status } = req.query;
    const filter = {};
    if (empId) filter.empId = empId;
    if (status) filter.status = status;
    const requests = await TimeOffRequest.find(filter).sort({ createdAt: -1 }).lean();
    res.json({ requests });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/timeoff/:id', async (req, res) => {
  try {
    const request = await TimeOffRequest.findById(req.params.id);
    if (!request) return res.status(404).json({ error: 'Solicitud no encontrada' });
    if (request.status !== 'pending') return res.status(409).json({ error: 'Solo se pueden cancelar solicitudes pendientes' });
    await TimeOffRequest.findByIdAndDelete(req.params.id);
    await Approval.deleteMany({ refId: req.params.id, type: 'timeoff' });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ---- APPROVALS ----
app.get('/api/approvals', async (req, res) => {
  try {
    const { status, type } = req.query;
    const filter = {};
    if (status) filter.status = status;
    if (type) filter.type = type;
    // If manager, filter by their groups
    if (req.user && req.user.role !== 'admin') {
      const groups = await Group.find({ managerIds: req.user.uid }).lean();
      const memberIds = [...new Set(groups.flatMap(g => g.memberIds))];
      filter.empId = { $in: memberIds };
    }
    const approvals = await Approval.find(filter).sort({ createdAt: -1 }).lean();
    res.json({ approvals });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/approvals/:id/resolve', async (req, res) => {
  try {
    const { status, comment } = req.body;
    if (!['approved','rejected'].includes(status)) return res.status(400).json({ error: 'status debe ser approved o rejected' });
    const approval = await Approval.findById(req.params.id);
    if (!approval) return res.status(404).json({ error: 'Aprobación no encontrada' });
    if (approval.status !== 'pending') return res.status(409).json({ error: 'Ya fue resuelta' });
    // Verify manager belongs to employee group
    if (req.user && req.user.role !== 'admin') {
      const groups = await Group.find({ managerIds: req.user.uid, memberIds: approval.empId }).lean();
      if (!groups.length) return res.status(403).json({ error: 'No tienes permiso para aprobar este registro' });
    }
    approval.status = status;
    approval.managerId = req.user ? req.user.uid : 'system';
    approval.comment = comment || '';
    approval.resolvedAt = new Date();
    await approval.save();
    // Lock TimeEntry if timesheet approved
    if (status === 'approved' && approval.type === 'timesheet') {
      await TimeEntry.findByIdAndUpdate(approval.refId, { locked: true, approvalId: String(approval._id) });
    }
    // Deduct balance if timeoff approved
    if (status === 'approved' && approval.type === 'timeoff') {
      const tor = await TimeOffRequest.findByIdAndUpdate(approval.refId, { status: 'approved', approvedBy: req.user ? req.user.uid : 'system', approvedAt: new Date() }, { new: true });
      if (tor && useMongo && ['vacation','sick','personal'].includes(tor.type)) {
        const st = await State.findOne();
        const idx = st.employees.findIndex(e => e.id === tor.empId);
        if (idx >= 0 && st.employees[idx].timeOffBalance) {
          st.employees[idx].timeOffBalance[tor.type] = Math.max(0, (st.employees[idx].timeOffBalance[tor.type] || 0) - tor.days);
          await st.save();
        }
      }
    }
    if (status === 'rejected' && approval.type === 'timeoff') {
      await TimeOffRequest.findByIdAndUpdate(approval.refId, { status: 'rejected' });
    }
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Unlock TimeEntry (admin only)
app.post('/api/timer/:id/unlock', async (req, res) => {
  try {
    if (!req.user || req.user.role !== 'admin') return res.status(403).json({ error: 'Solo admin puede desbloquear' });
    await TimeEntry.findByIdAndUpdate(req.params.id, { locked: false });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ---- SCHEDULES ----
app.get('/api/schedules', async (req, res) => {
  try {
    const schedules = await WorkSchedule.find().lean();
    res.json({ schedules });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/schedules', async (req, res) => {
  try {
    const schedule = await WorkSchedule.create(req.body);
    res.json({ success: true, schedule });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.put('/api/schedules/:id', async (req, res) => {
  try {
    const schedule = await WorkSchedule.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json({ success: true, schedule });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/schedules/:id', async (req, res) => {
  try {
    await WorkSchedule.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ---- GROUPS ----
app.get('/api/groups', async (req, res) => {
  try {
    const groups = await Group.find().lean();
    res.json({ groups });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/groups', async (req, res) => {
  try {
    const group = await Group.create(req.body);
    // Update groupIds on employees
    if (useMongo && group.memberIds && group.memberIds.length) {
      const st = await State.findOne();
      group.memberIds.forEach(mid => {
        const idx = st.employees.findIndex(e => e.id === mid);
        if (idx >= 0) {
          if (!st.employees[idx].groupIds) st.employees[idx].groupIds = [];
          if (!st.employees[idx].groupIds.includes(String(group._id))) st.employees[idx].groupIds.push(String(group._id));
        }
      });
      await st.save();
    }
    res.json({ success: true, group });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.put('/api/groups/:id', async (req, res) => {
  try {
    const group = await Group.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json({ success: true, group });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/groups/:id', async (req, res) => {
  try {
    await Group.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ---- PROJECTS ----
app.get('/api/projects', async (req, res) => {
  try {
    const { status } = req.query;
    const filter = status ? { status } : {};
    const projects = await Project.find(filter).lean();
    res.json({ projects });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/projects', async (req, res) => {
  try {
    const project = await Project.create(req.body);
    res.json({ success: true, project });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.put('/api/projects/:id', async (req, res) => {
  try {
    const project = await Project.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json({ success: true, project });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/projects/:id', async (req, res) => {
  try {
    await Project.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ---- EMPLOYEE PIN MANAGEMENT ----
app.post('/api/employees/:empId/pin', async (req, res) => {
  try {
    const { pin } = req.body;
    if (!pin || String(pin).length < 4) return res.status(400).json({ error: 'PIN debe tener al menos 4 dígitos' });
    const hash = await bcrypt.hash(String(pin), 10);
    if (useMongo) {
      const st = await State.findOne();
      const idx = st.employees.findIndex(e => e.id === req.params.empId);
      if (idx < 0) return res.status(404).json({ error: 'Empleado no encontrado' });
      st.employees[idx].pinHash = hash;
      st.employees[idx].pinAttempts = 0;
      st.employees[idx].pinLockedUntil = null;
      await st.save();
    }
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ---- INVOICING ----
app.post('/api/invoicing', async (req, res) => {
  try {
    const { projectId, periodStart, periodEnd } = req.body;
    if (!projectId || !periodStart || !periodEnd) return res.status(400).json({ error: 'projectId, periodStart, periodEnd requeridos' });
    const project = await Project.findById(projectId).lean();
    if (!project) return res.status(404).json({ error: 'Proyecto no encontrado' });
    const entries = await TimeEntry.find({
      projectId,
      clockIn: { $gte: new Date(periodStart), $lte: new Date(periodEnd) },
      clockOut: { $ne: null }
    }).lean();
    // Group by employee
    const byEmp = {};
    entries.forEach(e => {
      if (!byEmp[e.empId]) byEmp[e.empId] = { empId: e.empId, hours: 0 };
      byEmp[e.empId].hours += (e.durationMs || 0) / 3600000;
    });
    // Build line items
    let lineItems = [];
    if (useMongo) {
      const st = await State.findOne();
      lineItems = Object.values(byEmp).map(item => {
        const emp = (st.employees || []).find(e => e.id === item.empId);
        const rate = (emp && emp.hourlyRate) || project.hourlyRate || 0;
        return { empId: item.empId, empName: emp ? emp.firstName + ' ' + emp.lastName : item.empId, hours: Math.round(item.hours * 100) / 100, rate };
      });
    }
    const totals = computeInvoiceTotals(lineItems);
    const invoice = await Invoice.create({
      projectId, periodStart, periodEnd,
      totalHours: totals.totalHours,
      hourlyRate: project.hourlyRate || 0,
      totalAmount: totals.totalAmount,
      currency: project.currency || 'MXN',
      status: 'draft',
      lineItems: totals.lineItems
    });
    res.json({ success: true, invoice });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/invoicing', async (req, res) => {
  try {
    const invoices = await Invoice.find().sort({ createdAt: -1 }).lean();
    res.json({ invoices });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.put('/api/invoicing/:id', async (req, res) => {
  try {
    const invoice = await Invoice.findByIdAndUpdate(req.params.id, { status: req.body.status }, { new: true });
    res.json({ success: true, invoice });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/invoicing/:id/export', async (req, res) => {
  try {
    const invoice = await Invoice.findById(req.params.id).lean();
    if (!invoice) return res.status(404).json({ error: 'Factura no encontrada' });
    const fmt = req.query.format || 'csv';
    if (fmt === 'json') return res.json(invoice);
    const headers = ['empId','empName','hours','rate','amount'];
    const rows = invoice.lineItems.map(l => [l.empId, l.empName, l.hours, l.rate, l.amount]);
    const csv = [headers, ...rows].map(r => r.join(',')).join('
');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="invoice.csv"');
    res.send(csv);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ---- ADVANCED REPORTS ----
app.get('/api/reports/advanced', async (req, res) => {
  try {
    const { type, empId, groupId, projectId, dept, from, to, format } = req.query;
    const fromDate = from ? new Date(from) : new Date(new Date().setHours(0,0,0,0));
    const toDate = to ? new Date(to) : new Date();

    const entryFilter = { clockIn: { $gte: fromDate, $lte: toDate } };
    if (empId) entryFilter.empId = empId;
    if (projectId) entryFilter.projectId = projectId;

    // If groupId, get member IDs
    if (groupId) {
      const grp = await Group.findById(groupId).lean();
      if (grp) entryFilter.empId = { $in: grp.memberIds };
    }

    const entries = await TimeEntry.find(entryFilter).lean();

    // Enrich with employee data
    let employees = [];
    if (useMongo) {
      const st = await State.findOne();
      employees = st.employees || [];
    }

    // Filter by dept if needed
    let filteredEntries = entries;
    if (dept) {
      const deptEmpIds = employees.filter(e => e.dept === dept).map(e => e.id);
      filteredEntries = entries.filter(e => deptEmpIds.includes(e.empId));
    }

    const rows = filteredEntries.map(e => {
      const emp = employees.find(em => em.id === e.empId);
      return {
        empId: e.empId,
        empName: emp ? emp.firstName + ' ' + emp.lastName : e.empId,
        dept: emp ? emp.dept : '',
        projectId: e.projectId || '',
        clockIn: e.clockIn,
        clockOut: e.clockOut || null,
        durationMs: e.durationMs || 0,
        hours: Math.round(((e.durationMs || 0) / 3600000) * 100) / 100,
        source: e.source
      };
    });

    const totalHours = rows.reduce((s, r) => s + r.hours, 0);
    const result = { query: req.query, rows, totals: { totalHours: Math.round(totalHours * 100) / 100, totalEntries: rows.length }, generatedAt: new Date().toISOString() };

    if (format === 'csv') {
      const headers = ['empId','empName','dept','projectId','clockIn','clockOut','hours','source'];
      const csvRows = rows.map(r => [r.empId, r.empName, r.dept, r.projectId, r.clockIn, r.clockOut, r.hours, r.source]);
      const csv = [headers, ...csvRows].map(r => r.join(',')).join('
');
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="report.csv"');
      return res.send(csv);
    }

    if (format === 'xls' && XLSX) {
      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Reporte');
      const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename="report.xlsx"');
      return res.send(buf);
    }

    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ---- ACTIVITY FEED (who is working now) ----
app.get('/api/activity/live', async (req, res) => {
  try {
    const active = await TimeEntry.find({ clockOut: null }).lean();
    let employees = [];
    if (useMongo) { const st = await State.findOne(); employees = st.employees || []; }
    const projects = await Project.find({ status: 'active' }).lean();
    const feed = active.map(e => {
      const emp = employees.find(em => em.id === e.empId);
      const proj = projects.find(p => String(p._id) === e.projectId);
      return {
        empId: e.empId,
        empName: emp ? emp.firstName + ' ' + emp.lastName : e.empId,
        avatar: emp ? emp.avatar : '👤',
        dept: emp ? emp.dept : '',
        projectName: proj ? proj.name : null,
        clockIn: e.clockIn,
        elapsedMs: Date.now() - new Date(e.clockIn).getTime()
      };
    });
    res.json({ feed });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
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
