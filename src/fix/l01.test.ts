import { describe, expect, it } from 'vitest';
import { demoRaw, inventory, route } from '../../test/inventory';
import { buildGraph } from '../model/graph';
import { normalize } from '../model/normalize';
import { lint } from '../lint/runner';
import { planL01Fix, reorderRawRoutes } from './l01';

describe('planL01Fix', () => {
  const inv = normalize(demoRaw());

  it('moves the catch-all below the routes it shadows but above the Default route', () => {
    const plan = planL01Fix(inv.routes, 'catch_all_early')!;
    expect(plan.order).toEqual(['web', 'auth_to_splunk', 'auth_parse', 'noisy', 'catch_all_early', 'default']);
    expect(plan.cloneWarnings).toEqual(['auth_to_splunk']);
    expect(plan.takesOver).toEqual(['auth_parse', 'noisy']);
    expect(plan.moves.find((m) => m.id === 'catch_all_early')).toMatchObject({ from: 1, to: 4 });
  });

  it('clears L01 and keeps L02 (the drop is still real) after the fix', () => {
    const plan = planL01Fix(inv.routes, 'catch_all_early')!;
    const fixed = { ...inv, routes: plan.after };
    const rules = lint(fixed, buildGraph(fixed)).map((f) => f.ruleId);
    expect(rules).not.toContain('L01');
    expect(rules).toContain('L02');
  });

  it('moves to the end when there is no catch-all below, and refuses when nothing is shadowed', () => {
    const routes = [route(0), route(1, { filter: 'x' }), route(2, { filter: 'y', disabled: true })];
    expect(planL01Fix(routes, 'r0')!.order).toEqual(['r1', 'r2', 'r0']);
    expect(planL01Fix([route(0, { filter: 'x' }), route(1)], 'r1')).toBeNull();
    expect(planL01Fix(inventory().routes, 'missing')).toBeNull();
  });
});

describe('reorderRawRoutes', () => {
  it('keeps every raw field and refuses a stale table', () => {
    const raw = [{ id: 'a', extra: 1 }, { id: 'b', extra: 2 }];
    expect(reorderRawRoutes(raw, ['b', 'a'])).toEqual([{ id: 'b', extra: 2 }, { id: 'a', extra: 1 }]);
    expect(() => reorderRawRoutes(raw, ['b'])).toThrow('changed');
    expect(() => reorderRawRoutes(raw, ['b', 'c'])).toThrow('changed');
  });
});
