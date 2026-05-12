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
    try {
        // Hide all pages
        document.querySelectorAll('.page').forEach(page => {
            page.classList.remove('active');
        });
        
        // Show selected page
        const selectedPage = document.getElementById(`page-${pageId}`);
        if (selectedPage) {
            selectedPage.classList.add('active');
        }
        
        // Update nav
        document.querySelectorAll('.nav-item').forEach(item => {
            item.classList.remove('active');
        });
        const navItem = document.getElementById(`nav-${pageId}`);
        if (navItem) {
            navItem.classList.add('active');
        }
        
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
    } catch (error) {
        console.error('Error en showPage:', error);
        showToast('❌ Error al cambiar de página', 'error');
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
    const modal = document.getElementById('addEmployeeModal');
    if (modal) {
        modal.classList.remove('hidden');
        modal.classList.add('active');
    }
}

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.remove('active');
        modal.classList.add('hidden');
    }
}

function showModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.remove('hidden');
        modal.classList.add('active');
    }
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

function viewPayrollDetails(recordId) {
    const record = state.payroll.find(r => r.id === recordId);
    if (!record) return;
    
    const modal = document.createElement('div');
    modal.className = 'modal active large-modal';
    modal.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <h3>Detalles de Nómina</h3>
                <button class="modal-close" onclick="closeModal('payrollDetailsModal')">×</button>
            </div>
            <div class="modal-body">
                <div class="form-grid">
                    <div class="form-group">
                        <label>Empleado</label>
                        <input type="text" value="${record.employee}" readonly>
                    </div>
                    <div class="form-group">
                        <label>Salario Base</label>
                        <input type="number" value="${record.baseSalary}" readonly>
                    </div>
                    <div class="form-group">
                        <label>Bonos</label>
                        <input type="number" value="${record.bonuses}" readonly>
                    </div>
                    <div class="form-group">
                        <label>Deducciones</label>
                        <input type="number" value="${record.deductions}" readonly>
                    </div>
                    <div class="form-group">
                        <label>Total</label>
                        <input type="number" value="${record.total}" readonly>
                    </div>
                    <div class="form-group">
                        <label>Estado</label>
                        <input type="text" value="${getStatusText(record.status)}" readonly>
                    </div>
                    <div class="form-group">
                        <label>Período</label>
                        <input type="text" value="${new Date(record.period).toLocaleDateString()}" readonly>
                    </div>
                </div>
            </div>
            <div class="modal-footer">
                <button class="btn btn-secondary" onclick="closeModal('payrollDetailsModal')">Cerrar</button>
                <button class="btn btn-primary" onclick="printPayroll('${recordId}')">Imprimir</button>
            </div>
        </div>
    `;
    modal.id = 'payrollDetailsModal';
    document.body.appendChild(modal);
}

function printPayroll(recordId) {
    const record = state.payroll.find(r => r.id === recordId);
    if (record) {
        showToast('🖨️ Imprimiendo detalles de nómina...', 'info');
        window.print();
    }
}

function editEmployee(empId) {
    try {
        const employee = state.employees.find(emp => emp.id === empId);
        if (!employee) {
            showToast('❌ Empleado no encontrado', 'error');
            return;
        }
        
        // Eliminar modal existente si hay
        const existingModal = document.getElementById('editEmployeeModal');
        if (existingModal) {
            existingModal.remove();
        }
        
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h3>Editar Empleado</h3>
                    <button class="modal-close" onclick="closeModal('editEmployeeModal')">×</button>
                </div>
                <form class="modal-body" onsubmit="updateEmployee(event, '${empId}')">
                    <div class="form-grid">
                        <div class="form-group">
                            <label>Nombre</label>
                            <input type="text" id="editEmpFirstName" value="${employee.firstName}" required>
                        </div>
                        <div class="form-group">
                            <label>Apellido</label>
                            <input type="text" id="editEmpLastName" value="${employee.lastName}" required>
                        </div>
                        <div class="form-group">
                            <label>Número de Empleado</label>
                            <input type="text" id="editEmpNumber" value="${employee.empNum}" required>
                        </div>
                        <div class="form-group">
                            <label>Departamento</label>
                            <select id="editEmpDept" required>
                                <option value="RRHH" ${employee.dept === 'RRHH' ? 'selected' : ''}>RRHH</option>
                                <option value="OPERACIONES" ${employee.dept === 'OPERACIONES' ? 'selected' : ''}>OPERACIONES</option>
                                <option value="VENTAS" ${employee.dept === 'VENTAS' ? 'selected' : ''}>VENTAS</option>
                                <option value="TI" ${employee.dept === 'TI' ? 'selected' : ''}>TI</option>
                                <option value="FINANZAS" ${employee.dept === 'FINANZAS' ? 'selected' : ''}>FINANZAS</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label>Puesto</label>
                            <input type="text" id="editEmpRole" value="${employee.role}" required>
                        </div>
                        <div class="form-group">
                            <label>Email</label>
                            <input type="email" id="editEmpEmail" value="${employee.email}" required>
                        </div>
                        <div class="form-group">
                            <label>Teléfono</label>
                            <input type="tel" id="editEmpPhone" value="${employee.phone}">
                        </div>
                        <div class="form-group">
                            <label>Salario</label>
                            <input type="number" id="editEmpSalary" value="${employee.salary}" step="0.01" required>
                        </div>
                        <div class="form-group">
                            <label>Estado</label>
                            <select id="editEmpStatus" required>
                                <option value="active" ${employee.status === 'active' ? 'selected' : ''}>Activo</option>
                                <option value="inactive" ${employee.status === 'inactive' ? 'selected' : ''}>Inactivo</option>
                                <option value="suspended" ${employee.status === 'suspended' ? 'selected' : ''}>Suspendido</option>
                            </select>
                        </div>
                    </div>
                    <div class="modal-actions">
                        <button type="button" class="btn btn-secondary" onclick="closeModal('editEmployeeModal')">Cancelar</button>
                        <button type="submit" class="btn btn-primary">Actualizar</button>
                    </div>
                </form>
            </div>
        `;
        modal.id = 'editEmployeeModal';
        document.body.appendChild(modal);
        
        // Mostrar modal
        setTimeout(() => {
            modal.classList.add('active');
        }, 10);
    } catch (error) {
        console.error('Error en editEmployee:', error);
        showToast('❌ Error al editar empleado', 'error');
    }
}

function updateEmployee(event, empId) {
    event.preventDefault();
    
    const employeeIndex = state.employees.findIndex(emp => emp.id === empId);
    if (employeeIndex === -1) return;
    
    state.employees[employeeIndex] = {
        ...state.employees[employeeIndex],
        firstName: document.getElementById('editEmpFirstName').value.toUpperCase(),
        lastName: document.getElementById('editEmpLastName').value.toUpperCase(),
        empNum: document.getElementById('editEmpNumber').value,
        dept: document.getElementById('editEmpDept').value,
        role: document.getElementById('editEmpRole').value.toUpperCase(),
        email: document.getElementById('editEmpEmail').value,
        phone: document.getElementById('editEmpPhone').value,
        salary: parseFloat(document.getElementById('editEmpSalary').value),
        status: document.getElementById('editEmpStatus').value,
        updatedAt: new Date().toISOString()
    };
    
    saveEmployees();
    renderEmployees();
    closeModal('editEmployeeModal');
    showToast('✅ Empleado actualizado correctamente', 'success');
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
    // Eliminar modal existente si hay
    const existingModal = document.getElementById('addPositionModal');
    if (existingModal) {
        existingModal.remove();
    }
    
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <h3>Agregar Vacante</h3>
                <button class="modal-close" onclick="closeModal('addPositionModal')">×</button>
            </div>
            <form class="modal-body" onsubmit="addPosition(event)">
                <div class="form-grid">
                    <div class="form-group">
                        <label>Puesto</label>
                        <input type="text" id="posTitle" required>
                    </div>
                    <div class="form-group">
                        <label>Departamento</label>
                        <select id="posDepartment" required>
                            <option value="">Seleccionar...</option>
                            <option value="RRHH">RRHH</option>
                            <option value="OPERACIONES">OPERACIONES</option>
                            <option value="VENTAS">VENTAS</option>
                            <option value="TI">TI</option>
                            <option value="FINANZAS">FINANZAS</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Tipo</label>
                        <select id="posType" required>
                            <option value="">Seleccionar...</option>
                            <option value="tiempo-completo">Tiempo Completo</option>
                            <option value="medio-tiempo">Medio Tiempo</option>
                            <option value="temporal">Temporal</option>
                            <option value="practicas">Prácticas</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Salario</label>
                        <input type="number" id="posSalary" step="0.01" required>
                    </div>
                    <div class="form-group">
                        <label>Descripción</label>
                        <textarea id="posDescription" rows="3" required></textarea>
                    </div>
                </div>
                <div class="modal-actions">
                    <button type="button" class="btn btn-secondary" onclick="closeModal('addPositionModal')">Cancelar</button>
                    <button type="submit" class="btn btn-primary">Agregar</button>
                </div>
            </form>
        </div>
    `;
    modal.id = 'addPositionModal';
    document.body.appendChild(modal);
    
    // Mostrar modal
    setTimeout(() => {
        modal.classList.add('active');
    }, 10);
}

function addPosition(event) {
    event.preventDefault();
    
    const position = {
        id: `pos_${Date.now()}`,
        title: document.getElementById('posTitle').value.toUpperCase(),
        department: document.getElementById('posDepartment').value,
        type: document.getElementById('posType').value,
        salary: parseFloat(document.getElementById('posSalary').value),
        description: document.getElementById('posDescription').value,
        status: 'open',
        createdAt: new Date().toISOString()
    };
    
    state.positions.push(position);
    savePositions();
    renderPositions();
    closeModal('addPositionModal');
    showToast('✅ Vacante agregada correctamente', 'success');
}

async function savePositions() {
    try {
        const response = await fetch('/api/save', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ positions: state.positions })
        });
        
        if (response.ok) {
            updateStats();
        }
    } catch (error) {
        console.error('Error guardando posiciones:', error);
    }
}

function editPosition(posId) {
    const position = state.positions.find(pos => pos.id === posId);
    if (!position) return;
    
    // Implementar edición de posición
    showToast('📝 Función en desarrollo', 'info');
}

function deletePosition(posId) {
    if (confirm('¿Estás seguro de eliminar esta vacante?')) {
        state.positions = state.positions.filter(pos => pos.id !== posId);
        savePositions();
        renderPositions();
        closeModal('addPositionModal');
        showToast('✅ Vacante eliminada', 'success');
    }
}

/* ---- PAYROLL ---- */
function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.remove('active');
        setTimeout(() => {
            modal.remove();
        }, 300);
    }
}

function showModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.add('active');
    }
}

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
    // Eliminar modal existente si hay
    const existingModal = document.getElementById('uploadDocumentModal');
    if (existingModal) {
        existingModal.remove();
    }
    
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <h3>Subir Documento</h3>
                <button class="modal-close" onclick="closeModal('uploadDocumentModal')">×</button>
            </div>
            <form class="modal-body" onsubmit="uploadDocument(event)">
                <div class="form-grid">
                    <div class="form-group">
                        <label>Empleado</label>
                        <select id="docEmployee" required>
                            <option value="">Seleccionar...</option>
                            ${state.employees.map(emp => `<option value="${emp.id}">${emp.firstName} ${emp.lastName}</option>`).join('')}
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Nombre del Documento</label>
                        <input type="text" id="docName" required>
                    </div>
                    <div class="form-group">
                        <label>Tipo</label>
                        <select id="docType" required>
                            <option value="">Seleccionar...</option>
                            <option value="contrato">Contrato</option>
                            <option value="dni">DNI</option>
                            <option value="curriculum">Currículum</option>
                            <option value="certificado">Certificado</option>
                            <option value="otro">Otro</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Archivo</label>
                        <input type="file" id="docFile" accept=".pdf,.doc,.docx,.jpg,.png" required>
                    </div>
                </div>
                <div class="modal-actions">
                    <button type="button" class="btn btn-secondary" onclick="closeModal('uploadDocumentModal')">Cancelar</button>
                    <button type="submit" class="btn btn-primary">Subir</button>
                </div>
            </form>
        </div>
    `;
    modal.id = 'uploadDocumentModal';
    document.body.appendChild(modal);
    
    // Mostrar modal
    setTimeout(() => {
        modal.classList.add('active');
    }, 10);
}

function uploadDocument(event) {
    event.preventDefault();
    
    const employeeId = document.getElementById('docEmployee').value;
    const employee = state.employees.find(emp => emp.id === employeeId);
    
    if (!employee) {
        showToast('❌ Debes seleccionar un empleado', 'error');
        return;
    }
    
    const document = {
        id: `doc_${Date.now()}`,
        employee: `${employee.firstName} ${employee.lastName}`,
        employeeId: employeeId,
        name: document.getElementById('docName').value,
        type: document.getElementById('docType').value,
        date: new Date().toISOString(),
        status: 'pending'
    };
    
    state.documents.push(document);
    saveDocuments();
    renderDocuments();
    closeModal('uploadDocumentModal');
    showToast('✅ Documento subido correctamente', 'success');
}

async function saveDocuments() {
    try {
        const response = await fetch('/api/save', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ documents: state.documents })
        });
        
        if (response.ok) {
            updateStats();
        }
    } catch (error) {
        console.error('Error guardando documentos:', error);
    }
}

function downloadDocument(docId) {
    const document = state.documents.find(doc => doc.id === docId);
    if (document) {
        showToast(`📄 Descargando: ${document.name}`, 'info');
        // Implementar descarga real del archivo
    }
}

function deleteDocument(docId) {
    if (confirm('¿Estás seguro de eliminar este documento?')) {
        state.documents = state.documents.filter(doc => doc.id !== docId);
        saveDocuments();
        renderDocuments();
        showToast('✅ Documento eliminado', 'success');
    }
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
    // Eliminar modal existente si hay
    const existingModal = document.getElementById('addPermissionModal');
    if (existingModal) {
        existingModal.remove();
    }
    
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <h3>Solicitar Permiso</h3>
                <button class="modal-close" onclick="closeModal('addPermissionModal')">×</button>
            </div>
            <form class="modal-body" onsubmit="addPermission(event)">
                <div class="form-grid">
                    <div class="form-group">
                        <label>Empleado</label>
                        <select id="permEmployee" required>
                            <option value="">Seleccionar...</option>
                            ${state.employees.map(emp => `<option value="${emp.id}">${emp.firstName} ${emp.lastName}</option>`).join('')}
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Tipo de Permiso</label>
                        <select id="permType" required>
                            <option value="">Seleccionar...</option>
                            <option value="vacaciones">Vacaciones</option>
                            <option value="enfermedad">Enfermedad</option>
                            <option value="personal">Personal</option>
                            <option value="duelo">Duelo</option>
                            <option value="maternidad">Maternidad</option>
                            <option value="otro">Otro</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Fecha Inicio</label>
                        <input type="date" id="permStartDate" required>
                    </div>
                    <div class="form-group">
                        <label>Fecha Fin</label>
                        <input type="date" id="permEndDate" required>
                    </div>
                    <div class="form-group">
                        <label>Motivo</label>
                        <textarea id="permReason" rows="3" required></textarea>
                    </div>
                </div>
                <div class="modal-actions">
                    <button type="button" class="btn btn-secondary" onclick="closeModal('addPermissionModal')">Cancelar</button>
                    <button type="submit" class="btn btn-primary">Solicitar</button>
                </div>
            </form>
        </div>
    `;
    modal.id = 'addPermissionModal';
    document.body.appendChild(modal);
    
    // Mostrar modal
    setTimeout(() => {
        modal.classList.add('active');
    }, 10);
}

function addPermission(event) {
    event.preventDefault();
    
    const employeeId = document.getElementById('permEmployee').value;
    const employee = state.employees.find(emp => emp.id === employeeId);
    
    if (!employee) {
        showToast('❌ Debes seleccionar un empleado', 'error');
        return;
    }
    
    const permission = {
        id: `perm_${Date.now()}`,
        employee: `${employee.firstName} ${employee.lastName}`,
        employeeId: employeeId,
        type: document.getElementById('permType').value,
        startDate: document.getElementById('permStartDate').value,
        endDate: document.getElementById('permEndDate').value,
        reason: document.getElementById('permReason').value,
        status: 'pending',
        requestedAt: new Date().toISOString()
    };
    
    state.permissions.push(permission);
    savePermissions();
    renderPermissions();
    closeModal('addPermissionModal');
    showToast('✅ Permiso solicitado correctamente', 'success');
}

async function savePermissions() {
    try {
        const response = await fetch('/api/save', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ permissions: state.permissions })
        });
        
        if (response.ok) {
            updateStats();
        }
    } catch (error) {
        console.error('Error guardando permisos:', error);
    }
}

function approvePermission(permId) {
    if (confirm('¿Estás seguro de aprobar este permiso?')) {
        const permission = state.permissions.find(perm => perm.id === permId);
        if (permission) {
            permission.status = 'approved';
            permission.approvedAt = new Date().toISOString();
            savePermissions();
            renderPermissions();
            showToast('✅ Permiso aprobado', 'success');
        }
    }
}

function rejectPermission(permId) {
    if (confirm('¿Estás seguro de rechazar este permiso?')) {
        const permission = state.permissions.find(perm => perm.id === permId);
        if (permission) {
            permission.status = 'rejected';
            permission.rejectedAt = new Date().toISOString();
            savePermissions();
            renderPermissions();
            showToast('❌ Permiso rechazado', 'error');
        }
    }
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
