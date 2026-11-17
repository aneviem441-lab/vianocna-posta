import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

/**
 * Atomic JSON-backed store for PayPal webhook events and verified transactions.
 */
export class PayPalStore {
  /**
   * @param {string|null} filePath Path to JSON file, or null for in-memory tests.
   */
  constructor(filePath = null) {
    this.filePath = filePath;
    this.events = [];
    this.initialized = false;
    this.writeQueue = Promise.resolve();
  }

  async init() {
    if (this.initialized) return;
    if (this.filePath) {
      await mkdir(dirname(this.filePath), { recursive: true });
      try {
        const raw = await readFile(this.filePath, 'utf8');
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed.events)) {
          this.events = parsed.events;
        }
      } catch (err) {
        if (err.code !== 'ENOENT') throw err;
        await this.#persist();
      }
    }
    this.initialized = true;
  }

  async list({ limit = 50 } = {}) {
    await this.init();
    const sorted = [...this.events].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    return sorted.slice(0, limit).map((e) => structuredClone(e));
  }

  async recordEvent(eventData) {
    await this.init();
    const event = {
      id: eventData.id || randomUUID(),
      eventType: eventData.event_type || eventData.eventType || 'PAYMENT.NOTIFICATION',
      summary: eventData.summary || eventData.description || 'PayPal notification',
      resourceType: eventData.resource_type || null,
      resourceId: eventData.resource?.id || eventData.resourceId || null,
      amount:
        eventData.resource?.amount?.value !== undefined
          ? Number(eventData.resource.amount.value)
          : eventData.amount !== undefined
            ? Number(eventData.amount)
            : null,
      currency:
        eventData.resource?.amount?.currency_code ||
        eventData.currency ||
        'EUR',
      status: eventData.resource?.status || eventData.status || 'COMPLETED',
      payerEmail:
        eventData.resource?.payer?.email_address ||
        eventData.payerEmail ||
        null,
      createdAt: eventData.create_time || new Date().toISOString(),
      raw: eventData
    };

    // Avoid duplicate event ids if retransmitted by PayPal
    const existingIdx = this.events.findIndex((e) => e.id === event.id);
    if (existingIdx >= 0) {
      this.events[existingIdx] = event;
    } else {
      this.events.unshift(event);
    }

    await this.#persist();
    return structuredClone(event);
  }

  #persist() {
    if (!this.filePath) return Promise.resolve();
    this.writeQueue = this.writeQueue.then(async () => {
      const tempPath = `${this.filePath}.${randomUUID()}.tmp`;
      const payload = JSON.stringify({ events: this.events }, null, 2);
      await writeFile(tempPath, payload, 'utf8');
      await rename(tempPath, this.filePath);
    });
    return this.writeQueue;
  }
}
