/* GPS-DEPLOY-20260427-095647 */
/**
 * QR-Asistencia â€” Check-in Page Logic (GPS + API VERSION)
 * Captura GPS en tiempo real al registrar entrada/salida.
 * Valida geofences si estÃ¡n configurados en el servidor.
 */

/* ---- STATE ---- */
let cState = {
    employees: [],
    config: { tokenLife: 30, timeWindow: 30, antiReplay: true },
    secretKey: '',
    adminConfig: { company: 'Mi Empresa', logo: 'ðŸ¢' },
    selectedEmployee: null,
    tokenPayload: null,
    presentSet: [],
    geofences: [],
    // GPS state
    gpsPosition: null,      // { lat, lon, accuracy }
    gpsError: null,
    gpsWatchId: null,
};

/* ---- INIT ---- */
document.addEventListener('DOMContentLoaded', async () => {
    updateClocks();
    setInterval(updateClocks, 1000);
    try {
        await loadAdminData();
        startPolling();
    } catch (e) {
        showExpired('No se pudo conectar al servidor. Verifica tu conexiÃ³n.', '');
        return;
    }

    const params = new URLSearchParams(window.location.search);
    const tokenEncoded = params.get('t');

    if (!tokenEncoded) {
        showExpired('No se encontrÃ³ un cÃ³digo de acceso en esta URL.', 'Escanea el QR en la pantalla de entrada.');
        return;
    }

    if (!cState.secretKey) {
        showExpired('Sistema no configurado. Contacta al administrador.', '');
        return;
    }

    const result = await validateStationToken(tokenEncoded);

    if (!result.valid) {
        showExpired(
            result.code === 'EXPIRED'
                ? 'Este QR ya expirÃ³. Escanea el cÃ³digo actualizado en la pantalla de la entrada.'
                : `CÃ³digo invÃ¡lido: ${result.reason}`,
            result.code === 'EXPIRED'
                ? `â± Los cÃ³digos se actualizan cada ${cState.config.tokenLife} segundos para mayor seguridad.`
                : ''
        );
        return;
    }

    cState.tokenPayload = result.payload;
    renderSelectScreen();
    showScreen('screen-select');
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
    cState.geofences = (d.adminConfig && d.adminConfig.geofences) || d.geofences || [];
}

/* ---- GPS: Captura de ubicaciÃ³n en tiempo real ---- */
function startGPS() {
    if (!('geolocation' in navigator)) {
        setGPSStatus('error', 'GPS no disponible en este dispositivo', null);
        return;
    }
    setGPSStatus('acquiring', 'Obteniendo ubicaciÃ³nâ€¦', null);

    // Intento rÃ¡pido primero
    navigator.geolocation.getCurrentPosition(
        pos => onGPSSuccess(pos),
        err => onGPSError(err),
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );

    // Watch continuo para mantener actualizado
    cState.gpsWatchId = navigator.geolocation.watchPosition(
        pos => onGPSSuccess(pos),
        err => onGPSError(err),
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 }
    );
}

function stopGPS() {
    if (cState.gpsWatchId !== null) {
        navigator.geolocation.clearWatch(cState.gpsWatchId);
        cState.gpsWatchId = null;
    }
}

function onGPSSuccess(pos) {
    const { latitude: lat, longitude: lon, accuracy } = pos.coords;
    cState.gpsPosition = { lat, lon, accuracy, timestamp: new Date().toISOString() };
    cState.gpsError = null;

    // Verificar geofences si hay configurados
    if (cState.geofences && cState.geofences.length > 0) {
        const inside = cState.geofences.some(g => isInsideGeofenceClient(cState.gpsPosition, g));
        if (inside) {
            const gf = cState.geofences.find(g => isInsideGeofenceClient(cState.gpsPosition, g));
            setGPSStatus('ok', `âœ… Dentro de zona: ${gf.name}`, { lat, lon, accuracy });
        } else {
            setGPSStatus('blocked', 'âš ï¸ Fuera de zona permitida', { lat, lon, accuracy });
        }
    } else {
        // Sin geofences: solo mostrar coordenadas
        setGPSStatus('ok', `ðŸ“ UbicaciÃ³n obtenida (Â±${Math.round(accuracy)}m)`, { lat, lon, accuracy });
    }
}

function onGPSError(err) {
    cState.gpsPosition = null;
    cState.gpsError = err.message;
    const msgs = {
        1: 'Permiso de ubicaciÃ³n denegado',
        2: 'UbicaciÃ³n no disponible',
        3: 'Tiempo de espera agotado',
    };
    setGPSStatus('error', msgs[err.code] || 'Error de GPS', null);
}

function setGPSStatus(state, text, coords) {
    const bar = document.getElementById('gpsStatusBar');
    const icon = document.getElementById('gpsIcon');
    const textEl = document.getElementById('gpsText');
    const coordsEl = document.getElementById('gpsCoords');
    if (!bar) return;

    bar.className = 'gps-status-bar';
    if (state === 'acquiring') { bar.classList.add('gps-acquiring'); icon.textContent = 'ðŸ“¡'; }
    else if (state === 'ok') { bar.classList.add('gps-ok'); icon.textContent = 'ðŸ“'; }
    else if (state === 'blocked') { bar.classList.add('gps-blocked'); icon.textContent = 'ðŸš«'; }
    else if (state === 'error') { bar.classList.add('gps-error'); icon.textContent = 'âš ï¸'; }

    textEl.textContent = text;
    if (coords) {
        coordsEl.textContent = `${coords.lat.toFixed(5)}, ${coords.lon.toFixed(5)}`;
    } else {
        coordsEl.textContent = '';
    }
}

/* ---- Haversine client-side (para validaciÃ³n visual) ---- */
function haversineClient(lat1, lon1, lat2, lon2) {
    const R = 6371000;
    const toRad = d => d * Math.PI / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon/2)**2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function isInsideGeofenceClient(point, geofence) {
    if (!point || !geofence) return false;
    return haversineClient(point.lat, point.lon, geofence.lat, geofence.lon) <= geofence.radiusMeters;
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
                    if (screenSelect && !screenSelect.classList.contains('hidden')) filterEmployees();
                }
            }
        } catch (e) { /* silent */ }
    }, 3000);
}

/* ---- VALIDATE STATION TOKEN ---- */
async function validateStationToken(encoded) {
    const now = Math.floor(Date.now() / 1000);
    let payload;
    try { payload = JSON.parse(atob(encoded)); }
    catch { return { valid: false, reason: 'Token ilegible', code: 'DECODE_ERROR' }; }

    if (payload?.type !== 'station') return { valid: false, reason: 'Tipo de token incorrecto', code: 'WRONG_TYPE' };
    if (!payload.ts || !payload.nonce || !payload.sig) return { valid: false, reason: 'Token incompleto', code: 'INCOMPLETE' };

    const window = cState.config.timeWindow || 300;
    const life = cState.config.tokenLife || 30;
    const age = now - payload.ts;
    if (age > life + window) return { valid: false, reason: `Token expirado (${Math.round(age)}s)`, code: 'EXPIRED' };
    if (payload.ts > now + window) return { valid: false, reason: 'Token con fecha futura', code: 'FUTURE_TS' };

    const message = `station|${payload.ts}|${payload.nonce}`;
    const sig = await CryptoUtils.hmacSign(message, cState.secretKey);
    if (sig.slice(0, 32) !== payload.sig) return { valid: false, reason: 'Firma invÃ¡lida', code: 'INVALID_SIG' };

    return { valid: true, payload };
}

/* ---- RENDER SELECT SCREEN ---- */
function renderSelectScreen() {
    const setEl = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
    setEl('coLogo', cState.adminConfig.logo || 'ðŸ¢');
    setEl('coName', cState.adminConfig.company || 'Mi Empresa');
    setEl('coLogo2', cState.adminConfig.logo || 'ðŸ¢');
    setEl('coName2', cState.adminConfig.company || 'Mi Empresa');

    const expTime = (cState.tokenPayload.ts + cState.config.tokenLife) * 1000;
    setEl('tokenExpLabel', `ðŸ”’ Token vÃ¡lido hasta las ${new Date(expTime).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`);
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
        <span class="emp-meta">${e.dept} â€¢ ${e.empNum}</span>
      </div>
      <span class="emp-arrow">â€º</span>
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
    const isInside = cState.presentSet.includes(emp.id);

    const setEl = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
    setEl('selAvatar', emp.avatar || emp.firstName[0] || 'ðŸ‘¤');
    setEl('selName', `${emp.firstName} ${emp.lastName}`);
    setEl('selDept', `${emp.dept} â€” ${emp.role || ''}`);
    setEl('selNum', emp.empNum);

    const timeStr = new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
    setEl('entryTimeSub', isInside ? '(ya tienes entrada activa)' : timeStr);
    setEl('exitTimeSub', !isInside ? '(sin entrada activa)' : timeStr);

    document.getElementById('btnEntry').style.opacity = isInside ? '0.45' : '1';
    document.getElementById('btnExit').style.opacity = !isInside ? '0.45' : '1';

    // Iniciar GPS al mostrar pantalla de confirmaciÃ³n
    startGPS();
    showScreen('screen-confirm');
}

function goBack() {
    stopGPS();
    cState.selectedEmployee = null;
    cState.gpsPosition = null;
    document.getElementById('empSearchInput').value = '';
    filterEmployees();
    showScreen('screen-select');
}

/* ---- SUBMIT CHECK-IN ---- */
async function submitCheckin(type) {
    const emp = cState.selectedEmployee;
    if (!emp) return;

    document.getElementById('btnEntry').disabled = true;
    document.getElementById('btnExit').disabled = true;

    const now = new Date();
    const nonce = cState.tokenPayload?.nonce || null;

    // Construir log con GPS si estÃ¡ disponible
    const logEntry = {
        id: Date.now(),
        empId: emp.id,
        empName: `${emp.firstName} ${emp.lastName}`,
        type,
        ts: now.toISOString(),
        tokenNonce: nonce,
        status: 'valid',
        reason: type === 'entry' ? 'Entrada registrada desde QR mÃ³vil' : 'Salida registrada desde QR mÃ³vil',
        source: 'checkin',
        // GPS data
        location: cState.gpsPosition ? {
            lat: cState.gpsPosition.lat,
            lon: cState.gpsPosition.lon,
            accuracy: cState.gpsPosition.accuracy,
        } : null,
    };

    try {
        const res = await fetch('/api/checkin', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(logEntry),
        });
        const json = await res.json();

        if (!res.ok || json.error) {
            // Geofence violation â€” mostrar mensaje claro
            if (json.error === 'GEOFENCE_VIOLATION') {
                showToastLocal('ðŸš« Fuera de zona permitida. AcÃ©rcate al lugar de trabajo.', 'error');
                document.getElementById('btnEntry').disabled = false;
                document.getElementById('btnExit').disabled = false;
                return;
            }
            if (res.status === 409) { showAlreadyRegistered(type); return; }
            throw new Error(json.error || 'Error del servidor');
        }

        stopGPS();
        showSuccess(emp, type, now, cState.gpsPosition);
    } catch (e) {
        showToastLocal('âŒ Error: ' + e.message, 'error');
        document.getElementById('btnEntry').disabled = false;
        document.getElementById('btnExit').disabled = false;
    }
}

/* ---- SUCCESS SCREEN ---- */
function showSuccess(emp, type, time, gps) {
    const setEl = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
    setEl('scName', `${emp.firstName} ${emp.lastName}`);
    setEl('scType', type === 'entry' ? 'ðŸŸ¢ Entrada' : 'ðŸ”´ Salida');
    setEl('scTime', time.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    setEl('scDept', emp.dept);
    setEl('successTitle', type === 'entry' ? 'Â¡Bienvenido! ðŸ‘‹' : 'Â¡Hasta pronto! ðŸ‘‹');

    // Mostrar ubicaciÃ³n si estÃ¡ disponible
    const locRow = document.getElementById('scLocationRow');
    const locEl = document.getElementById('scLocation');
    if (gps && locRow && locEl) {
        locEl.textContent = `${gps.lat.toFixed(5)}, ${gps.lon.toFixed(5)} (Â±${Math.round(gps.accuracy)}m)`;
        locRow.style.display = 'flex';
    }

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
            if (cd) cd.textContent = 'âœ… Puedes cerrar esta pestaÃ±a.';
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

/* ---- INIT ---- */
document.addEventListener('DOMContentLoaded', async () => {
    updateClocks();
    setInterval(updateClocks, 1000);
    try {
        await loadAdminData();
        startPolling(); // <--- Activamos el vigilante automÃ¡tico
    } catch (e) {
        showExpired('No se pudo conectar al servidor. Verifica tu conexiÃ³n.', '');
        return;
    }

    const params = new URLSearchParams(window.location.search);
    const tokenEncoded = params.get('t');

    if (!tokenEncoded) {
        showExpired('No se encontrÃ³ un cÃ³digo de acceso en esta URL.', 'Escanea el QR en la pantalla de entrada.');
        return;
    }

    if (!cState.secretKey) {
        showExpired('Sistema no configurado. Contacta al administrador.', '');
        return;
    }

    const result = await validateStationToken(tokenEncoded);

    if (!result.valid) {
        showExpired(
            result.code === 'EXPIRED'
                ? 'Este QR ya expirÃ³. Escanea el cÃ³digo actualizado en la pantalla de la entrada.'
                : `CÃ³digo invÃ¡lido: ${result.reason}`,
            result.code === 'EXPIRED'
                ? `â± Los cÃ³digos se actualizan cada ${cState.config.tokenLife} segundos para mayor seguridad.`
                : ''
        );
        return;
    }

    cState.tokenPayload = result.payload;
    renderSelectScreen();
    showScreen('screen-select');
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
                
                // Si hay cambios en los presentes o en la lista de empleados
                if (JSON.stringify(d.presentSet) !== JSON.stringify(cState.presentSet) || d.employees?.length !== cState.employees?.length) {
                    console.log('ðŸ”„ Sincronizando datos con el servidor...');
                    cState.employees = (d.employees || []).filter(e => e.status === 'active');
                    cState.presentSet = d.presentSet || [];
                    
                    // Si estamos viendo la lista de selecciÃ³n, la redibujamos
                    const screenSelect = document.getElementById('screen-select');
                    if (screenSelect && !screenSelect.classList.contains('hidden')) {
                        filterEmployees();
                    }
                }
            }
        } catch (e) {
            console.warn('Error en polling de check-in:', e.message);
        }
    }, 3000); // Cada 3 segundos para los mÃ³viles para no gastar tanta baterÃ­a
}

/* ---- VALIDATE STATION TOKEN ---- */
async function validateStationToken(encoded) {
    const now = Math.floor(Date.now() / 1000);
    let payload;
    try { payload = JSON.parse(atob(encoded)); }
    catch { return { valid: false, reason: 'Token ilegible', code: 'DECODE_ERROR' }; }

    if (payload?.type !== 'station') return { valid: false, reason: 'Tipo de token incorrecto', code: 'WRONG_TYPE' };
    if (!payload.ts || !payload.nonce || !payload.sig) return { valid: false, reason: 'Token incompleto', code: 'INCOMPLETE' };

    const window = cState.config.timeWindow || 300;
    const life = cState.config.tokenLife || 30;
    const age = now - payload.ts;
    if (age > life + window) return { valid: false, reason: `Token expirado (${Math.round(age)}s)`, code: 'EXPIRED' };
    if (payload.ts > now + window) return { valid: false, reason: 'Token con fecha futura', code: 'FUTURE_TS' };

    const message = `station|${payload.ts}|${payload.nonce}`;
    const sig = await CryptoUtils.hmacSign(message, cState.secretKey);
    if (sig.slice(0, 32) !== payload.sig) return { valid: false, reason: 'Firma invÃ¡lida', code: 'INVALID_SIG' };

    return { valid: true, payload };
}

/* ---- RENDER SELECT SCREEN ---- */
function renderSelectScreen() {
    const setEl = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
    setEl('coLogo', cState.adminConfig.logo || 'ðŸ¢');
    setEl('coName', cState.adminConfig.company || 'Mi Empresa');
    setEl('coLogo2', cState.adminConfig.logo || 'ðŸ¢');
    setEl('coName2', cState.adminConfig.company || 'Mi Empresa');

    const expTime = (cState.tokenPayload.ts + cState.config.tokenLife) * 1000;
    setEl('tokenExpLabel', `ðŸ”’ Token vÃ¡lido hasta las ${new Date(expTime).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`);
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
        <span class="emp-meta">${e.dept} â€¢ ${e.empNum}</span>
      </div>
      <span class="emp-arrow">â€º</span>
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
    const isInside = cState.presentSet.includes(emp.id);

    const setEl = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
    setEl('selAvatar', emp.avatar || emp.firstName[0] || 'ðŸ‘¤');
    setEl('selName', `${emp.firstName} ${emp.lastName}`);
    setEl('selDept', `${emp.dept} â€” ${emp.role || ''}`);
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

    document.getElementById('btnEntry').disabled = true;
    document.getElementById('btnExit').disabled = true;

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
        reason: type === 'entry' ? 'Entrada registrada desde QR mÃ³vil' : 'Salida registrada desde QR mÃ³vil',
        source: 'checkin',
    };

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
    } catch (e) {
        showToastLocal('âŒ Error: ' + e.message, 'error');
        document.getElementById('btnEntry').disabled = false;
        document.getElementById('btnExit').disabled = false;
    }
}

/* ---- SUCCESS SCREEN ---- */
function showSuccess(emp, type, time) {
    const setEl = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
    setEl('scName', `${emp.firstName} ${emp.lastName}`);
    setEl('scType', type === 'entry' ? 'ðŸŸ¢ Entrada' : 'ðŸ”´ Salida');
    setEl('scTime', time.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    setEl('scDept', emp.dept);
    setEl('successTitle', type === 'entry' ? 'Â¡Bienvenido! ðŸ‘‹' : 'Â¡Hasta pronto! ðŸ‘‹');
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
            if (cd) cd.textContent = 'âœ… Puedes cerrar esta pestaÃ±a.';
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
