const OTP = require('../models/OTP');

class OTPRepository {
  /**
   * Save a hashed OTP code.
   * @param {string} email - Recipient email
   * @param {string} otpHash - Bcrypt hash of the OTP
   */
  async create(email, otpHash) {
    const record = new OTP({
      email: email.toLowerCase(),
      otpHash
    });
    return await record.save();
  }

  /**
   * Find an active OTP code for an email.
   * @param {string} email - Recipient email
   */
  async findOneActive(email) {
    return await OTP.findOne({ email: email.toLowerCase() });
  }

  /**
   * Delete OTP verification record.
   * @param {string} email - Recipient email
   */
  async deleteByEmail(email) {
    return await OTP.deleteMany({ email: email.toLowerCase() });
  }
}

module.exports = new OTPRepository();
