/* ============================================================
   QR-ASISTENCIA — MAIN APP LOGIC
   ============================================================ */

/* ---- AUTH / ROLES ---- */
const AUTH_KEY = 'qr_auth';
let currentUser = null; // { role: 'admin' | 'qr', username: string }

// Credenciales predefinidas (en producción usar hash)
const CREDENTIALS = {
    admin: { username: 'admin', password: 'admin123' },
    qr: { code: 'qr2024' } // código simple para modo QR
};

function checkAuth() {
    const auth = localStorage.getItem(AUTH_KEY);
    if (auth) {
        try {
            currentUser = JSON.parse(auth);
            return true;
        } catch { }
    }
    return false;
}

function login(role) {
    const errorEl = document.getElementById('loginError');
    errorEl.textContent = '';

    if (role === 'admin') {
        const user = document.getElementById('adminUser').value.trim();
        const pass = document.getElementById('adminPass').value;

        if (user === CREDENTIALS.admin.username && pass === CREDENTIALS.admin.password) {
            currentUser = { role: 'admin', username: user };
            localStorage.setItem(AUTH_KEY, JSON.stringify(currentUser));
            showMainApp();
        } else {
            errorEl.textContent = '❌ Usuario o contraseña incorrectos';
        }
    } else if (role === 'qr') {
        const code = document.getElementById('qrCode').value.trim();

        if (code === CREDENTIALS.qr.code) {
            currentUser = { role: 'qr', username: 'QR Display' };
            localStorage.setItem(AUTH_KEY, JSON.stringify(currentUser));
            showMainApp();
        } else {
            errorEl.textContent = '❌ Código de acceso incorrecto';
        }
    }
}

function logout() {
    currentUser = null;
    localStorage.removeItem(AUTH_KEY);
    // Limpiar también timers de QR
    if (state._qrDisplayTimer) clearInterval(state._qrDisplayTimer);
    if (state._qrDisplayCountdown) clearInterval(state._qrDisplayCountdown);
    location.reload();
}

// Función para forzar mostrar login (útil para testing)
function forceLoginScreen() {
    currentUser = null;
    localStorage.removeItem(AUTH_KEY);
    document.getElementById('loginScreen').classList.remove('hidden');
    document.getElementById('mainApp').classList.add('hidden');
}

function showMainApp() {
    document.getElementById('loginScreen').classList.add('hidden');
    document.getElementById('mainApp').classList.remove('hidden');

    if (currentUser?.role === 'qr') {
        // Modo QR: solo mostrar página QR, ocultar sidebar
        document.body.classList.add('qr-mode');
        showPage('qr');
        // Agregar botón de logout flotante
        addLogoutButton();
    } else {
        // Modo Admin: mostrar todo
        document.body.classList.remove('qr-mode');
        showPage('dashboard');
    }
}

function addLogoutButton() {
    const existing = document.getElementById('qrLogoutBtn');
    if (existing) return;

    const btn = document.createElement('button');
    btn.id = 'qrLogoutBtn';
    btn.className = 'logout-btn';
    btn.innerHTML = '🚪 Salir';
    btn.onclick = logout;
    document.body.appendChild(btn);
}

function switchLoginTab(tab) {
    document.querySelectorAll('.login-tab').forEach(t => t.classList.remove('active'));
    document.getElementById('tab' + tab.charAt(0).toUpperCase() + tab.slice(1)).classList.add('active');

    if (tab === 'admin') {
        document.getElementById('adminLoginForm').classList.remove('hidden');
        document.getElementById('qrLoginForm').classList.add('hidden');
    } else {
        document.getElementById('adminLoginForm').classList.add('hidden');
        document.getElementById('qrLoginForm').classList.remove('hidden');
    }
}

/* ---- STATE ---- */
const STORE_KEY = 'qr_asist';
let state = {
    employees: [], logs: [], departments: ['TI', 'RRHH', 'Ventas', 'Operaciones', 'Finanzas'],
    secretKey: '', config: { tokenLife: 60, timeWindow: 600, maxRetries: 3, antiReplay: true, deviceLock: false, alerts: true },
    usedTokens: new Set(), scannerStream: null, scannerActive: false,
    selectedEmpForQR: null, currentQRToken: null, qrRotateTimer: null,
    securityLog: [], adminConfig: { company: 'Mi Empresa S.A.', logo: '', entryTime: '08:00', exitTime: '18:00', grace: 10 },
    stats: { present: 0, entries: 0, exits: 0, blocked: 0 }, presentSet: new Set(),
};
/* ---- INIT ---- */
document.addEventListener('DOMContentLoaded', async () => {
    // Verificar autenticación primero
    // TEMP: Deshabilitado forzado para siempre mostrar login
    const hasAuth = checkAuth();
    const forceLogin = true; // Cambiar a false para habilitar auth normal
    
    if (hasAuth && !forceLogin) {
        showMainApp();
    } else {
        // Mostrar pantalla de login
        document.getElementById('loginScreen').classList.remove('hidden');
        document.getElementById('mainApp').classList.add('hidden');
        // Limpiar auth si existe
        if (forceLogin) localStorage.removeItem(AUTH_KEY);
    }

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
    startVersionCheck();
    // Cargar historial de logs en segundo plano
    loadLogsHistory();
});

/* ---- AUTO-REFRESH: detecta nueva versión en Render y recarga ---- */
function startVersionCheck() {
    let currentVersion = null;
    setInterval(async () => {
        try {
            const res = await fetch('/api/version', { cache: 'no-store' });
            if (!res.ok) return;
            const { version } = await res.json();
            if (currentVersion === null) { currentVersion = version; return; }
            if (version !== currentVersion) {
                currentVersion = version;
                showToast('🔄 Nueva versión disponible. Actualizando...', 'info');
                setTimeout(() => location.reload(true), 1500);
            }
        } catch { /* ignore */ }
    }, 30000); // cada 30s
}

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
    location: ['Ubicación en Tiempo Real', 'Mapa de empleados activos'],
};
function showPage(id) {
    // En modo QR, solo permitir ver la página QR
    if (currentUser?.role === 'qr' && id !== 'qr') {
        id = 'qr';
    }

    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    document.getElementById(`page-${id}`)?.classList.add('active');
    document.getElementById(`nav-${id}`)?.classList.add('active');
    const [title, sub] = pageTitles[id] || [id, ''];
    document.getElementById('pageTitle').textContent = title;
    document.getElementById('pageSub').textContent = sub;
    if (id !== 'scanner') stopScanner();
    if (id === 'generate') startStationQR();
    if (id === 'qr') { startQRDisplayMode(); }
    if (id === 'employees') renderEmployeeTable();
    if (id === 'logs') { loadLogsHistory().then(() => renderLogs()); }
    if (id === 'reports') renderReports();
    if (id === 'security') renderSecurityPage();
    if (id === 'admin') renderAdminPage();
    if (id === 'location') { initLocationMap(); startLocationAutoRefresh(); }
    else { stopLocationAutoRefresh(); }
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
    // Rotate on each token window boundary (cada 60 segundos)
    state._stationQRTimer = setInterval(async () => { await renderStationQR(); }, state.config.tokenLife * 1000);
    // Ring countdown
    state._stationRingTimer = setInterval(() => {
        const life = state.config.tokenLife;
        const remaining = life - (Math.floor(Date.now() / 1000) % life);
        updateStationRing(remaining, life);
    }, 1000);
}

// Función para modo QR display (pantalla de solo QR)
async function startQRDisplayMode() {
    if (state._qrDisplayTimer) clearInterval(state._qrDisplayTimer);
    if (state._qrDisplayCountdown) clearInterval(state._qrDisplayCountdown);

    await renderQRDisplay();

    // Renovar QR cada 60 segundos
    state._qrDisplayTimer = setInterval(async () => {
        await renderQRDisplay();
    }, state.config.tokenLife * 1000);

    // Contador regresivo
    state._qrDisplayCountdown = setInterval(() => {
        const life = state.config.tokenLife;
        const remaining = life - (Math.floor(Date.now() / 1000) % life);
        const timerEl = document.getElementById('qrTimer');
        if (timerEl) timerEl.textContent = remaining;
    }, 1000);

    // Actualizar hora
    updateQRDisplayTime();
    setInterval(updateQRDisplayTime, 1000);
}

async function renderQRDisplay() {
    const result = await generateStationToken();
    state.currentStationToken = result;

    const host = window.location.host;
    const protocol = window.location.protocol;
    const baseUrl = `${protocol}//${host}/checkin.html`;
    const url = `${baseUrl}?t=${encodeURIComponent(result.encoded)}`;

    const qrDiv = document.getElementById('qrDisplayCode');
    if (!qrDiv) return;

    qrDiv.innerHTML = '';
    new QRCode(qrDiv, {
        text: url,
        width: 300,
        height: 300,
        colorDark: '#07071a',
        colorLight: '#ffffff',
        correctLevel: QRCode.CorrectLevel.M
    });

    // Actualizar nombre de empresa
    const companyEl = document.getElementById('qrCompanyName');
    if (companyEl) companyEl.textContent = state.adminConfig.company || 'Mi Empresa S.A.';
}

function updateQRDisplayTime() {
    const timeEl = document.getElementById('qrCurrentTime');
    if (timeEl) {
        timeEl.textContent = new Date().toLocaleString('es-MX', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    }
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
    let lastLogCount = state.logs.length;
    setInterval(async () => {
        try {
            const res = await fetch(`/api/data?t=${Date.now()}`, { cache: 'no-store' });
            if (res.ok) {
                const d = await res.json();
                const newLogs = d.logs || [];
                if (newLogs.length !== lastLogCount || (d.presentSet && d.presentSet.length !== state.presentSet.size)) {
                    lastLogCount = newLogs.length;
                    state.logs = newLogs;
                    state.employees = d.employees || state.employees;
                    state.presentSet = new Set(d.presentSet || []);
                    state.stats = d.stats || state.stats;
                    state.departments = d.departments || state.departments;
                    state.adminConfig = d.adminConfig || state.adminConfig;
                    state.config = d.config || state.config;
                    renderAll();
                    updateStationStats();
                }
            }
        } catch (e) { /* silently ignore */ }
    }, 3000);
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
    document.getElementById('empMonthlySalary').value = emp?.monthlySalary || 0;
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
// Cache del historial de logs de días anteriores
let _logsHistory = [];
let _logsHistoryLoaded = false;

async function loadLogsHistory() {
    try {
        const res = await fetch('/api/logs/history', { cache: 'no-store' });
        if (res.ok) {
            const d = await res.json();
            _logsHistory = d.allLogs || [];
            _logsHistoryLoaded = true;
        }
    } catch { /* ignorar si falla */ }
}

function renderLogs() {
    const date = document.getElementById('logDate')?.value;
    const type = document.getElementById('logType')?.value;
    const q = document.getElementById('logSearch')?.value.toLowerCase();

    // Combinar logs del día actual con historial de días anteriores
    const allLogs = [..._logsHistory, ...state.logs];

    let list = [...allLogs].sort((a, b) => new Date(b.ts) - new Date(a.ts)).filter(l => {
        const matchDate = !date || l.ts.startsWith(date);
        const matchType = !type || l.type === type;
        const matchQ = !q || l.empName?.toLowerCase().includes(q) || l.reason?.toLowerCase().includes(q);
        return matchDate && matchType && matchQ;
    });

    const tbody = document.getElementById('logTableBody');
    if (!tbody) return;
    if (!list.length) {
        tbody.innerHTML = '<tr><td colspan="7" class="empty-feed">No hay registros</td></tr>';
        document.getElementById('logTableFooter').textContent = '';
        return;
    }
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
    const allLogs = [..._logsHistory, ...state.logs].sort((a, b) => new Date(b.ts) - new Date(a.ts));
    if (!allLogs.length) {
        showToast('⚠️ No hay registros para exportar', 'warning');
        return;
    }

    const today = new Date().toLocaleDateString('es-MX').replace(/\//g, '-');
    const filename = `Asistencia_${today}.xlsx`;

    // Preparar datos para Excel (todos los registros, incluyendo historial)
    const data = allLogs.map((l, i) => ({
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
    renderEmployeeReport();
    renderAttendanceSummary();
}

function renderWeeklyChart() {
    const canvas = document.getElementById('weeklyChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    canvas.width = canvas.offsetWidth || 600;
    const days = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
    const entries = Array(7).fill(0);
    const now = new Date();
    const startOfWeek = new Date(now); startOfWeek.setDate(now.getDate() - now.getDay() + 1); startOfWeek.setHours(0,0,0,0);
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

function renderAttendanceSummary() {
    const el = document.getElementById('attendanceSummary');
    if (!el) return;
    const today = new Date().toDateString();
    const todayLogs = state.logs.filter(l => new Date(l.ts).toDateString() === today);
    const todayEntries = todayLogs.filter(l => l.type === 'entry').length;
    const todayExits = todayLogs.filter(l => l.type === 'exit').length;
    const activeNow = state.presentSet.size;
    const totalActive = state.employees.filter(e => e.status === 'active').length;
    const attendanceRate = totalActive > 0 ? Math.round((activeNow / totalActive) * 100) : 0;
    el.innerHTML = `
        <div class="report-stat-grid">
            <div class="report-stat"><span class="report-stat-val" style="color:var(--green)">${todayEntries}</span><span class="report-stat-lbl">Entradas hoy</span></div>
            <div class="report-stat"><span class="report-stat-val" style="color:var(--orange)">${todayExits}</span><span class="report-stat-lbl">Salidas hoy</span></div>
            <div class="report-stat"><span class="report-stat-val" style="color:var(--primary)">${activeNow}</span><span class="report-stat-lbl">Presentes ahora</span></div>
            <div class="report-stat"><span class="report-stat-val" style="color:var(--blue)">${attendanceRate}%</span><span class="report-stat-lbl">Tasa asistencia</span></div>
        </div>`;
}

function renderEmployeeReport() {
    const el = document.getElementById('employeeReport');
    if (!el) return;
    // Calcular horas trabajadas por empleado
    const empStats = {};
    state.employees.forEach(e => {
        empStats[e.id] = { emp: e, hours: 0, entries: 0, exits: 0, lastAccess: e.lastAccess };
    });
    const entryMap = {};
    [...state.logs].sort((a,b) => new Date(a.ts) - new Date(b.ts)).forEach(l => {
        if (!empStats[l.empId]) return;
        if (l.type === 'entry') {
            entryMap[l.empId] = new Date(l.ts);
            empStats[l.empId].entries++;
        } else if (l.type === 'exit') {
            empStats[l.empId].exits++;
            if (entryMap[l.empId]) {
                empStats[l.empId].hours += (new Date(l.ts) - entryMap[l.empId]) / 3600000;
                delete entryMap[l.empId];
            }
        }
    });
    const rows = Object.values(empStats).filter(s => s.emp.status === 'active');
    if (!rows.length) { el.innerHTML = '<div class="empty-feed">Sin empleados activos</div>'; return; }
    el.innerHTML = `<div class="table-wrap"><table class="data-table">
        <thead><tr>
            <th>Empleado</th><th>Departamento</th><th>Cargo</th>
            <th>Entradas</th><th>Salidas</th><th>Horas</th><th>Último Acceso</th><th>Estado</th>
        </tr></thead>
        <tbody>${rows.map(s => {
            const isPresent = state.presentSet.has(s.emp.id);
            return `<tr>
                <td><div class="emp-cell">
                    <div class="emp-mini-avatar">${s.emp.avatar || s.emp.firstName[0]}</div>
                    <div><div class="emp-mini-name">${s.emp.firstName} ${s.emp.lastName}</div>
                    <div class="emp-mini-num">${s.emp.empNum}</div></div>
                </div></td>
                <td>${s.emp.dept}</td>
                <td style="font-size:0.82rem;color:var(--text-muted)">${s.emp.role || '—'}</td>
                <td><span style="color:var(--green);font-weight:700">${s.entries}</span></td>
                <td><span style="color:var(--orange);font-weight:700">${s.exits}</span></td>
                <td><span class="token-mono">${s.hours.toFixed(1)}h</span></td>
                <td><span class="token-mono" style="font-size:0.75rem">${s.lastAccess ? formatDateTime(s.lastAccess) : 'Nunca'}</span></td>
                <td><span class="status-chip ${isPresent ? 'status-active' : 'status-inactive'}">${isPresent ? '● Presente' : '○ Ausente'}</span></td>
            </tr>`;
        }).join('')}</tbody>
    </table></div>`;
}

function exportReportExcel() {
    if (!state.employees.length) { showToast('⚠️ No hay datos para exportar', 'warning'); return; }
    const wb = XLSX.utils.book_new();

    // Hoja 1: Resumen de empleados
    const empStats = {};
    state.employees.forEach(e => { empStats[e.id] = { emp: e, hours: 0, entries: 0, exits: 0 }; });
    const entryMap = {};
    [...state.logs].sort((a,b) => new Date(a.ts) - new Date(b.ts)).forEach(l => {
        if (!empStats[l.empId]) return;
        if (l.type === 'entry') { entryMap[l.empId] = new Date(l.ts); empStats[l.empId].entries++; }
        else if (l.type === 'exit') {
            empStats[l.empId].exits++;
            if (entryMap[l.empId]) { empStats[l.empId].hours += (new Date(l.ts) - entryMap[l.empId]) / 3600000; delete entryMap[l.empId]; }
        }
    });
    const empData = Object.values(empStats).map(s => ({
        'ID': s.emp.empNum, 'Nombre': `${s.emp.firstName} ${s.emp.lastName}`,
        'Departamento': s.emp.dept, 'Cargo': s.emp.role || '',
        'Email': s.emp.email || '', 'Teléfono': s.emp.phone || '',
        'Estado': s.emp.status === 'active' ? 'Activo' : 'Inactivo',
        'Presente Ahora': state.presentSet.has(s.emp.id) ? 'Sí' : 'No',
        'Entradas': s.entries, 'Salidas': s.exits,
        'Horas Trabajadas': s.hours.toFixed(2),
        'Último Acceso': s.emp.lastAccess ? new Date(s.emp.lastAccess).toLocaleString('es-MX') : 'Nunca'
    }));
    const ws1 = XLSX.utils.json_to_sheet(empData);
    ws1['!cols'] = [{ wch: 10 }, { wch: 25 }, { wch: 15 }, { wch: 20 }, { wch: 25 }, { wch: 15 }, { wch: 10 }, { wch: 12 }, { wch: 10 }, { wch: 10 }, { wch: 15 }, { wch: 20 }];
    XLSX.utils.book_append_sheet(wb, ws1, 'Empleados');

    // Hoja 2: Registro de accesos
    const logData = state.logs.map((l, i) => ({
        '#': i + 1, 'Empleado': l.empName,
        'Tipo': l.type === 'entry' ? 'Entrada' : l.type === 'exit' ? 'Salida' : 'Rechazado',
        'Fecha': l.ts.split('T')[0], 'Hora': l.ts.split('T')[1]?.slice(0, 8),
        'Estado': l.status === 'valid' ? 'Válido' : 'Rechazado',
        'Motivo': l.reason || '', 'Fuente': l.source || 'qr'
    }));
    const ws2 = XLSX.utils.json_to_sheet(logData);
    ws2['!cols'] = [{ wch: 5 }, { wch: 25 }, { wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 12 }, { wch: 35 }, { wch: 10 }];
    XLSX.utils.book_append_sheet(wb, ws2, 'Registro de Accesos');

    // Hoja 3: Resumen por departamento
    const deptData = {};
    state.employees.filter(e => e.status === 'active').forEach(e => {
        if (!deptData[e.dept]) deptData[e.dept] = { dept: e.dept, total: 0, presentes: 0 };
        deptData[e.dept].total++;
        if (state.presentSet.has(e.id)) deptData[e.dept].presentes++;
    });
    const ws3 = XLSX.utils.json_to_sheet(Object.values(deptData).map(d => ({
        'Departamento': d.dept, 'Total Empleados': d.total,
        'Presentes Ahora': d.presentes, 'Ausentes': d.total - d.presentes,
        'Tasa Asistencia': `${Math.round(d.presentes / d.total * 100)}%`
    })));
    XLSX.utils.book_append_sheet(wb, ws3, 'Por Departamento');

    const today = new Date().toLocaleDateString('es-MX').replace(/\//g, '-');
    XLSX.writeFile(wb, `Reporte_Asistencia_${today}.xlsx`);
    showToast('📊 Reporte Excel generado y descargado', 'success');
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

/* ============================================================
   LOCATION MODULE — Mapa de Ubicación en Tiempo Real
   ============================================================ */

let _locationMap = null;
let _locationMarkers = {};
let _locationRefreshTimer = null;

function initLocationMap() {
    if (typeof L === 'undefined') {
        const el = document.getElementById('locationMap');
        if (el) el.innerHTML = '<div class="loc-empty-msg" style="position:relative;height:400px;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:8px;"><span>⚠️ No se pudo cargar el mapa</span><span style="font-size:0.8rem;opacity:0.6;">Verifica tu conexión a internet</span></div>';
        return;
    }
    if (!_locationMap) {
        _locationMap = L.map('locationMap').setView([19.4326, -99.1332], 12);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors', maxZoom: 19
        }).addTo(_locationMap);
    }
    refreshLocationMap();
}

let _locationHistory = []; // Historial persistente de ubicaciones

async function refreshLocationMap() {
    try {
        const res = await fetch('/api/location/records');
        if (!res.ok) return;
        const records = await res.json();
        
        // Guardar en historial persistente (evitar duplicados por ID)
        records.forEach(rec => {
            const exists = _locationHistory.some(h => h.id === rec.id);
            if (!exists) _locationHistory.push(rec);
        });
        
        renderLocationPanel(records);
        if (!_locationMap) return;
        
        // Siempre mostrar el mapa normalmente
        document.getElementById('locEmptyMsg').style.display = _locationHistory.length ? 'none' : 'flex';
        document.getElementById('locationMap').style.opacity = '1';
        
        // Limpiar solo si es la primera carga o hay cambios significativos
        const currentIds = Object.keys(_locationMarkers);
        const newIds = _locationHistory.map(r => r.id);
        
        // Actualizar marcadores: remover los que ya no existen, actualizar existentes, agregar nuevos
        currentIds.forEach(id => {
            if (!newIds.includes(id)) {
                _locationMap.removeLayer(_locationMarkers[id]);
                delete _locationMarkers[id];
            }
        });
        
        const bounds = [];
        _locationHistory.forEach(rec => {
            const emp = state.employees.find(e => e.id === rec.empId);
            const typeLabel = rec.type === 'entry' ? '🟢 ENTRADA' : '🔴 SALIDA';
            const typeColor = rec.type === 'entry' ? '#10b981' : '#f43f5e';
            const time = new Date(rec.timestamp).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
            const date = new Date(rec.timestamp).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
            const accuracyLabel = rec.accuracy < 50 ? '📍 Alta' : rec.accuracy < 200 ? '📍 Media' : '📍 Baja';
            
            // Crear icono con número si es entrada
            const iconHtml = rec.type === 'entry' 
                ? `<div style="background:${typeColor};width:36px;height:36px;border-radius:50%;border:3px solid #fff;display:flex;align-items:center;justify-content:center;font-size:16px;box-shadow:0 3px 10px rgba(0,0,0,0.4);cursor:pointer">${emp?.avatar || '👤'}</div>`
                : `<div style="background:${typeColor};width:36px;height:36px;border-radius:50%;border:3px solid #fff;display:flex;align-items:center;justify-content:center;font-size:16px;box-shadow:0 3px 10px rgba(0,0,0,0.4);cursor:pointer">${emp?.avatar || '👤'}</div>`;
            
            const icon = L.divIcon({
                html: iconHtml,
                className: 'location-marker', 
                iconSize: [36, 36], 
                iconAnchor: [18, 18]
            });
            
            // Popup mejorado con más información
            // Popup simple inicial (se actualizará al hacer clic)
            const popupContent = `
                <div style="min-width:200px;font-family:Outfit,sans-serif;padding:8px;text-align:center">
                    <div style="font-size:24px;margin-bottom:4px">${emp?.avatar || '👤'}</div>
                    <div style="font-weight:700;font-size:1.1em">${rec.empName}</div>
                    <div style="color:#64748b;font-size:0.85em;margin-bottom:8px">${rec.dept || '—'}</div>
                    <div style="color:${typeColor};font-weight:600">${typeLabel} · ${time}</div>
                    <div style="font-size:0.8em;color:#94a3b8;margin-top:4px">Haz clic para ver detalles</div>
                </div>
            `;
            
            // Si el marcador ya existe, actualizarlo; si no, crearlo
            if (_locationMarkers[rec.id]) {
                _locationMarkers[rec.id].setLatLng([rec.lat, rec.lng]);
                _locationMarkers[rec.id].setIcon(icon);
                _locationMarkers[rec.id].setPopupContent(popupContent);
            } else {
                const marker = L.marker([rec.lat, rec.lng], { icon })
                    .addTo(_locationMap)
                    .bindPopup(popupContent)
                    .on('click', () => showEmployeeLocationPopup(rec.empId));
                _locationMarkers[rec.id] = marker;
            }
            bounds.push([rec.lat, rec.lng]);
        });
        if (bounds.length) _locationMap.fitBounds(bounds, { padding: [40, 40] });
    } catch (e) {
        console.warn('Error refreshing location map:', e.message);
    }
}

function renderLocationPanel(records) {
    const today = new Date().toDateString();
    const todayEmpIds = new Set(
        records.filter(r => new Date(r.timestamp).toDateString() === today).map(r => r.empId)
    );
    document.getElementById('locDayCount').textContent = todayEmpIds.size;
    
    // Agrupar registros por empleado y tipo (entrada/salida)
    const empRecords = {};
    records.forEach(rec => {
        if (!empRecords[rec.empId]) {
            empRecords[rec.empId] = { entry: null, exit: null, empName: rec.empName, dept: rec.dept };
        }
        if (rec.type === 'entry') {
            // Mantener la entrada más reciente
            if (!empRecords[rec.empId].entry || new Date(rec.timestamp) > new Date(empRecords[rec.empId].entry.timestamp)) {
                empRecords[rec.empId].entry = rec;
            }
        } else if (rec.type === 'exit') {
            // Mantener la salida más reciente
            if (!empRecords[rec.empId].exit || new Date(rec.timestamp) > new Date(empRecords[rec.empId].exit.timestamp)) {
                empRecords[rec.empId].exit = rec;
            }
        }
    });
    
    // Convertir a array y ordenar por timestamp más reciente
    const sortedEmps = Object.values(empRecords).sort((a, b) => {
        const aTime = a.exit?.timestamp || a.entry?.timestamp || 0;
        const bTime = b.exit?.timestamp || b.entry?.timestamp || 0;
        return new Date(bTime) - new Date(aTime);
    });
    
    const locList = document.getElementById('locList');
    if (!sortedEmps.length) {
        locList.innerHTML = '<div class="empty-feed">No hay ubicaciones registradas aún.</div>';
    } else {
        locList.innerHTML = sortedEmps.map(empData => {
            const emp = state.employees.find(e => e.id === Object.keys(empRecords).find(k => empRecords[k] === empData));
            const entry = empData.entry;
            const exit = empData.exit;
            
            const entryTime = entry ? new Date(entry.timestamp).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }) : null;
            const exitTime = exit ? new Date(exit.timestamp).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }) : null;
            
            // Determinar el estado del empleado
            let statusHtml = '';
            if (entry && exit) {
                statusHtml = `<span style="color:#10b981;font-size:0.85em">✅ Completado</span>`;
            } else if (entry && !exit) {
                statusHtml = `<span style="color:#f59e0b;font-size:0.85em">🟡 En jornada</span>`;
            } else if (!entry && exit) {
                statusHtml = `<span style="color:#ef4444;font-size:0.85em">⚠️ Solo salida</span>`;
            }
            
            // Construir info de entrada y salida
            let timesHtml = '';
            if (entryTime) {
                timesHtml += `<span style="color:#10b981">🟢 Entrada: ${entryTime}</span>`;
            }
            if (exitTime) {
                if (timesHtml) timesHtml += ' · ';
                timesHtml += `<span style="color:#f43f5e">🔴 Salida: ${exitTime}</span>`;
            }
            
            const empId = Object.keys(empRecords).find(k => empRecords[k] === empData);
            
            return `<div class="loc-item" onclick="focusLocationMarker('${empId}')">
                <div class="loc-item-avatar">${emp?.avatar || empData.empName?.[0] || '👤'}</div>
                <div class="loc-item-body" style="flex:1">
                    <div class="loc-item-name">${empData.empName}</div>
                    <div class="loc-item-meta">${empData.dept || '—'}</div>
                    <div style="font-size:0.8em;margin-top:4px">${timesHtml}</div>
                </div>
                <div style="text-align:right">
                    ${statusHtml}
                </div>
            </div>`;
        }).join('');
    }
    // Empleados sin ubicación
    const withLocation = new Set(records.map(r => r.empId));
    const noLocation = state.employees.filter(e => e.status === 'active' && !withLocation.has(e.id));
    const noLocList = document.getElementById('locNoLocationList');
    noLocList.innerHTML = noLocation.length
        ? noLocation.map(e => `<div class="loc-no-location-item"><span>${e.avatar || '👤'}</span><span>${e.firstName} ${e.lastName} <small>(${e.dept})</small></span></div>`).join('')
        : '<div style="font-size:0.8rem;color:var(--text-muted);padding:8px 0">Todos los empleados activos compartieron ubicación.</div>';
}

function showEmployeeLocationPopup(empId) {
    const emp = state.employees.find(e => e.id === empId);
    const empRecords = _locationHistory.filter(r => r.empId === empId);
    
    if (!empRecords.length) {
        showToast('❌ No hay ubicaciones registradas para este empleado', 'error');
        return;
    }
    
    // Buscar entrada y salida más recientes
    const entry = empRecords.filter(r => r.type === 'entry').sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))[0];
    const exit = empRecords.filter(r => r.type === 'exit').sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))[0];
    
    const empName = emp ? `${emp.firstName} ${emp.lastName}` : (entry?.empName || exit?.empName || 'Empleado');
    const dept = emp?.dept || entry?.dept || exit?.dept || '—';
    
    // Formatear tiempos
    const formatTime = (rec) => {
        if (!rec) return null;
        const date = new Date(rec.timestamp);
        return {
            date: date.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }),
            time: date.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
            accuracy: rec.accuracy ? Math.round(rec.accuracy) + 'm' : '—'
        };
    };
    
    const entryData = formatTime(entry);
    const exitData = formatTime(exit);
    
    // Construir HTML del popup
    let popupHtml = `
        <div style="min-width:260px;font-family:Outfit,sans-serif;padding:8px">
            <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px;border-bottom:2px solid #6366f1;padding-bottom:10px">
                <span style="font-size:32px">${emp?.avatar || '👤'}</span>
                <div>
                    <div style="font-weight:700;font-size:1.15em;color:#1e293b">${empName}</div>
                    <div style="color:#64748b;font-size:0.9em">${dept}</div>
                </div>
            </div>
    `;
    
    // Sección de Entrada
    if (entryData) {
        popupHtml += `
            <div style="background:#ecfdf5;border-radius:8px;padding:12px;margin-bottom:10px;border-left:4px solid #10b981">
                <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
                    <span style="font-size:18px">🟢</span>
                    <span style="font-weight:700;color:#10b981;font-size:1em">ENTRADA</span>
                </div>
                <div style="display:grid;grid-template-columns:auto 1fr;gap:5px 15px;font-size:0.9em">
                    <span style="color:#6b7280">📅 Fecha:</span>
                    <span style="font-weight:600">${entryData.date}</span>
                    <span style="color:#6b7280">🕐 Hora:</span>
                    <span style="font-weight:600">${entryData.time}</span>
                    <span style="color:#6b7280">🎯 Precisión:</span>
                    <span style="font-weight:600">${entryData.accuracy}</span>
                </div>
            </div>
        `;
    }
    
    // Sección de Salida
    if (exitData) {
        popupHtml += `
            <div style="background:#fff1f2;border-radius:8px;padding:12px;margin-bottom:10px;border-left:4px solid #f43f5e">
                <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
                    <span style="font-size:18px">🔴</span>
                    <span style="font-weight:700;color:#f43f5e;font-size:1em">SALIDA</span>
                </div>
                <div style="display:grid;grid-template-columns:auto 1fr;gap:5px 15px;font-size:0.9em">
                    <span style="color:#6b7280">📅 Fecha:</span>
                    <span style="font-weight:600">${exitData.date}</span>
                    <span style="color:#6b7280">🕐 Hora:</span>
                    <span style="font-weight:600">${exitData.time}</span>
                    <span style="color:#6b7280">🎯 Precisión:</span>
                    <span style="font-weight:600">${exitData.accuracy}</span>
                </div>
            </div>
        `;
    }
    
    // Estado de la jornada
    let statusHtml = '';
    if (entryData && exitData) {
        statusHtml = `<span style="color:#10b981;font-weight:600">✅ Jornada Completada</span>`;
    } else if (entryData && !exitData) {
        statusHtml = `<span style="color:#f59e0b;font-weight:600">🟡 En Jornada</span>`;
    } else if (!entryData && exitData) {
        statusHtml = `<span style="color:#ef4444;font-weight:600">⚠️ Solo Salida Registrada</span>`;
    }
    
    popupHtml += `
            <div style="background:#f8fafc;border-radius:6px;padding:10px;text-align:center;margin-bottom:12px">
                ${statusHtml}
            </div>
    `;
    
    // Botones de acción
    const latestRec = entry || exit;
    if (latestRec && latestRec.lat && latestRec.lng) {
        popupHtml += `
            <div style="display:flex;gap:8px">
                <a href="https://www.google.com/maps?q=${latestRec.lat},${latestRec.lng}" target="_blank" style="flex:1;background:#6366f1;color:#fff;text-decoration:none;padding:10px 12px;border-radius:6px;text-align:center;font-size:0.85em;font-weight:600">
                    🗺️ Google Maps
                </a>
            </div>
        `;
    }
    
    popupHtml += `</div>`;
    
    // Encontrar el marcador más reciente y mostrar popup
    const latestRecord = empRecords.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))[0];
    const marker = _locationMarkers[latestRecord.id];
    
    if (marker) {
        marker.setPopupContent(popupHtml);
        marker.openPopup();
        _locationMap.setView(marker.getLatLng(), 16);
    } else {
        // Crear popup en las coordenadas
        const popup = L.popup({ maxWidth: 300 })
            .setLatLng([latestRecord.lat, latestRecord.lng])
            .setContent(popupHtml)
            .openOn(_locationMap);
    }
}

function focusLocationMarker(empId) {
    if (!_locationMap) return;
    
    // Buscar el registro más reciente del empleado en el historial
    const empRecords = _locationHistory.filter(r => r.empId === empId);
    if (!empRecords.length) {
        showToast('❌ No hay ubicaciones registradas para este empleado', 'error');
        return;
    }
    
    // Mostrar popup completo con entrada y salida
    showEmployeeLocationPopup(empId);
}

function startLocationAutoRefresh() {
    if (_locationRefreshTimer) return;
    _locationRefreshTimer = setInterval(refreshLocationMap, 30000);
}

function stopLocationAutoRefresh() {
    if (_locationRefreshTimer) { clearInterval(_locationRefreshTimer); _locationRefreshTimer = null; }
}

async function clearLocationHistory() {
    if (!confirm('¿Estás seguro de que deseas eliminar todo el historial de ubicaciones? Esta acción no se puede deshacer.')) return;
    try {
        const res = await fetch('/api/location/records', { method: 'DELETE' });
        if (!res.ok) throw new Error('Error del servidor');
        const data = await res.json();
        showToast(`🗑 ${data.deleted} registros eliminados`, 'success');
        refreshLocationMap();
    } catch (e) {
        showToast('❌ Error al limpiar: ' + e.message, 'error');
    }
}

/* ============================================================
   MÓDULO DE RRHH — Solicitudes de Empleo y Planillas
   ============================================================ */

let currentHRTab = 'applications';
let currentPayroll = null;

// Agregar 'hr' a pageTitles
pageTitles.hr = ['Recursos Humanos', 'Gestión de solicitudes y planillas'];

// Mostrar tabs de RRHH
function showHRTab(tab) {
    currentHRTab = tab;
    document.querySelectorAll('.hr-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.hr-tab-content').forEach(c => c.classList.remove('active'));
    const tabOrder = ['applications','contracts','confidentiality','documents','permissions','certificates','payroll'];
    const idx = tabOrder.indexOf(tab);
    const tabBtn = document.querySelector(`.hr-tab:nth-child(${idx + 1})`);
    if (tabBtn) tabBtn.classList.add('active');
    const tabContent = document.getElementById(`hr-tab-${tab}`);
    if (tabContent) tabContent.classList.add('active');

    if (tab === 'applications') loadApplications();
    else if (tab === 'payroll') loadPayrolls();
    else if (tab === 'contracts') loadContracts();
    else if (tab === 'confidentiality') loadConfidentiality();
    else if (tab === 'documents') loadDocuments();
    else if (tab === 'permissions') loadPermissions();
    else if (tab === 'certificates') loadCertificates();
    // Populate employee selects for new tabs
    populateHREmpSelects();
}

// ========== SOLICITUDES DE EMPLEO ==========

async function loadApplications() {
    try {
        const res = await fetch('/api/hr/applications');
        if (!res.ok) throw new Error('Error cargando solicitudes');
        const applications = await res.json();
        renderApplicationsTable(applications);
    } catch (e) {
        showToast('❌ Error: ' + e.message, 'error');
    }
}

function renderApplicationsTable(applications) {
    const tbody = document.getElementById('applicationsTableBody');
    if (!applications.length) {
        tbody.innerHTML = '<tr><td colspan="6" class="empty-feed">No hay solicitudes registradas</td></tr>';
        return;
    }
    
    tbody.innerHTML = applications.map(app => {
        const statusClass = app.status === 'approved' ? 'status-active' : app.status === 'rejected' ? 'status-inactive' : '';
        const statusLabel = app.status === 'approved' ? '✓ Aprobada' : app.status === 'rejected' ? '✗ Rechazada' : '⏳ Pendiente';
        const fullName = `${app.personalInfo?.firstName || ''} ${app.personalInfo?.lastName || ''}`;
        return `<tr>
            <td>${fullName}</td>
            <td><span class="token-mono">${app.personalInfo?.dui || '—'}</span></td>
            <td>${app.personalInfo?.phone || '—'}</td>
            <td><span class="status-chip ${statusClass}">${statusLabel}</span></td>
            <td><span class="token-mono">${formatDateTime(app.createdAt)}</span></td>
            <td>
                <div class="action-btns">
                    <button class="btn-table edit" onclick="viewApplication('${app.id}')">👁 Ver</button>
                    <button class="btn-table del" onclick="deleteApplication('${app.id}')">🗑</button>
                </div>
            </td>
        </tr>`;
    }).join('');
}

function openApplicationModal(app = null) {
    document.getElementById('appModalTitle').textContent = app ? 'Ver Solicitud de Empleo' : 'Nueva Solicitud de Empleo';
    document.getElementById('appId').value = app?.id || '';
    
    // Limpiar formulario
    if (!app) {
        document.querySelectorAll('#appModal input, #appModal textarea, #appModal select').forEach(el => {
            if (el.type === 'checkbox') el.checked = false;
            else el.value = '';
        });
    } else {
        // Llenar con datos existentes
        document.getElementById('appFirstName').value = app.personalInfo?.firstName || '';
        document.getElementById('appLastName').value = app.personalInfo?.lastName || '';
        document.getElementById('appDUI').value = app.personalInfo?.dui || '';
        document.getElementById('appNIT').value = app.personalInfo?.nit || '';
        document.getElementById('appISSS').value = app.personalInfo?.isss || '';
        document.getElementById('appAFP').value = app.personalInfo?.afp || '';
        document.getElementById('appBirthDate').value = app.personalInfo?.birthDate || '';
        document.getElementById('appBirthPlace').value = app.personalInfo?.birthPlace || '';
        document.getElementById('appAddress').value = app.personalInfo?.address || '';
        document.getElementById('appPhone').value = app.personalInfo?.phone || '';
        document.getElementById('appEmail').value = app.personalInfo?.email || '';
        document.getElementById('appMaritalStatus').value = app.personalInfo?.maritalStatus || '';
        document.getElementById('appProfession').value = app.personalInfo?.profession || '';
        
        document.getElementById('appFatherName').value = app.family?.fatherName || '';
        document.getElementById('appMotherName').value = app.family?.motherName || '';
        document.getElementById('appSpouseName').value = app.family?.spouseName || '';
        document.getElementById('appChildren').value = app.family?.children?.map(c => `${c.name} ${c.age}`).join(', ') || '';
    }
    
    document.getElementById('appModalOverlay').classList.add('active');
    document.getElementById('appModal').classList.add('active');
}

function closeApplicationModal() {
    document.getElementById('appModalOverlay').classList.remove('active');
    document.getElementById('appModal').classList.remove('active');
}

async function saveApplication() {
    // Recopilar datos del formulario
    const personalReferences = [];
    document.querySelectorAll('#personalRefsContainer .ref-item').forEach(item => {
        const name = item.querySelector('.personal-ref-name').value;
        if (name) {
            personalReferences.push({
                name,
                phone: item.querySelector('.personal-ref-phone').value,
                address: item.querySelector('.personal-ref-address').value,
                occupation: item.querySelector('.personal-ref-occupation').value
            });
        }
    });
    
    const workReferences = [];
    document.querySelectorAll('#workRefsContainer .ref-item').forEach(item => {
        const company = item.querySelector('.work-ref-company').value;
        if (company) {
            workReferences.push({
                company,
                position: item.querySelector('.work-ref-position').value,
                period: item.querySelector('.work-ref-period').value,
                phone: item.querySelector('.work-ref-phone').value,
                address: item.querySelector('.work-ref-address').value
            });
        }
    });
    
    // Parsear hijos
    const childrenText = document.getElementById('appChildren').value;
    const children = childrenText ? childrenText.split(',').map(c => {
        const parts = c.trim().split(' ');
        const age = parseInt(parts[parts.length - 1]);
        const name = parts.slice(0, -1).join(' ');
        return { name, age: isNaN(age) ? 0 : age };
    }) : [];
    
    const application = {
        personalInfo: {
            firstName: document.getElementById('appFirstName').value,
            lastName: document.getElementById('appLastName').value,
            dui: document.getElementById('appDUI').value,
            nit: document.getElementById('appNIT').value,
            isss: document.getElementById('appISSS').value,
            afp: document.getElementById('appAFP').value,
            birthDate: document.getElementById('appBirthDate').value,
            birthPlace: document.getElementById('appBirthPlace').value,
            address: document.getElementById('appAddress').value,
            phone: document.getElementById('appPhone').value,
            email: document.getElementById('appEmail').value,
            maritalStatus: document.getElementById('appMaritalStatus').value,
            profession: document.getElementById('appProfession').value
        },
        family: {
            fatherName: document.getElementById('appFatherName').value,
            motherName: document.getElementById('appMotherName').value,
            spouseName: document.getElementById('appSpouseName').value,
            children
        },
        personalReferences,
        workReferences,
        education: [],
        workExperience: [],
        status: 'pending'
    };
    
    // Validar campos requeridos
    if (!application.personalInfo.firstName || !application.personalInfo.lastName || 
        !application.personalInfo.dui || !application.personalInfo.address || !application.personalInfo.phone) {
        showToast('⚠️ Completa los campos obligatorios', 'warning');
        return;
    }
    
    try {
        const appId = document.getElementById('appId').value;
        const url = appId ? `/api/hr/applications/${appId}` : '/api/hr/applications';
        const method = appId ? 'PUT' : 'POST';
        
        const res = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(application)
        });
        
        if (!res.ok) throw new Error('Error guardando solicitud');
        
        showToast('✅ Solicitud guardada exitosamente', 'success');
        closeApplicationModal();
        loadApplications();
    } catch (e) {
        showToast('❌ Error: ' + e.message, 'error');
    }
}

async function viewApplication(id) {
    try {
        const res = await fetch('/api/hr/applications');
        if (!res.ok) throw new Error('Error cargando solicitud');
        const applications = await res.json();
        const app = applications.find(a => a.id === id);
        if (app) openApplicationModal(app);
    } catch (e) {
        showToast('❌ Error: ' + e.message, 'error');
    }
}

async function deleteApplication(id) {
    if (!confirm('¿Estás seguro de eliminar esta solicitud?')) return;
    
    try {
        const res = await fetch(`/api/hr/applications/${id}`, { method: 'DELETE' });
        if (!res.ok) throw new Error('Error eliminando solicitud');
        
        showToast('🗑 Solicitud eliminada', 'warning');
        loadApplications();
    } catch (e) {
        showToast('❌ Error: ' + e.message, 'error');
    }
}

// ========== PLANILLAS DE SUELDOS ==========

async function loadPayrolls() {
    try {
        const res = await fetch('/api/hr/payrolls');
        if (!res.ok) throw new Error('Error cargando planillas');
        const payrolls = await res.json();
        renderPayrollHistory(payrolls);
    } catch (e) {
        showToast('❌ Error: ' + e.message, 'error');
    }
}

function renderPayrollHistory(payrolls) {
    const tbody = document.getElementById('payrollHistoryBody');
    if (!payrolls.length) {
        tbody.innerHTML = '<tr><td colspan="7" class="empty-feed">No hay planillas generadas</td></tr>';
        return;
    }
    
    const sorted = [...payrolls].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    
    tbody.innerHTML = sorted.map(p => {
        const monthNames = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
        const period = `${monthNames[(p.month || 1) - 1]} ${p.year || new Date().getFullYear()}`;
        const totals = p.totals || {};
        return `<tr>
            <td><strong>${period}</strong></td>
            <td>${(p.employees || []).length}</td>
            <td>$${(totals.totalSalary || 0).toFixed(2)}</td>
            <td>$${(totals.totalDeductions || 0).toFixed(2)}</td>
            <td><strong>$${(totals.totalNetPay || 0).toFixed(2)}</strong></td>
            <td><span class="token-mono">${formatDateTime(p.createdAt)}</span></td>
            <td>
                <div class="action-btns">
                    <button class="btn-table edit" onclick="viewPayroll('${p.id}')">👁 Ver</button>
                    <button class="btn-table qr" onclick="exportPayrollExcelById('${p.id}')">📥 Excel</button>
                    <button class="btn-table del" onclick="deletePayroll('${p.id}')">🗑</button>
                </div>
            </td>
        </tr>`;
    }).join('');
}

function onPayrollTypeChange() {
    const type = document.getElementById('payrollType').value;
    document.getElementById('biweeklyOptions').style.display = type === 'biweekly' ? 'flex' : 'none';
    document.getElementById('weeklyOptions').style.display = type === 'weekly' ? 'flex' : 'none';
}

async function generatePayroll() {
    const type = document.getElementById('payrollType').value;
    const month = parseInt(document.getElementById('payrollMonth').value);
    const year = parseInt(document.getElementById('payrollYear').value);
    
    if (!month || !year) {
        showToast('⚠️ Selecciona mes y año', 'warning');
        return;
    }
    
    // Construir el cuerpo de la petición según el tipo
    let requestBody = { month, year };
    let endpoint = '/api/hr/payrolls/generate';
    
    if (type === 'biweekly') {
        const periodNumber = parseInt(document.getElementById('payrollPeriodNumber').value);
        requestBody.periodNumber = periodNumber;
        endpoint = '/api/hr/payrolls/generate/biweekly';
    } else if (type === 'weekly') {
        const weekNumber = parseInt(document.getElementById('payrollWeekNumber').value);
        requestBody.weekNumber = weekNumber;
        endpoint = '/api/hr/payrolls/generate/weekly';
    }
    
    try {
        const res = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody)
        });
        
        if (!res.ok) throw new Error('Error generando planilla');
        
        const data = await res.json();
        currentPayroll = data.payroll;
        
        showToast('✅ Planilla generada exitosamente', 'success');
        renderPayrollResult(data.payroll);
        loadPayrolls();
    } catch (e) {
        showToast('❌ Error: ' + e.message, 'error');
    }
}

function renderPayrollResult(payroll) {
    const monthNames = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    const period = `${monthNames[(payroll.month || 1) - 1]} ${payroll.year || new Date().getFullYear()}`;
    
    // Determinar el tipo de planilla y texto apropiado
    let payrollTypeText = 'MENSUAL';
    let salaryColumnHeader = 'SALARIO MENSUAL';
    let salaryField = 'monthlySalary';
    
    if (payroll.type === 'biweekly') {
        payrollTypeText = `QUINCENAL - ${payroll.periodNumber === 1 ? '1ra Quincena (1-15)' : '2da Quincena (16-fin de mes)'}`;
        salaryColumnHeader = 'SALARIO QUINCENAL';
        salaryField = 'biweeklySalary';
    } else if (payroll.type === 'weekly') {
        payrollTypeText = `SEMANAL - Semana ${payroll.weekNumber || 1}`;
        salaryColumnHeader = 'SALARIO SEMANAL';
        salaryField = 'weeklySalary';
    }
    
    const totals = payroll.totals || {};
    const employees = payroll.employees || [];
    
    const html = `
        <div style="text-align:center;margin-bottom:20px;">
            <h3>${state.adminConfig.company}</h3>
            <h4>PLANILLA DE SUELDOS ${payrollTypeText}</h4>
            <p>Período: ${period}</p>
            ${payroll.startDate && payroll.endDate ? `<p>Fechas: ${payroll.startDate} al ${payroll.endDate}</p>` : ''}
        </div>
        <div class="table-wrap">
            <table class="data-table">
                <thead>
                    <tr>
                        <th>N°</th>
                        <th>NOMBRE COMPLETO</th>
                        <th>DÍAS TRAB.</th>
                        <th>${salaryColumnHeader}</th>
                        <th>ISSS (3%)</th>
                        <th>AFP (7.25%)</th>
                        <th>RENTA</th>
                        <th>TOTAL DEDUCC.</th>
                        <th>LÍQUIDO</th>
                    </tr>
                </thead>
                <tbody>
                    ${employees.map((emp, i) => `
                        <tr>
                            <td>${i + 1}</td>
                            <td>${emp.fullName || 'Sin nombre'}</td>
                            <td>${emp.workedDays || 0}</td>
                            <td>$${((emp[salaryField] || emp.monthlySalary || 0)).toFixed(2)}</td>
                            <td>$${(emp.isss || 0).toFixed(2)}</td>
                            <td>$${(emp.afp || 0).toFixed(2)}</td>
                            <td>$${(emp.renta || 0).toFixed(2)}</td>
                            <td>$${(emp.totalDeductions || 0).toFixed(2)}</td>
                            <td><strong>$${(emp.netPay || 0).toFixed(2)}</strong></td>
                        </tr>
                    `).join('')}
                    <tr style="background:var(--surface2);font-weight:700;">
                        <td colspan="3">TOTALES</td>
                        <td>$${(totals.totalSalary || 0).toFixed(2)}</td>
                        <td>$${(totals.totalISS || 0).toFixed(2)}</td>
                        <td>$${(totals.totalAFP || 0).toFixed(2)}</td>
                        <td>$${(totals.totalRenta || 0).toFixed(2)}</td>
                        <td>$${(totals.totalDeductions || 0).toFixed(2)}</td>
                        <td>$${(totals.totalNetPay || 0).toFixed(2)}</td>
                    </tr>
                </tbody>
            </table>
        </div>
    `;
    
    document.getElementById('payrollResult').innerHTML = html;
    document.getElementById('payrollResultPanel').style.display = 'block';
}

async function viewPayroll(id) {
    try {
        const res = await fetch('/api/hr/payrolls');
        if (!res.ok) throw new Error('Error cargando planilla');
        const payrolls = await res.json();
        const payroll = payrolls.find(p => p.id === id);
        if (payroll) {
            currentPayroll = payroll;
            renderPayrollResult(payroll);
        }
    } catch (e) {
        showToast('❌ Error: ' + e.message, 'error');
    }
}

async function deletePayroll(id) {
    if (!confirm('¿Estás seguro de eliminar esta planilla?')) return;
    
    try {
        const res = await fetch(`/api/hr/payrolls/${id}`, { method: 'DELETE' });
        if (!res.ok) throw new Error('Error eliminando planilla');
        
        showToast('🗑 Planilla eliminada', 'warning');
        loadPayrolls();
        document.getElementById('payrollResultPanel').style.display = 'none';
    } catch (e) {
        showToast('❌ Error: ' + e.message, 'error');
    }
}

function exportPayrollExcel() {
    if (!currentPayroll) {
        showToast('⚠️ No hay planilla para exportar', 'warning');
        return;
    }
    exportPayrollToExcel(currentPayroll);
}

async function exportPayrollExcelById(id) {
    try {
        const res = await fetch('/api/hr/payrolls');
        if (!res.ok) throw new Error('Error cargando planilla');
        const payrolls = await res.json();
        const payroll = payrolls.find(p => p.id === id);
        if (payroll) exportPayrollToExcel(payroll);
    } catch (e) {
        showToast('❌ Error: ' + e.message, 'error');
    }
}

function exportPayrollToExcel(payroll) {
    const monthNames = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    const period = `${monthNames[(payroll.month || 1) - 1]}_${payroll.year || new Date().getFullYear()}`;
    const filename = `Planilla_${period}.xlsx`;
    
    const employees = payroll.employees || [];
    const totals = payroll.totals || {};
    
    // Preparar datos para Excel
    const data = employees.map((emp, i) => ({
        'N°': i + 1,
        'NOMBRE COMPLETO': emp.fullName || 'Sin nombre',
        'DÍAS TRABAJADOS': emp.workedDays || 0,
        'SALARIO MENSUAL': emp.monthlySalary || 0,
        'ISSS (3%)': emp.isss || 0,
        'AFP (7.25%)': emp.afp || 0,
        'RENTA': emp.renta || 0,
        'TOTAL DEDUCCIONES': emp.totalDeductions || 0,
        'LÍQUIDO A RECIBIR': emp.netPay || 0
    }));
    
    // Agregar fila de totales
    data.push({
        'N°': '',
        'NOMBRE COMPLETO': '',
        'DÍAS TRABAJADOS': 'TOTALES',
        'SALARIO MENSUAL': totals.totalSalary || 0,
        'ISSS (3%)': totals.totalISS || 0,
        'AFP (7.25%)': totals.totalAFP || 0,
        'RENTA': totals.totalRenta || 0,
        'TOTAL DEDUCCIONES': totals.totalDeductions || 0,
        'LÍQUIDO A RECIBIR': totals.totalNetPay || 0
    });
    
    // Crear libro y hoja
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    
    // Ajustar anchos de columna
    ws['!cols'] = [
        { wch: 5 },  // N°
        { wch: 30 }, // NOMBRE
        { wch: 15 }, // DÍAS
        { wch: 15 }, // SALARIO
        { wch: 12 }, // ISSS
        { wch: 12 }, // AFP
        { wch: 12 }, // RENTA
        { wch: 18 }, // DEDUCCIONES
        { wch: 18 }  // LÍQUIDO
    ];
    
    XLSX.utils.book_append_sheet(wb, ws, 'Planilla');
    
    // Descargar
    XLSX.writeFile(wb, filename);
    showToast('📊 Excel generado y descargado', 'success');
}

// Funciones para exportar a formatos específicos
async function exportPayrollISSS() {
    if (!currentPayroll) {
        showToast('⚠️ No hay planilla para exportar', 'warning');
        return;
    }
    
    try {
        const res = await fetch(`/api/hr/payrolls/export/isss/${currentPayroll.id}`);
        if (!res.ok) throw new Error('Error generando formato ISSS');
        const data = await res.json();
        
        // Exportar a Excel con formato ISSS
        const filename = `ISSS_Planilla_${currentPayroll.month}_${currentPayroll.year}.xlsx`;
        const ws = XLSX.utils.json_to_sheet(data.data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'ISSS');
        XLSX.writeFile(wb, filename);
        showToast('🏥 Formato ISSS generado y descargado', 'success');
    } catch (e) {
        showToast('❌ Error: ' + e.message, 'error');
    }
}

async function exportPayrollCRECER() {
    if (!currentPayroll) {
        showToast('⚠️ No hay planilla para exportar', 'warning');
        return;
    }
    
    try {
        const res = await fetch(`/api/hr/payrolls/export/crecer/${currentPayroll.id}`);
        if (!res.ok) throw new Error('Error generando formato CRECER');
        const data = await res.json();
        
        // Exportar a Excel con formato CRECER
        const filename = `CRECER_Planilla_${currentPayroll.month}_${currentPayroll.year}.xlsx`;
        const ws = XLSX.utils.json_to_sheet(data.data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'CRECER');
        XLSX.writeFile(wb, filename);
        showToast('📋 Formato CRECER generado y descargado', 'success');
    } catch (e) {
        showToast('❌ Error: ' + e.message, 'error');
    }
}

// ========== DOCUMENTOS PERSONALES ==========

let currentDocFile = null;

// Variables para el estado de documentos
let currentDocument = null;
let currentDocuments = [];

function initDocuments() {
    populateDocEmployeeSelects();
    loadDocuments();
}

function populateDocEmployeeSelects() {
    const empSelect = document.getElementById('docEmpSelect');
    const filterSelect = document.getElementById('docFilterEmp');
    
    if (!empSelect || !filterSelect) return;
    
    const activeEmps = state.employees.filter(e => e.status === 'active');
    const options = activeEmps.map(e => `<option value="${e.id}">${e.firstName} ${e.lastName} (${e.empNum})</option>`).join('');
    
    empSelect.innerHTML = '<option value="">Seleccionar empleado...</option>' + options;
    filterSelect.innerHTML = '<option value="">Todos los empleados</option>' + options;
}

function handleDocDrop(event) {
    event.preventDefault();
    event.stopPropagation();
    
    const files = event.dataTransfer.files;
    if (files.length > 0) {
        currentDocFile = files[0];
        updateUploadZone();
    }
}

function handleDocFileSelect(event) {
    const files = event.target.files;
    if (files.length > 0) {
        currentDocFile = files[0];
        updateUploadZone();
    }
}

function updateUploadZone() {
    const zone = document.getElementById('uploadDropZone');
    if (!zone || !currentDocFile) return;
    
    zone.innerHTML = `
        <div class="upload-icon">✅</div>
        <p><strong>${currentDocFile.name}</strong></p>
        <p class="upload-hint">${formatFileSize(currentDocFile.size)} — Listo para subir</p>
        <button class="btn-text" onclick="clearDocSelection()" style="margin-top:8px;">Cambiar archivo</button>
    `;
}

function clearDocSelection() {
    currentDocFile = null;
    const zone = document.getElementById('uploadDropZone');
    if (zone) {
        zone.innerHTML = `
            <div class="upload-icon">📂</div>
            <p>Arrastra archivos aquí o haz clic para seleccionar</p>
            <p class="upload-hint">PDF, JPG, PNG, JPEG — Máx. 10MB</p>
            <input type="file" id="docFileInput" style="display:none" accept=".pdf,.jpg,.jpeg,.png" onchange="handleDocFileSelect(event)" />
        `;
    }
}

function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

async function uploadDocument() {
    const empId = document.getElementById('docEmpSelect')?.value;
    const docType = document.getElementById('docType')?.value;
    const description = document.getElementById('docDescription')?.value;
    
    if (!empId) {
        showToast('⚠️ Selecciona un empleado', 'warning');
        return;
    }
    
    if (!docType) {
        showToast('⚠️ Selecciona un tipo de documento', 'warning');
        return;
    }
    
    if (!currentDocFile) {
        showToast('⚠️ Selecciona un archivo', 'warning');
        return;
    }
    
    const emp = state.employees.find(e => e.id === empId);
    if (!emp) {
        showToast('❌ Empleado no encontrado', 'error');
        return;
    }
    
    try {
        const formData = new FormData();
        formData.append('document', currentDocFile);
        formData.append('empId', empId);
        formData.append('empName', `${emp.firstName} ${emp.lastName}`);
        formData.append('documentType', docType);
        formData.append('description', description || '');
        
        showToast('📤 Subiendo documento...', 'info');
        
        const res = await fetch('/api/hr/documents/upload', {
            method: 'POST',
            body: formData
        });
        
        if (!res.ok) {
            const error = await res.json();
            throw new Error(error.error || 'Error subiendo documento');
        }
        
        const data = await res.json();
        
        showToast('✅ Documento subido exitosamente', 'success');
        
        // Limpiar formulario
        document.getElementById('docEmpSelect').value = '';
        document.getElementById('docType').value = 'dui_front';
        document.getElementById('docDescription').value = '';
        clearDocSelection();
        
        // Recargar lista
        loadDocuments();
    } catch (e) {
        showToast('❌ Error: ' + e.message, 'error');
        console.error('Error subiendo documento:', e);
    }
}

async function loadDocuments() {
    try {
        const filterEmpId = document.getElementById('docFilterEmp')?.value;
        const url = filterEmpId ? `/api/hr/documents?empId=${filterEmpId}` : '/api/hr/documents';
        
        const res = await fetch(url);
        if (!res.ok) throw new Error('Error cargando documentos');
        
        const documents = await res.json();
        currentDocuments = documents;
        renderDocumentsTable(documents);
    } catch (e) {
        showToast('❌ Error cargando documentos: ' + e.message, 'error');
        console.error('Error cargando documentos:', e);
    }
}

function renderDocumentsTable(documents) {
    const tbody = document.getElementById('documentsTableBody');
    if (!tbody) return;
    
    if (!documents.length) {
        tbody.innerHTML = '<tr><td colspan="6" class="empty-feed">No hay documentos subidos</td></tr>';
        return;
    }
    
    const docTypeLabels = {
        dui_front: 'DUI (Frente)',
        dui_back: 'DUI (Reverso)',
        nit: 'NIT',
        photo: 'Foto del Empleado',
        certificate: 'Certificado de Estudios',
        recommendation: 'Carta de Recomendación',
        isss: 'Carnet ISSS',
        afp: 'Carnet AFP',
        other: 'Otro Documento'
    };
    
    tbody.innerHTML = documents.map(doc => {
        const emp = state.employees.find(e => e.id === doc.empId);
        const empName = emp ? `${emp.firstName} ${emp.lastName}` : (doc.empName || 'Desconocido');
        
        return `<tr>
            <td>${empName}</td>
            <td><span class="badge">${docTypeLabels[doc.documentType] || doc.documentType}</span></td>
            <td>${doc.fileName}</td>
            <td>${formatFileSize(doc.fileSize)}</td>
            <td>${formatDateTime(doc.uploadedAt)}</td>
            <td>
                <div class="action-btns">
                    <button class="btn-table edit" onclick="viewDocument('${doc.id}')">👁 Ver</button>
                    <button class="btn-table del" onclick="deleteDocument('${doc.id}')">🗑</button>
                </div>
            </td>
        </tr>`;
    }).join('');
}

async function viewDocument(docId) {
    const doc = currentDocuments.find(d => d.id === docId);
    if (!doc) {
        showToast('❌ Documento no encontrado', 'error');
        return;
    }
    
    // Abrir documento en nueva pestaña
    window.open(doc.filePath, '_blank');
}

async function deleteDocument(docId) {
    if (!confirm('¿Estás seguro de eliminar este documento?')) return;
    
    try {
        const res = await fetch(`/api/hr/documents/${docId}`, { method: 'DELETE' });
        if (!res.ok) throw new Error('Error eliminando documento');
        
        showToast('🗑 Documento eliminado', 'warning');
        loadDocuments();
    } catch (e) {
        showToast('❌ Error: ' + e.message, 'error');
    }
}

// ========== CONTRATOS LABORALES ==========

let currentContractFile = null;

function openContractModal() {
    // Limpiar formulario
    document.getElementById('contractEmpId').value = '';
    document.getElementById('contractDocType').value = 'contrato_laboral';
    document.getElementById('contractDescription').value = '';
    document.getElementById('contractFileName').textContent = '';
    currentContractFile = null;
    
    // Poblar select de empleados
    const select = document.getElementById('contractEmpId');
    select.innerHTML = '<option value="">Seleccionar empleado...</option>' +
        state.employees.filter(e => e.status === 'active').map(e => 
            `<option value="${e.id}">${e.firstName} ${e.lastName} (${e.empNum})</option>`
        ).join('');
    
    // Mostrar modal
    document.getElementById('contractModal').style.display = 'flex';
}

function closeContractModal() {
    document.getElementById('contractModal').style.display = 'none';
    currentContractFile = null;
}

// Manejar selección de archivo de contrato
document.addEventListener('DOMContentLoaded', () => {
    const fileInput = document.getElementById('contractFileInput');
    if (fileInput) {
        fileInput.addEventListener('change', (e) => {
            if (e.target.files && e.target.files[0]) {
                currentContractFile = e.target.files[0];
                document.getElementById('contractFileName').textContent = '📎 ' + e.target.files[0].name;
            }
        });
    }
});

async function saveContract() {
    const empId = document.getElementById('contractEmpId').value;
    const docType = document.getElementById('contractDocType').value;
    const description = document.getElementById('contractDescription').value.trim();
    
    // Validaciones
    if (!empId) { showToast('❌ Selecciona un empleado', 'error'); return; }
    if (!currentContractFile) { showToast('❌ Selecciona un archivo para subir', 'error'); return; }
    
    const emp = state.employees.find(e => e.id === empId);
    if (!emp) { showToast('❌ Empleado no encontrado', 'error'); return; }
    
    // Crear FormData para subir archivo
    const formData = new FormData();
    formData.append('empId', empId);
    formData.append('empName', `${emp.firstName} ${emp.lastName}`);
    formData.append('docType', docType);
    formData.append('description', description);
    formData.append('contractFile', currentContractFile);
    
    try {
        showToast('⬆️ Subiendo documento...', 'info');
        const res = await fetch('/api/hr/contracts', { method: 'POST', body: formData });
        if (!res.ok) throw new Error('Error subiendo documento');
        
        showToast('✅ Documento subido exitosamente', 'success');
        closeContractModal();
        loadContracts();
    } catch (e) {
        showToast('❌ Error: ' + e.message, 'error');
    }
}

async function loadContracts() {
    try {
        const res = await fetch('/api/hr/contracts');
        if (!res.ok) throw new Error('Error cargando contratos');
        const contracts = await res.json();
        renderContractsTable(contracts);
    } catch (e) {
        console.warn('Error cargando contratos:', e);
        // Si hay error, mostrar tabla vacía
        renderContractsTable([]);
    }
}

function renderContractsTable(contracts) {
    const tbody = document.getElementById('contractsTableBody');
    if (!contracts || !contracts.length) {
        tbody.innerHTML = '<tr><td colspan="5" class="empty-feed">No hay documentos registrados. Haz clic en "+ Nuevo Contrato" para subir uno.</td></tr>';
        return;
    }
    
    const docTypeLabels = {
        'contrato_laboral': '📄 Contrato',
        'renovacion': '🔄 Renovación',
        'adenda': '✏️ Adenda',
        'terminacion': '🚫 Terminación',
        'otro': '📋 Otro'
    };
    
    tbody.innerHTML = contracts.map(c => {
        const emp = state.employees.find(e => e.id === c.empId);
        const empName = emp ? `${emp.firstName} ${emp.lastName}` : (c.empName || '—');
        const empDept = emp ? emp.dept : (c.dept || '—');
        const docTypeLabel = docTypeLabels[c.docType] || docTypeLabels[c.type] || '📄 Documento';
        const fileIcon = c.fileName ? getFileIcon(c.fileName) : '📄';
        
        return `<tr>
            <td><strong>${empName}</strong><br><small style="color:#888">${empDept}</small></td>
            <td><span class="status-chip">${docTypeLabel}</span></td>
            <td><div style="display:flex;align-items:center;gap:6px">${fileIcon} <span style="font-size:0.85em;max-width:150px;overflow:hidden;text-overflow:ellipsis">${c.fileName || '—'}</span></div></td>
            <td><span class="token-mono">${formatDateTime(c.createdAt)}</span></td>
            <td>
                <div class="action-btns">
                    <button class="btn-table" onclick="downloadContract('${c.id}')" ${c.filePath ? '' : 'disabled style="opacity:0.4"'}>⬇️ Descargar</button>
                    <button class="btn-table del" onclick="deleteContract('${c.id}')">🗑</button>
                </div>
            </td>
        </tr>`;
    }).join('');
}

// Helper para obtener icono según extensión de archivo
function getFileIcon(fileName) {
    const ext = fileName.split('.').pop().toLowerCase();
    const icons = {
        'pdf': '📕',
        'doc': '📘', 'docx': '📘',
        'xls': '📗', 'xlsx': '📗',
        'jpg': '🖼️', 'jpeg': '🖼️', 'png': '🖼️', 'gif': '🖼️',
        'txt': '📝',
        'zip': '📦', 'rar': '📦',
        'mp4': '🎥', 'avi': '🎥', 'mov': '🎥',
        'mp3': '🎵', 'wav': '🎵'
    };
    return icons[ext] || '📄';
}

async function viewContract(contractId) {
    try {
        const res = await fetch(`/api/hr/contracts/${contractId}`);
        if (!res.ok) throw new Error('Error cargando contrato');
        const c = await res.json();
        
        const emp = state.employees.find(e => e.id === c.empId);
        const empName = emp ? `${emp.firstName} ${emp.lastName}` : (c.empName || '—');
        
        const typeLabels = {
            'indefinido': 'Tiempo Indefinido',
            'temporal': 'Temporal',
            'proyecto': 'Por Proyecto',
            'medio_tiempo': 'Medio Tiempo',
            'practicas': 'Prácticas Profesionales'
        };
        
        let html = `
            <div style="text-align:left;font-family:Outfit,sans-serif">
                <h3 style="margin-bottom:16px;color:#6366f1">📄 Contrato Laboral</h3>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px">
                    <div><strong>Empleado:</strong><br>${empName}</div>
                    <div><strong>Cargo:</strong><br>${c.position || '—'}</div>
                    <div><strong>Tipo:</strong><br>${typeLabels[c.type] || c.type}</div>
                    <div><strong>Fecha Inicio:</strong><br>${formatDate(c.startDate)}</div>
                    <div><strong>Salario:</strong><br>$${(c.salary || 0).toLocaleString('es-MX', {minimumFractionDigits: 2})}</div>
                    <div><strong>Horario:</strong><br>${c.schedule || '—'}</div>
                </div>
                ${c.benefits ? `<div style="margin-bottom:12px"><strong>Beneficios:</strong><br>${c.benefits}</div>` : ''}
                ${c.terms ? `<div style="margin-bottom:12px"><strong>Términos Especiales:</strong><br>${c.terms}</div>` : ''}
                ${c.filePath ? `<div style="margin-top:16px"><a href="${c.filePath}" target="_blank" style="color:#6366f1">📎 Ver documento adjunto</a></div>` : ''}
            </div>
        `;
        
        showModal('Detalle del Contrato', html);
    } catch (e) {
        showToast('❌ Error: ' + e.message, 'error');
    }
}

async function downloadContract(contractId) {
    try {
        const res = await fetch(`/api/hr/contracts/${contractId}`);
        if (!res.ok) throw new Error('Error cargando contrato');
        const c = await res.json();
        
        if (c.filePath) {
            window.open(c.filePath, '_blank');
        } else {
            showToast('❌ No hay documento adjunto', 'error');
        }
    } catch (e) {
        showToast('❌ Error: ' + e.message, 'error');
    }
}

async function deleteContract(contractId) {
    if (!confirm('¿Estás seguro de eliminar este contrato? Esta acción no se puede deshacer.')) return;
    
    try {
        const res = await fetch(`/api/hr/contracts/${contractId}`, { method: 'DELETE' });
        if (!res.ok) throw new Error('Error eliminando contrato');
        
        showToast('🗑 Contrato eliminado', 'warning');
        loadContracts();
    } catch (e) {
        showToast('❌ Error: ' + e.message, 'error');
    }
}

// ========== CONFIDENCIALIDAD ==========

let currentConfFile = null;

function openConfidentialityModal() {
    // Limpiar formulario
    document.getElementById('confEmpId').value = '';
    document.getElementById('confDocType').value = 'carta_confidencialidad';
    document.getElementById('confDescription').value = '';
    document.getElementById('confFileName').textContent = '';
    currentConfFile = null;
    
    // Poblar select de empleados
    const select = document.getElementById('confEmpId');
    select.innerHTML = '<option value="">Seleccionar empleado...</option>' +
        state.employees.filter(e => e.status === 'active').map(e => 
            `<option value="${e.id}">${e.firstName} ${e.lastName} (${e.empNum})</option>`
        ).join('');
    
    // Mostrar modal
    document.getElementById('confidentialityModal').style.display = 'flex';
}

function closeConfidentialityModal() {
    document.getElementById('confidentialityModal').style.display = 'none';
    currentConfFile = null;
}

// Manejar selección de archivo de confidencialidad
document.addEventListener('DOMContentLoaded', () => {
    const fileInput = document.getElementById('confFileInput');
    if (fileInput) {
        fileInput.addEventListener('change', (e) => {
            if (e.target.files && e.target.files[0]) {
                currentConfFile = e.target.files[0];
                document.getElementById('confFileName').textContent = '📎 ' + e.target.files[0].name;
            }
        });
    }
});

async function saveConfidentiality() {
    const empId = document.getElementById('confEmpId').value;
    const docType = document.getElementById('confDocType').value;
    const description = document.getElementById('confDescription').value.trim();
    
    // Validaciones
    if (!empId) { showToast('❌ Selecciona un empleado', 'error'); return; }
    if (!currentConfFile) { showToast('❌ Selecciona un archivo para subir', 'error'); return; }
    
    const emp = state.employees.find(e => e.id === empId);
    if (!emp) { showToast('❌ Empleado no encontrado', 'error'); return; }
    
    // Crear FormData para subir archivo
    const formData = new FormData();
    formData.append('empId', empId);
    formData.append('empName', `${emp.firstName} ${emp.lastName}`);
    formData.append('docType', docType);
    formData.append('description', description);
    formData.append('confFile', currentConfFile);
    
    try {
        showToast('⬆️ Subiendo documento...', 'info');
        const res = await fetch('/api/hr/confidentiality', { method: 'POST', body: formData });
        if (!res.ok) throw new Error('Error subiendo documento');
        
        showToast('✅ Documento subido exitosamente', 'success');
        closeConfidentialityModal();
        loadConfidentiality();
    } catch (e) {
        showToast('❌ Error: ' + e.message, 'error');
    }
}

async function loadConfidentiality() {
    try {
        const res = await fetch('/api/hr/confidentiality');
        if (!res.ok) throw new Error('Error cargando documentos');
        const letters = await res.json();
        renderConfidentialityTable(letters);
    } catch (e) {
        console.warn('Error cargando confidencialidad:', e);
        renderConfidentialityTable([]);
    }
}

function renderConfidentialityTable(letters) {
    const tbody = document.getElementById('confidentialityTableBody');
    if (!letters || !letters.length) {
        tbody.innerHTML = '<tr><td colspan="5" class="empty-feed">No hay documentos registrados. Haz clic en "+ Subir Documento" para agregar uno.</td></tr>';
        return;
    }
    
    const docTypeLabels = {
        'carta_confidencialidad': '🔒 Carta Confidencialidad',
        'acuerdo_nda': '🛡️ NDA',
        'compromiso_seguridad': '🔐 Compromiso Seguridad',
        'politica_privacidad': '📋 Política Privacidad',
        'otro': '📄 Otro'
    };
    
    tbody.innerHTML = letters.map(l => {
        const emp = state.employees.find(e => e.id === l.empId);
        const empName = emp ? `${emp.firstName} ${emp.lastName}` : (l.empName || '—');
        const empDept = emp ? emp.dept : (l.dept || '—');
        const docTypeLabel = docTypeLabels[l.docType] || docTypeLabels[l.type] || '🔒 Documento';
        const fileIcon = l.fileName ? getFileIcon(l.fileName) : '📄';
        
        return `<tr>
            <td><strong>${empName}</strong><br><small style="color:#888">${empDept}</small></td>
            <td><span class="status-chip">${docTypeLabel}</span></td>
            <td><div style="display:flex;align-items:center;gap:6px">${fileIcon} <span style="font-size:0.85em;max-width:150px;overflow:hidden;text-overflow:ellipsis">${l.fileName || '—'}</span></div></td>
            <td><span class="token-mono">${formatDateTime(l.createdAt)}</span></td>
            <td>
                <div class="action-btns">
                    <button class="btn-table" onclick="downloadConfidentiality('${l.id}')" ${l.filePath ? '' : 'disabled style="opacity:0.4"'}>⬇️ Descargar</button>
                    <button class="btn-table del" onclick="deleteConfidentiality('${l.id}')">🗑</button>
                </div>
            </td>
        </tr>`;
    }).join('');
}

async function downloadConfidentiality(confId) {
    try {
        const res = await fetch(`/api/hr/confidentiality/${confId}`);
        if (!res.ok) throw new Error('Error cargando documento');
        const l = await res.json();
        
        if (l.filePath) {
            window.open(l.filePath, '_blank');
        } else {
            showToast('❌ No hay documento adjunto', 'error');
        }
    } catch (e) {
        showToast('❌ Error: ' + e.message, 'error');
    }
}

async function deleteConfidentiality(confId) {
    if (!confirm('¿Estás seguro de eliminar este documento? Esta acción no se puede deshacer.')) return;
    
    try {
        const res = await fetch(`/api/hr/confidentiality/${confId}`, { method: 'DELETE' });
        if (!res.ok) throw new Error('Error eliminando documento');
        
        showToast('🗑 Documento eliminado', 'warning');
        loadConfidentiality();
    } catch (e) {
        showToast('❌ Error: ' + e.message, 'error');
    }
}

// ========== INICIALIZACIÓN ==========

// Actualizar showPage para incluir RRHH
const originalShowPage = showPage;
showPage = function(id) {
    originalShowPage(id);
    if (id === 'hr') {
        showHRTab(currentHRTab);
        // Inicializar documentos cuando se muestra la pestaña
        if (currentHRTab === 'documents') {
            initDocuments();
        }
    }
};
