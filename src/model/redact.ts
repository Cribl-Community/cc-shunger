// Snapshots are stored in KV, where plain values are readable by anyone who can use the app.
// Blueprint stores no secrets, so anything L07 would flag is masked before it is saved. A short
// fingerprint of the original lets diffs still notice when a masked value changed.
import { findSecret, mask, secretsInFunction } from '../lint/rules/L07';
import type { Inventory } from './types';

/** FNV-1a 32-bit: a change detector, far too lossy to recover a secret from. */
export function fingerprint(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

export function redactString(s: string): string {
  let out = s;
  // Loop: one string may hold several secrets.
  for (let i = 0; i < 10; i++) {
    const secret = findSecret(out);
    if (!secret || secret.includes('•')) break;
    out = out.split(secret).join(`${mask(secret)}#${fingerprint(secret)}`);
  }
  return out;
}

function redactValue<T>(value: T): T {
  if (typeof value === 'string') return redactString(value) as T;
  if (Array.isArray(value)) return value.map(redactValue) as T;
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, redactValue(v)])) as T;
  }
  return value;
}

const replaceAll = <T>(value: T, secret: string, replacement: string): T =>
  JSON.parse(JSON.stringify(value).split(JSON.stringify(secret).slice(1, -1)).join(replacement)) as T;

/**
 * Returns a copy of the Inventory with suspected secrets masked everywhere: first every secret
 * L07 finds in pipeline functions (including secret-named eval fields), then pattern matches in
 * any remaining string.
 */
export function redactInventory(inv: Inventory): Inventory {
  const pipelines = inv.pipelines.map((p) => ({
    ...p,
    functions: p.functions.map((fn) =>
      secretsInFunction(fn).reduce(
        (acc, hit) => replaceAll(acc, hit.secret, `${mask(hit.secret)}#${fingerprint(hit.secret)}`),
        fn,
      ),
    ),
  }));
  return redactValue({ ...inv, pipelines });
}
