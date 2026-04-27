/* ============================================================
   QR-ASISTENCIA — MAIN APP LOGIC
   ============================================================ */

/* ---- STATE ---- */
const STORE_KEY = 'qr_asist';
let state = {
    employees: [], logs: [], departments: ['TI', 'RRHH', 'Ventas', 'Operaciones', 'Finanzas'],
    secretKey: '', config: { tokenLife: 30, timeWindow: 300, maxRetries: 3, antiReplay: true, deviceLock: false, alerts: true },
    usedTokens: new Set(), scannerStream: null, scannerActive: false,
    selectedEmpForQR: null, currentQRToken: null, qrRotateTimer: null,
    securityLog: [], adminConfig: { company: 'Mi Empresa S.A.', logo: '🏢', entryTime: '08:00', exitTime: '18:00', grace: 10 },
    stats: { present: 0, entries: 0, exits: 0, blocked: 0 }, presentSet: new Set(),
};

/* ---- INIT ---- */
// Global fetch wrapper to automatically attach JWT when available
(function() {
    const orig = window.fetch.bind(window);
    window.fetch = function(input, init = {}) {
        init.headers = init.headers || {};
        const token = localStorage.getItem('jwt');
        if (token) init.headers['Authorization'] = 'Bearer ' + token;
        return orig(input, init);
    };
})();

document.addEventListener('DOMContentLoaded', async () => {
    // If no token yet, prompt login and halt further initialization
    const token = localStorage.getItem('jwt');
    if (!token) { showLoginOverlay(); return; }
    await loadFromStorage();
    if (!state.secretKey) state.secretKey = await CryptoUtils.generateKey();
    if (!state.employees.length) seedDemoEmployees();
    await saveToStorage();
    initClock();
    initTokenTimer();
    renderAll();
    logSecurity('info', '🟢 Sistema iniciado', 'HMAC-SHA256 activo. Anti-replay habilitado.');
    startPolling();
    initWakeLock();
    showPage('dashboard');
    // Initialize Jibble MVP panel UI
    initJibblePanelUI();
});

/* ---- SCREEN WAKE LOCK (Keep display on) ---- */
let wakeLock = null;
async function initWakeLock() {
    if ('wakeLock' in navigator) {
        try {
            wakeLock = await navigator.wakeLock.request('screen');
            console.log('✅ Screen Wake Lock is active');
            wakeLock.addEventListener('release', () => {
                console.log('Screen Wake Lock released');
            });
        } catch (err) {
            console.warn(`Wake Lock Error: ${err.name}, ${err.message}`);
        }
    }
}
// Re-acquire lock when page is visible again
document.addEventListener('visibilitychange', async () => {
    if (wakeLock !== null && document.visibilityState === 'visible') {
        initWakeLock();
    }
});

/* ---- STORAGE (server API + localStorage fallback) ---- */
async function saveToStorage() {
    const data = {
        employees: state.employees, logs: state.logs, departments: state.departments,
        secretKey: state.secretKey, config: state.config, adminConfig: state.adminConfig,
        securityLog: state.securityLog.slice(0, 200), stats: state.stats,
        presentSet: [...state.presentSet], usedTokens: [...state.usedTokens]
    };
    // Always save to localStorage as cache
    localStorage.setItem(STORE_KEY, JSON.stringify(data));
    // Also sync to server
    try {
        await fetch('/api/save', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    } catch (e) { console.warn('Server sync failed, using local cache:', e.message); }
}
async function loadFromStorage() {
    // Try server first (source of truth)
    try {
        const res = await fetch('/api/data');
        if (res.ok) {
            const d = await res.json();
            Object.assign(state, {
                employees: d.employees || [], logs: d.logs || [], departments: d.departments || state.departments,
                secretKey: d.secretKey || '', config: { ...state.config, ...(d.config || {}) },
                adminConfig: { ...state.adminConfig, ...(d.adminConfig || {}) }, securityLog: d.securityLog || [],
                stats: d.stats || state.stats, presentSet: new Set(d.presentSet || []),
                usedTokens: new Set(d.usedTokens || [])
            });
            return;
        }
    } catch (e) { console.warn('Server not available, falling back to localStorage'); }
    // Fallback: localStorage
    try {
        const raw = localStorage.getItem(STORE_KEY);
        if (!raw) return;
        const d = JSON.parse(raw);
        Object.assign(state, {
            employees: d.employees || [], logs: d.logs || [], departments: d.departments || state.departments,
            secretKey: d.secretKey || '', config: { ...state.config, ...(d.config || {}) },
            adminConfig: { ...state.adminConfig, ...(d.adminConfig || {}) }, securityLog: d.securityLog || [],
            stats: d.stats || state.stats, presentSet: new Set(d.presentSet || [])
        });
    } catch (e) { console.warn('Error cargando datos:', e); }
}

/* ---- DEMO DATA ---- */
function seedDemoEmployees() {
    const demos = [
        { firstName: 'Ana', lastName: 'García', empNum: 'EMP-001', dept: 'TI', role: 'Desarrolladora Senior', email: 'ana@empresa.com', avatar: '👩‍💻', status: 'active' },
        { firstName: 'Carlos', lastName: 'López', empNum: 'EMP-002', dept: 'RRHH', role: 'Gerente de RRHH', email: 'carlos@empresa.com', avatar: '👨‍💼', status: 'active' },
        { firstName: 'María', lastName: 'Martínez', empNum: 'EMP-003', dept: 'Ventas', role: 'Ejecutiva de Ventas', email: 'maria@empresa.com', avatar: '👩‍💼', status: 'active' },
        { firstName: 'Luis', lastName: 'Hernández', empNum: 'EMP-004', dept: 'Operaciones', role: 'Supervisor', email: 'luis@empresa.com', avatar: '👷', status: 'active' },
        { firstName: 'Sofia', lastName: 'Ramírez', empNum: 'EMP-005', dept: 'Finanzas', role: 'Contadora', email: 'sofia@empresa.com', avatar: '👩‍🏫', status: 'active' },
        { firstName: 'Jorge', lastName: 'Torres', empNum: 'EMP-006', dept: 'TI', role: 'DevOps Engineer', email: 'jorge@empresa.com', avatar: '🧑‍💻', status: 'inactive' },
    ];
    demos.forEach((d, i) => {
        state.employees.push({ ...d, id: `emp_${Date.now()}_${i}`, createdAt: new Date().toISOString(), lastAccess: null });
    });
}

/* ---- CLOCK ---- */
function initClock() {
    function tick() {
        const now = new Date();
        document.getElementById('topbarTime').textContent = now.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        document.getElementById('topbarDate').textContent = now.toLocaleDateString('es-MX', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
    }
    tick(); setInterval(tick, 1000);
}

/* ---- TOKEN ROTATION TIMER (topbar) ---- */
function initTokenTimer() {
    const circumference = 2 * Math.PI * 15; // r=15
    function tick() {
        const life = state.config.tokenLife;
        const elapsed = Math.floor(Date.now() / 1000) % life;
        const remaining = life - elapsed;
        const progress = remaining / life;
        const offset = circumference * (1 - progress);
        const ring = document.getElementById('timerRing');
        if (ring) { ring.style.strokeDashoffset = offset; ring.style.stroke = remaining <= 5 ? '#f43f5e' : remaining <= 10 ? '#fbbf24' : '#6366f1'; }
        document.getElementById('timerCount').textContent = `${remaining}s`;
    }
    tick(); setInterval(tick, 1000);
}

/* ---- PAGE NAVIGATION ---- */
const pageTitles = {
    dashboard: ['Dashboard', 'Vista general del sistema'],
    scanner: ['Escáner QR', 'Lectura y validación de accesos'],
    generate: ['Generar QR', 'Crear códigos de acceso seguros'],
    employees: ['Empleados', 'Gestión del personal'],
    logs: ['Registro de Accesos', 'Historial completo de entradas y salidas'],
    reports: ['Reportes', 'Estadísticas y análisis'],
    security: ['Seguridad', 'Criptografía y configuración de tokens'],
    admin: ['Configuración', 'Ajustes del sistema'],
};
function showPage(id) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    document.getElementById(`page-${id}`)?.classList.add('active');
    document.getElementById(`nav-${id}`)?.classList.add('active');
    const [title, sub] = pageTitles[id] || [id, ''];
    document.getElementById('pageTitle').textContent = title;
    document.getElementById('pageSub').textContent = sub;
    if (id !== 'scanner') stopScanner();
    if (id === 'generate') startStationQR();
    if (id === 'employees') renderEmployeeTable();
    if (id === 'logs') renderLogs();
    if (id === 'reports') renderReports();
    if (id === 'security') renderSecurityPage();
    if (id === 'admin') renderAdminPage();
}

function toggleSidebar() {
    document.getElementById('sidebar').classList.toggle('open');
    document.getElementById('sidebar').classList.toggle('collapsed');
    document.querySelector('.main-wrap').classList.toggle('expanded');
}

/* ---- RENDER ALL ---- */
function renderAll() {
    updateDashboard();
    renderEmployeeTable();
    renderLogs();
    renderSecurityPage();
    renderAdminPage();
    fillDeptDropdowns();
    // Ensure the Jibble MVP UI is populated alongside other data
    populateJibbleUIElements();
}

// --- Jibble MVP UI helpers ---
function initJibblePanelUI() {
    // Prepare static select options for employees on the MVP panel
    const empOptions = (state.employees || []).filter(e => e.status === 'active')
        .map(e => `<option value="${e.id}">${e.firstName} ${e.lastName} (${e.empNum})</option>`)
        .join('');
    const sel = document.getElementById('jb_empSelect');
    if (sel) sel.innerHTML = `<option value="">Seleccionar empleado...</option>${empOptions}`;
    // Populate range options for reports/exports
    const rep = document.getElementById('jb_reportRange');
    if (rep) rep.innerHTML = `<option value="today">Hoy</option><option value="week">Esta semana</option>`;
    const exp = document.getElementById('jb_exportRange');
    if (exp) exp.innerHTML = `<option value="today">Hoy</option><option value="week">Esta semana</option>`;
}

async function populateJibbleUIElements() {
    // Fill presentes immediately if available
    await jbRefreshPresent();
}

async function jbRefreshPresent() {
    try {
        const res = await fetch('/api/attendance/present');
        if (!res.ok) throw new Error('No se pudo obtener presencia');
        const data = await res.json();
        const wrap = document.getElementById('jb_presentList');
        if (!wrap) return;
        wrap.innerHTML = (data.present || [])
            .map(p => `<div class="present-item">${p.avatar || p.name?.[0] || '👤'} ${p.name} <small>(${p.dept || ''} • ${p.empNum || ''})</small></div>`)
            .join('') || '<div class="empty-feed">Sin presencia</div>';
    } catch (e) {
        console.warn('JB: error obteniendo presentes', e.message);
    }
}

async function jbRegister(type) {
    const sel = document.getElementById('jb_empSelect');
    const empId = sel?.value;
    if (!empId) { showToast('Selecciona un empleado', 'warning'); return; }
    const payload = { empId, type, ts: new Date().toISOString() };
    try {
        const res = await fetch('/api/entries', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (!res.ok) throw new Error('Fallo al registrar');
        const data = await res.json();
        showToast(`✅ ${type === 'entry' ? 'Entrada' : 'Salida'} registrada`, 'success');
        await jbRefreshPresent();
        jbShowSummary();
        // Update any existing logs/panels if needed
    } catch (e) {
        showToast('❌ Error registrando: ' + e.message, 'error');
    }
}

async function jbShowSummary() {
    const range = document.getElementById('jb_reportRange')?.value || 'today';
    try {
        const res = await fetch(`/api/reports/summary?range=${range}`);
        if (!res.ok) throw new Error('No se pudo obtener resumen');
        const data = await res.json();
        const out = JSON.stringify(data, null, 2);
        const el = document.getElementById('jb_reportResult');
        if (el) el.textContent = out;
        // Also show human-friendly tip
        showToast('Resumen obtenido', 'info');
    } catch (e) {
        showToast('❌ Error obteniendo resumen: ' + e.message, 'error');
    }
}

async function jbExportLogs() {
    const range = document.getElementById('jb_exportRange')?.value || 'today';
    try {
        const res = await fetch('/api/export/logs', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ range })
        });
        if (!res.ok) throw new Error('Exportación fallida');
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = 'logs.csv'; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
        const status = document.getElementById('jb_exportStatus'); if (status) status.textContent = 'Descarga iniciada';
    } catch (e) {
        showToast('❌ Error exportando: ' + e.message, 'error');
    }
}

/* ---- DASHBOARD ---- */
function updateDashboard() {
    document.getElementById('statPresent').textContent = state.presentSet.size;
    document.getElementById('statEntries').textContent = state.stats.entries;
    document.getElementById('statExits').textContent = state.stats.exits;
    document.getElementById('statBlocked').textContent = state.stats.blocked;
    document.getElementById('presentCount').textContent = state.presentSet.size;
    renderActivityFeed();
    renderPresentList();
    renderMiniChart();
}

function renderActivityFeed() {
    const feed = document.getElementById('activityFeed');
    const recent = [...state.logs].reverse().slice(0, 20);
    if (!recent.length) { feed.innerHTML = '<div class="empty-feed">No hay actividad aún.</div>'; return; }
    feed.innerHTML = recent.map(log => {
        const emp = state.employees.find(e => e.id === log.empId);
        const name = emp ? `${emp.firstName} ${emp.lastName}` : log.empName || 'Desconocido';
        const avatar = emp?.avatar || name[0].toUpperCase();
        const typeClass = log.type === 'entry' ? 'type-entry' : log.type === 'exit' ? 'type-exit' : 'type-rejected';
        const typeLabel = log.type === 'entry' ? '🟢 Entrada' : log.type === 'exit' ? '🔴 Salida' : '⛔ Rechazado';
        return `<div class="activity-item">
      <div class="activity-avatar">${avatar}</div>
      <div class="activity-body">
        <div class="activity-name">${name}</div>
        <div class="activity-detail">${emp?.dept || '—'} • ${emp?.role || '—'}</div>
      </div>
      <span class="activity-type ${typeClass}">${typeLabel}</span>
      <span class="activity-time">${formatTime(log.ts)}</span>
    </div>`;
    }).join('');
}

function renderPresentList() {
    const list = document.getElementById('presentList');
    const present = state.employees.filter(e => state.presentSet.has(e.id));
    if (!present.length) { list.innerHTML = '<div class="empty-feed">No hay personal dentro.</div>'; return; }
    list.innerHTML = present.map(e => {
        const lastEntry = [...state.logs].reverse().find(l => l.empId === e.id && l.type === 'entry');
        return `<div class="present-item">
      <span class="present-dot"></span>
      <span class="present-name">${e.firstName} ${e.lastName} <small style="color:var(--text-muted)">(${e.dept})</small></span>
      <span class="present-time">${lastEntry ? formatTime(lastEntry.ts) : '—'}</span>
    </div>`;
    }).join('');
}

function renderMiniChart() {
    const canvas = document.getElementById('timelineChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    canvas.width = canvas.offsetWidth || 800;
    const hours = Array.from({ length: 12 }, (_, i) => i + 7);
    const entries = Array(12).fill(0);
    const exits = Array(12).fill(0);
    const today = new Date().toDateString();
    state.logs.forEach(l => {
        if (new Date(l.ts).toDateString() !== today) return;
        const h = new Date(l.ts).getHours() - 7;
        if (h < 0 || h >= 12) return;
        if (l.type === 'entry') entries[h]++;
        else if (l.type === 'exit') exits[h]++;
    });
    const W = canvas.width, H = 120, pad = 28;
    const maxV = Math.max(...entries, ...exits, 1);
    ctx.clearRect(0, 0, W, H);
    const barW = (W - pad * 2) / 12;
    hours.forEach((_, i) => {
        const x = pad + i * barW;
        const eh = (entries[i] / maxV) * (H - 30);
        const xh = (exits[i] / maxV) * (H - 30);
        ctx.fillStyle = 'rgba(16,185,129,0.6)';
        ctx.roundRect?.(x + 4, H - 20 - eh, barW / 2 - 4, eh, 3);
        ctx.fill();
        ctx.fillStyle = 'rgba(249,115,22,0.6)';
        ctx.roundRect?.(x + barW / 2 + 2, H - 20 - xh, barW / 2 - 4, xh, 3);
        ctx.fill();
        ctx.fillStyle = 'rgba(148,163,184,0.5)';
        ctx.font = '10px Outfit, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`${7 + i}h`, x + barW / 2, H - 4);
    });
}

/* ---- STATION QR GENERATION ---- */
async function generateStationToken() {
    const now = Math.floor(Date.now() / 1000);
    const life = state.config.tokenLife;
    const quantizedTs = Math.floor(now / life) * life;
    const nonce = CryptoUtils.generateNonce();
    const message = `station|${quantizedTs}|${nonce}`;
    const sig = await CryptoUtils.hmacSign(message, state.secretKey);
    const payload = { v: 2, type: 'station', ts: quantizedTs, exp: quantizedTs + life, nonce, sig: sig.slice(0, 32) };
    return { payload, encoded: btoa(JSON.stringify(payload)), expiresAt: (quantizedTs + life) * 1000 };
}

async function startStationQR() {
    if (state._stationQRTimer) clearInterval(state._stationQRTimer);
    if (state._stationRingTimer) clearInterval(state._stationRingTimer);
    document.getElementById('instrTokenLife').textContent = state.config.tokenLife;
    await renderStationQR();
    // Rotate on each token window boundary
    state._stationQRTimer = setInterval(async () => { await renderStationQR(); }, state.config.tokenLife * 1000);
    // Ring countdown
    state._stationRingTimer = setInterval(() => {
        const life = state.config.tokenLife;
        const remaining = life - (Math.floor(Date.now() / 1000) % life);
        updateStationRing(remaining, life);
    }, 1000);
}

async function renderStationQR() {
    const result = await generateStationToken();
    state.currentStationToken = result;
    // Utilizamos el dominio real en el que el administrador está viendo la página
    // Esto asegura que si se usa Cloudflare (o localhost), el celular entra al mismo lugar
    const host = window.location.host;
    const protocol = window.location.protocol;

    // Generar la URL completa de check-in
    const baseUrl = `${protocol}//${host}/checkin.html`;
    const url = `${baseUrl}?t=${encodeURIComponent(result.encoded)}`;
    // Update URL display
    const urlInput = document.getElementById('stationUrl');
    if (urlInput) urlInput.value = url;
    // Render QR
    const loading = document.getElementById('stationQrLoading');
    const qrDiv = document.getElementById('stationQrCode');
    if (!qrDiv) return;
    qrDiv.innerHTML = '';
    qrDiv.style.display = 'block';
    if (loading) loading.style.display = 'none';
    new QRCode(qrDiv, { text: url, width: 240, height: 240, colorDark: '#07071a', colorLight: '#ffffff', correctLevel: QRCode.CorrectLevel.M });
    // Update token info
    const p = result.payload;
    const setEl = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
    setEl('stationTokenId', p.nonce.slice(0, 16) + '…');
    setEl('stationGenTime', new Date(p.ts * 1000).toLocaleTimeString('es-MX'));
    setEl('stationExpTime', new Date(result.expiresAt).toLocaleTimeString('es-MX'));
    setEl('stationSig', p.sig.slice(0, 20) + '…');
    // Show countdown
    const cd = document.getElementById('stationCountdown');
    if (cd) cd.style.display = 'flex';
    updateStationRing(state.config.tokenLife, state.config.tokenLife);
}

function updateStationRing(remaining, total) {
    const circ = 2 * Math.PI * 34;
    const offset = circ * (1 - remaining / total);
    const fill = document.getElementById('stationRingFill');
    const num = document.getElementById('stationRingNum');
    const warn = document.getElementById('stationWarnText');
    if (fill) { fill.style.strokeDashoffset = offset; fill.style.stroke = remaining <= 5 ? '#f43f5e' : remaining <= 10 ? '#fbbf24' : '#10b981'; }
    if (num) num.textContent = remaining;
    if (warn) { warn.textContent = remaining <= 10 ? '⚠️ Rotando pronto' : 'Seguro'; warn.style.color = remaining <= 10 ? 'var(--yellow)' : 'var(--green)'; }
}

function copyCheckinUrl() {
    const input = document.getElementById('stationUrl');
    if (!input) return;
    navigator.clipboard.writeText(input.value).then(() => showToast('📋 URL copiada al portapapeles', 'info'));
}

function updateStationStats() {
    const setEl = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
    setEl('sstEntries', state.stats.entries);
    setEl('sstExits', state.stats.exits);
    setEl('sstPresent', state.presentSet.size);
    // Feed
    const feed = document.getElementById('stationFeed');
    if (!feed) return;
    const recent = [...state.logs].reverse().slice(0, 10);
    if (!recent.length) { feed.innerHTML = '<div class="empty-feed">Sin registros aún.</div>'; return; }
    feed.innerHTML = recent.map(l => {
        const typeClass = l.type === 'entry' ? 'type-entry' : l.type === 'exit' ? 'type-exit' : 'type-rejected';
        const typeLabel = l.type === 'entry' ? '🟢 Entrada' : l.type === 'exit' ? '🔴 Salida' : '⛔ Rechazado';
        return `<div class="activity-item">
      <div class="activity-avatar">${l.empName?.[0] || '?'}</div>
      <div class="activity-body">
        <div class="activity-name">${l.empName}</div>
        <div class="activity-detail">${l.reason || '—'}</div>
      </div>
      <span class="activity-type ${typeClass}">${typeLabel}</span>
      <span class="activity-time">${formatTime(l.ts)}</span>
    </div>`;
    }).join('');
}

/* ---- POLL SERVER FOR CHECKIN UPDATES ---- */
function startPolling() {
    console.log('👀 Vigilante de actualizaciones iniciado...');
    let lastLogCount = state.logs.length;

    setInterval(async () => {
        try {
            const res = await fetch(`/api/data?t=${Date.now()}`, { cache: 'no-store' });
            if (res.ok) {
                const d = await res.json();
                const newLogs = d.logs || [];
                
                // DIAGNÓSTICO: Esto aparecerá en tu consola (F12)
                console.log(`🛰️ Consulta exitosa. Logs en servidor: ${newLogs.length}, Locales: ${lastLogCount}`);

                // Si hay CUALQUIER cambio en la cantidad de logs o presentes
                if (newLogs.length !== lastLogCount || (d.presentSet && d.presentSet.length !== state.presentSet.size)) {
                    console.warn('🚀 ¡ACTUALIZACIÓN GLOBAL DETECTADA! Sincronizando ecosistema...');
                    
                    lastLogCount = newLogs.length;
                    
                    // Sincronización total de datos
                    state.logs = newLogs;
                    state.employees = d.employees || state.employees;
                    state.presentSet = new Set(d.presentSet || []);
                    state.stats = d.stats || state.stats;
                    
                    // Sincronización de configuración (Ecosistema uniforme)
                    state.departments = d.departments || state.departments;
                    state.adminConfig = d.adminConfig || state.adminConfig;
                    state.config = d.config || state.config;
                    
                    renderAll(); 
                    updateStationStats();
                    showToast('🔄 Ecosistema sincronizado en tiempo real', 'info');
                }
            }
        } catch (e) {
            console.error('❌ Error de conexión en polling:', e.message);
        }
    }, 2000); 
}

function updateConnStatus(online, failCount = 0) {
    const dot = document.getElementById('connDot');
    const label = document.getElementById('connLabel');
    if (!dot || !label) return;

    if (online) {
        dot.style.background = '#10b981';
        label.textContent = 'En línea';
        label.style.color = 'inherit';
    } else {
        dot.style.background = '#f43f5e';
        label.textContent = failCount > 5 ? 'Sin conexión' : 'Reconectando...';
        label.style.color = '#f43f5e';
    }
}

/* ---- SCANNER ---- */
async function startScanner() {
    try {
        state.scannerStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        const video = document.getElementById('scannerVideo');
        video.srcObject = state.scannerStream;
        document.getElementById('cameraOff').style.display = 'none';
        document.getElementById('btnStartScan').style.display = 'none';
        document.getElementById('btnStopScan').style.display = 'inline-flex';
        state.scannerActive = true;
        requestAnimationFrame(scanFrame);
        showToast('📷 Escáner activado', 'info');
    } catch (e) {
        showToast('❌ No se pudo acceder a la cámara: ' + e.message, 'error');
    }
}

function stopScanner() {
    if (state.scannerStream) { state.scannerStream.getTracks().forEach(t => t.stop()); state.scannerStream = null; }
    state.scannerActive = false;
    const cameraOff = document.getElementById('cameraOff');
    const btnStart = document.getElementById('btnStartScan');
    const btnStop = document.getElementById('btnStopScan');
    if (cameraOff) cameraOff.style.display = 'flex';
    if (btnStart) btnStart.style.display = 'inline-flex';
    if (btnStop) btnStop.style.display = 'none';
}

let lastScanTime = 0;
async function scanFrame() {
    if (!state.scannerActive) return;
    const video = document.getElementById('scannerVideo');
    const canvas = document.getElementById('scannerCanvas');
    if (video.readyState !== video.HAVE_ENOUGH_DATA) { requestAnimationFrame(scanFrame); return; }
    canvas.width = video.videoWidth; canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const code = jsQR(imageData.data, canvas.width, canvas.height, { inversionAttempts: 'dontInvert' });
    if (code && Date.now() - lastScanTime > 2500) {
        lastScanTime = Date.now();
        await processScannedCode(code.data);
    }
    requestAnimationFrame(scanFrame);
}

async function processScannedCode(encoded) {
    const result = await CryptoUtils.validateToken(encoded, state.secretKey, state.employees, state.usedTokens, state.config);
    const now = new Date();
    if (result.valid) {
        const emp = result.employee;
        const type = state.presentSet.has(emp.id) ? 'exit' : 'entry';
        if (type === 'entry') state.presentSet.add(emp.id); else state.presentSet.delete(emp.id);
        if (state.config.antiReplay) state.usedTokens.add(result.payload.nonce);
        state.stats[type === 'entry' ? 'entries' : 'exits']++;
        const log = { id: Date.now(), empId: emp.id, empName: `${emp.firstName} ${emp.lastName}`, type, ts: now.toISOString(), tokenNonce: result.payload.nonce, status: 'valid', reason: type === 'entry' ? 'Entrada registrada' : 'Salida registrada' };
        state.logs.push(log);
        emp.lastAccess = now.toISOString();
        saveToStorage();
        showScanResult(true, emp, type, log);
        addScanLogItem(emp, type, true);
        updateDashboard();
        document.getElementById('siUsedTokens').textContent = state.usedTokens.size;
        document.getElementById('auditValid').textContent = parseInt(document.getElementById('auditValid').textContent || 0) + 1;
    } else {
        state.stats.blocked++;
        const log = { id: Date.now(), empId: null, empName: '—', type: 'rejected', ts: now.toISOString(), tokenNonce: '—', status: 'rejected', reason: result.reason };
        state.logs.push(log);
        saveToStorage();
        showScanResult(false, null, null, log, result.reason);
        addScanLogItem(null, 'rejected', false, result.reason);
        logSecurity('critical', `⛔ Acceso rechazado [${result.code}]`, result.reason);
        updateDashboard();
        document.getElementById('auditRejected').textContent = parseInt(document.getElementById('auditRejected').textContent || 0) + 1;
    }
    updateAuditRate();
}

function showScanResult(valid, emp, type, log, reason) {
    const el = document.getElementById('scanResult');
    el.style.display = 'block';
    el.className = `scan-result ${valid ? 'success' : 'error'}`;
    if (valid) {
        const typeLabel = type === 'entry' ? '✅ ENTRADA REGISTRADA' : '🔴 SALIDA REGISTRADA';
        el.innerHTML = `<div class="sr-icon">${emp.avatar || '👤'}</div>
      <div class="sr-name">${emp.firstName} ${emp.lastName}</div>
      <div class="sr-detail">${emp.dept} • ${emp.empNum}</div>
      <div class="sr-reason success">${typeLabel}</div>
      <div class="activity-detail" style="margin-top:8px;font-size:0.75rem">${formatTime(log.ts)}</div>`;
    } else {
        el.innerHTML = `<div class="sr-icon">🚫</div>
      <div class="sr-name">Acceso Denegado</div>
      <div class="sr-detail">Token inválido o expirado</div>
      <div class="sr-reason error">${reason}</div>`;
    }
    setTimeout(() => { el.style.display = 'none'; }, 4000);
}

function addScanLogItem(emp, type, valid, reason = '') {
    const container = document.getElementById('scanLog');
    if (container.querySelector('.empty-feed')) container.innerHTML = '';
    const div = document.createElement('div');
    div.className = `activity-item`;
    const avatar = emp ? (emp.avatar || emp.firstName[0]) : '?';
    const name = emp ? `${emp.firstName} ${emp.lastName}` : 'Desconocido';
    const typeClass = type === 'entry' ? 'type-entry' : type === 'exit' ? 'type-exit' : 'type-rejected';
    const typeLabel = type === 'entry' ? '🟢 Entrada' : type === 'exit' ? '🔴 Salida' : '⛔ Rechazado';
    div.innerHTML = `<div class="activity-avatar">${avatar}</div>
    <div class="activity-body">
      <div class="activity-name">${name}</div>
      <div class="activity-detail">${reason || (emp?.dept || '—')}</div>
    </div>
    <span class="activity-type ${typeClass}">${typeLabel}</span>
    <span class="activity-time">${formatTime(new Date().toISOString())}</span>`;
    container.insertBefore(div, container.firstChild);
    if (container.children.length > 15) container.removeChild(container.lastChild);
}

/* ---- EMPLOYEE TABLE ---- */
function renderEmployeeTable() {
    const q = document.getElementById('empSearch')?.value.toLowerCase() || '';
    const dept = document.getElementById('empFilterDept')?.value || '';
    const status = document.getElementById('empFilterStatus')?.value || '';
    let list = state.employees.filter(e => {
        const nm = `${e.firstName} ${e.lastName} ${e.empNum}`.toLowerCase();
        return (!q || nm.includes(q)) && (!dept || e.dept === dept) && (!status || e.status === status);
    });
    const tbody = document.getElementById('empTableBody');
    if (!tbody) return;
    if (!list.length) { tbody.innerHTML = '<tr><td colspan="7" class="empty-feed">No se encontraron empleados</td></tr>'; return; }
    tbody.innerHTML = list.map(e => `
    <tr>
      <td><span class="token-mono">${e.empNum}</span></td>
      <td><div class="emp-cell">
        <div class="emp-mini-avatar">${e.avatar || e.firstName[0]}</div>
        <div><div class="emp-mini-name">${e.firstName} ${e.lastName}</div>
        <div class="emp-mini-num">${e.email || '—'}</div></div>
      </div></td>
      <td>${e.dept}</td>
      <td>${e.role}</td>
      <td><span class="status-chip ${e.status === 'active' ? 'status-active' : 'status-inactive'}">${e.status === 'active' ? '● Activo' : '○ Inactivo'}</span></td>
      <td><span class="token-mono">${e.lastAccess ? formatDateTime(e.lastAccess) : 'Nunca'}</span></td>
      <td><div class="action-btns">
        <button class="btn-table edit" onclick="editEmployee('${e.id}')">✏️ Editar</button>
        <button class="btn-table qr" onclick="goToQR('${e.id}')">📱 QR</button>
        <button class="btn-table del" onclick="deleteEmployee('${e.id}')">🗑</button>
      </div></td>
    </tr>`).join('');
    fillDeptDropdowns();
}

function goToQR(empId) { showPage('generate'); selectEmpForQR(empId); }

/* ---- EMPLOYEE CRUD ---- */
function openEmpModal(emp = null) {
    document.getElementById('empModalTitle').textContent = emp ? 'Editar Empleado' : 'Nuevo Empleado';
    document.getElementById('empId').value = emp?.id || '';
    document.getElementById('empFirstName').value = emp?.firstName || '';
    document.getElementById('empLastName').value = emp?.lastName || '';
    document.getElementById('empNum').value = emp?.empNum || `EMP-${String(state.employees.length + 1).padStart(3, '0')}`;
    document.getElementById('empDept').value = emp?.dept || '';
    document.getElementById('empRole').value = emp?.role || '';
    document.getElementById('empEmail').value = emp?.email || '';
    document.getElementById('empPhone').value = emp?.phone || '';
    document.getElementById('empStatus').value = emp?.status || 'active';
    document.getElementById('empAvatar').value = emp?.avatar || '';
    document.getElementById('empModalOverlay').classList.add('active');
    document.getElementById('empModal').classList.add('active');
    fillDeptDropdowns();
}
function closeEmpModal() {
    document.getElementById('empModalOverlay').classList.remove('active');
    document.getElementById('empModal').classList.remove('active');
}
function editEmployee(id) { openEmpModal(state.employees.find(e => e.id === id)); }
/* ---- EMPLOYEE CRUD (ATOMIC) ---- */
async function saveEmployee() {
    const id = document.getElementById('empId').value;
    const empData = {
        id: id || `emp_${Date.now()}`,
        firstName: document.getElementById('empFirstName').value.trim(),
        lastName: document.getElementById('empLastName').value.trim(),
        empNum: document.getElementById('empNum').value.trim(),
        dept: document.getElementById('empDept').value,
        role: document.getElementById('empRole').value.trim(),
        email: document.getElementById('empEmail').value.trim(),
        phone: document.getElementById('empPhone').value.trim(),
        status: document.getElementById('empStatus').value,
        avatar: document.getElementById('empAvatar').value.trim(),
        createdAt: new Date().toISOString(), 
        lastAccess: null,
    };
    if (!empData.firstName || !empData.lastName || !empData.empNum) { showToast('⚠️ Completa los campos obligatorios', 'warning'); return; }
    
    try {
        const res = await fetch('/api/employees/upsert', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(empData)
        });
        if (res.ok) {
            const idx = state.employees.findIndex(e => e.id === empData.id);
            if (idx >= 0) state.employees[idx] = empData; else state.employees.push(empData);
            closeEmpModal(); renderEmployeeTable();
            showToast(`✅ Empleado ${empData.firstName} ${empData.lastName} guardado`, 'success');
        } else {
            throw new Error('No se pudo guardar en el servidor');
        }
    } catch (e) {
        showToast('❌ Error sincronizando: ' + e.message, 'error');
    }
}

async function deleteEmployee(id) {
    showConfirm('Eliminar Empleado', '¿Estás seguro de que deseas eliminar este empleado?', async () => {
        try {
            const res = await fetch(`/api/employees/${id}`, { method: 'DELETE' });
            if (res.ok) {
                state.employees = state.employees.filter(e => e.id !== id);
                state.presentSet.delete(id);
                renderEmployeeTable(); updateDashboard();
                showToast('🗑 Empleado eliminado con éxito', 'warning');
            }
        } catch (e) {
            showToast('❌ Fallo al eliminar: ' + e.message, 'error');
        }
    });
}

/* ---- LOGS ---- */
function renderLogs() {
    const date = document.getElementById('logDate')?.value;
    const type = document.getElementById('logType')?.value;
    const q = document.getElementById('logSearch')?.value.toLowerCase();
    let list = [...state.logs].reverse().filter(l => {
        const matchDate = !date || l.ts.startsWith(date);
        const matchType = !type || l.type === type;
        const matchQ = !q || l.empName?.toLowerCase().includes(q) || l.reason?.toLowerCase().includes(q);
        return matchDate && matchType && matchQ;
    });
    const tbody = document.getElementById('logTableBody');
    if (!tbody) return;
    if (!list.length) { tbody.innerHTML = '<tr><td colspan="7" class="empty-feed">No hay registros</td></tr>'; document.getElementById('logTableFooter').textContent = ''; return; }
    tbody.innerHTML = list.map((l, i) => {
        const typeClass = l.type === 'entry' ? 'type-entry' : l.type === 'exit' ? 'type-exit' : 'type-rejected';
        const typeLabel = l.type === 'entry' ? '🟢 Entrada' : l.type === 'exit' ? '🔴 Salida' : '⛔ Rechazado';
        const statusClass = l.status === 'valid' ? 'status-active' : 'status-inactive';
        return `<tr>
      <td><span class="token-mono">${list.length - i}</span></td>
      <td>${l.empName}</td>
      <td><span class="activity-type ${typeClass}">${typeLabel}</span></td>
      <td><span class="token-mono">${formatDateTime(l.ts)}</span></td>
      <td><span class="token-mono">${l.tokenNonce?.slice(0, 12) || '—'}…</span></td>
      <td><span class="status-chip ${statusClass}">${l.status === 'valid' ? '✓ Válido' : '✗ Rechazado'}</span></td>
      <td style="font-size:0.8rem;color:var(--text-muted)">${l.reason}</td>
    </tr>`;
    }).join('');
    document.getElementById('logTableFooter').textContent = `${list.length} registros encontrados`;
}
function exportLogs() {
    if (!state.logs.length) {
        showToast('⚠️ No hay registros para exportar', 'warning');
        return;
    }

    const today = new Date().toLocaleDateString('es-MX').replace(/\//g, '-');
    const filename = `Asistencia_${today}.xlsx`;

    // Preparar datos para Excel
    const data = state.logs.map((l, i) => ({
        '#': i + 1,
        'Empleado': l.empName,
        'Movimiento': l.type === 'entry' ? 'Entrada' : (l.type === 'exit' ? 'Salida' : 'Rechazado'),
        'Fecha': l.ts.split('T')[0],
        'Hora': l.ts.split('T')[1]?.slice(0, 8),
        'Token ID': l.tokenNonce || 'N/A',
        'Estado': l.status === 'valid' ? 'Válido' : 'Rechazado',
        'Detalle/Motivo': l.reason
    }));

    // Crear libro y hoja
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Asistencia Hoy");

    // Estilo básico de columnas (ajuste de ancho)
    const wscols = [
        { wch: 5 },  // #
        { wch: 25 }, // Empleado
        { wch: 15 }, // Movimiento
        { wch: 15 }, // Fecha
        { wch: 12 }, // Hora
        { wch: 20 }, // Token
        { wch: 12 }, // Estado
        { wch: 40 }, // Detalle
    ];
    ws['!cols'] = wscols;

    // Descargar
    XLSX.writeFile(wb, filename);
    showToast('📊 Excel generado y descargado', 'success');
}
function clearLogs() {
    showConfirm('Limpiar Registros', '¿Eliminar todos los registros de acceso?', () => {
        state.logs = []; state.stats = { present: 0, entries: 0, exits: 0, blocked: 0 };
        state.presentSet.clear(); saveToStorage(); renderLogs(); updateDashboard();
        showToast('🗑 Registros eliminados', 'warning');
    });
}

/* ---- REPORTS ---- */
function renderReports() {
    renderWeeklyChart();
    renderDeptReport();
    renderHoursReport();
}
function renderWeeklyChart() {
    const canvas = document.getElementById('weeklyChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    canvas.width = canvas.offsetWidth || 600;
    const days = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
    const entries = Array(7).fill(0);
    const now = new Date();
    const startOfWeek = new Date(now); startOfWeek.setDate(now.getDate() - now.getDay() + 1);
    state.logs.filter(l => l.type === 'entry').forEach(l => {
        const d = new Date(l.ts);
        const diff = Math.floor((d - startOfWeek) / 86400000);
        if (diff >= 0 && diff < 7) entries[diff]++;
    });
    const W = canvas.width, H = 180, pad = 32;
    const maxV = Math.max(...entries, 1);
    ctx.clearRect(0, 0, W, H);
    const barW = (W - pad * 2) / 7;
    entries.forEach((v, i) => {
        const x = pad + i * barW; const bh = (v / maxV) * (H - 50);
        const grad = ctx.createLinearGradient(0, H - 20 - bh, 0, H - 20);
        grad.addColorStop(0, 'rgba(99,102,241,0.9)'); grad.addColorStop(1, 'rgba(167,139,250,0.4)');
        ctx.fillStyle = grad;
        ctx.roundRect?.(x + 6, H - 20 - bh, barW - 12, bh, 4);
        ctx.fill();
        ctx.fillStyle = 'rgba(148,163,184,0.6)';
        ctx.font = '11px Outfit, sans-serif'; ctx.textAlign = 'center';
        ctx.fillText(days[i], x + barW / 2, H - 4);
        if (v > 0) { ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.fillText(v, x + barW / 2, H - 25 - bh); }
    });
}
function renderDeptReport() {
    const el = document.getElementById('deptReport');
    if (!el) return;
    const counts = {};
    state.employees.filter(e => e.status === 'active').forEach(e => { counts[e.dept] = (counts[e.dept] || 0) + 1; });
    const total = Object.values(counts).reduce((a, b) => a + b, 0) || 1;
    el.innerHTML = Object.entries(counts).map(([d, c]) => `
    <div class="dept-bar-item">
      <div class="dept-bar-label"><span>${d}</span><span>${c} empleados (${Math.round(c / total * 100)}%)</span></div>
      <div class="dept-bar-track"><div class="dept-bar-fill" style="width:${c / total * 100}%"></div></div>
    </div>`).join('') || '<div class="empty-feed">Sin datos</div>';
}
function renderHoursReport() {
    const el = document.getElementById('hoursReport');
    if (!el) return;
    const empHours = {};
    state.employees.forEach(e => { empHours[e.id] = { name: `${e.firstName} ${e.lastName}`, hours: 0 }; });
    const entryMap = {};
    [...state.logs].forEach(l => {
        if (l.type === 'entry') entryMap[l.empId] = new Date(l.ts);
        else if (l.type === 'exit' && entryMap[l.empId] && empHours[l.empId]) {
            const h = (new Date(l.ts) - entryMap[l.empId]) / 3600000;
            empHours[l.empId].hours += h; delete entryMap[l.empId];
        }
    });
    el.innerHTML = `<table class="data-table"><thead><tr><th>Empleado</th><th>Horas Trabajadas</th><th>Progreso</th></tr></thead><tbody>` +
        Object.values(empHours).filter(e => e.hours > 0).map(e =>
            `<tr><td>${e.name}</td><td class="token-mono">${e.hours.toFixed(1)}h</td>
      <td style="width:40%"><div class="dept-bar-track"><div class="dept-bar-fill" style="width:${Math.min(e.hours / 8 * 100, 100)}%"></div></div></td></tr>`
        ).join('') || '<tr><td colspan="3" class="empty-feed">Sin registros de horas</td></tr>' +
        '</tbody></table>';
}

/* ---- SECURITY PAGE ---- */
function renderSecurityPage() {
    const keyDisp = document.getElementById('secretKeyDisplay');
    if (keyDisp) keyDisp.value = state.secretKey;
    const el = document.getElementById('lastKeyRotation');
    if (el) el.textContent = state.lastKeyRotation ? formatDateTime(state.lastKeyRotation) : 'Nunca (clave inicial)';
    const cfgTokenLife = document.getElementById('cfgTokenLife');
    if (cfgTokenLife) { cfgTokenLife.value = state.config.tokenLife; document.getElementById('cfgTokenLifeVal').textContent = `${state.config.tokenLife}s`; }
    const cfgWindow = document.getElementById('cfgTimeWindow');
    if (cfgWindow) { cfgWindow.value = state.config.timeWindow; document.getElementById('cfgTimeWindowVal').textContent = `${state.config.timeWindow}s`; }
    const cfgRetries = document.getElementById('cfgMaxRetries');
    if (cfgRetries) { cfgRetries.value = state.config.maxRetries; document.getElementById('cfgMaxRetriesVal').textContent = state.config.maxRetries; }
    document.getElementById('cfgAntiReplay').checked = state.config.antiReplay;
    document.getElementById('cfgDeviceLock').checked = state.config.deviceLock;
    document.getElementById('cfgAlerts').checked = state.config.alerts;
    document.getElementById('siWindow').textContent = `±${state.config.timeWindow}s`;
    document.getElementById('siKeyPreview').textContent = state.secretKey.slice(0, 8) + '••••••••';
    renderSecurityLog();
    document.getElementById('auditCacheSize').textContent = state.usedTokens.size;
}
function renderSecurityLog() {
    const el = document.getElementById('securityLog');
    if (!el) return;
    if (!state.securityLog.length) { el.innerHTML = '<div class="empty-feed">Sin eventos de seguridad</div>'; return; }
    el.innerHTML = [...state.securityLog].reverse().slice(0, 30).map(l =>
        `<div class="sec-log-item ${l.level}">
      <span class="sec-log-icon">${l.level === 'critical' ? '🚨' : l.level === 'warning' ? '⚠️' : 'ℹ️'}</span>
      <div class="sec-log-body">
        <div class="sec-log-msg">${l.title}</div>
        <div class="sec-log-time">${l.detail} • ${formatDateTime(l.ts)}</div>
      </div>
    </div>`).join('');
}
function logSecurity(level, title, detail = '') {
    state.securityLog.push({ level, title, detail, ts: new Date().toISOString() });
    if (state.securityLog.length > 200) state.securityLog.shift();
}
function updateConfig() {
    document.getElementById('cfgTokenLifeVal').textContent = `${document.getElementById('cfgTokenLife').value}s`;
    document.getElementById('cfgTimeWindowVal').textContent = `${document.getElementById('cfgTimeWindow').value}s`;
    document.getElementById('cfgMaxRetriesVal').textContent = document.getElementById('cfgMaxRetries').value;
}
function saveConfig() {
    state.config = {
        tokenLife: +document.getElementById('cfgTokenLife').value,
        timeWindow: +document.getElementById('cfgTimeWindow').value,
        maxRetries: +document.getElementById('cfgMaxRetries').value,
        antiReplay: document.getElementById('cfgAntiReplay').checked,
        deviceLock: document.getElementById('cfgDeviceLock').checked,
        alerts: document.getElementById('cfgAlerts').checked,
    };
    saveToStorage(); showToast('✅ Configuración guardada', 'success');
    logSecurity('info', '⚙️ Configuración actualizada', `TokenLife=${state.config.tokenLife}s, Window=${state.config.timeWindow}s`);
}
async function rotateKey() {
    showConfirm('Rotar Clave HMAC', '⚠️ Al rotar la clave, todos los QR generados anteriormente quedarán inválidos de inmediato.', async () => {
        state.secretKey = await CryptoUtils.generateKey();
        state.lastKeyRotation = new Date().toISOString();
        state.usedTokens.clear();
        if (state.selectedEmpForQR) await generateAndShowQR();
        saveToStorage(); renderSecurityPage();
        showToast('🔑 Clave rotada exitosamente. QRs anteriores invalidados.', 'success');
        logSecurity('warning', '🔑 Clave HMAC rotada manualmente', 'Todos los tokens anteriores fueron invalidados.');
    });
}
function toggleKeyVis() {
    const inp = document.getElementById('secretKeyDisplay');
    inp.type = inp.type === 'password' ? 'text' : 'password';
}
function copyKey() {
    navigator.clipboard.writeText(state.secretKey).then(() => showToast('📋 Clave copiada', 'info'));
}
function clearReplayCache() {
    state.usedTokens.clear();
    document.getElementById('auditCacheSize').textContent = 0;
    showToast('🧹 Caché anti-replay limpiado', 'info');
}
function updateAuditRate() {
    const valid = +document.getElementById('auditValid').textContent || 0;
    const rejected = +document.getElementById('auditRejected').textContent || 0;
    const total = valid + rejected;
    document.getElementById('auditRate').textContent = total ? `${Math.round(valid / total * 100)}%` : '—';
}

/* ---- ADMIN ---- */
function renderAdminPage() {
    document.getElementById('cfgCompany').value = state.adminConfig.company;
    document.getElementById('cfgLogo').value = state.adminConfig.logo;
    document.getElementById('cfgEntryTime').value = state.adminConfig.entryTime;
    document.getElementById('cfgExitTime').value = state.adminConfig.exitTime;
    document.getElementById('cfgGrace').value = state.adminConfig.grace;
    const deptList = document.getElementById('deptList');
    if (deptList) deptList.innerHTML = state.departments.map(d =>
        `<div class="dept-item"><span>${d}</span><button class="btn-table del" onclick="removeDept('${d}')">✕</button></div>`).join('');
}
function saveAdminConfig() {
    state.adminConfig = {
        company: document.getElementById('cfgCompany').value,
        logo: document.getElementById('cfgLogo').value,
        entryTime: document.getElementById('cfgEntryTime').value,
        exitTime: document.getElementById('cfgExitTime').value,
        grace: +document.getElementById('cfgGrace').value,
    };
    saveToStorage(); showToast('✅ Configuración guardada', 'success');
}
function addDepartment() {
    const val = document.getElementById('newDeptInput').value.trim();
    if (!val || state.departments.includes(val)) return;
    state.departments.push(val); saveToStorage(); renderAdminPage(); fillDeptDropdowns();
    document.getElementById('newDeptInput').value = '';
}
function removeDept(d) {
    state.departments = state.departments.filter(x => x !== d);
    saveToStorage(); renderAdminPage(); fillDeptDropdowns();
}
function fillDeptDropdowns() {
    const opts = `<option value="">Seleccionar...</option>` + state.departments.map(d => `<option value="${d}">${d}</option>`).join('');
    ['empDept', 'empFilterDept'].forEach(id => {
        const el = document.getElementById(id);
        if (el) { const v = el.value; el.innerHTML = id === 'empFilterDept' ? `<option value="">Todos los departamentos</option>${state.departments.map(d => ` <option value="${d}">${d}</option>`).join('')}` : opts; el.value = v; }
    });
}
function exportData() {
    const data = { employees: state.employees, logs: state.logs, departments: state.departments, adminConfig: state.adminConfig, exportedAt: new Date().toISOString() };
    downloadFile('qr_asistencia_backup.json', JSON.stringify(data, null, 2), 'application/json');
    showToast('⬇️ Backup exportado', 'success');
}
function importData(e) {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
        try {
            const d = JSON.parse(ev.target.result);
            if (d.employees) state.employees = d.employees;
            if (d.logs) state.logs = d.logs;
            if (d.departments) state.departments = d.departments;
            if (d.adminConfig) state.adminConfig = d.adminConfig;
            saveToStorage(); renderAll(); showToast('✅ Datos importados correctamente', 'success');
        } catch { showToast('❌ Archivo inválido', 'error'); }
    };
    reader.readAsText(file);
}
function resetSystem() {
    showConfirm('⚠️ RESETEAR SISTEMA', 'Esta acción eliminará TODOS los datos del sistema incluyendo empleados, registros y configuración. ¿Estás completamente seguro?', () => {
        localStorage.removeItem(STORE_KEY);
        location.reload();
    });
}

/* ---- CONFIRM MODAL ---- */
function showConfirm(title, msg, onOk) {
    document.getElementById('confirmTitle').textContent = title;
    document.getElementById('confirmMsg').textContent = msg;
    document.getElementById('confirmOverlay').classList.add('active');
    document.getElementById('confirmModal').classList.add('active');
    const btn = document.getElementById('confirmOkBtn');
    btn.onclick = () => { closeConfirm(); onOk(); };
}
function closeConfirm() {
    document.getElementById('confirmOverlay').classList.remove('active');
    document.getElementById('confirmModal').classList.remove('active');
}

/* ---- TOAST ---- */
const toastTypes = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
function showToast(msg, type = 'info') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast-item ${type}`;
    toast.innerHTML = `<span class="toast-icon">${toastTypes[type]}</span><span class="toast-msg">${msg}</span>`;
    container.appendChild(toast);
    setTimeout(() => { toast.style.opacity = '0'; toast.style.transform = 'translateX(60px)'; toast.style.transition = '0.3s ease'; setTimeout(() => toast.remove(), 300); }, 3500);
}

/* ---- TORCH ---- */
function toggleTorch() {
    if (!state.scannerStream) return;
    const track = state.scannerStream.getVideoTracks()[0];
    if (!track) return;
    const cap = track.getCapabilities();
    if (!cap.torch) { showToast('⚠️ Tu dispositivo no soporta linterna', 'warning'); return; }
    track.applyConstraints({ advanced: [{ torch: !state._torch }] });
    state._torch = !state._torch;
}

/* ---- HELPERS ---- */
function formatTime(iso) { return new Date(iso).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }); }
function formatDateTime(iso) { return new Date(iso).toLocaleString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }); }
function downloadFile(name, content, mime) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([content], { type: mime }));
    a.download = name; a.click();
}

// --- Login UI and auto-auth wiring ---
function showLoginOverlay() {
    const el = document.getElementById('loginOverlay');
    if (el) el.style.display = 'flex';
    if (document.getElementById('loginError')) document.getElementById('loginError').style.display = 'none';
    // clear fields
    if (document.getElementById('loginUser')) document.getElementById('loginUser').value = '';
    if (document.getElementById('loginPass')) document.getElementById('loginPass').value = '';
}
function hideLoginOverlay() {
    const el = document.getElementById('loginOverlay');
    if (el) el.style.display = 'none';
}
async function loginSubmit() {
    const u = document.getElementById('loginUser')?.value;
    const p = document.getElementById('loginPass')?.value;
    if (!u || !p) { showToast('Ingresa credenciales', 'warning'); return; }
    try {
        const res = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: u, password: p })
        });
        if (!res.ok) { document.getElementById('loginError')?.style.display = 'block'; return; }
        const data = await res.json();
        localStorage.setItem('jwt', data.token);
        hideLoginOverlay();
        location.reload();
    } catch (e) {
        showToast('Error de autenticación', 'error');
    }
}
