const mongoose = require('mongoose');
const crypto   = require('crypto');

function getKey() {
  const raw = process.env.ENCRYPTION_KEY || process.env.JWT_SECRET;
  if (!raw) throw new Error('ENCRYPTION_KEY or JWT_SECRET must be set');
  return crypto.scryptSync(raw, 'shopify-token-salt-v1', 32);
}

function encrypt(plain) {
  const iv      = crypto.randomBytes(16);
  const cipher  = crypto.createCipheriv('aes-256-cbc', getKey(), iv);
  const enc     = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return { encryptedToken: enc.toString('hex'), iv: iv.toString('hex') };
}

function decrypt(hex, ivHex) {
  const decipher = crypto.createDecipheriv('aes-256-cbc', getKey(), Buffer.from(ivHex, 'hex'));
  const dec      = Buffer.concat([decipher.update(Buffer.from(hex, 'hex')), decipher.final()]);
  return dec.toString('utf8');
}

const schema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true,
  },
  shop: {
    type: String,
    required: true,
    trim: true,
    lowercase: true,
  },
  encryptedToken: { type: String, required: true },
  iv:             { type: String, required: true },
  scope:          { type: String, default: '' },
  webhookId:      { type: String, default: null },
  lastSyncAt:     { type: Date,   default: null },
}, { timestamps: true });

schema.methods.getAccessToken = function () {
  return decrypt(this.encryptedToken, this.iv);
};

schema.methods.setAccessToken = function (plain) {
  const { encryptedToken, iv } = encrypt(plain);
  this.encryptedToken = encryptedToken;
  this.iv             = iv;
};

schema.set('toJSON', {
  transform(doc, ret) {
    delete ret.encryptedToken;
    delete ret.iv;
    return ret;
  },
});

module.exports = mongoose.model('ShopifyConnection', schema);
