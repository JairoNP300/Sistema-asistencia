const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const UserSchema = new mongoose.Schema({
  username: { type: String, unique: true, required: true },
  passwordHash: { type: String, required: true },
  name: String,
  role: { type: String, default: 'admin' },
  createdAt: { type: Date, default: Date.now }
});

// Password helpers (not exposed publicly, used for seed/creation)
UserSchema.methods.verifyPassword = function(pw) {
  return bcrypt.compare(pw, this.passwordHash);
};

module.exports = mongoose.model('User', UserSchema);
