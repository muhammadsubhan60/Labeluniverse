const axios  = require('axios');
const crypto = require('crypto');

const API_VERSION = '2024-10';

// ── Token exchange ────────────────────────────────────────────────────────────
async function exchangeCodeForToken(shop, code) {
  const res = await axios.post(`https://${shop}/admin/oauth/access_token`, {
    client_id:     process.env.SHOPIFY_CLIENT_ID,
    client_secret: process.env.SHOPIFY_CLIENT_SECRET,
    code,
  });
  return res.data; // { access_token, scope }
}

// ── Orders ────────────────────────────────────────────────────────────────────
async function fetchOrders(shop, accessToken, params = {}) {
  const allOrders = [];
  let pageInfo    = null;
  let isFirst     = true;

  while (isFirst || pageInfo) {
    isFirst = false;
    const query = {
      limit:            250,
      financial_status: 'paid',
      status:           'open',
      ...params,
    };
    if (pageInfo) {
      query.page_info = pageInfo;
      // when paginating, Shopify ignores other filters — remove them
      delete query.financial_status;
      delete query.status;
      delete query.created_at_min;
    }

    const res = await axios.get(
      `https://${shop}/admin/api/${API_VERSION}/orders.json`,
      {
        headers: { 'X-Shopify-Access-Token': accessToken },
        params:  query,
      }
    );

    allOrders.push(...(res.data.orders || []));

    // Cursor-based pagination via Link header
    const linkHeader = res.headers['link'] || '';
    const nextMatch  = linkHeader.match(/<[^>]+page_info=([^&>]+)[^>]*>;\s*rel="next"/);
    pageInfo = nextMatch ? nextMatch[1] : null;
  }

  return allOrders;
}

// ── Webhook registration ──────────────────────────────────────────────────────
async function registerWebhook(shop, accessToken) {
  const address = `${process.env.RAILWAY_PUBLIC_DOMAIN || 'https://labeluniverse-production.up.railway.app'}/api/shopify/webhook/orders-create`;
  const res = await axios.post(
    `https://${shop}/admin/api/${API_VERSION}/webhooks.json`,
    { webhook: { topic: 'orders/create', address, format: 'json' } },
    { headers: { 'X-Shopify-Access-Token': accessToken } }
  );
  return res.data.webhook;
}

async function deleteWebhook(shop, accessToken, webhookId) {
  await axios.delete(
    `https://${shop}/admin/api/${API_VERSION}/webhooks/${webhookId}.json`,
    { headers: { 'X-Shopify-Access-Token': accessToken } }
  ).catch(() => {}); // best-effort
}

// ── HMAC verification (for incoming webhooks) ─────────────────────────────────
function verifyWebhookHmac(rawBody, hmacHeader) {
  const digest = crypto
    .createHmac('sha256', process.env.SHOPIFY_CLIENT_SECRET)
    .update(rawBody)
    .digest('base64');
  return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(hmacHeader));
}

// ── Map raw Shopify order → our schema shape ──────────────────────────────────
function normalizeOrder(order, shop) {
  const addr = order.shipping_address || {};
  return {
    shop,
    shopifyOrderId:   String(order.id),
    orderNumber:      String(order.order_number || order.name || order.id),
    customer: {
      firstName: order.customer?.first_name || addr.first_name || '',
      lastName:  order.customer?.last_name  || addr.last_name  || '',
      email:     order.customer?.email || order.email || '',
      phone:     order.customer?.phone || addr.phone || '',
    },
    shippingAddress: {
      firstName:    addr.first_name   || '',
      lastName:     addr.last_name    || '',
      company:      addr.company      || '',
      address1:     addr.address1     || '',
      address2:     addr.address2     || '',
      city:         addr.city         || '',
      province:     addr.province     || '',
      provinceCode: addr.province_code || '',
      zip:          addr.zip          || '',
      country:      addr.country      || '',
      phone:        addr.phone        || '',
    },
    lineItems: (order.line_items || []).map(li => ({
      title:    li.title,
      sku:      li.sku || '',
      quantity: li.quantity,
      price:    li.price,
    })),
    totalPrice:        order.total_price,
    currency:          order.currency || 'USD',
    financialStatus:   order.financial_status,
    fulfillmentStatus: order.fulfillment_status || 'unfulfilled',
    shopifyCreatedAt:  new Date(order.created_at),
  };
}

module.exports = {
  exchangeCodeForToken,
  fetchOrders,
  registerWebhook,
  deleteWebhook,
  verifyWebhookHmac,
  normalizeOrder,
};
