import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/server.js';
import { PayPalStore } from '../src/storage/paypalStore.js';

test('PayPalStore records events and prevents duplicates', async () => {
  const store = new PayPalStore(null);
  const event1 = await store.recordEvent({
    id: 'WH-12345',
    event_type: 'PAYMENT.AUTHORIZATION.CREATED',
    summary: 'Hold created for 500 EUR',
    resource: {
      id: 'AUTH-999',
      amount: { value: '500.00', currency_code: 'EUR' },
      status: 'CREATED'
    }
  });

  assert.equal(event1.id, 'WH-12345');
  assert.equal(event1.eventType, 'PAYMENT.AUTHORIZATION.CREATED');
  assert.equal(event1.amount, 500);
  assert.equal(event1.currency, 'EUR');

  const list = await store.list();
  assert.equal(list.length, 1);

  // Retransmit same event id with updated status
  await store.recordEvent({
    id: 'WH-12345',
    event_type: 'PAYMENT.AUTHORIZATION.CREATED',
    summary: 'Hold created for 500 EUR',
    resource: {
      id: 'AUTH-999',
      amount: { value: '500.00', currency_code: 'EUR' },
      status: 'CAPTURED'
    }
  });

  const updatedList = await store.list();
  assert.equal(updatedList.length, 1);
  assert.equal(updatedList[0].status, 'CAPTURED');
});

test('POST /api/webhooks/paypal receives notifications and GET /api/paypal/events lists them', async () => {
  const paypalStore = new PayPalStore(null);
  const { server } = createApp({ paypalStore });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;

  try {
    const postRes = await fetch(`http://127.0.0.1:${port}/api/webhooks/paypal`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: 'WH-EVENT-001',
        event_type: 'PAYMENT.CAPTURE.COMPLETED',
        summary: 'Payment capture completed',
        resource: {
          id: 'CAP-777',
          amount: { value: '1.00', currency_code: 'EUR' },
          status: 'COMPLETED',
          payer: { email_address: 'kqvcynkz7bjda@dcc2.paypal.com' }
        }
      })
    });

    assert.equal(postRes.status, 200);
    const postData = await postRes.json();
    assert.equal(postData.ok, true);
    assert.equal(postData.eventId, 'WH-EVENT-001');

    const getRes = await fetch(`http://127.0.0.1:${port}/api/paypal/events`);
    assert.equal(getRes.status, 200);
    const getData = await getRes.json();
    assert.equal(getData.events.length, 1);
    assert.equal(getData.events[0].id, 'WH-EVENT-001');
    assert.equal(getData.events[0].amount, 1.0);
    assert.equal(getData.events[0].currency, 'EUR');
    assert.equal(getData.events[0].payerEmail, 'kqvcynkz7bjda@dcc2.paypal.com');
  } finally {
    server.close();
  }
});
