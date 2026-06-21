const mongoose = require('mongoose');
const crypto = require('crypto');

function getEncKey() {
  const raw = process.env.ENCRYPTION_KEY || process.env.JWT_SECRET;
  if (!raw) throw new Error('Neither ENCRYPTION_KEY nor JWT_SECRET is set.');
  return crypto.scryptSync(raw, 'platform-apikey-salt-v1', 32);
}

function encrypt(plain) {
  const iv      = crypto.randomBytes(16);
  const cipher  = crypto.createCipheriv('aes-256-cbc', getEncKey(), iv);
  const enc     = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return { encryptedKey: enc.toString('hex'), iv: iv.toString('hex') };
}

function decrypt(encHex, ivHex) {
  const decipher = crypto.createDecipheriv('aes-256-cbc', getEncKey(), Buffer.from(ivHex, 'hex'));
  return Buffer.concat([decipher.update(Buffer.from(encHex, 'hex')), decipher.final()]).toString('utf8');
}

const schema = new mongoose.Schema({
  service:      { type: String, required: true, enum: ['shiplabel', 'labelcrow'] },
  tenantId:     { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  encryptedKey: { type: String, required: true },
  iv:           { type: String, required: true },
  testedAt:     { type: Date,   default: null },
  testStatus:   { type: String, enum: ['success', 'failed', null], default: null },
}, { timestamps: true });

schema.index({ service: 1, tenantId: 1 }, { unique: true });

schema.methods.getKey  = function () { return decrypt(this.encryptedKey, this.iv); };
schema.methods.setKey  = function (plain) {
  const { encryptedKey, iv } = encrypt(plain);
  this.encryptedKey = encryptedKey;
  this.iv = iv;
};

schema.set('toJSON', {
  transform(doc, ret) { delete ret.encryptedKey; delete ret.iv; return ret; },
});

module.exports = mongoose.model('PlatformApiKey', schema);
