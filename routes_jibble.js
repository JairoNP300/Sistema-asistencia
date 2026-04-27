/**
 * Script to inject Jibble UI into index.html and app.js
 * Run: node routes_jibble.js
 */
const fs = require('fs');
const path = require('path');

// ---- UPDATE index.html ----
let html = fs.readFileSync('index.html', 'utf8');

// 1. Add sidebar nav items after Reportes button
const navMarker = '                    Reportes\n                </button>\n            </div>';
const navReplacement = `                    Reportes
                </button>
                <button class="nav-item" id="nav-timer" onclick="showPage('timer')">&#9201; Timer</button>
                <button class="nav-item" id="nav-timeoff" onclick="showPage('timeoff')">&#127958; Time Off</button>
                <button class="nav-item" id="nav-approvals" onclick="showPage('approvals')">&#9989; Aprobaciones</button>
                <button class="nav-item" id="nav-schedules" onclick="showPage('schedules')">&#128197; Horarios</button>
                <button class="nav-item" id="nav-groups" onclick="showPage('groups')">&#128101; Grupos</button>
                <button class="nav-item" id="nav-projects" onclick="showPage('projects')">&#128193; Proyectos</button>
                <button class="nav-item" id="nav-invoicing" onclick="showPage('invoicing')">&#128176; Facturacion</button>
                <button class="nav-item" id="nav-reports-advanced" onclick="showPage('reports-advanced')">&#128202; Reportes Avanzados</button>
                <button class="nav-item" id="nav-geofences" onclick="showPage('geofences')">&#128205; Geofences</button>
            </div>`;

if (html.includes(navMarker)) {
  html = html.replace(navMarker, navReplacement);
  console.log('Sidebar nav items added');
} else {
  console.log('WARNING: Sidebar nav marker not found');
}

// 2. Add new page sections before </main>
const pagesMarker = '        </main>';
const newPages = `
        <!-- === TIMER === -->
        <section class="page" id="page-timer">
          <div class="panel">
            <div class="panel-header"><h3>&#9201; Timer — Registro de Tiempo</h3><span id="timerOfflineBadge" class="nav-badge" style="display:none;background:#f59e0b">OFFLINE</span></div>
            <div style="display:flex;gap:16px;flex-wrap:wrap;margin-bottom:16px">
              <div style="flex:1;min-width:200px">
                <label class="form-label">Empleado</label>
                <select id="timerEmpSelect" class="form-input" style="width:100%"><option value="">Seleccionar...</option></select>
              </div>
              <div style="flex:1;min-width:200px">
                <label class="form-label">Proyecto</label>
                <select id="timerProjectSelect" class="form-input" style="width:100%"><option value="">Sin proyecto</option></select>
              </div>
            </div>
            <div style="display:flex;gap:12px;margin-bottom:20px">
              <button class="btn-primary" onclick="timerClockIn()">&#9654; Clock In</button>
              <button class="btn-ghost" onclick="timerClockOut()">&#9632; Clock Out</button>
            </div>
            <div class="panel-header"><h3>Entradas Activas</h3></div>
            <div id="timerActiveList" class="activity-feed"><div class="empty-feed">No hay entradas activas.</div></div>
          </div>
        </section>

        <!-- === TIME OFF === -->
        <section class="page" id="page-timeoff">
          <div class="panel">
            <div class="panel-header"><h3>&#127958; Time Off — Ausencias y Permisos</h3></div>
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin-bottom:16px">
              <div>
                <label class="form-label">Tipo</label>
                <select id="toType" class="form-input" style="width:100%">
                  <option value="vacation">Vacaciones</option>
                  <option value="sick">Enfermedad</option>
                  <option value="personal">Personal</option>
                  <option value="unpaid">Sin goce</option>
                  <option value="other">Otro</option>
                </select>
              </div>
              <div>
                <label class="form-label">Fecha inicio</label>
                <input type="date" id="toStart" class="form-input" style="width:100%" />
              </div>
              <div>
                <label class="form-label">Fecha fin</label>
                <input type="date" id="toEnd" class="form-input" style="width:100%" />
              </div>
              <div>
                <label class="form-label">Motivo</label>
                <input type="text" id="toReason" class="form-input" placeholder="Motivo..." style="width:100%" />
              </div>
            </div>
            <div style="margin-bottom:16px">
              <label class="form-label">Empleado</label>
              <select id="toEmpSelect" class="form-input" style="width:100%;max-width:300px"><option value="">Seleccionar...</option></select>
            </div>
            <button class="btn-primary" onclick="submitTimeOff()">Solicitar</button>
            <div class="panel-header" style="margin-top:20px"><h3>Solicitudes</h3></div>
            <div class="table-wrap"><table class="data-table"><thead><tr><th>Empleado</th><th>Tipo</th><th>Inicio</th><th>Fin</th><th>Dias</th><th>Estado</th><th>Acciones</th></tr></thead><tbody id="timeoffTableBody"></tbody></table></div>
          </div>
        </section>

        <!-- === APPROVALS === -->
        <section class="page" id="page-approvals">
          <div class="panel">
            <div class="panel-header"><h3>&#9989; Aprobaciones</h3><button class="btn-ghost sm" onclick="renderApprovals()">Refrescar</button></div>
            <div class="table-wrap"><table class="data-table"><thead><tr><th>Tipo</th><th>Empleado</th><th>Referencia</th><th>Fecha</th><th>Estado</th><th>Acciones</th></tr></thead><tbody id="approvalsTableBody"></tbody></table></div>
          </div>
        </section>

        <!-- === SCHEDULES === -->
        <section class="page" id="page-schedules">
          <div class="panel">
            <div class="panel-header"><h3>&#128197; Horarios</h3></div>
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin-bottom:16px">
              <div><label class="form-label">Nombre</label><input type="text" id="schName" class="form-input" placeholder="Horario Matutino" style="width:100%" /></div>
              <div><label class="form-label">Asignado a</label><select id="schAssignedTo" class="form-input" style="width:100%"><option value="employee">Empleado</option><option value="group">Grupo</option></select></div>
              <div><label class="form-label">ID Asignado</label><input type="text" id="schAssignedId" class="form-input" placeholder="ID del empleado o grupo" style="width:100%" /></div>
              <div><label class="form-label">Desde</label><input type="date" id="schFrom" class="form-input" style="width:100%" /></div>
            </div>
            <button class="btn-primary" onclick="saveSchedule()">Guardar Horario</button>
            <div class="panel-header" style="margin-top:20px"><h3>Horarios Existentes</h3></div>
            <div class="table-wrap"><table class="data-table"><thead><tr><th>Nombre</th><th>Asignado a</th><th>ID</th><th>Desde</th><th>Acciones</th></tr></thead><tbody id="schedulesTableBody"></tbody></table></div>
          </div>
        </section>

        <!-- === GROUPS === -->
        <section class="page" id="page-groups">
          <div class="panel">
            <div class="panel-header"><h3>&#128101; Grupos</h3></div>
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin-bottom:16px">
              <div><label class="form-label">Nombre</label><input type="text" id="grpName" class="form-input" placeholder="Nombre del grupo" style="width:100%" /></div>
              <div><label class="form-label">Descripcion</label><input type="text" id="grpDesc" class="form-input" placeholder="Descripcion" style="width:100%" /></div>
              <div><label class="form-label">Managers (IDs, coma)</label><input type="text" id="grpManagers" class="form-input" placeholder="id1,id2" style="width:100%" /></div>
              <div><label class="form-label">Miembros (IDs, coma)</label><input type="text" id="grpMembers" class="form-input" placeholder="id1,id2" style="width:100%" /></div>
            </div>
            <button class="btn-primary" onclick="saveGroup()">Guardar Grupo</button>
            <div class="panel-header" style="margin-top:20px"><h3>Grupos Existentes</h3></div>
            <div class="table-wrap"><table class="data-table"><thead><tr><th>Nombre</th><th>Descripcion</th><th>Miembros</th><th>Acciones</th></tr></thead><tbody id="groupsTableBody"></tbody></table></div>
          </div>
        </section>

        <!-- === PROJECTS === -->
        <section class="page" id="page-projects">
          <div class="panel">
            <div class="panel-header"><h3>&#128193; Proyectos</h3></div>
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin-bottom:16px">
              <div><label class="form-label">Nombre</label><input type="text" id="projName" class="form-input" placeholder="Nombre del proyecto" style="width:100%" /></div>
              <div><label class="form-label">Codigo</label><input type="text" id="projCode" class="form-input" placeholder="PROJ-001" style="width:100%" /></div>
              <div><label class="form-label">Cliente</label><input type="text" id="projClient" class="form-input" placeholder="Cliente" style="width:100%" /></div>
              <div><label class="form-label">Tarifa/hora</label><input type="number" id="projRate" class="form-input" placeholder="0" style="width:100%" /></div>
              <div><label class="form-label">Moneda</label><input type="text" id="projCurrency" class="form-input" value="MXN" style="width:100%" /></div>
              <div><label class="form-label">Facturable</label><select id="projBillable" class="form-input" style="width:100%"><option value="true">Si</option><option value="false">No</option></select></div>
            </div>
            <button class="btn-primary" onclick="saveProject()">Guardar Proyecto</button>
            <div class="panel-header" style="margin-top:20px"><h3>Proyectos</h3></div>
            <div class="table-wrap"><table class="data-table"><thead><tr><th>Nombre</th><th>Codigo</th><th>Cliente</th><th>Tarifa</th><th>Estado</th><th>Acciones</th></tr></thead><tbody id="projectsTableBody"></tbody></table></div>
          </div>
        </section>

        <!-- === INVOICING === -->
        <section class="page" id="page-invoicing">
          <div class="panel">
            <div class="panel-header"><h3>&#128176; Facturacion</h3></div>
            <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:16px;align-items:flex-end">
              <div><label class="form-label">Proyecto</label><select id="invProject" class="form-input" style="width:200px"><option value="">Seleccionar...</option></select></div>
              <div><label class="form-label">Periodo inicio</label><input type="date" id="invStart" class="form-input" /></div>
              <div><label class="form-label">Periodo fin</label><input type="date" id="invEnd" class="form-input" /></div>
              <button class="btn-primary" onclick="generateInvoice()">Generar Factura</button>
            </div>
            <div class="panel-header" style="margin-top:20px"><h3>Facturas</h3></div>
            <div class="table-wrap"><table class="data-table"><thead><tr><th>Proyecto</th><th>Periodo</th><th>Horas</th><th>Total</th><th>Estado</th><th>Acciones</th></tr></thead><tbody id="invoicingTableBody"></tbody></table></div>
          </div>
        </section>

        <!-- === REPORTS ADVANCED === -->
        <section class="page" id="page-reports-advanced">
          <div class="panel">
            <div class="panel-header"><h3>&#128202; Reportes Avanzados</h3></div>
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;margin-bottom:16px">
              <div><label class="form-label">Empleado</label><select id="rptEmp" class="form-input" style="width:100%"><option value="">Todos</option></select></div>
              <div><label class="form-label">Departamento</label><input type="text" id="rptDept" class="form-input" placeholder="TI, RRHH..." style="width:100%" /></div>
              <div><label class="form-label">Proyecto</label><select id="rptProject" class="form-input" style="width:100%"><option value="">Todos</option></select></div>
              <div><label class="form-label">Desde</label><input type="date" id="rptFrom" class="form-input" style="width:100%" /></div>
              <div><label class="form-label">Hasta</label><input type="date" id="rptTo" class="form-input" style="width:100%" /></div>
            </div>
            <div style="display:flex;gap:8px;margin-bottom:16px">
              <button class="btn-primary" onclick="runAdvancedReport()">Ver Reporte</button>
              <button class="btn-ghost" onclick="runAdvancedReport('csv')">Exportar CSV</button>
              <button class="btn-ghost" onclick="runAdvancedReport('xls')">Exportar XLS</button>
            </div>
            <div class="panel-header"><h3>Actividad en Vivo</h3></div>
            <div id="liveActivityFeed" class="activity-feed" style="margin-bottom:16px"><div class="empty-feed">Cargando...</div></div>
            <div class="panel-header"><h3>Resultados</h3></div>
            <div class="table-wrap"><table class="data-table"><thead><tr><th>Empleado</th><th>Dept</th><th>Proyecto</th><th>Entrada</th><th>Salida</th><th>Horas</th></tr></thead><tbody id="advReportTableBody"></tbody></table></div>
            <div id="advReportTotals" style="margin-top:8px;font-weight:600;color:var(--text-muted)"></div>
          </div>
        </section>

        <!-- === GEOFENCES === -->
        <section class="page" id="page-geofences">
          <div class="panel">
            <div class="panel-header"><h3>&#128205; Geofences</h3></div>
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;margin-bottom:16px">
              <div><label class="form-label">Nombre</label><input type="text" id="gfName" class="form-input" placeholder="Oficina Central" style="width:100%" /></div>
              <div><label class="form-label">Latitud</label><input type="number" id="gfLat" class="form-input" placeholder="19.4326" step="any" style="width:100%" /></div>
              <div><label class="form-label">Longitud</label><input type="number" id="gfLon" class="form-input" placeholder="-99.1332" step="any" style="width:100%" /></div>
              <div><label class="form-label">Radio (metros)</label><input type="number" id="gfRadius" class="form-input" placeholder="100" style="width:100%" /></div>
            </div>
            <button class="btn-primary" onclick="addGeofence()">Agregar Geofence</button>
            <div class="panel-header" style="margin-top:20px"><h3>Geofences Configurados</h3></div>
            <div id="geofencesList" class="activity-feed"><div class="empty-feed">No hay geofences configurados.</div></div>
          </div>
        </section>

        </main>`;

if (html.includes(pagesMarker)) {
  html = html.replace(pagesMarker, newPages);
  console.log('New pages added to index.html');
} else {
  console.log('WARNING: Pages marker not found in index.html');
}

fs.writeFileSync('index.html', html, 'utf8');
console.log('index.html updated');
