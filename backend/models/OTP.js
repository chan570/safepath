const mongoose = require('mongoose');

const OTPSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    lowercase: true,
    trim: true
  },
  otpHash: {
    type: String,
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now,
    expires: 600 // 10 minutes TTL
  }
});

// Fast index for email lookups
OTPSchema.index({ email: 1 });

module.exports = mongoose.model('OTP', OTPSchema);
