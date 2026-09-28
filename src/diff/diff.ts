// Inventory x Inventory -> ChangeSet. Objects are matched by id; routes also report moves.
import type { Destination, Inventory, Pack, Pipeline, Route, Source } from '../model/types';

export type DiffKind = 'routes' | 'pipelines' | 'sources' | 'destinations' | 'packs';

export interface FieldChange {
  field: string;
  before: string;
  after: string;
}

export interface ObjectChange {
  id: string;
  name?: string;
  fields: FieldChange[];
}

export interface KindDiff {
  added: { id: string; name?: string }[];
  removed: { id: string; name?: string }[];
  changed: ObjectChange[];
}

export interface ChangeSet {
  kinds: Record<DiffKind, KindDiff>;
  /** Route ids in evaluation order before and after, when the order changed. */
  routeOrder?: { before: string[]; after: string[] };
  total: number;
}

const show = (v: unknown): string => {
  if (v === undefined || v === null || v === '') return '—';
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  if (typeof v === 'string' || typeof v === 'number') return String(v);
  return JSON.stringify(v);
};

function fieldChanges<T>(a: T, b: T, fields: [string, (x: T) => unknown][]): FieldChange[] {
  return fields.flatMap(([field, get]) => {
    const before = show(get(a));
    const after = show(get(b));
    return before === after ? [] : [{ field, before, after }];
  });
}

function diffById<T extends { id: string }>(
  before: T[],
  after: T[],
  compare: (a: T, b: T) => FieldChange[],
  name?: (x: T) => string | undefined,
): KindDiff {
  const a = new Map(before.map((x) => [x.id, x]));
  const b = new Map(after.map((x) => [x.id, x]));
  const label = (x: T) => {
    const n = name?.(x);
    return n && n !== x.id ? { id: x.id, name: n } : { id: x.id };
  };
  return {
    added: after.filter((x) => !a.has(x.id)).map(label),
    removed: before.filter((x) => !b.has(x.id)).map(label),
    changed: after
      .filter((x) => a.has(x.id))
      .map((x) => ({ ...label(x), fields: compare(a.get(x.id)!, x) }))
      .filter((c) => c.fields.length > 0),
  };
}

const ROUTE_FIELDS: [string, (r: Route) => unknown][] = [
  ['position', (r) => r.index + 1],
  ['name', (r) => r.name],
  ['filter', (r) => r.filter],
  ['final', (r) => r.final],
  ['enabled', (r) => !r.disabled],
  ['pipeline', (r) => r.pipeline],
  ['destination', (r) => r.output ?? `expression: ${r.outputExpression ?? ''}`],
  ['description', (r) => r.description],
];

function pipelineChanges(a: Pipeline, b: Pipeline): FieldChange[] {
  const out = fieldChanges(a, b, [
    ['description', (p) => p.description],
    ['functions', (p) => p.functions.length],
  ]);
  const n = Math.max(a.functions.length, b.functions.length);
  for (let i = 0; i < n; i++) {
    const fa = a.functions[i];
    const fb = b.functions[i];
    if (fa && fb && JSON.stringify(fa) === JSON.stringify(fb)) continue;
    const describe = (f: typeof fa) => (f ? `${f.id}${f.disabled ? ' (disabled)' : ''}` : '—');
    if (!fa || !fb || fa.id !== fb.id || fa.disabled !== fb.disabled) {
      out.push({ field: `function ${i + 1}`, before: describe(fa), after: describe(fb) });
    } else {
      out.push({ field: `function ${i + 1} (${fb.id})`, before: 'settings', after: 'settings changed' });
    }
  }
  return out;
}

const SOURCE_FIELDS: [string, (s: Source) => unknown][] = [
  ['type', (s) => s.type],
  ['enabled', (s) => !s.disabled],
  ['pre-processing', (s) => s.pipeline],
  ['mode', (s) => (s.sendToRoutes ? 'Routes' : 'QuickConnect')],
  ['QuickConnect', (s) => s.connections.map((c) => `${c.pipeline ?? 'passthru'} → ${c.output}`).join(', ')],
];

const DESTINATION_FIELDS: [string, (d: Destination) => unknown][] = [
  ['type', (d) => d.type],
  ['enabled', (d) => !d.disabled],
  ['backpressure', (d) => d.onBackpressure],
  ['post-processing', (d) => d.pipeline],
  ['default target', (d) => d.defaultId],
  ['router rules', (d) => (d.rules.length ? d.rules.map((r) => `${r.filter} → ${r.output}`).join('; ') : undefined)],
];

const PACK_FIELDS: [string, (p: Pack) => unknown][] = [
  ['version', (p) => p.version],
  ['name', (p) => p.displayName],
];

export function diffInventory(before: Inventory, after: Inventory): ChangeSet {
  const realA = before.pipelines.filter((p) => !p.packId);
  const realB = after.pipelines.filter((p) => !p.packId);
  const kinds: Record<DiffKind, KindDiff> = {
    routes: diffById(before.routes, after.routes, (a, b) => fieldChanges(a, b, ROUTE_FIELDS), (r) => r.name),
    pipelines: diffById(realA, realB, pipelineChanges),
    sources: diffById(before.sources, after.sources, (a, b) => fieldChanges(a, b, SOURCE_FIELDS)),
    destinations: diffById(before.destinations, after.destinations, (a, b) => fieldChanges(a, b, DESTINATION_FIELDS)),
    packs: diffById(before.packs, after.packs, (a, b) => fieldChanges(a, b, PACK_FIELDS)),
  };
  const orderA = before.routes.map((r) => r.id);
  const orderB = after.routes.map((r) => r.id);
  const routeOrder = orderA.join('\n') === orderB.join('\n') ? undefined : { before: orderA, after: orderB };
  const total = Object.values(kinds).reduce((n, k) => n + k.added.length + k.removed.length + k.changed.length, 0);
  return { kinds, routeOrder, total };
}
