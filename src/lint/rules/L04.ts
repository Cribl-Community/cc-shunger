import type { Rule } from '../types';

const NEVER_ORPHAN_TYPES = new Set(['devnull', 'default']);

export const L04: Rule = {
  id: 'L04',
  title: 'Orphan destination',
  severity: 'warning',
  rationale:
    'A destination nothing sends to is dead config. It often keeps credentials and connections alive for a system nobody uses anymore.',
  run: ({ inv, graph }) => {
    // With an output expression, any destination could be chosen at runtime.
    if (graph.hasDynamicOutputs) return [];
    return inv.destinations
      .filter((d) => !NEVER_ORPHAN_TYPES.has(d.type) && !graph.destinationRefs.has(d.id))
      .map((d) => ({
        object: { kind: 'destination' as const, id: d.id },
        message: `Destination "${d.id}" (${d.type}) is not used by any Route, QuickConnect link, Output Router, or the default alias.`,
        fix: 'Delete it, or reconnect it if a route was removed by mistake.',
        evidence: d.disabled ? 'disabled' : undefined,
      }));
  },
};
