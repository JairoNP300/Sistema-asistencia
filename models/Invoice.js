const mongoose = require('mongoose');
const LineItemSchema = new mongoose.Schema({
  empId: String,
  empName: String,
  hours: Number,
  rate: Number,
  amount: Number
}, { _id: false });
const InvoiceSchema = new mongoose.Schema({
  projectId: { type: String, required: true },
  periodStart: { type: String, required: true },
  periodEnd: { type: String, required: true },
  totalHours: Number,
  hourlyRate: Number,
  totalAmount: Number,
  currency: { type: String, default: 'MXN' },
  status: { type: String, enum: ['draft','sent','paid'], default: 'draft' },
  lineItems: [LineItemSchema],
  createdAt: { type: Date, default: Date.now }
});
module.exports = mongoose.model('Invoice', InvoiceSchema);
