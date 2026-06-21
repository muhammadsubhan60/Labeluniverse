/**
 * Label Crow API Service
 * Base: https://labelcrow.com/api/v1
 * Auth: Authorization: Bearer <LABELCROW_API_KEY>
 */
const https = require('https');

const LC_HOST = 'labelcrow.com';

// Per-tenant key cache: tenantId string → decrypted key
const _keyCache = new Map();

async function getKey(tenantId = null) {
  const cacheKey = tenantId ? String(tenantId) : '_env';
  if (_keyCache.has(cacheKey)) return _keyCache.get(cacheKey);
  try {
    const PlatformApiKey = require('../models/PlatformApiKey');
    const query = tenantId ? { service: 'labelcrow', tenantId } : { service: 'labelcrow' };
    const doc = await PlatformApiKey.findOne(query);
    if (doc) {
      const k = doc.getKey();
      _keyCache.set(cacheKey, k);
      return k;
    }
  } catch {}
  const k = process.env.LABELCROW_API_KEY;
  if (!k) throw new Error('LabelCrow API key not configured. Add it in Admin → Settings.');
  return k;
}

function clearKeyCache(tenantId = null) {
  if (tenantId) _keyCache.delete(String(tenantId));
  else _keyCache.clear();
}

// ── JSON request helper ────────────────────────────────────────
async function apiRequest(method, urlPath, data = null, tenantId = null) {
  const key = await getKey(tenantId);
  return new Promise((resolve, reject) => {
    const body = data ? JSON.stringify(data) : null;

    // Log request — redact labels array to just a count
    if (data) {
      const logSafe = { ...data };
      if (Array.isArray(logSafe.labels)) logSafe.labels = `[${logSafe.labels.length} labels]`;
      console.log(`[LC] → ${method} ${urlPath}`, logSafe);
    } else {
      console.log(`[LC] → ${method} ${urlPath}`);
    }

    const options = {
      hostname: LC_HOST,
      port:     443,
      path:     urlPath,
      method,
      headers: {
        'Authorization': `Bearer ${key}`,
        'Content-Type':  'application/json',
        ...(body ? { 'Content-Length': Buffer.byteLength(body) } : {}),
      },
    };

    const req = https.request(options, (res) => {
      let raw = '';
      res.on('data', chunk => { raw += chunk; });
      res.on('end', () => {
        try {
          const json = JSON.parse(raw);
          if (res.statusCode >= 200 && res.statusCode < 300) {
            console.log(`[LC] ← ${res.statusCode} ${urlPath}`, JSON.stringify(json.data ?? json).slice(0, 300));
            resolve(json);
          } else {
            const msg = json?.error?.message || json?.message
              || `Label Crow API error ${res.statusCode}`;
            console.error(`[LC] ← ERROR ${res.statusCode} ${urlPath}`, {
              error: json?.error || json,
              raw: raw.slice(0, 500),
            });
            reject(new Error(msg));
          }
        } catch {
          console.error(`[LC] ← Invalid JSON from ${urlPath}:`, raw.slice(0, 300));
          reject(new Error(`Invalid JSON from Label Crow: ${raw.slice(0, 200)}`));
        }
      });
    });

    req.on('error', err => {
      console.error(`[LC] Network error on ${method} ${urlPath}:`, err.message);
      reject(err);
    });
    if (body) req.write(body);
    req.end();
  });
}

// ── Binary request helper (ZIP download) ──────────────────────
async function apiBinaryRequest(urlPath, tenantId = null) {
  const key = await getKey(tenantId);
  return new Promise((resolve, reject) => {
    const options = {
      hostname: LC_HOST,
      port:     443,
      path:     urlPath,
      method:   'GET',
      headers:  { 'Authorization': `Bearer ${key}` },
    };

    const req = https.request(options, (res) => {
      const chunks = [];
      res.on('data', chunk => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
      res.on('end', () => resolve({
        buffer:      Buffer.concat(chunks),
        statusCode:  res.statusCode,
        contentType: res.headers['content-type'] || 'application/zip',
      }));
    });

    req.on('error', reject);
    req.end();
  });
}

// ── Map our flat row to Label Crow bulk label format ──────────
function mapRow(row) {
  return {
    fromName:   row.from_name     || '',
    fromStreet: row.from_address1 || '',
    fromCity:   row.from_city     || '',
    fromState:  row.from_state    || '',
    fromZip:    row.from_zip      || '',
    toName:     row.to_name       || '',
    toStreet:   row.to_address1   || '',
    toCity:     row.to_city       || '',
    toState:    row.to_state      || '',
    toZip:      row.to_zip        || '',
    weight:     parseFloat(row.weight) || 0,
    ...(row.from_address2 ? { fromStreet2:    row.from_address2 } : {}),
    ...(row.to_address2   ? { toStreet2:      row.to_address2   } : {}),
    ...(row.from_company  ? { fromCompany:    row.from_company  } : {}),
    ...(row.to_company    ? { toCompany:      row.to_company    } : {}),
    ...(row.from_phone    ? { fromPhone:      row.from_phone    } : {}),
    ...(row.to_phone      ? { toPhone:        row.to_phone      } : {}),
    ...(row.note          ? { order_number:   row.note          } : {}),
  };
}

/**
 * Submit a bulk label job.
 * Returns { jobId, orderId, totalLabels }
 */
async function submitBulkJob({ seriesId, carrier, serviceClass, providerKey, labels }, tenantId = null) {
  console.log('[LC] submitBulkJob params:', { seriesId, carrier, serviceClass, providerKey, labelCount: labels.length });
  const mappedLabels = labels.map(mapRow);
  console.log('[LC] First mapped label:', JSON.stringify(mappedLabels[0]));
  console.log('[LC] Last mapped label:', JSON.stringify(mappedLabels[mappedLabels.length - 1]));

  const res = await apiRequest('POST', '/api/v1/labels/bulk', {
    carrier,
    service_class: serviceClass,
    provider_key:  providerKey,
    series_id:     seriesId,
    labels:        mappedLabels,
  }, tenantId);
  const d = res.data;
  console.log('[LC] submitBulkJob result:', { jobId: d.job_id, orderId: d.order_id, totalLabels: d.total_labels });
  return { jobId: d.job_id, orderId: d.order_id, totalLabels: d.total_labels };
}

/**
 * Poll a bulk job for status.
 * Returns { jobId, status, total, generated, failed, progress }
 */
async function pollJob(jobId, tenantId = null) {
  const res = await apiRequest('GET', `/api/v1/jobs/${jobId}`, null, tenantId);
  const d   = res.data;
  console.log('[LC] pollJob result:', { jobId: d.job_id, status: d.status, generated: d.generated, failed: d.failed, total: d.total });
  return d;
}

/**
 * Get order details by order ID.
 * Returns { id, status, totalLabels, files: { zip, merged_pdf } }
 */
async function getOrder(orderId, tenantId = null) {
  const res = await apiRequest('GET', `/api/v1/orders/${orderId}`, null, tenantId);
  const d   = res.data;
  return { id: d.id, status: d.status, totalLabels: d.total_labels, files: d.files || {} };
}

/**
 * Download ZIP for an order (binary).
 * Returns { buffer, statusCode, contentType }
 */
async function downloadOrderZip(orderId, tenantId = null) {
  return apiBinaryRequest(`/api/v1/orders/${orderId}/download/zip`, tenantId);
}

/**
 * Get all label series available on this account.
 * Returns array of { id, series_code, display_name, carrier, service_class, price_brackets }
 */
async function getSeries(tenantId = null) {
  const res = await apiRequest('GET', '/api/v1/account/series', null, tenantId);
  return res.data || [];
}

async function getProviders(tenantId = null) {
  const res = await apiRequest('GET', '/api/v1/account/providers', null, tenantId);
  return res.data || [];
}

async function getServices(tenantId = null) { return getProviders(tenantId); }

module.exports = { submitBulkJob, pollJob, getOrder, downloadOrderZip, getSeries, getProviders, getServices, clearKeyCache };
