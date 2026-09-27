import { functionLabel, realPipelines, regexBody, walkStrings } from '../helpers';
import type { Rule, RuleHit } from '../types';

/** Conf keys that hold a regex (regex_extract, regex_filter, mask rules, serde, …). */
const REGEX_KEY = /^(regex|matchRegex)$/;

/** Leading `.*` or `.*?`, possibly inside opening groups: `.*x`, `(.*)x`, `(?:.*?)x`. */
const LEADING_DOT_STAR = /^(?:\((?:\?(?::|<[A-Za-z_]\w*>))?)*\.\*/;

export const L08: Rule = {
  id: 'L08',
  title: 'Regex starts with unanchored .*',
  severity: 'info',
  rationale:
    'Regex search already scans the whole string, so a leading .* adds nothing but backtracking: the engine retries it at every position. On hot pipelines this is a measurable CPU cost.',
  run: ({ inv }) => {
    const hits: RuleHit[] = [];
    for (const p of realPipelines(inv.pipelines)) {
      p.functions.forEach((fn, i) => {
        if (fn.disabled) return;
        walkStrings(fn.conf, (path, key, s) => {
          if (!REGEX_KEY.test(key)) return;
          const body = regexBody(s);
          if (!LEADING_DOT_STAR.test(body)) return;
          hits.push({
            object: { kind: 'pipeline', id: p.id },
            keyDetail: `f${i}/${path}`,
            location: `${functionLabel(i, fn)} › ${path}`,
            message: `A regex in pipeline "${p.id}" starts with an unanchored .*, which forces extra backtracking.`,
            fix: 'Remove the leading .* (the match is not anchored anyway), or anchor with ^ if you meant start of string.',
            evidence: s.length > 80 ? `${s.slice(0, 77)}…` : s,
          });
        });
      });
    }
    return hits;
  },
};
