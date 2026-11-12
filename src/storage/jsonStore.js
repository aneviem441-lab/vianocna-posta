import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

/**
 * Atomic JSON-backed ledger store for pre-authorization records and audit events.
 */
export class JsonLedgerStore {
  /**
   * @param {string|null} filePath Path to JSON ledger file, or null for in-memory only.
   */
  constructor(filePath = null) {
    this.filePath = filePath;
    this.records = [];
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
        if (Array.isArray(parsed.records)) {
          this.records = parsed.records;
        }
      } catch (err) {
        if (err.code !== 'ENOENT') throw err;
        await this.#persist();
      }
    }
    this.initialized = true;
  }

  async list() {
    await this.init();
    return this.records.map((r) => structuredClone(r));
  }

  async findById(id) {
    await this.init();
    const found = this.records.find((r) => r.id === id);
    return found ? structuredClone(found) : null;
  }

  async findByIdempotencyKey(key) {
    if (!key) return null;
    await this.init();
    const found = this.records.find((r) => r.idempotencyKey === key);
    return found ? structuredClone(found) : null;
  }

  async findByCodeOrAuthId(query) {
    if (!query) return null;
    await this.init();
    const norm = String(query).trim().toUpperCase();
    const found = this.records.find(
      (r) =>
        r.id.toUpperCase() === norm ||
        (r.approvalCode && r.approvalCode.toUpperCase() === norm) ||
        (r.authorizationId && r.authorizationId.toUpperCase() === norm) ||
        (r.orderId && r.orderId.toUpperCase() === norm)
    );
    return found ? structuredClone(found) : null;
  }

  async save(record) {
    await this.init();
    const clone = structuredClone(record);
    const idx = this.records.findIndex((r) => r.id === clone.id);
    if (idx >= 0) {
      this.records[idx] = clone;
    } else {
      this.records.unshift(clone);
    }
    await this.#persist();
    return structuredClone(clone);
  }

  async #persist() {
    if (!this.filePath) return;
    const payload = JSON.stringify({ records: this.records }, null, 2);
    const tmpPath = `${this.filePath}.tmp`;
    this.writeQueue = this.writeQueue.then(async () => {
      await writeFile(tmpPath, payload, 'utf8');
      await rename(tmpPath, this.filePath);
    });
    await this.writeQueue;
  }
}
