import { realPipelines } from '../helpers';
import type { Rule } from '../types';

/**
 * Pipelines Cribl ships in every new group (defaults and samples); unused copies are expected,
 * not clutter. Confirmed against a fresh Cribl.Cloud 4.20 workspace (workspace-clean fixture).
 */
export const BUILTIN_PIPELINES = new Set([
  'passthru',
  'main',
  'devnull',
  'cribl_metrics_rollup',
  'prometheus_metrics',
  'cisco_asa',
  'cisco_estreamer',
  'palo_alto_traffic',
  'wineventlogs',
]);

export const L03: Rule = {
  id: 'L03',
  title: 'Orphan pipeline',
  severity: 'warning',
  rationale:
    'A pipeline nothing references is dead config: it confuses reviewers and drifts out of date. It may also be a route someone forgot to reconnect.',
  run: ({ inv, graph }) =>
    realPipelines(inv.pipelines)
      .filter((p) => !BUILTIN_PIPELINES.has(p.id) && !graph.pipelineRefs.has(p.id))
      .map((p) => ({
        object: { kind: 'pipeline' as const, id: p.id },
        message: `Pipeline "${p.id}" is not used by any Route, Source, QuickConnect link, Destination, or Chain function.`,
        fix: 'Delete it, or reconnect it if a route was removed by mistake. Collector jobs are not checked, so confirm none use it first.',
        evidence: `${p.functions.length} function${p.functions.length === 1 ? '' : 's'}${p.description ? ` · ${p.description}` : ''}`,
      })),
};
