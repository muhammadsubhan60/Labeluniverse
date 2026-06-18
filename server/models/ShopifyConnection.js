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
  return { encrypted: enc.toString('hex'), iv: iv.toString('hex') };
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

  // Per-user Shopify Custom App credentials
  clientId:              { type: String, default: '' },
  encryptedClientSecret: { type: String, default: '' },
  clientSecretIv:        { type: String, default: '' },

  // OAuth access token (set after OAuth completes)
  encryptedToken: { type: String, default: '' },
  iv:             { type: String, default: '' },

  scope:      { type: String,  default: '' },
  webhookId:  { type: String,  default: null },
  lastSyncAt: { type: Date,    default: null },
}, { timestamps: true });

schema.methods.getAccessToken = function () {
  if (!this.encryptedToken || !this.iv) return null;
  return decrypt(this.encryptedToken, this.iv);
};

schema.methods.setAccessToken = function (plain) {
  const { encrypted, iv } = encrypt(plain);
  this.encryptedToken = encrypted;
  this.iv             = iv;
};

schema.methods.getClientSecret = function () {
  if (!this.encryptedClientSecret || !this.clientSecretIv) return null;
  return decrypt(this.encryptedClientSecret, this.clientSecretIv);
};

schema.methods.setClientSecret = function (plain) {
  const { encrypted, iv } = encrypt(plain);
  this.encryptedClientSecret = encrypted;
  this.clientSecretIv        = iv;
};

schema.set('toJSON', {
  transform(doc, ret) {
    delete ret.encryptedToken;
    delete ret.iv;
    delete ret.encryptedClientSecret;
    delete ret.clientSecretIv;
    return ret;
  },
});

module.exports = mongoose.model('ShopifyConnection', schema);
