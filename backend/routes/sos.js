const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const config = require('../config/config');
const auth = require('../middleware/auth');
const validate = require('../middleware/validate');
const sosService = require('../services/sosService');
const AppError = require('../errors/AppError');

// Validation schemas
const triggerSOSSchema = {
  body: {
    location: [{
      required: true,
      custom: val => {
        if (!val || typeof val.lat !== 'number' || typeof val.lng !== 'number') {
          return 'must contain numerical lat and lng coordinates';
        }
        return null;
      }
    }],
    userId: [{ required: false, type: 'string' }]
  }
};

const shareRouteSchema = {
  body: {
    route: [{ required: true, type: 'object' }]
  }
};

// @route   POST api/sos/trigger
// @desc    Trigger emergency SOS and send simulated/real alerts to trusted contacts
router.post('/trigger', validate(triggerSOSSchema), async (req, res, next) => {
  const { location, userId } = req.body;
  const token = req.header('x-auth-token');
  
  let reqUser = null;
  try {
    if (token) {
      try {
        const decoded = jwt.verify(token, config.jwtSecret);
        reqUser = decoded.user;
      } catch (err) {
        throw new AppError('Token is not valid', 401);
      }
    }

    const result = await sosService.triggerSOS(location, userId, reqUser);
    res.json(result); // Preserving direct JSON schema output format
  } catch (err) {
    next(err);
  }
});

// @route   POST api/sos/share-route
// @desc    Simulate/Send sharing live location email with guardians
router.post('/share-route', auth, validate(shareRouteSchema), async (req, res, next) => {
  const { route } = req.body;

  try {
    const result = await sosService.shareRoute(req.user.id, route);
    res.json(result); // Preserving direct JSON schema output format
  } catch (err) {
    next(err);
  }
});

module.exports = router;
