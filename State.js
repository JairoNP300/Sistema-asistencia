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
    lastAccess: String
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
    source: String
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
    history: mongoose.Schema.Types.Map
}, { timestamps: true });

module.exports = mongoose.model('State', StateSchema);
