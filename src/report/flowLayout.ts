// Pure layout for the As-Built flow diagram: four columns, left to right.
//   Sources | Routes (in evaluation order) | Pipelines | Destinations
// Sources that use the Routing table join a vertical "bus" in front of the Routes column instead
// of drawing N x M edges. QuickConnect sources skip the Routes column and go straight to a Pipeline.
import type { Finding, Severity } from '../lint/types';
import { SEVERITY_ORDER } from '../lint/types';
import { BUILTIN_PIPELINES } from '../model/builtins';
import type { ReferenceGraph } from '../model/graph';
import type { Inventory } from '../model/types';

export const NODE_W = 200;
export const NODE_H = 28;
export const ROW_GAP = 8;
export const COL_GAP = 96;
export const PAD = 24;
export const HEADER_H = 28;

export type Column = 'source' | 'route' | 'pipeline' | 'destination';

export interface LayoutNode {
  key: string;
  column: Column;
  id: string;
  label: string;
  sublabel?: string;
  x: number;
  y: number;
  disabled: boolean;
  /** Referenced by nothing (drawn dashed so orphans stand out). */
  unreferenced: boolean;
  /** Worst severity among lint findings on this object. */
  severity?: Severity;
  findingCount: number;
}

export interface LayoutEdge {
  key: string;
  from: { x: number; y: number };
  to: { x: number; y: number };
  kind: 'bus' | 'route' | 'quickconnect';
  /** Route or QuickConnect source ids this edge carries, for hover highlighting. */
  flows: string[];
  disabled: boolean;
}

export interface FlowLayout {
  width: number;
  height: number;
  columns: { column: Column; title: string; x: number }[];
  nodes: LayoutNode[];
  edges: LayoutEdge[];
  bus?: { x: number; y1: number; y2: number };
  /** Built-in pipelines nothing uses, left out of the diagram. */
  hiddenBuiltins: string[];
}

/** Hover flow id for a routed source's edge into the bus; prefixed so it can't collide with a route id. */
export const busFlow = (sourceId: string) => `bus:${sourceId}`;

const colX = (i: number) => PAD + i * (NODE_W + COL_GAP);
const rowY = (i: number) => PAD + HEADER_H + i * (NODE_H + ROW_GAP);
const mid = (n: LayoutNode) => n.y + NODE_H / 2;

export function layoutFlow(inv: Inventory, graph: ReferenceGraph, findings: Finding[] = []): FlowLayout {
  const nodes: LayoutNode[] = [];
  const index = new Map<string, LayoutNode>();
  const byObject = new Map<string, Finding[]>();
  for (const f of findings) {
    const k = `${f.object.kind}:${f.object.id}`;
    byObject.set(k, [...(byObject.get(k) ?? []), f]);
  }
  const add = (n: Omit<LayoutNode, 'x' | 'y' | 'severity' | 'findingCount'>, col: number, row: number) => {
    const hits = byObject.get(n.key) ?? [];
    const severity = hits.map((f) => f.severity).sort((a, b) => SEVERITY_ORDER[a] - SEVERITY_ORDER[b])[0];
    const node = { ...n, x: colX(col), y: rowY(row), severity, findingCount: hits.length };
    nodes.push(node);
    index.set(node.key, node);
    return node;
  };

  // Sources: routed ones first, enabled before disabled, so the bus spans one contiguous block;
  // QuickConnect sources sit below it so the bus never passes one it isn't connected to.
  const sources = [...inv.sources].sort(
    (a, b) =>
      Number(!a.sendToRoutes) - Number(!b.sendToRoutes) ||
      Number(a.disabled) - Number(b.disabled) ||
      a.id.localeCompare(b.id),
  );
  // QuickConnect sources start below the bus, which reaches the lower of the last routed source and
  // the last route, so a short source list beside a long Routing table doesn't put one on the bus.
  const routedCount = sources.filter((s) => s.sendToRoutes).length;
  const qcStart = inv.routes.length ? Math.max(routedCount, inv.routes.length) : routedCount;
  const sourceRow = (i: number) => (i < routedCount ? i : qcStart + i - routedCount);
  sources.forEach((s, i) =>
    add(
      {
        key: `source:${s.id}`,
        column: 'source',
        id: s.id,
        label: s.id,
        sublabel: s.sendToRoutes ? s.type : `${s.type} · QuickConnect`,
        disabled: s.disabled,
        unreferenced: false,
      },
      0,
      sourceRow(i),
    ),
  );

  inv.routes.forEach((r) =>
    add(
      {
        key: `route:${r.id}`,
        column: 'route',
        id: r.id,
        label: `${r.index + 1}. ${r.name}`,
        sublabel: r.final ? 'Final' : 'non-Final',
        disabled: r.disabled,
        unreferenced: false,
      },
      1,
      r.index,
    ),
  );

  // Pipelines and destinations in first-use order along the flows, then unreferenced ones last.
  const order = (ids: string[], all: string[]) => [...new Set([...ids, ...all])];
  const unusedBuiltin = (id: string) => BUILTIN_PIPELINES.has(id) && !graph.pipelineRefs.has(id);
  const hiddenBuiltins = inv.pipelines.filter((p) => !p.packId && unusedBuiltin(p.id)).map((p) => p.id);
  const pipelineIds = order(
    graph.flows.map((f) => f.pipeline),
    inv.pipelines.filter((p) => !p.packId && !unusedBuiltin(p.id)).map((p) => p.id),
  );
  pipelineIds.forEach((id, i) => {
    const pipe = inv.pipelines.find((p) => p.id === id);
    const fnCount = pipe?.functions.length ?? 0;
    add(
      {
        key: `pipeline:${id}`,
        column: 'pipeline',
        id,
        label: pipe?.packId ? `Pack: ${pipe.packId}` : id,
        sublabel: pipe ? (pipe.packId ? 'pack' : `${fnCount} function${fnCount === 1 ? '' : 's'}`) : 'missing',
        disabled: false,
        unreferenced: !graph.pipelineRefs.has(id),
      },
      2,
      i,
    );
  });

  const destIds = order(
    graph.flows.flatMap((f) => (f.output ? [f.output] : [])),
    inv.destinations.map((d) => d.id),
  );
  destIds.forEach((id, i) => {
    const dest = inv.destinations.find((d) => d.id === id);
    const resolved = graph.resolveDestination(id);
    add(
      {
        key: `destination:${id}`,
        column: 'destination',
        id,
        label: id,
        sublabel: !dest ? 'missing' : resolved !== id ? `→ ${resolved}` : dest.type,
        disabled: dest?.disabled ?? false,
        unreferenced: !!dest && !graph.destinationRefs.has(id) && !graph.hasDynamicOutputs,
      },
      3,
      i,
    );
  });

  const edges: LayoutEdge[] = [];
  const routeNodes = nodes.filter((n) => n.column === 'route');
  const busX = colX(1) - COL_GAP / 3;
  // The bus spans every routed source as well as every route, so each source edge runs straight
  // across instead of bending to the bus end (which fanned many curves into one point).
  const busRows = [
    ...routeNodes,
    ...sources.filter((s) => s.sendToRoutes).map((s) => index.get(`source:${s.id}`)!),
  ].map(mid);
  const bus = routeNodes.length
    ? { x: busX, y1: Math.min(...busRows), y2: Math.max(...busRows) }
    : undefined;

  if (bus) {
    for (const s of sources.filter((s) => s.sendToRoutes)) {
      const n = index.get(`source:${s.id}`)!;
      edges.push({
        key: `bus:${s.id}`,
        from: { x: n.x + NODE_W, y: mid(n) },
        to: { x: bus.x, y: mid(n) },
        kind: 'bus',
        // Every routed source feeds every route, so tagging this edge with the route ids would light
        // all source edges on any route hover. It lights only when its own source is hovered.
        flows: [busFlow(s.id)],
        disabled: s.disabled,
      });
    }
    for (const n of routeNodes) {
      edges.push({
        key: `stub:${n.id}`,
        from: { x: bus.x, y: mid(n) },
        to: { x: n.x, y: mid(n) },
        kind: 'bus',
        flows: [n.id],
        disabled: n.disabled,
      });
    }
  }

  // Pipeline -> destination edges are shared by every flow that uses the pair.
  const pairEdges = new Map<string, LayoutEdge>();
  for (const f of graph.flows) {
    const pipe = index.get(`pipeline:${f.pipeline}`);
    if (!pipe) continue;
    const start =
      f.kind === 'route' ? index.get(`route:${f.via}`) : index.get(`source:${f.via}`);
    if (start) {
      edges.push({
        key: `${f.kind}:${f.via}->${f.pipeline}`,
        from: { x: start.x + NODE_W, y: mid(start) },
        to: { x: pipe.x, y: mid(pipe) },
        kind: f.kind,
        flows: [f.via],
        disabled: f.disabled,
      });
    }
    const dest = f.output ? index.get(`destination:${f.output}`) : undefined;
    if (!dest) continue;
    const key = `pair:${f.pipeline}->${f.output}`;
    const existing = pairEdges.get(key);
    if (existing) {
      existing.flows.push(f.via);
      existing.disabled = existing.disabled && f.disabled;
    } else {
      const edge: LayoutEdge = {
        key,
        from: { x: pipe.x + NODE_W, y: mid(pipe) },
        to: { x: dest.x, y: mid(dest) },
        kind: f.kind,
        flows: [f.via],
        disabled: f.disabled,
      };
      pairEdges.set(key, edge);
      edges.push(edge);
    }
  }

  const sourceRows = sources.length ? sourceRow(sources.length - 1) + 1 : 0;
  const rows = Math.max(sourceRows, inv.routes.length, pipelineIds.length, destIds.length, 1);
  return {
    width: colX(3) + NODE_W + PAD,
    height: rowY(rows) + PAD,
    columns: [
      { column: 'source', title: `Sources (${inv.sources.length})`, x: colX(0) },
      { column: 'route', title: `Routes (${inv.routes.length})`, x: colX(1) },
      { column: 'pipeline', title: 'Pipelines', x: colX(2) },
      { column: 'destination', title: 'Destinations', x: colX(3) },
    ],
    nodes,
    edges,
    bus,
    hiddenBuiltins,
  };
}
