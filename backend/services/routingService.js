const reportRepository = require('../repositories/ReportRepository');
const { computeSafestRoutes } = require('../utils/graphRouter');
const logger = require('../utils/logger');

class RoutingService {
  /**
   * Calculate safest and fastest paths.
   */
  async computeRoutes(source, destination, hour, safetyOptions) {
    const currentHour = hour !== undefined ? parseInt(hour, 10) : new Date().getHours();

    const parsedOptions = {
      womenChildMode: false,
      avoidAlleys: false,
      avoidDark: false,
      ...(safetyOptions || {})
    };

    // Calculate Bounding Box (around 1.5km buffer as in graphRouter)
    const latDiff = Math.abs(source.lat - destination.lat);
    const lngDiff = Math.abs(source.lng - destination.lng);
    const buffer = Math.max(0.015, Math.max(latDiff, lngDiff) * 0.35);

    const minLat = Math.min(source.lat, destination.lat) - buffer;
    const maxLat = Math.max(source.lat, destination.lat) + buffer;
    const minLng = Math.min(source.lng, destination.lng) - buffer;
    const maxLng = Math.max(source.lng, destination.lng) + buffer;

    // Fetch ONLY reports physically within this routing bounding box
    logger.info(`Fetching active safety reports within bounding box: [${minLat.toFixed(4)}, ${minLng.toFixed(4)}] to [${maxLat.toFixed(4)}, ${maxLng.toFixed(4)}]`);
    const reports = await reportRepository.findInBoundingBox(minLat, minLng, maxLat, maxLng);
    logger.info(`Found ${reports.length} matching area reports within routing bounding box.`);

    // Compute route pathways using graph routing Dijkstra pipeline
    const result = await computeSafestRoutes(
      source,
      destination,
      currentHour,
      parsedOptions,
      reports
    );

    return {
      routes: result.routes,
      totalAlternatives: result.routes.length,
      isFallback: result.isFallback
    };
  }
}

module.exports = new RoutingService();
