const mongoose = require('mongoose');

const leaderboardEntrySchema = new mongoose.Schema({
  vendorName: { type: String, required: true, trim: true },
  portal: {
    type: String,
    enum: ['shippershub', 'labelcrow', 'shiplabel'],
    required: true,
  },
  carrier:        { type: String, default: 'USPS' },
  shippingService:{ type: String, default: '' },
  successRate:    { type: Number, min: 0, max: 100, required: true },
  totalLabels:    { type: Number, default: 0, min: 0 },
  isVisible:      { type: Boolean, default: true },
  vendor:         { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', default: null },
}, { timestamps: true });

module.exports = mongoose.model('LeaderboardEntry', leaderboardEntrySchema);
