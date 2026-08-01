const reportRepository = require('../repositories/ReportRepository');
const AppError = require('../errors/AppError');

class ReportService {
  /**
   * Create a new unsafe report.
   */
  async createReport(reportData, reporterId) {
    const { issueType, severity, description, coordinates } = reportData;

    return await reportRepository.create({
      reporter: reporterId || 'guest',
      issueType,
      severity: severity || 'Medium',
      description: description || '',
      coordinates
    });
  }

  /**
   * Fetch all reports or query reports near a location.
   */
  async getReports(lat, lng, radius) {
    if (lat && lng) {
      const radiusKm = parseFloat(radius) || 5;
      return await reportRepository.findNearby(parseFloat(lat), parseFloat(lng), radiusKm);
    }
    return await reportRepository.find({});
  }

  /**
   * Delete an unsafe report.
   */
  async deleteReport(id) {
    const report = await reportRepository.deleteById(id);
    if (!report) {
      throw new AppError('Report not found', 404);
    }
    return report;
  }
}

module.exports = new ReportService();
