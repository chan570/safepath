const nodemailer = require('nodemailer');
const config = require('../config/config');
const logger = require('../utils/logger');

class EmailService {
  constructor() {
    this.emailTransporter = null;
    this.initialize();
  }

  initialize() {
    const { user, pass, host, port, secure } = config.smtp;

    if (user && user !== 'your_email@gmail.com' && pass && pass !== 'your_email_app_password_here') {
      const transporterConfig = {
        auth: { user, pass }
      };

      if (host && host !== 'smtp.gmail.com') {
        transporterConfig.host = host;
        transporterConfig.port = port;
        transporterConfig.secure = secure || port === 465;
      } else {
        // Gmail service configuration
        transporterConfig.service = 'gmail';
      }

      try {
        this.emailTransporter = nodemailer.createTransport(transporterConfig);
        logger.info('Nodemailer Transporter initialized successfully.');
      } catch (error) {
        logger.error(`Failed to initialize Nodemailer: ${error.message}`);
      }
    } else {
      logger.info('SMTP email credentials missing. Email communications running in SIMULATED mode.');
    }
  }

  /**
   * Send a registration OTP email (real or simulated).
   */
  async sendRegisterOTP(email, otpCode) {
    const subject = "SafePath AI - Account Registration Verification Code";
    const body = `Hello,

Welcome to SafePath AI.

Your verification code to complete your registration is: ${otpCode}

Please enter this code in the app to verify your email address. This code is valid for 10 minutes.

Best regards,
SafePath AI Safety Team`;

    if (this.emailTransporter) {
      const info = await this.emailTransporter.sendMail({
        from: `"SafePath AI" <${config.smtp.user}>`,
        to: email,
        subject,
        text: body
      });
      logger.info(`Registration OTP sent to ${email} (MessageId: ${info.messageId}).`);
      return { success: true, isSimulated: false };
    } else {
      logger.info(`
================== SIMULATED EMAIL REGISTER OTP SEND ==================
TO: ${email}
OTP CODE: ${otpCode} (Simulated)
========================================================================
      `);
      return { success: true, isSimulated: true };
    }
  }

  /**
   * Send a verification OTP email (real or simulated).
   */
  async sendOTP(email, otpCode) {
    const subject = "SafePath AI - Guardian Verification Code";
    const body = `Hello,

You have been requested to be added as an emergency trusted contact (Guardian) on SafePath AI.

Your verification code is: ${otpCode}

Please share this code with the user to complete registration. If you did not request this, you can ignore this email.

Best regards,
SafePath AI Safety Team`;

    if (this.emailTransporter) {
      const info = await this.emailTransporter.sendMail({
        from: `"SafePath AI" <${config.smtp.user}>`,
        to: email,
        subject,
        text: body
      });
      logger.info(`Verification OTP sent to ${email} (MessageId: ${info.messageId}).`);
      return { success: true, isSimulated: false };
    } else {
      logger.info(`
================== SIMULATED EMAIL OTP SEND ==================
TO: ${email}
OTP CODE: ${otpCode} (Simulated)
==============================================================
      `);
      return { success: true, isSimulated: true };
    }
  }

  /**
   * Send emergency SOS notification email (real or simulated).
   */
  async sendEmergencySOS(contactEmail, contactName, username, mapLink) {
    const subject = `🚨 URGENT: Emergency SOS triggered by ${username} 🚨`;
    const body = `Hello ${contactName},

This is an automated emergency broadcast from SafePath AI.

Your trusted contact, ${username}, has triggered an Emergency SOS alert.

They require immediate assistance.
Last Known Location Map Link: ${mapLink}

Please take immediate action or notify the local emergency authorities.

Best Regards,
SafePath AI Safety Team`;

    if (this.emailTransporter) {
      try {
        const info = await this.emailTransporter.sendMail({
          from: `"SafePath AI" <${config.smtp.user}>`,
          to: contactEmail,
          subject,
          text: body
        });
        return {
          recipientName: contactName,
          recipientEmail: contactEmail,
          status: 'Sent (Real Email)',
          messageId: info.messageId
        };
      } catch (err) {
        logger.error(`Real Email sending failed to ${contactName} (${contactEmail}): ${err.message}`);
        return {
          recipientName: contactName,
          recipientEmail: contactEmail,
          status: 'Failed (Real Email)',
          error: err.message
        };
      }
    } else {
      logger.info(`
================ SIMULATED EMAIL BROADCAST ===============
TO: ${contactEmail}
SUBJECT: ${subject}
BODY:
${body}
===========================================================
      `);
      return {
        recipientName: contactName,
        recipientEmail: contactEmail,
        subject,
        status: 'Sent (Simulated)'
      };
    }
  }

  /**
   * Send shared route tracking email (real or simulated).
   */
  async sendShareRoute(contactEmail, contactName, username, destinationName) {
    const subject = `SafePath AI - ${username} shared a live route`;
    const body = `Hello ${contactName},

This is an automated notification from SafePath AI.

Your trusted contact, ${username}, has started a route to ${destinationName}.

You can track their live location and safety status here:
https://safepath.ai/track/simulated-link

Best Regards,
SafePath AI Safety Team`;

    if (this.emailTransporter) {
      try {
        const info = await this.emailTransporter.sendMail({
          from: `"SafePath AI" <${config.smtp.user}>`,
          to: contactEmail,
          subject,
          text: body
        });
        return {
          recipientName: contactName,
          recipientEmail: contactEmail,
          status: 'Sent (Real Email)',
          messageId: info.messageId
        };
      } catch (err) {
        logger.error(`Live Location Email to ${contactName} failed: ${err.message}`);
        return {
          recipientName: contactName,
          recipientEmail: contactEmail,
          status: 'Failed (Real Email)',
          error: err.message
        };
      }
    } else {
      logger.info(`
============== SIMULATED LIVE LOCATION EMAIL ==============
TO: ${contactEmail}
SUBJECT: ${subject}
BODY:
${body}
===========================================================
      `);
      return {
        recipientName: contactName,
        recipientEmail: contactEmail,
        status: 'Sent (Simulated)'
      };
    }
  }
}

module.exports = new EmailService();
