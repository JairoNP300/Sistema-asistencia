const mongoose = require('mongoose');
const TimeEntrySchema = new mongoose.Schema({
  empId: { type: String, required: true, index: true },
  projectId: { type: String, index: true },
  clockIn: { type: Date, required: true, index: true },
  clockOut: Date,
  durationMs: Number,
  source: { type: String, enum: ['qr','manual','kiosk','api'], default: 'manual' },
  offlineSync: { type: Boolean, default: false },
  location: { lat: Number, lon: Number, accuracy: Number },
  selfieUrl: String,
  geofenceId: String,
  geofenceValid: Boolean,
  notes: String,
  approvalId: String,
  locked: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});
module.exports = mongoose.model('TimeEntry', TimeEntrySchema);
