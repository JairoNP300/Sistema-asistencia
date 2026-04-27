const fs = require('fs');
const path = require('path');

const routes = `
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
    const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
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
      const csv = [headers, ...csvRows].map(r => r.join(',')).join('\n');
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

`;

const serverPath = path.join(__dirname, 'server.js');
let content = fs.readFileSync(serverPath, 'utf8');
const marker = '// Iniciar\napp.listen';
if (content.includes(marker)) {
  content = content.replace(marker, routes + '\n' + marker);
  fs.writeFileSync(serverPath, content, 'utf8');
  console.log('Routes injected successfully');
} else {
  console.log('Marker not found, appending before last listen');
  const listenIdx = content.lastIndexOf('app.listen');
  content = content.slice(0, listenIdx) + routes + '\n' + content.slice(listenIdx);
  fs.writeFileSync(serverPath, content, 'utf8');
  console.log('Routes appended successfully');
}
