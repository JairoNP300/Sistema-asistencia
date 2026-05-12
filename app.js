/* ---- STATE MANAGEMENT ---- */
const state = {
    currentUser: null,
    employees: [],
    positions: [],
    applications: [],
    payroll: [],
    documents: [],
    permissions: [],
    config: {
        companyName: 'Mi Empresa',
        companyAddress: 'Dirección de la empresa',
        companyPhone: '+503 0000-0000',
        hrAdmin: 'admin@empresa.com',
        emailNotifications: 'enabled'
    },
    stats: {
        totalEmployees: 0,
        activeEmployees: 0,
        openPositions: 0,
        pendingDocuments: 0
    },
    version: '2.6.0',
    lastCheck: null
};

/* ---- CREDENTIALS ---- */
const CREDENTIALS = {
    admin: { email: 'admin@empresa.com', password: 'admin123', role: 'admin' },
    hr: { email: 'hr@empresa.com', password: 'hr123', role: 'hr' }
};

/* ---- INIT ---- */
document.addEventListener('DOMContentLoaded', () => {
    updateClocks();
    setInterval(updateClocks, 1000);
    loadSettings();
    checkVersion();
    checkAuth();
    
    // Verificar versión cada 30 segundos
    setInterval(checkVersion, 30000);
});

/* ---- VERSION CHECK ---- */
async function checkVersion() {
    try {
        const response = await fetch('/api/version');
        const serverVersion = await response.text();
        
        const localVersion = localStorage.getItem('appVersion') || state.version;
        
        if (serverVersion !== localVersion) {
            console.log('Nueva versión detectada:', serverVersion);
            localStorage.setItem('appVersion', serverVersion);
            
            // Mostrar notificación de actualización
            showUpdateNotification(serverVersion);
            
            // Recargar página después de 3 segundos
            setTimeout(() => {
                window.location.reload(true);
            }, 3000);
        }
        
        state.lastCheck = new Date().toISOString();
    } catch (error) {
        console.log('Error verificando versión:', error);
    }
}

function showUpdateNotification(newVersion) {
    const notification = document.createElement('div');
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: linear-gradient(135deg, #10b981, #059669);
        color: white;
        padding: 20px;
        border-radius: 12px;
        box-shadow: 0 8px 25px rgba(16, 185, 129, 0.3);
        z-index: 10000;
        max-width: 350px;
        animation: slideIn 0.3s ease;
    `;
    
    notification.innerHTML = `
        <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 8px;">
            <div style="font-size: 24px;">🔄</div>
            <div>
                <div style="font-weight: 600; font-size: 16px;">Actualización Disponible</div>
                <div style="font-size: 14px; opacity: 0.9;">Versión ${newVersion}</div>
            </div>
        </div>
        <div style="font-size: 13px; opacity: 0.8;">
            El sistema se actualizará automáticamente en 3 segundos...
        </div>
    `;
    
    document.body.appendChild(notification);
}

/* ---- AUTHENTICATION ---- */
function checkAuth() {
    const savedUser = localStorage.getItem('currentUser');
    if (savedUser) {
        state.currentUser = JSON.parse(savedUser);
        showMainApp();
    } else {
        showLoginScreen();
    }
}

function login(event) {
    event.preventDefault();
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;

    const user = Object.values(CREDENTIALS).find(cred => cred.email === email && cred.password === password);
    if (user) {
        state.currentUser = user;
        localStorage.setItem('currentUser', JSON.stringify(user));
        showMainApp();
        showToast('✅ Sesión iniciada correctamente', 'success');
    } else {
        showToast('❌ Credenciales incorrectas', 'error');
    }
}

function logout() {
    state.currentUser = null;
    localStorage.removeItem('currentUser');
    showLoginScreen();
    showToast('👋 Sesión cerrada', 'info');
}

function showLoginScreen() {
    document.getElementById('loginScreen').classList.remove('hidden');
    document.getElementById('mainContent').classList.add('hidden');
}

function showMainApp() {
    document.getElementById('loginScreen').classList.add('hidden');
    document.getElementById('mainContent').classList.remove('hidden');
    loadEmployees();
    updateDashboard();
}

/* ---- PAGE NAVIGATION ---- */
function showPage(pageId) {
    // Hide all pages
    document.querySelectorAll('.page').forEach(page => {
        page.classList.remove('active');
    });
    
    // Show selected page
    document.getElementById(`page-${pageId}`).classList.add('active');
    
    // Update nav
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active');
    });
    document.getElementById(`nav-${pageId}`).classList.add('active');
    
    // Load page-specific data
    switch(pageId) {
        case 'dashboard':
            updateDashboard();
            break;
        case 'employees':
            renderEmployees();
            break;
        case 'recruitment':
            renderPositions();
            break;
        case 'payroll':
            renderPayroll();
            break;
        case 'documents':
            renderDocuments();
            break;
        case 'permissions':
            renderPermissions();
            break;
        case 'admin':
            loadSettings();
            break;
    }
}

/* ---- EMPLOYEES MANAGEMENT ---- */
async function loadEmployees() {
    try {
        const response = await fetch('/api/data');
        const data = await response.json();
        state.employees = data.employees || [];
        updateStats();
    } catch (error) {
        console.error('Error cargando empleados:', error);
        showToast('❌ Error al cargar empleados', 'error');
    }
}

function renderEmployees() {
    const tbody = document.getElementById('employeesTableBody');
    const searchTerm = document.getElementById('employeeSearch').value.toLowerCase();
    const deptFilter = document.getElementById('departmentFilter').value;
    const statusFilter = document.getElementById('statusFilter').value;
    
    let filteredEmployees = state.employees.filter(emp => {
        const matchesSearch = emp.firstName.toLowerCase().includes(searchTerm) || 
                              emp.lastName.toLowerCase().includes(searchTerm) ||
                              emp.empNum.toLowerCase().includes(searchTerm);
        const matchesDept = !deptFilter || emp.dept === deptFilter;
        const matchesStatus = !statusFilter || emp.status === statusFilter;
        return matchesSearch && matchesDept && matchesStatus;
    });
    
    if (filteredEmployees.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="7" class="empty-state">
                    <p>No hay empleados registrados</p>
                </td>
            </tr>
        `;
        return;
    }
    
    tbody.innerHTML = filteredEmployees.map(emp => `
        <tr>
            <td>${emp.empNum}</td>
            <td>${emp.firstName} ${emp.lastName}</td>
            <td>${emp.dept}</td>
            <td>${emp.role}</td>
            <td>${emp.email}</td>
            <td><span class="status-badge ${emp.status}">${getStatusText(emp.status)}</span></td>
            <td>
                <button class="btn btn-sm btn-primary" onclick="editEmployee('${emp.id}')">Editar</button>
                <button class="btn btn-sm btn-danger" onclick="deleteEmployee('${emp.id}')">Eliminar</button>
            </td>
        </tr>
    `).join('');
}

function filterEmployees() {
    renderEmployees();
}

function showAddEmployeeModal() {
    document.getElementById('addEmployeeModal').classList.remove('hidden');
}

function closeModal(modalId) {
    document.getElementById(modalId).classList.add('hidden');
}

function addEmployee(event) {
    event.preventDefault();
    
    const employee = {
        id: `emp_${Date.now()}`,
        firstName: document.getElementById('empFirstName').value.toUpperCase(),
        lastName: document.getElementById('empLastName').value.toUpperCase(),
        empNum: document.getElementById('empNumber').value,
        dept: document.getElementById('empDept').value,
        role: document.getElementById('empRole').value.toUpperCase(),
        email: document.getElementById('empEmail').value,
        phone: document.getElementById('empPhone').value,
        salary: parseFloat(document.getElementById('empSalary').value),
        hireDate: document.getElementById('empHireDate').value,
        status: 'active',
        createdAt: new Date().toISOString()
    };
    
    state.employees.push(employee);
    saveEmployees();
    renderEmployees();
    closeModal('addEmployeeModal');
    showToast('✅ Empleado agregado correctamente', 'success');
}

async function saveEmployees() {
    try {
        const response = await fetch('/api/save', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ employees: state.employees })
        });
        
        if (response.ok) {
            updateStats();
        }
    } catch (error) {
        console.error('Error guardando empleados:', error);
    }
}

function deleteEmployee(empId) {
    if (confirm('¿Estás seguro de eliminar este empleado?')) {
        state.employees = state.employees.filter(emp => emp.id !== empId);
        saveEmployees();
        renderEmployees();
        showToast('✅ Empleado eliminado', 'success');
    }
}

/* ---- RECRUITMENT ---- */
function renderPositions() {
    const tbody = document.getElementById('positionsTableBody');
    
    if (state.positions.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" class="empty-state">
                    <p>No hay vacantes abiertas</p>
                </td>
            </tr>
        `;
        return;
    }
    
    tbody.innerHTML = state.positions.map(pos => `
        <tr>
            <td>${pos.title}</td>
            <td>${pos.department}</td>
            <td>${pos.type}</td>
            <td>$${pos.salary}</td>
            <td><span class="status-badge ${pos.status}">${getStatusText(pos.status)}</span></td>
            <td>
                <button class="btn btn-sm btn-primary" onclick="editPosition('${pos.id}')">Editar</button>
                <button class="btn btn-sm btn-danger" onclick="deletePosition('${pos.id}')">Eliminar</button>
            </td>
        </tr>
    `).join('');
}

function showAddPositionModal() {
    // Implementar modal para agregar posición
    showToast('📝 Función en desarrollo', 'info');
}

/* ---- PAYROLL ---- */
function renderPayroll() {
    const tbody = document.getElementById('payrollTableBody');
    
    if (state.payroll.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="7" class="empty-state">
                    <p>No hay registros de nómina</p>
                </td>
            </tr>
        `;
        return;
    }
    
    tbody.innerHTML = state.payroll.map(record => `
        <tr>
            <td>${record.employee}</td>
            <td>$${record.baseSalary}</td>
            <td>$${record.bonuses}</td>
            <td>$${record.deductions}</td>
            <td>$${record.total}</td>
            <td><span class="status-badge ${record.status}">${getStatusText(record.status)}</span></td>
            <td>
                <button class="btn btn-sm btn-primary" onclick="viewPayrollDetails('${record.id}')">Ver</button>
            </td>
        </tr>
    `).join('');
}

function generatePayroll() {
    // Generar nómina para todos los empleados activos
    const activeEmployees = state.employees.filter(emp => emp.status === 'active');
    
    activeEmployees.forEach(emp => {
        const payrollRecord = {
            id: `payroll_${Date.now()}_${emp.id}`,
            employee: `${emp.firstName} ${emp.lastName}`,
            baseSalary: emp.salary || 0,
            bonuses: 0,
            deductions: 0,
            total: emp.salary || 0,
            status: 'pending',
            period: new Date().toISOString(),
            employeeId: emp.id
        };
        
        state.payroll.push(payrollRecord);
    });
    
    savePayroll();
    renderPayroll();
    showToast('✅ Nómina generada correctamente', 'success');
}

async function savePayroll() {
    try {
        const response = await fetch('/api/save', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ payroll: state.payroll })
        });
    } catch (error) {
        console.error('Error guardando nómina:', error);
    }
}

/* ---- DOCUMENTS ---- */
function renderDocuments() {
    const tbody = document.getElementById('documentsTableBody');
    
    if (state.documents.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" class="empty-state">
                    <p>No hay documentos registrados</p>
                </td>
            </tr>
        `;
        return;
    }
    
    tbody.innerHTML = state.documents.map(doc => `
        <tr>
            <td>${doc.employee}</td>
            <td>${doc.name}</td>
            <td>${doc.type}</td>
            <td>${new Date(doc.date).toLocaleDateString()}</td>
            <td><span class="status-badge ${doc.status}">${getStatusText(doc.status)}</span></td>
            <td>
                <button class="btn btn-sm btn-primary" onclick="downloadDocument('${doc.id}')">Descargar</button>
                <button class="btn btn-sm btn-danger" onclick="deleteDocument('${doc.id}')">Eliminar</button>
            </td>
        </tr>
    `).join('');
}

function showUploadDocumentModal() {
    showToast('📄 Función en desarrollo', 'info');
}

/* ---- PERMISSIONS ---- */
function renderPermissions() {
    const tbody = document.getElementById('permissionsTableBody');
    
    if (state.permissions.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="7" class="empty-state">
                    <p>No hay solicitudes de permiso</p>
                </td>
            </tr>
        `;
        return;
    }
    
    tbody.innerHTML = state.permissions.map(perm => `
        <tr>
            <td>${perm.employee}</td>
            <td>${perm.type}</td>
            <td>${new Date(perm.startDate).toLocaleDateString()}</td>
            <td>${new Date(perm.endDate).toLocaleDateString()}</td>
            <td>${perm.reason}</td>
            <td><span class="status-badge ${perm.status}">${getStatusText(perm.status)}</span></td>
            <td>
                <button class="btn btn-sm btn-primary" onclick="approvePermission('${perm.id}')">Aprobar</button>
                <button class="btn btn-sm btn-danger" onclick="rejectPermission('${perm.id}')">Rechazar</button>
            </td>
        </tr>
    `).join('');
}

function showAddPermissionModal() {
    showToast('📝 Función en desarrollo', 'info');
}

/* ---- DASHBOARD ---- */
function updateDashboard() {
    updateStats();
    renderRecentEmployees();
    renderRecentActivity();
}

function updateStats() {
    state.stats.totalEmployees = state.employees.length;
    state.stats.activeEmployees = state.employees.filter(emp => emp.status === 'active').length;
    state.stats.openPositions = state.positions.filter(pos => pos.status === 'open').length;
    state.stats.pendingDocuments = state.documents.filter(doc => doc.status === 'pending').length;
    
    // Update UI
    document.getElementById('totalEmployees').textContent = state.stats.totalEmployees;
    document.getElementById('activeEmployees').textContent = state.stats.activeEmployees;
    document.getElementById('openPositions').textContent = state.stats.openPositions;
    document.getElementById('pendingDocuments').textContent = state.stats.pendingDocuments;
}

function renderRecentEmployees() {
    const container = document.getElementById('recentEmployees');
    const recentEmployees = state.employees
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        .slice(0, 5);
    
    if (recentEmployees.length === 0) {
        container.innerHTML = '<p class="empty-state">No hay empleados recientes</p>';
        return;
    }
    
    container.innerHTML = recentEmployees.map(emp => `
        <div class="recent-item">
            <div class="recent-avatar">${emp.avatar || emp.firstName[0]}</div>
            <div class="recent-info">
                <div class="recent-name">${emp.firstName} ${emp.lastName}</div>
                <div class="recent-detail">${emp.dept} • ${emp.role}</div>
            </div>
        </div>
    `).join('');
}

function renderRecentActivity() {
    const container = document.getElementById('recentActivity');
    container.innerHTML = '<p class="empty-state">No hay actividad reciente</p>';
}

/* ---- SETTINGS ---- */
function loadSettings() {
    const saved = localStorage.getItem('rrhhSettings');
    if (saved) {
        state.config = { ...state.config, ...JSON.parse(saved) };
    }
}

function saveSettings() {
    state.config = {
        companyName: document.getElementById('companyName').value,
        companyAddress: document.getElementById('companyAddress').value,
        companyPhone: document.getElementById('companyPhone').value,
        hrAdmin: document.getElementById('hrAdmin').value,
        emailNotifications: document.getElementById('emailNotifications').value
    };
    
    localStorage.setItem('rrhhSettings', JSON.stringify(state.config));
    showToast('✅ Configuración guardada', 'success');
}

function loadSettings() {
    document.getElementById('companyName').value = state.config.companyName;
    document.getElementById('companyAddress').value = state.config.companyAddress;
    document.getElementById('companyPhone').value = state.config.companyPhone;
    document.getElementById('hrAdmin').value = state.config.hrAdmin;
    document.getElementById('emailNotifications').value = state.config.emailNotifications;
}

function clearData() {
    if (confirm('¿Estás seguro de limpiar todos los datos? Esta acción no se puede deshacer.')) {
        state.employees = [];
        state.positions = [];
        state.applications = [];
        state.payroll = [];
        state.documents = [];
        state.permissions = [];
        
        localStorage.removeItem('rrhhSettings');
        saveEmployees();
        updateDashboard();
        showToast('✅ Datos limpiados', 'success');
    }
}

/* ---- EXPORT FUNCTIONS ---- */
function exportEmployees() {
    const ws = XLSX.utils.json_to_sheet(state.employees);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Empleados");
    XLSX.writeFile(wb, "empleados.xlsx");
    showToast('📊 Datos exportados correctamente', 'success');
}

function exportPayroll() {
    const ws = XLSX.utils.json_to_sheet(state.payroll);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Nómina");
    XLSX.writeFile(wb, "nomina.xlsx");
    showToast('📊 Nómina exportada correctamente', 'success');
}

/* ---- UTILITY FUNCTIONS ---- */
function getStatusText(status) {
    const statusMap = {
        'active': 'Activo',
        'inactive': 'Inactivo',
        'suspended': 'Suspendido',
        'open': 'Abierta',
        'closed': 'Cerrada',
        'pending': 'Pendiente',
        'approved': 'Aprobado',
        'rejected': 'Rechazado'
    };
    return statusMap[status] || status;
}

function updateClocks() {
    const now = new Date();
    const timeString = now.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
    const dateString = now.toLocaleDateString('es-MX', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    
    const timeElements = document.querySelectorAll('.topbar-time');
    const dateElements = document.querySelectorAll('.topbar-date');
    
    timeElements.forEach(el => el.textContent = timeString);
    dateElements.forEach(el => el.textContent = dateString);
}

function showToast(message, type = 'info') {
    // Simple toast implementation
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    toast.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 15px 20px;
        border-radius: 8px;
        color: white;
        font-weight: 500;
        z-index: 9999;
        animation: slideIn 0.3s ease;
        ${type === 'success' ? 'background: #10b981;' : ''}
        ${type === 'error' ? 'background: #f43f5e;' : ''}
        ${type === 'info' ? 'background: #6366f1;' : ''}
    `;
    
    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.remove();
    }, 3000);
}

// Add slideIn animation
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
    }
`;
document.head.appendChild(style);
