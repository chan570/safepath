/**
 * Helper to format phone to E.164 (+CountryCodePhoneNumber)
 * @param {string|number} phone - Input phone number
 * @returns {string} Cleaned formatted phone number
 */
const formatPhoneToE164 = (phone) => {
  if (!phone) return '';
  let cleaned = phone.toString().replace(/\s+/g, '').replace(/[-()]/g, '');
  if (!cleaned.startsWith('+')) {
    if (cleaned.length === 10) {
      cleaned = '+91' + cleaned; // Default to India country code as in original code
    } else {
      cleaned = '+' + cleaned;
    }
  }
  return cleaned;
};

module.exports = { formatPhoneToE164 };
