const mongoose = require('mongoose');
const TimeOffRequestSchema = new mongoose.Schema({
  empId: { type: String, required: true },
  type: { type: String, enum: ['vacation','sick','personal','unpaid','other'], required: true },
  startDate: { type: String, required: true },
  endDate: { type: String, required: true },
  days: { type: Number, required: true },
  reason: String,
  status: { type: String, enum: ['pending','approved','rejected'], default: 'pending' },
  approvedBy: String,
  approvedAt: Date,
  createdAt: { type: Date, default: Date.now }
});
module.exports = mongoose.model('TimeOffRequest', TimeOffRequestSchema);
