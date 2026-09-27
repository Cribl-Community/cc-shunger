import { describe, expect, it } from 'vitest';
import { EXPECTED_FINDINGS } from '../../demo/seed';
import { demoRaw, destination, inventory, pipeline, route, source, workspaceDefaultRaw } from '../../test/inventory';
import { buildGraph } from '../model/graph';
import { normalize } from '../model/normalize';
import type { Inventory, PipelineFunction } from '../model/types';
import { isCatchAll } from './helpers';
import { L01 } from './rules/L01';
import { L02 } from './rules/L02';
import { L03 } from './rules/L03';
import { L04 } from './rules/L04';
import { L05 } from './rules/L05';
import { L06 } from './rules/L06';
import { L07, findSecret, mask } from './rules/L07';
import { L08 } from './rules/L08';
import { lint, runRule } from './runner';
import type { Rule } from './types';

const keys = (rule: Rule, inv: Inventory) => runRule(rule, inv, buildGraph(inv)).map((f) => f.key);
const fn = (id: string, conf: Record<string, unknown>, extra: Partial<PipelineFunction> = {}): PipelineFunction => ({
  id,
  conf,
  disabled: false,
  final: false,
  ...extra,
});

describe('isCatchAll', () => {
  it.each(['true', ' true ', '(true)', '!false', '1', '', '((true))'])('matches %j', (f) => expect(isCatchAll(f)).toBe(true));
  it.each(["sourcetype=='x'", 'true && x', 'false', '0', 'truthy'])('rejects %j', (f) => expect(isCatchAll(f)).toBe(false));
});

describe('L01 route shadowing', () => {
  it('fires on the first Final catch-all with enabled routes below it', () => {
    const inv = inventory({ routes: [route(0, { filter: 'x' }), route(1), route(2, { filter: 'y' }), route(3)] });
    const [f] = runRule(L01, inv, buildGraph(inv));
    expect(f.key).toBe('L01/route/r1');
    expect(f.message).toContain('2 routes below it never match: route2, route3');
  });

  it('does not fire for a trailing catch-all, a non-Final one, or when everything below is disabled', () => {
    expect(keys(L01, inventory({ routes: [route(0, { filter: 'x' }), route(1)] }))).toEqual([]);
    expect(keys(L01, inventory({ routes: [route(0, { final: false }), route(1, { filter: 'x' })] }))).toEqual([]);
    expect(keys(L01, inventory({ routes: [route(0), route(1, { disabled: true })] }))).toEqual([]);
    expect(keys(L01, inventory({ routes: [route(0, { disabled: true }), route(1, { filter: 'x' })] }))).toEqual([]);
  });
});

describe('L02 catch-all to devnull', () => {
  it('fires when a Final catch-all resolves to devnull below other routes', () => {
    const inv = inventory({ routes: [route(0, { filter: 'x', output: 'lake' }), route(1, { output: 'default' })] });
    expect(keys(L02, inv)).toEqual(['L02/route/r1']);
  });

  it("does not fire for a fresh group's lone Default route or a catch-all that keeps data", () => {
    expect(keys(L02, inventory({ routes: [route(0, { output: 'default' })] }))).toEqual([]);
    const keeps = inventory({
      routes: [route(0, { filter: 'x' }), route(1, { output: 'lake' })],
      destinations: [destination('lake', { type: 'cribl_lake' })],
    });
    expect(keys(L02, keeps)).toEqual([]);
    expect(keys(L02, inventory({ routes: [route(0, { filter: 'x' }), route(1, { final: false })] }))).toEqual([]);
  });
});

describe('L03 orphan pipeline', () => {
  it('fires for an unreferenced pipeline', () => {
    expect(keys(L03, inventory({ pipelines: [pipeline('passthru'), pipeline('unused', ['eval'])] }))).toEqual(['L03/pipeline/unused']);
  });

  it('counts chain references and skips built-ins and packs', () => {
    const inv = inventory({
      routes: [route(0, { pipeline: 'outer' })],
      pipelines: [
        pipeline('passthru'),
        pipeline('main'),
        pipeline('pack:some_pack', [], { packId: 'some_pack' }),
        { id: 'outer', functions: [fn('chain', { processor: 'inner' })] },
        pipeline('inner', ['eval']),
      ],
    });
    expect(keys(L03, inv)).toEqual([]);
  });
});

describe('L04 orphan destination', () => {
  it('fires for an unreferenced destination', () => {
    const inv = inventory({ destinations: [destination('devnull'), destination('old', { type: 's3' })] });
    expect(keys(L04, inv)).toEqual(['L04/destination/old']);
  });

  it('respects routers and QuickConnect, and stands down when outputs are dynamic', () => {
    const referenced = inventory({
      sources: [source('qc', { sendToRoutes: false, connections: [{ output: 'qc_out' }] })],
      routes: [route(0, { output: 'router' })],
      destinations: [
        destination('router', { type: 'router', rules: [{ filter: 'true', output: 'lake', final: true }] }),
        destination('lake', { type: 'cribl_lake' }),
        destination('qc_out', { type: 'webhook' }),
      ],
    });
    expect(keys(L04, referenced)).toEqual([]);
    const dynamic = inventory({
      routes: [route(0, { output: undefined, outputExpression: "'x'" })],
      destinations: [destination('old', { type: 's3' })],
    });
    expect(keys(L04, dynamic)).toEqual([]);
  });
});

describe('L05 backpressure drop', () => {
  it('fires only for enabled destinations set to drop', () => {
    const inv = inventory({
      destinations: [
        destination('a', { type: 'splunk', onBackpressure: 'drop' }),
        destination('b', { type: 'splunk', onBackpressure: 'queue' }),
        destination('c', { type: 'splunk', onBackpressure: 'block' }),
        destination('d', { type: 'splunk', onBackpressure: 'drop', disabled: true }),
      ],
    });
    expect(keys(L05, inv)).toEqual(['L05/destination/a']);
  });
});

describe('L06 pipeline does nothing', () => {
  it('fires for empty pipelines and all-disabled ones, ignoring comments', () => {
    const inv = inventory({
      pipelines: [
        pipeline('passthru'),
        pipeline('empty'),
        { id: 'off', functions: [fn('eval', {}, { disabled: true }), fn('comment', {})] },
        { id: 'works', functions: [fn('eval', {})] },
        pipeline('pack:p', [], { packId: 'p' }),
      ],
    });
    expect(keys(L06, inv)).toEqual(['L06/pipeline/empty', 'L06/pipeline/off']);
  });
});

describe('L07 hardcoded secrets', () => {
  const withEval = (name: string, value: string) =>
    inventory({ pipelines: [{ id: 'p', functions: [fn('eval', { add: [{ name, value }] })] }] });

  it('fires on secret-named fields set to a random-looking literal, masking the value', () => {
    const [f] = runRule(L07, withEval('api_key', "'sk9f8a7s6d5f4g3h2j1k'"), buildGraph(withEval('x', 'y')));
    expect(f.key).toBe('L07/pipeline/p/f0');
    expect(f.location).toBe('function 1 (eval) › add[0].value');
    expect(f.evidence).toBe("api_key = 'sk9f••••••••••••'");
    expect(JSON.stringify(f)).not.toContain('sk9f8a7s6d5f4g3h2j1k');
  });

  it('fires on key=value literals and known token formats anywhere in the conf', () => {
    expect(findSecret("'token=FAKE0000blueprint0000demo0000FAKE'")).toBe('FAKE0000blueprint0000demo0000FAKE');
    expect(findSecret("'AKIAABCDEFGHIJKLMNOP'")).toBe('AKIAABCDEFGHIJKLMNOP');
    expect(findSecret('`Bearer abcdefghij0123456789xyz`')).toBe('abcdefghij0123456789xyz');
  });

  it('does not fire on expressions, secret references, or plain words', () => {
    expect(keys(L07, withEval('token', '__e.token'))).toEqual([]);
    expect(keys(L07, withEval('password', "C.Secret('splunk_pw', 'text')"))).toEqual([]);
    expect(keys(L07, withEval('auth_type', "'basic'"))).toEqual([]);
    expect(keys(L07, withEval('token', '`${prefix}abc123def456`'))).toEqual([]);
    expect(findSecret('token=__e.token_value')).toBeUndefined();
  });

  it('masks to at most 4 visible characters', () => {
    expect(mask('abcdefghijklmnopqrstuvwxyz')).toBe('abcd••••••••••••');
    expect(mask('abc')).toBe('••••');
  });
});

describe('L08 leading .*', () => {
  const withRegex = (conf: Record<string, unknown>, extra: Partial<PipelineFunction> = {}) =>
    inventory({ pipelines: [{ id: 'p', functions: [fn('regex_extract', conf, extra)] }] });

  it.each(['/.*user=(?<u>\\w+)/', '/(.*)x/', '/(?:.*?)x/i', '/(?<all>.*)x/'])('fires on %s', (regex) => {
    expect(keys(L08, withRegex({ regex }))).toEqual(['L08/pipeline/p/f0/regex']);
  });

  it('checks regexList and mask rules, skips anchored, mid-pattern, and disabled cases', () => {
    expect(keys(L08, withRegex({ regexList: [{ regex: '/ok/' }, { regex: '/.*bad/' }] }))).toEqual([
      'L08/pipeline/p/f0/regexList[1].regex',
    ]);
    expect(keys(L08, withRegex({ rules: [{ matchRegex: '/.*card=\\d+/' }] }))).toEqual(['L08/pipeline/p/f0/rules[0].matchRegex']);
    expect(keys(L08, withRegex({ regex: '/^.*x/' }))).toEqual([]);
    expect(keys(L08, withRegex({ regex: '/user=.*/' }))).toEqual([]);
    expect(keys(L08, withRegex({ regex: '/.*x/' }, { disabled: true }))).toEqual([]);
  });
});

describe('lint', () => {
  it('finds exactly the seeded problems in the demo group, errors first', () => {
    const inv = normalize(demoRaw());
    const findings = lint(inv, buildGraph(inv));
    expect(findings.map((f) => `${f.ruleId} ${f.object.kind}:${f.object.id}`).sort()).toEqual(
      EXPECTED_FINDINGS.map((e) => `${e.rule} ${e.object}`).sort(),
    );
    expect(findings.map((f) => f.severity)).toEqual(['error', 'error', 'warning', 'warning', 'warning', 'warning', 'info', 'info']);
    expect(new Set(findings.map((f) => f.key)).size).toBe(findings.length);
  });

  it('is quiet about shipped defaults on the real workspace fixture', () => {
    const inv = normalize(workspaceDefaultRaw);
    const findings = lint(inv, buildGraph(inv));
    expect(findings.map((f) => f.key)).toEqual([
      'L02/route/default',
      'L03/pipeline/checkpoint_import',
      'L03/pipeline/inframetricdigestv2',
      'L03/pipeline/loadbalancer',
      'L03/pipeline/test',
      'L06/pipeline/loadbalancer',
      'L06/pipeline/test',
    ]);
  });
});
