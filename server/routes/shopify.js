const express  = require('express');
const jwt      = require('jsonwebtoken');
const crypto   = require('crypto');
const { authenticateToken } = require('../middleware/auth');
const ShopifyConnection     = require('../models/ShopifyConnection');
const ShopifyOrder          = require('../models/ShopifyOrder');
const shopifyService        = require('../services/shopify');

const router = express.Router();

const CLIENT_ID     = process.env.SHOPIFY_CLIENT_ID;
const CLIENT_SECRET = process.env.SHOPIFY_CLIENT_SECRET;
const CALLBACK_URL  = 'https://labeluniverse-production.up.railway.app/api/shopify/callback';
const FRONTEND_URL  = process.env.CLIENT_URL || 'https://labeluniverse.vercel.app';
const SCOPES        = 'read_orders,read_customers';

// ── Helpers ───────────────────────────────────────────────────────────────────
function normaliseShop(raw) {
  // Strip protocol, whitespace, and trailing slashes
  let shop = raw.trim().toLowerCase()
    .replace(/https?:\/\//gi, '')
    .replace(/\/$/, '')
    .split('/')[0];  // take only the hostname, discard any path

  // Accept only bare store names (e.g. "mystore") or full myshopify.com hostnames
  if (shop.includes('.myshopify.com')) {
    // Already correct — keep as-is
    return shop;
  }

  // Reject any other domain (e.g. shopifypreview.com, shopify.com, etc.)
  if (shop.includes('.') && !shop.endsWith('.myshopify.com')) {
    throw new Error(
      `"${raw}" is not a valid Shopify store URL. ` +
      `Enter your store name (e.g. "mystore") or your myshopify.com URL (e.g. "mystore.myshopify.com").`
    );
  }

  return `${shop}.myshopify.com`;
}

// ── GET /api/shopify/auth-url?shop=mystore.myshopify.com ─────────────────────
// Returns the Shopify OAuth URL for the frontend to redirect to.
router.get('/auth-url', authenticateToken, (req, res) => {
  const { shop: rawShop } = req.query;
  if (!rawShop) return res.status(400).json({ message: 'shop parameter is required' });

  let shop;
  try {
    shop = normaliseShop(rawShop);
  } catch (err) {
    return res.status(400).json({ message: err.message });
  }
  // Encode userId + nonce in state so callback can identify the user
  const state = jwt.sign(
    { userId: String(req.user._id), nonce: crypto.randomBytes(8).toString('hex') },
    process.env.JWT_SECRET,
    { expiresIn: '15m' }
  );

  const authUrl =
    `https://${shop}/admin/oauth/authorize` +
    `?client_id=${CLIENT_ID}` +
    `&scope=${SCOPES}` +
    `&redirect_uri=${encodeURIComponent(CALLBACK_URL)}` +
    `&state=${encodeURIComponent(state)}`;

  res.json({ authUrl, shop });
});

// ── GET /api/shopify/callback  (Shopify redirects here after user approval) ───
router.get('/callback', async (req, res) => {
  const { code, shop: rawShop, state, hmac } = req.query;

  if (!code || !rawShop || !state) {
    return res.redirect(`${FRONTEND_URL}/orders?error=missing_params`);
  }

  // Verify state JWT to retrieve userId
  let userId;
  try {
    const decoded = jwt.verify(state, process.env.JWT_SECRET);
    userId = decoded.userId;
  } catch {
    return res.redirect(`${FRONTEND_URL}/orders?error=invalid_state`);
  }

  const shop = normaliseShop(rawShop);

  try {
    // Exchange code for permanent access token
    const { access_token, scope } = await shopifyService.exchangeCodeForToken(shop, code);

    // Upsert connection (one store per user)
    let conn = await ShopifyConnection.findOne({ userId });
    if (!conn) conn = new ShopifyConnection({ userId, shop, encryptedToken: '', iv: '' });

    conn.shop  = shop;
    conn.scope = scope || SCOPES;
    conn.setAccessToken(access_token);
    conn.lastSyncAt = null;
    await conn.save();

    // Register orders/create webhook (best-effort)
    try {
      if (conn.webhookId) {
        await shopifyService.deleteWebhook(shop, access_token, conn.webhookId);
      }
      const webhook = await shopifyService.registerWebhook(shop, access_token);
      conn.webhookId = String(webhook.id);
      await conn.save();
    } catch (whErr) {
      console.warn('[Shopify] Webhook registration failed:', whErr.message);
    }

    // Trigger initial sync in background (non-blocking)
    syncOrders(userId, conn).catch(e => console.error('[Shopify] Initial sync error:', e.message));

    res.redirect(`${FRONTEND_URL}/orders?connected=true`);
  } catch (err) {
    console.error('[Shopify] Callback error:', err.message);
    res.redirect(`${FRONTEND_URL}/orders?error=auth_failed`);
  }
});

// ── GET /api/shopify/status ───────────────────────────────────────────────────
router.get('/status', authenticateToken, async (req, res) => {
  try {
    const conn = await ShopifyConnection.findOne({ userId: req.user._id });
    if (!conn) return res.json({ connected: false });
    res.json({
      connected:   true,
      shop:        conn.shop,
      scope:       conn.scope,
      connectedAt: conn.createdAt,
      lastSyncAt:  conn.lastSyncAt,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── DELETE /api/shopify/disconnect ────────────────────────────────────────────
router.delete('/disconnect', authenticateToken, async (req, res) => {
  try {
    const conn = await ShopifyConnection.findOne({ userId: req.user._id });
    if (!conn) return res.status(404).json({ message: 'No Shopify connection found' });

    // Best-effort webhook cleanup
    try {
      const token = conn.getAccessToken();
      if (conn.webhookId) await shopifyService.deleteWebhook(conn.shop, token, conn.webhookId);
    } catch {}

    await conn.deleteOne();
    await ShopifyOrder.deleteMany({ userId: req.user._id });

    res.json({ message: 'Shopify store disconnected and orders removed.' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── GET /api/shopify/customers ───────────────────────────────────────────────
router.get('/customers', authenticateToken, async (req, res) => {
  try {
    const conn = await ShopifyConnection.findOne({ userId: req.user._id });
    if (!conn) return res.status(404).json({ message: 'No Shopify store connected' });

    const { search = '', page = 1, limit = 50 } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    const matchStage = { userId: req.user._id };

    const pipeline = [
      { $match: matchStage },
      { $group: {
        _id: '$customer.email',
        firstName:     { $last: '$customer.firstName' },
        lastName:      { $last: '$customer.lastName' },
        email:         { $last: '$customer.email' },
        phone:         { $last: '$customer.phone' },
        orderCount:    { $sum: 1 },
        totalSpent:    { $sum: { $toDouble: { $ifNull: ['$totalPrice', '0'] } } },
        lastOrderDate: { $max: '$shopifyCreatedAt' },
        city:          { $last: '$shippingAddress.city' },
        provinceCode:  { $last: '$shippingAddress.provinceCode' },
      }},
      { $sort: { lastOrderDate: -1 } },
    ];

    let customers = await ShopifyOrder.aggregate(pipeline);

    if (search) {
      const q = search.toLowerCase();
      customers = customers.filter(c =>
        `${c.firstName} ${c.lastName}`.toLowerCase().includes(q) ||
        (c.email || '').toLowerCase().includes(q)
      );
    }

    const total = customers.length;
    const paged = customers.slice(skip, skip + Number(limit));

    res.json({ customers: paged, total, page: Number(page), limit: Number(limit) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── GET /api/shopify/orders ───────────────────────────────────────────────────
router.get('/orders', authenticateToken, async (req, res) => {
  try {
    const conn = await ShopifyConnection.findOne({ userId: req.user._id });
    if (!conn) return res.status(404).json({ message: 'No Shopify store connected' });

    const { status, page = 1, limit = 50 } = req.query;
    const query = { userId: req.user._id };
    if (status === 'unfulfilled') query.fulfillmentStatus = 'unfulfilled';
    if (status === 'fulfilled')   query.fulfillmentStatus = 'fulfilled';

    const skip   = (Number(page) - 1) * Number(limit);
    const [orders, total] = await Promise.all([
      ShopifyOrder.find(query).sort({ shopifyCreatedAt: -1 }).skip(skip).limit(Number(limit)),
      ShopifyOrder.countDocuments(query),
    ]);

    res.json({ orders, total, page: Number(page), limit: Number(limit), shop: conn.shop });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── POST /api/shopify/sync ────────────────────────────────────────────────────
router.post('/sync', authenticateToken, async (req, res) => {
  try {
    const conn = await ShopifyConnection.findOne({ userId: req.user._id });
    if (!conn) return res.status(404).json({ message: 'No Shopify store connected' });

    const count = await syncOrders(req.user._id, conn);
    res.json({ message: `Synced ${count} orders`, synced: count });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── POST /api/shopify/webhook/orders-create ───────────────────────────────────
// Shopify pushes new orders here in real-time.
// Uses express.raw() middleware applied at registration in index.js.
router.post('/webhook/orders-create', async (req, res) => {
  const hmacHeader = req.headers['x-shopify-hmac-sha256'];
  const shop       = req.headers['x-shopify-shop-domain'];

  if (!hmacHeader || !shop) return res.status(401).send('Unauthorized');

  // Verify HMAC using raw body
  try {
    const valid = shopifyService.verifyWebhookHmac(req.body, hmacHeader);
    if (!valid) return res.status(401).send('HMAC mismatch');
  } catch {
    return res.status(401).send('HMAC error');
  }

  // Respond immediately — Shopify requires a fast 200
  res.status(200).send('ok');

  // Process async
  try {
    const conn = await ShopifyConnection.findOne({ shop: shop.toLowerCase() });
    if (!conn) return;

    const order  = JSON.parse(req.body.toString());
    const data   = shopifyService.normalizeOrder(order, conn.shop);
    const saved  = await ShopifyOrder.findOneAndUpdate(
      { userId: conn.userId, shopifyOrderId: data.shopifyOrderId },
      { $set: { ...data, userId: conn.userId } },
      { upsert: true, new: true }
    );

    // Push real-time update to the user's browser via socket.io
    if (req.io && saved) {
      req.io.to(conn.userId.toString()).emit('shopify:new-order', saved);
    }
  } catch (err) {
    console.error('[Shopify] Webhook processing error:', err.message);
  }
});

// ── GDPR: customers/data_request ─────────────────────────────────────────────
// Shopify sends this when a customer requests a copy of their data.
// We must respond 200 within 5 seconds. Actual fulfilment is manual/email.
router.post('/webhook/customers-data-request', async (req, res) => {
  const hmac = req.headers['x-shopify-hmac-sha256'];
  const shop  = req.headers['x-shopify-shop-domain'];
  if (!hmac || !shop) return res.status(401).send('Unauthorized');
  try {
    if (!shopifyService.verifyWebhookHmac(req.body, hmac)) return res.status(401).send('HMAC mismatch');
  } catch { return res.status(401).send('HMAC error'); }

  res.status(200).send('ok');

  try {
    const payload = JSON.parse(req.body.toString());
    console.log(`[Shopify GDPR] data_request — shop: ${shop}, customer: ${payload.customer?.email}`);
    // No PII stored beyond shipping addresses on orders — nothing to export.
    // If required, send payload.data_request.id to Shopify's fulfillment endpoint.
  } catch (err) {
    console.error('[Shopify GDPR] customers/data_request error:', err.message);
  }
});

// ── GDPR: customers/redact ────────────────────────────────────────────────────
// Shopify sends this when a customer requests deletion of their personal data.
// We delete their shipping info from any synced orders.
router.post('/webhook/customers-redact', async (req, res) => {
  const hmac = req.headers['x-shopify-hmac-sha256'];
  const shop  = req.headers['x-shopify-shop-domain'];
  if (!hmac || !shop) return res.status(401).send('Unauthorized');
  try {
    if (!shopifyService.verifyWebhookHmac(req.body, hmac)) return res.status(401).send('HMAC mismatch');
  } catch { return res.status(401).send('HMAC error'); }

  res.status(200).send('ok');

  try {
    const payload   = JSON.parse(req.body.toString());
    const orderIds  = (payload.orders_to_redact || []).map(o => String(o.id));
    if (!orderIds.length) return;

    // Redact personal data — blank out customer + shipping address fields
    await ShopifyOrder.updateMany(
      { shop: shop.toLowerCase(), shopifyOrderId: { $in: orderIds } },
      {
        $set: {
          'customer.firstName': '[redacted]',
          'customer.lastName':  '[redacted]',
          'customer.email':     '[redacted]',
          'customer.phone':     '[redacted]',
          'shippingAddress.firstName': '[redacted]',
          'shippingAddress.lastName':  '[redacted]',
          'shippingAddress.company':   '[redacted]',
          'shippingAddress.address1':  '[redacted]',
          'shippingAddress.address2':  '[redacted]',
          'shippingAddress.phone':     '[redacted]',
        },
      }
    );
    console.log(`[Shopify GDPR] customers/redact — redacted ${orderIds.length} order(s) for shop: ${shop}`);
  } catch (err) {
    console.error('[Shopify GDPR] customers/redact error:', err.message);
  }
});

// ── GDPR: shop/redact ─────────────────────────────────────────────────────────
// Shopify sends this 48 hours after a merchant uninstalls the app.
// We must delete ALL data associated with that shop.
router.post('/webhook/shop-redact', async (req, res) => {
  const hmac = req.headers['x-shopify-hmac-sha256'];
  const shop  = req.headers['x-shopify-shop-domain'];
  if (!hmac || !shop) return res.status(401).send('Unauthorized');
  try {
    if (!shopifyService.verifyWebhookHmac(req.body, hmac)) return res.status(401).send('HMAC mismatch');
  } catch { return res.status(401).send('HMAC error'); }

  res.status(200).send('ok');

  try {
    const conn = await ShopifyConnection.findOne({ shop: shop.toLowerCase() });
    if (conn) {
      await ShopifyOrder.deleteMany({ userId: conn.userId });
      await conn.deleteOne();
      console.log(`[Shopify GDPR] shop/redact — all data deleted for shop: ${shop}`);
    }
  } catch (err) {
    console.error('[Shopify GDPR] shop/redact error:', err.message);
  }
});

// ── Sync helper ───────────────────────────────────────────────────────────────
async function syncOrders(userId, conn) {
  const accessToken = conn.getAccessToken();

  // Fetch all paid open orders + historical (last 90 days for first sync)
  const params = conn.lastSyncAt
    ? { created_at_min: conn.lastSyncAt.toISOString() }
    : { created_at_min: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString() };

  const rawOrders = await shopifyService.fetchOrders(conn.shop, accessToken, params);

  let upserted = 0;
  for (const raw of rawOrders) {
    const data = shopifyService.normalizeOrder(raw, conn.shop);
    await ShopifyOrder.findOneAndUpdate(
      { userId, shopifyOrderId: data.shopifyOrderId },
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
