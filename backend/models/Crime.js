const mongoose = require('mongoose');

const CrimeSchema = new mongoose.Schema({
  id: { type: String, required: true },
  coordinates: {
    lat: { type: Number, required: true },
    lng: { type: Number, required: true }
  },
  severity: { type: String, enum: ['Low', 'Medium', 'High'], default: 'Medium' },
  type: { type: String, required: true },
  description: { type: String },
  location: {
    type: {
      type: String,
      enum: ['Point'],
      default: 'Point'
    },
    coordinates: {
      type: [Number], // [longitude, latitude] - MongoDB spatial format
      required: true
    }
  }
});

CrimeSchema.index({ location: '2dsphere' });

module.exports = mongoose.model('Crime', CrimeSchema);
