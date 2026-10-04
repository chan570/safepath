const express = require('express');
const { getHealth, postHealth } = require('../controllers/healthController');
const validateBody = require('../middleware/validateBody');

const router = express.Router();

router.get('/', getHealth);

// Add POST route to test body validation
router.post('/', validateBody(), postHealth);

module.exports = router;
