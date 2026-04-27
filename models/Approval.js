const mongoose = require('mongoose');
const ApprovalSchema = new mongoose.Schema({
  type: { type: String, enum: ['timesheet','timeoff','overtime'], required: true },
  refId: { type: String, required: true },
  empId: { type: String, required: true },
  managerId: String,
  status: { type: String, enum: ['pending','approved','rejected'], default: 'pending' },
  comment: String,
  createdAt: { type: Date, default: Date.now },
  resolvedAt: Date
});
module.exports = mongoose.model('Approval', ApprovalSchema);
