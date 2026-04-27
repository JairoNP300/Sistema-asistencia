const mongoose = require('mongoose');
const ScheduleDaySchema = new mongoose.Schema({
  dayOfWeek: { type: Number, min: 0, max: 6 },
  startTime: String,
  endTime: String,
  isWorkday: { type: Boolean, default: true }
}, { _id: false });
const WorkScheduleSchema = new mongoose.Schema({
  name: { type: String, required: true },
  assignedTo: { type: String, enum: ['employee','group'], required: true },
  assignedId: { type: String, required: true },
  days: [ScheduleDaySchema],
  timezone: { type: String, default: 'America/Mexico_City' },
  effectiveFrom: String,
  createdAt: { type: Date, default: Date.now }
});
module.exports = mongoose.model('WorkSchedule', WorkScheduleSchema);
