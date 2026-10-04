const express = require('express');
const router = express.Router();
const routePlanningController = require('../controllers/routePlanningController');

router.post('/plan', routePlanningController.planRoute);

module.exports = router;
