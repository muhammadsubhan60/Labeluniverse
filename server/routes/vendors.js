const express = require('express');
const { body, validationResult } = require('express-validator');
const Vendor = require('../models/Vendor');
const { authenticateToken, authorize } = require('../middleware/auth');
const shippershub = require('../services/shippershub');

const router = express.Router();

// ── GET /api/vendors ──────────────────────────────────────────
// Admin: list all vendors | User/Reseller: their visible vendors
router.get('/', authenticateToken, async (req, res) => {
  try {
    const tenantId = req.user.tenantId || req.user._id;
    const filter = req.user.role === 'admin'
      ? { tenantId }
      : { isActive: true, visibleToRoles: req.user.role, tenantId };
    const vendors = await Vendor.find(filter).sort({ carrier: 1, name: 1 });
    res.json({ vendors });
  } catch (error) {
    console.error('Get vendors error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// ── POST /api/vendors ─────────────────────────────────────────
// Admin: create a vendor
router.post('/', authenticateToken, authorize('admin'), [
  body('name').notEmpty().withMessage('Vendor name is required'),
  body('carrier').isIn(['USPS', 'UPS', 'FedEx', 'DHL']).withMessage('Invalid carrier'),
  body('rate').isFloat({ min: 0 }).withMessage('Rate must be a non-negative number'),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ message: 'Validation failed', errors: errors.array() });
    }

    const {
      name, carrier, rate, rateMin, rateMax,
      shippershubCarrierId, shippershubVendorId,
      shippingService, visibleToRoles, isActive, description, source,
      vendorContactEmail, vendorPortalEmail, vendorPortalPassword,
      vendorPortalIsActive, vendorRate, vendorType,
    } = req.body;

    const tenantId = req.user.tenantId || req.user._id;
    const vendor = new Vendor({
      name, carrier, rate,
      tenantId,
      vendorType:           vendorType || 'api',
      rateMin:              rateMin || null,
      rateMax:              rateMax || null,
      shippershubCarrierId: shippershubCarrierId || null,
      shippershubVendorId:  shippershubVendorId  || null,
      shippingService:      shippingService || '',
      visibleToRoles:       visibleToRoles  || ['admin', 'reseller', 'user'],
      isActive:             isActive !== undefined ? isActive : true,
      description:          description || '',
      source:               source || 'shippershub',
      vendorContactEmail:   vendorContactEmail   || '',
      vendorPortalEmail:    vendorPortalEmail     || undefined,
      vendorPortalIsActive: vendorPortalIsActive  || false,
      vendorRate:           vendorRate            || 0,
    });

    if (vendorPortalPassword && vendorPortalPassword.trim()) {
      vendor.vendorPortalPassword = vendorPortalPassword; // pre-save will hash
    }

    await vendor.save();

    res.status(201).json({ message: 'Vendor created successfully', vendor });
  } catch (error) {
    console.error('Create vendor error:', error);
    res.status(500).json({ message: 'Server error creating vendor' });
  }
});

// ── PUT /api/vendors/:id ──────────────────────────────────────
router.put('/:id', authenticateToken, authorize('admin'), async (req, res) => {
  try {
    const tenantId = req.user.tenantId || req.user._id;
    const vendor = await Vendor.findOne({ _id: req.params.id, tenantId });
    if (!vendor) return res.status(404).json({ message: 'Vendor not found' });

    // Apply all fields from request body
    const { vendorPortalPassword, ...rest } = req.body;

    Object.assign(vendor, rest);

    // Only update password if a new one was explicitly provided
    if (vendorPortalPassword && vendorPortalPassword.trim()) {
      vendor.vendorPortalPassword = vendorPortalPassword; // pre-save hook will hash it
    }

    await vendor.save(); // triggers bcrypt pre-save hook
    res.json({ message: 'Vendor updated', vendor });
  } catch (error) {
    console.error('Update vendor error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// ── DELETE /api/vendors/:id ───────────────────────────────────
router.delete('/:id', authenticateToken, authorize('admin'), async (req, res) => {
  try {
    const tenantId = req.user.tenantId || req.user._id;
    const vendor = await Vendor.findOneAndDelete({ _id: req.params.id, tenantId });
    if (!vendor) return res.status(404).json({ message: 'Vendor not found' });
    res.json({ message: 'Vendor deleted' });
  } catch (error) {
    console.error('Delete vendor error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// ── POST /api/vendors/import-from-shippershub ─────────────────
// Admin: full sync — creates new, updates existing, deactivates removed
router.post('/import-from-shippershub', authenticateToken, authorize('admin'), async (req, res) => {
  try {
    const tenantId = req.user.tenantId || req.user._id;
    const carriers = await shippershub.getMyCarriers(tenantId);

    // Collect all vendor IDs currently available in ShippersHub
    const liveVendorIds = [];
    const created  = [];
    const updated  = [];

    for (const carrier of carriers) {
      const vendors = await shippershub.getMyVendors(carrier._id, tenantId);
      for (const v of vendors) {
        liveVendorIds.push(v._id);

        const carrierName = carrier.name.toUpperCase().includes('USPS')  ? 'USPS'
                          : carrier.name.toUpperCase().includes('UPS')   ? 'UPS'
                          : carrier.name.toUpperCase().includes('FEDEX') ? 'FedEx' : 'DHL';

        const existing = await Vendor.findOne({ shippershubVendorId: v._id, tenantId });
        if (!existing) {
          await Vendor.create({
            name:                 v.name,
            carrier:              carrierName,
            shippershubCarrierId: carrier._id,
            shippershubVendorId:  v._id,
            shippingService:      v.shippingService || '',
            rate:                 v.rate || 0,
            isActive:             v.status === 'active',
            source:               'shippershub',
            tenantId,
          });
          created.push(v.name);
        } else {
          // Update name & status to match ShippersHub, preserve admin-set rate
          existing.name            = v.name;
          existing.shippingService = v.shippingService || existing.shippingService;
          existing.isActive        = v.status === 'active';
          await existing.save();
          updated.push(v.name);
        }
      }
    }

    // Deactivate any ShippersHub vendor no longer returned by the API
    const deactivated = await Vendor.updateMany(
      { source: 'shippershub', shippershubVendorId: { $nin: liveVendorIds }, tenantId },
      { isActive: false }
    );

    res.json({
      message: `Sync complete — ${created.length} added, ${updated.length} updated, ${deactivated.modifiedCount} deactivated`,
      created, updated
    });
  } catch (error) {
    console.error('Import ShippersHub vendors error:', error);
    res.status(502).json({ message: `ShippersHub error: ${error.message}` });
  }
});

// ── POST /api/vendors/import-from-labelcrow ───────────────────
// Admin: sync Label Crow series × provider_key combos as Vendor records
router.post('/import-from-labelcrow', authenticateToken, authorize('admin'), async (req, res) => {
  try {
    const tenantId = req.user.tenantId || req.user._id;
    const labelcrow = require('../services/labelcrow');
    const [seriesList, providersRaw] = await Promise.all([
      labelcrow.getSeries(tenantId),
      labelcrow.getProviders(tenantId),
    ]);

    // ── Debug: log exactly what the LC API returned ───────────
    console.log('[LC Sync] seriesList raw:', JSON.stringify(seriesList, null, 2));
    console.log('[LC Sync] providersRaw raw:', JSON.stringify(providersRaw, null, 2));
    console.log('[LC Sync] seriesList count:', seriesList.length);
    console.log('[LC Sync] providersRaw count:', providersRaw.length);

    // ── Build providerMap handling BOTH LC response formats ───
    // Format A (grouped):  { carrier, service_classes: [{ service_class, provider_keys: [] }] }
    // Format B (flat):     { carrier, service_class, provider_key }
    const providerMap = new Map();
    for (const p of providersRaw) {
      if (Array.isArray(p.service_classes)) {
        // Format A
        for (const sc of p.service_classes) {
          const k = `${p.carrier}:${sc.service_class}`;
          if (!providerMap.has(k)) providerMap.set(k, new Set());
          for (const pk of (sc.provider_keys || [])) {
            if (pk) providerMap.get(k).add(pk);
          }
        }
      } else if (p.service_class !== undefined) {
        // Format B — each item is a single {carrier, service_class, provider_key}
        const k = `${p.carrier}:${p.service_class}`;
        if (!providerMap.has(k)) providerMap.set(k, new Set());
        if (p.provider_key) providerMap.get(k).add(p.provider_key);
      }
    }

    console.log('[LC Sync] providerMap built:', Object.fromEntries(
      [...providerMap.entries()].map(([k, v]) => [k, [...v]])
    ));

    const created     = [];
    const updated     = [];
    const deactivated = [];
    // Track which seriesIds got at least one real (non-empty) providerKey vendor
    const seriesWithRealKey = new Set();

    for (const series of seriesList) {
      const k     = `${series.carrier}:${series.service_class}`;
      const hasRealKeys = providerMap.has(k) && providerMap.get(k).size > 0;
      const pkeys = hasRealKeys ? [...providerMap.get(k)] : [''];

      console.log(`[LC Sync] Series id=${series.id} code=${series.series_code} ${k} → providerKeys: [${pkeys.join(', ') || '(empty)'}]`);

      if (hasRealKeys) seriesWithRealKey.add(series.id);

      const rateVal  = series.price_brackets?.[0]?.price ?? 0;
      const svc      = series.service_class;
      const svcLabel = svc.charAt(0).toUpperCase() + svc.slice(1);

      for (const providerKey of pkeys) {
        const vendorName = providerKey
          ? `${series.series_code} · ${svcLabel} · ${providerKey}`
          : `${series.series_code} · ${svcLabel}`;

        const filter = {
          source: 'labelcrow',
          labelcrowSeriesId:    series.id,
          labelcrowProviderKey: providerKey,
          tenantId,
        };

        const existing = await Vendor.findOne(filter);
        if (!existing) {
          await Vendor.create({
            name:                  vendorName,
            carrier:               'USPS',
            source:                'labelcrow',
            vendorType:            'api',
            shippingService:       svc,
            rate:                  rateVal,
            isActive:              true,
            labelcrowSeriesId:     series.id,
            labelcrowProviderKey:  providerKey,
            labelcrowServiceClass: svc,
            tenantId,
          });
          created.push(vendorName);
        } else {
          await Vendor.updateOne(filter, {
            $set: { name: vendorName, shippingService: svc, labelcrowServiceClass: svc, rate: rateVal, isActive: true },
          });
          updated.push(vendorName);
        }
      }
    }

    // Deactivate old empty-key vendors where we now have proper-keyed replacements
    if (seriesWithRealKey.size > 0) {
      const staleVendors = await Vendor.find({
        source:               'labelcrow',
        labelcrowSeriesId:    { $in: [...seriesWithRealKey] },
        labelcrowProviderKey: { $in: [null, ''] },
        isActive:             true,
        tenantId,
      }).select('_id name labelcrowSeriesId');

      for (const v of staleVendors) {
        await Vendor.updateOne({ _id: v._id }, { $set: { isActive: false } });
        deactivated.push({ id: v._id, name: v.name, seriesId: v.labelcrowSeriesId });
        console.log(`[LC Sync] Deactivated stale empty-key vendor: "${v.name}" (${v._id})`);
      }
    }

    const msg = [
      `${created.length} added`,
      `${updated.length} updated`,
      deactivated.length ? `${deactivated.length} stale empty-key vendor(s) deactivated` : '',
    ].filter(Boolean).join(', ');

    console.log(`[LC Sync] Done — ${msg}`);

    res.json({
      message: `Label Crow sync — ${msg}`,
      created,
      updated,
      deactivated: deactivated.map(v => v.name),
      _debug: {
        seriesCount:    seriesList.length,
        providersCount: providersRaw.length,
        providerMap:    Object.fromEntries([...providerMap.entries()].map(([k, v]) => [k, [...v]])),
        series:         seriesList.map(s => ({ id: s.id, code: s.series_code, carrier: s.carrier, serviceClass: s.service_class })),
        providers:      providersRaw,
      },
    });
  } catch (error) {
    console.error('[LC Sync] ERROR:', error.message, error.stack?.split('\n').slice(0, 4).join(' | '));
    res.status(502).json({ message: `Label Crow error: ${error.message}` });
  }
});

// ── POST /api/vendors/import-from-shiplabel ───────────────────
// Admin: sync ShipLabel services as Vendor records.
// Vendors returned by the API are created/activated; any existing ShipLabel
// vendor whose service ID is no longer in the API response is deactivated.
router.post('/import-from-shiplabel', authenticateToken, authorize('admin'), async (req, res) => {
  try {
    const tenantId = req.user.tenantId || req.user._id;
    const shiplabel = require('../services/shiplabel');
    const services  = await shiplabel.getServices(tenantId);

    const created    = [];
    const updated    = [];
    const deactivated = [];

    const liveIds = services.map(s => String(s.id));

    for (const svc of services) {
      const rawPrice = svc.price_ranges?.[0]?.price || '$0';
      const rateVal  = parseFloat(rawPrice.replace(/[^0-9.]/g, '')) || 0;

      const filter = { source: 'shiplabel', shiplabelServiceId: String(svc.id), tenantId };
      const existing = await Vendor.findOne(filter);

      if (!existing) {
        await Vendor.create({
          name:                 svc.name,
          carrier:              'USPS',
          source:               'shiplabel',
          vendorType:           'api',
          shippingService:      svc.inferredFormat || '',
          rate:                 rateVal,
          isActive:             true,
          shiplabelServiceId:   String(svc.id),
          shiplabelLabelSeries: svc.inferredSeries || '',
          shiplabelLabelFormat: svc.inferredFormat || '',
          tenantId,
        });
        created.push(svc.name);
      } else {
        await Vendor.updateOne(filter, {
          $set: {
            name:             svc.name,
            shippingService:  svc.inferredFormat || existing.shippingService,
            isActive:         true,
          },
        });
        updated.push(svc.name);
      }
    }

    // Deactivate any ShipLabel vendors not returned by the API
    const stale = await Vendor.find({
      source:   'shiplabel',
      tenantId,
      shiplabelServiceId: { $nin: liveIds },
      isActive: true,
    });
    if (stale.length) {
      await Vendor.updateMany(
        { source: 'shiplabel', tenantId, shiplabelServiceId: { $nin: liveIds } },
        { $set: { isActive: false } }
      );
      stale.forEach(v => deactivated.push(v.name));
    }

    res.json({
      message: `ShipLabel sync — ${created.length} added, ${updated.length} active, ${deactivated.length} deactivated`,
      created,
      updated,
      deactivated,
    });
  } catch (error) {
    console.error('Import ShipLabel vendors error:', error);
    res.status(502).json({ message: `ShipLabel error: ${error.message}` });
  }
});

// ── POST /api/vendors/bulk-update ─────────────────────────────
router.post('/bulk-update', authenticateToken, authorize('admin'), async (req, res) => {
  try {
    const { ids, rate, isActive } = req.body;
    if (!Array.isArray(ids) || !ids.length) return res.status(400).json({ message: 'No vendor IDs provided' });
    const update = {};
    if (rate !== undefined) update.rate = parseFloat(rate) || 0;
    if (isActive !== undefined) update.isActive = Boolean(isActive);
    if (!Object.keys(update).length) return res.status(400).json({ message: 'Nothing to update' });
    const result = await Vendor.updateMany({ _id: { $in: ids } }, { $set: update });
    res.json({ message: `${result.modifiedCount} vendor(s) updated`, modified: result.modifiedCount });
  } catch (error) {
    console.error('Bulk update vendors error:', error);
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
