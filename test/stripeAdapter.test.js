import test from 'node:test';
import assert from 'node:assert/strict';
import { StripeAdapter } from '../src/adapters/stripeAdapter.js';

function createStripeMockFetch() {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url, method: init.method, headers: init.headers, body: init.body });

    if (url.endsWith('/v1/payment_intents')) {
      return new Response(
        JSON.stringify({
          id: 'pi_3ABC123456',
          status: 'requires_capture',
          currency: 'eur',
          latest_charge: {
            id: 'ch_3ABC123456',
            payment_method_details: {
              card: {
                network_transaction_id: 'NTR-VISA-9988',
                receipt: { authorization_code: '654321' }
              }
            }
          }
        }),
        { status: 200 }
      );
    }

    if (url.endsWith('/v1/payment_intents/pi_3ABC123456/capture')) {
      return new Response(
        JSON.stringify({
          id: 'pi_3ABC123456',
          status: 'succeeded',
          currency: 'eur',
          latest_charge: 'ch_3ABC123456'
        }),
        { status: 200 }
      );
    }

    if (url.endsWith('/v1/payment_intents/pi_3ABC123456/cancel')) {
      return new Response(
        JSON.stringify({
          id: 'pi_3ABC123456',
          status: 'canceled'
        }),
        { status: 200 }
      );
    }

    return new Response(JSON.stringify({ error: { message: 'Unexpected URL' } }), { status: 404 });
  };
  return { fetchImpl, calls };
}

test('StripeAdapter creates manual-capture PaymentIntent, extracts authorization_code, captures, and voids', async () => {
  const { fetchImpl, calls } = createStripeMockFetch();
  const adapter = new StripeAdapter({
    secretKey: 'sk_test_mock_123',
    fetchImpl
  });

  const preauth = await adapter.createPreAuth({
    amount: 245.5,
    currency: 'EUR',
    reference: 'INV-STRIPE-1',
    paymentMethodToken: 'pm_card_visa',
    idempotencyKey: 'idem-stripe-1'
  });

  assert.equal(preauth.status, 'AUTHORIZED');
  assert.equal(preauth.authorizationId, 'pi_3ABC123456');
  assert.equal(preauth.approvalCode, '654321');
  assert.equal(preauth.networkReference, 'NTR-VISA-9988');

  const formParams = new URLSearchParams(calls[0].body);
  assert.equal(formParams.get('amount'), '24550');
  assert.equal(formParams.get('currency'), 'eur');
  assert.equal(formParams.get('capture_method'), 'manual');
  assert.equal(formParams.get('confirm'), 'true');
  assert.equal(calls[0].headers['Idempotency-Key'], 'idem-stripe-1');

  const captured = await adapter.capture({
    authorizationId: preauth.authorizationId,
    amount: 200,
    idempotencyKey: 'idem-stripe-cap'
  });
  assert.equal(captured.captureId, 'ch_3ABC123456');
  assert.equal(new URLSearchParams(calls[1].body).get('amount_to_capture'), '20000');

  const voided = await adapter.void({
    authorizationId: preauth.authorizationId,
    idempotencyKey: 'idem-stripe-void'
  });
  assert.equal(voided.authorizationId, 'pi_3ABC123456');
  assert.equal(new URLSearchParams(calls[2].body).get('cancellation_reason'), 'requested_by_customer');
});
