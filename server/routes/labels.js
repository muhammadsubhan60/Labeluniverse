const express  = require('express');
const fs       = require('fs');
const path     = require('path');
const https    = require('https');
const http     = require('http');
const archiver = require('archiver');
const { body, validationResult } = require('express-validator');
const Label            = require('../models/Label');
const Vendor           = require('../models/Vendor');
const Balance          = require('../models/Balance');
const UserVendorAccess = require('../models/UserVendorAccess');
const User             = require('../models/User');
const ManifestJob      = require('../models/ManifestJob');
const { authenticateToken, authorize, authorizeCC } = require('../middleware/auth');
const shippershub = require('../services/shippershub');

// ── Helpers ───────────────────────────────────────────────────
const manifestRequestDir = path.join(__dirname, '../uploads/manifests/requests');
const labelsDir          = path.join(__dirname, '../uploads/labels');
const zipsDir            = path.join(__dirname, '../uploads/zips');
fs.mkdirSync(manifestRequestDir, { recursive: true });
fs.mkdirSync(labelsDir, { recursive: true });
fs.mkdirSync(zipsDir,   { recursive: true });

// Create a ZIP of PDF files using STORE (no recompression — preserves PDF bytes exactly)
function createZip(pdfPaths, zipFilename) {
  return new Promise((resolve, reject) => {
    const zipPath = path.join(zipsDir, zipFilename);
    const output  = fs.createWriteStream(zipPath);
    // level: 0 = STORE method — PDFs are already compressed internally,
    // re-compressing degrades nothing but wastes CPU and can increase size.
    const archive = archiver('zip', { zlib: { level: 0 } });
    output.on('close', () => resolve(zipPath));
    archive.on('error', reject);
    archive.pipe(output);
    pdfPaths.forEach((p, i) => {
      if (p && fs.existsSync(p)) {
        archive.file(p, { name: `label-${i + 1}-${path.basename(p)}` });
      }
    });
    archive.finalize();
  });
}

// ShipLabel invoice/download URLs are publicly accessible by tracking number — no auth needed.
// Only the REST API endpoints (/api/v2/*) require Bearer auth.
function slAuthHeaders(url) {
  if (!url || !url.includes('shiplabel.net')) return {};
  if (/\/invoices\/|\/download\/|\/labels\//.test(url)) return {};
  const key = process.env.SHIPLABEL_API_KEY;
  return key ? { Authorization: `Bearer ${key}` } : {};
}

// Fetch a remote PDF URL and return a Buffer (handles http + https + redirects)
// Pass extraHeaders (e.g. slAuthHeaders) when the remote requires auth.
function fetchRemotePdf(url, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    let u;
    try { u = new URL(url); } catch { return reject(new Error(`Invalid URL: ${url}`)); }
    const opts = {
      hostname: u.hostname,
      port:     u.port || (u.protocol === 'https:' ? 443 : 80),
      path:     u.pathname + u.search,
      headers:  extraHeaders,
    };
    lib.get(opts, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchRemotePdf(res.headers.location, extraHeaders).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
      }
      const ct = res.headers['content-type'] || '';
      if (ct && !ct.includes('pdf') && !ct.includes('octet-stream')) {
        res.resume();
        return reject(new Error(`Non-PDF content-type "${ct}" from ${url}`));
      }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const buf = Buffer.concat(chunks);
        // Magic bytes: real PDFs start with %PDF- (0x25 0x50 0x44 0x46 0x2D)
        if (buf.length < 5 || buf.slice(0, 5).toString('ascii') !== '%PDF-') {
          return reject(new Error(`Response from ${url} is not a valid PDF (magic bytes: ${buf.slice(0, 8).toString('ascii')})`));
        }
        resolve(buf);
      });
      res.on('error', reject);
    }).on('error', reject);
  });
}

function rowsToCSV(rows) {
  if (!rows.length) return '';
  const headers = Object.keys(rows[0]);
  const escape  = v => { const s = String(v ?? ''); return s.includes(',') || s.includes('"') ? `"${s.replace(/"/g,'""')}"` : s; };
  return [headers.join(','), ...rows.map(r => headers.map(h => escape(r[h])).join(','))].join('\n');
}

const router = express.Router();

/** Maximum results per page for list endpoints */
const PAGE_LIMIT_MAX = 100;

/** Escape special regex characters to prevent ReDoS */
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Validate that a value is a 24-character hex string (MongoDB ObjectId) */
function isValidObjectId(v) {
  return /^[0-9a-fA-F]{24}$/.test(String(v));
}

// ── POST /api/labels/single ───────────────────────────────────
// Generate a single label via ShippersHub, deduct balance
router.post('/single', authenticateToken, [
  body('vendorId').notEmpty().withMessage('Vendor ID is required'),
  body('from_name').notEmpty().withMessage('From name is required'),
  body('from_address1').notEmpty().withMessage('From address is required'),
  body('from_city').notEmpty().withMessage('From city is required'),
  body('from_state').notEmpty().withMessage('From state is required'),
  body('from_zip').notEmpty().withMessage('From zip is required'),
  body('to_name').notEmpty().withMessage('To name is required'),
  body('to_address1').notEmpty().withMessage('To address is required'),
  body('to_city').notEmpty().withMessage('To city is required'),
  body('to_state').notEmpty().withMessage('To state is required'),
  body('to_zip').notEmpty().withMessage('To zip is required'),
  body('weight').isFloat({ gt: 0 }).withMessage('Weight must be a positive number')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ message: 'Validation failed', errors: errors.array() });
    }

    const { vendorId, ...labelFields } = req.body;

    // Load the vendor config
    const vendor = await Vendor.findById(vendorId);
    if (!vendor || !vendor.isActive) {
      return res.status(404).json({ message: 'Vendor not found or inactive' });
    }
    console.log('[Single Label] vendor:', vendor._id, '| name:', vendor.name, '| source:', vendor.source, '| providerKey:', vendor.labelcrowProviderKey, '| seriesId:', vendor.labelcrowSeriesId);

    // Ensure user has access to this vendor and compute effective rate based on weight tiers
    const isAdmin = req.user.role === 'admin';
    const access  = isAdmin ? null : await UserVendorAccess.findOne({ user: req.user._id, vendor: vendorId });
    if (!isAdmin && (!access || !access.isAllowed)) {
      return res.status(403).json({ message: 'You are not allowed to use this vendor' });
    }

    const weight = parseFloat(labelFields.weight);

    // Weight range validation — enforce when user has rate tiers configured
    if (!isAdmin && access.rateTiers && access.rateTiers.length > 0) {
      const matched = access.getRateForWeight(weight);
      if (matched === null) {
        const ranges = access.rateTiers
          .map(t => t.maxLbs === null ? `${t.minLbs}+ lbs` : `${t.minLbs}–${t.maxLbs} lbs`)
          .join(', ');
        return res.status(400).json({
          message: `Weight ${weight} lbs is outside your allowed range. Allowed: ${ranges}.`,
        });
      }
    }

    const tierRate = isAdmin ? null : access.getRateForWeight(weight);
    if (!isAdmin && (tierRate === null || tierRate === undefined)) {
      return res.status(403).json({
        message: `No rate tier configured for "${vendor.name}". Contact your admin to set up pricing before generating labels.`,
      });
    }
    const effectiveRate = isAdmin ? vendor.rate : tierRate;

    // Check user has sufficient balance
    const balance = await Balance.getOrCreateBalance(req.user._id);
    if (balance.currentBalance < effectiveRate) {
      return res.status(402).json({
        message: `Insufficient balance. Need $${effectiveRate.toFixed(2)}, have $${balance.currentBalance.toFixed(2)}`
      });
    }

    // Call the appropriate service to generate the label
    let shippershubResult = null;
    let trackingId = '';
    let pdfUrl     = null;

    if (vendor.source === 'labelcrow') {
      if (!vendor.labelcrowProviderKey) {
        return res.status(400).json({
          message: `Vendor "${vendor.name}" has no Label Crow provider key configured. Re-sync vendors from Admin → Vendors → Sync Label Crow.`,
        });
      }
      const labelcrow = require('../services/labelcrow');
      const lcResult = await labelcrow.createSingleLabel({
        seriesId:     vendor.labelcrowSeriesId,
        carrier:      vendor.carrier.toLowerCase(),
        serviceClass: vendor.labelcrowServiceClass,
        providerKey:  vendor.labelcrowProviderKey,
        weight,
        from: {
          name:     labelFields.from_name,
          address:  labelFields.from_address1,
          address2: labelFields.from_address2 || undefined,
          city:     labelFields.from_city,
          state:    labelFields.from_state,
          zip:      labelFields.from_zip,
        },
        to: {
          name:     labelFields.to_name,
          address:  labelFields.to_address1,
          address2: labelFields.to_address2 || undefined,
          city:     labelFields.to_city,
          state:    labelFields.to_state,
          zip:      labelFields.to_zip,
        },
        orderNumber: labelFields.note || undefined,
      }, req.user.tenantId || req.user._id);
      trackingId = lcResult.tracking || '';
      pdfUrl     = lcResult.pdfUrl   || null;
    } else if (vendor.source === 'shippershub' && vendor.shippershubCarrierId && vendor.shippershubVendorId) {
      shippershubResult = await shippershub.createSingleLabel({
        carrier:  vendor.shippershubCarrierId,
        vendor:   vendor.shippershubVendorId,
        weight:   parseFloat(labelFields.weight),
        note:     labelFields.note || '',
        from_name:     labelFields.from_name,
        from_company:  labelFields.from_company || '',
        from_phone:    labelFields.from_phone || '',
        from_address1: labelFields.from_address1,
        from_address2: labelFields.from_address2 || '',
        from_city:     labelFields.from_city,
        from_state:    labelFields.from_state,
        from_zip:      labelFields.from_zip,
        from_country:  labelFields.from_country || 'USA',
        to_name:       labelFields.to_name,
        to_company:    labelFields.to_company || '',
        to_phone:      labelFields.to_phone || '',
        to_address1:   labelFields.to_address1,
        to_address2:   labelFields.to_address2 || '',
        to_city:       labelFields.to_city,
        to_state:      labelFields.to_state,
        to_zip:        labelFields.to_zip,
        to_country:    labelFields.to_country || 'USA',
        length: parseFloat(labelFields.length) || 1,
        width:  parseFloat(labelFields.width)  || 1,
        height: parseFloat(labelFields.height) || 1,
      }, req.user.tenantId || req.user._id);
      trackingId = shippershubResult?.trackingID || shippershubResult?.trackingId || '';
      pdfUrl     = shippershubResult?.awsPath || shippershubResult?.pdfUrl || null;

    } else if (vendor.source === 'shiplabel') {
      const slSvc = require('../services/shiplabel');

      // User-selected series (from multi-series picker) takes priority over vendor defaults
      let activeSeries = labelFields.shiplabel_series || vendor.shiplabelLabelSeries || '';
      let activeFormat = labelFields.shiplabel_format || vendor.shiplabelLabelFormat || '';

      // If vendor has a multi-series list, validate user's selection
      if (vendor.shiplabelSeries && vendor.shiplabelSeries.length > 0) {
        if (!activeSeries) {
          return res.status(400).json({ message: 'Select a label series before generating.' });
        }
        const seriesEntry = vendor.shiplabelSeries.find(s => s.series === activeSeries);
        if (!seriesEntry) {
          return res.status(400).json({ message: `Series "${activeSeries}" is not configured on this vendor.` });
        }
        // For non-admin: check user's allowed series
        if (!isAdmin) {
          const accessRec = await UserVendorAccess.findOne({ user: req.user._id, vendor: vendorId });
          const allowed = accessRec?.allowedShiplabelSeries || [];
          if (allowed.length > 0 && !allowed.includes(activeSeries)) {
            return res.status(403).json({ message: `You are not allowed to use series "${activeSeries}".` });
          }
        }
        activeFormat = seriesEntry.format;
      }

      const slResult = await slSvc.createOrder({
        label_id:     vendor.shiplabelServiceId,
        fromName:     labelFields.from_name     || '',
        fromCompany:  labelFields.from_company  || '',
        fromAddress:  labelFields.from_address1 || '',
        fromAddress2: labelFields.from_address2 || '',
        fromZip:      labelFields.from_zip      || '',
        fromState:    labelFields.from_state    || '',
        fromCity:     labelFields.from_city     || '',
        fromCountry:  'US',
        toName:       labelFields.to_name       || '',
        toCompany:    labelFields.to_company    || '',
        toAddress:    labelFields.to_address1   || '',
        toAddress2:   labelFields.to_address2   || '',
        toZip:        labelFields.to_zip        || '',
        toState:      labelFields.to_state      || '',
        toCity:       labelFields.to_city       || '',
        toCountry:    'US',
        weight: parseFloat(labelFields.weight) || 0,
        length: parseFloat(labelFields.length) || 0,
        height: parseFloat(labelFields.height) || 0,
        width:  parseFloat(labelFields.width)  || 0,
        ...(activeSeries ? { label_series: activeSeries } : {}),
        ...(activeFormat ? { label_format: activeFormat } : {}),
      });
      if (slResult.label_created === 'fail') {
        throw new Error('ShipLabel rejected this label — the series/format combination is not valid for your account. Try a different series or format in Admin → Vendors.');
      }
      const slKeys    = Object.keys(slResult);
      const slTrkKey  = slKeys.find(k => /track|barcode/i.test(k) && slResult[k]);
      const slPdfKey  = slKeys.find(k => /^(pdf|label(_url|_pdf)?|label_link|download)$/i.test(k) && slResult[k]);
      trackingId = slResult.tracking_id || slResult.tracking_number || slResult.barcode
        || slResult.tracking || slResult.trackingNumber || slResult.trackingId
        || (slTrkKey ? String(slResult[slTrkKey]) : '') || '';
      pdfUrl = slResult.pdf || slResult.label_url || slResult.label
        || slResult.pdf_url || slResult.label_pdf
        || (slPdfKey ? String(slResult[slPdfKey]) : '') || null;
    }

    // Deduct balance
    await balance.addTransaction({
      type:        'deduction',
      amount:      effectiveRate,
      description: `Label generated — ${vendor.carrier} ${vendor.name} (${trackingId || 'N/A'})`,
      performedBy: req.user._id
    });

    // Save label record
    const label = await Label.create({
      user:              req.user._id,
      tenantId:          req.user.tenantId || req.user._id,
      vendor:            vendor._id,
      carrier:           vendor.carrier,
      vendorName:        vendor.name,
      shippingService:   vendor.shippingService,
      shippershubLabelId: shippershubResult?._id || null,
      trackingId,
      price:      effectiveRate,
      pdfUrl,
      awsKey:     shippershubResult?.awsKey  || null,
      awsPath:    shippershubResult?.awsPath || null,
      isBulk:     false,
      ...labelFields,
      weight: parseFloat(labelFields.weight)
    });

    // Notify via socket.io
    if (req.io) {
      req.io.to(req.user._id.toString()).emit('label-generated', {
        labelId: label._id, trackingId, carrier: vendor.carrier
      });
      // Real-time feed for admin live monitor
      req.io.to('admin-room').emit('admin-label-generated', {
        carrier:   vendor.carrier,
        trackingId,
        price:     label.price || 0,
        toState:   label.to_state || '',
        toCity:    label.to_city  || '',
        createdAt: label.createdAt,
      });
    }

    res.status(201).json({
      message: 'Label generated successfully',
      label: {
        id:         label._id,
        trackingId: label.trackingId,
        carrier:    label.carrier,
        vendor:     label.vendorName,
        price:      label.price,
        pdfUrl:     label.pdfUrl,
        createdAt:  label.createdAt
      },
      newBalance: balance.currentBalance
    });

  } catch (error) {
    console.error('Generate single label error:', error);
    // ShippersHub API errors are downstream failures, not server crashes — return 400
    const isShippersHubError = error.message && (
      error.message.includes('ShippersHub') ||
      error.message.includes('carrier') ||
      error.message.includes('vendor') ||
      error.message.includes('label') ||
      error.message.includes('token') ||
      error.message.includes('Invalid') ||
      error.message.includes('not found') ||
      error.message.includes('Unauthorized')
    );
    res.status(isShippersHubError ? 400 : 500).json({ message: error.message || 'Server error generating label' });
  }
});

// ── POST /api/labels/bulk ─────────────────────────────────────
// Bulk label generation — accepts array of addresses
router.post('/bulk', authenticateToken, [
  body('vendorId').notEmpty().withMessage('Vendor ID is required'),
  body('labels').isArray({ min: 1 }).withMessage('At least one label is required'),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ message: 'Validation failed', errors: errors.array() });
    }

    const { vendorId, labels: labelRows, bulkFileName: rawBulkFileName } = req.body;
    // Sanitize the uploaded filename so it's safe in Content-Disposition headers
    const bulkFileName = typeof rawBulkFileName === 'string'
      ? rawBulkFileName.replace(/[^\w\s\-_.()]/g, '').slice(0, 200).trim()
      : '';

    const vendor = await Vendor.findById(vendorId);
    if (!vendor || !vendor.isActive) {
      return res.status(404).json({ message: 'Vendor not found or inactive' });
    }

    // Access check — admin bypasses, regular users must have an allowed record
    const isAdmin = req.user.role === 'admin';
    const access  = isAdmin ? null : await UserVendorAccess.findOne({ user: req.user._id, vendor: vendorId });
    if (!isAdmin && (!access || !access.isAllowed)) {
      return res.status(403).json({ message: 'You are not allowed to use this vendor' });
    }

    // Weight range validation — enforce when user has rate tiers configured
    if (!isAdmin && access.rateTiers && access.rateTiers.length > 0) {
      const outOfRange = labelRows
        .map((r, i) => ({ row: i + 1, weight: parseFloat(r.weight) || 0 }))
        .filter(({ weight }) => access.getRateForWeight(weight) === null);
      if (outOfRange.length > 0) {
        const ranges = access.rateTiers
          .map(t => t.maxLbs === null ? `${t.minLbs}+ lbs` : `${t.minLbs}–${t.maxLbs} lbs`)
          .join(', ');
        return res.status(400).json({
          message: `${outOfRange.length} row(s) have weight outside your allowed range (${ranges}).`,
          invalidRows: outOfRange,
        });
      }
    }

    // Effective rate helper — throws if no tier configured for non-admin
    const getRate = (weight) => {
      if (isAdmin) return vendor.rate;
      const tierRate = access.getRateForWeight(weight);
      if (tierRate === null || tierRate === undefined) return null;
      return tierRate;
    };

    // Pre-calculate costs — block if any row has no tier
    const rowCosts = labelRows.map(r => getRate(parseFloat(r.weight) || 0));
    if (!isAdmin && rowCosts.some(c => c === null)) {
      return res.status(403).json({
        message: `No rate tier configured for "${vendor.name}". Contact your admin to set up pricing before generating labels.`,
      });
    }
    const totalCost = rowCosts.reduce((s, c) => s + c, 0);

    const balance = await Balance.getOrCreateBalance(req.user._id);
    if (balance.currentBalance < totalCost) {
      return res.status(402).json({
        message: `Insufficient balance. Need $${totalCost.toFixed(2)} for ${labelRows.length} labels, have $${balance.currentBalance.toFixed(2)}`
      });
    }

    // ── MANIFEST PATH ─────────────────────────────────────────
    if (vendor.vendorType === 'manifest') {
      // Deduct balance upfront
      await balance.addTransaction({
        type:        'deduction',
        amount:      totalCost,
        description: `Manifest job — ${labelRows.length}x ${vendor.carrier} ${vendor.name}`,
        performedBy: req.user._id,
      });

      // Save CSV to disk
      const csvContent  = rowsToCSV(labelRows);
      const unique      = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
      const storedName  = `manifest-req-${unique}.csv`;
      const storedPath  = path.join(manifestRequestDir, storedName);
      fs.writeFileSync(storedPath, csvContent, 'utf8');

      // Create open ManifestJob (broadcast to all matching vendors)
      const job = await ManifestJob.create({
        user:    req.user._id,
        carrier: vendor.carrier,
        vendor:  vendor._id,
        status:  'open',
        requestFile: {
          originalName: `${vendor.carrier}_${vendor.name}_bulk.csv`,
          storedName,
          path:       storedPath,
          labelCount: labelRows.length,
        },
        userBilling: {
          labelCount:  labelRows.length,
          totalAmount: totalCost,
          deducted:    true,
          deductedAt:  new Date(),
        },
        timeline: [{ status: 'open', note: 'Job submitted by user — open for vendor acceptance' }],
      });

      // Broadcast to vendor portal via socket
      if (req.io) req.io.emit('manifest-job-open', { jobId: job._id, carrier: vendor.carrier });

      return res.status(201).json({
        type:        'manifest',
        manifestJobId: job._id,
        status:      'open',
        labelCount:  labelRows.length,
        carrier:     vendor.carrier,
        vendorName:  vendor.name,
        totalCost,
        newBalance:  balance.currentBalance,
        message:     'Manifest job submitted — waiting for a vendor to accept',
      });
    }

    // ── LABELCROW PATH ────────────────────────────────────────
    if (vendor.source === 'labelcrow') {
      const labelcrow = require('../services/labelcrow');

      // Guard: providerKey must be a non-empty string — empty string causes TEMPLATE_NOT_FOUND
      if (!vendor.labelcrowProviderKey) {
        console.error('[LC Route] Blocked — labelcrowProviderKey is empty on vendor', vendor._id, vendor.name);
        return res.status(400).json({
          message: `Vendor "${vendor.name}" has no Label Crow provider key configured. Re-sync vendors from the admin panel (Admin → Vendors → Sync Label Crow) to populate provider keys, then retry.`,
        });
      }

      console.log('[LC Route] Bulk submit start', {
        vendorId:     vendor._id,
        vendorName:   vendor.name,
        source:       vendor.source,
        carrier:      vendor.carrier,
        seriesId:     vendor.labelcrowSeriesId,
        serviceClass: vendor.labelcrowServiceClass,
        providerKey:  vendor.labelcrowProviderKey,
        labelCount:   labelRows.length,
        totalCost:    totalCost.toFixed(2),
        userId:       req.user._id,
      });
      console.log('[LC Route] First label row (raw):', JSON.stringify(labelRows[0]));

      // Deduct balance upfront (job is async — held like a manifest)
      await balance.addTransaction({
        type:        'deduction',
        amount:      totalCost,
        description: `Label Crow bulk — ${labelRows.length}x ${vendor.carrier} ${vendor.name} (queued)`,
        performedBy: req.user._id,
      });

      // Submit to Label Crow API
      let jobId, orderId, totalLabels;
      try {
        ({ jobId, orderId, totalLabels } = await labelcrow.submitBulkJob({
          seriesId:     vendor.labelcrowSeriesId,
          carrier:      vendor.carrier.toLowerCase(),
          serviceClass: vendor.labelcrowServiceClass,
          providerKey:  vendor.labelcrowProviderKey,
          labels:       labelRows,
        }, req.user.tenantId || req.user._id));
        console.log('[LC Route] submitBulkJob success:', { jobId, orderId, totalLabels });
      } catch (lcErr) {
        console.error('[LC Route] submitBulkJob FAILED:', lcErr.message, lcErr.stack?.split('\n').slice(0, 3).join(' | '));
        throw lcErr;
      }

      // Create pending Label records for history/audit trail
      const mongooseLc = require('mongoose');
      const lcBulkJobId = new mongooseLc.Types.ObjectId().toString();
      await Label.insertMany(labelRows.map((row, i) => ({
        user:             req.user._id,
        tenantId:         req.user.tenantId || req.user._id,
        vendor:           vendor._id,
        carrier:          vendor.carrier,
        vendorName:       vendor.name,
        shippingService:  vendor.shippingService || '',
        price:            rowCosts[i],
        isBulk:           true,
        bulkJobId:        lcBulkJobId,
        bulkFileName,
        labelcrowJobId:   jobId,
        labelcrowOrderId: String(orderId),
        status:           'pending',
        ...row,
        weight: parseFloat(row.weight) || 0,
      })));

      console.log('[LC Route] Labels inserted, responding 202', { lcBulkJobId, jobId, orderId, totalLabels });
      return res.status(202).json({
        type:       'labelcrow-async',
        lcJobId:    jobId,
        lcOrderId:  orderId,
        total:      totalLabels,
        bulkJobId:  lcBulkJobId,
        newBalance: balance.currentBalance,
      });
    }

    // ── SHIPLABEL PATH ────────────────────────────────────────
    if (vendor.source === 'shiplabel') {
      const shiplabel  = require('../services/shiplabel');
      const mongoose2  = require('mongoose');
      const slBulkJobId = new mongoose2.Types.ObjectId().toString();

      // Deduct balance upfront
      await balance.addTransaction({
        type:        'deduction',
        amount:      totalCost,
        description: `ShipLabel bulk — ${labelRows.length}x ${vendor.carrier} ${vendor.name}`,
        performedBy: req.user._id,
      });

      // Create pending Label records
      const labelDocs = await Label.insertMany(labelRows.map((row, i) => ({
        user:             req.user._id,
        tenantId:         req.user.tenantId || req.user._id,
        vendor:           vendor._id,
        carrier:          vendor.carrier,
        vendorName:       vendor.name,
        shippingService:  vendor.shippingService || '',
        price:            rowCosts[i],
        isBulk:           true,
        bulkJobId:        slBulkJobId,
        bulkFileName,
        status:           'pending',
        ...row,
        weight: parseFloat(row.weight) || 0,
      })));

      // Process labels sequentially — ShipLabel API rejects concurrent requests with the same key
      const userId          = req.user._id;
      const _labelDocs      = labelDocs;
      const _labelRows      = labelRows;
      const _vendor         = vendor;
      const _reqSeries      = req.body.shiplabel_series || '';
      setImmediate(async () => {
        console.log(`[SL setImmediate] starting — ${_labelDocs.length} labels`);
        for (let i = 0; i < _labelDocs.length; i++) {
          const labelDoc = _labelDocs[i];
          const row      = _labelRows[i];
          console.log(`[SL setImmediate] label ${i + 1}/${_labelDocs.length} — docId: ${labelDoc._id}`);
          if (!row) { console.warn(`[SL setImmediate] no row for index ${i}, skipping`); continue; }
          try {
              const payload = {
                label_id:     _vendor.shiplabelServiceId,
                fromName:     row.from_name     || '',
                fromCompany:  row.from_company  || '',
                fromAddress:  row.from_address1 || '',
                fromAddress2: row.from_address2 || '',
                fromZip:      row.from_zip      || '',
                fromState:    row.from_state    || '',
                fromCity:     row.from_city     || '',
                fromCountry:  'US',
                toName:       row.to_name       || '',
                toCompany:    row.to_company    || '',
                toAddress:    row.to_address1   || '',
                toAddress2:   row.to_address2   || '',
                toZip:        row.to_zip        || '',
                toState:      row.to_state      || '',
                toCity:       row.to_city       || '',
                toCountry:    'US',
                weight:       parseFloat(row.weight) || 0,
                length:       parseFloat(row.length) || 0,
                height:       parseFloat(row.height) || 0,
                width:        parseFloat(row.width)  || 0,
                ...(() => {
                  const s = _reqSeries || _vendor.shiplabelLabelSeries || '';
                  const entry = s && _vendor.shiplabelSeries?.length
                    ? _vendor.shiplabelSeries.find(x => x.series === s)
                    : null;
                  const f = entry ? entry.format : (_vendor.shiplabelLabelFormat || '');
                  return { ...(s ? { label_series: s } : {}), ...(f ? { label_format: f } : {}) };
                })(),
              };
              const result = await shiplabel.createOrder(payload, userId);
              if (result.label_created === 'fail') {
                throw new Error('ShipLabel rejected this label — invalid series/format combination for your account');
              }
              // Auto-scan result keys for tracking number and PDF URL
              const keys = Object.keys(result);
              const trackKey = keys.find(k => /track|barcode/i.test(k) && result[k]);
              const pdfKey   = keys.find(k => /^(pdf|label(_url|_pdf)?|label_link|download)$/i.test(k) && result[k]);
              const tid = result.tracking_id || result.tracking_number
                || result.label_tracking_number || result.shipment_tracking
                || result.order_tracking || result.barcode || result.tracking
                || result.track_no || result.trackingNumber || result.trackingId
                || (trackKey ? String(result[trackKey]) : '') || '';
              const pdfUrl = result.pdf || result.label_url || result.label
                || result.pdf_url || result.label_pdf || result.label_link
                || (pdfKey ? String(result[pdfKey]) : '') || null;
              if (!tid) {
                console.warn('[ShipLabel bulk] no tracking found. keys:', keys, '| full result:', JSON.stringify(result));
              }
              await Label.updateOne({ _id: labelDoc._id }, {
                $set: {
                  status:           'generated',
                  trackingId:       tid,
                  pdfUrl,
                  shiplabelOrderId: tid ? String(tid) : String(result.order_id || result.id || ''),
                },
              });
            } catch (err) {
              console.error('[ShipLabel] label failed:', err.message);
              // Refund this label's cost
              try {
                const refundBalance = await Balance.getOrCreateBalance(userId);
                await refundBalance.addTransaction({
                  type:        'adjustment',
                  amount:      labelDoc.price,
                  description: `ShipLabel refund — label failed (${err.message.slice(0, 60)})`,
                  performedBy: userId,
                });
              } catch (refundErr) {
                console.error('[ShipLabel] refund failed:', refundErr.message);
              }
              await Label.updateOne({ _id: labelDoc._id }, { $set: { status: 'failed' } });
            }
        }
        console.log(`[SL setImmediate] all ${_labelDocs.length} labels done`);
      });

      return res.status(202).json({
        type:       'shiplabel-async',
        bulkJobId:  slBulkJobId,
        total:      labelDocs.length,
        newBalance: balance.currentBalance,
      });
    }

    // ── API PATH ──────────────────────────────────────────────
    const mongoose = require('mongoose');
    const bulkJobId   = new mongoose.Types.ObjectId().toString();
    const results     = [];
    const savedLabels = [];

    for (let i = 0; i < labelRows.length; i++) {
      const row = labelRows[i];
      try {
        let shippershubResult = null;
        let trackingId = '';

        if (vendor.source === 'shippershub' && vendor.shippershubCarrierId && vendor.shippershubVendorId) {
          shippershubResult = await shippershub.createSingleLabel({
            carrier:  vendor.shippershubCarrierId,
            vendor:   vendor.shippershubVendorId,
            ...row,
            weight: parseFloat(row.weight)
          }, req.user.tenantId || req.user._id);
          trackingId = shippershubResult?.trackingID || shippershubResult?.trackingId || '';
        }

        const label = await Label.create({
          user:              req.user._id,
          tenantId:          req.user.tenantId || req.user._id,
          vendor:            vendor._id,
          carrier:           vendor.carrier,
          vendorName:        vendor.name,
          shippingService:   vendor.shippingService,
          shippershubLabelId: shippershubResult?._id || null,
          trackingId,
          price:   rowCosts[i],
          pdfUrl:  shippershubResult?.awsPath || null,
          awsKey:  shippershubResult?.awsKey  || null,
          awsPath: shippershubResult?.awsPath || null,
          isBulk:      true,
          bulkJobId,
          bulkFileName,
          ...row,
          weight: parseFloat(row.weight)
        });

        savedLabels.push(label);
        results.push({
          success: true, trackingId, labelId: label._id, cost: rowCosts[i],
          pdfUrl: shippershubResult?.awsPath || null,
          localPdf: shippershubResult?.localPdf || null,
        });
      } catch (err) {
        results.push({ success: false, error: err.message, row });
      }
    }

    // Deduct for successfully generated labels
    const successfulResults = results.filter(r => r.success);
    const totalDeduct = successfulResults.reduce((sum, r) => sum + (r.cost ?? 0), 0);
    const successCount = successfulResults.length;
    if (totalDeduct > 0) {
      await balance.addTransaction({
        type:        'deduction',
        amount:      totalDeduct,
        description: `Bulk labels — ${successfulResults.length}x ${vendor.carrier} ${vendor.name} (job: ${bulkJobId.slice(-6)})`,
        performedBy: req.user._id
      });
    }

    // Build ZIP of all generated PDFs (STORE, no recompression — preserves original bytes)
    let zipUrl = null;
    const localPdfs = successfulResults.map(r => r.localPdf).filter(Boolean);
    if (localPdfs.length > 0) {
      try {
        const zipFilename = `bulk-${bulkJobId.slice(-8)}-${Date.now()}.zip`;
        await createZip(localPdfs, zipFilename);
        zipUrl = `/labels/zip/${zipFilename}`;
        // Stamp the pre-built zip URL on every label in this batch so history can serve it directly
        await Label.updateMany({ bulkJobId }, { bulkZipUrl: zipUrl });
      } catch (zipErr) {
        console.error('ZIP creation error:', zipErr);
      }
    }

    res.status(201).json({
      type:       'api',
      message:    `${successCount}/${labelRows.length} labels generated`,
      bulkJobId,
      results,
      zipUrl,
      newBalance: balance.currentBalance
    });

  } catch (error) {
    console.error('Bulk label error:', error);
    res.status(500).json({ message: error.message || 'Server error generating bulk labels' });
  }
});

// ── GET /api/labels ───────────────────────────────────────────
// Paginated label history for the authenticated user
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { carrier, status, dateFrom, dateTo } = req.query;
    const page  = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(parseInt(req.query.limit) || 15, PAGE_LIMIT_MAX);

    // Validate vendor ID before passing to MongoDB
    const vendorParam = req.query.vendor;
    if (vendorParam && !isValidObjectId(vendorParam)) {
      return res.status(400).json({ message: 'Invalid vendor ID' });
    }

    // This endpoint serves the single-label history only
    let filter = { isBulk: false };
    if (req.user.role !== 'admin') {
      filter.user = req.user._id;
    }
    if (carrier)     filter.carrier = carrier;
    if (status)      filter.status  = status;
    if (vendorParam) filter.vendor  = vendorParam;
    if (dateFrom || dateTo) {
      filter.createdAt = {};
      if (dateFrom) filter.createdAt.$gte = new Date(dateFrom);
      if (dateTo)   filter.createdAt.$lte = new Date(new Date(dateTo).setHours(23, 59, 59, 999));
    }

    const total  = await Label.countDocuments(filter);
    const labels = await Label.find(filter)
      .populate('user', 'firstName lastName email')
      .populate('vendor', 'name carrier rate')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    res.json({
      labels,
      total,
      totalPages:  Math.ceil(total / limit),
      currentPage: page
    });
  } catch (error) {
    console.error('Get labels error:', error);
    res.status(500).json({ message: 'Server error getting labels' });
  }
});

// ── GET /api/labels/bulk-jobs ─────────────────────────────────
// Returns bulk jobs grouped by bulkJobId with aggregated totals
router.get('/bulk-jobs', authenticateToken, async (req, res) => {
  try {
    const { dateFrom, dateTo, carrier, portal } = req.query;
    const page  = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(parseInt(req.query.limit) || 15, PAGE_LIMIT_MAX);
    const skip  = (page - 1) * limit;
    const mongoose = require('mongoose');

    // Validate vendor IDs
    const vid = req.query.vendorId || req.query.vendor;
    if (vid && !isValidObjectId(vid)) {
      return res.status(400).json({ message: 'Invalid vendor ID' });
    }

    // Escape search string to prevent ReDoS
    const rawSearch = req.query.search;
    const search = rawSearch && rawSearch.length <= 100 ? escapeRegex(rawSearch) : null;

    // Portal filter: pre-fetch vendor IDs that belong to the requested portal
    let portalVendorIds = null;
    if (portal && portal !== 'all') {
      const pv = await Vendor.find({ source: portal }).select('_id').lean();
      portalVendorIds = pv.map(v => v._id);
    }

    const matchStage = { isBulk: true };
    if (req.user.role !== 'admin') matchStage.user = new mongoose.Types.ObjectId(req.user._id);
    if (vid)              matchStage.vendor       = new mongoose.Types.ObjectId(vid);
    else if (portalVendorIds) matchStage.vendor   = { $in: portalVendorIds };
    if (carrier) matchStage.carrier      = carrier;
    if (search)  matchStage.bulkFileName = { $regex: search, $options: 'i' };
    if (dateFrom || dateTo) {
      matchStage.createdAt = {};
      if (dateFrom) matchStage.createdAt.$gte = new Date(dateFrom);
      if (dateTo)   matchStage.createdAt.$lte = new Date(new Date(dateTo).setHours(23, 59, 59, 999));
    }

    const groupStage = {
      _id:           '$bulkJobId',
      userId:        { $first: '$user' },
      vendorId:      { $first: '$vendor' },
      vendorName:    { $first: '$vendorName' },
      carrier:       { $first: '$carrier' },
      bulkFileName:  { $first: '$bulkFileName' },
      bulkZipUrl:    { $first: '$bulkZipUrl' },
      totalLabels:   { $sum: 1 },
      totalPrice:    { $sum: '$price' },
      generatedCount:{ $sum: { $cond: [{ $eq: ['$status', 'generated'] }, 1, 0] } },
      failedCount:   { $sum: { $cond: [{ $eq: ['$status', 'failed']    }, 1, 0] } },
      trackingIds:   { $push: '$trackingId' },
      createdAt:     { $min: '$createdAt' },
    };

    const [jobs, countResult] = await Promise.all([
      Label.aggregate([
        { $match: matchStage },
        { $group: groupStage },
        { $sort: { createdAt: -1 } },
        { $skip: skip },
        { $limit: limit },
        { $lookup: { from: 'users',   localField: 'userId',   foreignField: '_id', as: 'user' } },
        { $unwind: { path: '$user', preserveNullAndEmptyArrays: true } },
        // Lookup vendor to attach portal/source
        { $lookup: { from: 'vendors', localField: 'vendorId', foreignField: '_id', as: '_v' } },
        { $addFields: { portal: { $ifNull: [{ $arrayElemAt: ['$_v.source', 0] }, 'shippershub'] } } },
        { $project: { _v: 0 } },
      ]),
      Label.aggregate([
        { $match: matchStage },
        { $group: { _id: '$bulkJobId' } },
        { $count: 'total' },
      ]),
    ]);

    const total = countResult[0]?.total ?? 0;

    res.json({
      jobs,
      total,
      totalPages:  Math.ceil(total / limit),
      currentPage: page,
    });
  } catch (error) {
    console.error('Get bulk jobs error:', error);
    res.status(500).json({ message: 'Server error getting bulk jobs' });
  }
});

// ── GET /api/labels/cc-all  (Command Center — admin only) ────
// All labels (single + bulk) with full filtering for the tracking command center
router.get('/cc-all', authenticateToken, authorizeCC, async (req, res) => {
  try {
    const { trackingStatus, carrier, vendorId, userId, dateFrom, dateTo, search } = req.query;
    const page  = Math.max(1, parseInt(req.query.page)  || 1);
    const limit = Math.min(parseInt(req.query.limit) || 35, PAGE_LIMIT_MAX);

    const filter = {};
    if (carrier) filter.carrier = carrier;
    if (trackingStatus) {
      const statuses = String(trackingStatus).split(',').map(s => s.trim()).filter(Boolean);
      filter.trackingStatus = statuses.length === 1 ? statuses[0] : { $in: statuses };
    }
    if (vendorId && isValidObjectId(vendorId)) filter.vendor    = vendorId;
    if (userId   && isValidObjectId(userId))   filter.user      = userId;
    if (dateFrom || dateTo) {
      filter.createdAt = {};
      if (dateFrom) filter.createdAt.$gte = new Date(dateFrom);
      if (dateTo)   filter.createdAt.$lte = new Date(new Date(dateTo).setHours(23, 59, 59, 999));
    }
    if (search && search.length <= 200) {
      const escaped = escapeRegex(search);
      filter.$or = [
        { trackingId: { $regex: escaped, $options: 'i' } },
        { from_name:  { $regex: escaped, $options: 'i' } },
        { to_name:    { $regex: escaped, $options: 'i' } },
        { to_city:    { $regex: escaped, $options: 'i' } },
      ];
    }

    const total  = await Label.countDocuments(filter);
    const labels = await Label.find(filter)
      .populate('user',   'firstName lastName email')
      .populate('vendor', 'name carrier rate source')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    res.json({ labels, total, totalPages: Math.ceil(total / limit), currentPage: page });
  } catch (err) {
    console.error('CC all labels error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ── GET /api/labels/tracking-ids  (Command Center — admin only) ──
// Returns just tracking ID strings for all labels matching current filters (no pagination)
router.get('/tracking-ids', authenticateToken, authorizeCC, async (req, res) => {
  try {
    const { trackingStatus, carrier, vendorId, userId, dateFrom, dateTo, search } = req.query;
    const filter = { trackingId: { $exists: true, $ne: '' } };
    if (carrier) filter.carrier = carrier;
    if (trackingStatus) {
      const statuses = String(trackingStatus).split(',').map(s => s.trim()).filter(Boolean);
      filter.trackingStatus = statuses.length === 1 ? statuses[0] : { $in: statuses };
    }
    if (vendorId && isValidObjectId(vendorId)) filter.vendor        = vendorId;
    if (userId   && isValidObjectId(userId))   filter.user          = userId;
    if (dateFrom || dateTo) {
      filter.createdAt = {};
      if (dateFrom) filter.createdAt.$gte = new Date(dateFrom);
      if (dateTo)   filter.createdAt.$lte = new Date(new Date(dateTo).setHours(23, 59, 59, 999));
    }
    if (search && search.length <= 200) {
      const escaped = escapeRegex(search);
      filter.$or = [
        { trackingId: { $regex: escaped, $options: 'i' } },
        { from_name:  { $regex: escaped, $options: 'i' } },
        { to_name:    { $regex: escaped, $options: 'i' } },
        { to_city:    { $regex: escaped, $options: 'i' } },
      ];
    }
    const labels = await Label.find(filter).select('trackingId').sort({ createdAt: -1 }).lean();
    const ids = labels.map(l => l.trackingId).filter(Boolean);
    res.json({ ids, total: ids.length });
  } catch (err) {
    console.error('Tracking IDs error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ── GET /api/labels/vendor-stats  (Command Center — admin only) ──
// Aggregated delivery stats per vendor name
router.get('/vendor-stats', authenticateToken, authorizeCC, async (req, res) => {
  try {
    const { dateFrom, dateTo } = req.query;
    const matchStage = {};
    if (dateFrom || dateTo) {
      matchStage.createdAt = {};
      if (dateFrom) matchStage.createdAt.$gte = new Date(dateFrom);
      if (dateTo)   matchStage.createdAt.$lte = new Date(new Date(dateTo).setHours(23, 59, 59, 999));
    }

    const pipeline = [
      ...(Object.keys(matchStage).length ? [{ $match: matchStage }] : []),
      {
        $lookup: {
          from: 'vendors', localField: 'vendor', foreignField: '_id', as: '_v',
        },
      },
      {
        $addFields: {
          portalSource: { $ifNull: [{ $arrayElemAt: ['$_v.source', 0] }, 'shippershub'] },
        },
      },
      {
        $group: {
          _id:               '$vendorName',
          carrier:           { $first: '$carrier' },
          portal:            { $first: '$portalSource' },
          total:             { $sum: 1 },
          delivered:         { $sum: { $cond: [{ $eq: ['$trackingStatus', 'delivered'] },          1, 0] } },
          in_transit:        { $sum: { $cond: [{ $eq: ['$trackingStatus', 'in_transit'] },         1, 0] } },
          out_for_delivery:  { $sum: { $cond: [{ $eq: ['$trackingStatus', 'out_for_delivery'] },   1, 0] } },
          exception_problem: { $sum: { $cond: [{ $eq: ['$trackingStatus', 'exception_problem'] },  1, 0] } },
          returned_to_sender:{ $sum: { $cond: [{ $eq: ['$trackingStatus', 'returned_to_sender'] }, 1, 0] } },
          pending_pickup:    { $sum: { $cond: [{ $eq: ['$trackingStatus', 'pending_pickup'] },     1, 0] } },
          delayed:           { $sum: { $cond: [{ $eq: ['$trackingStatus', 'delayed'] },            1, 0] } },
          not_scanned_yet:   { $sum: { $cond: [{ $in:  ['$trackingStatus', ['not_scanned_yet', null]] }, 1, 0] } },
          voided:            { $sum: { $cond: [{ $eq: ['$trackingStatus', 'voided'] },             1, 0] } },
        },
      },
      { $sort: { total: -1 } },
    ];

    const vendors = await Label.aggregate(pipeline);
    res.json({ vendors });
  } catch (err) {
    console.error('Vendor stats error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ── GET /api/labels/daily-stats  (Command Center — admin only) ───
// Labels grouped by creation date with tracking status breakdown
router.get('/daily-stats', authenticateToken, authorizeCC, async (req, res) => {
  try {
    const { dateFrom, dateTo } = req.query;
    const matchStage = {};
    if (dateFrom || dateTo) {
      matchStage.createdAt = {};
      if (dateFrom) matchStage.createdAt.$gte = new Date(dateFrom);
      if (dateTo)   matchStage.createdAt.$lte = new Date(new Date(dateTo).setHours(23, 59, 59, 999));
    }

    const pipeline = [
      ...(Object.keys(matchStage).length ? [{ $match: matchStage }] : []),
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          total:             { $sum: 1 },
          delivered:         { $sum: { $cond: [{ $eq: ['$trackingStatus', 'delivered'] },          1, 0] } },
          in_transit:        { $sum: { $cond: [{ $eq: ['$trackingStatus', 'in_transit'] },         1, 0] } },
          out_for_delivery:  { $sum: { $cond: [{ $eq: ['$trackingStatus', 'out_for_delivery'] },   1, 0] } },
          exception_problem: { $sum: { $cond: [{ $eq: ['$trackingStatus', 'exception_problem'] },  1, 0] } },
          returned_to_sender:{ $sum: { $cond: [{ $eq: ['$trackingStatus', 'returned_to_sender'] }, 1, 0] } },
          not_scanned_yet:   { $sum: { $cond: [{ $in:  ['$trackingStatus', ['not_scanned_yet', null]] }, 1, 0] } },
          voided:            { $sum: { $cond: [{ $eq: ['$trackingStatus', 'voided'] },             1, 0] } },
        },
      },
      { $sort: { _id: -1 } },
      { $limit: 90 },
    ];

    const days = await Label.aggregate(pipeline);
    res.json({ days });
  } catch (err) {
    console.error('Daily stats error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ── GET /api/labels/user-stats-bulk  (Command Center — admin only) ────
// One aggregation across all labels grouped by user — used by CCUsers table
router.get('/user-stats-bulk', authenticateToken, authorizeCC, async (req, res) => {
  try {
    const { dateFrom, dateTo } = req.query;
    const matchStage = {};
    if (dateFrom || dateTo) {
      matchStage.createdAt = {};
      if (dateFrom) matchStage.createdAt.$gte = new Date(dateFrom);
      if (dateTo)   matchStage.createdAt.$lte = new Date(new Date(dateTo).setHours(23, 59, 59, 999));
    }

    const pipeline = [
      ...(Object.keys(matchStage).length ? [{ $match: matchStage }] : []),
      {
        $group: {
          _id:               '$user',
          total:             { $sum: 1 },
          delivered:         { $sum: { $cond: [{ $eq: ['$trackingStatus', 'delivered'] },         1, 0] } },
          in_transit:        { $sum: { $cond: [{ $eq: ['$trackingStatus', 'in_transit'] },        1, 0] } },
          exception_problem: { $sum: { $cond: [{ $eq: ['$trackingStatus', 'exception_problem'] }, 1, 0] } },
          not_scanned_yet:   { $sum: { $cond: [{ $in: ['$trackingStatus', ['not_scanned_yet', null]] }, 1, 0] } },
          voided:            { $sum: { $cond: [{ $eq: ['$trackingStatus', 'voided'] },            1, 0] } },
          spent:             { $sum: '$price' },
        },
      },
    ];

    const rows = await Label.aggregate(pipeline);
    const statsMap = {};
    for (const row of rows) {
      if (row._id) statsMap[row._id.toString()] = {
        total: row.total, delivered: row.delivered, in_transit: row.in_transit,
        exception_problem: row.exception_problem, not_scanned_yet: row.not_scanned_yet,
        voided: row.voided, spent: row.spent,
      };
    }
    res.json({ statsMap });
  } catch (err) {
    console.error('User stats bulk error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ── GET /api/labels/user-stats-bulk-reseller ──────────────────
// Reseller: label stats scoped to their own clients only
router.get('/user-stats-bulk-reseller', authenticateToken, authorize('admin', 'reseller'), async (req, res) => {
  try {
    const { dateFrom, dateTo } = req.query;

    const me = await User.findById(req.user._id).select('clients');
    const clientIds = me?.clients || [];
    if (!clientIds.length) return res.json({ statsMap: {} });

    const matchStage = { user: { $in: clientIds } };
    if (dateFrom || dateTo) {
      matchStage.createdAt = {};
      if (dateFrom) matchStage.createdAt.$gte = new Date(dateFrom);
      if (dateTo)   matchStage.createdAt.$lte = new Date(new Date(dateTo).setHours(23, 59, 59, 999));
    }

    const rows = await Label.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id:               '$user',
          total:             { $sum: 1 },
          delivered:         { $sum: { $cond: [{ $eq: ['$trackingStatus', 'delivered'] },         1, 0] } },
          in_transit:        { $sum: { $cond: [{ $eq: ['$trackingStatus', 'in_transit'] },        1, 0] } },
          exception_problem: { $sum: { $cond: [{ $eq: ['$trackingStatus', 'exception_problem'] }, 1, 0] } },
          not_scanned_yet:   { $sum: { $cond: [{ $in: ['$trackingStatus', ['not_scanned_yet', null]] }, 1, 0] } },
          voided:            { $sum: { $cond: [{ $eq: ['$trackingStatus', 'voided'] },            1, 0] } },
          spent:             { $sum: '$price' },
        },
      },
    ]);

    const statsMap = {};
    for (const row of rows) {
      if (row._id) statsMap[row._id.toString()] = {
        total: row.total, delivered: row.delivered, in_transit: row.in_transit,
        exception_problem: row.exception_problem, not_scanned_yet: row.not_scanned_yet,
        voided: row.voided, spent: row.spent,
      };
    }
    res.json({ statsMap });
  } catch (err) {
    console.error('Reseller user stats bulk error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ── GET /api/labels/pdf/:filename ─────────────────────────────
// Serve a locally saved label PDF (authenticated)
router.get('/pdf/:filename', authenticateToken, (req, res) => {
  const filename = path.basename(req.params.filename);
  const filePath = path.join(labelsDir, filename);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ message: 'PDF not found' });
  }
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  fs.createReadStream(filePath).pipe(res);
});

// ── GET /api/labels/:id/pdf  ──────────────────────────────────
// ── Admin: update tracking status on a label ──────────────────────────────────
const VALID_TRACKING_STATUSES = [
  'not_scanned_yet', 'in_transit', 'out_for_delivery', 'delivered',
  'exception_problem', 'returned_to_sender', 'pending_pickup', 'delayed', 'voided',
];

// Normalize various ChatGPT / user-supplied formats to canonical DB keys
function normalizeTrackingStatus(raw) {
  const s = (raw || '').trim().toLowerCase().replace(/[\s\-\/]+/g, '_');
  const MAP = {
    'not_scanned_yet': 'not_scanned_yet', 'not_scanned': 'not_scanned_yet',
    'in_transit': 'in_transit', 'intransit': 'in_transit',
    'out_for_delivery': 'out_for_delivery', 'outfordelivery': 'out_for_delivery',
    'delivered': 'delivered',
    'exception_problem': 'exception_problem', 'exception': 'exception_problem',
    'exception___problem': 'exception_problem',
    'returned_to_sender': 'returned_to_sender', 'return_to_sender': 'returned_to_sender',
    'returnedtosender': 'returned_to_sender',
    'pending_pickup': 'pending_pickup', 'pendingpickup': 'pending_pickup',
    'delayed': 'delayed',
    'voided': 'voided', 'void': 'voided',
  };
  return MAP[s] || null;
}

router.patch('/:id/tracking-status', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ message: 'Forbidden' });
    const { trackingStatus, note } = req.body;
    if (!VALID_TRACKING_STATUSES.includes(trackingStatus)) {
      return res.status(400).json({ message: 'Invalid tracking status' });
    }
    const historyEntry = {
      status:    trackingStatus,
      note:      (note || '').trim().slice(0, 500),
      updatedAt: new Date(),
      updatedBy: req.user._id,
    };
    const label = await Label.findByIdAndUpdate(
      req.params.id,
      {
        $set:  { trackingStatus },
        $push: { trackingStatusHistory: { $each: [historyEntry], $position: 0 } },
      },
      { new: true, select: 'trackingStatus trackingStatusHistory' }
    );
    if (!label) return res.status(404).json({ message: 'Label not found' });
    res.json({ trackingStatus: label.trackingStatus, trackingStatusHistory: label.trackingStatusHistory });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error updating tracking status' });
  }
});

// ── User: mark own label as Voided ────────────────────────────────────────────
router.patch('/:id/void', authenticateToken, async (req, res) => {
  try {
    const label = await Label.findById(req.params.id).select('user trackingStatus');
    if (!label) return res.status(404).json({ message: 'Label not found' });
    const isOwner = label.user.toString() === req.user._id.toString();
    if (!isOwner && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'You can only void your own labels' });
    }
    if (label.trackingStatus === 'voided') {
      return res.status(400).json({ message: 'Label is already voided' });
    }
    const historyEntry = {
      status:    'voided',
      note:      'Marked as voided by user',
      updatedAt: new Date(),
      updatedBy: req.user._id,
    };
    const updated = await Label.findByIdAndUpdate(
      req.params.id,
      {
        $set:  { trackingStatus: 'voided' },
        $push: { trackingStatusHistory: { $each: [historyEntry], $position: 0 } },
      },
      { new: true, select: 'trackingStatus trackingStatusHistory' }
    );
    res.json({ trackingStatus: updated.trackingStatus, trackingStatusHistory: updated.trackingStatusHistory });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error voiding label' });
  }
});

// ── Admin: bulk update tracking status by tracking ID ─────────────────────────
router.post('/bulk-status-by-tracking', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ message: 'Forbidden' });
    const { updates } = req.body; // [{ trackingId, status }]
    if (!Array.isArray(updates) || updates.length === 0) {
      return res.status(400).json({ message: 'updates must be a non-empty array' });
    }
    if (updates.length > 5000) {
      return res.status(400).json({ message: 'Too many updates — max 5000 per batch' });
    }

    const historyEntry = (status) => ({
      status,
      note: 'AI bulk update',
      updatedAt: new Date(),
      updatedBy: req.user._id,
    });

    // Normalize + group by canonical status
    const grouped = {};   // { status -> [trackingId] }
    const invalidIds = [];

    for (const { tracking, trackingId: tid, status } of updates) {
      const trackingId = tracking || tid;
      if (!trackingId) continue;
      const normalized = normalizeTrackingStatus(status);
      if (!normalized) { invalidIds.push(trackingId); continue; }
      if (!grouped[normalized]) grouped[normalized] = [];
      grouped[normalized].push(trackingId.trim());
    }

    const allTrackingIds = Object.values(grouped).flat();

    // Fetch existing labels to detect "already same" and "not found"
    const existing = await Label.find({ trackingId: { $in: allTrackingIds } })
      .select('trackingId trackingStatus').lean();
    const existingMap = Object.fromEntries(existing.map(l => [l.trackingId, l.trackingStatus]));

    let updated = 0;
    let alreadySame = 0;

    for (const [status, ids] of Object.entries(grouped)) {
      const toUpdate = ids.filter(id => id in existingMap && existingMap[id] !== status);
      alreadySame  += ids.filter(id => id in existingMap && existingMap[id] === status).length;
      if (toUpdate.length === 0) continue;
      await Label.updateMany(
        { trackingId: { $in: toUpdate } },
        {
          $set:  { trackingStatus: status },
          $push: { trackingStatusHistory: { $each: [historyEntry(status)], $position: 0 } },
        }
      );
      updated += toUpdate.length;
    }

    const notFound = allTrackingIds.filter(id => !(id in existingMap));

    res.json({ updated, alreadySame, notFound, invalid: invalidIds });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error in bulk status update' });
  }
});

// Proxy-serve a label PDF by label ID.
// Works for both S3 / external URLs and locally stored files.
// Accepts ?inline=1 to open in browser instead of downloading.
router.get('/:id/pdf', authenticateToken, async (req, res) => {
  try {
    const label = await Label.findById(req.params.id).select('user pdfUrl awsPath trackingId');
    if (!label) return res.status(404).json({ message: 'Label not found' });

    // Only the label owner or admin can access
    if (req.user.role !== 'admin' && label.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const src = label.pdfUrl || label.awsPath;
    if (!src) return res.status(404).json({ message: 'No PDF available for this label' });

    const safeName  = `label-${label.trackingId || label._id}.pdf`;
    const inline    = req.query.inline === '1';
    const disp      = inline ? 'inline' : 'attachment';

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `${disp}; filename="${safeName}"`);

    // External URL (S3 / ShippersHub CDN / ShipLabel CDN / LabelCrow) — fetch server-side and pipe back
    if (src.startsWith('http://') || src.startsWith('https://')) {
      const mod = src.startsWith('https') ? https : http;
      let reqH = slAuthHeaders(src);
      if (src.includes('labelcrow.com')) {
        try {
          const labelcrow = require('../services/labelcrow');
          const lcKey = await labelcrow.getApiKey(req.user.tenantId || req.user._id);
          reqH = { Authorization: `Bearer ${lcKey}` };
          console.log('[PDF proxy] LabelCrow auth header set for', src);
        } catch (lcKeyErr) {
          console.error('[PDF proxy] Failed to get LabelCrow key:', lcKeyErr.message);
          return res.status(502).json({ message: 'LabelCrow API key not configured — add it in Admin → Settings.' });
        }
      }
      let u;
      try { u = new URL(src); } catch { return res.status(400).json({ message: 'Invalid PDF URL' }); }
      const opts = {
        hostname: u.hostname,
        port:     u.port || (u.protocol === 'https:' ? 443 : 80),
        path:     u.pathname + u.search,
        headers:  reqH,
      };
      mod.get(opts, (upstream) => {
        if (upstream.statusCode >= 300 && upstream.statusCode < 400 && upstream.headers.location) {
          upstream.resume();
          const loc = upstream.headers.location;
          const mod2 = loc.startsWith('https') ? https : http;
          let u2;
          try { u2 = new URL(loc); } catch { return res.status(502).end(); }
          mod2.get({ hostname: u2.hostname, port: u2.port || (u2.protocol === 'https:' ? 443 : 80), path: u2.pathname + u2.search, headers: reqH }, (up2) => {
            if (up2.statusCode !== 200) { up2.resume(); return res.status(502).end('Could not fetch PDF'); }
            const ct2 = up2.headers['content-type'] || '';
            if (ct2 && !ct2.includes('pdf') && !ct2.includes('octet-stream')) {
              up2.resume();
              console.warn(`[PDF proxy] redirect returned content-type "${ct2}" for ${loc}`);
              return res.status(502).json({ message: 'Remote file is not a PDF' });
            }
            up2.pipe(res);
          }).on('error', () => res.status(502).json({ message: 'Could not fetch PDF' }));
          return;
        }
        if (upstream.statusCode !== 200) {
          upstream.resume();
          return res.status(502).end('Could not fetch PDF from storage');
        }
        const ct = upstream.headers['content-type'] || '';
        if (ct && !ct.includes('pdf') && !ct.includes('octet-stream')) {
          upstream.resume();
          console.warn(`[PDF proxy] content-type "${ct}" for ${src}`);
          return res.status(502).json({ message: 'Remote file is not a PDF — ShipLabel may require re-generation' });
        }
        upstream.pipe(res);
      }).on('error', () => res.status(502).json({ message: 'Could not fetch PDF from storage' }));
      return;
    }

    // Local file — strip any path prefix, look in labelsDir
    const localPath = path.join(labelsDir, path.basename(src));
    if (!fs.existsSync(localPath)) {
      return res.status(404).json({ message: 'PDF file not found on server' });
    }
    fs.createReadStream(localPath).pipe(res);

  } catch (err) {
    console.error('Label PDF proxy error:', err);
    res.status(500).json({ message: 'Error serving PDF' });
  }
});

// ── POST /api/labels/zip/multi-jobs ──────────────────────────
// Combined ZIP for auto-vendor bulk mode — takes multiple bulkJobIds,
// finds their pre-built ZIPs (or falls back to local PDFs), streams one combined ZIP.
router.post('/zip/multi-jobs', authenticateToken, async (req, res) => {
  try {
    const { bulkJobIds } = req.body;
    if (!Array.isArray(bulkJobIds) || bulkJobIds.length === 0) {
      return res.status(400).json({ message: 'bulkJobIds array required' });
    }
    console.log('[multi-jobs ZIP] bulkJobIds:', bulkJobIds);

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', 'attachment; filename="bulk-labels-combined.zip"');

    const archive = archiver('zip', { zlib: { level: 0 } });
    archive.on('error', err => { console.error('[multi-jobs ZIP] archive error:', err); if (!res.headersSent) res.end(); });
    archive.pipe(res);

    let fileCount = 0;

    for (const bulkJobId of bulkJobIds) {
      if (!bulkJobId) continue;
      const filter = { bulkJobId, isBulk: true };
      if (req.user.role !== 'admin') filter.user = req.user._id;

      const labels = await Label.find(filter).sort({ createdAt: 1 }).lean();
      console.log(`[multi-jobs ZIP] job ${bulkJobId}: ${labels.length} labels`);

      // Prefer the pre-built ZIP stamped on the labels
      const prebuiltUrl = labels[0]?.bulkZipUrl;
      if (prebuiltUrl) {
        const prebuiltPath = path.join(zipsDir, path.basename(prebuiltUrl));
        if (fs.existsSync(prebuiltPath)) {
          console.log(`[multi-jobs ZIP] serving pre-built ZIP: ${prebuiltPath}`);
          // Re-add individual PDFs from the pre-built ZIP isn't possible without unzipper,
          // so fall through to local PDF approach
        }
      }

      // Add individual PDFs — handles both local files and remote URLs (e.g. ShipLabel CDN)
      for (const label of labels) {
        if (!label.pdfUrl) {
          console.log(`[multi-jobs ZIP] label ${label._id} has no pdfUrl — skipping`);
          continue;
        }
        if (/^https?:\/\//i.test(label.pdfUrl)) {
          try {
            const buf = await fetchRemotePdf(label.pdfUrl, slAuthHeaders(label.pdfUrl));
            fileCount++;
            const name = `${String(fileCount).padStart(4, '0')}-${label.trackingId || label._id}.pdf`;
            archive.append(buf, { name });
          } catch (fetchErr) {
            console.error(`[multi-jobs ZIP] failed to fetch ${label.pdfUrl}:`, fetchErr.message);
          }
        } else {
          const filename  = path.basename(label.pdfUrl);
          const localPath = path.join(labelsDir, filename);
          if (fs.existsSync(localPath)) {
            fileCount++;
            const name = `${String(fileCount).padStart(4, '0')}-${label.trackingId || filename}`;
            archive.file(localPath, { name: name.endsWith('.pdf') ? name : name + '.pdf' });
          }
        }
      }
    }

    console.log(`[multi-jobs ZIP] finalizing with ${fileCount} files`);
    await archive.finalize();
  } catch (error) {
    console.error('[multi-jobs ZIP] error:', error);
    if (!res.headersSent) res.status(500).json({ message: 'Failed to build combined ZIP' });
  }
});

// ── GET /api/labels/zip/:filename ─────────────────────────────
// Download a pre-built bulk labels ZIP
router.get('/zip/:filename', authenticateToken, (req, res) => {
  const filename = path.basename(req.params.filename);
  const filePath = path.join(zipsDir, filename);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ message: 'ZIP not found' });
  }
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  fs.createReadStream(filePath).pipe(res);
});

// ── GET /api/labels/zip/bulk/:bulkJobId ───────────────────────
// Serve the pre-built ZIP if it exists, otherwise build on-the-fly from local PDFs.
// Uses STORE (level 0) — no recompression, PDF bytes remain identical to originals.
router.get('/zip/bulk/:bulkJobId', authenticateToken, async (req, res) => {
  try {
    const { bulkJobId } = req.params;
    console.log(`[ZIP /zip/bulk/:id] request — bulkJobId: ${bulkJobId} | user: ${req.user?._id}`);
    const filter = { bulkJobId, isBulk: true };
    if (req.user.role !== 'admin') filter.user = req.user._id;

    const labels = await Label.find(filter);
    console.log(`[ZIP /zip/bulk/:id] found ${labels.length} labels — pdfUrls: ${labels.map(l => l.pdfUrl || 'null').join(', ')}`);
    if (!labels.length) return res.status(404).json({ message: 'No labels found for this bulk job' });

    const storedName = labels[0]?.bulkFileName;
    const zipName = storedName
      ? storedName.replace(/\.(xlsx?|csv)$/i, '.zip')
      : `bulk-labels-${bulkJobId.slice(-8)}.zip`;

    // ── Prefer the pre-built ZIP stamped on the labels ────────
    const prebuiltUrl = labels[0]?.bulkZipUrl; // e.g. /api/labels/zip/bulk-xxxx.zip
    if (prebuiltUrl) {
      const prebuiltFilename = path.basename(prebuiltUrl);
      const prebuiltPath     = path.join(zipsDir, prebuiltFilename);
      if (fs.existsSync(prebuiltPath)) {
        res.setHeader('Content-Type', 'application/zip');
        res.setHeader('Content-Disposition', `attachment; filename="${zipName}"`);
        return fs.createReadStream(prebuiltPath).pipe(res);
      }
    }

    // ── Fallback: build on-the-fly (local files or remote URLs) ──
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${zipName}"`);

    const archive = archiver('zip', { zlib: { level: 0 } }); // STORE — no recompression
    archive.on('error', err => { console.error('ZIP stream error:', err); res.end(); });
    archive.pipe(res);

    for (let i = 0; i < labels.length; i++) {
      const label = labels[i];
      if (!label.pdfUrl) continue;
      const entry = `label-${i + 1}${label.trackingId ? '-' + label.trackingId : ''}.pdf`;
      if (/^https?:\/\//i.test(label.pdfUrl)) {
        // Remote URL (e.g. ShipLabel CDN) — fetch with auth if needed and stream into archive
        try {
          const buf = await fetchRemotePdf(label.pdfUrl, slAuthHeaders(label.pdfUrl));
          archive.append(buf, { name: entry });
        } catch (fetchErr) {
          console.error(`[ZIP] Failed to fetch remote PDF for label ${i + 1}:`, fetchErr.message);
        }
      } else {
        // Local file
        const localPath = path.join(labelsDir, path.basename(label.pdfUrl));
        if (fs.existsSync(localPath)) {
          archive.file(localPath, { name: entry });
        }
      }
    }

    await archive.finalize();
  } catch (error) {
    console.error('Bulk ZIP error:', error);
    if (!res.headersSent) res.status(500).json({ message: 'Failed to build ZIP' });
  }
});

// ── GET /api/labels/labelcrow-job/:jobId ─────────────────────
// Poll Label Crow job status. On completion, updates our Label records.
router.get('/labelcrow-job/:jobId', authenticateToken, async (req, res) => {
  try {
    const labelcrow = require('../services/labelcrow');
    const { jobId } = req.params;

    const sample = await Label.findOne({
      labelcrowJobId: jobId,
      ...(req.user.role !== 'admin' ? { user: req.user._id } : {}),
    }).select('labelcrowOrderId user');

    if (!sample) {
      console.warn('[LC Poll Route] Job not found or access denied:', { jobId, userId: req.user._id });
      return res.status(404).json({ message: 'Job not found or access denied' });
    }

    const progress = await labelcrow.pollJob(jobId, req.user.tenantId || req.user._id);
    const orderId  = sample.labelcrowOrderId;

    console.log('[LC Poll Route]', { jobId, status: progress.status, generated: progress.generated, failed: progress.failed, total: progress.total, orderId });

    if (progress.status === 'completed' || progress.status === 'failed') {
      // A "completed" job where all labels failed is effectively failed
      const allFailed  = progress.failed > 0 && progress.failed >= progress.total;
      const newStatus  = (progress.status === 'completed' && !allFailed) ? 'generated' : 'failed';
      const hasSuccess = progress.generated > progress.failed;
      const zipUrl     = hasSuccess && orderId
        ? `/labels/labelcrow-order/${orderId}/zip`
        : null;

      console.log(`[LC Poll Route] Job ${progress.status.toUpperCase()} — allFailed:${allFailed} | newStatus:${newStatus} | zipUrl:${zipUrl || 'none'}`);

      await Label.updateMany(
        { labelcrowJobId: jobId },
        { $set: { status: newStatus, ...(zipUrl ? { bulkZipUrl: zipUrl } : {}) } }
      );

      const balance = await Balance.getOrCreateBalance(sample.user);
      return res.json({ ...progress, orderId, zipUrl, newBalance: balance.currentBalance });
    }

    return res.json(progress);
  } catch (err) {
    console.error('[LC Poll Route] ERROR:', err.message, err.stack?.split('\n').slice(0, 3).join(' | '));
    res.status(500).json({ message: err.message || 'Polling error' });
  }
});

// ── GET /api/labels/labelcrow-order/:orderId/zip ──────────────
// Proxy-stream the Label Crow order ZIP to the authenticated user.
router.get('/labelcrow-order/:orderId/zip', authenticateToken, async (req, res) => {
  try {
    const labelcrow = require('../services/labelcrow');
    const { orderId } = req.params;

    const owns = await Label.findOne({
      labelcrowOrderId: orderId,
      ...(req.user.role !== 'admin' ? { user: req.user._id } : {}),
    }).select('_id');
    if (!owns) return res.status(404).json({ message: 'Order not found or access denied' });

    const { buffer, statusCode } = await labelcrow.downloadOrderZip(orderId, req.user.tenantId || req.user._id);
    if (statusCode < 200 || statusCode >= 300) {
      return res.status(502).json({ message: 'Failed to fetch ZIP from Label Crow' });
    }

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="labelcrow-order-${orderId}.zip"`);
    res.send(buffer);
  } catch (err) {
    console.error('[LC zip]', err);
    res.status(500).json({ message: err.message || 'Download error' });
  }
});

// ── GET /api/labels/bulk-detail/:bulkJobId ────────────────────
// Per-label detail for a bulk job (used by history page drawer)
router.get('/bulk-detail/:bulkJobId', authenticateToken, async (req, res) => {
  try {
    const filter = { bulkJobId: req.params.bulkJobId, isBulk: true };
    if (req.user.role !== 'admin') filter.user = req.user._id;
    const labels = await Label.find(filter)
      .select('_id trackingId pdfUrl status from_name to_name to_city to_state to_zip weight price createdAt')
      .sort({ createdAt: 1 })
      .lean();
    res.json({ labels });
  } catch (err) {
    console.error('Bulk detail error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ── GET /api/labels/:id ───────────────────────────────────────
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const label = await Label.findById(req.params.id)
      .populate('user', 'firstName lastName email')
      .populate('vendor');

    if (!label) return res.status(404).json({ message: 'Label not found' });

    const isOwner = label.user._id.toString() === req.user._id.toString();
    if (!isOwner && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Access denied' });
    }

    res.json({ label });
  } catch (error) {
    console.error('Get label error:', error);
    res.status(500).json({ message: 'Server error getting label' });
  }
});

// ── GET /api/labels/shiplabel-job/:bulkJobId ──────────────────
// Poll background ShipLabel bulk job progress.
// Returns: { total, generated, failed, pending, done, labels[] }
router.get('/shiplabel-job/:bulkJobId', authenticateToken, async (req, res) => {
  try {
    const { bulkJobId } = req.params;

    const allLabels = await Label.find({
      user:     req.user._id,
      bulkJobId,
    }).select('status trackingId pdfUrl shiplabelOrderId price from_name to_name to_zip createdAt').lean();

    if (!allLabels.length) {
      return res.status(404).json({ message: 'Job not found' });
    }

    const total     = allLabels.length;
    const generated = allLabels.filter(l => l.status === 'generated').length;
    const failed    = allLabels.filter(l => l.status === 'failed').length;
    const pending   = allLabels.filter(l => l.status === 'pending').length;
    const done      = pending === 0;

    res.json({ total, generated, failed, pending, done, labels: allLabels });
  } catch (error) {
    console.error('ShipLabel job poll error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
