const UnsafeReport = require('../models/UnsafeReport');

class ReportRepository {
  async find(query = {}) {
    return await UnsafeReport.find(query);
  }

  async findById(id) {
    return await UnsafeReport.findById(id);
  }

  async create(reportData) {
    const report = new UnsafeReport({
      ...reportData,
      location: {
        type: 'Point',
        coordinates: [reportData.coordinates.lng, reportData.coordinates.lat] // [lng, lat]
      }
    });
    return await report.save();
  }

  async deleteById(id) {
    return await UnsafeReport.findByIdAndDelete(id);
  }

  async findNearby(lat, lng, radiusInKm = 5) {
    return await UnsafeReport.find({
      location: {
        $near: {
          $geometry: {
            type: 'Point',
            coordinates: [lng, lat] // [lng, lat]
          },
          $maxDistance: radiusInKm * 1000 // meters
        }
      }
    });
  }

  /**
   * Find reports within a geographical bounding box.
   */
  async findInBoundingBox(minLat, minLng, maxLat, maxLng) {
    return await UnsafeReport.find({
      location: {
        $geoWithin: {
          $box: [
            [minLng, minLat], // Bottom-left coordinate [longitude, latitude]
            [maxLng, maxLat]  // Top-right coordinate [longitude, latitude]
          ]
        }
      }
    });
  }
}

module.exports = new ReportRepository();
