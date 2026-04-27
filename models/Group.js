const mongoose = require('mongoose');
const GroupSchema = new mongoose.Schema({
  name: { type: String, required: true },
  description: String,
  managerIds: [String],
  memberIds: [String],
  permissions: {
    canApproveTimesheets: { type: Boolean, default: false },
    canManageTimeOff: { type: Boolean, default: false },
    canViewReports: { type: Boolean, default: false },
    canManageSchedules: { type: Boolean, default: false }
  },
  createdAt: { type: Date, default: Date.now }
});
module.exports = mongoose.model('Group', GroupSchema);
