import { DomainError } from '../domain/errors.js';

/**
 * Real PayPal Orders v2 + Payments v2 adapter for intent=AUTHORIZE flows.
 * Supports Sandbox and Live environments via REST API using Node built-in fetch.
 */
export class PayPalAdapter {
  /**
   * @param {{
   *   clientId: string,
   *   clientSecret: string,
   *   sandbox?: boolean,
   *   returnUrl?: string,
   *   cancelUrl?: string,
   *   fetchImpl?: typeof fetch
   * }} config
   */
  constructor(config) {
    this.name = config.sandbox === false ? 'paypal_live' : 'paypal_sandbox';
    this.clientId = config.clientId || '';
    this.clientSecret = config.clientSecret || '';
    this.baseUrl =
      config.sandbox === false
        ? 'https://api-m.paypal.com'
        : 'https://api-m.sandbox.paypal.com';
    this.returnUrl = config.returnUrl || 'http://localhost:3456/?paypal=approved';
    this.cancelUrl = config.cancelUrl || 'http://localhost:3456/?paypal=cancelled';
    this.fetchImpl = config.fetchImpl || globalThis.fetch;
    this.cachedToken = null;
    this.tokenExpiresAt = 0;
  }

  isConfigured() {
    return Boolean(this.clientId && this.clientSecret);
  }

  #assertConfigured() {
    if (!this.isConfigured()) {
      throw new DomainError(
        'PayPal credentials are missing. Set PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET in .env.',
        503,
        'PAYPAL_NOT_CONFIGURED'
      );
    }
  }

  async getAccessToken() {
    this.#assertConfigured();
    if (this.cachedToken && Date.now() < this.tokenExpiresAt - 30_000) {
      return this.cachedToken;
    }

    const credentials = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');
    const res = await this.fetchImpl(`${this.baseUrl}/v1/oauth2/token`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: 'grant_type=client_credentials'
    });

    const data = await res.json();
    if (!res.ok) {
      throw new DomainError(
        data.error_description || 'PayPal OAuth token request failed',
        res.status,
        'PAYPAL_AUTH_ERROR'
      );
    }

    this.cachedToken = data.access_token;
    this.tokenExpiresAt = Date.now() + (Number(data.expires_in) || 3200) * 1000;
    return this.cachedToken;
  }

  async #request(method, path, { body, idempotencyKey, extraHeaders = {} } = {}) {
    const token = await this.getAccessToken();
    const headers = {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...extraHeaders
    };
    if (idempotencyKey) {
      headers['PayPal-Request-Id'] = idempotencyKey;
    }

    const res = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined
    });

    if (res.status === 204) {
      return { status: 204, data: null };
    }

    const text = await res.text();
    const data = text ? JSON.parse(text) : null;
    if (!res.ok) {
      const msg = data?.details?.[0]?.description || data?.message || `PayPal API error (${res.status})`;
      throw new DomainError(msg, res.status >= 400 && res.status < 500 ? 400 : 502, 'PAYPAL_API_ERROR');
    }
    return { status: res.status, data };
  }

  /**
   * Step 1: Create a PayPal Order with intent=AUTHORIZE.
   * Buyer must open approveUrl before calling authorizeOrder(orderId).
   */
  async createPreAuth({ amount, currency, reference, idempotencyKey }) {
    const { data } = await this.#request('POST', '/v2/checkout/orders', {
      idempotencyKey,
      body: {
        intent: 'AUTHORIZE',
        purchase_units: [
          {
            reference_id: reference,
            amount: {
              currency_code: currency,
              value: amount.toFixed(2)
            }
          }
        ],
        application_context: {
          return_url: this.returnUrl,
          cancel_url: this.cancelUrl,
          user_action: 'PAY_NOW'
        }
      }
    });

    const approveLink = (data.links || []).find((l) => l.rel === 'approve')?.href || null;
    return {
      status: 'PENDING_APPROVAL',
      approvalCode: null,
      authorizationId: null,
      networkReference: null,
      orderId: data.id,
      approveUrl: approveLink,
      expiresAt: null,
      processorRaw: { id: data.id, status: data.status }
    };
  }

  /**
   * Step 2: After buyer approves, authorize the order to lock funds & obtain authorization_id.
   */
  async authorizeOrder(orderId, idempotencyKey) {
    const { data } = await this.#request('POST', `/v2/checkout/orders/${encodeURIComponent(orderId)}/authorize`, {
      idempotencyKey,
      body: {}
    });

    const auth = data?.purchase_units?.[0]?.payments?.authorizations?.[0];
    if (!auth?.id) {
      throw new DomainError('PayPal did not return an authorization object', 502, 'PAYPAL_MISSING_AUTH');
    }

    return {
      status: 'AUTHORIZED',
      authorizationId: auth.id,
      approvalCode: auth.id.slice(-6).toUpperCase(),
      networkReference: data.id,
      expiresAt: auth.expiration_time || new Date(Date.now() + 29 * 24 * 60 * 60 * 1000).toISOString(),
      processorRaw: { orderId: data.id, authId: auth.id, status: auth.status }
    };
  }

  async capture({ authorizationId, amount, currency, finalCapture, idempotencyKey }) {
    const { data } = await this.#request(
      'POST',
      `/v2/payments/authorizations/${encodeURIComponent(authorizationId)}/capture`,
      {
        idempotencyKey,
        body: {
          amount: {
            currency_code: currency,
            value: amount.toFixed(2)
          },
          final_capture: Boolean(finalCapture)
        }
      }
    );

    return {
      captureId: data.id,
      authorizationId,
      amount,
      currency,
      finalCapture: Boolean(finalCapture),
      processorRaw: { id: data.id, status: data.status }
    };
  }

  async reauthorize({ authorizationId, amount, currency, idempotencyKey }) {
    const { data } = await this.#request(
      'POST',
      `/v2/payments/authorizations/${encodeURIComponent(authorizationId)}/reauthorize`,
      {
        idempotencyKey,
        body: {
          amount: {
            currency_code: currency,
            value: amount.toFixed(2)
          }
        }
      }
    );

    return {
      authorizationId: data.id,
      previousAuthorizationId: authorizationId,
      amount,
      currency,
      expiresAt: data.expiration_time || new Date(Date.now() + 29 * 24 * 60 * 60 * 1000).toISOString(),
      processorRaw: { id: data.id, status: data.status }
    };
  }

  async void({ authorizationId, idempotencyKey }) {
    await this.#request('POST', `/v2/payments/authorizations/${encodeURIComponent(authorizationId)}/void`, {
      idempotencyKey
    });

    return {
      authorizationId,
      voidedAt: new Date().toISOString(),
      processorRaw: { status: 'VOIDED' }
    };
  }

  /**
   * Fetches full order details by PayPal order ID.
   */
  async getOrder(orderId) {
    const { data } = await this.#request('GET', `/v2/checkout/orders/${encodeURIComponent(orderId)}`);
    return data;
  }

  /**
   * Fetches authorization details by PayPal authorization ID.
   */
  async getAuthorization(authorizationId) {
    const { data } = await this.#request('GET', `/v2/payments/authorizations/${encodeURIComponent(authorizationId)}`);
    return data;
  }

  /**
   * Fetches account transaction history via PayPal Reporting API (last 30 days by default).
   */
  async listTransactions({ startDate, endDate, pageSize = 20 } = {}) {
    const end = endDate || new Date().toISOString();
    const start =
      startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const query = new URLSearchParams({
      start_date: start,
      end_date: end,
      fields: 'all',
      page_size: String(pageSize)
    });
    try {
      const { data } = await this.#request('GET', `/v1/reporting/transactions?${query.toString()}`);
      return data;
    } catch (err) {
      return {
        error: err.message,
        code: err.code || 'PAYPAL_REPORTING_UNAVAILABLE',
        transaction_details: []
      };
    }
  }
}
