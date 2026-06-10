const express = require('express');
const LeaderboardEntry = require('../models/LeaderboardEntry');
const Vendor           = require('../models/Vendor');
const { authenticateToken, authorize } = require('../middleware/auth');

const router = express.Router();

// ── GET /api/leaderboard ──────────────────────────────────────
// All authenticated users: returns visible entries ranked by successRate
router.get('/', authenticateToken, async (req, res) => {
  try {
    const entries = await LeaderboardEntry.find({ isVisible: true })
      .sort({ successRate: -1, totalLabels: -1 })
      .lean();
    res.json({ entries });
  } catch (err) {
    console.error('Leaderboard fetch error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ── GET /api/leaderboard/all ──────────────────────────────────
// Admin: all entries including hidden
router.get('/all', authenticateToken, authorize('admin'), async (req, res) => {
  try {
    const entries = await LeaderboardEntry.find()
      .sort({ successRate: -1, totalLabels: -1 })
      .lean();
    res.json({ entries });
  } catch (err) {
    console.error('Leaderboard all fetch error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ── GET /api/leaderboard/vendors ─────────────────────────────
// Admin: returns all active vendors grouped by portal for the add-entry dropdown
router.get('/vendors', authenticateToken, authorize('admin'), async (req, res) => {
  try {
    const vendors = await Vendor.find({ isActive: true })
      .select('name carrier shippingService source')
      .sort({ source: 1, name: 1 })
      .lean();
    res.json({ vendors });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// ── POST /api/leaderboard ─────────────────────────────────────
// Admin: create entry
router.post('/', authenticateToken, authorize('admin'), async (req, res) => {
  try {
    const { vendorName, portal, carrier, shippingService, successRate, totalLabels, isVisible, vendorId } = req.body;
    if (!vendorName || !portal || successRate == null) {
      return res.status(400).json({ message: 'vendorName, portal, and successRate are required' });
    }
    const entry = await LeaderboardEntry.create({
      vendorName,
      portal,
      carrier:         carrier        || 'USPS',
      shippingService: shippingService || '',
      successRate:     Number(successRate),
      totalLabels:     Number(totalLabels) || 0,
      isVisible:       isVisible !== false,
      vendor:          vendorId || null,
    });
    res.status(201).json({ entry });
  } catch (err) {
    console.error('Leaderboard create error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ── PUT /api/leaderboard/:id ──────────────────────────────────
// Admin: update entry
router.put('/:id', authenticateToken, authorize('admin'), async (req, res) => {
  try {
    const entry = await LeaderboardEntry.findByIdAndUpdate(
      req.params.id,
      { $set: req.body },
      { new: true, runValidators: true }
    );
    if (!entry) return res.status(404).json({ message: 'Entry not found' });
    res.json({ entry });
  } catch (err) {
    console.error('Leaderboard update error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ── DELETE /api/leaderboard/:id ───────────────────────────────
// Admin: delete entry
router.delete('/:id', authenticateToken, authorize('admin'), async (req, res) => {
  try {
    const entry = await LeaderboardEntry.findByIdAndDelete(req.params.id);
    if (!entry) return res.status(404).json({ message: 'Entry not found' });
    res.json({ message: 'Deleted' });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
