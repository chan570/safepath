const mongoose = require('mongoose');

const StreetLightSchema = new mongoose.Schema({
  id: { type: String, required: true },
  coordinates: {
    lat: { type: Number, required: true },
    lng: { type: Number, required: true }
  },
  status: { type: String, enum: ['Unlit', 'Dim', 'Bright'], default: 'Dim' },
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

StreetLightSchema.index({ location: '2dsphere' });

module.exports = mongoose.model('StreetLight', StreetLightSchema);
