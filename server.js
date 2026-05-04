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
const deductions = require('./utils/deductions'); // Utilidades para cálculo de deducciones de El Salvador

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
            let needsSave = false;
            if (!cloudState.config) cloudState.config = {};
            // Corregir timeWindow si está mal configurado (< 60s)
            if (!cloudState.config.timeWindow || cloudState.config.timeWindow < 60) {
                cloudState.config.timeWindow = 300;
                cloudState.markModified('config');
                needsSave = true;
                console.log('✅ timeWindow corregido a 300s');
            }
            // Limpiar usedTokens acumulados: los nonces de tokens de estación
            // se guardaban incorrectamente, bloqueando check-ins de otros empleados
            if (cloudState.usedTokens && cloudState.usedTokens.length > 100) {
                cloudState.usedTokens = [];
                cloudState.markModified('usedTokens');
                needsSave = true;
                console.log('✅ usedTokens limpiados para desbloquear check-ins');
            }
            // Sincronizar stats.present con el tamaño real del presentSet
            if (cloudState.stats && cloudState.presentSet) {
                const realPresent = cloudState.presentSet.length;
                if (cloudState.stats.present !== realPresent) {
                    cloudState.stats.present = realPresent;
                    cloudState.markModified('stats');
                    needsSave = true;
                    console.log(`✅ stats.present corregido a ${realPresent}`);
                }
            }
            if (needsSave) await cloudState.save();
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
        
        // Reset diario automático — preserva logs históricos
        const today = new Date().toLocaleDateString('es-MX', { timeZone: 'America/Mexico_City' });
        if (data.currentDate && data.currentDate !== today) {
            console.log(`📅 Cambio de día detectado (${data.currentDate} → ${today}). Archivando logs...`);

            // Archivar logs del día anterior en history antes de borrarlos
            if (data.logs && data.logs.length > 0) {
                if (!data.history) data.history = new Map();
                // Guardar logs del día anterior indexados por fecha
                const prevDate = data.currentDate;
                const existing = data.history.get(prevDate) || [];
                data.history.set(prevDate, [...existing, ...data.logs]);
                // Mantener solo los últimos 90 días de historial
                const keys = [...data.history.keys()].sort();
                if (keys.length > 90) {
                    keys.slice(0, keys.length - 90).forEach(k => data.history.delete(k));
                }
                if (useMongo) data.markModified('history');
                console.log(`✅ ${data.logs.length} logs archivados en history[${prevDate}]`);
            }

            data.logs = [];
            data.stats = { present: 0, entries: 0, exits: 0, blocked: 0 };
            data.presentSet = [];
            data.usedTokens = [];
            data.currentDate = today;
            if (useMongo) {
                data.markModified('logs');
                data.markModified('stats');
                data.markModified('presentSet');
                data.markModified('usedTokens');
                await data.save();
            } else {
                fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
            }
        }

        // Limpiar usedTokens si tiene más de 500 entradas (evitar crecimiento indefinido)
        if (data.usedTokens && data.usedTokens.length > 500) {
            data.usedTokens = data.usedTokens.slice(-200);
            if (useMongo) { data.markModified('usedTokens'); await data.save(); }
            else fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
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
            // Usar $set para actualizar campos específicos sin perder locationRecords
            await State.findOneAndUpdate({}, {
                $set: {
                    employees: newData.employees || [],
                    logs: newData.logs || [],
                    departments: newData.departments || [],
                    secretKey: newData.secretKey || '',
                    config: newData.config || {},
                    adminConfig: newData.adminConfig || {},
                    securityLog: newData.securityLog || [],
                    stats: newData.stats || {},
                    presentSet: newData.presentSet || [],
                    usedTokens: newData.usedTokens || [],
                    currentDate: newData.currentDate || new Date().toLocaleDateString('es-MX')
                }
            }, { upsert: true, new: true });
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

// DELETE /api/employees/:id - Eliminar empleado
app.delete('/api/employees/:id', async (req, res) => {
    try {
        const { id } = req.params;
        if (useMongo) {
            const state = await State.findOne();
            const before = state.employees.length;
            state.employees = state.employees.filter(e => e.id !== id);
            state.presentSet = (state.presentSet || []).filter(eid => eid !== id);
            state.markModified('employees');
            state.markModified('presentSet');
            await state.save();
            if (state.employees.length === before) return res.status(404).json({ error: 'Empleado no encontrado' });
        } else {
            const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
            const before = data.employees.length;
            data.employees = data.employees.filter(e => e.id !== id);
            data.presentSet = (data.presentSet || []).filter(eid => eid !== id);
            if (data.employees.length === before) return res.status(404).json({ error: 'Empleado no encontrado' });
            fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
        }
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// GET /api/checkin/status/:empId - Verificar estado de registro del empleado hoy
app.get('/api/checkin/status/:empId', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    try {
        const { empId } = req.params;
        const today = new Date().toDateString();
        
        let data;
        if (useMongo) {
            data = await State.findOne();
        } else {
            data = fs.existsSync(DATA_FILE) ? JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')) : {};
        }
        
        const logs = data.logs || [];
        
        // Buscar registros de hoy
        const todayEntry = logs.find(l => 
            l.empId === empId && 
            l.type === 'entry' && 
            new Date(l.ts).toDateString() === today
        );
        const todayExit = logs.find(l => 
            l.empId === empId && 
            l.type === 'exit' && 
            new Date(l.ts).toDateString() === today
        );
        
        res.json({
            hasEntryToday: !!todayEntry,
            hasExitToday: !!todayExit,
            entryTime: todayEntry ? todayEntry.ts : null,
            exitTime: todayExit ? todayExit.ts : null
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// POST /api/checkin - Registro de acceso desde móviles
app.post('/api/checkin', async (req, res) => {
    try {
        const logEntry = req.body;

        // Validación básica
        if (!logEntry.empId || !logEntry.type) {
            return res.status(400).json({ error: 'empId y type son requeridos' });
        }

        // Validación obligatoria de ubicación (excepto para registros con justificación)
        if ((!logEntry.location || !logEntry.location.lat || !logEntry.location.lng) && logEntry.status !== 'override') {
            return res.status(400).json({ 
                error: 'Ubicación obligatoria', 
                details: 'Es obligatorio compartir tu ubicación GPS para registrar entrada o salida' 
            });
        }

        // Validar precisión de la ubicación solo si no es override
        if (logEntry.location && logEntry.location.accuracy > 100 && logEntry.status !== 'override') {
            return res.status(400).json({ 
                error: 'Precisión de ubicación insuficiente', 
                details: 'La precisión del GPS es muy baja. Intenta nuevamente en un lugar con mejor señal.' 
            });
        }

        let data;
        if (useMongo) {
            data = await State.findOne();
            if (!data) return res.status(500).json({ error: 'Estado del sistema no encontrado' });
        } else {
            if (!fs.existsSync(DATA_FILE)) return res.status(500).json({ error: 'Archivo de datos no encontrado' });
            data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
        }

        // Asegurar que los arrays existen
        if (!data.logs) data.logs = [];
        if (!data.presentSet) data.presentSet = [];
        if (!data.stats) data.stats = { present: 0, entries: 0, exits: 0, blocked: 0 };
        if (!data.usedTokens) data.usedTokens = [];
        
        // Verificar si ya existe registro del mismo tipo hoy (solo para registros normales, no overrides)
        if (logEntry.status !== 'override') {
            const today = new Date().toDateString();
            const existingToday = data.logs.find(l => 
                l.empId === logEntry.empId && 
                l.type === logEntry.type && 
                new Date(l.ts).toDateString() === today &&
                l.status !== 'override' // Los overrides previos no bloquean
            );
            
            if (existingToday) {
                return res.status(409).json({ 
                    error: 'Ya existe un registro de este tipo hoy',
                    existing: existingToday
                });
            }
        }

        // Registrar el log
        data.logs.push(logEntry);

        if (logEntry.type === 'entry') {
            if (!data.presentSet.includes(logEntry.empId)) data.presentSet.push(logEntry.empId);
            data.stats.entries = (data.stats.entries || 0) + 1;
        } else if (logEntry.type === 'exit') {
            data.presentSet = data.presentSet.filter(id => id !== logEntry.empId);
            data.stats.exits = (data.stats.exits || 0) + 1;
        }

        // Mantener stats.present sincronizado con el tamaño real del presentSet
        data.stats.present = data.presentSet.length;

        const emp = (data.employees || []).find(e => e.id === logEntry.empId);
        if (emp) emp.lastAccess = logEntry.ts;

        // NO guardar el nonce del token de estación en usedTokens:
        // El token de estación es compartido entre todos los empleados, por lo que
        // guardar su nonce bloquearía a todos los demás empleados que intenten
        // hacer check-in con el mismo QR en la misma ventana de tiempo.
        // Los tokens de estación ya tienen expiración por tiempo (tokenLife).
        // Solo guardar nonces de tokens personales (tipo 'employee').
        if (logEntry.tokenNonce && logEntry.source !== 'checkin') {
            data.usedTokens.push(logEntry.tokenNonce);
        }

        if (useMongo) {
            data.markModified('logs');
            data.markModified('presentSet');
            data.markModified('stats');
            data.markModified('employees');
            data.markModified('usedTokens');
            await data.save();
        } else {
            fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
        }

        res.json({ success: true });
    } catch (e) {
        console.error('Error en /api/checkin:', e.message);
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/config', (req, res) => {
    res.json({ ip: getLocalIP(), port: PORT, mode: useMongo ? 'Cloud' : 'Local' });
});

// GET /api/logs/history — Historial de logs de días anteriores
app.get('/api/logs/history', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    try {
        let history = {};
        if (useMongo) {
            const state = await State.findOne();
            if (state && state.history) {
                state.history.forEach((logs, date) => { history[date] = logs; });
            }
        } else {
            const data = fs.existsSync(DATA_FILE) ? JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')) : {};
            history = data.history || {};
        }
        // Devolver todos los logs históricos aplanados con su fecha
        const allHistoricLogs = [];
        Object.entries(history).forEach(([date, logs]) => {
            (logs || []).forEach(l => allHistoricLogs.push({ ...l, _historyDate: date }));
        });
        // Ordenar por timestamp descendente
        allHistoricLogs.sort((a, b) => new Date(b.ts) - new Date(a.ts));
        res.json({ history, allLogs: allHistoricLogs, dates: Object.keys(history).sort().reverse() });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
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

// ========== ENDPOINTS DE RRHH ==========

// GET /api/hr/applications — Obtener todas las solicitudes de empleo
app.get('/api/hr/applications', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    try {
        let applications = [];
        if (useMongo) {
            const state = await State.findOne();
            applications = state ? (state.jobApplications || []) : [];
        } else {
            const data = fs.existsSync(DATA_FILE) ? JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')) : {};
            applications = data.jobApplications || [];
        }
        res.json(applications);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// POST /api/hr/applications — Crear nueva solicitud de empleo
app.post('/api/hr/applications', async (req, res) => {
    try {
        const application = {
            ...req.body,
            id: `app_${Date.now()}`,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        if (useMongo) {
            const state = await State.findOne();
            if (!state.jobApplications) state.jobApplications = [];
            state.jobApplications.push(application);
            state.markModified('jobApplications');
            await state.save();
        } else {
            const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
            if (!data.jobApplications) data.jobApplications = [];
            data.jobApplications.push(application);
            fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
        }

        res.json({ success: true, application });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// PUT /api/hr/applications/:id — Actualizar solicitud de empleo
app.put('/api/hr/applications/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const updates = { ...req.body, updatedAt: new Date().toISOString() };

        if (useMongo) {
            const state = await State.findOne();
            const idx = state.jobApplications.findIndex(a => a.id === id);
            if (idx === -1) return res.status(404).json({ error: 'Solicitud no encontrada' });
            state.jobApplications[idx] = { ...state.jobApplications[idx], ...updates };
            state.markModified('jobApplications');
            await state.save();
        } else {
            const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
            const idx = data.jobApplications.findIndex(a => a.id === id);
            if (idx === -1) return res.status(404).json({ error: 'Solicitud no encontrada' });
            data.jobApplications[idx] = { ...data.jobApplications[idx], ...updates };
            fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
        }

        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// DELETE /api/hr/applications/:id — Eliminar solicitud de empleo
app.delete('/api/hr/applications/:id', async (req, res) => {
    try {
        const { id } = req.params;

        if (useMongo) {
            const state = await State.findOne();
            state.jobApplications = state.jobApplications.filter(a => a.id !== id);
            state.markModified('jobApplications');
            await state.save();
        } else {
            const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
            data.jobApplications = data.jobApplications.filter(a => a.id !== id);
            fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
        }

        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// GET /api/hr/payrolls — Obtener todas las planillas
app.get('/api/hr/payrolls', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    try {
        let payrolls = [];
        if (useMongo) {
            const state = await State.findOne();
            payrolls = state ? (state.payrolls || []) : [];
        } else {
            const data = fs.existsSync(DATA_FILE) ? JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')) : {};
            payrolls = data.payrolls || [];
        }
        res.json(payrolls);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// POST /api/hr/payrolls/generate — Generar planilla mensual
app.post('/api/hr/payrolls/generate', async (req, res) => {
    try {
        const { month, year } = req.body;
        
        let state;
        if (useMongo) {
            state = await State.findOne();
        } else {
            state = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
        }

        // Calcular días trabajados para cada empleado
        const employees = state.employees.filter(e => e.status === 'active');
        const payrollEmployees = [];
        
        // Obtener logs del mes (incluyendo historial)
        const allLogs = [...(state.logs || [])];
        if (state.history) {
            state.history.forEach((logs, date) => {
                allLogs.push(...logs.map(l => ({ ...l, _historyDate: date })));
            });
        }

        // Filtrar logs del mes seleccionado
        const monthLogs = allLogs.filter(log => {
            const logDate = new Date(log.ts);
            return logDate.getMonth() + 1 === month && logDate.getFullYear() === year;
        });

        let totals = {
            totalSalary: 0,
            totalISS: 0,
            totalAFP: 0,
            totalRenta: 0,
            totalDeductions: 0,
            totalNetPay: 0
        };

        for (const emp of employees) {
            // Calcular días trabajados
            const empLogs = monthLogs.filter(l => l.empId === emp.id && l.type === 'entry');
            const uniqueDates = new Set(empLogs.map(l => l.ts.split('T')[0]));
            const workedDays = uniqueDates.size;

            // Salario base mensual
            const monthlySalary = emp.monthlySalary || 0;
            
            // Calcular salario proporcional según días trabajados (30 días = mes completo)
            const proportionalSalary = deductions.calculateProportionalSalary(monthlySalary, workedDays, 30);
            
            // Usar el nuevo módulo de deducciones para cálculos según tablas oficiales
            const deductionResults = deductions.calculateAllDeductions(proportionalSalary, 'monthly');

            payrollEmployees.push({
                empId: emp.id,
                empNum: emp.empNum,
                fullName: `${emp.firstName} ${emp.lastName}`,
                workedDays,
                monthlySalary: deductionResults.grossSalary,
                isss: deductionResults.isss,
                afp: deductionResults.afp,
                renta: deductionResults.renta,
                totalDeductions: deductionResults.totalDeductions,
                netPay: deductionResults.netSalary
            });

            totals.totalSalary += deductionResults.grossSalary;
            totals.totalISS += deductionResults.isss;
            totals.totalAFP += deductionResults.afp;
            totals.totalRenta += deductionResults.renta;
            totals.totalDeductions += deductionResults.totalDeductions;
            totals.totalNetPay += deductionResults.netSalary;
        }

        // Redondear totales
        Object.keys(totals).forEach(key => {
            totals[key] = parseFloat(totals[key].toFixed(2));
        });

        const payroll = {
            id: `payroll_${Date.now()}`,
            type: 'monthly',
            month,
            year,
            employees: payrollEmployees,
            totals,
            createdAt: new Date().toISOString()
        };

        // Guardar planilla
        if (useMongo) {
            if (!state.payrolls) state.payrolls = [];
            state.payrolls.push(payroll);
            state.markModified('payrolls');
            await state.save();
        } else {
            if (!state.payrolls) state.payrolls = [];
            state.payrolls.push(payroll);
            fs.writeFileSync(DATA_FILE, JSON.stringify(state, null, 2));
        }

        res.json({ success: true, payroll });
    } catch (e) {
        console.error('Error generando planilla:', e);
        res.status(500).json({ error: e.message });
    }
});

// POST /api/hr/payrolls/generate/biweekly — Generar planilla quincenal
app.post('/api/hr/payrolls/generate/biweekly', async (req, res) => {
    try {
        const { month, year, periodNumber } = req.body;
        
        let state;
        if (useMongo) {
            state = await State.findOne();
        } else {
            state = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
        }

        const employees = state.employees.filter(e => e.status === 'active');
        const payrollEmployees = [];
        
        // Obtener logs del período quincenal
        const allLogs = [...(state.logs || [])];
        if (state.history) {
            state.history.forEach((logs, date) => {
                allLogs.push(...logs.map(l => ({ ...l, _historyDate: date })));
            });
        }

        // Calcular rango de fechas para la quincena (1-15 o 16-fin de mes)
        const startDay = periodNumber === 1 ? 1 : 16;
        const endDay = periodNumber === 1 ? 15 : new Date(year, month, 0).getDate();
        
        const startDate = new Date(year, month - 1, startDay);
        const endDate = new Date(year, month - 1, endDay);

        // Filtrar logs del período quincenal
        const periodLogs = allLogs.filter(log => {
            const logDate = new Date(log.ts);
            return logDate >= startDate && logDate <= endDate;
        });

        let totals = {
            totalSalary: 0,
            totalISS: 0,
            totalAFP: 0,
            totalRenta: 0,
            totalDeductions: 0,
            totalNetPay: 0
        };

        for (const emp of employees) {
            const empLogs = periodLogs.filter(l => l.empId === emp.id && l.type === 'entry');
            const uniqueDates = new Set(empLogs.map(l => l.ts.split('T')[0]));
            const workedDays = uniqueDates.size;

            // Salario quincenal = mensual / 2
            const monthlySalary = emp.monthlySalary || 0;
            const biweeklySalaryBase = monthlySalary / 2;
            
            // Calcular proporcional según días trabajados (15 días = quincena completa)
            const proportionalSalary = deductions.calculateProportionalSalary(biweeklySalaryBase, workedDays, 15);
            
            // Usar tabla quincenal
            const deductionResults = deductions.calculateAllDeductions(proportionalSalary, 'biweekly');

            payrollEmployees.push({
                empId: emp.id,
                empNum: emp.empNum,
                fullName: `${emp.firstName} ${emp.lastName}`,
                workedDays,
                biweeklySalary: deductionResults.grossSalary,
                isss: deductionResults.isss,
                afp: deductionResults.afp,
                renta: deductionResults.renta,
                totalDeductions: deductionResults.totalDeductions,
                netPay: deductionResults.netSalary
            });

            totals.totalSalary += deductionResults.grossSalary;
            totals.totalISS += deductionResults.isss;
            totals.totalAFP += deductionResults.afp;
            totals.totalRenta += deductionResults.renta;
            totals.totalDeductions += deductionResults.totalDeductions;
            totals.totalNetPay += deductionResults.netSalary;
        }

        Object.keys(totals).forEach(key => {
            totals[key] = parseFloat(totals[key].toFixed(2));
        });

        const payroll = {
            id: `payroll_biweekly_${Date.now()}`,
            type: 'biweekly',
            month,
            year,
            periodNumber,
            startDate: startDate.toISOString().split('T')[0],
            endDate: endDate.toISOString().split('T')[0],
            employees: payrollEmployees,
            totals,
            createdAt: new Date().toISOString()
        };

        if (useMongo) {
            if (!state.payrolls) state.payrolls = [];
            state.payrolls.push(payroll);
            state.markModified('payrolls');
            await state.save();
        } else {
            if (!state.payrolls) state.payrolls = [];
            state.payrolls.push(payroll);
            fs.writeFileSync(DATA_FILE, JSON.stringify(state, null, 2));
        }

        res.json({ success: true, payroll });
    } catch (e) {
        console.error('Error generando planilla quincenal:', e);
        res.status(500).json({ error: e.message });
    }
});

// POST /api/hr/payrolls/generate/weekly — Generar planilla semanal
app.post('/api/hr/payrolls/generate/weekly', async (req, res) => {
    try {
        const { month, year, weekNumber } = req.body;
        
        let state;
        if (useMongo) {
            state = await State.findOne();
        } else {
            state = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
        }

        const employees = state.employees.filter(e => e.status === 'active');
        const payrollEmployees = [];
        
        // Obtener logs de la semana
        const allLogs = [...(state.logs || [])];
        if (state.history) {
            state.history.forEach((logs, date) => {
                allLogs.push(...logs.map(l => ({ ...l, _historyDate: date })));
            });
        }

        // Calcular rango de fechas para la semana (aproximadamente 7 días)
        // Asumiendo que la semana comienza el lunes
        const firstDayOfMonth = new Date(year, month - 1, 1);
        const dayOfWeek = firstDayOfMonth.getDay(); // 0=Domingo, 1=Lunes, etc.
        const daysToMonday = dayOfWeek === 0 ? 1 : (dayOfWeek === 1 ? 0 : 8 - dayOfWeek);
        const firstMonday = new Date(year, month - 1, 1 + daysToMonday);
        
        const startDate = new Date(firstMonday);
        startDate.setDate(firstMonday.getDate() + (weekNumber - 1) * 7);
        
        const endDate = new Date(startDate);
        endDate.setDate(startDate.getDate() + 6);

        const weeklyLogs = allLogs.filter(log => {
            const logDate = new Date(log.ts);
            return logDate >= startDate && logDate <= endDate;
        });

        let totals = {
            totalSalary: 0,
            totalISS: 0,
            totalAFP: 0,
            totalRenta: 0,
            totalDeductions: 0,
            totalNetPay: 0
        };

        for (const emp of employees) {
            const empLogs = weeklyLogs.filter(l => l.empId === emp.id && l.type === 'entry');
            const uniqueDates = new Set(empLogs.map(l => l.ts.split('T')[0]));
            const workedDays = uniqueDates.size;

            // Salario semanal = mensual / 4.33 (aproximadamente)
            const monthlySalary = emp.monthlySalary || 0;
            const weeklySalaryBase = monthlySalary / 4.33;
            
            // Calcular proporcional según días trabajados (7 días = semana completa)
            const proportionalSalary = deductions.calculateProportionalSalary(weeklySalaryBase, workedDays, 7);
            
            // Usar tabla semanal
            const deductionResults = deductions.calculateAllDeductions(proportionalSalary, 'weekly');

            payrollEmployees.push({
                empId: emp.id,
                empNum: emp.empNum,
                fullName: `${emp.firstName} ${emp.lastName}`,
                workedDays,
                weeklySalary: deductionResults.grossSalary,
                isss: deductionResults.isss,
                afp: deductionResults.afp,
                renta: deductionResults.renta,
                totalDeductions: deductionResults.totalDeductions,
                netPay: deductionResults.netSalary
            });

            totals.totalSalary += deductionResults.grossSalary;
            totals.totalISS += deductionResults.isss;
            totals.totalAFP += deductionResults.afp;
            totals.totalRenta += deductionResults.renta;
            totals.totalDeductions += deductionResults.totalDeductions;
            totals.totalNetPay += deductionResults.netSalary;
        }

        Object.keys(totals).forEach(key => {
            totals[key] = parseFloat(totals[key].toFixed(2));
        });

        const payroll = {
            id: `payroll_weekly_${Date.now()}`,
            type: 'weekly',
            month,
            year,
            weekNumber,
            startDate: startDate.toISOString().split('T')[0],
            endDate: endDate.toISOString().split('T')[0],
            employees: payrollEmployees,
            totals,
            createdAt: new Date().toISOString()
        };

        if (useMongo) {
            if (!state.payrolls) state.payrolls = [];
            state.payrolls.push(payroll);
            state.markModified('payrolls');
            await state.save();
        } else {
            if (!state.payrolls) state.payrolls = [];
            state.payrolls.push(payroll);
            fs.writeFileSync(DATA_FILE, JSON.stringify(state, null, 2));
        }

        res.json({ success: true, payroll });
    } catch (e) {
        console.error('Error generando planilla semanal:', e);
        res.status(500).json({ error: e.message });
    }
});

// DELETE /api/hr/payrolls/:id — Eliminar planilla
app.delete('/api/hr/payrolls/:id', async (req, res) => {
    try {
        const { id } = req.params;

        if (useMongo) {
            const state = await State.findOne();
            state.payrolls = state.payrolls.filter(p => p.id !== id);
            state.markModified('payrolls');
            await state.save();
        } else {
            const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
            data.payrolls = data.payrolls.filter(p => p.id !== id);
            fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
        }

        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// GET /api/hr/payrolls/export/isss — Exportar planilla en formato ISSS
app.get('/api/hr/payrolls/export/isss/:id', async (req, res) => {
    try {
        const { id } = req.params;
        
        let payroll;
        if (useMongo) {
            const state = await State.findOne();
            payroll = state.payrolls.find(p => p.id === id);
        } else {
            const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
            payroll = data.payrolls.find(p => p.id === id);
        }

        if (!payroll) {
            return res.status(404).json({ error: 'Planilla no encontrada' });
        }

        // Formato ISSS: Campos específicos para el Instituto Salvadoreño del Seguro Social
        const isssData = payroll.employees.map((emp, index) => ({
            'N°': index + 1,
            'NUP': emp.empNum || '',
            'APELLIDOS Y NOMBRES': emp.fullName,
            'SALARIO DEVENGADO': emp.monthlySalary || emp.biweeklySalary || emp.weeklySalary || 0,
            'DÍAS': emp.workedDays || 30,
            'APORTE ISSS (3%)': emp.isss || 0,
            'APORTE AFP (7.25%)': emp.afp || 0,
            'RENTA': emp.renta || 0,
            'TOTAL APORTACIONES': (emp.isss || 0) + (emp.afp || 0) + (emp.renta || 0),
            'AÑO': payroll.year,
            'MES': payroll.month
        }));

        // Agregar fila de totales
        isssData.push({
            'N°': '',
            'NUP': '',
            'APELLIDOS Y NOMBRES': 'TOTALES',
            'SALARIO DEVENGADO': payroll.totals.totalSalary,
            'DÍAS': '',
            'APORTE ISSS (3%)': payroll.totals.totalISS,
            'APORTE AFP (7.25%)': payroll.totals.totalAFP,
            'RENTA': payroll.totals.totalRenta,
            'TOTAL APORTACIONES': payroll.totals.totalDeductions,
            'AÑO': '',
            'MES': ''
        });

        res.json({ success: true, format: 'ISSS', data: isssData, payroll });
    } catch (e) {
        console.error('Error exportando formato ISSS:', e);
        res.status(500).json({ error: e.message });
    }
});

// GET /api/hr/payrolls/export/crecer — Exportar planilla en formato CRECER
app.get('/api/hr/payrolls/export/crecer/:id', async (req, res) => {
    try {
        const { id } = req.params;
        
        let payroll;
        if (useMongo) {
            const state = await State.findOne();
            payroll = state.payrolls.find(p => p.id === id);
        } else {
            const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
            payroll = data.payrolls.find(p => p.id === id);
        }

        if (!payroll) {
            return res.status(404).json({ error: 'Planilla no encontrada' });
        }

        // Formato CRECER: Planilla de Pago de Cotizaciones Provisionales
        const crecerData = payroll.employees.map((emp, index) => {
            const grossSalary = emp.monthlySalary || emp.biweeklySalary || emp.weeklySalary || 0;
            return {
                'N°': index + 1,
                'TIPO': 'T', // T = Trabajador
                'NÚMERO': emp.empNum || '',
                '1° APELLIDO': emp.fullName.split(' ')[0] || '',
                '2° APELLIDO': emp.fullName.split(' ')[1] || '',
                'APELLIDO CASADA': '',
                '1° NOMBRE': emp.fullName.split(' ')[2] || emp.fullName.split(' ')[0] || '',
                '2° NOMBRE': emp.fullName.split(' ')[3] || '',
                'HRS. JOR.': 8,
                'DÍAS COT.': emp.workedDays || 30,
                'INGRESO BASE COTIZACIÓN': grossSalary,
                'COTIZACIÓN OBLIGATORIA ISSS': emp.isss || 0,
                'COTIZACIÓN VOLUNTARIA AFILIADO': 0,
                'CONTRIBUCIÓN EMPLEADOR': emp.afp || 0,
                'TOTAL COTIZACIONES': (emp.isss || 0) + (emp.afp || 0)
            };
        });

        // Agregar fila de totales
        crecerData.push({
            'N°': '',
            'TIPO': '',
            'NÚMERO': '',
            '1° APELLIDO': '',
            '2° APELLIDO': '',
            'APELLIDO CASADA': '',
            '1° NOMBRE': 'TOTALES',
            '2° NOMBRE': '',
            'HRS. JOR.': '',
            'DÍAS COT.': '',
            'INGRESO BASE COTIZACIÓN': payroll.totals.totalSalary,
            'COTIZACIÓN OBLIGATORIA ISSS': payroll.totals.totalISS,
            'COTIZACIÓN VOLUNTARIA AFILIADO': 0,
            'CONTRIBUCIÓN EMPLEADOR': payroll.totals.totalAFP,
            'TOTAL COTIZACIONES': payroll.totals.totalDeductions
        });

        res.json({ success: true, format: 'CRECER', data: crecerData, payroll });
    } catch (e) {
        console.error('Error exportando formato CRECER:', e);
        res.status(500).json({ error: e.message });
    }
});

// ========== CONFIGURACIÓN DE MULTER PARA SUBIDA DE ARCHIVOS ==========
const multer = require('multer');
const uploadsDir = path.join(__dirname, 'uploads');

// Crear carpeta uploads si no existe
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configuración de almacenamiento
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadsDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname);
        cb(null, `${file.fieldname}-${uniqueSuffix}${ext}`);
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max
    fileFilter: (req, file, cb) => {
        const allowedTypes = /jpeg|jpg|png|pdf|doc|docx/;
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = allowedTypes.test(file.mimetype);
        if (mimetype && extname) {
            return cb(null, true);
        } else {
            cb(new Error('Solo se permiten archivos de imagen, PDF o documentos'));
        }
    }
});

// Servir archivos estáticos de uploads
app.use('/uploads', express.static(uploadsDir));

// ========== ENDPOINTS DE DOCUMENTOS PERSONALES ==========

// POST /api/hr/documents/upload — Subir documento personal
app.post('/api/hr/documents/upload', upload.single('document'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No se proporcionó ningún archivo' });
        }

        const { empId, empName, documentType, description } = req.body;

        const document = {
            id: `doc_${Date.now()}`,
            empId,
            empName,
            documentType,
            fileName: req.file.originalname,
            filePath: `/uploads/${req.file.filename}`,
            fileSize: req.file.size,
            mimeType: req.file.mimetype,
            description: description || '',
            uploadedAt: new Date().toISOString()
        };

        if (useMongo) {
            const state = await State.findOne();
            if (!state.personalDocuments) state.personalDocuments = [];
            state.personalDocuments.push(document);
            state.markModified('personalDocuments');
            await state.save();
        } else {
            const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
            if (!data.personalDocuments) data.personalDocuments = [];
            data.personalDocuments.push(document);
            fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
        }

        res.json({ success: true, document });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// GET /api/hr/documents — Obtener todos los documentos
app.get('/api/hr/documents', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    try {
        const { empId } = req.query;
        let documents = [];

        if (useMongo) {
            const state = await State.findOne();
            documents = state ? (state.personalDocuments || []) : [];
        } else {
            const data = fs.existsSync(DATA_FILE) ? JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')) : {};
            documents = data.personalDocuments || [];
        }

        if (empId) {
            documents = documents.filter(d => d.empId === empId);
        }

        res.json(documents);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// DELETE /api/hr/documents/:id — Eliminar documento
app.delete('/api/hr/documents/:id', async (req, res) => {
    try {
        const { id } = req.params;
        let document;

        if (useMongo) {
            const state = await State.findOne();
            document = state.personalDocuments.find(d => d.id === id);
            if (!document) return res.status(404).json({ error: 'Documento no encontrado' });
            
            // Eliminar archivo físico
            const filePath = path.join(__dirname, document.filePath);
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
            
            state.personalDocuments = state.personalDocuments.filter(d => d.id !== id);
            state.markModified('personalDocuments');
            await state.save();
        } else {
            const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
            document = data.personalDocuments.find(d => d.id === id);
            if (!document) return res.status(404).json({ error: 'Documento no encontrado' });
            
            // Eliminar archivo físico
            const filePath = path.join(__dirname, document.filePath);
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
            
            data.personalDocuments = data.personalDocuments.filter(d => d.id !== id);
            fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
        }

        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ========== ENDPOINTS DE PERMISOS ==========

// POST /api/hr/permissions — Crear solicitud de permiso
app.post('/api/hr/permissions', async (req, res) => {
    try {
        const permission = {
            ...req.body,
            id: `perm_${Date.now()}`,
            status: 'pending',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        if (useMongo) {
            const state = await State.findOne();
            if (!state.permissionRequests) state.permissionRequests = [];
            state.permissionRequests.push(permission);
            state.markModified('permissionRequests');
            await state.save();
        } else {
            const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
            if (!data.permissionRequests) data.permissionRequests = [];
            data.permissionRequests.push(permission);
            fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
        }

        res.json({ success: true, permission });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// GET /api/hr/permissions — Obtener todas las solicitudes de permiso
app.get('/api/hr/permissions', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    try {
        const { empId, status } = req.query;
        let permissions = [];

        if (useMongo) {
            const state = await State.findOne();
            permissions = state ? (state.permissionRequests || []) : [];
        } else {
            const data = fs.existsSync(DATA_FILE) ? JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')) : {};
            permissions = data.permissionRequests || [];
        }

        if (empId) permissions = permissions.filter(p => p.empId === empId);
        if (status) permissions = permissions.filter(p => p.status === status);

        res.json(permissions);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// PUT /api/hr/permissions/:id — Actualizar solicitud de permiso
app.put('/api/hr/permissions/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const updates = { ...req.body, updatedAt: new Date().toISOString() };

        if (useMongo) {
            const state = await State.findOne();
            const idx = state.permissionRequests.findIndex(p => p.id === id);
            if (idx === -1) return res.status(404).json({ error: 'Permiso no encontrado' });
            state.permissionRequests[idx] = { ...state.permissionRequests[idx], ...updates };
            state.markModified('permissionRequests');
            await state.save();
        } else {
            const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
            const idx = data.permissionRequests.findIndex(p => p.id === id);
            if (idx === -1) return res.status(404).json({ error: 'Permiso no encontrado' });
            data.permissionRequests[idx] = { ...data.permissionRequests[idx], ...updates };
            fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
        }

        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// DELETE /api/hr/permissions/:id — Eliminar solicitud de permiso
app.delete('/api/hr/permissions/:id', async (req, res) => {
    try {
        const { id } = req.params;

        if (useMongo) {
            const state = await State.findOne();
            state.permissionRequests = state.permissionRequests.filter(p => p.id !== id);
            state.markModified('permissionRequests');
            await state.save();
        } else {
            const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
            data.permissionRequests = data.permissionRequests.filter(p => p.id !== id);
            fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
        }

        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ========== ENDPOINTS DE CONTRATOS ==========

// POST /api/hr/contracts — Crear contrato (con archivo opcional)
app.post('/api/hr/contracts', upload.single('contractFile'), async (req, res) => {
    try {
        // Nueva estructura simplificada: solo archivo + metadata básica
        const contractData = {
            id: `contract_${Date.now()}`,
            empId: req.body.empId,
            empName: req.body.empName,
            docType: req.body.docType || 'otro',
            description: req.body.description || '',
            status: 'active',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
        
        // El archivo es obligatorio
        if (!req.file) {
            return res.status(400).json({ error: 'Se requiere un archivo' });
        }
        
        contractData.fileName = req.file.originalname;
        contractData.filePath = `/uploads/${req.file.filename}`;
        contractData.fileSize = req.file.size;
        contractData.mimeType = req.file.mimetype;

        if (useMongo) {
            const state = await State.findOne();
            if (!state.contracts) state.contracts = [];
            state.contracts.push(contractData);
            state.markModified('contracts');
            await state.save();
        } else {
            const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
            if (!data.contracts) data.contracts = [];
            data.contracts.push(contractData);
            fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
        }

        res.json({ success: true, contract: contractData });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// GET /api/hr/contracts — Obtener todos los contratos
app.get('/api/hr/contracts', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    try {
        const { empId } = req.query;
        let contracts = [];

        if (useMongo) {
            const state = await State.findOne();
            contracts = state ? (state.contracts || []) : [];
        } else {
            const data = fs.existsSync(DATA_FILE) ? JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')) : {};
            contracts = data.contracts || [];
        }

        if (empId) contracts = contracts.filter(c => c.empId === empId);

        res.json(contracts);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// GET /api/hr/contracts/:id — Obtener contrato específico
app.get('/api/hr/contracts/:id', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    try {
        const { id } = req.params;
        let contract = null;
        
        if (useMongo) {
            const state = await State.findOne();
            contract = state?.contracts?.find(c => c.id === id) || null;
        } else {
            const data = fs.existsSync(DATA_FILE) ? JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')) : {};
            contract = data.contracts?.find(c => c.id === id) || null;
        }
        
        if (!contract) {
            return res.status(404).json({ error: 'Contrato no encontrado' });
        }
        
        res.json(contract);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// PUT /api/hr/contracts/:id — Actualizar contrato
app.put('/api/hr/contracts/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const updates = { ...req.body, updatedAt: new Date().toISOString() };

        if (useMongo) {
            const state = await State.findOne();
            const idx = state.contracts.findIndex(c => c.id === id);
            if (idx === -1) return res.status(404).json({ error: 'Contrato no encontrado' });
            state.contracts[idx] = { ...state.contracts[idx], ...updates };
            state.markModified('contracts');
            await state.save();
        } else {
            const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
            const idx = data.contracts.findIndex(c => c.id === id);
            if (idx === -1) return res.status(404).json({ error: 'Contrato no encontrado' });
            data.contracts[idx] = { ...data.contracts[idx], ...updates };
            fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
        }

        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// DELETE /api/hr/contracts/:id — Eliminar contrato
app.delete('/api/hr/contracts/:id', async (req, res) => {
    try {
        const { id } = req.params;
        let deleted = false;
        let contract = null;

        if (useMongo) {
            const state = await State.findOne();
            const idx = state.contracts?.findIndex(c => c.id === id);
            if (idx !== undefined && idx !== -1) {
                contract = state.contracts[idx];
                state.contracts.splice(idx, 1);
                state.markModified('contracts');
                await state.save();
                deleted = true;
            }
        } else {
            const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
            const idx = data.contracts?.findIndex(c => c.id === id);
            if (idx !== undefined && idx !== -1) {
                contract = data.contracts[idx];
                data.contracts.splice(idx, 1);
                fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
                deleted = true;
            }
        }

        // Eliminar archivo adjunto si existe
        if (contract?.filePath) {
            const filePath = path.join(__dirname, contract.filePath);
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }
        }

        if (!deleted) {
            return res.status(404).json({ error: 'Contrato no encontrado' });
        }

        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ========== ENDPOINTS DE CARTAS DE CONFIDENCIALIDAD ==========

// POST /api/hr/confidentiality — Crear carta de confidencialidad (con archivo)
app.post('/api/hr/confidentiality', upload.single('confFile'), async (req, res) => {
    try {
        const letterData = {
            empId: req.body.empId,
            empName: req.body.empName,
            docType: req.body.docType,
            description: req.body.description,
            id: `conf_${Date.now()}`,
            status: 'active',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
        
        // Si se adjuntó archivo, agregar información del archivo
        if (req.file) {
            letterData.fileName = req.file.originalname;
            letterData.filePath = `/uploads/${req.file.filename}`;
            letterData.fileSize = req.file.size;
            letterData.mimeType = req.file.mimetype;
        }

        if (useMongo) {
            const state = await State.findOne();
            if (!state.confidentialityLetters) state.confidentialityLetters = [];
            state.confidentialityLetters.push(letterData);
            state.markModified('confidentialityLetters');
            await state.save();
        } else {
            const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
            if (!data.confidentialityLetters) data.confidentialityLetters = [];
            data.confidentialityLetters.push(letterData);
            fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
        }

        res.json({ success: true, letter: letterData });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// GET /api/hr/confidentiality — Obtener todas las cartas
app.get('/api/hr/confidentiality', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    try {
        const { empId } = req.query;
        let letters = [];

        if (useMongo) {
            const state = await State.findOne();
            letters = state ? (state.confidentialityLetters || []) : [];
        } else {
            const data = fs.existsSync(DATA_FILE) ? JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')) : {};
            letters = data.confidentialityLetters || [];
        }

        if (empId) letters = letters.filter(l => l.empId === empId);

        res.json(letters);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// PUT /api/hr/confidentiality/:id — Actualizar carta
app.put('/api/hr/confidentiality/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const updates = { ...req.body, updatedAt: new Date().toISOString() };

        if (useMongo) {
            const state = await State.findOne();
            const idx = state.confidentialityLetters.findIndex(l => l.id === id);
            if (idx === -1) return res.status(404).json({ error: 'Carta no encontrada' });
            state.confidentialityLetters[idx] = { ...state.confidentialityLetters[idx], ...updates };
            state.markModified('confidentialityLetters');
            await state.save();
        } else {
            const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
            const idx = data.confidentialityLetters.findIndex(l => l.id === id);
            if (idx === -1) return res.status(404).json({ error: 'Carta no encontrada' });
            data.confidentialityLetters[idx] = { ...data.confidentialityLetters[idx], ...updates };
            fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
        }

        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// GET /api/hr/confidentiality/:id — Obtener carta específica
app.get('/api/hr/confidentiality/:id', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    try {
        const { id } = req.params;
        let letter = null;
        
        if (useMongo) {
            const state = await State.findOne();
            letter = state?.confidentialityLetters?.find(l => l.id === id) || null;
        } else {
            const data = fs.existsSync(DATA_FILE) ? JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')) : {};
            letter = data.confidentialityLetters?.find(l => l.id === id) || null;
        }
        
        if (!letter) {
            return res.status(404).json({ error: 'Documento no encontrado' });
        }
        
        res.json(letter);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// DELETE /api/hr/confidentiality/:id — Eliminar carta
app.delete('/api/hr/confidentiality/:id', async (req, res) => {
    try {
        const { id } = req.params;
        let deleted = false;
        let letter = null;

        if (useMongo) {
            const state = await State.findOne();
            const idx = state.confidentialityLetters?.findIndex(l => l.id === id);
            if (idx !== undefined && idx !== -1) {
                letter = state.confidentialityLetters[idx];
                state.confidentialityLetters.splice(idx, 1);
                state.markModified('confidentialityLetters');
                await state.save();
                deleted = true;
            }
        } else {
            const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
            const idx = data.confidentialityLetters?.findIndex(l => l.id === id);
            if (idx !== undefined && idx !== -1) {
                letter = data.confidentialityLetters[idx];
                data.confidentialityLetters.splice(idx, 1);
                fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
                deleted = true;
            }
        }

        // Eliminar archivo adjunto si existe
        if (letter?.filePath) {
            const filePath = path.join(__dirname, letter.filePath);
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }
        }

        if (!deleted) {
            return res.status(404).json({ error: 'Documento no encontrado' });
        }

        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ========== ENDPOINTS DE CONSTANCIAS DE TIEMPO LABORAL ==========

// POST /api/hr/certificates/generate — Generar constancia
app.post('/api/hr/certificates/generate', async (req, res) => {
    try {
        const { empId, includeSalary, purpose } = req.body;
        
        let state;
        if (useMongo) {
            state = await State.findOne();
        } else {
            state = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
        }

        const employee = state.employees.find(e => e.id === empId);
        if (!employee) {
            return res.status(404).json({ error: 'Empleado no encontrado' });
        }

        // Calcular tiempo laborado
        const startDate = new Date(employee.createdAt || Date.now());
        const now = new Date();
        const diffTime = Math.abs(now - startDate);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        const years = Math.floor(diffDays / 365);
        const months = Math.floor((diffDays % 365) / 30);

        const certificate = {
            id: `cert_${Date.now()}`,
            empId: employee.id,
            empName: `${employee.firstName} ${employee.lastName}`,
            position: employee.role || 'Empleado',
            startDate: employee.createdAt || new Date().toISOString(),
            salary: includeSalary ? (employee.monthlySalary || 0) : null,
            includeSalary: includeSalary || false,
            purpose: purpose || '',
            timeWorked: `${years} años y ${months} meses`,
            generatedAt: new Date().toISOString()
        };

        if (useMongo) {
            if (!state.workCertificates) state.workCertificates = [];
            state.workCertificates.push(certificate);
            state.markModified('workCertificates');
            await state.save();
        } else {
            if (!state.workCertificates) state.workCertificates = [];
            state.workCertificates.push(certificate);
            fs.writeFileSync(DATA_FILE, JSON.stringify(state, null, 2));
        }

        res.json({ success: true, certificate });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// GET /api/hr/certificates — Obtener todas las constancias
app.get('/api/hr/certificates', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    try {
        const { empId } = req.query;
        let certificates = [];

        if (useMongo) {
            const state = await State.findOne();
            certificates = state ? (state.workCertificates || []) : [];
        } else {
            const data = fs.existsSync(DATA_FILE) ? JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')) : {};
            certificates = data.workCertificates || [];
        }

        if (empId) certificates = certificates.filter(c => c.empId === empId);

        res.json(certificates);
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