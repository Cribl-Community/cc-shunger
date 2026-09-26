import { describe, expect, it } from 'vitest';
import { workspaceDefaultRaw } from '../../test/inventory';
import { normalize } from './normalize';

describe('normalize (workspace fixture, Cribl 4.20.1)', () => {
  const inv = normalize(workspaceDefaultRaw);

  it('reads every object type', () => {
    expect(inv.group).toBe('default');
    expect(inv.criblVersion).toMatch(/^4\.20/);
    expect(inv.sources).toHaveLength(15);
    expect(inv.routes).toHaveLength(7);
    expect(inv.pipelines).toHaveLength(27);
    expect(inv.destinations).toHaveLength(7);
    expect(inv.packs).toHaveLength(12);
  });

  it('keeps routes in evaluation order with the Default route last', () => {
    expect(inv.routes.map((r) => r.index)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    const last = inv.routes[6];
    expect(last).toMatchObject({ id: 'default', filter: 'true', final: true, output: 'default' });
    expect(inv.routes[0].final).toBe(false);
  });

  it('marks pack pseudo-pipelines and keeps function details', () => {
    const packs = inv.pipelines.filter((p) => p.packId);
    expect(packs).toHaveLength(12);
    expect(packs.every((p) => p.functions.length === 0)).toBe(true);
    const asa = inv.pipelines.find((p) => p.id === 'cisco_asa')!;
    expect(asa.functions).toHaveLength(11);
    expect(asa.functions[0]).toMatchObject({ id: 'eval', final: true });
  });

  it('reads the default alias and backpressure settings', () => {
    expect(inv.destinations.find((d) => d.id === 'default')).toMatchObject({ type: 'default', defaultId: 'devnull' });
    expect(inv.destinations.find((d) => d.id === 'somedata')?.onBackpressure).toBe('block');
  });

  it('treats sources without sendToRoutes and connections as routed', () => {
    expect(inv.sources.every((s) => s.sendToRoutes)).toBe(true);
    expect(inv.sources.find((s) => s.id === 'in_elastic')?.disabled).toBe(true);
  });
});

describe('normalize (edge cases)', () => {
  const empty = { group: 'g', routes: [], pipelines: [], inputs: [], outputs: [], packs: [] };

  it('handles an empty group', () => {
    expect(normalize(empty)).toEqual({
      group: 'g',
      criblVersion: undefined,
      sources: [],
      routes: [],
      pipelines: [],
      destinations: [],
      packs: [],
    });
  });

  it('reads QuickConnect connections and output expressions', () => {
    const inv = normalize({
      ...empty,
      inputs: [{ id: 'gen', type: 'datagen', sendToRoutes: false, connections: [{ pipeline: 'p1', output: 'o1' }, { output: 'o2' }] }],
      routes: [{ id: 'default', routes: [{ id: 'x', name: 'dyn', filter: 'true', enableOutputExpression: true, outputExpression: '`out_${host}`', pipeline: 'p1' }] }],
    });
    expect(inv.sources[0]).toMatchObject({ sendToRoutes: false, connections: [{ pipeline: 'p1', output: 'o1' }, { output: 'o2' }] });
    expect(inv.routes[0]).toMatchObject({ output: undefined, outputExpression: '`out_${host}`' });
  });

  it('defaults missing route fields the way Cribl does', () => {
    const inv = normalize({ ...empty, routes: [{ id: 'default', routes: [{ id: 'a', name: 'a' }] }] });
    expect(inv.routes[0]).toMatchObject({ filter: 'true', final: true, pipeline: 'passthru', output: 'default', disabled: false });
  });
});
