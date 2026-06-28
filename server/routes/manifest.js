const express = require('express');
const path    = require('path');
const fs      = require('fs');
const multer  = require('multer');
const { authenticateToken } = require('../middleware/auth');
const ManifestJob            = require('../models/ManifestJob');
const UserCarrierAssignment  = require('../models/UserCarrierAssignment');
const UserVendorAccess       = require('../models/UserVendorAccess');
const ManifestVendor         = require('../models/ManifestVendor');
const Balance                = require('../models/Balance');

const router = express.Router();

// ── File storage ──────────────────────────────────────────────────────────
const requestDir = path.join(__dirname, '../uploads/manifests/requests');
fs.mkdirSync(requestDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, requestDir),
  filename:    (req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `req-${unique}.csv`);
  },
});
const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext === '.csv' || file.mimetype === 'text/csv') cb(null, true);
    else cb(new Error('Only CSV files are allowed'));
  },
  limits: { fileSize: 10 * 1024 * 1024 },
});

// ── CSV helpers ───────────────────────────────────────────────────────────
function parseCSVRows(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines   = content.split('\n').map(l => l.trim()).filter(Boolean);
  if (lines.length <= 1) return [];

  const headers = lines[0].split(',').map(h => h.replace(/"/g, '').trim().toLowerCase());
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',').map(c => c.replace(/"/g, '').trim());
    const row  = {};
    headers.forEach((h, idx) => { row[h] = cols[idx] || ''; });
    if (Object.values(row).some(v => v)) rows.push(row);
  }
  return rows;
}

async function calculateCost(rows, userId, vendorId, carrier) {
  const [access, vendor] = await Promise.all([
    UserVendorAccess.findOne({ user: userId, vendor: vendorId, carrier }),
    ManifestVendor.findById(vendorId),
  ]);

  if (!vendor) throw new Error('Vendor not found');

  // Weight range validation — enforce when user has rate tiers configured
  if (access && access.rateTiers && access.rateTiers.length > 0) {
    const outOfRange = rows
      .map((r, i) => ({ row: i + 1, weight: parseFloat(r.weight) || 0 }))
      .filter(({ weight }) => access.getRateForWeight(weight) === null);
    if (outOfRange.length > 0) {
      const ranges = access.rateTiers
        .map(t => t.maxLbs === null ? `${t.minLbs}+ lbs` : `${t.minLbs}–${t.maxLbs} lbs`)
        .join(', ');
      const err = new Error(`${outOfRange.length} row(s) have weight outside the allowed range (${ranges}).`);
      err.status = 400;
      err.invalidRows = outOfRange;
      throw err;
    }
  }

  const buckets = {}; // key = rate value
  let total = 0;

  for (const row of rows) {
    const weight = parseFloat(row.weight) || 0;
    let rate = vendor.vendorRate || 0;

    if (access && access.rateTiers && access.rateTiers.length > 0) {
      const tier = access.rateTiers.find(t =>
        weight >= t.minLbs && (t.maxLbs === null || weight <= t.maxLbs)
      );
      if (tier) rate = tier.rate;
    }

    total += rate;
    const k = rate.toFixed(4);
    if (!buckets[k]) buckets[k] = { rate, count: 0, subtotal: 0 };
    buckets[k].count++;
    buckets[k].subtotal = Math.round((buckets[k].subtotal + rate) * 100) / 100;
  }

  return {
    totalAmount: Math.round(total * 100) / 100,
    labelCount:  rows.length,
    breakdown:   Object.values(buckets),
  };
}

// ── POST /api/manifest  — submit a manifested label request ──────────────
router.post('/', authenticateToken, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'CSV file is required' });
    }

    const { carrier } = req.body;
    if (!['USPS', 'UPS', 'FedEx', 'DHL'].includes(carrier)) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ message: 'Invalid carrier' });
    }

    // Parse CSV
    const rows = parseCSVRows(req.file.path);
    if (rows.length === 0) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ message: 'CSV file has no data rows' });
    }

    // Auto-assign vendor from pre-config
    const assignment = await UserCarrierAssignment.findOne({
      user: req.user._id, carrier, isActive: true,
    }).populate('vendor');

    if (!assignment) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({
        message: `No vendor assigned for ${carrier} labels. Please contact admin.`,
      });
    }

    const vendor = assignment.vendor;
    if (!vendor || !vendor.isActive) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ message: 'Assigned vendor is not active' });
    }

    // Calculate cost
    const cost = await calculateCost(rows, req.user._id, vendor._id, carrier);

    // Check balance
    const balance = await Balance.getOrCreateBalance(req.user._id);
    if (balance.currentBalance < cost.totalAmount) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({
        message: `Insufficient balance. Required: $${cost.totalAmount.toFixed(2)}, Available: $${balance.currentBalance.toFixed(2)}`,
      });
    }

    // Deduct balance immediately
    await balance.addTransaction({
      type:        'deduction',
      amount:      cost.totalAmount,
      description: `Manifested label request — ${carrier} (${cost.labelCount} labels)`,
      performedBy: req.user._id,
    });

    // Create job
    const job = await ManifestJob.create({
      user:    req.user._id,
      carrier,
      assignedVendor: vendor._id,
      status:  'assigned',
      requestFile: {
        originalName: req.file.originalname,
        storedName:   req.file.filename,
        path:         req.file.path,
        labelCount:   rows.length,
      },
      userBilling: {
        labelCount:  cost.labelCount,
        totalAmount: cost.totalAmount,
        deducted:    true,
        deductedAt:  new Date(),
        breakdown:   cost.breakdown,
      },
      vendorEarning: {
        ratePerLabel: vendor.vendorRate,
        labelCount:   rows.length,
        totalAmount:  Math.round(vendor.vendorRate * rows.length * 100) / 100,
      },
      assignedAt: new Date(),
      timeline: [{
        status:      'assigned',
        note:        `Job submitted by user. Auto-assigned to vendor ${vendor.name}. $${cost.totalAmount.toFixed(2)} deducted.`,
        performedBy: req.user._id,
      }],
    });

    // Email vendor
    try {
      const { sendEmail, vendorJobAssigned } = require('../services/emailService');
      const notifyEmail = vendor.notifyEmail || vendor.email;
      if (notifyEmail) {
        const portalUrl = `${process.env.CLIENT_URL || 'http://localhost:3000'}/vendor-portal/jobs/${job._id}`;
        const tpl = vendorJobAssigned(job._id.toString(), carrier, rows.length, portalUrl);
        await sendEmail({ to: notifyEmail, ...tpl });
      }
    } catch (_) { /* email failure should not block response */ }

    // Socket notification — user side
    if (req.io) {
      req.io.to(req.user._id.toString()).emit('manifest-submitted', {
        jobId: job._id, carrier, labelCount: rows.length, cost: cost.totalAmount,
      });
    }
    // Socket notification — vendor side (BatchOps portal)
    if (req.vendorNS) {
      req.vendorNS.to(`vendor:${vendor._id.toString()}`).emit('new-job', {
        jobId: job._id, carrier, labelCount: rows.length,
      });
    }

    res.status(201).json({
      message: 'Manifest request submitted and assigned to vendor',
      job: {
        _id:        job._id,
        carrier:    job.carrier,
        status:     job.status,
        labelCount: rows.length,
        totalCost:  cost.totalAmount,
        createdAt:  job.createdAt,
      },
    });
  } catch (err) {
    if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    if (err.status !== 400) console.error('Manifest submit error:', err);
    res.status(err.status || 500).json({
      message: err.message || 'Server error submitting manifest',
      ...(err.invalidRows ? { invalidRows: err.invalidRows } : {}),
    });
  }
});

// ── GET /api/manifest  — user's job history ──────────────────────────────
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { status, carrier, page = 1, limit = 20 } = req.query;
    const filter = { user: req.user._id };
    if (status)  filter.status  = status;
    if (carrier) filter.carrier = carrier;

    const skip  = (parseInt(page) - 1) * parseInt(limit);
    const total = await ManifestJob.countDocuments(filter);
    const jobs  = await ManifestJob.find(filter)
      .populate('assignedVendor', 'name carriers')
      .populate('vendor', 'name carrier')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .select('-requestFile.path -resultFile.path -timeline');

    // Auto-transition uploaded → under_review after cooling period
    const now = new Date();
    const enriched = jobs.map(j => {
      const obj = j.toObject();
      if (obj.status === 'uploaded' && obj.resultFile?.coolingDeadline && now > new Date(obj.resultFile.coolingDeadline)) {
        obj.status = 'under_review';
      }
      return obj;
    });

    res.json({ jobs: enriched, total, page: parseInt(page), pages: Math.ceil(total / parseInt(limit)) });
  } catch (err) {
    console.error('Manifest list error:', err);
    res.status(500).json({ message: 'Server error fetching manifest jobs' });
  }
});

// ── GET /api/manifest/:id ────────────────────────────────────────────────
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const job = await ManifestJob.findOne({ _id: req.params.id, user: req.user._id })
      .populate('assignedVendor', 'name carriers vendorRate')
      .populate('vendor', 'name carrier');

    if (!job) return res.status(404).json({ message: 'Job not found' });

    const obj = job.toObject();
    const now = new Date();
    if (obj.status === 'uploaded' && obj.resultFile?.coolingDeadline && now > new Date(obj.resultFile.coolingDeadline)) {
      obj.status = 'under_review';
    }

    res.json({ job: obj });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// ── PATCH /api/manifest/:id/cancel  — user cancels their own job ─────────
// Allowed only while status is open, pending, or assigned (vendor hasn't uploaded yet).
// Balance is refunded in full.
router.patch('/:id/cancel', authenticateToken, async (req, res) => {
  try {
    const job = await ManifestJob.findOne({ _id: req.params.id, user: req.user._id });
    if (!job) return res.status(404).json({ message: 'Job not found' });

    const cancellable = ['open', 'pending', 'assigned'];
    if (!cancellable.includes(job.status)) {
      return res.status(400).json({
        message: `Cannot cancel a job with status "${job.status}". Cancellation is only allowed before the vendor uploads results.`,
      });
    }

    // Refund balance if payment was deducted
    if (job.userBilling?.deducted && job.userBilling?.totalAmount > 0) {
      const balance = await Balance.getOrCreateBalance(req.user._id);
      await balance.addTransaction({
        type:        'topup',
        amount:      job.userBilling.totalAmount,
        description: `Refund — cancelled manifest job (${job.carrier}, ${job.userBilling.labelCount} labels)`,
        performedBy: req.user._id,
      });
    }

    job.status           = 'cancelled';
    job.cancelledAt      = new Date();
    job.cancelledBy      = 'user';
    job.cancellationReason = req.body.reason || 'Cancelled by user';
    job.timeline.push({
      status:      'cancelled',
      note:        `Cancelled by user. $${(job.userBilling?.totalAmount ?? 0).toFixed(2)} refunded.`,
      performedBy: req.user._id,
    });
    await job.save();

    res.json({ message: 'Job cancelled and balance refunded', job: { _id: job._id, status: job.status } });
  } catch (err) {
    console.error('Cancel manifest job error:', err);
    res.status(500).json({ message: 'Server error cancelling job' });
  }
});

// ── GET /api/manifest/:id/download  — download completed result file ─────
router.get('/:id/download', authenticateToken, async (req, res) => {
  try {
    const job = await ManifestJob.findOne({ _id: req.params.id, user: req.user._id });
    if (!job) return res.status(404).json({ message: 'Job not found' });
    if (job.status !== 'completed') {
      return res.status(400).json({ message: 'Labels not ready yet' });
    }
    if (!job.resultFile?.path || !fs.existsSync(job.resultFile.path)) {
      return res.status(404).json({ message: 'Result file not found' });
    }

    res.download(job.resultFile.path, job.resultFile.originalName);
  } catch (err) {
    res.status(500).json({ message: 'Server error downloading file' });
  }
});

module.exports = router;
