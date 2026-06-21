const express          = require('express');
const PlatformApiKey   = require('../models/PlatformApiKey');
const { authenticateToken, authorize } = require('../middleware/auth');
const shiplabel  = require('../services/shiplabel');
const labelcrow  = require('../services/labelcrow');

const router = express.Router();

const SERVICES = ['shiplabel', 'labelcrow'];

// ── GET /api/api-keys  ─────────────────────────────────────────
// Returns all configured keys (masked — never expose plaintext)
router.get('/', authenticateToken, authorize('admin'), async (req, res) => {
  try {
    const tenantId = req.user.tenantId || req.user._id;
    const docs = await PlatformApiKey.find({ tenantId });
    const result = SERVICES.map(svc => {
      const doc = docs.find(d => d.service === svc);
      return {
        service:    svc,
        configured: !!doc,
        testedAt:   doc?.testedAt   ?? null,
        testStatus: doc?.testStatus ?? null,
        updatedAt:  doc?.updatedAt  ?? null,
        maskedKey:  doc ? maskKey(doc.getKey()) : null,
      };
    });
    res.json({ keys: result });
  } catch (err) {
    console.error('GET /api-keys error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ── PUT /api/api-keys/:service  ────────────────────────────────
router.put('/:service', authenticateToken, authorize('admin'), async (req, res) => {
  const { service } = req.params;
  if (!SERVICES.includes(service)) return res.status(400).json({ message: 'Unknown service' });

  const { apiKey } = req.body;
  if (!apiKey || typeof apiKey !== 'string' || !apiKey.trim()) {
    return res.status(400).json({ message: 'apiKey is required' });
  }

  try {
    const tenantId = req.user.tenantId || req.user._id;
    let doc = await PlatformApiKey.findOne({ service, tenantId });
    if (!doc) doc = new PlatformApiKey({ service, tenantId, encryptedKey: '', iv: '' });
    doc.setKey(apiKey.trim());
    doc.testStatus = null;
    doc.testedAt   = null;
    await doc.save();

    if (service === 'shiplabel' && shiplabel.clearKeyCache)  shiplabel.clearKeyCache(tenantId);
    if (service === 'labelcrow' && labelcrow.clearKeyCache)  labelcrow.clearKeyCache(tenantId);

    res.json({ message: 'API key saved', maskedKey: maskKey(apiKey.trim()) });
  } catch (err) {
    console.error('PUT /api-keys error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ── POST /api/api-keys/:service/test  ─────────────────────────
router.post('/:service/test', authenticateToken, authorize('admin'), async (req, res) => {
  const { service } = req.params;
  if (!SERVICES.includes(service)) return res.status(400).json({ message: 'Unknown service' });

  const tenantId = req.user.tenantId || req.user._id;
  const doc = await PlatformApiKey.findOne({ service, tenantId });
  if (!doc) return res.status(404).json({ message: 'No key configured yet' });

  try {
    let ok = false;
    let msg = '';

    if (service === 'shiplabel') {
      const services = await shiplabel.getServices(tenantId);
      ok  = Array.isArray(services) && services.length > 0;
      msg = ok ? `Connected — ${services.length} service(s) available` : 'Connected but no services returned';
    } else if (service === 'labelcrow') {
      const result = await labelcrow.getServices(tenantId);
      ok  = Array.isArray(result) && result.length > 0;
      msg = ok ? `Connected — ${result.length} service(s) available` : 'Connected but no services returned';
    }

    doc.testStatus = ok ? 'success' : 'failed';
    doc.testedAt   = new Date();
    await doc.save();

    res.json({ ok, message: msg });
  } catch (err) {
    try {
      doc.testStatus = 'failed';
      doc.testedAt   = new Date();
      await doc.save();
    } catch {}
    res.status(200).json({ ok: false, message: err.message || 'Connection failed' });
  }
});

// ── DELETE /api/api-keys/:service  ────────────────────────────
router.delete('/:service', authenticateToken, authorize('admin'), async (req, res) => {
  const { service } = req.params;
  if (!SERVICES.includes(service)) return res.status(400).json({ message: 'Unknown service' });
  try {
    const tenantId = req.user.tenantId || req.user._id;
    await PlatformApiKey.deleteOne({ service, tenantId });
    if (service === 'shiplabel' && shiplabel.clearKeyCache) shiplabel.clearKeyCache(tenantId);
    if (service === 'labelcrow' && labelcrow.clearKeyCache) labelcrow.clearKeyCache(tenantId);
    res.json({ message: 'Key removed' });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

function maskKey(key) {
  if (!key || key.length < 8) return '••••••••';
  return key.slice(0, 4) + '••••••••' + key.slice(-4);
}

module.exports = router;
