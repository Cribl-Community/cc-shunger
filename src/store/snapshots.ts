// Snapshots: a labelled, redacted copy of a group's Inventory.
//   snapshot/<group>/<id>/chunk/<n>  JSON text, split under the KV size limit
//   snapshot/<group>/<id>/meta       written LAST, so a snapshot without meta is incomplete
import { redactInventory } from '../model/redact';
import type { Inventory } from '../model/types';
import { chunkText, httpKv, kvKey, type KvClient } from './kv';

export const SNAPSHOT_SCHEMA = 1;

export interface SnapshotMeta {
  schema: number;
  id: string;
  group: string;
  label: string;
  takenAt: string;
  takenBy?: string;
  chunks: number;
  bytes: number;
  counts: { sources: number; routes: number; pipelines: number; destinations: number; packs: number };
}

export interface Snapshot {
  meta: SnapshotMeta;
  inventory: Inventory;
}

const prefix = (group: string) => `${kvKey('snapshot', group)}/`;
const base = (group: string, id: string) => kvKey('snapshot', group, id);

/** Sortable, key-safe id from the capture time, e.g. `20260928T142501Z`. */
export const snapshotId = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');

export async function saveSnapshot(
  inv: Inventory,
  label: string,
  opts: { takenBy?: string; now?: Date; kv?: KvClient } = {},
): Promise<SnapshotMeta> {
  const kv = opts.kv ?? httpKv;
  const now = opts.now ?? new Date();
  const id = snapshotId(now);
  const text = JSON.stringify(redactInventory(inv));
  const chunks = chunkText(text);
  const b = base(inv.group, id);
  for (const [n, chunk] of chunks.entries()) await kv.put(`${b}/chunk/${n}`, chunk);
  const meta: SnapshotMeta = {
    schema: SNAPSHOT_SCHEMA,
    id,
    group: inv.group,
    label: label.trim() || id,
    takenAt: now.toISOString(),
    takenBy: opts.takenBy,
    chunks: chunks.length,
    bytes: new TextEncoder().encode(text).length,
    counts: {
      sources: inv.sources.length,
      routes: inv.routes.length,
      pipelines: inv.pipelines.filter((p) => !p.packId).length,
      destinations: inv.destinations.length,
      packs: inv.packs.length,
    },
  };
  await kv.put(`${b}/meta`, JSON.stringify(meta));
  return meta;
}

/** Complete snapshots for a group, newest first. */
export async function listSnapshots(group: string, kv: KvClient = httpKv): Promise<SnapshotMeta[]> {
  const keys = (await kv.list(prefix(group))).filter((k) => k.endsWith('/meta'));
  const metas = await Promise.all(
    keys.map(async (k) => {
      const text = await kv.get(k);
      try {
        return text ? (JSON.parse(text) as SnapshotMeta) : null;
      } catch {
        return null;
      }
    }),
  );
  return metas
    .filter((m): m is SnapshotMeta => m !== null && m.schema === SNAPSHOT_SCHEMA)
    .sort((a, b) => b.takenAt.localeCompare(a.takenAt));
}

export async function loadSnapshot(meta: SnapshotMeta, kv: KvClient = httpKv): Promise<Snapshot> {
  const b = base(meta.group, meta.id);
  const parts = await Promise.all(Array.from({ length: meta.chunks }, (_, n) => kv.get(`${b}/chunk/${n}`)));
  if (parts.some((p) => p === null)) throw new Error(`Snapshot "${meta.label}" is missing data`);
  return { meta, inventory: JSON.parse(parts.join('')) as Inventory };
}

/** Deletes meta first, so a half-deleted snapshot disappears from the list. */
export async function deleteSnapshot(meta: SnapshotMeta, kv: KvClient = httpKv): Promise<void> {
  const b = base(meta.group, meta.id);
  await kv.del(`${b}/meta`);
  const chunks = (await kv.list(`${b}/`)).filter((k) => k.startsWith(`${b}/chunk/`));
  for (const k of chunks) await kv.del(k);
}
