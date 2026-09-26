// The blueprint-demo Worker Group: deliberately broken config that trips every lint rule.
// Used by the dev-only seeder (src/dev/DemoSeeder.tsx) and by lint tests as the "bad" fixture.
// Everything is fake: example.com hosts, FAKE tokens, Datagen sources only.

export interface DemoSeed {
  pipelines: { id: string; conf: Record<string, unknown> }[];
  outputs: Record<string, unknown>[];
  /** `samples` is filled at seed time from the group's available Datagen samples. */
  inputs: Record<string, unknown>[];
  routes: Record<string, unknown>[];
}

export const DEMO_GROUP_PREFIX = 'blueprint-';

/** Which seeded object should trip which rule (mirrors BUILD_PLAN.md "Seeded demo Worker Group"). */
export const EXPECTED_FINDINGS = [
  { rule: 'L01', object: 'route:catch_all_early', why: 'Final `true` route at position 2 shadows routes 3-5' },
  { rule: 'L02', object: 'route:default', why: 'Default route resolves to devnull' },
  { rule: 'L03', object: 'pipeline:legacy_cleanup', why: 'Referenced by nothing' },
  { rule: 'L04', object: 'destination:old_s3_archive', why: 'Referenced by nothing' },
  { rule: 'L05', object: 'destination:splunk_example', why: 'Backpressure set to drop' },
  { rule: 'L06', object: 'pipeline:all_disabled', why: 'Every function disabled' },
  { rule: 'L07', object: 'pipeline:enrich_auth', why: 'Eval sets a token-shaped literal' },
  { rule: 'L08', object: 'pipeline:parse_auth', why: 'Regex starts with unanchored .*' },
] as const;

export function demoSeed(samples: string[]): DemoSeed {
  const sample = (i: number) => [{ sample: samples[i % samples.length], eventsPerSec: 1 }];
  return {
    pipelines: [
      {
        id: 'web_cleanup',
        conf: {
          description: 'Tag web events and drop health checks',
          functions: [
            { id: 'eval', filter: 'true', conf: { add: [{ name: 'dataset', value: "'web'" }] } },
            { id: 'drop', filter: "_raw.includes('/healthz')", conf: {} },
          ],
        },
      },
      {
        id: 'enrich_auth',
        conf: {
          description: 'Adds an auth header for the downstream API (bad practice: hardcoded)',
          functions: [
            {
              id: 'eval',
              filter: 'true',
              conf: { add: [{ name: 'api_auth', value: "'token=FAKE0000blueprint0000demo0000FAKE'" }] },
            },
          ],
        },
      },
      {
        id: 'parse_auth',
        conf: {
          description: 'Extracts the user from auth logs',
          functions: [
            { id: 'regex_extract', filter: 'true', conf: { source: '_raw', regex: '/.*user=(?<user>\\w+)/' } },
          ],
        },
      },
      {
        id: 'all_disabled',
        conf: {
          description: 'Every function switched off during an old incident',
          functions: [
            { id: 'eval', filter: 'true', disabled: true, conf: { add: [{ name: 'x', value: '1' }] } },
            { id: 'drop', filter: 'true', disabled: true, conf: {} },
          ],
        },
      },
      {
        id: 'legacy_cleanup',
        conf: {
          description: 'Left over from the previous vendor; nothing uses it',
          functions: [{ id: 'eval', filter: 'true', conf: { remove: ['legacy_*'] } }],
        },
      },
      {
        id: 'qc_enrich',
        conf: {
          description: 'QuickConnect pipeline for metrics',
          functions: [{ id: 'eval', filter: 'true', conf: { add: [{ name: 'dataset', value: "'metrics'" }] } }],
        },
      },
    ],
    outputs: [
      { id: 'webhook_example', type: 'webhook', url: 'https://hooks.example.com/ingest', format: 'ndjson', onBackpressure: 'block' },
      { id: 'splunk_example', type: 'splunk', host: 'splunk.example.com', port: 9997, onBackpressure: 'drop' },
      {
        id: 'old_s3_archive',
        type: 's3',
        bucket: 'example-archive-bucket',
        region: 'us-east-1',
        stagePath: '$CRIBL_HOME/state/outputs/staging',
        awsAuthenticationMethod: 'auto',
        onBackpressure: 'block',
      },
    ],
    inputs: [
      { id: 'gen_web', type: 'datagen', samples: sample(0), sendToRoutes: true },
      { id: 'gen_auth', type: 'datagen', samples: sample(1), sendToRoutes: true },
      {
        id: 'gen_metrics_qc',
        type: 'datagen',
        samples: sample(2),
        sendToRoutes: false,
        connections: [{ pipeline: 'qc_enrich', output: 'webhook_example' }],
      },
      { id: 'gen_retired', type: 'datagen', samples: sample(0), disabled: true, sendToRoutes: true },
    ],
    routes: [
      {
        id: 'web',
        name: 'web',
        filter: "__inputId=='datagen:gen_web'",
        pipeline: 'web_cleanup',
        output: 'webhook_example',
        final: true,
      },
      { id: 'catch_all_early', name: 'catch_all_early', filter: 'true', pipeline: 'passthru', output: 'webhook_example', final: true },
      {
        id: 'auth_to_splunk',
        name: 'auth_to_splunk',
        filter: "__inputId=='datagen:gen_auth'",
        pipeline: 'enrich_auth',
        output: 'splunk_example',
        final: false,
      },
      { id: 'auth_parse', name: 'auth_parse', filter: "__inputId=='datagen:gen_auth'", pipeline: 'parse_auth', output: 'splunk_example', final: true },
      { id: 'noisy', name: 'noisy', filter: "sourcetype=='noise'", pipeline: 'all_disabled', output: 'splunk_example', final: true },
      { id: 'default', name: 'default', filter: 'true', pipeline: 'passthru', output: 'default', final: true },
    ],
  };
}
