const express = require('express');
const { body, validationResult } = require('express-validator');
const User    = require('../models/User');
const Balance = require('../models/Balance');
const Rate    = require('../models/Rate');
const { authenticateToken, authorize } = require('../middleware/auth');

const router = express.Router();

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
      .select('-password');

    res.json({
      users,
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
      const clients = await User.find({ tenantId, role: 'user' }).select('-password').sort({ createdAt: -1 });
      return res.json({ clients });
    }
    // Resellers see only their linked clients
    const user = await User.findById(req.user._id).populate('clients', '-password');
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

    const user = await User.findById(req.params.id).select('-password');
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
    ).select('-password');

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
