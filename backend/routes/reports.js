const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { db } = require('../dbConnect');

// @route   POST api/reports
// @desc    Submit an unsafe area report
router.post('/', async (req, res) => {
  const { issueType, severity, description, coordinates } = req.body;

  try {
    if (!issueType || !coordinates || !coordinates.lat || !coordinates.lng) {
      return res.status(400).json({ msg: 'Please provide issue type and location coordinates' });
    }

    const reporterId = req.headers['x-auth-token'] ? 'authenticated_user' : 'guest';

    const newReport = await db.reports.create({
      reporter: reporterId,
      issueType,
      severity: severity || 'Medium',
      description: description || '',
      coordinates
    });

    res.status(201).json(newReport);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server error');
  }
});

// @route   GET api/reports
// @desc    Get all reports or filter nearby
router.get('/', async (req, res) => {
  const { lat, lng, radius } = req.query;

  try {
    if (lat && lng) {
      const radiusKm = parseFloat(radius) || 5;
      const reports = await db.reports.findNearby(parseFloat(lat), parseFloat(lng), radiusKm);
      return res.json(reports);
    }

    const reports = await db.reports.find({});
    res.json(reports);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server error');
  }
});

// @route   DELETE api/reports/:id
// @desc    Delete a report
router.delete('/:id', async (req, res) => {
  try {
    const report = await db.reports.deleteById(req.params.id);
    if (!report) {
      return res.status(404).json({ msg: 'Report not found' });
    }
    res.json({ msg: 'Report removed successfully', id: req.params.id });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server error');
  }
});

module.exports = router;
