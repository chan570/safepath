const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const validate = require('../middleware/validate');
const userService = require('../services/userService');
const ApiResponse = require('../utils/apiResponse');

// Validation schemas
const registerSendOTPSchema = {
  body: {
    email: [{ required: true, type: 'string', pattern: /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/ }]
  }
};

const registerSchema = {
  body: {
    username: [{ required: true, type: 'string' }],
    email: [{ required: true, type: 'string', pattern: /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/ }],
    password: [{ required: true, type: 'string', custom: val => val.length < 6 ? 'must be at least 6 characters' : null }],
    code: [{ required: true }]
  }
};

const loginSchema = {
  body: {
    email: [{ required: true, type: 'string' }],
    password: [{ required: true, type: 'string' }]
  }
};

const contactSchema = {
  body: {
    name: [{ required: true, type: 'string' }],
    phone: [{ required: true }],
    email: [{ required: true, type: 'string', pattern: /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/ }]
  }
};

const sendOTPSchema = {
  body: {
    email: [{ required: true, type: 'string', pattern: /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/ }]
  }
};

const verifyOTPSchema = {
  body: {
    name: [{ required: true, type: 'string' }],
    phone: [{ required: true }],
    email: [{ required: true, type: 'string', pattern: /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/ }],
    code: [{ required: true }]
  }
};

// @route   POST api/auth/register/send-otp
// @desc    Send registration verification OTP to user's email
router.post('/register/send-otp', validate(registerSendOTPSchema), async (req, res, next) => {
  const { email } = req.body;
  try {
    const result = await userService.sendRegisterOTP(email);
    return res.json(result);
  } catch (err) {
    next(err);
  }
});

// @route   POST api/auth/register
// @desc    Register a user (Requires email verification OTP code)
router.post('/register', validate(registerSchema), async (req, res, next) => {
  const { username, email, password, code } = req.body;
  try {
    const result = await userService.register(username, email, password, code);
    return res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

// @route   POST api/auth/login
// @desc    Authenticate user & get token
router.post('/login', validate(loginSchema), async (req, res, next) => {
  const { email, password } = req.body;
  try {
    const result = await userService.login(email, password);
    return res.json(result);
  } catch (err) {
    next(err);
  }
});

// @route   GET api/auth/user
// @desc    Get user data
router.get('/user', auth, async (req, res, next) => {
  try {
    const profile = await userService.getUserProfile(req.user.id);
    return res.json(profile); // Preserving direct JSON serialization format of profiles for client mapping
  } catch (err) {
    next(err);
  }
});

// @route   POST api/auth/contacts
// @desc    Add a trusted contact
router.post('/contacts', auth, validate(contactSchema), async (req, res, next) => {
  try {
    const contacts = await userService.addContact(req.user.id, req.body);
    return res.json(contacts); // Preserving direct array output for legacy client compatibility
  } catch (err) {
    next(err);
  }
});

// @route   DELETE api/auth/contacts/:id
// @desc    Delete a trusted contact
router.delete('/contacts/:id', auth, async (req, res, next) => {
  try {
    const contacts = await userService.deleteContact(req.user.id, req.params.id);
    return res.json(contacts); // Preserving direct array output for legacy client compatibility
  } catch (err) {
    next(err);
  }
});

// @route   POST api/auth/routes
// @desc    Save a route to history
router.post('/routes', auth, async (req, res, next) => {
  try {
    const routes = await userService.saveRoute(req.user.id, req.body);
    return res.json(routes); // Preserving direct array output for legacy client compatibility
  } catch (err) {
    next(err);
  }
});

// @route   POST api/auth/contacts/send-otp
// @desc    Send OTP to a contact's email
router.post('/contacts/send-otp', auth, validate(sendOTPSchema), async (req, res, next) => {
  const { email } = req.body;
  try {
    const result = await userService.sendContactOTP(email);
    return res.json(result); // Direct response schema compatibility
  } catch (err) {
    next(err);
  }
});

// @route   POST api/auth/contacts/verify-otp
// @desc    Verify OTP and add contact to trusted contacts
router.post('/contacts/verify-otp', auth, validate(verifyOTPSchema), async (req, res, next) => {
  try {
    const contacts = await userService.verifyContactOTP(req.user.id, req.body);
    return res.json(contacts); // Direct array response compatibility
  } catch (err) {
    next(err);
  }
});

module.exports = router;
