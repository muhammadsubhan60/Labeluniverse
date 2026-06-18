const mongoose = require('mongoose');

const lineItemSchema = new mongoose.Schema({
  title:    { type: String },
  sku:      { type: String },
  quantity: { type: Number },
  price:    { type: String },
}, { _id: false });

const addressSchema = new mongoose.Schema({
  firstName:    String,
  lastName:     String,
  address1:     String,
  address2:     String,
  city:         String,
  province:     String,
  provinceCode: String,
  zip:          String,
  country:      String,
}, { _id: false });

const schema = new mongoose.Schema({
  userId:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  shopId:    { type: String, required: true },
  shopName:  { type: String },
  receiptId: { type: String, required: true },
  orderNumber: { type: String },
  source:    { type: String, default: 'etsy' },

  customer: {
    firstName: String,
    lastName:  String,
    email:     String,
  },
  shippingAddress: addressSchema,
  lineItems:       [lineItemSchema],

  totalPrice:        { type: String },
  currency:          { type: String, default: 'USD' },
  isPaid:            { type: Boolean, default: false },
  isShipped:         { type: Boolean, default: false },
  isCanceled:        { type: Boolean, default: false },
  financialStatus:   { type: String }, // 'paid' | 'pending'
  fulfillmentStatus: { type: String }, // 'fulfilled' | 'unfulfilled'

  etsyCreatedAt:    { type: Date },
  labelGenerated:   { type: Boolean, default: false },
  labelGeneratedAt: { type: Date,    default: null },
}, { timestamps: true });

schema.index({ userId: 1, receiptId: 1 }, { unique: true });

module.exports = mongoose.model('EtsyOrder', schema);
