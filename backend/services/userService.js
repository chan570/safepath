const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const config = require('../config/config');
const userRepository = require('../repositories/UserRepository');
const otpRepository = require('../repositories/OTPRepository');
const emailService = require('./emailService');
const AppError = require('../errors/AppError');
const { formatPhoneToE164 } = require('../utils/phoneFormatter');

class UserService {
  /**
   * Validate email address syntax strictly.
   */
  validateEmail(email) {
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    if (!email || !emailRegex.test(email)) {
      throw new AppError('Invalid email format. Please enter a valid email address (e.g. name@gmail.com).', 400);
    }
  }

  /**
   * Send registration verification OTP to the user's email.
   */
  async sendRegisterOTP(email) {
    this.validateEmail(email);

    // Check if email already registered
    const user = await userRepository.findOne({ email });
    if (user) {
      throw new AppError('User with this email already exists', 400);
    }

    // Generate a 6-digit OTP code
    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();

    // Hash OTP using bcrypt
    const salt = await bcrypt.genSalt(10);
    const otpHash = await bcrypt.hash(otpCode, salt);

    // Save hashed OTP in database (overwrites existing codes for this email)
    await otpRepository.deleteByEmail(email);
    await otpRepository.create(email, otpHash);

    // Send email (Gmail SMTP or simulated '123456' fallback)
    const finalOTP = config.smtp.user ? otpCode : '123456';
    
    if (!config.smtp.user) {
      await otpRepository.deleteByEmail(email);
      const simulatedHash = await bcrypt.hash('123456', salt);
      await otpRepository.create(email, simulatedHash);
    }

    const result = await emailService.sendRegisterOTP(email, finalOTP);
    return {
      success: true,
      isSimulated: result.isSimulated,
      ...(result.isSimulated ? { msg: 'Simulated OTP sent to email (Use 123456)' } : {})
    };
  }

  /**
   * Register a new user with email verification OTP.
   */
  async register(username, email, password, code) {
    this.validateEmail(email);

    if (!code) {
      throw new AppError('Verification code is required to complete registration.', 400);
    }

    let user = await userRepository.findOne({ email });
    if (user) {
      throw new AppError('User with this email already exists', 400);
    }

    user = await userRepository.findOne({ username });
    if (user) {
      throw new AppError('User with this username already exists', 400);
    }

    // Check OTP record in DB
    const otpRecord = await otpRepository.findOneActive(email);
    if (!otpRecord) {
      throw new AppError('Invalid or expired verification code. Please request a new OTP.', 400);
    }

    // Verify hashed OTP
    const isMatch = await bcrypt.compare(code.trim(), otpRecord.otpHash);
    if (!isMatch) {
      throw new AppError('Invalid or expired verification code. Please try again.', 400);
    }

    // Purge OTP record
    await otpRepository.deleteByEmail(email);

    // Encrypt password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const newUser = await userRepository.create({
      username,
      email,
      password: hashedPassword
    });

    const token = this.generateToken(newUser._id);
    return { token, user: { id: newUser._id, username, email } };
  }

  /**
   * Authenticate user & get token.
   */
  async login(email, password) {
    const cleanEmail = email ? email.toLowerCase().trim() : '';
    const user = await userRepository.findOne({ email: cleanEmail });
    if (!user) {
      throw new AppError('Invalid Credentials', 400);
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      throw new AppError('Invalid Credentials', 400);
    }

    const token = this.generateToken(user._id);
    return {
      token,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        trustedContacts: user.trustedContacts || [],
        savedRoutes: user.savedRoutes || []
      }
    };
  }

  /**
   * Get user data (excluding password safely).
   */
  async getUserProfile(userId) {
    const user = await userRepository.findById(userId);
    if (!user) {
      throw new AppError('User not found', 404);
    }
    
    // Properly convert Mongoose model to plain object and remove password
    const userObj = user.toObject();
    delete userObj.password;
    return userObj;
  }

  /**
   * Add a trusted contact directly (unverified/fallback path).
   */
  async addContact(userId, contactData) {
    const { name, phone, email, isSOSContact } = contactData;

    const user = await userRepository.findById(userId);
    if (!user) {
      throw new AppError('User not found', 404);
    }

    const newContact = {
      _id: 'c_' + Math.random().toString(36).substr(2, 9),
      name,
      phone: formatPhoneToE164(phone),
      email,
      isSOSContact: isSOSContact !== undefined ? isSOSContact : true
    };

    const trustedContacts = user.trustedContacts || [];
    trustedContacts.push(newContact);

    const updatedUser = await userRepository.updateById(userId, { trustedContacts });
    return updatedUser.trustedContacts;
  }

  /**
   * Delete a trusted contact.
   */
  async deleteContact(userId, contactId) {
    const user = await userRepository.findById(userId);
    if (!user) {
      throw new AppError('User not found', 404);
    }

    const contacts = user.trustedContacts || [];
    const filteredContacts = contacts.filter(c => c._id !== contactId);

    const updatedUser = await userRepository.updateById(userId, { trustedContacts: filteredContacts });
    return updatedUser.trustedContacts;
  }

  /**
   * Save a route to history.
   */
  async saveRoute(userId, routeData) {
    const { name, sourceName, destName, sourceCoords, destCoords, safetyScore } = routeData;

    const user = await userRepository.findById(userId);
    if (!user) {
      throw new AppError('User not found', 404);
    }

    const newRoute = {
      _id: 'rt_' + Math.random().toString(36).substr(2, 9),
      name: name || `${sourceName} to ${destName}`,
      sourceName,
      destName,
      sourceCoords,
      destCoords,
      safetyScore,
      createdAt: new Date().toISOString()
    };

    const savedRoutes = user.savedRoutes || [];
    savedRoutes.unshift(newRoute); // Add to beginning of list

    // Limit saved routes to 10 items to keep database tidy
    if (savedRoutes.length > 10) {
      savedRoutes.pop();
    }

    const updatedUser = await userRepository.updateById(userId, { savedRoutes });
    return updatedUser.savedRoutes;
  }

  /**
   * Generate & send a hashed OTP verification code.
   */
  async sendContactOTP(email) {
    // Generate a 6-digit OTP
    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();

    // Hash OTP using bcrypt
    const salt = await bcrypt.genSalt(10);
    const otpHash = await bcrypt.hash(otpCode, salt);

    // Save hashed OTP in database (overwrites existing codes for this email)
    await otpRepository.deleteByEmail(email);
    await otpRepository.create(email, otpHash);

    // Send email using EmailService
    // If SMTP is missing, simulated mode will print OTP to standard log (we use '123456' for simulated fallback)
    const finalOTP = config.smtp.user ? otpCode : '123456';
    
    // In simulated mode, we also update DB with hashed '123456' to ensure verification passes
    if (!config.smtp.user) {
      await otpRepository.deleteByEmail(email);
      const simulatedHash = await bcrypt.hash('123456', salt);
      await otpRepository.create(email, simulatedHash);
    }

    const result = await emailService.sendOTP(email, finalOTP);
    return {
      success: true,
      isSimulated: result.isSimulated,
      ...(result.isSimulated ? { msg: 'Simulated OTP sent to email (Use 123456)' } : {})
    };
  }

  /**
   * Verify OTP and add trusted contact.
   */
  async verifyContactOTP(userId, contactData) {
    const { name, phone, email, code } = contactData;

    // Check OTP record in DB
    const otpRecord = await otpRepository.findOneActive(email);
    if (!otpRecord) {
      throw new AppError('Invalid or expired verification code. Please try again.', 400);
    }

    // Verify hashed OTP
    const isMatch = await bcrypt.compare(code.trim(), otpRecord.otpHash);
    if (!isMatch) {
      throw new AppError('Invalid or expired verification code. Please try again.', 400);
    }

    // Purge OTP record
    await otpRepository.deleteByEmail(email);

    // OTP Verified, add contact to user profile
    const user = await userRepository.findById(userId);
    if (!user) {
      throw new AppError('User not found', 404);
    }

    const formattedPhone = formatPhoneToE164(phone);
    const newContact = {
      _id: 'c_' + Math.random().toString(36).substr(2, 9),
      name,
      phone: formattedPhone,
      email,
      isSOSContact: true
    };

    const trustedContacts = user.trustedContacts || [];
    trustedContacts.push(newContact);

    const updatedUser = await userRepository.updateById(userId, { trustedContacts });
    return updatedUser.trustedContacts;
  }

  /**
   * Helper to sign JWT payload.
   */
  generateToken(userId) {
    const payload = {
      user: {
        id: userId
      }
    };
    return jwt.sign(payload, config.jwtSecret, { expiresIn: 360000 });
  }
}

module.exports = new UserService();
