const mongoose = require('mongoose');

const TrustedContactSchema = new mongoose.Schema({
  name: { type: String, required: true },
  phone: { type: String, required: true },
  email: { type: String, required: true },
  isSOSContact: { type: Boolean, default: true }
});

const SavedRouteSchema = new mongoose.Schema({
  name: { type: String },
  sourceName: { type: String },
  destName: { type: String },
  sourceCoords: {
    lat: { type: Number, required: true },
    lng: { type: Number, required: true }
  },
  destCoords: {
    lat: { type: Number, required: true },
    lng: { type: Number, required: true }
  },
  safetyScore: { type: Number },
  createdAt: { type: Date, default: Date.now }
});

const UserSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  trustedContacts: [TrustedContactSchema],
  savedRoutes: [SavedRouteSchema],
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('User', UserSchema);
