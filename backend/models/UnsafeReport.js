const mongoose = require('mongoose');

const UnsafeReportSchema = new mongoose.Schema({
  reporter: { 
    type: String, // String representation or ObjectId for simpler fallback
    required: false 
  },
  issueType: {
    type: String,
    enum: ['Poorly Lit', 'Harassment Zone', 'Deserted Street', 'No Police Presence', 'Stalking/Suspicious Activity', 'Other'],
    required: true
  },
  severity: {
    type: String,
    enum: ['Low', 'Medium', 'High'],
    default: 'Medium'
  },
  description: { type: String },
  coordinates: {
    lat: { type: Number, required: true },
    lng: { type: Number, required: true }
  },
  // GeoJSON structure for geospatial spatial indexing
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
  },
  createdAt: { type: Date, default: Date.now }
});

// Create 2dsphere index for ultra-fast spatial search
UnsafeReportSchema.index({ location: '2dsphere' });

module.exports = mongoose.model('UnsafeReport', UnsafeReportSchema);
