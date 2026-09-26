// Who references what. Shared by the flow diagram, the Markdown report, and the orphan rules
// (L03/L04), so QuickConnect, Output Routers, and the `default` alias are handled in one place.
import type { Destination, Inventory } from './types';

export type RefKind = 'route' | 'source' | 'quickconnect' | 'destination' | 'router' | 'alias';

export interface Ref {
  kind: RefKind;
  /** Id of the referencing object (route id, source id, destination id). */
  from: string;
}

export interface Flow {
  kind: 'route' | 'quickconnect';
  /** Route id for route flows; source id for QuickConnect flows. */
  via: string;
  pipeline: string;
  /** Destination id as configured (may be the `default` alias). */
  output?: string;
  /** Destination id after following the `default` alias. */
  resolvedOutput?: string;
  disabled: boolean;
}

export interface ReferenceGraph {
  pipelineRefs: Map<string, Ref[]>;
  destinationRefs: Map<string, Ref[]>;
  flows: Flow[];
  /** True when an enabled route picks its destination at runtime, so orphans can't be proven. */
  hasDynamicOutputs: boolean;
  resolveDestination: (id: string) => string;
}

function push(map: Map<string, Ref[]>, key: string | undefined, ref: Ref) {
  if (!key) return;
  const list = map.get(key);
  if (list) list.push(ref);
  else map.set(key, [ref]);
}

export function makeResolver(destinations: Destination[]): (id: string) => string {
  const byId = new Map(destinations.map((d) => [d.id, d]));
  return (id: string) => {
    let current = id;
    // Follow alias chains, guarding against a cycle.
    for (let hops = 0; hops < 5; hops++) {
      const next = byId.get(current)?.defaultId;
      if (!next || next === current) break;
      current = next;
    }
    return current;
  };
}

export function buildGraph(inv: Inventory): ReferenceGraph {
  const pipelineRefs = new Map<string, Ref[]>();
  const destinationRefs = new Map<string, Ref[]>();
  const flows: Flow[] = [];
  const resolveDestination = makeResolver(inv.destinations);

  for (const route of inv.routes) {
    push(pipelineRefs, route.pipeline, { kind: 'route', from: route.id });
    push(destinationRefs, route.output, { kind: 'route', from: route.id });
    flows.push({
      kind: 'route',
      via: route.id,
      pipeline: route.pipeline,
      output: route.output,
      resolvedOutput: route.output && resolveDestination(route.output),
      disabled: route.disabled,
    });
  }

  for (const source of inv.sources) {
    push(pipelineRefs, source.pipeline, { kind: 'source', from: source.id });
    for (const c of source.connections) {
      const pipeline = c.pipeline ?? 'passthru';
      push(pipelineRefs, pipeline, { kind: 'quickconnect', from: source.id });
      push(destinationRefs, c.output, { kind: 'quickconnect', from: source.id });
      flows.push({
        kind: 'quickconnect',
        via: source.id,
        pipeline,
        output: c.output,
        resolvedOutput: resolveDestination(c.output),
        disabled: source.disabled,
      });
    }
  }

  for (const dest of inv.destinations) {
    push(pipelineRefs, dest.pipeline, { kind: 'destination', from: dest.id });
    push(destinationRefs, dest.defaultId, { kind: 'alias', from: dest.id });
    for (const rule of dest.rules) push(destinationRefs, rule.output, { kind: 'router', from: dest.id });
  }

  const hasDynamicOutputs = inv.routes.some((r) => !r.disabled && r.outputExpression !== undefined);
  return { pipelineRefs, destinationRefs, flows, hasDynamicOutputs, resolveDestination };
}
