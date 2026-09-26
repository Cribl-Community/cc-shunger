import { describe, expect, it } from 'vitest';
import { destination, inventory, pipeline, route, source } from '../../test/inventory';
import { buildGraph } from './graph';

describe('buildGraph', () => {
  it('resolves the default alias, including chains, without looping', () => {
    const g = buildGraph(
      inventory({
        destinations: [
          destination('default', { type: 'default', defaultId: 'mid' }),
          destination('mid', { type: 'default', defaultId: 'lake' }),
          destination('lake', { type: 'cribl_lake' }),
          destination('loop', { type: 'default', defaultId: 'loop' }),
        ],
      }),
    );
    expect(g.resolveDestination('default')).toBe('lake');
    expect(g.resolveDestination('loop')).toBe('loop');
    expect(g.resolveDestination('unknown')).toBe('unknown');
  });

  it('counts routes, QuickConnect, pre/post-processing, routers and aliases as references', () => {
    const inv = inventory({
      sources: [
        source('routed', { pipeline: 'pre' }),
        source('qc', { sendToRoutes: false, connections: [{ pipeline: 'qc_pipe', output: 'qc_out' }] }),
      ],
      routes: [route(0, { pipeline: 'main', output: 'router' })],
      pipelines: [pipeline('pre'), pipeline('qc_pipe'), pipeline('main'), pipeline('post'), pipeline('orphan')],
      destinations: [
        destination('router', { type: 'router', rules: [{ filter: 'true', output: 'lake', final: true }] }),
        destination('lake', { pipeline: 'post' }),
        destination('qc_out'),
        destination('lonely'),
        destination('devnull'),
        destination('default', { type: 'default', defaultId: 'devnull' }),
      ],
    });
    const g = buildGraph(inv);
    expect(g.pipelineRefs.get('pre')).toEqual([{ kind: 'source', from: 'routed' }]);
    expect(g.pipelineRefs.get('qc_pipe')).toEqual([{ kind: 'quickconnect', from: 'qc' }]);
    expect(g.pipelineRefs.get('main')).toEqual([{ kind: 'route', from: 'r0' }]);
    expect(g.pipelineRefs.get('post')).toEqual([{ kind: 'destination', from: 'lake' }]);
    expect(g.pipelineRefs.has('orphan')).toBe(false);
    expect(g.destinationRefs.get('lake')).toEqual([{ kind: 'router', from: 'router' }]);
    expect(g.destinationRefs.get('qc_out')).toEqual([{ kind: 'quickconnect', from: 'qc' }]);
    expect(g.destinationRefs.get('devnull')).toEqual([{ kind: 'alias', from: 'default' }]);
    expect(g.destinationRefs.has('lonely')).toBe(false);
    expect(g.flows.map((f) => [f.kind, f.via, f.pipeline, f.output])).toEqual([
      ['route', 'r0', 'main', 'router'],
      ['quickconnect', 'qc', 'qc_pipe', 'qc_out'],
    ]);
  });

  it('flags dynamic outputs only for enabled routes', () => {
    const dyn = route(0, { output: undefined, outputExpression: 'x' });
    expect(buildGraph(inventory({ routes: [dyn] })).hasDynamicOutputs).toBe(true);
    expect(buildGraph(inventory({ routes: [{ ...dyn, disabled: true }] })).hasDynamicOutputs).toBe(false);
  });
});
