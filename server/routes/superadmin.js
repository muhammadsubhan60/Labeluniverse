const express        = require('express');
const mongoose       = require('mongoose');
const { body, validationResult } = require('express-validator');
const User                = require('../models/User');
const Label               = require('../models/Label');
const PlatformApiKey      = require('../models/PlatformApiKey');
const Balance             = require('../models/Balance');
const Rate                = require('../models/Rate');
const Vendor              = require('../models/Vendor');
const ShippersHubAccount  = require('../models/ShippersHubAccount');
const { authenticateToken, authorize } = require('../middleware/auth');

const router = express.Router();

// ── GET /api/superadmin/status ────────────────────────────────────
// Public — frontend uses this to know if setup has been completed
router.get('/status', async (req, res) => {
  try {
    const sa = await User.findOne({ role: 'superadmin' });
    res.json({ configured: !!sa });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// ── POST /api/superadmin/setup ────────────────────────────────────
// One-time bootstrap: create superadmin + migrate existing data to default tenant
router.post('/setup', [
  body('firstName').trim().notEmpty().withMessage('First name required'),
  body('lastName').trim().notEmpty().withMessage('Last name required'),
  body('email').isEmail().normalizeEmail().withMessage('Valid email required'),
  body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ message: errors.array()[0].msg });

    const existing = await User.findOne({ role: 'superadmin' });
    if (existing) return res.status(400).json({ message: 'Super admin already configured' });

    const { firstName, lastName, email, password } = req.body;

    const emailTaken = await User.findOne({ email });
    if (emailTaken) return res.status(400).json({ message: 'Email already in use' });

    // Create superadmin — no tenantId (sits above all tenants)
    await User.create({ firstName, lastName, email, password, role: 'superadmin', tenantId: null });

    // Run migration: assign all existing data to admin@uspslabelportal.com's tenant
    const migrated = await runMigration();

    res.status(201).json({ message: 'Super admin created', migrated });
  } catch (err) {
    console.error('Superadmin setup error:', err);
    res.status(500).json({ message: 'Server error during setup' });
  }
});

// ── All routes below require superadmin role ──────────────────────
const requireSA = [authenticateToken, authorize('superadmin')];

// ── POST /api/superadmin/migrate ──────────────────────────────────
// Re-run migration (superadmin only) — safe to call multiple times
router.post('/migrate', ...requireSA, async (req, res) => {
  try {
    const result = await runMigration();
    res.json({ message: 'Migration complete', result });
  } catch (err) {
    console.error('Migration error:', err);
    res.status(500).json({ message: 'Migration failed', error: err.message });
  }
});

// ── GET /api/superadmin/admins ────────────────────────────────────
router.get('/admins', ...requireSA, async (req, res) => {
  try {
    // Only show tenant root admins — those whose tenantId === their own _id
    // (sub-admins created by a tenant admin have tenantId = the tenant root's _id, not their own)
    const admins = await User.find({ role: 'admin', $expr: { $eq: ['$tenantId', '$_id'] } })
      .select('firstName lastName email isActive createdAt tenantId')
      .sort({ createdAt: -1 });

    const adminIds = admins.map(a => a._id);
    const [userCounts, balances] = await Promise.all([
      User.aggregate([
        { $match: { tenantId: { $in: adminIds }, role: { $ne: 'admin' } } },
        { $group: { _id: '$tenantId', count: { $sum: 1 } } },
      ]),
      Balance.find({ user: { $in: adminIds } }).select('user currentBalance').lean(),
    ]);
    const countMap = {};
    for (const g of userCounts) countMap[String(g._id)] = g.count;
    const balanceMap = {};
    for (const b of balances) balanceMap[String(b.user)] = b.currentBalance;

    res.json({
      admins: admins.map(a => ({
        ...a.toJSON(),
        userCount:       countMap[String(a._id)]  || 0,
        currentBalance:  balanceMap[String(a._id)] || 0,
      })),
    });
  } catch (err) {
    console.error('List admins error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ── POST /api/superadmin/admins ────────────────────────────────────
router.post('/admins', ...requireSA, [
  body('firstName').trim().notEmpty().withMessage('First name required'),
  body('lastName').trim().notEmpty().withMessage('Last name required'),
  body('email').isEmail().normalizeEmail().withMessage('Valid email required'),
  body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ message: errors.array()[0].msg });

    const { firstName, lastName, email, password } = req.body;
    const existing = await User.findOne({ email });
    if (existing) return res.status(400).json({ message: 'Email already in use' });

    // Generate _id upfront so tenantId = own _id (admin IS the tenant root)
    const _id = new mongoose.Types.ObjectId();
    const admin = await User.create({ _id, firstName, lastName, email, password, role: 'admin', tenantId: _id });

    res.status(201).json({ message: 'Admin created', admin });
  } catch (err) {
    console.error('Create admin error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ── PUT /api/superadmin/admins/:id/revoke ────────────────────────
router.put('/admins/:id/revoke', ...requireSA, async (req, res) => {
  try {
    const admin = await User.findOneAndUpdate(
      { _id: req.params.id, role: 'admin' },
      { isActive: false },
      { new: true }
    ).select('-password');
    if (!admin) return res.status(404).json({ message: 'Admin not found' });
    res.json({ message: 'Admin access revoked', admin });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// ── PUT /api/superadmin/admins/:id/restore ────────────────────────
router.put('/admins/:id/restore', ...requireSA, async (req, res) => {
  try {
    const admin = await User.findOneAndUpdate(
      { _id: req.params.id, role: 'admin' },
      { isActive: true },
      { new: true }
    ).select('-password');
    if (!admin) return res.status(404).json({ message: 'Admin not found' });
    res.json({ message: 'Admin access restored', admin });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// ── GET /api/superadmin/admins/:id/balance ───────────────────────
router.get('/admins/:id/balance', ...requireSA, async (req, res) => {
  try {
    const admin = await User.findOne({ _id: req.params.id, role: 'admin' });
    if (!admin) return res.status(404).json({ message: 'Admin not found' });
    const balance = await Balance.getOrCreateBalance(req.params.id);
    const transactions = [...balance.transactions]
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, 20);
    res.json({ currentBalance: balance.currentBalance, transactions });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// ── POST /api/superadmin/admins/:id/balance ──────────────────────
// type: 'topup' | 'deduct' | 'adjust'  (adjust amount can be negative)
router.post('/admins/:id/balance', ...requireSA, [
  body('type').isIn(['topup', 'deduct', 'adjust']).withMessage('Invalid type'),
  body('amount').isFloat().withMessage('Amount must be a number'),
  body('description').optional().isString(),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ message: errors.array()[0].msg });

    const admin = await User.findOne({ _id: req.params.id, role: 'admin' });
    if (!admin) return res.status(404).json({ message: 'Admin not found' });

    const { type, description } = req.body;
    const amount  = parseFloat(req.body.amount);
    const balance = await Balance.getOrCreateBalance(req.params.id);

    if (type === 'deduct' && balance.currentBalance < amount) {
      return res.status(400).json({ message: 'Insufficient balance' });
    }

    const txnType = type === 'deduct' ? 'deduction' : type === 'adjust' ? 'adjustment' : 'topup';
    await balance.addTransaction({
      type:        txnType,
      amount,
      description: description || `${type} by Super Admin`,
      performedBy: req.user._id,
    });

    res.json({ message: 'Balance updated', currentBalance: balance.currentBalance });
  } catch (err) {
    console.error('SA balance error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ── DELETE /api/superadmin/admins/:id ────────────────────────────
router.delete('/admins/:id', ...requireSA, async (req, res) => {
  try {
    const admin = await User.findOne({ _id: req.params.id, role: 'admin' });
    if (!admin) return res.status(404).json({ message: 'Admin not found' });

    const tenantId = admin._id;

    // Collect all tenant users (excluding the admin themselves)
    const tenantUsers = await User.find({ tenantId, _id: { $ne: tenantId } }).select('_id').lean();
    const tenantUserIds = tenantUsers.map(u => u._id);

    if (tenantUserIds.length > 0) {
      await Promise.all([
        Balance.deleteMany({ user: { $in: tenantUserIds } }),
        Rate.deleteMany({ user: { $in: tenantUserIds } }),
        User.deleteMany({ _id: { $in: tenantUserIds } }),
      ]);
    }

    await Promise.all([
      Balance.deleteOne({ user: tenantId }),
      Rate.deleteMany({ user: tenantId }),
      Label.deleteMany({ tenantId }),
      PlatformApiKey.deleteMany({ tenantId }),
      Vendor.deleteMany({ tenantId }),
      ShippersHubAccount.deleteMany({ tenantId }),
      User.deleteOne({ _id: tenantId }),
    ]);

    res.json({ message: 'Admin and all tenant data deleted' });
  } catch (err) {
    console.error('Delete admin error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ── Migration helper ──────────────────────────────────────────────
async function runMigration() {
  const defaultAdmin = await User.findOne({ email: 'admin@uspslabelportal.com' });
  if (!defaultAdmin) return { skipped: true, reason: 'admin@uspslabelportal.com not found' };

  const tenantId = defaultAdmin._id;

  // Set admin's own tenantId = their _id
  await User.updateOne({ _id: tenantId }, { $set: { tenantId } });

  // Set tenantId on all other non-superadmin users that have no tenant yet
  const usersResult = await User.updateMany(
    { _id: { $ne: tenantId }, role: { $ne: 'superadmin' }, tenantId: null },
    { $set: { tenantId } }
  );

  // Set tenantId on all labels that have no tenant yet
  const labelsResult = await Label.updateMany(
    { tenantId: null },
    { $set: { tenantId } }
  );

  // Set tenantId on existing platform API keys that have no tenant yet
  const keysResult = await PlatformApiKey.updateMany(
    { tenantId: { $exists: false } },
    { $set: { tenantId } }
  );

  const vendorsResult  = await Vendor.updateMany({ tenantId: null }, { $set: { tenantId } });
  const accountsResult = await ShippersHubAccount.updateMany({ tenantId: null }, { $set: { tenantId } });

  return {
    defaultTenant: tenantId,
    usersUpdated: usersResult.modifiedCount,
    labelsUpdated: labelsResult.modifiedCount,
    keysUpdated: keysResult.modifiedCount,
    vendorsUpdated: vendorsResult.modifiedCount,
    accountsUpdated: accountsResult.modifiedCount,
  };
}

module.exports = router;
