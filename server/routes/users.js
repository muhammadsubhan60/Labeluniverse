const express = require('express');
const jwt     = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const User        = require('../models/User');
const Balance     = require('../models/Balance');
const Rate        = require('../models/Rate');
const Label       = require('../models/Label');
const ManifestJob = require('../models/ManifestJob');
const PaymentLog  = require('../models/PaymentLog');
const VendorCost  = require('../models/VendorCost');
const { authenticateToken, authorize } = require('../middleware/auth');
const { sendMail, inviteEmailHtml } = require('../services/email');

const router = express.Router();

const CLIENT_URL = process.env.CLIENT_URL || 'https://labelflow.org';

function signInviteToken(userId) {
  return jwt.sign({ id: userId, purpose: 'password-setup' }, process.env.JWT_SECRET, { expiresIn: '3d' });
}

/**
 * All-time labels/revenue/profit per user, for the given user ids.
 * Mirrors the Finance Dashboard's own cost methodology (server/routes/financialDashboard.js):
 * revenue = money actually collected (PaymentLog), cost = label count × the VendorCost set for
 * that carrier in the month/year the label was generated (first match wins if more than one
 * vendor cost exists for a carrier in the same month — same simplification the dashboard uses).
 */
async function computeUserFinancials(userIds) {
  const financials = new Map();
  if (!userIds.length) return financials;

  const [labelAgg, mfAgg, payAgg, vendorCosts, balances] = await Promise.all([
    Label.aggregate([
      { $match: { user: { $in: userIds }, status: 'generated' } },
      { $group: {
          _id: { user: '$user', carrier: '$carrier', year: { $year: '$createdAt' }, month: { $month: '$createdAt' } },
          count: { $sum: 1 },
      } },
    ]),
    ManifestJob.aggregate([
      { $match: { user: { $in: userIds }, status: 'completed' } },
      { $group: {
          _id: { user: '$user', carrier: '$carrier', year: { $year: '$createdAt' }, month: { $month: '$createdAt' } },
          count: { $sum: '$userBilling.labelCount' },
      } },
    ]),
    PaymentLog.aggregate([
      { $match: { user: { $in: userIds } } },
      { $group: { _id: '$user', total: { $sum: '$amount' } } },
    ]),
    VendorCost.find({}).select('carrier month year costPerLabelUSD').lean(),
    Balance.find({ user: { $in: userIds } }).select('user currentBalance').lean(),
  ]);

  const balanceMap = {};
  for (const b of balances) balanceMap[b.user.toString()] = b.currentBalance;

  const costMap = {};
  for (const vc of vendorCosts) {
    const key = `${vc.carrier}_${vc.month}_${vc.year}`;
    if (!(key in costMap)) costMap[key] = vc.costPerLabelUSD;
  }

  const totals = new Map();
  const ensure = (id) => {
    const key = id.toString();
    if (!totals.has(key)) totals.set(key, { totalLabels: 0, totalCost: 0, totalRevenue: 0 });
    return totals.get(key);
  };

  for (const row of [...labelAgg, ...mfAgg]) {
    const { user, carrier, year, month } = row._id;
    const entry = ensure(user);
    entry.totalLabels += row.count;
    entry.totalCost += row.count * (costMap[`${carrier}_${month}_${year}`] || 0);
  }

  for (const row of payAgg) {
    ensure(row._id).totalRevenue = row.total;
  }

  // Every requested user gets an entry, even with zero labels/payments, so currentBalance
  // (which most users have regardless of activity) isn't silently dropped.
  for (const id of userIds) ensure(id);

  for (const [id, entry] of totals) {
    financials.set(id, {
      totalLabels:    Math.round(entry.totalLabels),
      totalRevenue:   Math.round(entry.totalRevenue * 100) / 100,
      profit:         Math.round((entry.totalRevenue - entry.totalCost) * 100) / 100,
      currentBalance: balanceMap[id] ?? 0,
    });
  }
  return financials;
}

// ── Helpers ───────────────────────────────────────────────────

/** Escape special regex characters to prevent ReDoS attacks */
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Maximum length for search strings */
const SEARCH_MAX_LEN = 100;

/** Maximum results per page */
const PAGE_LIMIT_MAX = 100;

// ── GET /api/users ────────────────────────────────────────────
router.get('/', authenticateToken, authorize('admin'), async (req, res) => {
  try {
    const { role, isActive, page = 1, search } = req.query;
    const limit = Math.min(parseInt(req.query.limit) || 10, PAGE_LIMIT_MAX);

    // Scope to admin's tenant — admins only see their own users
    const tenantId = req.user.tenantId || req.user._id;
    const filter = { tenantId };
    if (role) filter.role = role;
    if (isActive !== undefined) filter.isActive = isActive === 'true';
    if (search && search.length <= SEARCH_MAX_LEN) {
      const safe = escapeRegex(search);
      filter.$or = [
        { firstName: { $regex: safe, $options: 'i' } },
        { lastName:  { $regex: safe, $options: 'i' } },
        { email:     { $regex: safe, $options: 'i' } }
      ];
    }

    const total = await User.countDocuments(filter);
    const users = await User.find(filter)
      .skip((page - 1) * limit)
      .limit(limit)
      .select('+password');

    const financials = await computeUserFinancials(users.map(u => u._id));
    const usersJson = users.map(u => {
      const json = u.toJSON();
      const f = financials.get(json.id) || { totalLabels: 0, totalRevenue: 0, profit: 0, currentBalance: 0 };
      return { ...json, ...f };
    });

    res.json({
      users: usersJson,
      totalPages: Math.ceil(total / limit),
      currentPage: parseInt(page),
      total
    });
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ message: 'Server error getting users' });
  }
});

// ── GET /api/users/reseller/clients ───────────────────────────
router.get('/reseller/clients', authenticateToken, authorize('admin', 'reseller'), async (req, res) => {
  try {
    if (req.user.role === 'admin') {
      // Admins see only their tenant's users
      const tenantId = req.user.tenantId || req.user._id;
      const clients = await User.find({ tenantId, role: 'user' }).select('+password').sort({ createdAt: -1 });
      return res.json({ clients });
    }
    // Resellers see only their linked clients
    const user = await User.findById(req.user._id).populate('clients', '+password');
    res.json({ clients: user.clients || [] });
  } catch (error) {
    console.error('Get reseller clients error:', error);
    res.status(500).json({ message: 'Server error getting clients' });
  }
});

// ── POST /api/users/reseller/clients ──────────────────────────
router.post('/reseller/clients', authenticateToken, authorize('admin', 'reseller'), [
  body('firstName').trim().notEmpty().withMessage('First name is required'),
  body('lastName').trim().notEmpty().withMessage('Last name is required'),
  body('email').isEmail().normalizeEmail().withMessage('Please provide a valid email'),
  body('password').isLength({ min: 5 }).withMessage('Password must be at least 5 characters'),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ message: 'Validation failed', errors: errors.array() });
    }

    const { firstName, lastName, email, password, phone } = req.body;

    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(400).json({ message: 'User already exists with this email' });
    }

    const tenantId = req.user.tenantId || req.user._id;
    const client = await User.create({ firstName, lastName, email, password, role: 'user', tenantId, phone: phone || null });

    await Balance.create({ user: client._id, currentBalance: 0, transactions: [] });
    await Rate.create({ user: client._id, labelRate: 1.00, setBy: req.user._id, notes: 'Default rate set by reseller' });

    await User.findByIdAndUpdate(req.user._id, { $push: { clients: client._id } });

    res.status(201).json({ message: 'Client created successfully', user: client });
  } catch (error) {
    console.error('Create reseller client error:', error);
    res.status(500).json({ message: 'Server error creating client' });
  }
});

// ── POST /api/users/reseller/invite ───────────────────────────
// Invite a client by email (admin or reseller) — no password set
// here; the client gets a link to choose their own password.
router.post('/reseller/invite', authenticateToken, authorize('admin', 'reseller'), [
  body('firstName').trim().notEmpty().withMessage('First name is required'),
  body('lastName').trim().notEmpty().withMessage('Last name is required'),
  body('email').isEmail().normalizeEmail().withMessage('Please provide a valid email'),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ message: 'Validation failed', errors: errors.array() });
    }

    const { firstName, lastName, email, phone } = req.body;

    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(400).json({ message: 'User already exists with this email' });
    }

    const tenantId = req.user.tenantId || req.user._id;
    const client = await User.create({ firstName, lastName, email, role: 'user', tenantId, phone: phone || null });

    await Balance.create({ user: client._id, currentBalance: 0, transactions: [] });
    await Rate.create({ user: client._id, labelRate: 1.00, setBy: req.user._id, notes: 'Default rate set by reseller' });

    await User.findByIdAndUpdate(req.user._id, { $push: { clients: client._id } });

    const inviteUrl = `${CLIENT_URL}/set-password?token=${signInviteToken(client._id)}`;
    try {
      await sendMail({
        to:      client.email,
        subject: "You've been invited to Label Flow",
        html:    inviteEmailHtml(client.firstName, inviteUrl),
      });
    } catch (mailErr) {
      console.error('Invite email failed:', mailErr.message);
      return res.status(500).json({ message: 'Client created, but the invite email failed to send. Use "Reset Password" to set one manually.' });
    }

    res.status(201).json({ message: 'Invite sent successfully', user: client });
  } catch (error) {
    console.error('Invite client error:', error);
    res.status(500).json({ message: 'Server error inviting client' });
  }
});

// ── DELETE /api/users/reseller/clients/:clientId ──────────────
router.delete('/reseller/clients/:clientId', authenticateToken, authorize('admin', 'reseller'), async (req, res) => {
  try {
    const { clientId } = req.params;

    const reseller = await User.findById(req.user._id);
    const owns = (reseller.clients || []).map(c => c.toString()).includes(clientId);
    if (!owns) {
      return res.status(403).json({ message: 'Client not found in your account' });
    }

    await User.findByIdAndUpdate(req.user._id, { $pull: { clients: clientId } });
    await User.findByIdAndDelete(clientId);
    await Balance.deleteOne({ user: clientId });
    await Rate.deleteMany({ user: clientId });

    res.json({ message: 'Client deleted successfully' });
  } catch (error) {
    console.error('Delete reseller client error:', error);
    res.status(500).json({ message: 'Server error deleting client' });
  }
});

// ── GET /api/users/:id ────────────────────────────────────────
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const isSelf  = req.user._id.toString() === req.params.id;
    const isAdmin = req.user.role === 'admin';
    let isResellerClient = false;
    if (req.user.role === 'reseller') {
      const me = await User.findById(req.user._id).select('clients');
      isResellerClient = (me?.clients || []).map(String).includes(req.params.id);
    }
    if (!isAdmin && !isSelf && !isResellerClient) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const user = await User.findById(req.params.id).select('+password');
    if (!user) return res.status(404).json({ message: 'User not found' });

    res.json({ user });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ message: 'Server error getting user' });
  }
});

// ── POST /api/users ───────────────────────────────────────────
// Create new user (admin only)
router.post('/', authenticateToken, authorize('admin'), [
  body('firstName').trim().notEmpty().withMessage('First name is required'),
  body('lastName').trim().notEmpty().withMessage('Last name is required'),
  body('email').isEmail().normalizeEmail().withMessage('Please provide a valid email'),
  body('password').isLength({ min: 5 }).withMessage('Password must be at least 5 characters'),
  body('role').isIn(['admin', 'reseller', 'user']).withMessage('Invalid role — admins can create admin, reseller, or user accounts')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ message: 'Validation failed', errors: errors.array() });
    }

    const { firstName, lastName, email, password, role, source } = req.body;

    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(400).json({ message: 'User already exists with this email' });
    }

    // New users inherit the creating admin's tenant
    const tenantId = req.user.tenantId || req.user._id;
    const user = await User.create({ firstName, lastName, email, password, role, source: source || null, tenantId });

    await Balance.create({ user: user._id, currentBalance: 0, transactions: [] });
    await Rate.create({
      user: user._id,
      labelRate: 1.00,
      setBy: req.user._id,
      notes: 'Default rate set by admin'
    });

    res.status(201).json({ message: 'User created successfully', user });
  } catch (error) {
    console.error('Create user error:', error);
    res.status(500).json({ message: 'Server error creating user' });
  }
});

// ── POST /api/users/invite ────────────────────────────────────
// Invite a new user by email (admin only) — no password set here;
// the invitee gets a link to choose their own password.
router.post('/invite', authenticateToken, authorize('admin'), [
  body('firstName').trim().notEmpty().withMessage('First name is required'),
  body('lastName').trim().notEmpty().withMessage('Last name is required'),
  body('email').isEmail().normalizeEmail().withMessage('Please provide a valid email'),
  body('role').isIn(['admin', 'reseller', 'user']).withMessage('Invalid role — admins can invite admin, reseller, or user accounts'),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ message: 'Validation failed', errors: errors.array() });
    }

    const { firstName, lastName, email, role, source } = req.body;

    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(400).json({ message: 'User already exists with this email' });
    }

    const tenantId = req.user.tenantId || req.user._id;
    const user = await User.create({ firstName, lastName, email, role, source: source || null, tenantId });

    await Balance.create({ user: user._id, currentBalance: 0, transactions: [] });
    await Rate.create({
      user: user._id,
      labelRate: 1.00,
      setBy: req.user._id,
      notes: 'Default rate set by admin'
    });

    const inviteUrl = `${CLIENT_URL}/set-password?token=${signInviteToken(user._id)}`;
    try {
      await sendMail({
        to:      user.email,
        subject: "You've been invited to Label Flow",
        html:    inviteEmailHtml(user.firstName, inviteUrl),
      });
    } catch (mailErr) {
      console.error('Invite email failed:', mailErr.message);
      return res.status(500).json({ message: 'User created, but the invite email failed to send. Use "Reset Password" to set one manually.' });
    }

    res.status(201).json({ message: 'Invite sent successfully', user });
  } catch (error) {
    console.error('Invite user error:', error);
    res.status(500).json({ message: 'Server error inviting user' });
  }
});

// ── PUT /api/users/:id ────────────────────────────────────────
router.put('/:id', authenticateToken, [
  body('firstName').optional().trim().notEmpty().withMessage('First name cannot be empty'),
  body('lastName').optional().trim().notEmpty().withMessage('Last name cannot be empty'),
  body('email').optional().isEmail().normalizeEmail().withMessage('Please provide a valid email'),
  body('role').optional().isIn(['admin', 'reseller', 'user']).withMessage('Invalid role'),
  body('isActive').optional().isBoolean().withMessage('isActive must be boolean'),
  body('emailNotifications').optional().isBoolean().withMessage('emailNotifications must be boolean'),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ message: 'Validation failed', errors: errors.array() });
    }

    const isSelf  = req.user._id.toString() === req.params.id;
    const isAdmin = req.user.role === 'admin' || req.user.role === 'superadmin';
    let isResellerClient = false;
    if (req.user.role === 'reseller') {
      const me = await User.findById(req.user._id).select('clients');
      isResellerClient = (me?.clients || []).map(String).includes(req.params.id);
    }
    if (!isAdmin && !isSelf && !isResellerClient) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const updates = {};

    const profileFields = ['firstName', 'lastName', 'email', 'emailNotifications', 'phone'];
    for (const field of profileFields) {
      if (req.body[field] !== undefined) updates[field] = req.body[field];
    }

    if (isAdmin) {
      // Admin can additionally change role, isActive, source, and relationship arrays
      if (req.body.role     !== undefined) updates.role     = req.body.role;
      if (req.body.isActive !== undefined) updates.isActive = req.body.isActive;
      if (req.body.source   !== undefined) updates.source   = req.body.source;
    } else if (!isSelf && isResellerClient) {
      // Resellers can toggle isActive on their own clients only
      if (req.body.isActive !== undefined) updates.isActive = req.body.isActive;
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ message: 'No valid fields to update' });
    }

    // Check email uniqueness if changing email
    if (updates.email) {
      const existing = await User.findOne({ email: updates.email, _id: { $ne: req.params.id } });
      if (existing) return res.status(400).json({ message: 'Email already in use' });
    }

    const user = await User.findByIdAndUpdate(
      req.params.id,
      { $set: updates },
      { new: true, runValidators: true }
    ).select('+password');

    if (!user) return res.status(404).json({ message: 'User not found' });

    res.json({ message: 'User updated successfully', user });
  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({ message: 'Server error updating user' });
  }
});

// ── POST /api/users/:id/reset-password ───────────────────────
router.post('/:id/reset-password', authenticateToken, authorize('admin'), [
  body('password').isLength({ min: 5 }).withMessage('Password must be at least 5 characters'),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ message: errors.array()[0].msg });

    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    user.password = req.body.password;
    await user.save();

    res.json({ message: 'Password reset successfully' });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ message: 'Server error resetting password' });
  }
});

// ── POST /api/users/:id/reinvite ──────────────────────────────
// Resend the invite email with a fresh 3-day link (admin, or the
// reseller who owns this client).
router.post('/:id/reinvite', authenticateToken, async (req, res) => {
  try {
    const isAdmin = req.user.role === 'admin' || req.user.role === 'superadmin';
    let isResellerClient = false;
    if (req.user.role === 'reseller') {
      const me = await User.findById(req.user._id).select('clients');
      isResellerClient = (me?.clients || []).map(String).includes(req.params.id);
    }
    if (!isAdmin && !isResellerClient) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const user = await User.findById(req.params.id).select('+password');
    if (!user) return res.status(404).json({ message: 'User not found' });
    if (user.password) return res.status(400).json({ message: 'This user already has a password set.' });

    const inviteUrl = `${CLIENT_URL}/set-password?token=${signInviteToken(user._id)}`;
    try {
      await sendMail({
        to:      user.email,
        subject: "You've been invited to Label Flow",
        html:    inviteEmailHtml(user.firstName, inviteUrl),
      });
    } catch (mailErr) {
      console.error('Reinvite email failed:', mailErr.message);
      return res.status(500).json({ message: 'Failed to send invite email. Please try again.' });
    }

    res.json({ message: 'Invite resent successfully' });
  } catch (error) {
    console.error('Reinvite error:', error);
    res.status(500).json({ message: 'Server error resending invite' });
  }
});

// ── DELETE /api/users/:id ─────────────────────────────────────
router.delete('/:id', authenticateToken, authorize('admin'), async (req, res) => {
  try {
    if (req.user._id.toString() === req.params.id) {
      return res.status(400).json({ message: 'Cannot delete your own account' });
    }

    const user = await User.findByIdAndDelete(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    await Balance.deleteOne({ user: req.params.id });
    await Rate.deleteMany({ user: req.params.id });

    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ message: 'Server error deleting user' });
  }
});

// ── GET /api/users/:id/clients ────────────────────────────────
router.get('/:id/clients', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin' && req.user._id.toString() !== req.params.id) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const user = await User.findById(req.params.id).populate('clients', '-password');
    if (!user) return res.status(404).json({ message: 'User not found' });

    res.json({ clients: user.clients });
  } catch (error) {
    console.error('Get clients error:', error);
    res.status(500).json({ message: 'Server error getting clients' });
  }
});

// ── PATCH /api/users/:id/cc-access ───────────────────────────
router.patch('/:id/cc-access', authenticateToken, authorize('admin'), async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    if (user.role !== 'reseller') return res.status(400).json({ message: 'CC access can only be granted to resellers' });
    user.ccAccess = !user.ccAccess;
    await user.save();
    res.json({ ccAccess: user.ccAccess });
  } catch (err) {
    console.error('CC access toggle error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
