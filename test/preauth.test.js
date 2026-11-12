import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createApp } from '../src/server.js';
import { JsonLedgerStore } from '../src/storage/jsonStore.js';

async function startTestServer() {
  const store = new JsonLedgerStore(null);
  const { server, service } = createApp({
    store,
    config: {
      port: 0,
      processorMode: 'simulator',
      defaultCurrency: 'EUR',
      holdTtlDays: 7,
      paypalClientId: '',
      paypalClientSecret: ''
    }
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;
  return { server, service, baseUrl };
}

test('single pre-auth, approval-code lookup, partial capture, final capture, and void guard', async () => {
  const { server, baseUrl } = await startTestServer();
  try {
    // 1. Create pre-auth
    const createRes = await fetch(`${baseUrl}/api/preauths`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': 'idem-1' },
      body: JSON.stringify({
        amount: 1000,
        currency: 'EUR',
        reference: 'INV-1001',
        customerLabel: 'Firma Test s.r.o.'
      })
    });
    assert.equal(createRes.status, 201);
    const created = await createRes.json();
    assert.equal(created.replayed, false);
    assert.equal(created.record.status, 'AUTHORIZED');
    assert.match(created.record.approvalCode, /^[A-Z0-9]{6}$/);
    assert.equal(created.record.remainingAmount, 1000);

    // 2. Idempotency replay returns same record with 200
    const replayRes = await fetch(`${baseUrl}/api/preauths`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': 'idem-1' },
      body: JSON.stringify({ amount: 1000, currency: 'EUR', reference: 'INV-1001' })
    });
    assert.equal(replayRes.status, 200);
    const replayed = await replayRes.json();
    assert.equal(replayed.replayed, true);
    assert.equal(replayed.record.id, created.record.id);

    // 3. Lookup by approvalCode (case-insensitive)
    const lookupRes = await fetch(
      `${baseUrl}/api/preauths/lookup?code=${created.record.approvalCode.toLowerCase()}`
    );
    assert.equal(lookupRes.status, 200);
    const lookedUp = await lookupRes.json();
    assert.equal(lookedUp.record.id, created.record.id);

    // 4. Partial capture (400 EUR)
    const cap1Res = await fetch(`${baseUrl}/api/preauths/${created.record.approvalCode}/capture`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount: 400, finalCapture: false })
    });
    assert.equal(cap1Res.status, 200);
    const cap1 = await cap1Res.json();
    assert.equal(cap1.record.status, 'PARTIALLY_CAPTURED');
    assert.equal(cap1.record.capturedAmount, 400);
    assert.equal(cap1.record.remainingAmount, 600);

    // 5. Over-capture guard (700 > 600)
    const overRes = await fetch(`${baseUrl}/api/preauths/${created.record.id}/capture`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount: 700 })
    });
    assert.equal(overRes.status, 400);
    const overErr = await overRes.json();
    assert.equal(overErr.code, 'OVER_CAPTURE');

    // 6. Final capture of remaining 600
    const cap2Res = await fetch(`${baseUrl}/api/preauths/${created.record.id}/capture`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    assert.equal(cap2Res.status, 200);
    const cap2 = await cap2Res.json();
    assert.equal(cap2.record.status, 'CAPTURED');
    assert.equal(cap2.record.capturedAmount, 1000);
    assert.equal(cap2.record.remainingAmount, 0);

    // 7. Cannot void after full capture
    const voidAfterRes = await fetch(`${baseUrl}/api/preauths/${created.record.id}/void`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}'
    });
    assert.equal(voidAfterRes.status, 409);
  } finally {
    server.close();
  }
});

test('PCI-DSS guard rejects raw cardNumber and CVV', async () => {
  const { server, baseUrl } = await startTestServer();
  try {
    const res = await fetch(`${baseUrl}/api/preauths`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount: 250,
        currency: 'EUR',
        reference: 'INV-PCI',
        cardNumber: '4111111111111111',
        cvv: '123'
      })
    });
    assert.equal(res.status, 400);
    const data = await res.json();
    assert.equal(data.code, 'PCI_FORBIDDEN_FIELD');
  } finally {
    server.close();
  }
});

test('reauthorize and void lifecycle + batch pre-auth and batch capture', async () => {
  const { server, baseUrl } = await startTestServer();
  try {
    // Batch create (2 valid, 1 simulated decline)
    const batchCreateRes = await fetch(`${baseUrl}/api/preauths/batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: [
          { amount: 500, currency: 'EUR', reference: 'B-1' },
          { amount: 750, currency: 'EUR', reference: 'B-2' },
          { amount: 300, currency: 'EUR', reference: 'DECLINE-TEST' }
        ]
      })
    });
    assert.equal(batchCreateRes.status, 200);
    const batchCreated = await batchCreateRes.json();
    assert.equal(batchCreated.total, 3);
    assert.equal(batchCreated.succeeded, 2);
    assert.equal(batchCreated.failed, 1);

    const code1 = batchCreated.results[0].record.approvalCode;
    const authBefore = batchCreated.results[0].record.authorizationId;
    const code2 = batchCreated.results[1].record.approvalCode;

    // Reauthorize first hold
    const reauthRes = await fetch(`${baseUrl}/api/preauths/${code1}/reauthorize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}'
    });
    assert.equal(reauthRes.status, 200);
    const reauthed = await reauthRes.json();
    assert.notEqual(reauthed.record.authorizationId, authBefore);

    // Void second hold
    const voidRes = await fetch(`${baseUrl}/api/preauths/${code2}/void`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: 'Order cancelled' })
    });
    assert.equal(voidRes.status, 200);
    const voided = await voidRes.json();
    assert.equal(voided.record.status, 'VOIDED');
    assert.equal(voided.record.remainingAmount, 0);

    // Batch capture: first succeeds, second fails (already voided)
    const batchCapRes = await fetch(`${baseUrl}/api/preauths/batch-capture`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: [
          { approvalCode: code1, amount: 500 },
          { approvalCode: code2, amount: 750 }
        ]
      })
    });
    assert.equal(batchCapRes.status, 200);
    const batchCap = await batchCapRes.json();
    assert.equal(batchCap.succeeded, 1);
    assert.equal(batchCap.failed, 1);

    // Summary endpoint reflects 500 authorized/captured
    const sumRes = await fetch(`${baseUrl}/api/summary`);
    assert.equal(sumRes.status, 200);
    const sum = await sumRes.json();
    assert.equal(sum.capturedVolume, 500);
    assert.equal(sum.remainingHeldVolume, 0);
  } finally {
    server.close();
  }
});
