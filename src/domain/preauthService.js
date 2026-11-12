import { randomUUID } from 'node:crypto';
import { DomainError } from './errors.js';

const FORBIDDEN_PCI_FIELDS = [
  'cardNumber',
  'card_number',
  'pan',
  'cvv',
  'cvc',
  'cvv2',
  'securityCode',
  'trackData'
];

const CAPTURABLE_STATUSES = new Set(['AUTHORIZED', 'PARTIALLY_CAPTURED']);

function roundCents(value) {
  return Math.round(Number(value) * 100) / 100;
}

function assertPositiveAmount(amount, label = 'amount') {
  const num = Number(amount);
  if (!Number.isFinite(num) || num <= 0) {
    throw new DomainError(`${label} must be a positive number`, 400, 'INVALID_AMOUNT');
  }
  return roundCents(num);
}

function assertNoForbiddenPciData(payload) {
  if (!payload || typeof payload !== 'object') return;
  for (const key of FORBIDDEN_PCI_FIELDS) {
    if (key in payload && payload[key] !== undefined && payload[key] !== '') {
      throw new DomainError(
        `PCI-DSS guard: raw cardholder field "${key}" is not accepted. Use tokenized instrument references or PSP checkout.`,
        400,
        'PCI_FORBIDDEN_FIELD'
      );
    }
  }
}

function appendAudit(record, action, details = {}) {
  record.auditLog.push({
    timestamp: new Date().toISOString(),
    action,
    ...details
  });
}

/**
 * Core pre-authorization, approval-code lookup, capture, reauthorization,
 * void, and batch settlement orchestration service.
 */
export class PreAuthService {
  /**
   * @param {{
   *   store: import('../storage/jsonStore.js').JsonLedgerStore,
   *   adapters: Record<string, any>,
   *   defaultProcessor?: string,
   *   defaultCurrency?: string
   * }} deps
   */
  constructor({ store, adapters, defaultProcessor = 'simulator', defaultCurrency = 'EUR' }) {
    this.store = store;
    this.adapters = adapters;
    this.defaultProcessor = defaultProcessor;
    this.defaultCurrency = defaultCurrency;
  }

  #getAdapter(processorName) {
    const key = processorName || this.defaultProcessor;
    const adapter = this.adapters[key];
    if (!adapter) {
      throw new DomainError(`Unknown processor "${key}"`, 400, 'UNKNOWN_PROCESSOR');
    }
    return adapter;
  }

  async listPreAuths({ status, q } = {}) {
    const all = await this.store.list();
    return all.filter((item) => {
      if (status && item.status !== status) return false;
      if (q) {
        const needle = String(q).trim().toUpperCase();
        const hay = [
          item.id,
          item.approvalCode,
          item.authorizationId,
          item.orderId,
          item.reference,
          item.customerLabel
        ]
          .filter(Boolean)
          .join(' ')
          .toUpperCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }

  async lookup(codeOrId) {
    if (!codeOrId || !String(codeOrId).trim()) {
      throw new DomainError('Lookup code or authorization ID is required', 400, 'MISSING_LOOKUP_CODE');
    }
    const record = await this.store.findByCodeOrAuthId(codeOrId);
    if (!record) {
      throw new DomainError(`No pre-authorization found for "${codeOrId}"`, 404, 'NOT_FOUND');
    }
    return record;
  }

  async getSummary() {
    const all = await this.store.list();
    const summary = {
      totalCount: all.length,
      authorizedVolume: 0,
      capturedVolume: 0,
      remainingHeldVolume: 0,
      byStatus: {}
    };
    for (const item of all) {
      summary.byStatus[item.status] = (summary.byStatus[item.status] || 0) + 1;
      if (item.status !== 'VOIDED' && item.status !== 'EXPIRED' && item.status !== 'PENDING_APPROVAL') {
        summary.authorizedVolume = roundCents(summary.authorizedVolume + item.authorizedAmount);
      }
      summary.capturedVolume = roundCents(summary.capturedVolume + item.capturedAmount);
      if (CAPTURABLE_STATUSES.has(item.status)) {
        summary.remainingHeldVolume = roundCents(summary.remainingHeldVolume + item.remainingAmount);
      }
    }
    return summary;
  }

  async createPreAuth(input) {
    assertNoForbiddenPciData(input);

    if (input.idempotencyKey) {
      const existing = await this.store.findByIdempotencyKey(input.idempotencyKey);
      if (existing) {
        return { record: existing, replayed: true };
      }
    }

    const amount = assertPositiveAmount(input.amount);
    const currency = String(input.currency || this.defaultCurrency).trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(currency)) {
      throw new DomainError('Currency must be a 3-letter ISO code (e.g. EUR, USD)', 400, 'INVALID_CURRENCY');
    }

    const reference = String(input.reference || `INV-${Date.now()}`).trim();
    const processorName = input.processor || this.defaultProcessor;
    const adapter = this.#getAdapter(processorName);
    const idempotencyKey = input.idempotencyKey || `preauth-${randomUUID()}`;

    const result = await adapter.createPreAuth({
      amount,
      currency,
      reference,
      idempotencyKey,
      paymentMethodToken: input.paymentMethodToken,
      simulateDecline: Boolean(input.simulateDecline)
    });

    const now = new Date().toISOString();
    const record = {
      id: `PA-${randomUUID().slice(0, 8).toUpperCase()}`,
      processor: processorName,
      status: result.status,
      authorizedAmount: amount,
      capturedAmount: 0,
      remainingAmount: amount,
      currency,
      reference,
      customerLabel: String(input.customerLabel || 'B2B Client').trim(),
      instrumentMask: String(input.instrumentMask || 'TOKENIZED-ACCOUNT').trim(),
      approvalCode: result.approvalCode,
      authorizationId: result.authorizationId,
      networkReference: result.networkReference,
      orderId: result.orderId,
      approveUrl: result.approveUrl,
      idempotencyKey,
      expiresAt: result.expiresAt,
      createdAt: now,
      updatedAt: now,
      captures: [],
      auditLog: []
    };

    appendAudit(record, 'PREAUTH_CREATED', {
      actor: input.actor || 'system',
      processor: processorName,
      status: record.status,
      approvalCode: record.approvalCode,
      authorizationId: record.authorizationId,
      amount,
      currency
    });

    await this.store.save(record);
    return { record, replayed: false };
  }

  async authorizeOrder(idOrCode, { idempotencyKey, actor } = {}) {
    const record = await this.lookup(idOrCode);
    if (record.status !== 'PENDING_APPROVAL') {
      throw new DomainError(
        `Pre-authorization ${record.id} is in status ${record.status}, expected PENDING_APPROVAL`,
        409,
        'INVALID_STATE'
      );
    }
    const adapter = this.#getAdapter(record.processor);
    const result = await adapter.authorizeOrder(record.orderId, idempotencyKey || `auth-${randomUUID()}`);

    record.status = result.status;
    record.authorizationId = result.authorizationId;
    record.approvalCode = result.approvalCode;
    record.networkReference = result.networkReference;
    record.expiresAt = result.expiresAt;
    record.updatedAt = new Date().toISOString();
    appendAudit(record, 'ORDER_AUTHORIZED', {
      actor: actor || 'system',
      authorizationId: result.authorizationId,
      approvalCode: result.approvalCode
    });

    return this.store.save(record);
  }

  async capturePreAuth(idOrCode, { amount, finalCapture, idempotencyKey, actor } = {}) {
    const record = await this.lookup(idOrCode);
    if (!CAPTURABLE_STATUSES.has(record.status)) {
      throw new DomainError(
        `Cannot capture pre-authorization in status ${record.status}`,
        409,
        'INVALID_STATE'
      );
    }
    if (record.expiresAt && new Date(record.expiresAt).getTime() < Date.now()) {
      record.status = 'EXPIRED';
      record.updatedAt = new Date().toISOString();
      appendAudit(record, 'PREAUTH_EXPIRED', {});
      await this.store.save(record);
      throw new DomainError('Pre-authorization hold has expired; reauthorize first.', 409, 'HOLD_EXPIRED');
    }

    const captureAmount =
      amount !== undefined && amount !== null && amount !== ''
        ? assertPositiveAmount(amount, 'capture amount')
        : record.remainingAmount;

    if (captureAmount > record.remainingAmount) {
      throw new DomainError(
        `Capture amount ${captureAmount} exceeds remaining held amount ${record.remainingAmount}`,
        400,
        'OVER_CAPTURE'
      );
    }

    const isFinal =
      finalCapture !== undefined ? Boolean(finalCapture) : captureAmount === record.remainingAmount;

    const adapter = this.#getAdapter(record.processor);
    const result = await adapter.capture({
      authorizationId: record.authorizationId,
      amount: captureAmount,
      currency: record.currency,
      finalCapture: isFinal,
      idempotencyKey: idempotencyKey || `cap-${randomUUID()}`
    });

    record.capturedAmount = roundCents(record.capturedAmount + captureAmount);
    record.remainingAmount = isFinal
      ? 0
      : roundCents(record.remainingAmount - captureAmount);
    record.status = record.remainingAmount === 0 || isFinal ? 'CAPTURED' : 'PARTIALLY_CAPTURED';
    record.updatedAt = new Date().toISOString();
    record.captures.push({
      captureId: result.captureId,
      amount: captureAmount,
      currency: record.currency,
      finalCapture: isFinal,
      capturedAt: record.updatedAt
    });
    appendAudit(record, 'PREAUTH_CAPTURED', {
      actor: actor || 'system',
      captureId: result.captureId,
      amount: captureAmount,
      remainingAmount: record.remainingAmount,
      finalCapture: isFinal
    });

    return this.store.save(record);
  }

  async reauthorizePreAuth(idOrCode, { idempotencyKey, actor } = {}) {
    const record = await this.lookup(idOrCode);
    if (!CAPTURABLE_STATUSES.has(record.status) && record.status !== 'EXPIRED') {
      throw new DomainError(
        `Cannot reauthorize pre-authorization in status ${record.status}`,
        409,
        'INVALID_STATE'
      );
    }

    const adapter = this.#getAdapter(record.processor);
    const result = await adapter.reauthorize({
      authorizationId: record.authorizationId,
      amount: record.remainingAmount,
      currency: record.currency,
      idempotencyKey: idempotencyKey || `reauth-${randomUUID()}`
    });

    record.authorizationId = result.authorizationId;
    record.expiresAt = result.expiresAt;
    if (record.status === 'EXPIRED') {
      record.status = record.capturedAmount > 0 ? 'PARTIALLY_CAPTURED' : 'AUTHORIZED';
    }
    record.updatedAt = new Date().toISOString();
    appendAudit(record, 'PREAUTH_REAUTHORIZED', {
      actor: actor || 'system',
      previousAuthorizationId: result.previousAuthorizationId,
      newAuthorizationId: result.authorizationId,
      expiresAt: result.expiresAt
    });

    return this.store.save(record);
  }

  async voidPreAuth(idOrCode, { reason, idempotencyKey, actor } = {}) {
    const record = await this.lookup(idOrCode);
    if (!CAPTURABLE_STATUSES.has(record.status)) {
      throw new DomainError(
        `Cannot void pre-authorization in status ${record.status}`,
        409,
        'INVALID_STATE'
      );
    }

    const adapter = this.#getAdapter(record.processor);
    await adapter.void({
      authorizationId: record.authorizationId,
      idempotencyKey: idempotencyKey || `void-${randomUUID()}`
    });

    record.remainingAmount = 0;
    record.status = 'VOIDED';
    record.updatedAt = new Date().toISOString();
    appendAudit(record, 'PREAUTH_VOIDED', {
      actor: actor || 'system',
      reason: reason || 'Merchant released hold'
    });

    return this.store.save(record);
  }

  async batchCreatePreAuth(items = [], { actor } = {}) {
    if (!Array.isArray(items) || items.length === 0) {
      throw new DomainError('Batch items array must be non-empty', 400, 'EMPTY_BATCH');
    }
    const results = [];
    for (let i = 0; i < items.length; i += 1) {
      try {
        const { record, replayed } = await this.createPreAuth({ ...items[i], actor });
        results.push({ index: i, ok: true, replayed, record });
      } catch (err) {
        results.push({
          index: i,
          ok: false,
          code: err.code || 'ERROR',
          error: err.message
        });
      }
    }
    return {
      total: items.length,
      succeeded: results.filter((r) => r.ok).length,
      failed: results.filter((r) => !r.ok).length,
      results
    };
  }

  async batchCapture(items = [], { actor } = {}) {
    if (!Array.isArray(items) || items.length === 0) {
      throw new DomainError('Batch capture items array must be non-empty', 400, 'EMPTY_BATCH');
    }
    const results = [];
    for (let i = 0; i < items.length; i += 1) {
      const item = items[i];
      const key = item.approvalCode || item.id || item.authorizationId;
      try {
        const record = await this.capturePreAuth(key, {
          amount: item.amount,
          finalCapture: item.finalCapture,
          idempotencyKey: item.idempotencyKey,
          actor
        });
        results.push({ index: i, key, ok: true, record });
      } catch (err) {
        results.push({
          index: i,
          key,
          ok: false,
          code: err.code || 'ERROR',
          error: err.message
        });
      }
    }
    return {
      total: items.length,
      succeeded: results.filter((r) => r.ok).length,
      failed: results.filter((r) => !r.ok).length,
      results
    };
  }
}
