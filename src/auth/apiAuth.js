import { timingSafeEqual } from 'node:crypto';
import { DomainError } from '../domain/errors.js';

const ROLE_LEVEL = {
  viewer: 1,
  operator: 2,
  admin: 3
};

function safeEqual(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/**
 * Builds an API key authenticator supporting viewer, operator, and admin roles.
 * When no keys are configured, auth is disabled for local development convenience.
 */
export class ApiAuthenticator {
  /**
   * @param {Array<{ key: string, role: 'viewer'|'operator'|'admin', label?: string }>} entries
   */
  constructor(entries = []) {
    this.entries = entries.filter((e) => e && e.key && ROLE_LEVEL[e.role]);
    this.enabled = this.entries.length > 0;
  }

  static fromConfig(config) {
    const entries = [];
    if (config.viewerApiKey) entries.push({ key: config.viewerApiKey, role: 'viewer', label: 'viewer-key' });
    if (config.operatorApiKey) entries.push({ key: config.operatorApiKey, role: 'operator', label: 'operator-key' });
    if (config.adminApiKey) entries.push({ key: config.adminApiKey, role: 'admin', label: 'admin-key' });
    return new ApiAuthenticator(entries);
  }

  /**
   * Extracts API key from X-API-Key or Authorization: Bearer <key> and checks minimum role.
   * @param {import('node:http').IncomingMessage} req
   * @param {'viewer'|'operator'|'admin'} requiredRole
   */
  authenticate(req, requiredRole = 'viewer') {
    if (!this.enabled) {
      return { role: 'admin', actor: 'local-dev' };
    }

    const headerKey = req.headers['x-api-key'];
    const authHeader = req.headers.authorization;
    let token = typeof headerKey === 'string' ? headerKey.trim() : '';
    if (!token && typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
      token = authHeader.slice(7).trim();
    }

    if (!token) {
      throw new DomainError('Missing API key (provide X-API-Key header)', 401, 'UNAUTHORIZED');
    }

    const matched = this.entries.find((e) => safeEqual(e.key, token));
    if (!matched) {
      throw new DomainError('Invalid API key', 401, 'UNAUTHORIZED');
    }

    if (ROLE_LEVEL[matched.role] < ROLE_LEVEL[requiredRole]) {
      throw new DomainError(
        `Insufficient permissions: requires "${requiredRole}" role (current: "${matched.role}")`,
        403,
        'FORBIDDEN'
      );
    }

    return { role: matched.role, actor: `${matched.role}:${matched.label || 'key'}` };
  }
}
