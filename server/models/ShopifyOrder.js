const mongoose = require('mongoose');

const lineItemSchema = new mongoose.Schema({
  title:    { type: String },
  sku:      { type: String },
  quantity: { type: Number },
  price:    { type: String },
}, { _id: false });

const addressSchema = new mongoose.Schema({
  firstName: String,
  lastName:  String,
  company:   String,
  address1:  String,
  address2:  String,
  city:      String,
  province:      String, // full name e.g. "New York"
  provinceCode:  String, // 2-letter e.g. "NY"
  zip:       String,
  country:   String,
  phone:     String,
}, { _id: false });

const schema = new mongoose.Schema({
  userId:         { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  shop:           { type: String, required: true },
  shopifyOrderId: { type: String, required: true },
  orderNumber:    { type: String },
  customer: {
    firstName: String,
    lastName:  String,
    email:     String,
    phone:     String,
  },
  shippingAddress: addressSchema,
  lineItems:       [lineItemSchema],
  totalPrice:         { type: String },
  currency:           { type: String, default: 'USD' },
  financialStatus:    { type: String },  // paid, pending, refunded …
  fulfillmentStatus:  { type: String },  // null = unfulfilled, partial, fulfilled
  shopifyCreatedAt:   { type: Date },
  labelGenerated:     { type: Boolean, default: false },
  labelGeneratedAt:   { type: Date, default: null },
}, { timestamps: true });

schema.index({ userId: 1, shopifyOrderId: 1 }, { unique: true });

module.exports = mongoose.model('ShopifyOrder', schema);
