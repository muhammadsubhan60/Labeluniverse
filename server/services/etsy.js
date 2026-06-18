const axios  = require('axios');
const crypto = require('crypto');

const TOKEN_URL = 'https://api.etsy.com/v3/public/oauth/token';
const BASE_URL  = 'https://api.etsy.com/v3/application';

// ── PKCE helpers ──────────────────────────────────────────────────────────────
function generatePKCE() {
  // verifier: 96 random bytes → base64url → 128-char string, all in [A-Za-z0-9_-]
  const verifier  = crypto.randomBytes(96).toString('base64url').slice(0, 128);
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

// ── Token exchange (PKCE — no client_secret required) ────────────────────────
async function exchangeCodeForToken(keystring, code, redirectUri, verifier) {
  const res = await axios.post(
    TOKEN_URL,
    new URLSearchParams({
      grant_type:    'authorization_code',
      client_id:     keystring,
      redirect_uri:  redirectUri,
      code,
      code_verifier: verifier,
    }).toString(),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
  );
  return res.data; // { access_token, refresh_token, expires_in, token_type }
}

// ── Refresh access token ──────────────────────────────────────────────────────
async function refreshAccessToken(keystring, refreshToken) {
  const res = await axios.post(
    TOKEN_URL,
    new URLSearchParams({
      grant_type:    'refresh_token',
      client_id:     keystring,
      refresh_token: refreshToken,
    }).toString(),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
  );
  return res.data; // { access_token, refresh_token, expires_in }
}

// ── Resolve shop from access token ───────────────────────────────────────────
// Etsy embeds the numeric user ID as the prefix of the access token (before first '.')
async function getShopInfo(accessToken, keystring) {
  const etsyUserId = accessToken.split('.')[0];
  const res = await axios.get(`${BASE_URL}/users/${etsyUserId}/shops`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'x-api-key':   keystring,
    },
  });
  const shops = res.data.results || [];
  if (!shops.length) throw new Error('No Etsy shop found for this account');
  return {
    shopId:   String(shops[0].shop_id),
    shopName: shops[0].shop_name || '',
  };
}

// ── Auto-refresh 5 minutes before expiry ─────────────────────────────────────
async function ensureFreshToken(conn) {
  if (!conn.tokenExpiresAt) return;
  if (Date.now() < conn.tokenExpiresAt.getTime() - 5 * 60 * 1000) return;

  const data = await refreshAccessToken(conn.keystring, conn.getRefreshToken());
  conn.setAccessToken(data.access_token);
  conn.setRefreshToken(data.refresh_token);
  conn.tokenExpiresAt = new Date(Date.now() + data.expires_in * 1000);
  await conn.save();
}

// ── Fetch all receipts (offset-based pagination) ──────────────────────────────
async function fetchReceipts(shopId, accessToken, keystring, params = {}) {
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    'x-api-key':   keystring,
  };
  const allReceipts = [];
  const limit       = 100;
  let   offset      = 0;
  let   total       = null;

  while (true) {
    const res     = await axios.get(`${BASE_URL}/shops/${shopId}/receipts`, {
      headers,
      params: { limit, offset, was_paid: true, ...params },
    });
    const results = res.data.results || [];
    if (total === null) total = res.data.count || 0;

    allReceipts.push(...results);
    offset += results.length;

    if (results.length === 0 || results.length < limit || allReceipts.length >= total) break;
  }

  return allReceipts;
}

// ── Webhook HMAC-SHA256 verification ─────────────────────────────────────────
// Signed content: webhook-id + "." + webhook-timestamp + "." + rawBody
// Secret: strip "whsec_" prefix, then base64-decode
function verifyWebhookSignature(webhookId, timestamp, rawBody, sharedSecret, incomingSignature) {
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false;

  const key     = Buffer.from(sharedSecret.replace(/^whsec_/, ''), 'base64');
  const content = `${webhookId}.${timestamp}.${rawBody}`;
  const digest  = crypto.createHmac('sha256', key).update(content).digest('base64');

  try {
    return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(incomingSignature));
  } catch {
    return false;
  }
}

// ── Map Etsy receipt → our schema shape ──────────────────────────────────────
function normalizeReceipt(receipt, shopId, shopName) {
  const name      = receipt.name || '';
  const nameParts = name.trim().split(/\s+/);
  const firstName = nameParts[0] || '';
  const lastName  = nameParts.slice(1).join(' ') || '';

  const gt       = receipt.grandtotal || {};
  const divisor  = gt.divisor || 100;
  const total    = gt.amount != null
    ? String((gt.amount / divisor).toFixed(2))
    : '0.00';

  return {
    shopId:      String(shopId),
    shopName:    shopName || '',
    receiptId:   String(receipt.receipt_id),
    orderNumber: String(receipt.receipt_id),
    source:      'etsy',
    customer: {
      firstName,
      lastName,
      email: receipt.buyer_email || '',
    },
    shippingAddress: {
      firstName,
      lastName,
      address1:     receipt.first_line  || '',
      address2:     receipt.second_line || '',
      city:         receipt.city        || '',
      province:     receipt.state       || '',
      provinceCode: receipt.state       || '',
      zip:          receipt.zip         || '',
      country:      receipt.country_iso || '',
    },
    lineItems: (receipt.transactions || []).map(t => ({
      title:    t.title    || '',
      sku:      t.sku      || '',
      quantity: t.quantity || 1,
      price:    t.price?.amount != null
        ? String((t.price.amount / (t.price.divisor || 100)).toFixed(2))
        : '0.00',
    })),
    totalPrice:        total,
    currency:          gt.currency_code  || 'USD',
    isPaid:            !!receipt.is_paid,
    isShipped:         !!receipt.is_shipped,
    isCanceled:        receipt.status === 'canceled',
    financialStatus:   receipt.is_paid   ? 'paid'        : 'pending',
    fulfillmentStatus: receipt.is_shipped ? 'fulfilled'  : 'unfulfilled',
    etsyCreatedAt: new Date(
      ((receipt.create_timestamp || receipt.created_timestamp || 0) * 1000)
    ),
  };
}

module.exports = {
  generatePKCE,
  exchangeCodeForToken,
  refreshAccessToken,
  getShopInfo,
  ensureFreshToken,
  fetchReceipts,
  verifyWebhookSignature,
  normalizeReceipt,
};
