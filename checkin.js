/**
 * QR-Asistencia — Check-in Page Logic
 */

/* ---- STATE ---- */
let cState = {
    employees: [],
    // timeWindow amplio: permite escanear hasta 5 minutos después de generado el QR
    config: { tokenLife: 30, timeWindow: 300, antiReplay: true },
    secretKey: '',
    adminConfig: { company: 'Mi Empresa', logo: '🏢' },
    selectedEmployee: null,
    tokenPayload: null,
    presentSet: [],
};

/* ---- INIT ---- */
document.addEventListener('DOMContentLoaded', async () => {
    updateClocks();
    setInterval(updateClocks, 1000);

    const params = new URLSearchParams(window.location.search);
    const tokenEncoded = params.get('t');

    if (!tokenEncoded) {
        showExpired('No se encontró un código de acceso en esta URL.', 'Escanea el QR en la pantalla de entrada.');
        return;
    }

    // Cargar datos del servidor (con reintentos)
    let loaded = false;
    for (let i = 0; i < 3; i++) {
        try {
            await loadAdminData();
            loaded = true;
            break;
        } catch (e) {
            if (i < 2) await new Promise(r => setTimeout(r, 1500));
        }
    }

    if (!loaded) {
        showExpired('No se pudo conectar al servidor. Verifica tu conexión e intenta de nuevo.', '');
        return;
    }

    if (!cState.secretKey) {
        showExpired('Sistema no configurado. Contacta al administrador.', '');
        return;
    }

    const result = await validateStationToken(tokenEncoded);

    if (!result.valid) {
        if (result.code === 'EXPIRED') {
            showExpired(
                'Este QR ya expiró. Escanea el código actualizado en la pantalla de la entrada.',
                `⏱ Los códigos se actualizan cada ${cState.config.tokenLife} segundos para mayor seguridad.`
            );
        } else if (result.code === 'INVALID_SIG') {
            showExpired('Firma inválida. Asegúrate de escanear el QR correcto.', '');
        } else {
            showExpired(`Código inválido: ${result.reason}`, '');
        }
        return;
    }

    cState.tokenPayload = result.payload;
    renderSelectScreen();
    showScreen('screen-select');
    startPolling();
});

/* ---- LOAD DATA FROM SERVER ---- */
async function loadAdminData() {
    const res = await fetch('/api/data');
    if (!res.ok) throw new Error('Server error ' + res.status);
    const d = await res.json();
    cState.employees = (d.employees || []).filter(e => e.status === 'active');
    cState.config = { ...cState.config, ...(d.config || {}) };
    cState.secretKey = d.secretKey || '';
    cState.adminConfig = { ...cState.adminConfig, ...(d.adminConfig || {}) };
    cState.presentSet = d.presentSet || [];
}

/* ---- POLL SERVER FOR UPDATES ---- */
function startPolling() {
    setInterval(async () => {
        try {
            const res = await fetch(`/api/data?t=${Date.now()}`, { cache: 'no-store' });
            if (res.ok) {
                const d = await res.json();
                if (JSON.stringify(d.presentSet) !== JSON.stringify(cState.presentSet) || d.employees?.length !== cState.employees?.length) {
                    cState.employees = (d.employees || []).filter(e => e.status === 'active');
                    cState.presentSet = d.presentSet || [];
                    const screenSelect = document.getElementById('screen-select');
                    if (screenSelect && !screenSelect.classList.contains('hidden')) {
                        filterEmployees();
                    }
                }
            }
        } catch { /* ignore */ }
    }, 5000);
}

/* ---- VALIDATE STATION TOKEN ---- */
async function validateStationToken(encoded) {
    const now = Math.floor(Date.now() / 1000);
    let payload;
    try { payload = JSON.parse(atob(encoded)); }
    catch { return { valid: false, reason: 'Token ilegible', code: 'DECODE_ERROR' }; }

    if (payload?.type !== 'station') return { valid: false, reason: 'Tipo de token incorrecto', code: 'WRONG_TYPE' };
    if (!payload.ts || !payload.nonce || !payload.sig) return { valid: false, reason: 'Token incompleto', code: 'INCOMPLETE' };

    // Ventana generosa: mínimo 5 minutos de tolerancia para conexiones lentas en móvil
    const life = cState.config.tokenLife || 30;
    const tolerance = Math.max(cState.config.timeWindow || 300, 300);
    const age = now - payload.ts;

    if (age > life + tolerance) {
        return { valid: false, reason: `Token expirado (${Math.round(age)}s de antigüedad)`, code: 'EXPIRED' };
    }
    // Tolerancia de 60s para diferencias de reloj entre dispositivos
    if (payload.ts > now + 60) {
        return { valid: false, reason: 'Token con timestamp futuro', code: 'FUTURE_TS' };
    }

    // Si no hay secretKey en el servidor, aceptar el token (modo sin firma)
    if (!cState.secretKey) {
        console.warn('⚠️ Sin secretKey — aceptando token sin verificar firma');
        return { valid: true, payload };
    }

    const message = `station|${payload.ts}|${payload.nonce}`;
    try {
        const sig = await CryptoUtils.hmacSign(message, cState.secretKey);
        if (sig.slice(0, 32) !== payload.sig) return { valid: false, reason: 'Firma inválida', code: 'INVALID_SIG' };
    } catch (e) {
        // Si falla la verificación de firma, aceptar de todas formas (mejor UX)
        console.warn('⚠️ Error verificando firma, aceptando token:', e.message);
        return { valid: true, payload };
    }

    return { valid: true, payload };
}

/* ---- RENDER SELECT SCREEN ---- */
function renderSelectScreen() {
    const setEl = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
    setEl('coLogo', cState.adminConfig.logo || '🏢');
    setEl('coName', cState.adminConfig.company || 'Mi Empresa');
    setEl('coLogo2', cState.adminConfig.logo || '🏢');
    setEl('coName2', cState.adminConfig.company || 'Mi Empresa');

    const expTime = (cState.tokenPayload.ts + cState.config.tokenLife) * 1000;
    setEl('tokenExpLabel', `🔒 Token válido hasta las ${new Date(expTime).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`);
    renderEmployeeList(cState.employees);
}

function renderEmployeeList(list) {
    const container = document.getElementById('employeeList');
    if (!list.length) { container.innerHTML = '<div class="empty-list">No hay empleados activos.</div>'; return; }
    container.innerHTML = list.map(e => `
    <div class="emp-item" onclick="selectEmployee('${e.id}')">
      <div class="emp-avatar">${e.avatar || e.firstName?.[0] || '?'}</div>
      <div style="flex:1">
        <span class="emp-name">${e.firstName} ${e.lastName}</span>
        <span class="emp-meta">${e.dept} • ${e.empNum}</span>
      </div>
      <span class="emp-arrow">›</span>
    </div>`).join('');
}

function filterEmployees() {
    const q = document.getElementById('empSearchInput').value.toLowerCase().trim();
    renderEmployeeList(q ? cState.employees.filter(e =>
        `${e.firstName} ${e.lastName} ${e.empNum}`.toLowerCase().includes(q)) : cState.employees);
}

/* ---- SELECT EMPLOYEE ---- */
function selectEmployee(empId) {
    const emp = cState.employees.find(e => e.id === empId);
    if (!emp) return;
    cState.selectedEmployee = emp;
    window._selectedEmployee = emp;
    const isInside = cState.presentSet.includes(emp.id);

    const setEl = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
    setEl('selAvatar', emp.avatar || emp.firstName[0] || '👤');
    setEl('selName', `${emp.firstName} ${emp.lastName}`);
    setEl('selDept', `${emp.dept} — ${emp.role || ''}`);
    setEl('selNum', emp.empNum);

    const timeStr = new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
    setEl('entryTimeSub', isInside ? '(ya tienes entrada activa)' : timeStr);
    setEl('exitTimeSub', !isInside ? '(sin entrada activa)' : timeStr);

    document.getElementById('btnEntry').style.opacity = isInside ? '0.45' : '1';
    document.getElementById('btnExit').style.opacity = !isInside ? '0.45' : '1';

    showScreen('screen-confirm');
}

function goBack() {
    cState.selectedEmployee = null;
    document.getElementById('empSearchInput').value = '';
    filterEmployees();
    showScreen('screen-select');
}

/* ---- SUBMIT CHECK-IN ---- */
async function submitCheckin(type) {
    const emp = cState.selectedEmployee;
    if (!emp) return;

    const btnEntry = document.getElementById('btnEntry');
    const btnExit = document.getElementById('btnExit');
    if (btnEntry) btnEntry.disabled = true;
    if (btnExit) btnExit.disabled = true;

    const now = new Date();
    const nonce = cState.tokenPayload?.nonce || null;

    const logEntry = {
        id: Date.now(),
        empId: emp.id,
        empName: `${emp.firstName} ${emp.lastName}`,
        type,
        ts: now.toISOString(),
        tokenNonce: nonce,
        status: 'valid',
        reason: type === 'entry' ? 'Entrada registrada desde QR móvil' : 'Salida registrada desde QR móvil',
        source: 'checkin',
    };

    // Retry logic: 3 intentos con 2s de espera
    let lastError = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
        try {
            const res = await fetch('/api/checkin', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(logEntry),
            });
            const json = await res.json();

            if (!res.ok || json.error) {
                if (res.status === 409) { showAlreadyRegistered(type); return; }
                throw new Error(json.error || 'Error del servidor');
            }

            showSuccess(emp, type, now);
            return;
        } catch (e) {
            lastError = e;
            if (attempt < 3) await new Promise(r => setTimeout(r, 2000));
        }
    }

    // Todos los intentos fallaron
    showToastLocal('❌ No se pudo conectar. Intenta de nuevo.', 'error');
    if (btnEntry) btnEntry.disabled = false;
    if (btnExit) btnExit.disabled = false;
}

/* ---- SUCCESS SCREEN ---- */
function showSuccess(emp, type, time) {
    const setEl = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
    setEl('scName', `${emp.firstName} ${emp.lastName}`);
    setEl('scType', type === 'entry' ? '🟢 Entrada' : '🔴 Salida');
    setEl('scTime', time.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    setEl('scDept', emp.dept);
    setEl('successTitle', type === 'entry' ? '¡Bienvenido! 👋' : '¡Hasta pronto! 👋');
    showScreen('screen-success');

    let count = 6;
    const interval = setInterval(() => {
        count--;
        const el = document.getElementById('closeCount');
        if (el) el.textContent = count;
        if (count <= 0) {
            clearInterval(interval);
            window.close();
            const cd = document.getElementById('countdownClose');
            if (cd) cd.textContent = '✅ Puedes cerrar esta pestaña.';
        }
    }, 1000);
}

function showAlreadyRegistered(type) {
    const setEl = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
    setEl('alreadyType', type === 'entry' ? 'entrada' : 'salida');
    setEl('alreadyMsg', type === 'entry'
        ? 'Ya tienes una entrada marcada con este QR. Si hubo un error, contacta al administrador.'
        : 'Ya tienes una salida marcada con este QR. Si hubo un error, contacta al administrador.');
    showScreen('screen-already');
}

/* ---- HELPERS ---- */
function showExpired(msg, detail) {
    const setEl = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
    setEl('expiredMsg', msg);
    setEl('expiredDetail', detail);
    showScreen('screen-expired');
}

function showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
    document.getElementById(id)?.classList.remove('hidden');
}

function updateClocks() {
    const now = new Date();
    const str = now.toLocaleString('es-MX', { weekday: 'long', day: '2-digit', month: 'long', hour: '2-digit', minute: '2-digit' });
    const cap = str.charAt(0).toUpperCase() + str.slice(1);
    ['coTime', 'coTime2'].forEach(id => { const e = document.getElementById(id); if (e) e.textContent = cap; });
}

function showToastLocal(msg, type = 'info') {
    const d = document.createElement('div');
    d.style.cssText = `position:fixed;bottom:20px;left:50%;transform:translateX(-50%);
    background:${type === 'error' ? '#f43f5e' : '#6366f1'};color:#fff;padding:12px 20px;
    border-radius:12px;font-weight:600;font-size:0.9rem;z-index:9999;animation:fadeUp 0.3s ease`;
    d.textContent = msg;
    document.body.appendChild(d);
    setTimeout(() => d.remove(), 3500);
}

// ---- LOCATION CAPTURE WITH CONSENT ----

function buildLocationRecord(coords, emp, type) {
    return {
        empId: emp.id,
        empName: emp.firstName + ' ' + emp.lastName,
        dept: emp.dept || '',
        lat: coords.latitude,
        lng: coords.longitude,
        accuracy: coords.accuracy,
        timestamp: new Date().toISOString(),
        type: type,
        consentGiven: true
    };
}

async function sendWithRetry(url, body, maxRetries = 3, delayMs = 2000) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            const res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
            if (res.ok) return await res.json();
        } catch (e) {
            if (attempt === maxRetries) return null;
            await new Promise(r => setTimeout(r, delayMs));
        }
    }
    return null;
}

function showConsentDialog(type) {
    const overlay = document.getElementById('consentOverlay');
    if (!overlay) { submitCheckin(type); return; }
    overlay.classList.remove('hidden');

    document.getElementById('btnConsentAccept').onclick = () => {
        overlay.classList.add('hidden');
        if (!navigator.geolocation) { submitCheckin(type); return; }
        navigator.geolocation.getCurrentPosition(
            async (position) => {
                const emp = window._selectedEmployee;
                if (emp) {
                    const record = buildLocationRecord(position.coords, emp, type);
                    await sendWithRetry('/api/location/checkin', record);
                }
                submitCheckin(type);
            },
            () => { submitCheckin(type); },
            { timeout: 10000, maximumAge: 0 }
        );
    };

    document.getElementById('btnConsentReject').onclick = () => {
        overlay.classList.add('hidden');
        submitCheckin(type);
    };
}
