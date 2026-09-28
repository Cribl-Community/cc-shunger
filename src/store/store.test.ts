import { describe, expect, it } from 'vitest';
import { demoRaw } from '../../test/inventory';
import { buildGraph } from '../model/graph';
import { normalize } from '../model/normalize';
import { lint } from '../lint/runner';
import { chunkText, KV_CHUNK_BYTES, kvKey, memoryKv } from './kv';
import { deleteSnapshot, listSnapshots, loadSnapshot, saveSnapshot, snapshotId } from './snapshots';
import { applySuppressions, loadSuppressions, suppress, unsuppress } from './suppressions';

const bytes = (s: string) => new TextEncoder().encode(s).length;

describe('kv helpers', () => {
  it('builds keys without colons and encodes segments', () => {
    expect(kvKey('snapshot', 'default', '20260928T140000Z')).toBe('snapshot/default/20260928T140000Z');
    expect(kvKey('suppress', 'a/b:c')).toBe('suppress/a%2Fb%3Ac');
  });

  it('chunks text under the byte limit without splitting multi-byte characters', () => {
    const text = 'é€😀x'.repeat(40_000);
    const chunks = chunkText(text, 1000);
    expect(chunks.join('')).toBe(text);
    expect(chunks.every((c) => bytes(c) <= 1000)).toBe(true);
    expect(chunkText('')).toEqual(['']);
    expect(chunkText('a'.repeat(KV_CHUNK_BYTES + 1))).toHaveLength(2);
  });
});

describe('snapshots', () => {
  const inv = normalize(demoRaw());

  it('round-trips an inventory, newest first, with secrets masked', async () => {
    const kv = memoryKv();
    await saveSnapshot(inv, 'before', { kv, now: new Date('2026-09-28T14:00:00Z'), takenBy: 'steve' });
    await saveSnapshot(inv, 'after', { kv, now: new Date('2026-09-28T15:00:00Z') });
    const list = await listSnapshots('blueprint-demo', kv);
    expect(list.map((m) => m.label)).toEqual(['after', 'before']);
    expect(list[1]).toMatchObject({ id: '20260928T140000Z', takenBy: 'steve', counts: { routes: 6 } });

    const snap = await loadSnapshot(list[1], kv);
    expect(snap.inventory.routes.map((r) => r.id)).toEqual(inv.routes.map((r) => r.id));
    const stored = [...kv.data.values()].join('');
    expect(stored).not.toContain('FAKE0000blueprint0000demo0000FAKE');
    expect(JSON.stringify(snap.inventory)).toMatch(/toke•+#[0-9a-f]{8}/); // whole literal masked, fingerprinted
    expect([...kv.data.keys()].every((k) => !k.includes(':'))).toBe(true);
  });

  it('chunks large inventories and ignores snapshots whose meta was never written', async () => {
    const kv = memoryKv();
    const big = { ...inv, pipelines: Array.from({ length: 400 }, (_, i) => ({ ...inv.pipelines[1], id: `p${i}` })) };
    const meta = await saveSnapshot(big, 'big', { kv, now: new Date('2026-09-28T16:00:00Z') });
    expect(meta.chunks).toBeGreaterThan(1);
    expect((await loadSnapshot(meta, kv)).inventory.pipelines).toHaveLength(400);

    await kv.put('snapshot/blueprint-demo/20260928T170000Z/chunk/0', '{');
    expect((await listSnapshots('blueprint-demo', kv)).map((m) => m.label)).toEqual(['big']);
  });

  it('deletes meta and every chunk', async () => {
    const kv = memoryKv();
    const meta = await saveSnapshot(inv, 'x', { kv });
    await deleteSnapshot(meta, kv);
    expect(kv.data.size).toBe(0);
  });

  it('uses sortable ids', () => {
    expect(snapshotId(new Date('2026-09-28T09:05:03.123Z'))).toBe('20260928T090503Z');
  });
});

describe('suppressions', () => {
  const inv = normalize(demoRaw());
  const findings = lint(inv, buildGraph(inv));
  const l02 = findings.find((f) => f.ruleId === 'L02')!;

  it('persists with a reason and splits active from suppressed', async () => {
    const kv = memoryKv();
    await suppress('blueprint-demo', l02, '  Intentional: test data  ', { kv, by: 'steve', now: new Date(0) });
    const doc = await loadSuppressions('blueprint-demo', kv);
    expect(doc.items[l02.key]).toMatchObject({ reason: 'Intentional: test data', by: 'steve' });
    const { active, suppressed, stale } = applySuppressions(findings, doc);
    expect(active).toHaveLength(findings.length - 1);
    expect(suppressed.map((s) => s.finding.key)).toEqual([l02.key]);
    expect(stale).toEqual([]);
  });

  it('requires a reason, reports stale entries, and unsuppresses', async () => {
    const kv = memoryKv();
    await expect(suppress('g', l02, '   ', { kv })).rejects.toThrow('reason');
    await suppress('g', l02, 'why', { kv });
    expect(applySuppressions([], await loadSuppressions('g', kv)).stale.map((s) => s.key)).toEqual([l02.key]);
    await unsuppress('g', l02.key, kv);
    expect((await loadSuppressions('g', kv)).items).toEqual({});
  });

  it('treats a missing or corrupt document as empty', async () => {
    expect((await loadSuppressions('none', memoryKv())).items).toEqual({});
    expect((await loadSuppressions('bad', memoryKv({ 'suppress/bad': 'nope' }))).items).toEqual({});
  });
});
