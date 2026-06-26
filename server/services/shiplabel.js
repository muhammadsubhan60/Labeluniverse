/**
 * ShipLabel.net API Service
 * Base: https://shiplabel.net/api/v2
 * Auth: Authorization: Bearer <SHIPLABEL_API_KEY>
 */
const https = require('https');

const SL_HOST = 'shiplabel.net';

// Per-tenant key cache: tenantId string → decrypted key
const _keyCache = new Map();

async function getKey(tenantId = null) {
  const cacheKey = tenantId ? String(tenantId) : '_env';
  if (_keyCache.has(cacheKey)) return _keyCache.get(cacheKey);
  try {
    const PlatformApiKey = require('../models/PlatformApiKey');
    const query = tenantId ? { service: 'shiplabel', tenantId } : { service: 'shiplabel' };
    const doc = await PlatformApiKey.findOne(query);
    if (doc) {
      const k = doc.getKey();
      _keyCache.set(cacheKey, k);
      return k;
    }
  } catch {}
  const k = process.env.SHIPLABEL_API_KEY;
  if (!k) throw new Error('ShipLabel API key not configured. Add it in Admin → Settings.');
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
    const options = {
      hostname: SL_HOST,
      port:     443,
      path:     urlPath,
      method,
      headers: {
        'Authorization': `Bearer ${key}`,
        'Content-Type':  'application/json',
        'Accept':        'application/json',
        ...(body ? { 'Content-Length': Buffer.byteLength(body) } : {}),
      },
    };

    const req = https.request(options, (res) => {
      let raw = '';
      res.on('data', chunk => { raw += chunk; });
      res.on('end', () => {
        try {
          const json = JSON.parse(raw);
          if (json.success === false) {
            const msg = json.message || json.error || `ShipLabel API error ${res.statusCode}`;
            return reject(new Error(msg));
          }
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(json);
          } else {
            reject(new Error(`ShipLabel API error ${res.statusCode}: ${raw.slice(0, 200)}`));
          }
        } catch {
          reject(new Error(`Invalid JSON from ShipLabel: ${raw.slice(0, 200)}`));
        }
      });
    });

    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

// ── Infer label_series from service name ───────────────────────
function parseSeriesFromName(name) {
  const m = name.match(/\((\d+)\)/);
  return m ? m[1] : '';
}

// ── Infer label_format from service name ───────────────────────
function inferFormatFromName(name) {
  const n = name.toLowerCase();
  if (n.includes('priority pro'))                          return 'usps_priority_pro';
  if (n.includes('priority mail') && n.includes('private')) return 'usps_priority_private';
  if (n.includes('priority mail') && n.includes('pitney')) return 'usps_priority_pitneyBow';
  if (n.includes('priority mail') && n.includes('epostage')) return 'usps_priority_mail_epostage';
  if (n.includes('priority mail') && n.includes('easypost')) return 'usps_priority_mail_commercial_easypost';
  if (n.includes('priority mail'))                         return 'usps_priority_mail';
  if (n.includes('ground advantage stamps'))               return 'usps_ground_advantage';
  if (n.includes('ground advantage'))                      return 'usps_ground_advantage';
  if (n.includes('ground pro'))                            return 'usps_ground_pro';
  if (n.includes('ground api'))                            return 'usps_ground_api';
  if (n.includes('ground'))                                return 'usps_ground_api';
  if (n.includes('click-n-ship') || n.includes('click n ship')) return 'click_n_ship';
  return '';
}

/**
 * Get all available services on this account.
 * Returns array of { id, name, max_weight, price_ranges, inferredSeries, inferredFormat }
 */
async function getServices(tenantId = null) {
  const res = await apiRequest('POST', '/api/v2/services', {}, tenantId);
  // Response shape: { success: { labels: [...] } }
  const raw = (res.success && res.success.labels) || res.data || [];
  return raw
    .map(s => ({
      ...s,
      inferredSeries: parseSeriesFromName(s.name),
      inferredFormat: inferFormatFromName(s.name),
    }));
}

/**
 * Create a single shipping label.
 * payload: { label_id, fromName, fromAddress, fromZip, fromState, fromCity, fromCountry,
 *            toName, toAddress, toZip, toState, toCity, toCountry, weight, length, height, width,
 *            label_series?, label_format? }
 * Returns: { label_created, tracking_id, pdf, price, ... }
 */
async function createOrder(payload, tenantId = null) {
  const res = await apiRequest('POST', '/api/v2/create-order', payload, tenantId);
  // ShipLabel returns { success: { data: { tracking_id, pdf, ... } } }
  // Unwrap outer success wrapper, then inner data wrapper.
  const outer  = (res.success && typeof res.success === 'object') ? res.success : (res.data || res);
  const result = (outer.data  && typeof outer.data  === 'object') ? outer.data  : outer;
  console.log('[SL createOrder] tracking_id:', result.tracking_id, '| pdf:', result.pdf);
  return result;
}

module.exports = { getServices, createOrder, parseSeriesFromName, inferFormatFromName, clearKeyCache };
