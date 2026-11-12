import test from 'node:test';
import assert from 'node:assert/strict';
import { PayPalAdapter } from '../src/adapters/paypalAdapter.js';

function createMockFetch() {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url, method: init.method, headers: init.headers, body: init.body });

    if (url.endsWith('/v1/oauth2/token')) {
      return new Response(JSON.stringify({ access_token: 'tok_test_123', expires_in: 3600 }), {
        status: 200
      });
    }
    if (url.endsWith('/v2/checkout/orders')) {
      return new Response(
        JSON.stringify({
          id: 'ORD-PP-999',
          status: 'CREATED',
          links: [{ rel: 'approve', href: 'https://www.sandbox.paypal.com/checkoutnow?token=ORD-PP-999' }]
        }),
        { status: 201 }
      );
    }
    if (url.endsWith('/v2/checkout/orders/ORD-PP-999/authorize')) {
      return new Response(
        JSON.stringify({
          id: 'ORD-PP-999',
          status: 'COMPLETED',
          purchase_units: [
            {
              payments: {
                authorizations: [
                  {
                    id: 'AUTH-PP-778899',
                    status: 'CREATED',
                    expiration_time: '2026-12-10T12:00:00Z'
                  }
                ]
              }
            }
          ]
        }),
        { status: 201 }
      );
    }
    if (url.endsWith('/v2/payments/authorizations/AUTH-PP-778899/capture')) {
      return new Response(JSON.stringify({ id: 'CAP-PP-1122', status: 'COMPLETED' }), { status: 201 });
    }
    if (url.endsWith('/v2/payments/authorizations/AUTH-PP-778899/reauthorize')) {
      return new Response(
        JSON.stringify({
          id: 'AUTH-PP-REAUTH2',
          status: 'CREATED',
          expiration_time: '2026-12-20T12:00:00Z'
        }),
        { status: 201 }
      );
    }
    if (url.endsWith('/v2/payments/authorizations/AUTH-PP-REAUTH2/void')) {
      return new Response(null, { status: 204 });
    }

    return new Response(JSON.stringify({ message: 'Unexpected URL' }), { status: 500 });
  };

  return { fetchImpl, calls };
}

test('PayPalAdapter executes Orders v2 AUTHORIZE, authorize, capture, reauthorize, and void', async () => {
  const { fetchImpl, calls } = createMockFetch();
  const adapter = new PayPalAdapter({
    clientId: 'client-id-test',
    clientSecret: 'client-secret-test',
    sandbox: true,
    fetchImpl
  });

  // 1. Create order with intent=AUTHORIZE
  const order = await adapter.createPreAuth({
    amount: 1500,
    currency: 'EUR',
    reference: 'B2B-REF-1',
    idempotencyKey: 'req-order-1'
  });
  assert.equal(order.status, 'PENDING_APPROVAL');
  assert.equal(order.orderId, 'ORD-PP-999');
  assert.ok(order.approveUrl.includes('ORD-PP-999'));

  const orderBody = JSON.parse(calls[1].body);
  assert.equal(orderBody.intent, 'AUTHORIZE');
  assert.equal(orderBody.purchase_units[0].amount.value, '1500.00');
  assert.equal(calls[1].headers['PayPal-Request-Id'], 'req-order-1');

  // 2. Authorize order
  const auth = await adapter.authorizeOrder('ORD-PP-999', 'req-auth-1');
  assert.equal(auth.status, 'AUTHORIZED');
  assert.equal(auth.authorizationId, 'AUTH-PP-778899');
  assert.equal(auth.approvalCode, '778899');

  // 3. Partial capture
  const cap = await adapter.capture({
    authorizationId: auth.authorizationId,
    amount: 500,
    currency: 'EUR',
    finalCapture: false,
    idempotencyKey: 'req-cap-1'
  });
  assert.equal(cap.captureId, 'CAP-PP-1122');

  // 4. Reauthorize
  const reauth = await adapter.reauthorize({
    authorizationId: auth.authorizationId,
    amount: 1000,
    currency: 'EUR',
    idempotencyKey: 'req-reauth-1'
  });
  assert.equal(reauth.authorizationId, 'AUTH-PP-REAUTH2');

  // 5. Void
  const voided = await adapter.void({
    authorizationId: reauth.authorizationId,
    idempotencyKey: 'req-void-1'
  });
  assert.equal(voided.authorizationId, 'AUTH-PP-REAUTH2');
});
