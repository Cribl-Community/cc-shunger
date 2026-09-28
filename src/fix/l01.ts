// L01 fix-it: move a shadowing catch-all route down to just above the next catch-all (or to the
// end), so the specific routes it was hiding run first. Pure planning; the write lives in
// api/routes.ts and only happens after the user confirms the preview.
import { isCatchAll } from '../lint/helpers';
import type { Route } from '../model/types';

export interface RouteMove {
  id: string;
  name: string;
  from: number;
  to: number;
}

export interface L01FixPlan {
  shadowingId: string;
  shadowingName: string;
  /** Route ids in the new order. */
  order: string[];
  before: Route[];
  after: Route[];
  moves: RouteMove[];
  /** Moved non-Final routes: matching events will now also continue down the table. */
  cloneWarnings: string[];
  /** Enabled Final routes that will now consume events the catch-all used to take. */
  takesOver: string[];
}

export function planL01Fix(routes: Route[], shadowingId: string): L01FixPlan | null {
  const i = routes.findIndex((r) => r.id === shadowingId);
  if (i < 0) return null;
  const s = routes[i];
  // The next enabled Final catch-all below is a barrier: routes below it stay where they are.
  const barrier = routes.findIndex((r, j) => j > i && !r.disabled && r.final && isCatchAll(r.filter));
  const j = barrier < 0 ? routes.length : barrier;
  const lifted = routes.slice(i + 1, j);
  if (!lifted.some((r) => !r.disabled && !isCatchAll(r.filter))) return null;

  const after = [...routes.slice(0, i), ...lifted, s, ...routes.slice(j)].map((r, index) => ({ ...r, index }));
  const moves = after
    .map((r) => ({ id: r.id, name: r.name, from: routes.findIndex((x) => x.id === r.id), to: r.index }))
    .filter((m) => m.from !== m.to);
  const active = lifted.filter((r) => !r.disabled);
  return {
    shadowingId: s.id,
    shadowingName: s.name,
    order: after.map((r) => r.id),
    before: routes,
    after,
    moves,
    cloneWarnings: active.filter((r) => !r.final).map((r) => r.name),
    takesOver: active.filter((r) => r.final).map((r) => r.name),
  };
}

/** Reorders a raw Routing table (full API objects, every field preserved) to match a plan. */
export function reorderRawRoutes<T extends { id: string }>(raw: T[], order: string[]): T[] {
  const byId = new Map(raw.map((r) => [r.id, r]));
  if (raw.length !== order.length || order.some((id) => !byId.has(id))) {
    throw new Error('The Routing table changed since Blueprint loaded it. Refresh and try again.');
  }
  return order.map((id) => byId.get(id)!);
}
