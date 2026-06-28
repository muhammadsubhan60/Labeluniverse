const express = require('express');
const fs      = require('fs');
const { authenticateToken, authorize } = require('../middleware/auth');
const ManifestJob           = require('../models/ManifestJob');
const UserCarrierAssignment = require('../models/UserCarrierAssignment');
const ManifestVendor        = require('../models/ManifestVendor');
const User                  = require('../models/User');
const Balance               = require('../models/Balance');

const router = express.Router();

// All routes require admin
router.use(authenticateToken, authorize('admin'));

// ── GET /api/admin/manifest/stats ────────────────────────────────────────
router.get('/stats', async (req, res) => {
  try {
    const [total, pending, assigned, accepted, underReview, completed, cancelled] = await Promise.all([
      ManifestJob.countDocuments(),
      ManifestJob.countDocuments({ status: 'pending' }),
      ManifestJob.countDocuments({ status: 'assigned' }),
      ManifestJob.countDocuments({ status: 'accepted' }),
      ManifestJob.countDocuments({ status: { $in: ['uploaded', 'under_review'] } }),
      ManifestJob.countDocuments({ status: 'completed' }),
      ManifestJob.countDocuments({ status: 'cancelled' }),
    ]);
    res.json({ total, pending, assigned, accepted, underReview, completed, cancelled });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// ── GET /api/admin/manifest  — all jobs with filters ────────────────────
router.get('/', async (req, res) => {
  try {
    const { status, carrier, userId, vendorId, page = 1, limit = 30 } = req.query;
    const filter = {};
    if (status)   filter.status         = status;
    if (carrier)  filter.carrier        = carrier;
    if (userId)   filter.user           = userId;
    if (vendorId) filter.assignedVendor = vendorId;

    const skip  = (parseInt(page) - 1) * parseInt(limit);
    const total = await ManifestJob.countDocuments(filter);
    const jobs  = await ManifestJob.find(filter)
      .populate('user',           'firstName lastName email')
      .populate('assignedVendor', 'name carriers vendorRate')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .select('-requestFile.path -resultFile.path');

    // Auto-transition uploaded → under_review after cooling
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
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ── GET /api/admin/manifest/:id ──────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const job = await ManifestJob.findById(req.params.id)
      .populate('user',           'firstName lastName email')
      .populate('assignedVendor', 'name carriers vendorRate email notifyEmail')
      .populate('timeline.performedBy', 'firstName lastName');
    if (!job) return res.status(404).json({ message: 'Job not found' });
    res.json({ job });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// ── PUT /api/admin/manifest/:id/assign  — assign or reassign vendor ──────
router.put('/:id/assign', async (req, res) => {
  try {
    const { vendorId, notes } = req.body;
    if (!vendorId) return res.status(400).json({ message: 'vendorId is required' });

    const [job, vendor] = await Promise.all([
      ManifestJob.findById(req.params.id),
      ManifestVendor.findById(vendorId),
    ]);
    if (!job)    return res.status(404).json({ message: 'Job not found' });
    if (!vendor) return res.status(404).json({ message: 'Vendor not found' });
    if (!vendor.isActive) return res.status(400).json({ message: 'Vendor is inactive' });

    const previousVendor = job.assignedVendor;
    const isReassign     = previousVendor && previousVendor.toString() !== vendorId;

    job.assignedVendor = vendorId;
    job.status         = 'assigned';
    job.assignedAt     = new Date();
    job.timeline.push({
      status:      'assigned',
      note:        isReassign
        ? `Reassigned to vendor ${vendor.name} by admin. ${notes || ''}`
        : `Assigned to vendor ${vendor.name} by admin. ${notes || ''}`,
      performedBy: req.user._id,
    });
    if (notes) job.adminNotes = notes;

    // Update vendor earning with new vendor's rate
    job.vendorEarning.ratePerLabel = vendor.vendorRate;
    job.vendorEarning.totalAmount  = Math.round(vendor.vendorRate * job.requestFile.labelCount * 100) / 100;
    job.vendorEarning.credited     = false;

    await job.save();

    // Notify new vendor
    try {
      const { sendEmail, vendorJobAssigned } = require('../services/emailService');
      const notifyEmail = vendor.notifyEmail || vendor.email;
      if (notifyEmail) {
        const portalUrl = `${process.env.CLIENT_URL || 'http://localhost:3000'}/vendor-portal/jobs/${job._id}`;
        const tpl = vendorJobAssigned(job._id.toString(), job.carrier, job.requestFile.labelCount, portalUrl);
        await sendEmail({ to: notifyEmail, ...tpl });
      }
    } catch (_) {}

    // Notify via socket
    if (req.io) req.io.emit('manifest-reassigned', { jobId: job._id });

    res.json({ message: isReassign ? 'Job reassigned successfully' : 'Job assigned successfully', job });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error assigning job' });
  }
});

// ── PUT /api/admin/manifest/:id/cancel  — cancel job from vendor ─────────
router.put('/:id/cancel', async (req, res) => {
  try {
    const { reason } = req.body;
    const job = await ManifestJob.findById(req.params.id)
      .populate('assignedVendor', 'name email notifyEmail');
    if (!job) return res.status(404).json({ message: 'Job not found' });

    if (['completed', 'cancelled'].includes(job.status)) {
      return res.status(400).json({ message: `Cannot cancel a job with status "${job.status}"` });
    }

    job.status            = 'cancelled';
    job.cancelledAt       = new Date();
    job.cancelledBy       = 'admin';
    job.cancellationReason = reason || '';
    job.timeline.push({
      status:      'cancelled',
      note:        `Cancelled by admin. Reason: ${reason || 'N/A'}`,
      performedBy: req.user._id,
    });
    await job.save();

    // Notify vendor
    try {
      const { sendEmail, vendorJobCancelled } = require('../services/emailService');
      const vendor = job.assignedVendor;
      if (vendor) {
        const notifyEmail = vendor.notifyEmail || vendor.email;
        if (notifyEmail) {
          const tpl = vendorJobCancelled(job._id.toString(), job.carrier, reason);
          await sendEmail({ to: notifyEmail, ...tpl });
        }
      }
    } catch (_) {}

    if (req.io) req.io.to(job.user.toString()).emit('manifest-cancelled', { jobId: job._id });

    res.json({ message: 'Job cancelled', job });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// ── PUT /api/admin/manifest/:id/approve  — approve vendor upload ─────────
router.put('/:id/approve', async (req, res) => {
  try {
    const { notes } = req.body;
    const job = await ManifestJob.findById(req.params.id)
      .populate('user',           'firstName lastName email')
      .populate('assignedVendor', 'name vendorRate payableBalance');

    if (!job) return res.status(404).json({ message: 'Job not found' });
    if (!['uploaded', 'under_review'].includes(job.status)) {
      return res.status(400).json({ message: 'Job is not pending review' });
    }

    // Credit vendor
    const earning = job.vendorEarning.totalAmount;
    if (earning > 0 && job.assignedVendor) {
      await ManifestVendor.findByIdAndUpdate(job.assignedVendor._id, {
        $inc: { payableBalance: earning, 'stats.completedJobs': 1 },
      });
      job.vendorEarning.credited   = true;
      job.vendorEarning.creditedAt = new Date();
    }

    job.status          = 'completed';
    job.completedAt     = new Date();
    job.adminReviewedAt = new Date();
    if (notes) job.adminNotes = notes;
    job.timeline.push({
      status:      'completed',
      note:        `Approved by admin. ${notes || ''} Vendor credited $${earning.toFixed(2)}.`,
      performedBy: req.user._id,
    });
    await job.save();

    // Notify user via email
    try {
      const { sendEmail, userLabelsReady } = require('../services/emailService');
      const user = job.user;
      if (user?.email) {
        const downloadUrl = `${process.env.CLIENT_URL || 'http://localhost:3000'}/manifest/history`;
        const tpl = userLabelsReady(user.firstName, job._id.toString(), job.carrier, job.requestFile.labelCount, downloadUrl);
        await sendEmail({ to: user.email, ...tpl });
      }
    } catch (_) {}

    // Portal notification — user side
    if (req.io) {
      req.io.to(job.user._id?.toString() || job.user.toString()).emit('manifest-completed', {
        jobId: job._id, carrier: job.carrier,
      });
    }
    // Vendor portal notification (BatchOps)
    if (req.vendorNS && job.assignedVendor) {
      req.vendorNS.to(`vendor:${job.assignedVendor._id || job.assignedVendor}`).emit('job-updated', {
        jobId: job._id.toString(), status: 'completed',
      });
    }

    res.json({ message: 'Job approved. User notified. Vendor credited.', job });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error approving job' });
  }
});

// ── PUT /api/admin/manifest/:id/reject  — reject vendor upload ───────────
router.put('/:id/reject', async (req, res) => {
  try {
    const { reason } = req.body;
    const job = await ManifestJob.findById(req.params.id)
      .populate('assignedVendor', 'name email notifyEmail');

    if (!job) return res.status(404).json({ message: 'Job not found' });
    if (!['uploaded', 'under_review'].includes(job.status)) {
      return res.status(400).json({ message: 'Job is not pending review' });
    }

    // Remove the rejected result file
    if (job.resultFile?.path && fs.existsSync(job.resultFile.path)) {
      fs.unlinkSync(job.resultFile.path);
    }

    job.status          = 'rejected';
    job.rejectionReason = reason || '';
    job.resultFile      = undefined;
    job.timeline.push({
      status:      'rejected',
      note:        `Upload rejected by admin. Reason: ${reason || 'N/A'}. Vendor must re-upload.`,
      performedBy: req.user._id,
    });
    await job.save();

    // Notify vendor
    try {
      const { sendEmail, vendorUploadRejected } = require('../services/emailService');
      const vendor = job.assignedVendor;
      if (vendor) {
        const notifyEmail = vendor.notifyEmail || vendor.email;
        if (notifyEmail) {
          const tpl = vendorUploadRejected(job._id.toString(), job.carrier, reason);
          await sendEmail({ to: notifyEmail, ...tpl });
        }
      }
    } catch (_) {}

    if (req.io) req.io.emit('manifest-rejected', { jobId: job._id });
    // Vendor portal notification (BatchOps)
    if (req.vendorNS && job.assignedVendor) {
      req.vendorNS.to(`vendor:${job.assignedVendor._id || job.assignedVendor}`).emit('job-updated', {
        jobId: job._id.toString(), status: 'rejected',
      });
    }

    res.json({ message: 'Upload rejected. Vendor notified to re-upload.', job });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// ── GET /api/admin/manifest/:id/download-request  — download user CSV ────
router.get('/:id/download-request', async (req, res) => {
  try {
    const job = await ManifestJob.findById(req.params.id);
    if (!job) return res.status(404).json({ message: 'Job not found' });
    if (!job.requestFile?.path || !fs.existsSync(job.requestFile.path)) {
      return res.status(404).json({ message: 'Request file not found' });
    }
    res.download(job.requestFile.path, job.requestFile.originalName);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// ── GET /api/admin/manifest/:id/download-result  — download vendor file ──
router.get('/:id/download-result', async (req, res) => {
  try {
    const job = await ManifestJob.findById(req.params.id);
    if (!job) return res.status(404).json({ message: 'Job not found' });
    if (!job.resultFile?.path || !fs.existsSync(job.resultFile.path)) {
      return res.status(404).json({ message: 'Result file not found' });
    }
    res.download(job.resultFile.path, job.resultFile.originalName);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// ── GET /api/admin/manifest/assignments  — all user-carrier-vendor configs ─
router.get('/assignments/list', async (req, res) => {
  try {
    const { userId, carrier } = req.query;
    const filter = {};
    if (userId)  filter.user    = userId;
    if (carrier) filter.carrier = carrier;

    const assignments = await UserCarrierAssignment.find(filter)
      .populate('user',       'firstName lastName email')
      .populate('vendor',     'name carriers isActive')
      .populate('assignedBy', 'firstName lastName')
      .sort({ createdAt: -1 });

    res.json({ assignments });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// ── POST /api/admin/manifest/assignments  — create or update assignment ──
router.post('/assignments', async (req, res) => {
  try {
    const { userId, carrier, vendorId, notes } = req.body;
    if (!userId || !carrier || !vendorId) {
      return res.status(400).json({ message: 'userId, carrier and vendorId are required' });
    }

    const [user, vendor] = await Promise.all([
      User.findById(userId),
      ManifestVendor.findById(vendorId),
    ]);
    if (!user)   return res.status(404).json({ message: 'User not found' });
    if (!vendor) return res.status(404).json({ message: 'Vendor not found' });

    // Upsert — one active assignment per user per carrier
    const assignment = await UserCarrierAssignment.findOneAndUpdate(
      { user: userId, carrier },
      { vendor: vendorId, isActive: true, assignedBy: req.user._id, notes: notes || '' },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    await assignment.populate([
      { path: 'user',   select: 'firstName lastName email' },
      { path: 'vendor', select: 'name carrier' },
    ]);

    res.json({ message: 'Assignment saved', assignment });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error saving assignment' });
  }
});

// ── DELETE /api/admin/manifest/assignments/:id ────────────────────────────
router.delete('/assignments/:id', async (req, res) => {
  try {
    await UserCarrierAssignment.findByIdAndDelete(req.params.id);
    res.json({ message: 'Assignment removed' });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
