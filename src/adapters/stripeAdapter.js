import { DomainError } from '../domain/errors.js';

function toMinorUnits(amount) {
  return Math.round(Number(amount) * 100);
}

/**
 * Stripe PaymentIntents adapter using capture_method=manual for Pre-Auth & Capture.
 * Uses Stripe's form-urlencoded REST API with zero external dependencies.
 */
export class StripeAdapter {
  /**
   * @param {{ secretKey?: string, fetchImpl?: typeof fetch, holdTtlDays?: number }} config
   */
  constructor(config = {}) {
    this.name = 'stripe';
    this.secretKey = config.secretKey || '';
    this.baseUrl = 'https://api.stripe.com/v1';
    this.fetchImpl = config.fetchImpl || globalThis.fetch;
    this.holdTtlDays = config.holdTtlDays ?? 7;
  }

  isConfigured() {
    return Boolean(this.secretKey);
  }

  #assertConfigured() {
    if (!this.isConfigured()) {
      throw new DomainError(
        'Stripe secret key is missing. Set STRIPE_SECRET_KEY in .env.',
        503,
        'STRIPE_NOT_CONFIGURED'
      );
    }
  }

  async #request(method, path, { params, idempotencyKey } = {}) {
    this.#assertConfigured();
    const headers = {
      Authorization: `Bearer ${this.secretKey}`
    };
    if (idempotencyKey) {
      headers['Idempotency-Key'] = idempotencyKey;
    }

    let body;
    let url = `${this.baseUrl}${path}`;
    if (params && method === 'POST') {
      headers['Content-Type'] = 'application/x-www-form-urlencoded';
      body = new URLSearchParams(params).toString();
    } else if (params && method === 'GET') {
      const qs = new URLSearchParams(params).toString();
      if (qs) url += `?${qs}`;
    }

    const res = await this.fetchImpl(url, { method, headers, body });
    const data = await res.json();
    if (!res.ok) {
      const msg = data?.error?.message || `Stripe API error (${res.status})`;
      const status = res.status >= 400 && res.status < 500 ? res.status : 502;
      throw new DomainError(msg, status, 'STRIPE_API_ERROR');
    }
    return data;
  }

  #extractAuthDetails(pi) {
    const charge = typeof pi.latest_charge === 'object' ? pi.latest_charge : null;
    const receiptAuthCode = charge?.payment_method_details?.card?.receipt?.authorization_code;
    const networkRef = charge?.payment_method_details?.card?.network_transaction_id || pi.id;
    const approvalCode = receiptAuthCode || pi.id.slice(-6).toUpperCase();
    return { approvalCode, networkReference: networkRef };
  }

  async createPreAuth({ amount, currency, reference, idempotencyKey, paymentMethodToken }) {
    const params = {
      amount: String(toMinorUnits(amount)),
      currency: currency.toLowerCase(),
      capture_method: 'manual',
      'payment_method_types[0]': 'card',
      'metadata[reference]': reference,
      'expand[0]': 'latest_charge'
    };

    if (paymentMethodToken) {
      params.payment_method = paymentMethodToken;
      params.confirm = 'true';
    }

    const pi = await this.#request('POST', '/payment_intents', { params, idempotencyKey });
    const expiresAt = new Date(Date.now() + this.holdTtlDays * 24 * 60 * 60 * 1000).toISOString();

    if (pi.status === 'requires_capture') {
      const { approvalCode, networkReference } = this.#extractAuthDetails(pi);
      return {
        status: 'AUTHORIZED',
        approvalCode,
        authorizationId: pi.id,
        networkReference,
        orderId: pi.id,
        approveUrl: null,
        expiresAt,
        processorRaw: { id: pi.id, status: pi.status }
      };
    }

    return {
      status: 'PENDING_APPROVAL',
      approvalCode: null,
      authorizationId: pi.id,
      networkReference: null,
      orderId: pi.id,
      approveUrl: null,
      expiresAt,
      processorRaw: { id: pi.id, status: pi.status, client_secret: pi.client_secret }
    };
  }

  /**
   * Confirms or syncs a Stripe PaymentIntent into AUTHORIZED (requires_capture).
   */
  async authorizeOrder(paymentIntentId, idempotencyKey) {
    const pi = await this.#request('POST', `/payment_intents/${encodeURIComponent(paymentIntentId)}/confirm`, {
      params: { 'expand[0]': 'latest_charge' },
      idempotencyKey
    });

    if (pi.status !== 'requires_capture') {
      throw new DomainError(
        `Stripe PaymentIntent ${pi.id} is in status "${pi.status}", expected "requires_capture"`,
        409,
        'STRIPE_NOT_AUTHORIZED'
      );
    }

    const { approvalCode, networkReference } = this.#extractAuthDetails(pi);
    return {
      status: 'AUTHORIZED',
      authorizationId: pi.id,
      approvalCode,
      networkReference,
      expiresAt: new Date(Date.now() + this.holdTtlDays * 24 * 60 * 60 * 1000).toISOString(),
      processorRaw: { id: pi.id, status: pi.status }
    };
  }

  async capture({ authorizationId, amount, idempotencyKey }) {
    const pi = await this.#request('POST', `/payment_intents/${encodeURIComponent(authorizationId)}/capture`, {
      params: { amount_to_capture: String(toMinorUnits(amount)) },
      idempotencyKey
    });

    return {
      captureId: typeof pi.latest_charge === 'string' ? pi.latest_charge : pi.latest_charge?.id || pi.id,
      authorizationId: pi.id,
      amount,
      currency: (pi.currency || 'eur').toUpperCase(),
      finalCapture: true,
      processorRaw: { id: pi.id, status: pi.status }
    };
  }

  async reauthorize() {
    throw new DomainError(
      'Stripe card holds cannot be reauthorized in-place after 7 days; create a new PaymentIntent.',
      400,
      'STRIPE_REAUTH_UNSUPPORTED'
    );
  }

  async void({ authorizationId, idempotencyKey }) {
    const pi = await this.#request('POST', `/payment_intents/${encodeURIComponent(authorizationId)}/cancel`, {
      params: { cancellation_reason: 'requested_by_customer' },
      idempotencyKey
    });

    return {
      authorizationId: pi.id,
      voidedAt: new Date().toISOString(),
      processorRaw: { id: pi.id, status: pi.status }
    };
  }
}
