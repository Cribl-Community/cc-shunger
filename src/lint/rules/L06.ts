import { realPipelines, workingFunctions } from '../helpers';
import type { Rule } from '../types';

export const L06: Rule = {
  id: 'L06',
  title: 'Pipeline does nothing',
  severity: 'info',
  rationale:
    'An empty pipeline, or one whose functions are all disabled, passes data through unchanged. That is fine for passthru, but elsewhere it usually means unfinished or abandoned work.',
  run: ({ inv }) =>
    realPipelines(inv.pipelines)
      .filter((p) => p.id !== 'passthru' && workingFunctions(p).length === 0)
      .map((p) => {
        const empty = p.functions.filter((f) => f.id !== 'comment').length === 0;
        return {
          object: { kind: 'pipeline' as const, id: p.id },
          message: empty
            ? `Pipeline "${p.id}" has no functions, so it passes data through unchanged.`
            : `Every function in pipeline "${p.id}" is disabled, so it passes data through unchanged.`,
          fix: empty
            ? 'Use the built-in passthru pipeline instead, or finish building this one.'
            : 'Re-enable the functions that should run, or replace this pipeline with passthru.',
          evidence: `${p.functions.length} function${p.functions.length === 1 ? '' : 's'}, ${p.functions.filter((f) => f.disabled).length} disabled`,
        };
      }),
};
