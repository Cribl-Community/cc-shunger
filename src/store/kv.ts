// App-scoped KV store (see DECISIONS.md "KV limits"): values are strings sent as text/plain,
// keys use `/` (never `:`), and values must stay under ~100 KB, so large JSON is chunked.

export interface KvClient {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
  del(key: string): Promise<void>;
  list(prefix: string): Promise<string[]>;
}

/** Keys are `/`-separated; each segment is URI-encoded so ids can't break routing. */
export const kvKey = (...segments: string[]) => segments.map((s) => encodeURIComponent(s)).join('/');

export class KvError extends Error {
  constructor(op: string, key: string, status: number) {
    super(`KV ${op} ${key} failed (${status})`);
    this.name = 'KvError';
  }
}

export const httpKv: KvClient = {
  async get(key) {
    const res = await fetch(`${window.CRIBL_API_URL}/kvstore/${key}`);
    if (res.status === 404) return null;
    if (!res.ok) throw new KvError('GET', key, res.status);
    return res.text();
  },
  async put(key, value) {
    const res = await fetch(`${window.CRIBL_API_URL}/kvstore/${key}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'text/plain' },
      body: value,
    });
    if (!res.ok) throw new KvError('PUT', key, res.status);
  },
  async del(key) {
    const res = await fetch(`${window.CRIBL_API_URL}/kvstore/${key}`, { method: 'DELETE' });
    if (!res.ok && res.status !== 404) throw new KvError('DELETE', key, res.status);
  },
  async list(prefix) {
    const res = await fetch(`${window.CRIBL_API_URL}/kvstore/keys`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prefix }),
    });
    if (!res.ok) throw new KvError('LIST', prefix, res.status);
    const body = (await res.json()) as unknown;
    return Array.isArray(body) ? body.map(String) : [];
  },
};

/** Largest value we write, below the observed ~100 KB rejection threshold. */
export const KV_CHUNK_BYTES = 90 * 1024;

const encoder = new TextEncoder();

/** Splits text into pieces whose UTF-8 size is at most `maxBytes`, never splitting a character. */
export function chunkText(text: string, maxBytes = KV_CHUNK_BYTES): string[] {
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(text.length, start + maxBytes);
    while (encoder.encode(text.slice(start, end)).length > maxBytes) {
      end = start + Math.floor((end - start) * 0.9);
    }
    // Don't cut a surrogate pair in half.
    const code = text.charCodeAt(end - 1);
    if (end < text.length && code >= 0xd800 && code <= 0xdbff) end -= 1;
    chunks.push(text.slice(start, end));
    start = end;
  }
  return chunks.length ? chunks : [''];
}

/** In-memory client for tests. */
export function memoryKv(initial: Record<string, string> = {}): KvClient & { data: Map<string, string> } {
  const data = new Map(Object.entries(initial));
  return {
    data,
    get: async (k) => data.get(k) ?? null,
    put: async (k, v) => {
      if (encoder.encode(v).length > 100 * 1024) throw new KvError('PUT', k, 413);
      data.set(k, v);
    },
    del: async (k) => {
      data.delete(k);
    },
    list: async (prefix) => [...data.keys()].filter((k) => k.startsWith(prefix)).sort(),
  };
}
