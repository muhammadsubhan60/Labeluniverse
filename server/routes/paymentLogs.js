const express    = require('express');
const multer     = require('multer');
const path       = require('path');
const fs         = require('fs');
const mongoose   = require('mongoose'); // already imported — used for ObjectId validation
const PaymentLog = require('../models/PaymentLog');
const User       = require('../models/User');
const { authenticateToken, authorize } = require('../middleware/auth');

const router = express.Router();

// ── Screenshot upload setup ───────────────────────────────────
const screenshotsDir = path.join(__dirname, '../uploads/payment-screenshots');
if (!fs.existsSync(screenshotsDir)) fs.mkdirSync(screenshotsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, screenshotsDir),
  filename:    (req, file, cb) => {
    const ext  = path.extname(file.originalname).toLowerCase();
    const name = `pmt-${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`;
    cb(null, name);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB per file
  fileFilter: (req, file, cb) => {
    const allowed = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.pdf'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) cb(null, true);
    else cb(new Error('Only images and PDFs are allowed'));
  },
});

// ── Helper: verify caller can manage this user ────────────────
async function canManage(caller, targetUserId) {
  if (caller.role === 'admin') return true;
  if (caller.role === 'reseller') {
    const me = await User.findById(caller._id).select('clients');
    return (me?.clients || []).map(String).includes(String(targetUserId));
  }
  return false;
}

// ── GET /api/payment-logs/screenshot/:filename ────────────────
// Serve screenshot files — no auth required (filenames are random UUIDs)
// IMPORTANT: must be defined BEFORE /:userId to avoid route shadowing
router.get('/screenshot/:filename', (req, res) => {
  // Sanitise: strip any path traversal
  const filename = path.basename(req.params.filename);
  const filePath = path.join(screenshotsDir, filename);
  if (!fs.existsSync(filePath)) return res.status(404).json({ message: 'File not found' });
  res.sendFile(filePath);
});

// ── GET /api/payment-logs/me ───────────────────────────────────
// Self-service endpoint for normal users to read their own payment logs
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const userId = req.user._id;

    const logs = await PaymentLog.find({ user: new mongoose.Types.ObjectId(userId) })
      .populate('loggedBy', 'firstName lastName')
      .populate('wallet', 'name')
      .sort({ date: -1 });

    const totalPaid = logs.reduce((sum, l) => sum + l.amount, 0);
    res.json({ logs, totalPaid });
  } catch (err) {
    console.error('Get self payment logs error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ── GET /api/payment-logs/:userId ─────────────────────────────
// Returns all payment logs + total paid for a user
router.get('/:userId', authenticateToken, authorize('admin', 'reseller'), async (req, res) => {
  try {
    const { userId } = req.params;

    // Guard: userId must be a 24-char hex ObjectId. Reject anything else to prevent
    // Mongoose 9 stripping undefined and returning the entire collection.
    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ message: 'Invalid user ID' });
    }

    if (!await canManage(req.user, userId))
      return res.status(403).json({ message: 'Access denied' });

    const logs = await PaymentLog.find({ user: new mongoose.Types.ObjectId(userId) })
      .populate('loggedBy', 'firstName lastName')
      .populate('wallet', 'name')
      .sort({ date: -1 });

    const totalPaid = logs.reduce((sum, l) => sum + l.amount, 0);

    res.json({ logs, totalPaid });
  } catch (err) {
    console.error('Get payment logs error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ── POST /api/payment-logs ────────────────────────────────────
// Create a new payment log entry (with optional screenshots)
router.post('/', authenticateToken, authorize('admin', 'reseller'),
  upload.array('screenshots', 10),
  async (req, res) => {
    try {
      const { userId, amount, date, note, walletId } = req.body;

      if (!userId || !amount) {
        return res.status(400).json({ message: 'userId and amount are required' });
      }

      if (!await canManage(req.user, userId))
        return res.status(403).json({ message: 'Access denied' });

      const screenshots = (req.files || []).map(f => `/api/payment-logs/screenshot/${f.filename}`);

      const log = await PaymentLog.create({
        user:      userId,
        amount:    parseFloat(amount),
        date:      date ? new Date(date) : new Date(),
        note:      note || '',
        screenshots,
        loggedBy:  req.user._id,
        wallet:    walletId || null,
      });

      await log.populate('loggedBy', 'firstName lastName');
      await log.populate('wallet', 'name');
      res.status(201).json({ log });
    } catch (err) {
      console.error('Create payment log error:', err);
      res.status(500).json({ message: err.message || 'Server error' });
    }
  }
);

// ── PUT /api/payment-logs/:id ─────────────────────────────────
// Update an existing log entry
router.put('/:id', authenticateToken, authorize('admin', 'reseller'),
  upload.array('screenshots', 10),
  async (req, res) => {
    try {
      const log = await PaymentLog.findById(req.params.id);
      if (!log) return res.status(404).json({ message: 'Payment log not found' });

      if (!await canManage(req.user, log.user))
        return res.status(403).json({ message: 'Access denied' });

      const { amount, date, note, removeScreenshots, walletId } = req.body;

      if (amount   !== undefined) log.amount = parseFloat(amount);
      if (date     !== undefined) log.date   = new Date(date);
      if (note     !== undefined) log.note   = note;
      // walletId can be empty string to clear wallet
      if (walletId !== undefined) log.wallet = walletId || null;

      // Remove requested screenshots (array of filenames)
      if (removeScreenshots) {
        const toRemove = Array.isArray(removeScreenshots) ? removeScreenshots : [removeScreenshots];
        toRemove.forEach(url => {
          const filename = url.split('/').pop();
          const filePath = path.join(screenshotsDir, filename);
          if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        });
        log.screenshots = log.screenshots.filter(s => !toRemove.includes(s));
      }

      // Add newly uploaded screenshots
      if (req.files?.length) {
        const newScreenshots = req.files.map(f => `/api/payment-logs/screenshot/${f.filename}`);
        log.screenshots.push(...newScreenshots);
      }

      await log.save();
      await log.populate('loggedBy', 'firstName lastName');
      await log.populate('wallet', 'name');
      res.json({ log });
    } catch (err) {
      console.error('Update payment log error:', err);
      res.status(500).json({ message: err.message || 'Server error' });
    }
  }
);

// ── DELETE /api/payment-logs/:id ──────────────────────────────
router.delete('/:id', authenticateToken, authorize('admin', 'reseller'), async (req, res) => {
  try {
    const log = await PaymentLog.findById(req.params.id);
    if (!log) return res.status(404).json({ message: 'Payment log not found' });

    if (!await canManage(req.user, log.user))
      return res.status(403).json({ message: 'Access denied' });

    // Delete screenshot files
    log.screenshots.forEach(url => {
      const filename = url.split('/').pop();
      const filePath = path.join(screenshotsDir, filename);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    });

    await log.deleteOne();
    res.json({ message: 'Payment log deleted' });
  } catch (err) {
    console.error('Delete payment log error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
