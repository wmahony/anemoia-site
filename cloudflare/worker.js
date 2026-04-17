/**
 * Anemoia — Kunaki Fulfillment Worker
 *
 * Receives Shopify "orders/paid" webhooks, verifies the HMAC signature,
 * then forwards any vinyl line items to the Kunaki XML API for fulfillment.
 *
 * Environment variables (set in Cloudflare dashboard → Worker → Settings → Variables):
 *   SHOPIFY_WEBHOOK_SECRET   — from Shopify Admin → Settings → Notifications → Webhooks
 *   KUNAKI_USER_ID           — your Kunaki account email
 *   KUNAKI_PASSWORD          — your Kunaki account password
 *   KUNAKI_PRODUCT_ID        — PX00ZET153 (Everybody's Album vinyl/CD)
 */

export default {
  async fetch(request, env) {
    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 });
    }

    const body = await request.text();

    // ── Verify Shopify HMAC signature ──────────────────────────
    const hmacHeader = request.headers.get('X-Shopify-Hmac-Sha256');
    if (!hmacHeader) {
      return new Response('Unauthorized', { status: 401 });
    }

    const valid = await verifyShopifyHmac(body, hmacHeader, env.SHOPIFY_WEBHOOK_SECRET);
    if (!valid) {
      console.error('Invalid Shopify HMAC — possible spoofed request');
      return new Response('Unauthorized', { status: 401 });
    }

    // ── Parse order ────────────────────────────────────────────
    let order;
    try {
      order = JSON.parse(body);
    } catch (e) {
      return new Response('Bad JSON', { status: 400 });
    }

    console.log(`Order received: #${order.order_number} (${order.id})`);

    // ── Find vinyl/Kunaki line items ───────────────────────────
    // Match by SKU or by a "kunaki" tag on the line item properties
    const kunakiItems = order.line_items.filter(item => {
      const sku = (item.sku || '').toUpperCase();
      const props = (item.properties || []).map(p => p.name.toLowerCase());
      return (
        sku === (env.KUNAKI_PRODUCT_ID || '').toUpperCase() ||
        props.includes('_kunaki') ||
        (item.vendor || '').toLowerCase() === 'kunaki'
      );
    });

    if (kunakiItems.length === 0) {
      console.log(`Order #${order.order_number}: no Kunaki items, skipping.`);
      return new Response('OK — no vinyl items', { status: 200 });
    }

    // ── Build Kunaki order ─────────────────────────────────────
    const shipping = order.shipping_address || order.billing_address;
    if (!shipping) {
      console.error(`Order #${order.order_number}: no shipping address`);
      return new Response('OK — no shipping address', { status: 200 });
    }

    const totalQty = kunakiItems.reduce((sum, item) => sum + item.quantity, 0);

    const xml = buildKunakiXml({
      userId:     env.KUNAKI_USER_ID,
      password:   env.KUNAKI_PASSWORD,
      productId:  env.KUNAKI_PRODUCT_ID,
      quantity:   totalQty,
      name:       shipping.name,
      address1:   shipping.address1,
      address2:   shipping.address2 || '',
      city:       shipping.city,
      state:      shipping.province_code || shipping.province || '',
      postalCode: shipping.zip,
      country:    shipping.country_code,
      email:      order.email || '',
    });

    console.log(`Sending Kunaki order for #${order.order_number}, qty: ${totalQty}`);

    // ── Call Kunaki API ────────────────────────────────────────
    let kunakiText;
    try {
      const kunakiRes = await fetch('https://www.kunaki.com/sales.asp', {
        method:  'POST',
        headers: { 'Content-Type': 'application/xml' },
        body:    xml,
      });
      kunakiText = await kunakiRes.text();
    } catch (e) {
      console.error(`Kunaki fetch error for order #${order.order_number}:`, e.message);
      // Return 200 so Shopify doesn't retry — log and investigate manually
      return new Response('OK — Kunaki network error', { status: 200 });
    }

    console.log(`Kunaki response for order #${order.order_number}:`, kunakiText);

    // Kunaki returns <StatusCode>0</StatusCode> on success
    if (!kunakiText.includes('<StatusCode>0</StatusCode>')) {
      console.error(`Kunaki order FAILED for #${order.order_number}:`, kunakiText);
    } else {
      console.log(`Kunaki order SUCCESS for #${order.order_number}`);
    }

    // Always return 200 — Shopify will retry on non-2xx, which could cause double-orders
    return new Response('OK', { status: 200 });
  },
};

// ── Helpers ────────────────────────────────────────────────────

async function verifyShopifyHmac(body, hmacHeader, secret) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig    = await crypto.subtle.sign('HMAC', key, encoder.encode(body));
  const computed = btoa(String.fromCharCode(...new Uint8Array(sig)));
  return computed === hmacHeader;
}

function buildKunakiXml({ userId, password, productId, quantity, name, address1, address2, city, state, postalCode, country, email }) {
  const e = escapeXml;
  return `<?xml version="1.0" encoding="UTF-8"?>
<OrderRequest>
  <UserId>${e(userId)}</UserId>
  <Password>${e(password)}</Password>
  <Mode>1</Mode>
  <Order>
    <ShipToName>${e(name)}</ShipToName>
    <ShipToAddress1>${e(address1)}</ShipToAddress1>${address2 ? `
    <ShipToAddress2>${e(address2)}</ShipToAddress2>` : ''}
    <ShipToCity>${e(city)}</ShipToCity>
    <ShipToState>${e(state)}</ShipToState>
    <ShipToPostalCode>${e(postalCode)}</ShipToPostalCode>
    <ShipToCountry>${e(country)}</ShipToCountry>
    <ShipToEmail>${e(email)}</ShipToEmail>
    <Item>
      <ProductId>${e(productId)}</ProductId>
      <Quantity>${quantity}</Quantity>
    </Item>
  </Order>
</OrderRequest>`;
}

function escapeXml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
