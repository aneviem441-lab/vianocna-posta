import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Loads key=value pairs from a .env file if present (without overwriting existing env vars).
 * @param {string} envPath
 */
export function loadDotEnv(envPath) {
  if (!existsSync(envPath)) return;
  const content = readFileSync(envPath, 'utf8');
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eqIdx = line.indexOf('=');
    if (eqIdx <= 0) continue;
    const key = line.slice(0, eqIdx).trim();
    let value = line.slice(eqIdx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

export function loadConfig(rootDir) {
  loadDotEnv(join(rootDir, '.env'));
  return {
    port: Number(process.env.PORT || 3456),
    processorMode: process.env.PROCESSOR_MODE || 'simulator',
    defaultCurrency: process.env.DEFAULT_CURRENCY || 'EUR',
    holdTtlDays: Number(process.env.HOLD_TTL_DAYS || 7),
    paypalClientId: process.env.PAYPAL_CLIENT_ID || '',
    paypalClientSecret: process.env.PAYPAL_CLIENT_SECRET || '',
    paypalReturnUrl: process.env.PAYPAL_RETURN_URL || 'http://localhost:3456/?paypal=approved',
    paypalCancelUrl: process.env.PAYPAL_CANCEL_URL || 'http://localhost:3456/?paypal=cancelled',
    stripeSecretKey: process.env.STRIPE_SECRET_KEY || '',
    viewerApiKey: process.env.VIEWER_API_KEY || '',
    operatorApiKey: process.env.OPERATOR_API_KEY || '',
    adminApiKey: process.env.ADMIN_API_KEY || ''
  };
}
