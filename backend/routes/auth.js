const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const auth = require('../middleware/auth');
const { db } = require('../dbConnect');
const nodemailer = require('nodemailer');

// Initialize Nodemailer transporter conditionally
let emailTransporter = null;
if (process.env.SMTP_USER && process.env.SMTP_USER !== 'your_email@gmail.com' &&
    process.env.SMTP_PASS && process.env.SMTP_PASS !== 'your_email_app_password_here') {
  
  const transporterConfig = {
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    }
  };
  
  if (process.env.SMTP_HOST && process.env.SMTP_HOST !== 'smtp.gmail.com') {
    transporterConfig.host = process.env.SMTP_HOST;
    transporterConfig.port = parseInt(process.env.SMTP_PORT || '587');
    transporterConfig.secure = process.env.SMTP_SECURE === 'true' || transporterConfig.port === 465;
  } else {
    // Default to Gmail service shortcut to bypass Vercel serverless port 587 STARTTLS timeouts
    transporterConfig.service = 'gmail';
  }
  
  emailTransporter = nodemailer.createTransport(transporterConfig);
  console.log("Nodemailer Transporter (Auth) initialized successfully.");
} else {
  console.log("SMTP email credentials missing. Running OTP in Simulated mode.");
}

// In-memory store for email OTPs
const otpStore = new Map();

// Helper to generate a 6-digit numeric OTP code
const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

// Helper to format phone to E.164 (+CountryCodePhoneNumber)
const formatPhoneToE164 = (phone) => {
  if (!phone) return '';
  let cleaned = phone.toString().replace(/\s+/g, '').replace(/[-()]/g, '');
  if (!cleaned.startsWith('+')) {
    if (cleaned.length === 10) {
      cleaned = '+91' + cleaned;
    } else {
      cleaned = '+' + cleaned;
    }
  }
  return cleaned;
};

// @route   POST api/auth/register
// @desc    Register a user
router.post('/register', async (req, res) => {
  const { username, email, password } = req.body;

  try {
    if (!username || !email || !password) {
      return res.status(400).json({ msg: 'Please enter all fields' });
    }

    let user = await db.users.findOne({ email });
    if (user) {
      return res.status(400).json({ msg: 'User with this email already exists' });
    }

    user = await db.users.findOne({ username });
    if (user) {
      return res.status(400).json({ msg: 'User with this username already exists' });
    }

    // Encrypt password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const newUser = await db.users.create({
      username,
      email,
      password: hashedPassword
    });

    const payload = {
      user: {
        id: newUser._id
      }
    };

    const secret = process.env.JWT_SECRET || 'safepath_secret_key_jwt';
    jwt.sign(payload, secret, { expiresIn: 360000 }, (err, token) => {
      if (err) throw err;
      res.json({ token, user: { id: newUser._id, username, email } });
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server error');
  }
});

// @route   POST api/auth/login
// @desc    Authenticate user & get token
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  try {
    if (!email || !password) {
      return res.status(400).json({ msg: 'Please enter all fields' });
    }

    const user = await db.users.findOne({ email });
    if (!user) {
      return res.status(400).json({ msg: 'Invalid Credentials' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ msg: 'Invalid Credentials' });
    }

    const payload = {
      user: {
        id: user._id
      }
    };

    const secret = process.env.JWT_SECRET || 'safepath_secret_key_jwt';
    jwt.sign(payload, secret, { expiresIn: 360000 }, (err, token) => {
      if (err) throw err;
      res.json({ 
        token, 
        user: { 
          id: user._id, 
          username: user.username, 
          email: user.email,
          trustedContacts: user.trustedContacts || [],
          savedRoutes: user.savedRoutes || []
        } 
      });
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server error');
  }
});

// @route   GET api/auth/user
// @desc    Get user data
router.get('/user', auth, async (req, res) => {
  try {
    const user = await db.users.findById(req.user.id);
    if (!user) return res.status(404).json({ msg: 'User not found' });
    
    // Remove password
    const { password, ...userWithoutPassword } = user;
    res.json(userWithoutPassword);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server error');
  }
});

// @route   POST api/auth/contacts
// @desc    Add a trusted contact
router.post('/contacts', auth, async (req, res) => {
  const { name, phone, email, isSOSContact } = req.body;

  try {
    if (!name || !phone || !email) {
      return res.status(400).json({ msg: 'Please enter all fields' });
    }

    const user = await db.users.findById(req.user.id);
    if (!user) return res.status(404).json({ msg: 'User not found' });

    const newContact = {
      _id: 'c_' + Math.random().toString(36).substr(2, 9),
      name,
      phone,
      email,
      isSOSContact: isSOSContact !== undefined ? isSOSContact : true
    };

    const trustedContacts = user.trustedContacts || [];
    trustedContacts.push(newContact);

    const updatedUser = await db.users.updateById(req.user.id, { trustedContacts });
    res.json(updatedUser.trustedContacts);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server error');
  }
});

// @route   DELETE api/auth/contacts/:id
// @desc    Delete a trusted contact
router.delete('/contacts/:id', auth, async (req, res) => {
  try {
    const user = await db.users.findById(req.user.id);
    if (!user) return res.status(404).json({ msg: 'User not found' });

    const contacts = user.trustedContacts || [];
    const filteredContacts = contacts.filter(c => c._id !== req.params.id);

    const updatedUser = await db.users.updateById(req.user.id, { trustedContacts: filteredContacts });
    res.json(updatedUser.trustedContacts);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server error');
  }
});

// @route   POST api/auth/routes
// @desc    Save a route to history
router.post('/routes', auth, async (req, res) => {
  const { name, sourceName, destName, sourceCoords, destCoords, safetyScore } = req.body;

  try {
    const user = await db.users.findById(req.user.id);
    if (!user) return res.status(404).json({ msg: 'User not found' });

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

    const updatedUser = await db.users.updateById(req.user.id, { savedRoutes });
    res.json(updatedUser.savedRoutes);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server error');
  }
});

// @route   POST api/auth/contacts/send-otp
// @desc    Send OTP to a contact's email
router.post('/contacts/send-otp', auth, async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ msg: 'Email is required' });
  }

  const otpCode = generateOTP();

  try {
    if (emailTransporter) {
      // Send real email OTP via nodemailer
      const subject = "SafePath AI - Guardian Verification Code";
      const body = `Hello,

You have been requested to be added as an emergency trusted contact (Guardian) on SafePath AI.

Your verification code is: ${otpCode}

Please share this code with the user to complete registration. If you did not request this, you can ignore this email.

Best regards,
SafePath AI Safety Team`;

      await emailTransporter.sendMail({
        from: `"SafePath AI" <${process.env.SMTP_USER}>`,
        to: email,
        subject: subject,
        text: body
      });

      // Save to store
      otpStore.set(email.toLowerCase(), {
        code: otpCode,
        expires: Date.now() + 10 * 60 * 1000 // 10 minutes
      });

      console.log(`Real OTP sent to email ${email}.`);
      return res.json({ success: true, isSimulated: false });
    } else {
      // Simulated OTP
      otpStore.set(email.toLowerCase(), {
        code: '123456',
        expires: Date.now() + 10 * 60 * 1000
      });

      console.log(`\n================== SIMULATED EMAIL OTP SEND ==================`);
      console.log(`TO: ${email}`);
      console.log(`OTP CODE: 123456 (Simulated)`);
      console.log(`==============================================================\n`);
      return res.json({ success: true, isSimulated: true, msg: 'Simulated OTP sent to email (Use 123456)' });
    }
  } catch (err) {
    console.error("OTP send failed:", err.message);
    res.status(500).json({ error: 'Failed to send verification code', details: err.message });
  }
});

// @route   POST api/auth/contacts/verify-otp
// @desc    Verify OTP and add contact to trusted contacts
router.post('/contacts/verify-otp', auth, async (req, res) => {
  const { name, phone, email, code } = req.body;

  if (!name || !phone || !email || !code) {
    return res.status(400).json({ msg: 'Please provide all fields and the OTP code' });
  }

  const formattedPhone = formatPhoneToE164(phone);

  try {
    let verified = false;

    // Check store
    const storedRecord = otpStore.get(email.toLowerCase());
    if (storedRecord) {
      if (storedRecord.expires > Date.now()) {
        if (storedRecord.code === code.trim()) {
          verified = true;
          // Clean up OTP code after successful verification
          otpStore.delete(email.toLowerCase());
        } else {
          console.log(`OTP check failed for ${email}. Entered: ${code}, Expected: ${storedRecord.code}`);
        }
      } else {
        console.log(`OTP expired for ${email}`);
        otpStore.delete(email.toLowerCase());
      }
    } else {
      console.log(`No OTP stored for ${email}`);
    }

    if (!verified) {
      return res.status(400).json({ msg: 'Invalid or expired verification code. Please try again.' });
    }

    // OTP Verified, add contact to user profile
    const user = await db.users.findById(req.user.id);
    if (!user) return res.status(404).json({ msg: 'User not found' });

    const newContact = {
      _id: 'c_' + Math.random().toString(36).substr(2, 9),
      name,
      phone: formattedPhone, // Save clean formatted E.164 number
      email,
      isSOSContact: true
    };

    const trustedContacts = user.trustedContacts || [];
    trustedContacts.push(newContact);

    const updatedUser = await db.users.updateById(req.user.id, { trustedContacts });
    res.json(updatedUser.trustedContacts);

  } catch (err) {
    console.error("OTP Verification and contact save failed:", err.message);
    res.status(500).json({ error: 'Failed to verify OTP code and add contact' });
  }
});

module.exports = router;
