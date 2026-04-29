const mongoose = require('mongoose');

const EmployeeSchema = new mongoose.Schema({
    id: String,
    firstName: String,
    lastName: String,
    empNum: String,
    dept: String,
    role: String,
    email: String,
    phone: String,
    status: { type: String, default: 'active' },
    avatar: String,
    createdAt: String,
    lastAccess: String,
    groupIds: [String],
    scheduleId: String,
    pinHash: { type: String, select: false },
    verificationConfig: {
        selfieRequired: { type: Boolean, default: false },
        gpsRequired: { type: Boolean, default: false },
        pinRequired: { type: Boolean, default: false }
    },
    timeOffBalance: {
        vacation: { type: Number, default: 15 },
        sick: { type: Number, default: 7 },
        personal: { type: Number, default: 3 }
    },
    hourlyRate: { type: Number, default: 0 },
    currency: { type: String, default: 'MXN' },
    pinAttempts: { type: Number, default: 0 },
    pinLockedUntil: Date,
    // Campos de RRHH
    monthlySalary: { type: Number, default: 0 }
});

const LogSchema = new mongoose.Schema({
    id: Number,
    empId: String,
    empName: String,
    type: String,
    ts: String,
    tokenNonce: String,
    status: String,
    reason: String,
    source: String,
    location: {
        lat: Number,
        lon: Number,
        accuracy: Number
    },
    geofenceValid: Boolean
});

const LocationRecordSchema = new mongoose.Schema({
    empId: { type: String, required: true },
    empName: { type: String, required: true },
    dept: String,
    lat: { type: Number, required: true },
    lng: { type: Number, required: true },
    accuracy: Number,
    timestamp: { type: String, required: true },
    type: { type: String, enum: ['entry', 'exit'] },
    consentGiven: { type: Boolean, default: true }
});

// Schema para Solicitudes de Empleo
const JobApplicationSchema = new mongoose.Schema({
    id: String,
    // Información Personal
    personalInfo: {
        firstName: String,
        lastName: String,
        dui: String,
        nit: String,
        isss: String,
        afp: String,
        birthDate: String,
        birthPlace: String,
        address: String,
        phone: String,
        email: String,
        maritalStatus: String,
        profession: String
    },
    // Estructura Familiar
    family: {
        fatherName: String,
        motherName: String,
        spouseName: String,
        children: [{
            name: String,
            age: Number
        }]
    },
    // Referencias Personales
    personalReferences: [{
        name: String,
        address: String,
        phone: String,
        occupation: String
    }],
    // Referencias Laborales
    workReferences: [{
        company: String,
        position: String,
        period: String,
        address: String,
        phone: String
    }],
    // Historial Educativo
    education: [{
        level: String,
        institution: String,
        degree: String,
        graduationYear: String
    }],
    // Experiencia Laboral
    workExperience: [{
        company: String,
        position: String,
        period: String,
        responsibilities: String,
        reasonForLeaving: String
    }],
    status: { type: String, default: 'pending' }, // pending, approved, rejected
    createdAt: String,
    updatedAt: String
});

// Schema para Planillas de Sueldos
const PayrollSchema = new mongoose.Schema({
    id: String,
    month: Number,
    year: Number,
    employees: [{
        empId: String,
        empNum: String,
        fullName: String,
        workedDays: Number,
        monthlySalary: Number,
        isss: Number,
        afp: Number,
        renta: Number,
        totalDeductions: Number,
        netPay: Number
    }],
    totals: {
        totalSalary: Number,
        totalISS: Number,
        totalAFP: Number,
        totalRenta: Number,
        totalDeductions: Number,
        totalNetPay: Number
    },
    createdAt: String
});

// Schema para Planillas Semanales (basado en el ejemplo de El Manguito)
const WeeklyPayrollSchema = new mongoose.Schema({
    id: String,
    weekStart: String, // Fecha inicio semana (YYYY-MM-DD)
    weekEnd: String,   // Fecha fin semana (YYYY-MM-DD)
    companyName: { type: String, default: 'EMPRESA EL MANGUITO, S.A. DE C.V.' },
    employees: [{
        empId: String,
        empNum: String,
        fullName: String,
        monthlySalary: Number,    // Sueldo Base Mensual
        daysWorked: { type: Number, default: 7 },        // Días trabajados
        commissions: { type: Number, default: 0 },         // Comisiones
        extraHoursDay: { type: Number, default: 0 },      // Horas Extras Diurnas
        extraHoursNight: { type: Number, default: 0 },    // Horas Extras Nocturnas
        extraHoursAmount: { type: Number, default: 0 }, // Total Horas Extras (calculado)
        subTotal: { type: Number, default: 0 },          // Sub Total
        isss: { type: Number, default: 0 },              // Retención ISSS
        afp: { type: Number, default: 0 },               // Retención AFP
        renta: { type: Number, default: 0 },             // Retención Renta
        otherDeductions: { type: Number, default: 0 },   // Otras Deducciones
        netPay: { type: Number, default: 0 },            // Líquido a pagar
        signature: { type: String, default: '' }       // Firma (base64)
    }],
    totals: {
        totalMonthlySalary: Number,
        totalCommissions: Number,
        totalExtraHours: Number,
        totalSubTotal: Number,
        totalISSS: Number,
        totalAFP: Number,
        totalRenta: Number,
        totalOtherDeductions: Number,
        totalNetPay: Number
    },
    createdAt: String,
    updatedAt: String
});

// Schema para Contratos
const ContractSchema = new mongoose.Schema({
    id: String,
    empId: String,
    empName: String,
    position: String,
    salary: Number,
    startDate: String,
    contractType: String, // indefinido, temporal, por proyecto
    workSchedule: String,
    benefits: String,
    terms: String,
    signatureEmployee: String, // Base64 de firma digital
    signatureEmployer: String, // Base64 de firma digital
    signedDate: String,
    pdfPath: String,
    status: { type: String, default: 'pending' }, // pending, signed, active, terminated
    createdAt: String,
    updatedAt: String
});

// Schema para Cartas de Confidencialidad
const ConfidentialityLetterSchema = new mongoose.Schema({
    id: String,
    empId: String,
    empName: String,
    position: String,
    terms: String,
    signatureEmployee: String, // Base64 de firma digital
    signatureEmployer: String, // Base64 de firma digital
    signedDate: String,
    pdfPath: String,
    status: { type: String, default: 'pending' }, // pending, signed, active
    createdAt: String,
    updatedAt: String
});

// Schema para Documentos Personales
const PersonalDocumentSchema = new mongoose.Schema({
    id: String,
    empId: String,
    empName: String,
    documentType: String, // dui_front, dui_back, nit, photo, certificate, recommendation, other
    fileName: String,
    filePath: String,
    fileSize: Number,
    mimeType: String,
    description: String,
    uploadedAt: String
});

// Schema para Permisos
const PermissionRequestSchema = new mongoose.Schema({
    id: String,
    empId: String,
    empName: String,
    permissionType: String, // medico, personal, vacaciones, maternidad, paternidad, estudio, otro
    startDate: String,
    endDate: String,
    reason: String,
    attachments: [String], // Rutas de archivos adjuntos
    status: { type: String, default: 'pending' }, // pending, approved, rejected
    approvedBy: String,
    approvedDate: String,
    rejectionReason: String,
    createdAt: String,
    updatedAt: String
});

// Schema para Constancias de Tiempo Laboral
const WorkCertificateSchema = new mongoose.Schema({
    id: String,
    empId: String,
    empName: String,
    position: String,
    startDate: String,
    salary: Number,
    includeSalary: { type: Boolean, default: false },
    purpose: String, // Para trámites bancarios, visa, etc.
    pdfPath: String,
    generatedAt: String
});

const StateSchema = new mongoose.Schema({
    currentDate: String,
    employees: [EmployeeSchema],
    logs: [LogSchema],
    departments: [String],
    config: {
        tokenLife: Number,
        timeWindow: Number,
        maxRetries: Number,
        antiReplay: Boolean,
        deviceLock: Boolean,
        alerts: Boolean
    },
    adminConfig: {
        company: String,
        logo: String,
        entryTime: String,
        exitTime: String,
        grace: Number
    },
    stats: {
        present: Number,
        entries: Number,
        exits: Number,
        blocked: Number
    },
    presentSet: [String],
    secretKey: String,
    usedTokens: [String],
    securityLog: [mongoose.Schema.Types.Mixed],
    history: mongoose.Schema.Types.Map,
    geofences: [{
        id: String,
        name: String,
        lat: Number,
        lon: Number,
        radiusMeters: Number
    }],
    locationRecords: { type: [LocationRecordSchema], default: [] },
    // Datos de RRHH
    jobApplications: { type: [JobApplicationSchema], default: [] },
    payrolls: { type: [PayrollSchema], default: [] },
    weeklyPayrolls: { type: [WeeklyPayrollSchema], default: [] },
    contracts: { type: [ContractSchema], default: [] },
    confidentialityLetters: { type: [ConfidentialityLetterSchema], default: [] },
    personalDocuments: { type: [PersonalDocumentSchema], default: [] },
    permissionRequests: { type: [PermissionRequestSchema], default: [] },
    workCertificates: { type: [WorkCertificateSchema], default: [] }
}, { timestamps: true });

module.exports = mongoose.model('State', StateSchema);
