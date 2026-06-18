const express  = require('express');
const axios    = require('axios');
const jwt      = require('jsonwebtoken');
const crypto   = require('crypto');
const { authenticateToken } = require('../middleware/auth');
const EtsyConnection        = require('../models/EtsyConnection');
const EtsyOrder             = require('../models/EtsyOrder');
const etsyService           = require('../services/etsy');

const router = express.Router();

const CALLBACK_URL = 'https://labeluniverse-production.up.railway.app/api/etsy/callback';
const FRONTEND_URL = process.env.CLIENT_URL || 'https://labeluniverse.vercel.app';
const SCOPES       = 'transactions_r';

// ── Find connection by matching webhook signature (multi-user routing) ────────
async function findConnByWebhook(shopId, webhookId, timestamp, rawBody, signature) {
  const filter = shopId ? { shopId: String(shopId) } : {};
  const conns  = await EtsyConnection.find(filter);
  for (const conn of conns) {
    try {
      const secret = conn.getSharedSecret();
      if (
        secret &&
        etsyService.verifyWebhookSignature(webhookId, timestamp, rawBody, secret, signature)
      ) {
        return conn;
      }
    } catch {}
  }
  return null;
}

// ── POST /api/etsy/credentials ────────────────────────────────────────────────
// User saves their Etsy app Keystring + Shared Secret from etsy.com/developers
router.post('/credentials', authenticateToken, async (req, res) => {
  const { keystring, sharedSecret } = req.body;
  if (!keystring || !sharedSecret) {
    return res.status(400).json({ message: 'keystring and sharedSecret are required' });
  }

  try {
    let conn = await EtsyConnection.findOne({ userId: req.user._id });
    if (!conn) conn = new EtsyConnection({ userId: req.user._id });

    conn.keystring = keystring.trim();
    conn.setSharedSecret(sharedSecret.trim());

    // Clear previous OAuth state when credentials change
    conn.encryptedAccessToken  = '';
    conn.accessTokenIv         = '';
    conn.encryptedRefreshToken = '';
    conn.refreshTokenIv        = '';
    conn.tokenExpiresAt        = null;
    conn.shopId                = '';
    conn.shopName              = '';
    conn.lastSyncAt            = null;
    conn.pendingVerifier       = '';

    await conn.save();
    res.json({ message: 'Credentials saved' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── GET /api/etsy/auth-url ────────────────────────────────────────────────────
// Generates PKCE challenge, stores verifier, returns Etsy OAuth URL
router.get('/auth-url', authenticateToken, async (req, res) => {
  try {
    const conn = await EtsyConnection.findOne({ userId: req.user._id });
    if (!conn || !conn.keystring) {
      return res.status(400).json({ message: 'Save your Etsy app credentials first' });
    }

    const { verifier, challenge } = etsyService.generatePKCE();
    conn.pendingVerifier = verifier;
    await conn.save();

    const state = jwt.sign(
      { userId: String(req.user._id), nonce: crypto.randomBytes(8).toString('hex') },
      process.env.JWT_SECRET,
      { expiresIn: '15m' }
    );

    const authUrl =
      `https://www.etsy.com/oauth/connect` +
      `?response_type=code` +
      `&client_id=${encodeURIComponent(conn.keystring)}` +
      `&redirect_uri=${encodeURIComponent(CALLBACK_URL)}` +
      `&scope=${encodeURIComponent(SCOPES)}` +
      `&state=${encodeURIComponent(state)}` +
      `&code_challenge=${encodeURIComponent(challenge)}` +
      `&code_challenge_method=S256`;

    res.json({ authUrl });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── GET /api/etsy/callback ────────────────────────────────────────────────────
// Etsy redirects here after user approves — exchanges code for tokens
router.get('/callback', async (req, res) => {
  const { code, state, error } = req.query;

  if (error) {
    return res.redirect(
      `${FRONTEND_URL}/integrations?etsy_error=${encodeURIComponent(error)}`
    );
  }
  if (!code || !state) {
    return res.redirect(`${FRONTEND_URL}/integrations?etsy_error=missing_params`);
  }

  let userId;
  try {
    const decoded = jwt.verify(state, process.env.JWT_SECRET);
    userId = decoded.userId;
  } catch {
    return res.redirect(`${FRONTEND_URL}/integrations?etsy_error=invalid_state`);
  }

  try {
    const conn = await EtsyConnection.findOne({ userId });
    if (!conn || !conn.keystring || !conn.pendingVerifier) {
      return res.redirect(`${FRONTEND_URL}/integrations?etsy_error=no_credentials`);
    }

    const tokenData = await etsyService.exchangeCodeForToken(
      conn.keystring, code, CALLBACK_URL, conn.pendingVerifier
    );

    conn.setAccessToken(tokenData.access_token);
    conn.setRefreshToken(tokenData.refresh_token);
    conn.tokenExpiresAt  = new Date(Date.now() + tokenData.expires_in * 1000);
    conn.pendingVerifier = ''; // consumed — clear it
    conn.lastSyncAt      = null;

    const { shopId, shopName } = await etsyService.getShopInfo(
      tokenData.access_token, conn.keystring
    );
    conn.shopId   = shopId;
    conn.shopName = shopName;
    await conn.save();

    // Initial sync in background — non-blocking
    syncOrders(userId, conn).catch(e =>
      console.error('[Etsy] Initial sync error:', e.message)
    );

    res.redirect(`${FRONTEND_URL}/integrations?etsy_connected=true`);
  } catch (err) {
    console.error('[Etsy] Callback error:', err.message);
    res.redirect(`${FRONTEND_URL}/integrations?etsy_error=auth_failed`);
  }
});

// ── GET /api/etsy/status ──────────────────────────────────────────────────────
router.get('/status', authenticateToken, async (req, res) => {
  try {
    const conn = await EtsyConnection.findOne({ userId: req.user._id });
    if (!conn) return res.json({ connected: false, hasCredentials: false });

    const hasCredentials = !!(conn.keystring && conn.encryptedSharedSecret);
    const connected      = !!(conn.encryptedAccessToken && conn.accessTokenIv && conn.shopId);

    res.json({
      connected,
      hasCredentials,
      keystring:  conn.keystring  || '',
      shopId:     conn.shopId     || '',
      shopName:   conn.shopName   || '',
      lastSyncAt: conn.lastSyncAt,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── DELETE /api/etsy/disconnect ───────────────────────────────────────────────
router.delete('/disconnect', authenticateToken, async (req, res) => {
  try {
    const conn = await EtsyConnection.findOne({ userId: req.user._id });
    if (!conn) return res.status(404).json({ message: 'No Etsy connection found' });

    await conn.deleteOne();
    await EtsyOrder.deleteMany({ userId: req.user._id });

    res.json({ message: 'Etsy shop disconnected and orders removed.' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── GET /api/etsy/orders ──────────────────────────────────────────────────────
router.get('/orders', authenticateToken, async (req, res) => {
  try {
    const conn = await EtsyConnection.findOne({ userId: req.user._id });
    if (!conn || !conn.shopId) {
      return res.status(404).json({ message: 'No Etsy store connected' });
    }

    const { status, page = 1, limit = 50 } = req.query;
    const query = { userId: req.user._id };
    if (status === 'unfulfilled') query.fulfillmentStatus = 'unfulfilled';
    if (status === 'fulfilled')   query.fulfillmentStatus = 'fulfilled';

    const skip = (Number(page) - 1) * Number(limit);
    const [orders, total] = await Promise.all([
      EtsyOrder.find(query).sort({ etsyCreatedAt: -1 }).skip(skip).limit(Number(limit)),
      EtsyOrder.countDocuments(query),
    ]);

    res.json({
      orders,
      total,
      page:     Number(page),
      limit:    Number(limit),
      shopName: conn.shopName,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── POST /api/etsy/sync ───────────────────────────────────────────────────────
router.post('/sync', authenticateToken, async (req, res) => {
  try {
    const conn = await EtsyConnection.findOne({ userId: req.user._id });
    if (!conn || !conn.shopId) {
      return res.status(404).json({ message: 'No Etsy store connected' });
    }

    const count = await syncOrders(req.user._id, conn);
    res.json({ message: `Synced ${count} orders`, synced: count });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── POST /api/etsy/webhook ────────────────────────────────────────────────────
// Receives all Etsy order events (order.paid, order.shipped, order.canceled, order.delivered)
// Raw body is mounted in index.js before json() for HMAC verification
router.post('/webhook', async (req, res) => {
  const signature = req.headers['webhook-signature'];
  const webhookId = req.headers['webhook-id'];
  const timestamp = req.headers['webhook-timestamp'];

  if (!signature || !webhookId || !timestamp) {
    return res.status(401).send('Unauthorized');
  }

  const bodyStr = req.body.toString();
  let payload;
  try { payload = JSON.parse(bodyStr); } catch { return res.status(400).send('Bad JSON'); }

  const shopId = payload.shop_id ? String(payload.shop_id) : null;
  const conn   = await findConnByWebhook(shopId, webhookId, timestamp, bodyStr, signature);
  if (!conn) return res.status(401).send('Signature mismatch');

  // Respond immediately — Etsy expects a fast 200
  res.status(200).send('ok');

  try {
    if (!payload.resource_url) return;

    await etsyService.ensureFreshToken(conn);
    const accessToken = conn.getAccessToken();

    const receiptRes = await axios.get(payload.resource_url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'x-api-key':   conn.keystring,
      },
    });

    const data  = etsyService.normalizeReceipt(receiptRes.data, conn.shopId, conn.shopName);
    const saved = await EtsyOrder.findOneAndUpdate(
      { userId: conn.userId, receiptId: data.receiptId },
      { $set: { ...data, userId: conn.userId } },
      { upsert: true, new: true }
    );

    if (req.io && saved) {
      req.io.to(conn.userId.toString()).emit('etsy:new-order', saved);
    }
  } catch (err) {
    console.error('[Etsy] Webhook processing error:', err.message);
  }
});

// ── Sync helper ───────────────────────────────────────────────────────────────
async function syncOrders(userId, conn) {
  await etsyService.ensureFreshToken(conn);
  const accessToken = conn.getAccessToken();

  // Incremental sync from last run; first run = last 90 days
  const params = conn.lastSyncAt
    ? { min_last_modified: Math.floor(conn.lastSyncAt.getTime() / 1000) }
    : { min_created:       Math.floor((Date.now() - 90 * 24 * 60 * 60 * 1000) / 1000) };

  const receipts = await etsyService.fetchReceipts(
    conn.shopId, accessToken, conn.keystring, params
  );

  let upserted = 0;
  for (const receipt of receipts) {
    const data = etsyService.normalizeReceipt(receipt, conn.shopId, conn.shopName);
    await EtsyOrder.findOneAndUpdate(
      { userId, receiptId: data.receiptId },
      { $set: { ...data, userId } },
      { upsert: true, new: true }
    );
    upserted++;
  }

  conn.lastSyncAt = new Date();
  await conn.save();
  return upserted;
}

module.exports = router;
