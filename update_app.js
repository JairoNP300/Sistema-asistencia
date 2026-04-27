/**
 * Script to update app.js with new Jibble module pages
 * Run: node update_app.js
 */
const fs = require('fs');

let app = fs.readFileSync('app.js', 'utf8');

// 1. Add new pageTitles entries
const oldTitles = `    admin: ['Configuración', 'Ajustes del sistema'],
};`;
const newTitles = `    admin: ['Configuración', 'Ajustes del sistema'],
    timer: ['Timer', 'Registro de tiempo en tiempo real'],
    timeoff: ['Time Off', 'Gestión de ausencias y permisos'],
    approvals: ['Aprobaciones', 'Revisión y aprobación de registros'],
    schedules: ['Horarios', 'Programación de turnos de trabajo'],
    groups: ['Grupos', 'Organización del equipo'],
    projects: ['Proyectos', 'Seguimiento de tiempo por proyecto'],
    invoicing: ['Facturación', 'Resumen facturable por proyecto'],
    'reports-advanced': ['Reportes Avanzados', 'Análisis detallado de asistencia y tiempo'],
    geofences: ['Geofences', 'Zonas geográficas permitidas'],
};`;

if (app.includes(oldTitles)) {
  app = app.replace(oldTitles, newTitles);
  console.log('pageTitles updated');
} else {
  console.log('WARNING: pageTitles marker not found');
}

// 2. Add new showPage calls
const oldShowPage = `    if (id === 'admin') renderAdminPage();
}`;
const newShowPage = `    if (id === 'admin') renderAdminPage();
    if (id === 'timer') renderTimer();
    if (id === 'timeoff') renderTimeOff();
    if (id === 'approvals') renderApprovals();
    if (id === 'schedules') renderSchedules();
    if (id === 'groups') renderGroups();
    if (id === 'projects') renderProjects();
    if (id === 'invoicing') renderInvoicing();
    if (id === 'reports-advanced') renderReportsAdvanced();
    if (id === 'geofences') renderGeofences();
}`;

if (app.includes(oldShowPage)) {
  app = app.replace(oldShowPage, newShowPage);
  console.log('showPage updated');
} else {
  console.log('WARNING: showPage marker not found');
}

fs.writeFileSync('app.js', app, 'utf8');
console.log('app.js pageTitles/showPage updated');
