const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const config = require('../config/config');
const auth = require('../middleware/auth');
const validate = require('../middleware/validate');
const reportService = require('../services/reportService');
const AppError = require('../errors/AppError');

// Validation schemas
const createReportSchema = {
  body: {
    issueType: [{ 
      required: true, 
      type: 'string',
      enum: ['Poorly Lit', 'Harassment Zone', 'Deserted Street', 'No Police Presence', 'Stalking/Suspicious Activity', 'Other']
    }],
    coordinates: [{ 
      required: true,
      custom: val => {
        if (!val || typeof val.lat !== 'number' || typeof val.lng !== 'number') {
          return 'must contain numerical lat and lng coordinates';
        }
        return null;
      }
    }]
  }
};

const getReportsSchema = {
  query: {
    lat: [{ required: false, custom: val => isNaN(parseFloat(val)) ? 'must be a valid latitude number' : null }],
    lng: [{ required: false, custom: val => isNaN(parseFloat(val)) ? 'must be a valid longitude number' : null }],
    radius: [{ required: false, custom: val => isNaN(parseFloat(val)) ? 'must be a valid radius number' : null }]
  }
};

// @route   POST api/reports
// @desc    Submit an unsafe area report (Guests allowed, Auth optional)
router.post('/', validate(createReportSchema), async (req, res, next) => {
  const token = req.header('x-auth-token');
  let reporterId = 'guest';

  try {
    if (token) {
      try {
        const decoded = jwt.verify(token, config.jwtSecret);
        reporterId = decoded.user.id;
      } catch (err) {
        throw new AppError('Token is not valid', 401);
      }
    }

    const newReport = await reportService.createReport(req.body, reporterId);
    res.status(201).json(newReport); // Preserving direct JSON report output format
  } catch (err) {
    next(err);
  }
});

// @route   GET api/reports
// @desc    Get all reports or filter nearby
router.get('/', validate(getReportsSchema), async (req, res, next) => {
  const { lat, lng, radius } = req.query;

  try {
    const reports = await reportService.getReports(lat, lng, radius);
    res.json(reports); // Preserving direct JSON array output format
  } catch (err) {
    next(err);
  }
});

// @route   DELETE api/reports/:id
// @desc    Delete a report (Secured with auth)
router.delete('/:id', auth, async (req, res, next) => {
  try {
    const deletedReport = await reportService.deleteReport(req.params.id);
    res.json({ msg: 'Report removed successfully', id: req.params.id });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
