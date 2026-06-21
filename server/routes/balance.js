const express = require('express');
const { body, validationResult } = require('express-validator');
const Balance = require('../models/Balance');
const User    = require('../models/User');
const { authenticateToken, authorize } = require('../middleware/auth');

const router = express.Router();

/** Maximum items per page for paginated endpoints */
const PAGE_LIMIT_MAX = 100;

// ── Helper: format currency string ───────────────────────────
const fmt = (n) => `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;

// ── GET /api/balance ──────────────────────────────────────────
router.get('/', authenticateToken, async (req, res) => {
  try {
    const balance = await Balance.getOrCreateBalance(req.user._id);
    const txns = balance.transactions || [];

    const totalDeposited = txns
      .filter(t => t.type === 'topup')
      .reduce((sum, t) => sum + t.amount, 0);

    const totalSpent = txns
      .filter(t => t.type === 'deduction')
      .reduce((sum, t) => sum + Math.abs(t.amount), 0);

    const totalDistributed = txns
      .filter(t => t.type === 'adjustment' && t.amount < 0)
      .reduce((sum, t) => sum + Math.abs(t.amount), 0);

    const recentTransactions = txns
      .slice()
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, 50);

    res.json({
      balance: {
        currentBalance:    balance.currentBalance,
        totalDeposited,
        totalSpent,
        totalDistributed,
        recentTransactions,
        totalTransactions: txns.length
      }
    });
  } catch (error) {
    console.error('Get balance error:', error);
    res.status(500).json({ message: 'Server error getting balance' });
  }
});

// ── GET /api/balance/transactions ─────────────────────────────
// IMPORTANT: must be declared BEFORE /:userId so Express matches it first.
router.get('/transactions', authenticateToken, async (req, res) => {
  try {
    const page  = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(parseInt(req.query.limit) || 10, PAGE_LIMIT_MAX);

    const balance = await Balance.getOrCreateBalance(req.user._id);

    const sorted = [...balance.transactions].sort(
      (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
    );
    const start     = (page - 1) * limit;
    const paginated = sorted.slice(start, start + limit);

    res.json({
      transactions: paginated,
      totalPages:  Math.ceil(sorted.length / limit),
      currentPage: page,
      total:       sorted.length
    });
  } catch (error) {
    console.error('Get transactions error:', error);
    res.status(500).json({ message: 'Server error getting transactions' });
  }
});

// ── GET /api/balance/:userId ──────────────────────────────────
// IMPORTANT: declared AFTER /transactions so fixed paths match first.
router.get('/:userId', authenticateToken, async (req, res) => {
  try {
    const { userId } = req.params;

    // Reject non-ObjectId values (prevents Mongoose 9 stripping undefined → full-collection query)
    const mongoose = require('mongoose');
    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ message: 'Invalid user ID' });
    }

    if (req.user.role !== 'admin' && req.user._id.toString() !== userId) {
      const target = await User.findById(userId);
      if (!target) return res.status(404).json({ message: 'User not found' });
      const isMyClient = (req.user.clients || []).map(String).includes(userId);
      if (!isMyClient) return res.status(403).json({ message: 'Access denied' });
    }

    const balance = await Balance.getOrCreateBalance(userId);
    const allSorted = balance.transactions
      .slice()
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    const recentTransactions = allSorted.slice(0, 50);

    res.json({ currentBalance: balance.currentBalance, recentTransactions, totalTransactions: allSorted.length });
  } catch (error) {
    console.error('Get balance by userId error:', error);
    res.status(500).json({ message: 'Server error getting balance' });
  }
});

// ── Helper: check if caller can manage this userId ───────────
async function canManageBalance(caller, userId) {
  // Nobody can manage their own balance — super admin handles that via /api/superadmin/
  if (String(caller._id) === String(userId)) return false;

  if (caller.role === 'admin') {
    // Admin can only manage users within their own tenant
    const target = await User.findById(userId).select('tenantId');
    if (!target) return false;
    const callerTenantId = String(caller.tenantId || caller._id);
    return String(target.tenantId) === callerTenantId;
  }
  if (caller.role === 'reseller') {
    const me = await User.findById(caller._id).select('clients');
    return (me?.clients || []).map(String).includes(String(userId));
  }
  return false;
}

// ── POST /api/balance/topup ───────────────────────────────────
router.post('/topup', authenticateToken, authorize('admin', 'reseller'), [
  body('userId').notEmpty().withMessage('User ID is required'),
  body('amount').isFloat({ gt: 0 }).withMessage('Amount must be a positive number'),
  body('description').optional().isString()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ message: 'Validation failed', errors: errors.array() });
    }

    const { userId, amount, description } = req.body;

    if (!await canManageBalance(req.user, userId))
      return res.status(403).json({ message: 'Access denied' });

    const targetUser = await User.findById(userId);
    if (!targetUser) return res.status(404).json({ message: 'User not found' });

    const balance = await Balance.getOrCreateBalance(userId);
    await balance.addTransaction({
      type:        'topup',
      amount:      parseFloat(amount),
      description: description || `Top-up of ${fmt(amount)} by ${req.user.firstName}`,
      performedBy: req.user._id
    });

    res.json({
      message: `Balance topped up by ${fmt(amount)} successfully`,
      balance: { currentBalance: balance.currentBalance }
    });
  } catch (error) {
    console.error('Topup balance error:', error);
    res.status(500).json({ message: 'Server error updating balance' });
  }
});

// ── POST /api/balance/deduct ──────────────────────────────────
router.post('/deduct', authenticateToken, authorize('admin', 'reseller'), [
  body('userId').notEmpty().withMessage('User ID is required'),
  body('amount').isFloat({ gt: 0 }).withMessage('Amount must be a positive number'),
  body('description').optional().isString()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ message: 'Validation failed', errors: errors.array() });
    }

    const { userId, amount, description } = req.body;

    if (!await canManageBalance(req.user, userId))
      return res.status(403).json({ message: 'Access denied' });

    const targetUser = await User.findById(userId);
    if (!targetUser) return res.status(404).json({ message: 'User not found' });

    const balance = await Balance.getOrCreateBalance(userId);

    if (balance.currentBalance < parseFloat(amount)) {
      return res.status(400).json({ message: 'Insufficient balance for this deduction' });
    }

    await balance.addTransaction({
      type:        'deduction',
      amount:      parseFloat(amount),
      description: description || `Deduction of ${fmt(amount)} by ${req.user.firstName}`,
      performedBy: req.user._id
    });

    res.json({
      message: `Balance deducted by ${fmt(amount)} successfully`,
      balance: { currentBalance: balance.currentBalance }
    });
  } catch (error) {
    console.error('Deduct balance error:', error);
    res.status(500).json({ message: 'Server error deducting balance' });
  }
});

// ── POST /api/balance/adjust ──────────────────────────────────
router.post('/adjust', authenticateToken, authorize('admin', 'reseller'), [
  body('userId').notEmpty().withMessage('User ID is required'),
  body('amount').isFloat().withMessage('Amount must be a number (positive or negative)'),
  body('description').optional().isString()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ message: 'Validation failed', errors: errors.array() });
    }

    const { userId, amount, description } = req.body;

    if (!await canManageBalance(req.user, userId))
      return res.status(403).json({ message: 'Access denied' });

    const targetUser = await User.findById(userId);
    if (!targetUser) return res.status(404).json({ message: 'User not found' });

    const balance = await Balance.getOrCreateBalance(userId);

    await balance.addTransaction({
      type:        'adjustment',
      amount:      parseFloat(amount),
      description: description || `Balance adjustment of ${fmt(amount)} by ${req.user.firstName}`,
      performedBy: req.user._id
    });

    res.json({
      message: `Balance adjusted by ${fmt(amount)} successfully`,
      balance: { currentBalance: balance.currentBalance }
    });
  } catch (error) {
    console.error('Adjust balance error:', error);
    res.status(500).json({ message: 'Server error adjusting balance' });
  }
});

module.exports = router;
