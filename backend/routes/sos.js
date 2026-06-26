const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { db } = require('../dbConnect');
const jwt = require('jsonwebtoken');
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
      emailBroadcasts,
      timestamp: new Date().toISOString()
    });

  } catch (err) {
    console.error("SOS trigger failed:", err.message);
    res.status(500).json({ error: 'Failed to process SOS trigger' });
  }
});

// @route   POST api/sos/share-route
// @desc    Simulate/Send sharing live location email with guardians
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
    const subject = `SafePath AI - ${username} shared a live route`;
    const body = `Hello,

This is an automated notification from SafePath AI.

Your trusted contact, ${username}, has started a route to ${destName}.

You can track their live location and safety status here:
https://safepath.ai/track/simulated-link

Best Regards,
SafePath AI Safety Team`;

    const emailBroadcasts = await Promise.all(contacts.map(async (contact) => {
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
          console.error(`Live Location Email to ${contact.name} failed:`, err.message);
          return {
            recipientName: contact.name,
            recipientEmail: contact.email,
            status: 'Failed (Real Email)',
            error: err.message
          };
        }
      } else {
        console.log(`\n============== SIMULATED LIVE LOCATION EMAIL ==============`);
        console.log(`TO: ${contact.email}`);
        console.log(`SUBJECT: ${subject}`);
        console.log(`BODY:\n${body}`);
        console.log(`===========================================================\n`);
        return {
          recipientName: contact.name,
          recipientEmail: contact.email,
          status: 'Sent (Simulated)'
        };
      }
    }));

    res.json({
      success: true,
      contactsNotifiedCount: contacts.length,
      emailBroadcasts
    });
  } catch (err) {
    console.error("Live location share failed:", err.message);
    res.status(500).json({ error: 'Server Error' });
  }
});

module.exports = router;
