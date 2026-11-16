import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { DomainError } from '../domain/errors.js';

const VALID_LEAD_STATUSES = new Set([
  'NEW',
  'CONTACTED',
  'DEMO_SCHEDULED',
  'QUOTED',
  'WON',
  'ARCHIVED'
]);

/**
 * Atomic JSON-backed store for incoming B2B quote & demo requests.
 */
export class LeadStore {
  /**
   * @param {string|null} filePath Path to JSON file, or null for in-memory tests.
   */
  constructor(filePath = null) {
    this.filePath = filePath;
    this.leads = [];
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
        if (Array.isArray(parsed.leads)) {
          this.leads = parsed.leads;
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
    return this.leads.map((l) => structuredClone(l));
  }

  async create(input) {
    await this.init();
    const name = String(input.name || '').trim();
    const email = String(input.email || '').trim();
    const company = String(input.company || '').trim();
    if (!name) throw new DomainError('Contact name is required', 400, 'INVALID_LEAD');
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new DomainError('Valid contact email is required', 400, 'INVALID_EMAIL');
    }

    const now = new Date().toISOString();
    const lead = {
      id: `LEAD-${randomUUID().slice(0, 8).toUpperCase()}`,
      name,
      company: company || 'N/A',
      email,
      phone: String(input.phone || '').trim() || 'Neuvedené',
      monthlyVolume: String(input.monthlyVolume || '').trim() || 'Neuvedené',
      preferredProcessor: String(input.preferredProcessor || 'paypal_stripe').trim(),
      notes: String(input.notes || '').trim(),
      source: String(input.source || 'web_terminal').trim(),
      status: 'NEW',
      createdAt: now,
      updatedAt: now
    };

    this.leads.unshift(lead);
    await this.#persist();
    return structuredClone(lead);
  }

  async updateStatus(id, { status, notes }) {
    await this.init();
    const lead = this.leads.find((l) => l.id === id);
    if (!lead) {
      throw new DomainError(`Lead "${id}" not found`, 404, 'NOT_FOUND');
    }
    if (status !== undefined) {
      const norm = String(status).trim().toUpperCase();
      if (!VALID_LEAD_STATUSES.has(norm)) {
        throw new DomainError(`Invalid lead status "${status}"`, 400, 'INVALID_LEAD_STATUS');
      }
      lead.status = norm;
    }
    if (notes !== undefined) {
      lead.notes = String(notes).trim();
    }
    lead.updatedAt = new Date().toISOString();
    await this.#persist();
    return structuredClone(lead);
  }

  async #persist() {
    if (!this.filePath) return;
    const payload = JSON.stringify({ leads: this.leads }, null, 2);
    const tmpPath = `${this.filePath}.tmp`;
    this.writeQueue = this.writeQueue.then(async () => {
      await writeFile(tmpPath, payload, 'utf8');
      await rename(tmpPath, this.filePath);
    });
    await this.writeQueue;
  }
}
