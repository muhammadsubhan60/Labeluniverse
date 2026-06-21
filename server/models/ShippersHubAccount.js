const mongoose = require('mongoose');
const crypto   = require('crypto');

// ── Encryption helpers ────────────────────────────────────────────────────────
// Uses a dedicated ENCRYPTION_KEY env var, separate from JWT_SECRET.
// Falls back to JWT_SECRET with a deprecation warning so existing deployments
// continue to work; set ENCRYPTION_KEY to rotate to a proper dedicated secret.
function getKey() {
  const raw = process.env.ENCRYPTION_KEY || process.env.JWT_SECRET;
  if (!raw) {
    throw new Error(
      'Neither ENCRYPTION_KEY nor JWT_SECRET is set. ' +
      'Set ENCRYPTION_KEY (preferred) to enable credential encryption.'
    );
  }
  if (!process.env.ENCRYPTION_KEY && process.env.JWT_SECRET) {
    console.warn(
      '[ShippersHubAccount] ENCRYPTION_KEY is not set — falling back to JWT_SECRET. ' +
      'Set a dedicated ENCRYPTION_KEY in your .env file.'
    );
  }
  return crypto.scryptSync(raw, 'shippershub-credential-salt-v1', 32);
}

function encrypt(plainText) {
  const iv         = crypto.randomBytes(16);
  const cipher     = crypto.createCipheriv('aes-256-cbc', getKey(), iv);
  const encrypted  = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
  return { encryptedPassword: encrypted.toString('hex'), iv: iv.toString('hex') };
}

function decrypt(encryptedHex, ivHex) {
  const decipher  = crypto.createDecipheriv('aes-256-cbc', getKey(), Buffer.from(ivHex, 'hex'));
  const decrypted = Buffer.concat([decipher.update(Buffer.from(encryptedHex, 'hex')), decipher.final()]);
  return decrypted.toString('utf8');
}

// ── Schema ────────────────────────────────────────────────────────────────────
const shippersHubAccountSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Account name is required'],
    trim: true,
    maxlength: [100, 'Name cannot exceed 100 characters'],
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    trim: true,
    lowercase: true,
  },
  encryptedPassword: {
    type: String,
    required: true,
  },
  iv: {
    type: String,
    required: true,
  },
  isActive: {
    type: Boolean,
    default: false,
  },
  testedAt: {
    type: Date,
    default: null,
  },
  testStatus: {
    type: String,
    enum: ['success', 'failed', null],
    default: null,
  },
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
    index: true,
  },
}, {
  timestamps: true,
});

// Only one account can be active at a time — enforced in the route layer
shippersHubAccountSchema.index({ isActive: 1 });

// Instance method: decrypt password on demand
shippersHubAccountSchema.methods.getPassword = function () {
  return decrypt(this.encryptedPassword, this.iv);
};

// Static helper: set a new plain-text password (encrypts in place)
shippersHubAccountSchema.methods.setPassword = function (plainText) {
  const { encryptedPassword, iv } = encrypt(plainText);
  this.encryptedPassword = encryptedPassword;
  this.iv = iv;
};

// Never expose encrypted fields in JSON responses
shippersHubAccountSchema.set('toJSON', {
  transform(doc, ret) {
    delete ret.encryptedPassword;
    delete ret.iv;
    return ret;
  },
});

module.exports = mongoose.model('ShippersHubAccount', shippersHubAccountSchema);
