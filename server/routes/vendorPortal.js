const express        = require('express');
const path           = require('path');
const fs             = require('fs');
const multer         = require('multer');
const { authenticateVendor, generateVendorToken } = require('../middleware/vendorAuth');
const ManifestVendor = require('../models/ManifestVendor');
const ManifestJob    = require('../models/ManifestJob');

const router = express.Router();

// ── Result file storage ───────────────────────────────────────────────────
const resultDir = path.join(__dirname, '../uploads/manifests/results');
fs.mkdirSync(resultDir, { recursive: true });

const resultStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, resultDir),
  filename:    (req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const ext    = path.extname(file.originalname).toLowerCase();
    cb(null, `result-${unique}${ext}`);
  },
});

/**
 * Validate the actual content of an uploaded file by reading its magic bytes.
 * Extension spoofing (e.g. malware.exe renamed to malware.pdf) is rejected here.
 */
function validateMagicBytes(filePath, extension) {
  try {
    const buf = Buffer.alloc(8);
    const fd  = fs.openSync(filePath, 'r');
    fs.readSync(fd, buf, 0, 8, 0);
    fs.closeSync(fd);

    if (extension === '.pdf') {
      // PDF magic: %PDF
      return buf.slice(0, 4).toString('ascii') === '%PDF';
    }
    if (extension === '.zip') {
      // ZIP magic: PK (0x50 0x4B)
      return buf[0] === 0x50 && buf[1] === 0x4B;
    }
    if (extension === '.csv') {
      // CSV has no magic bytes — reject files with null bytes (binary content)
      return !buf.includes(0x00);
    }
    return false;
  } catch {
    return false;
  }
}

const uploadResult = multer({
  storage: resultStorage,
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (['.zip', '.pdf', '.csv'].includes(ext)) cb(null, true);
    else cb(new Error('Only ZIP, PDF, or CSV files are allowed'));
  },
  limits: { fileSize: 25 * 1024 * 1024 }, // 25 MB — reduced from 100 MB
});

// ── POST /api/vendor-portal/auth/login ───────────────────────────────────
// Note: authLimiter is applied to /api/vendor-portal/* in server/index.js
router.post('/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }

    const vendor = await ManifestVendor.findOne({ email: email.toLowerCase() }).select('+password');
    if (!vendor) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }
    if (!vendor.isActive) {
      return res.status(401).json({ message: 'Your portal access has been disabled. Contact support.' });
    }
    if (!vendor.password) {
      return res.status(401).json({ message: 'Portal password not set. Contact support.' });
    }

    const isMatch = await vendor.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    vendor.lastLogin = new Date();
    await vendor.save();

    const token = generateVendorToken(vendor._id);

    res.json({
      message: 'Login successful',
      token,
      vendor: {
        _id:      vendor._id,
        name:     vendor.name,
        carriers: vendor.carriers,
      },
    });
  } catch (err) {
    console.error('Vendor login error:', err);
    res.status(500).json({ message: 'Server error during login' });
  }
});

// ── All routes below require vendor auth ─────────────────────────────────
router.use(authenticateVendor);

// ── GET /api/vendor-portal/me ─────────────────────────────────────────────
router.get('/me', async (req, res) => {
  const v = req.vendor;
  res.json({
    vendor: {
      _id:            v._id,
      name:           v.name,
      carriers:       v.carriers,
      vendorRate:     v.vendorRate,
      payableBalance: v.payableBalance,
      totalPaidOut:   v.totalPaidOut,
      score:          v.score,
      stats:          v.stats,
      isActive:       v.isActive,
    },
  });
});

// ── GET /api/vendor-portal/jobs ───────────────────────────────────────────
router.get('/jobs', async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const vendorCarriers = req.vendor.carriers || [];

    let filter;
    if (status === 'open') {
      filter = { carrier: { $in: vendorCarriers }, status: 'open' };
    } else if (status) {
      filter = { assignedVendor: req.vendor._id, status };
    } else {
      filter = {
        $or: [
          { carrier: { $in: vendorCarriers }, status: 'open' },
          { assignedVendor: req.vendor._id },
        ],
      };
    }

    const safePage  = Math.max(1, parseInt(page) || 1);
    const safeLimit = Math.min(parseInt(limit) || 20, 100);
    const skip  = (safePage - 1) * safeLimit;
    const total = await ManifestJob.countDocuments(filter);
    const jobs  = await ManifestJob.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(safeLimit)
      .select('carrier status requestFile.originalName requestFile.labelCount vendorEarning assignedAt acceptedAt vendorUploadedAt createdAt resultFile.coolingDeadline resultFile.uploadedAt assignedVendor');

    const myId = req.vendor._id.toString();
    const now  = new Date();
    const enriched = jobs.map(j => {
      const obj = j.toObject();
      if (obj.status === 'uploaded' && obj.resultFile?.coolingDeadline && now > new Date(obj.resultFile.coolingDeadline)) {
        obj.status = 'under_review';
      }
      obj.sheetName    = obj.requestFile?.originalName || 'manifest.csv';
      obj.labelCount   = obj.requestFile?.labelCount   || 0;
      obj.isMine       = obj.assignedVendor?.toString() === myId;
      delete obj.user;
      delete obj.userBilling;
      return obj;
    });

    res.json({ jobs: enriched, total, page: safePage, pages: Math.ceil(total / safeLimit) });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// ── GET /api/vendor-portal/jobs/:id ──────────────────────────────────────
router.get('/jobs/:id', async (req, res) => {
  try {
    const job = await ManifestJob.findById(req.params.id);
    if (!job) return res.status(404).json({ message: 'Job not found' });

    const vendorCarriers = req.vendor.carriers || [];
    const isOpen     = job.status === 'open' && vendorCarriers.includes(job.carrier);
    const isAssigned = job.assignedVendor?.toString() === req.vendor._id.toString();
    if (!isOpen && !isAssigned) return res.status(404).json({ message: 'Job not found' });

    const obj = job.toObject();
    obj.sheetName  = obj.requestFile?.originalName || 'manifest.csv';
    obj.labelCount = obj.requestFile?.labelCount   || 0;
    delete obj.user;
    delete obj.userBilling;

    const now = new Date();
    if (obj.status === 'uploaded' && obj.resultFile?.coolingDeadline && now > new Date(obj.resultFile.coolingDeadline)) {
      obj.status = 'under_review';
    }

    res.json({ job: obj });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// ── GET /api/vendor-portal/jobs/:id/download-request ─────────────────────
router.get('/jobs/:id/download-request', async (req, res) => {
  try {
    const job = await ManifestJob.findOne({ _id: req.params.id, assignedVendor: req.vendor._id });
    if (!job) return res.status(404).json({ message: 'Job not found' });
    if (!['assigned', 'accepted', 'uploaded', 'rejected', 'under_review', 'completed'].includes(job.status)) {
      return res.status(400).json({ message: 'Job is not in a downloadable state' });
    }
    if (!job.requestFile?.path) {
      return res.status(404).json({ message: 'No request file attached to this job' });
    }
    if (!fs.existsSync(job.requestFile.path)) {
      return res.status(404).json({ message: 'Request file no longer exists on the server. Contact support.' });
    }
    res.download(job.requestFile.path, job.requestFile.originalName || 'manifest.csv', (err) => {
      if (err && !res.headersSent) {
        res.status(500).json({ message: 'File transfer failed. Please try again.' });
      }
    });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// ── PUT /api/vendor-portal/jobs/:id/accept ───────────────────────────────
router.put('/jobs/:id/accept', async (req, res) => {
  try {
    const job = await ManifestJob.findById(req.params.id);
    if (!job) return res.status(404).json({ message: 'Job not found' });

    const vendorCarriers = req.vendor.carriers || [];

    if (job.status === 'open') {
      if (!vendorCarriers.includes(job.carrier)) {
        return res.status(403).json({ message: `You do not support carrier ${job.carrier}` });
      }
      job.assignedVendor = req.vendor._id;
      job.status         = 'assigned';
      job.assignedAt     = new Date();
      job.timeline.push({ status: 'assigned', note: 'Vendor claimed open job', byVendor: true });
      await job.save();

      if (req.io) req.io.emit('manifest-accepted', { jobId: job._id, vendorId: req.vendor._id });
      return res.json({ message: 'Job claimed. Download the CSV and upload your result when ready.', job: { _id: job._id, status: job.status } });
    }

    if (job.assignedVendor?.toString() !== req.vendor._id.toString()) {
      return res.status(404).json({ message: 'Job not found' });
    }
    if (job.status !== 'assigned') {
      return res.status(400).json({ message: `Cannot accept a job with status "${job.status}"` });
    }

    job.status     = 'accepted';
    job.acceptedAt = new Date();
    job.timeline.push({ status: 'accepted', note: 'Job accepted by vendor', byVendor: true });
    await job.save();

    if (req.io) req.io.emit('manifest-accepted', { jobId: job._id });
    res.json({ message: 'Job accepted. Please generate labels and upload the result.', job: { _id: job._id, status: job.status } });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// ── POST /api/vendor-portal/jobs/:id/upload ──────────────────────────────
router.post('/jobs/:id/upload', uploadResult.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'Result file is required' });

    // Validate file content via magic bytes (prevents extension spoofing)
    const ext = path.extname(req.file.originalname).toLowerCase();
    if (!validateMagicBytes(req.file.path, ext)) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ message: 'File content does not match its declared type' });
    }

    // Atomic status transition: only one concurrent upload can succeed per job.
    // findOneAndUpdate with a status filter acts as an optimistic lock —
    // if two requests race, only the first to hit MongoDB will match and proceed.
    const job = await ManifestJob.findOneAndUpdate(
      {
        _id:            req.params.id,
        assignedVendor: req.vendor._id,
        status:         { $in: ['assigned', 'accepted', 'rejected'] },
      },
      { $set: { status: 'uploading' } }, // intermediate lock state
      { new: true }
    );

    if (!job) {
      fs.unlinkSync(req.file.path);
      return res.status(409).json({ message: 'Job not found, not in an uploadable state, or upload already in progress' });
    }

    // Remove old result file if re-uploading after rejection
    if (job.resultFile?.path && fs.existsSync(job.resultFile.path)) {
      fs.unlinkSync(job.resultFile.path);
    }

    const coolingDeadline = new Date(Date.now() + 60 * 1000); // 1 minute

    job.resultFile = {
      originalName:    req.file.originalname,
      storedName:      req.file.filename,
      path:            req.file.path,
      uploadedAt:      new Date(),
      coolingDeadline,
    };
    job.status           = 'uploaded';
    job.vendorUploadedAt = new Date();
    job.timeline.push({
      status:  'uploaded',
      note:    `Result file uploaded by vendor. Cooling period ends at ${coolingDeadline.toISOString()}`,
      byVendor: true,
    });
    await job.save();

    // Credit vendor payable balance AFTER job is persisted.
    // This runs after the atomic lock so only one request ever reaches this point per job.
    const vendor  = req.vendor;
    const earning = (job.requestFile?.labelCount || 0) * vendor.vendorRate;
    if (earning > 0) {
      await ManifestVendor.findByIdAndUpdate(vendor._id, {
        $inc: {
          payableBalance:      earning,
          'stats.totalLabels': job.requestFile?.labelCount || 0,
        }
      });
    }

    if (req.io) req.io.emit('manifest-uploaded', { jobId: job._id });

    res.json({
      message:         'File uploaded. You have 1 minute to cancel if you find an error.',
      coolingDeadline,
      job: { _id: job._id, status: job.status },
    });
  } catch (err) {
    if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    console.error('Vendor upload error:', err);
    res.status(500).json({ message: 'Server error uploading file' });
  }
});

// ── DELETE /api/vendor-portal/jobs/:id/upload  — cancel within cooling ───
router.delete('/jobs/:id/upload', async (req, res) => {
  try {
    const job = await ManifestJob.findOne({ _id: req.params.id, assignedVendor: req.vendor._id });
    if (!job) return res.status(404).json({ message: 'Job not found' });
    if (job.status !== 'uploaded') {
      return res.status(400).json({ message: 'No active upload to cancel' });
    }

    const now = new Date();
    if (!job.resultFile?.coolingDeadline || now > new Date(job.resultFile.coolingDeadline)) {
      return res.status(400).json({ message: 'Cooling period has expired. Contact admin to reject the upload.' });
    }

    // Reverse the payable balance credit
    const vendor  = req.vendor;
    const earning = (job.requestFile?.labelCount || 0) * vendor.vendorRate;
    if (earning > 0) {
      await ManifestVendor.findByIdAndUpdate(vendor._id, {
        $inc: {
          payableBalance:      -earning,
          'stats.totalLabels': -(job.requestFile?.labelCount || 0),
        }
      });
    }

    if (job.resultFile?.path && fs.existsSync(job.resultFile.path)) {
      fs.unlinkSync(job.resultFile.path);
    }

    job.resultFile = undefined;
    job.status     = 'accepted';
    job.timeline.push({
      status:  'accepted',
      note:    'Vendor cancelled upload during cooling period. Ready to re-upload.',
      byVendor: true,
    });
    await job.save();

    res.json({ message: 'Upload cancelled. You can upload a corrected file.', job: { _id: job._id, status: job.status } });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// ── PUT /api/vendor-portal/me/password ───────────────────────────────────
router.put('/me/password', async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: 'Current and new password are required' });
    }
    if (newPassword.length < 8) {
      return res.status(400).json({ message: 'New password must be at least 8 characters' });
    }
    const vendor = await ManifestVendor.findById(req.vendor._id).select('+password');
    if (!vendor.password) {
      return res.status(400).json({ message: 'No password set. Contact support.' });
    }
    const isMatch = await vendor.comparePassword(currentPassword);
    if (!isMatch) {
      return res.status(400).json({ message: 'Current password is incorrect' });
    }
    vendor.password = newPassword;
    await vendor.save();
    res.json({ message: 'Password updated successfully' });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// ── GET /api/vendor-portal/earnings ──────────────────────────────────────
router.get('/earnings', async (req, res) => {
  try {
    const completedJobs = await ManifestJob.find({
      assignedVendor: req.vendor._id,
      status: 'completed',
    }).select('carrier requestFile.labelCount requestFile.originalName vendorEarning completedAt createdAt');

    const v = req.vendor;
    res.json({
      payableBalance: v.payableBalance,
      totalPaidOut:   v.totalPaidOut,
      vendorRate:     v.vendorRate,
      stats:          v.stats,
      payouts:        v.payouts,
      jobs:           completedJobs,
    });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
