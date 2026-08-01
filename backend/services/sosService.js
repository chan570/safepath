const userRepository = require('../repositories/UserRepository');
const emailService = require('./emailService');
const AppError = require('../errors/AppError');
const logger = require('../utils/logger');

class SosService {
  /**
   * Trigger emergency SOS notification to trusted contacts.
   * @param {object} location - Coords {lat, lng}
   * @param {string} userId - Target user ID (optional)
   * @param {object} reqUser - Decoded user from auth token (optional)
   */
  async triggerSOS(location, userId, reqUser) {
    let username = 'A SafePath User';
    let contacts = [];

    // BOLA/IDOR Security Enforcement
    if (userId) {
      if (!reqUser || reqUser.id !== userId) {
        throw new AppError('Access Denied: Cannot trigger SOS for another user account.', 403);
      }

      const user = await userRepository.findById(userId);
      if (user) {
        username = user.username;
        contacts = user.trustedContacts || [];
      } else {
        throw new AppError('User profile not found.', 404);
      }
    }

    const mapLink = `https://www.google.com/maps/search/?api=1&query=${location.lat},${location.lng}`;

    // Broadcast email notifications (Real or Simulated)
    const emailBroadcasts = await Promise.all(
      contacts.map(async (contact) => {
        return await emailService.sendEmergencySOS(contact.email, contact.name, username, mapLink);
      })
    );

    return {
      success: true,
      username,
      location,
      contactsNotifiedCount: contacts.length,
      emailBroadcasts,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Share live route tracking links with trusted contacts.
   * @param {string} userId - Authenticated user ID
   * @param {object} route - Route info
   */
  async shareRoute(userId, route) {
    const user = await userRepository.findById(userId);
    if (!user) {
      throw new AppError('User profile not found.', 404);
    }

    const username = user.username;
    const contacts = user.trustedContacts || [];
    const destName = route && route.destination ? route.destination.name : 'their destination';

    // Broadcast live location email updates
    const emailBroadcasts = await Promise.all(
      contacts.map(async (contact) => {
        return await emailService.sendShareRoute(contact.email, contact.name, username, destName);
      })
    );

    return {
      success: true,
      contactsNotifiedCount: contacts.length,
      emailBroadcasts
    };
  }
}

module.exports = new SosService();
