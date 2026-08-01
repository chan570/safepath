class ApiResponse {
  /**
   * Send a successful JSON response.
   * @param {object} res - Express response object
   * @param {string} message - User-friendly message
   * @param {any} data - Response payload
   * @param {number} statusCode - HTTP status code (default 200)
   */
  static success(res, message, data = null, statusCode = 200) {
    const response = {
      status: 'success',
      message
    };
    
    if (data !== null) {
      response.data = data;
    }
    
    return res.status(statusCode).json(response);
  }

  /**
   * Send an error JSON response (for non-operational errors caught outside centralized handlers).
   * @param {object} res - Express response object
   * @param {string} message - Error description
   * @param {any} error - Detailed error payload (optional)
   * @param {number} statusCode - HTTP status code (default 500)
   */
  static error(res, message, error = null, statusCode = 500) {
    const response = {
      status: `${statusCode}`.startsWith('4') ? 'fail' : 'error',
      message
    };

    if (error !== null) {
      response.error = error;
    }

    return res.status(statusCode).json(response);
  }
}

module.exports = ApiResponse;
