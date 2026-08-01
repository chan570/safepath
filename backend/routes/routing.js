const express = require('express');
const router = express.Router();
const validate = require('../middleware/validate');
const routingService = require('../services/routingService');

// Validation schema
const computeRouteSchema = {
  body: {
    source: [{
      required: true,
      custom: val => {
        if (!val || typeof val.lat !== 'number' || typeof val.lng !== 'number') {
          return 'must contain numerical lat and lng coordinates';
        }
        return null;
      }
    }],
    destination: [{
      required: true,
      custom: val => {
        if (!val || typeof val.lat !== 'number' || typeof val.lng !== 'number') {
          return 'must contain numerical lat and lng coordinates';
        }
        return null;
      }
    }],
    hour: [{ required: false }],
    safetyOptions: [{ required: false, type: 'object' }]
  }
};

// @route   POST api/routing
// @desc    Calculate routes (Safest, Fastest) using Dijkstra's algorithm on OSM Graph
router.post('/', validate(computeRouteSchema), async (req, res, next) => {
  const { source, destination, hour, safetyOptions } = req.body;

  try {
    const result = await routingService.computeRoutes(source, destination, hour, safetyOptions);
    res.json(result); // Preserving legacy response schema
  } catch (err) {
    next(err);
  }
});

module.exports = router;
