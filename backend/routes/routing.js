const express = require('express');
const router = express.Router();
const { db } = require('../dbConnect');
const { computeSafestRoutes } = require('../utils/graphRouter');

// @route   POST api/routing
// @desc    Calculate routes (Safest, Fastest) using Dijkstra's algorithm on OSM Graph
router.post('/', async (req, res) => {
  const { source, destination, hour, safetyOptions } = req.body;
  const currentHour = hour !== undefined ? parseInt(hour) : new Date().getHours();

  // Safety options defaults
  const parsedOptions = {
    womenChildMode: false,
    avoidAlleys: false,
    avoidDark: false,
    ...(safetyOptions || {})
  };

  try {
    if (!source || !destination || !source.lat || !source.lng || !destination.lat || !destination.lng) {
      return res.status(400).json({ msg: 'Please provide source and destination coordinates' });
    }

    // 1. Fetch user safety reports from DB to feed into the Dijkstra routing pipeline
    const reports = await db.reports.find({});

    // 2. Compute Safest & Fastest routes using graphRouter
    console.log(`Computing Dijkstra safest path between coords...`);
    const result = await computeSafestRoutes(
      source,
      destination,
      currentHour,
      parsedOptions,
      reports
    );

    res.json({
      routes: result.routes,
      totalAlternatives: result.routes.length,
      isFallback: result.isFallback
    });

  } catch (err) {
    console.error("Graph routing calculation failed:", err.message);
    res.status(500).json({ error: 'Failed to compute routes and safety scores' });
  }
});

module.exports = router;
