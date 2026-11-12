import { randomBytes, randomUUID } from 'node:crypto';
import { DomainError } from '../domain/errors.js';

const APPROVAL_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function generateApprovalCode() {
  const bytes = randomBytes(6);
  let code = '';
  for (let i = 0; i < 6; i += 1) {
    code += APPROVAL_ALPHABET[bytes[i] % APPROVAL_ALPHABET.length];
  }
  return code;
}

/**
 * Simulates a card-network / POS acquirer pre-authorization processor.
 * Issues 6-char approval codes, authorization IDs, network references,
 * and supports capture, reauthorization, and void operations.
 */
export class SimulatorAdapter {
  /**
   * @param {{ holdTtlDays?: number, maxSingleAmount?: number }} options
   */
  constructor(options = {}) {
    this.name = 'simulator';
    this.holdTtlDays = options.holdTtlDays ?? 7;
    this.maxSingleAmount = options.maxSingleAmount ?? 50000;
  }

  /**
   * @param {{ amount: number, currency: string, reference: string, simulateDecline?: boolean }} input
   */
  async createPreAuth(input) {
    if (input.simulateDecline || String(input.reference).toUpperCase().includes('DECLINE')) {
      throw new DomainError(
        'Issuer declined pre-authorization (simulated)',
        402,
        'PREAUTH_DECLINED'
      );
    }
    if (input.amount > this.maxSingleAmount) {
      throw new DomainError(
        `Amount ${input.amount} exceeds simulator single-hold limit (${this.maxSingleAmount})`,
        402,
        'LIMIT_EXCEEDED'
      );
    }

    const expiresAt = new Date(Date.now() + this.holdTtlDays * 24 * 60 * 60 * 1000).toISOString();
    return {
      status: 'AUTHORIZED',
      approvalCode: generateApprovalCode(),
      authorizationId: `AUTH-${randomUUID().slice(0, 12).toUpperCase()}`,
      networkReference: `NTR-${randomBytes(5).toString('hex').toUpperCase()}`,
      orderId: null,
      approveUrl: null,
      expiresAt,
      processorRaw: { mode: 'simulator', decision: 'APPROVED' }
    };
  }

  async authorizeOrder() {
    throw new DomainError(
      'Simulator pre-authorizations are immediately authorized; no buyer approval step required.',
      400,
      'INVALID_OPERATION'
    );
  }

  async capture({ authorizationId, amount, currency, finalCapture }) {
    return {
      captureId: `CAP-${randomUUID().slice(0, 12).toUpperCase()}`,
      authorizationId,
      amount,
      currency,
      finalCapture: Boolean(finalCapture),
      processorRaw: { mode: 'simulator', status: 'COMPLETED' }
    };
  }

  async reauthorize({ authorizationId, amount, currency }) {
    const expiresAt = new Date(Date.now() + this.holdTtlDays * 24 * 60 * 60 * 1000).toISOString();
    return {
      authorizationId: `AUTH-${randomUUID().slice(0, 12).toUpperCase()}`,
      previousAuthorizationId: authorizationId,
      amount,
      currency,
      expiresAt,
      processorRaw: { mode: 'simulator', status: 'REAUTHORIZED' }
    };
  }

  async void({ authorizationId }) {
    return {
      authorizationId,
      voidedAt: new Date().toISOString(),
      processorRaw: { mode: 'simulator', status: 'VOIDED' }
    };
  }
}
