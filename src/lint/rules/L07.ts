import { functionLabel, realPipelines, walkStrings } from '../helpers';
import type { Rule, RuleHit } from '../types';

/** Field or key names that suggest a credential. */
const SECRET_NAME = /(token|passw(or)?d|pwd|secret|api[_-]?key|apikey|access[_-]?key|auth|credential)/i;

/** `name=value` or `name: value` inside an expression, e.g. `'token=abc123...'`. */
const KEY_VALUE = /(token|passw(?:or)?d|pwd|secret|api[_-]?key|apikey|access[_-]?key)\s*[:=]\s*["']?([A-Za-z0-9_+/=.-]{10,})/i;

/** Credential formats that are unmistakable on their own. */
const KNOWN_FORMATS = [
  /\bAKIA[0-9A-Z]{16}\b/, // AWS access key id
  /\bgh[pousr]_[A-Za-z0-9]{36}\b/, // GitHub token
  /\bxox[baprs]-[A-Za-z0-9-]{10,}/, // Slack token
  /\bBearer\s+([A-Za-z0-9._-]{20,})/, // bearer token literal
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+/, // JWT
];

/** A whole-string JS literal: `'...'`, `"..."`, or a backtick string without interpolation. */
const QUOTED_LITERAL = /^\s*(['"`])((?:(?!\1).)*)\1\s*$/s;

const looksRandom = (s: string) => /[A-Za-z]/.test(s) && /\d/.test(s);

/** Keeps the first 4 characters; never reveals more than that. */
export function mask(secret: string): string {
  if (secret.length <= 4) return '••••';
  return `${secret.slice(0, 4)}${'•'.repeat(Math.min(12, secret.length - 4))}`;
}

/** Returns the suspected secret inside `text`, or undefined. */
export function findSecret(text: string): string | undefined {
  for (const re of KNOWN_FORMATS) {
    const m = re.exec(text);
    if (m) return m[1] ?? m[0];
  }
  const kv = KEY_VALUE.exec(text);
  if (kv && looksRandom(kv[2])) return kv[2];
  return undefined;
}

const excerpt = (text: string, secret: string) => {
  const masked = text.split(secret).join(mask(secret));
  return masked.length > 80 ? `${masked.slice(0, 77)}…` : masked;
};

export const L07: Rule = {
  id: 'L07',
  title: 'Possible hardcoded secret',
  severity: 'error',
  rationale:
    'Credentials written into pipeline expressions are visible to anyone who can read config, end up in git history and exports, and cannot be rotated centrally. Cribl Secrets keep them encrypted and referenceable.',
  run: ({ inv }) => {
    const hits: RuleHit[] = [];
    for (const p of realPipelines(inv.pipelines)) {
      p.functions.forEach((fn, i) => {
        let found: { path: string; secret: string; text: string } | undefined;
        const check = (path: string, text: string) => {
          if (found) return;
          const secret = findSecret(text);
          if (secret) found = { path, secret, text };
        };
        // Eval-style assignments: { name: 'api_key', value: "'abc123...'" }
        walkStrings(fn.conf, (path, key, s) => {
          if (found || key !== 'value') return;
          const name = path.replace(/\.value$/, '.name');
          const nameValue = name.split(/[.[\]]/).filter(Boolean).reduce<unknown>(
            (o, k) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined),
            fn.conf,
          );
          const literal = QUOTED_LITERAL.exec(s);
          if (literal && typeof nameValue === 'string' && SECRET_NAME.test(nameValue) && !literal[2].includes('${')) {
            const secret = literal[2];
            if (secret.length >= 8 && looksRandom(secret)) found = { path, secret, text: `${nameValue} = ${s}` };
          }
        });
        if (fn.filter) check('filter', fn.filter);
        walkStrings(fn.conf, (path, _key, s) => check(path, s));
        if (!found) return;
        hits.push({
          object: { kind: 'pipeline', id: p.id },
          keyDetail: `f${i}`,
          location: `${functionLabel(i, fn)} › ${found.path}`,
          message: `Pipeline "${p.id}" appears to contain a hardcoded credential in ${functionLabel(i, fn)}.`,
          fix: "Store the value as a Cribl Secret and reference it with C.Secret('name', 'text'), then rotate the exposed credential.",
          evidence: excerpt(found.text, found.secret),
        });
      });
    }
    return hits;
  },
};
