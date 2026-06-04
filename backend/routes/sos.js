const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { db } = require('../dbConnect');
const jwt = require('jsonwebtoken');
const twilio = require('twilio');
const nodemailer = require('nodemailer');

// Initialize Twilio conditionally
let twilioClient = null;
if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_ACCOUNT_SID !== 'your_twilio_account_sid_here' &&
    process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_AUTH_TOKEN !== 'your_twilio_auth_token_here') {
  twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
  console.log("Twilio SMS Client initialized successfully.");
} else {
  console.log("Twilio credentials missing. Running in Simulated SMS mode.");
}

// Initialize Nodemailer transporter conditionally
let emailTransporter = null;
if (process.env.SMTP_USER && process.env.SMTP_USER !== 'your_email@gmail.com' &&
    process.env.SMTP_PASS && process.env.SMTP_PASS !== 'your_email_app_password_here') {
  emailTransporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: false, // true for 465, false for other ports
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
  console.log("Nodemailer Transporter initialized successfully.");
} else {
  console.log("SMTP email credentials missing. Running in Simulated Email mode.");
}

// @route   POST api/sos/trigger
// @desc    Trigger emergency SOS and send simulated alerts to trusted contacts
router.post('/trigger', async (req, res) => {
  const { location, userId } = req.body;

  try {
    if (!location || !location.lat || !location.lng) {
      return res.status(400).json({ msg: 'Emergency location is required to trigger SOS' });
    }

    let username = 'A SafePath User';
    let contacts = [];

    // If userId is provided, fetch contacts
    if (userId) {
      const user = await db.users.findById(userId);
      if (user) {
        username = user.username;
        contacts = user.trustedContacts || [];
      }
    }

    // If the user has no trusted contacts, we don't attempt to send real alerts to dummy backup addresses.
    // This prevents delivery bounces from fake domains like dispatch@police.gov.

    const mapLink = `https://www.google.com/maps/search/?api=1&query=${location.lat},${location.lng}`;
    
    // Broadcast SMS alerts (Real or Simulated)
    const smsBroadcasts = await Promise.all(contacts.map(async (contact) => {
      const message = `🚨 EMERGENCY SOS! 🚨\nYour trusted contact ${username} is in distress!\nLast known location: ${mapLink}\nPlease check on them immediately!`;
      
      if (twilioClient && process.env.TWILIO_PHONE_NUMBER && process.env.TWILIO_PHONE_NUMBER !== 'your_twilio_phone_number_here') {
        try {
          const response = await twilioClient.messages.create({
            body: message,
            from: process.env.TWILIO_PHONE_NUMBER,
            to: contact.phone
          });
          return {
            recipientName: contact.name,
            recipientPhone: contact.phone,
            status: 'Sent (Real SMS)',
            messageId: response.sid
          };
        } catch (err) {
          console.error(`Real SMS sending failed to ${contact.name}:`, err.message);
          return {
            recipientName: contact.name,
            recipientPhone: contact.phone,
            status: 'Failed (Real SMS)',
            error: err.message
          };
        }
      } else {
        console.log(`\n================= SIMULATED SMS BROADCAST =================`);
        console.log(`TO: ${contact.name} (${contact.phone})`);
        console.log(`MESSAGE:\n${message}`);
        console.log(`===========================================================\n`);
        return {
          recipientName: contact.name,
          recipientPhone: contact.phone,
          message,
          status: 'Sent (Simulated)'
        };
      }
    }));

    // Broadcast Email alerts (Real or Simulated)
    const emailBroadcasts = await Promise.all(contacts.map(async (contact) => {
      const subject = `🚨 URGENT: Emergency SOS triggered by ${username} 🚨`;
      const body = `Hello ${contact.name},\n\nThis is an automated emergency broadcast from SafePath AI.\n\nYour trusted contact, ${username}, has triggered an Emergency SOS alert.\n\nThey require immediate assistance.\nLast Known Location Map Link: ${mapLink}\n\nPlease take immediate action or notify the local emergency authorities.\n\nBest Regards,\nSafePath AI Safety Team`;

      if (emailTransporter) {
        try {
          const info = await emailTransporter.sendMail({
            from: `"SafePath AI" <${process.env.SMTP_USER}>`,
            to: contact.email,
            subject,
            text: body
          });
          return {
            recipientName: contact.name,
            recipientEmail: contact.email,
            status: 'Sent (Real Email)',
            messageId: info.messageId
          };
        } catch (err) {
          console.error(`Real Email sending failed to ${contact.name}:`, err.message);
          return {
            recipientName: contact.name,
            recipientEmail: contact.email,
            status: 'Failed (Real Email)',
            error: err.message
          };
        }
      } else {
        console.log(`\n================ SIMULATED EMAIL BROADCAST ===============`);
        console.log(`TO: ${contact.email}`);
        console.log(`SUBJECT: ${subject}`);
        console.log(`BODY:\n${body}`);
        console.log(`===========================================================\n`);
        return {
          recipientName: contact.name,
          recipientEmail: contact.email,
          subject,
          status: 'Sent (Simulated)'
        };
      }
    }));

    res.json({
      success: true,
      username,
      location,
      contactsNotifiedCount: contacts.length,
      smsBroadcasts,
      emailBroadcasts,
      timestamp: new Date().toISOString()
    });

  } catch (err) {
    console.error("SOS trigger failed:", err.message);
    res.status(500).json({ error: 'Failed to process SOS trigger' });
  }
});

// @route   POST api/sos/share-route
// @desc    Simulate/Send sharing live location SMS with guardians
router.post('/share-route', async (req, res) => {
  const { route } = req.body;
  const token = req.header('x-auth-token');
  
  let contacts = [];
  let username = 'A SafePath User';

  try {
    if (token) {
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'safepath_secret_key_jwt');
      const user = await db.users.findById(decoded.user.id);
      if (user) {
        username = user.username;
        contacts = user.trustedContacts || [];
      }
    }

    // If the user has no trusted contacts, we don't send location alerts.
    // This prevents delivery bounces and fake Twilio calls.

    const destName = route && route.destination ? route.destination.name : "their destination";
    const message = `${username} has started a route to ${destName}. Track their live location and safety status here: https://safepath.ai/track/simulated-link`;

    const smsBroadcasts = await Promise.all(contacts.map(async (c) => {
      if (twilioClient && process.env.TWILIO_PHONE_NUMBER && process.env.TWILIO_PHONE_NUMBER !== 'your_twilio_phone_number_here') {
        try {
          const response = await twilioClient.messages.create({
            body: message,
            from: process.env.TWILIO_PHONE_NUMBER,
            to: c.phone
          });
          return {
            recipientName: c.name,
            recipientPhone: c.phone,
            status: 'Sent (Real SMS)',
            messageId: response.sid
          };
        } catch (err) {
          console.error(`Live Location SMS to ${c.name} failed:`, err.message);
          return {
            recipientName: c.name,
            recipientPhone: c.phone,
            status: 'Failed (Real SMS)',
            error: err.message
          };
        }
      } else {
        console.log(`\n============== SIMULATED LIVE LOCATION SMS ==============`);
        console.log(`TO: ${c.name} (${c.phone})`);
        console.log(`MESSAGE: ${message}`);
        console.log(`===========================================================\n`);
        return {
          recipientName: c.name,
          recipientPhone: c.phone,
          status: 'Sent (Simulated)'
        };
      }
    }));

    res.json({
      success: true,
      contactsNotifiedCount: contacts.length,
      smsBroadcasts
    });
  } catch (err) {
    console.error("Live location share failed:", err.message);
    res.status(500).json({ error: 'Server Error' });
  }
});

module.exports = router;
