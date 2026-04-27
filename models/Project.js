const mongoose = require('mongoose');
const ProjectSchema = new mongoose.Schema({
  name: { type: String, required: true },
  code: { type: String, required: true, unique: true },
  clientName: String,
  billable: { type: Boolean, default: false },
  hourlyRate: { type: Number, default: 0 },
  currency: { type: String, default: 'MXN' },
  status: { type: String, enum: ['active','archived'], default: 'active' },
  memberIds: [String],
  createdAt: { type: Date, default: Date.now }
});
module.exports = mongoose.model('Project', ProjectSchema);
