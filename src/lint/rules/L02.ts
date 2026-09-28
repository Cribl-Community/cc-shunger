import { isActive, isCatchAll } from '../helpers';
import type { Rule } from '../types';

export const L02: Rule = {
  id: 'L02',
  title: 'Catch-all route drops unmatched data',
  severity: 'warning',
  rationale:
    'When the first Final catch-all route sends to devnull, any event that no earlier route matched is silently discarded. New sources and changed data shapes disappear without an error.',
  run: ({ inv, graph }) => {
    const byId = new Map(inv.destinations.map((d) => [d.id, d]));
    const active = inv.routes.filter(isActive);
    const isFinalCatchAll = (r: (typeof active)[number]) => r.final && isCatchAll(r.filter);
    // The first Final catch-all is the only reachable one; any below it never see data.
    const reachable = active.find(isFinalCatchAll);
    return (reachable && reachable.output !== undefined ? [reachable] : [])
      .filter((r) => active.some((other) => other.index < r.index))
      .flatMap((r) => {
        const resolved = graph.resolveDestination(r.output!);
        const target = byId.get(resolved);
        const isDevnull = target ? target.type === 'devnull' : resolved === 'devnull';
        if (!isDevnull) return [];
        const via = resolved !== r.output ? ` (via "${r.output}")` : '';
        return [
          {
            object: { kind: 'route' as const, id: r.id, name: r.name },
            message: `Route ${r.index + 1} "${r.name}" catches everything the routes above it miss and sends it to devnull${via}.`,
            fix: 'Send unmatched data to a low-cost destination (object store or Lake) so new or changed data is kept and visible.',
            evidence: `filter: ${r.filter || '(empty)'} · output: ${r.output} → ${resolved}`,
          },
        ];
      });
  },
};
