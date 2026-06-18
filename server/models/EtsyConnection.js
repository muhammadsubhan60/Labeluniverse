const mongoose = require('mongoose');
const crypto   = require('crypto');

function getKey() {
  const raw = process.env.ENCRYPTION_KEY || process.env.JWT_SECRET;
  if (!raw) throw new Error('ENCRYPTION_KEY or JWT_SECRET must be set');
  return crypto.scryptSync(raw, 'etsy-token-salt-v1', 32);
}

function encrypt(plain) {
  const iv     = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', getKey(), iv);
  const enc    = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
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

  // Per-user Etsy app credentials (entered in UI)
  keystring:             { type: String, default: '' }, // Etsy API keystring = client_id
  encryptedSharedSecret: { type: String, default: '' }, // for webhook HMAC verification
  sharedSecretIv:        { type: String, default: '' },

  // OAuth tokens (set after OAuth completes)
  encryptedAccessToken:  { type: String, default: '' },
  accessTokenIv:         { type: String, default: '' },
  encryptedRefreshToken: { type: String, default: '' },
  refreshTokenIv:        { type: String, default: '' },
  tokenExpiresAt:        { type: Date,   default: null },

  // Shop info resolved after OAuth
  shopId:   { type: String, default: '' },
  shopName: { type: String, default: '' },

  // Temporary PKCE verifier stored between auth-url request and callback
  pendingVerifier: { type: String, default: '' },

  lastSyncAt: { type: Date, default: null },
}, { timestamps: true });

schema.methods.getAccessToken = function () {
  if (!this.encryptedAccessToken || !this.accessTokenIv) return null;
  return decrypt(this.encryptedAccessToken, this.accessTokenIv);
};
schema.methods.setAccessToken = function (plain) {
  const { encrypted, iv } = encrypt(plain);
  this.encryptedAccessToken = encrypted;
  this.accessTokenIv        = iv;
};

schema.methods.getRefreshToken = function () {
  if (!this.encryptedRefreshToken || !this.refreshTokenIv) return null;
  return decrypt(this.encryptedRefreshToken, this.refreshTokenIv);
};
schema.methods.setRefreshToken = function (plain) {
  const { encrypted, iv } = encrypt(plain);
  this.encryptedRefreshToken = encrypted;
  this.refreshTokenIv        = iv;
};

schema.methods.getSharedSecret = function () {
  if (!this.encryptedSharedSecret || !this.sharedSecretIv) return null;
  return decrypt(this.encryptedSharedSecret, this.sharedSecretIv);
};
schema.methods.setSharedSecret = function (plain) {
  const { encrypted, iv } = encrypt(plain);
  this.encryptedSharedSecret = encrypted;
  this.sharedSecretIv        = iv;
};

schema.set('toJSON', {
  transform(doc, ret) {
    delete ret.encryptedAccessToken;
    delete ret.accessTokenIv;
    delete ret.encryptedRefreshToken;
    delete ret.refreshTokenIv;
    delete ret.encryptedSharedSecret;
    delete ret.sharedSecretIv;
    delete ret.pendingVerifier;
    return ret;
  },
});

module.exports = mongoose.model('EtsyConnection', schema);
