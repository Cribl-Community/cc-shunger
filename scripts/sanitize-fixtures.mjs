// Turns a raw probe dump (test/fixtures/raw/blueprint-raw-<group>.json) into a committed fixture.
// Usage: node scripts/sanitize-fixtures.mjs <raw.json> <out.json>
// Rules: keep only config endpoints; redact secret-bearing fields; rewrite IPs and non-Cribl
// hostnames to documentation ranges (RFC 5737 / example.com). Fails if anything suspicious remains.
import { readFileSync, writeFileSync } from 'node:fs';

const [, , inPath, outPath] = process.argv;
if (!inPath || !outPath) {
  console.error('usage: node scripts/sanitize-fixtures.mjs <raw.json> <out.json>');
  process.exit(1);
}

// Raw probe key -> fixture key (matches RawConfig in src/model/types.ts).
const ENDPOINTS = { routes: 'routes', pipelines: 'pipelines', 'system/inputs': 'inputs', 'system/outputs': 'outputs', packs: 'packs' };
const SECRET_KEY = /(^|_)(token|password|passwd|secret|secretkey|apikey|api_key|privkey|privatekey|credentials?)$|token$|secret$|password$/i;
const NOT_SECRET_KEY = /type$|method$|path$/i; // authType, awsAuthenticationMethod, privKeyPath
const KEEP_HOSTS = /(^|\.)(cribl\.io|example\.com|example\.net|example\.org)$/i;
const IPV4 = /\b(?!0\.0\.0\.0\b)(?!127\.0\.0\.1\b)(\d{1,3}\.){3}\d{1,3}\b/g;
const HOST = /\b[a-z0-9-]+(\.[a-z0-9-]+)*\.(com|net|org|io|cloud|local|internal|corp|lan)\b/gi;
const PEM = /-----BEGIN [A-Z ]+-----/;

const hostMap = new Map();
const fakeHost = (h) => {
  if (!hostMap.has(h)) hostMap.set(h, `host${hostMap.size + 1}.example.com`);
  return hostMap.get(h);
};

function scrubString(s) {
  if (PEM.test(s)) return 'REDACTED-PEM';
  return s
    .replace(IPV4, () => '192.0.2.10')
    .replace(HOST, (h) => (KEEP_HOSTS.test(h) ? h : fakeHost(h.toLowerCase())));
}

function scrub(value, key = '') {
  if (Array.isArray(value)) return value.map((v) => scrub(v, key));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, scrub(v, k)]));
  }
  if (typeof value === 'string') {
    if (value && SECRET_KEY.test(key) && !NOT_SECRET_KEY.test(key)) return 'REDACTED';
    return scrubString(value);
  }
  return value;
}

const raw = JSON.parse(readFileSync(inPath, 'utf8'));
const out = {
  source: 'Phase 0 probe of a lab workspace, sanitized by scripts/sanitize-fixtures.mjs',
  criblVersion: raw['system/info']?.body?.items?.[0]?.BUILD?.VERSION ?? 'unknown',
  group: raw.group,
};
for (const [ep, key] of Object.entries(ENDPOINTS)) out[key] = scrub(raw[ep]?.body?.items ?? []);

// Belt and braces: refuse to write if anything that looks sensitive survived.
const text = JSON.stringify(out);
const leftovers = [
  ...(text.match(IPV4) ?? []),
  ...(text.match(HOST) ?? []).filter((h) => !KEEP_HOSTS.test(h)),
  ...(text.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi) ?? []),
];
if (leftovers.length) {
  console.error('Sanitizer found leftovers, not writing:', [...new Set(leftovers)].slice(0, 20));
  process.exit(2);
}
writeFileSync(outPath, JSON.stringify(out, null, 2) + '\n');
console.log(`Wrote ${outPath}; ${hostMap.size} hostnames rewritten`);
