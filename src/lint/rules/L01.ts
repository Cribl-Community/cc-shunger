import { isActive, isCatchAll } from '../helpers';
import type { Rule } from '../types';

const LIST_MAX = 5;

export const L01: Rule = {
  id: 'L01',
  title: 'Route shadowing',
  severity: 'error',
  rationale:
    'Routes are evaluated top to bottom. A Final route that matches every event consumes all data, so every enabled route below it with a specific filter never runs.',
  run: ({ inv }) => {
    const active = inv.routes.filter(isActive);
    const shadowing = active.find((r) => r.final && isCatchAll(r.filter));
    if (!shadowing) return [];
    // Catch-alls below a catch-all are redundant, not lost logic; only specific filters count.
    const shadowed = active.filter((r) => r.index > shadowing.index && !isCatchAll(r.filter));
    if (!shadowed.length) return [];
    const names = shadowed.slice(0, LIST_MAX).map((r) => r.name);
    const more = shadowed.length > LIST_MAX ? ` and ${shadowed.length - LIST_MAX} more` : '';
    return [
      {
        object: { kind: 'route', id: shadowing.id, name: shadowing.name },
        message: `Route ${shadowing.index + 1} "${shadowing.name}" is Final and matches every event, so ${shadowed.length} route${shadowed.length === 1 ? '' : 's'} below it never match${shadowed.length === 1 ? 'es' : ''}: ${names.join(', ')}${more}.`,
        fix: `Move "${shadowing.name}" below the routes it shadows, narrow its filter, or turn off Final.`,
        evidence: `filter: ${shadowing.filter || '(empty)'} · Final: Yes`,
      },
    ];
  },
};
