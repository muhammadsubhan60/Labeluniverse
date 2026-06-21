const express  = require('express');
const { authenticateToken, authorize } = require('../middleware/auth');
const ShippersHubAccount = require('../models/ShippersHubAccount');
const shippershub        = require('../services/shippershub');

const router = express.Router();

// All routes: authenticated + admin only
router.use(authenticateToken, authorize('admin'));

// ── GET /api/shippershub-accounts ─────────────────────────────────────────────
// List all accounts (passwords never returned)
router.get('/', async (req, res) => {
  try {
    const tenantId = req.user.tenantId || req.user._id;
    const accounts = await ShippersHubAccount.find({ tenantId }).sort({ createdAt: 1 });
    res.json({ accounts });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── POST /api/shippershub-accounts ───────────────────────────────────────────
// Create a new account
router.post('/', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ message: 'name, email, and password are required' });
    }

    const tenantId = req.user.tenantId || req.user._id;
    const account = new ShippersHubAccount({ name, email, encryptedPassword: '', iv: '', tenantId });
    account.setPassword(password);
    await account.save();

    res.status(201).json({ message: 'Account created', account });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── PUT /api/shippershub-accounts/:id ────────────────────────────────────────
// Update name / email / password (any subset)
router.put('/:id', async (req, res) => {
  try {
    const tenantId = req.user.tenantId || req.user._id;
    const account = await ShippersHubAccount.findOne({ _id: req.params.id, tenantId });
    if (!account) return res.status(404).json({ message: 'Account not found' });

    const { name, email, password } = req.body;
    if (name)     account.name  = name;
    if (email)    account.email = email.toLowerCase().trim();
    if (password) account.setPassword(password);

    // If this is the active account, clear cached token so next request re-auths
    if (account.isActive) shippershub.clearToken(tenantId);

    await account.save();
    res.json({ message: 'Account updated', account });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── DELETE /api/shippershub-accounts/:id ─────────────────────────────────────
// Delete — cannot delete the active account
router.delete('/:id', async (req, res) => {
  try {
    const tenantId = req.user.tenantId || req.user._id;
    const account = await ShippersHubAccount.findOne({ _id: req.params.id, tenantId });
    if (!account) return res.status(404).json({ message: 'Account not found' });
    if (account.isActive) {
      return res.status(400).json({ message: 'Cannot delete the active account. Activate another account first.' });
    }

    await account.deleteOne();
    res.json({ message: 'Account deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── POST /api/shippershub-accounts/:id/activate ──────────────────────────────
// Set this account as the active one, deactivate all others
router.post('/:id/activate', async (req, res) => {
  try {
    const tenantId = req.user.tenantId || req.user._id;
    const account = await ShippersHubAccount.findOne({ _id: req.params.id, tenantId });
    if (!account) return res.status(404).json({ message: 'Account not found' });

    // Deactivate all accounts in this tenant only
    await ShippersHubAccount.updateMany({ tenantId }, { isActive: false });
    // Activate this one
    account.isActive = true;
    await account.save();

    // Clear cached token so the new account is used immediately
    shippershub.clearToken(tenantId);

    res.json({ message: `"${account.name}" is now the active account`, account });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── POST /api/shippershub-accounts/:id/test ──────────────────────────────────
// Test credentials without saving or changing active account
router.post('/:id/test', async (req, res) => {
  try {
    const tenantId = req.user.tenantId || req.user._id;
    const account = await ShippersHubAccount.findOne({ _id: req.params.id, tenantId });
    if (!account) return res.status(404).json({ message: 'Account not found' });

    const password = account.getPassword();

    // Attempt login against ShippersHub directly
    const result = await shippershub.testCredentials(account.email, password);

    account.testedAt   = new Date();
    account.testStatus = 'success';
    await account.save();

    res.json({ message: 'Connection successful', testedAt: account.testedAt });
  } catch (err) {
    // Record failure
    try {
      const account = await ShippersHubAccount.findById(req.params.id);
      if (account) { account.testedAt = new Date(); account.testStatus = 'failed'; await account.save(); }
    } catch (_) {}

    res.status(400).json({ message: `Connection failed: ${err.message}` });
  }
});

// ── GET /api/shippershub-accounts/carriers ───────────────────────────────────
// Returns carriers + vendors available on the active ShippersHub account.
// Use this to find the correct shippershubCarrierId / shippershubVendorId
// values to put in VendorManagement.
router.get('/carriers', async (req, res) => {
  try {
    const tenantId = req.user.tenantId || req.user._id;
    const carriers = await shippershub.getMyCarriers(tenantId);
    const result   = [];
    for (const c of carriers) {
      let vendors = [];
      try { vendors = await shippershub.getMyVendors(c._id || c.id, tenantId); } catch (_) {}
      result.push({ ...c, vendors });
    }
    res.json({ carriers: result });
  } catch (err) {
    res.status(400).json({ message: `Could not fetch carriers: ${err.message}` });
  }
});

module.exports = router;
