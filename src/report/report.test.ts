import { describe, expect, it } from 'vitest';
import { demoRaw, destination, inventory, pipeline, route, source, workspaceDefaultRaw } from '../../test/inventory';
import { buildGraph } from '../model/graph';
import { normalize } from '../model/normalize';
import { buildAsBuilt } from './asBuilt';
import { layoutFlow, NODE_W } from './flowLayout';
import { cell, code, toMarkdown } from './markdown';

const demo = inventory({
  sources: [
    source('gen_web'),
    source('gen_qc', { sendToRoutes: false, connections: [{ pipeline: 'qc_pipe', output: 'lake' }] }),
    source('gen_off', { disabled: true }),
  ],
  routes: [
    route(0, { name: 'web', filter: "sourcetype=='web'", pipeline: 'web_pipe', output: 'lake', final: true }),
    route(1, { name: 'default', output: 'default' }),
  ],
  pipelines: [pipeline('passthru'), pipeline('web_pipe', ['eval', 'drop']), pipeline('qc_pipe', ['eval']), pipeline('unused', ['eval'])],
  destinations: [destination('lake', { type: 'cribl_lake', onBackpressure: 'block' }), destination('devnull'), destination('default', { type: 'default', defaultId: 'devnull' })],
});

describe('buildAsBuilt', () => {
  const report = buildAsBuilt(demo, buildGraph(demo));

  it('summarizes counts and QuickConnect usage', () => {
    expect(report.summary).toEqual({
      sources: { total: 3, enabled: 2, quickConnect: 1 },
      routes: { total: 2, enabled: 2 },
      pipelines: 4,
      destinations: 3,
      packs: 0,
    });
  });

  it('shows where the default alias really goes and who uses each object', () => {
    expect(report.routes[1].output).toBe('default → devnull');
    expect(report.pipelines.find((p) => p.id === 'unused')?.usedBy).toBe('—');
    expect(report.pipelines.find((p) => p.id === 'qc_pipe')?.usedBy).toBe('QuickConnect gen_qc');
    expect(report.destinations.find((d) => d.id === 'lake')?.usedBy).toBe('route web, QuickConnect gen_qc');
  });
});

describe('layoutFlow', () => {
  const layout = layoutFlow(demo, buildGraph(demo));

  it('puts each object type in its own column, left to right', () => {
    const xs = ['source', 'route', 'pipeline', 'destination'].map(
      (c) => layout.nodes.find((n) => n.column === c)!.x,
    );
    expect(xs).toEqual([...xs].sort((a, b) => a - b));
    expect(xs[1] - xs[0]).toBeGreaterThan(NODE_W);
  });

  it('sends routed sources to the bus and QuickConnect sources straight to their pipeline', () => {
    const keys = layout.edges.map((e) => e.key);
    expect(keys).toContain('bus:gen_web');
    expect(keys).not.toContain('bus:gen_qc');
    expect(keys).toContain('quickconnect:gen_qc->qc_pipe');
    expect(layout.edges.find((e) => e.key === 'pair:passthru->default')?.flows).toEqual(['r1']);
  });

  it('marks unreferenced pipelines and destinations', () => {
    const unref = layout.nodes.filter((n) => n.unreferenced).map((n) => n.key);
    expect(unref).toEqual(['pipeline:unused']);
  });

  it('lays out the real workspace fixture without overlapping rows', () => {
    const inv = normalize(workspaceDefaultRaw);
    const big = layoutFlow(inv, buildGraph(inv));
    for (const col of ['source', 'route', 'pipeline', 'destination']) {
      const ys = big.nodes.filter((n) => n.column === col).map((n) => n.y);
      expect(new Set(ys).size).toBe(ys.length);
    }
  });

  it('handles a group with no routes', () => {
    const empty = inventory({ sources: [source('a')] });
    const l = layoutFlow(empty, buildGraph(empty));
    expect(l.bus).toBeUndefined();
    expect(l.edges).toEqual([]);
  });
});

describe('markdown', () => {
  it('escapes table cells and code spans', () => {
    expect(cell('a|b\nc')).toBe('a\\|b c');
    expect(cell('')).toBe('—');
    expect(code('x=`y`')).toBe('`` x=`y` ``'); // longer fence, padded because it ends in a backtick
    expect(code('/\\d+/')).toBe('`/\\d+/`');
  });

  it('renders a complete, deterministic report', () => {
    const md = toMarkdown(buildAsBuilt(demo, buildGraph(demo)), buildGraph(demo).flows, new Date('2026-09-26T15:04:00Z'));
    expect(md).toContain('# As-Built: test');
    expect(md).toContain('Generated 2026-09-26 15:04 UTC by Cribl Blueprint');
    expect(md).toContain("| 1 | web | `sourcetype=='web'` | web_pipe | lake | Yes | Yes |");
    expect(md).toContain('```mermaid\nflowchart LR');
    expect(md).toContain('-.->'); // QuickConnect edge
    expect(md).toContain('default → devnull');
    expect(md.split('```mermaid')[1].split('```')[0]).not.toContain('gen_off'); // disabled sources omitted
  });
});

describe('blueprint-demo seed', () => {
  const inv = normalize(demoRaw());
  const graph = buildGraph(inv);

  it('wires the objects the demo script relies on', () => {
    expect(inv.routes.map((r) => r.id)).toEqual(['web', 'catch_all_early', 'auth_to_splunk', 'auth_parse', 'noisy', 'default']);
    expect(graph.pipelineRefs.has('legacy_cleanup')).toBe(false);
    expect(graph.destinationRefs.has('old_s3_archive')).toBe(false);
    expect(graph.pipelineRefs.get('qc_enrich')).toEqual([{ kind: 'quickconnect', from: 'gen_metrics_qc' }]);
    expect(graph.resolveDestination('default')).toBe('devnull');
  });

  it('contains no real-looking hosts or secrets', () => {
    const text = JSON.stringify(demoRaw());
    const hosts = text.match(/[a-z0-9-]+(\.[a-z0-9-]+)*\.(com|net|org|io|cloud)\b/gi) ?? [];
    expect(hosts.every((h) => h.endsWith('example.com'))).toBe(true);
    expect(text).toContain('FAKE');
  });
});
