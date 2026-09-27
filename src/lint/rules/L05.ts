import type { Rule } from '../types';

export const L05: Rule = {
  id: 'L05',
  title: 'Destination drops data under backpressure',
  severity: 'warning',
  rationale:
    'With backpressure behavior set to Drop, events are discarded whenever the receiver slows down or is unreachable. Block pushes back on sources; Persistent Queue buffers to disk.',
  run: ({ inv }) =>
    inv.destinations
      .filter((d) => !d.disabled && d.onBackpressure === 'drop')
      .map((d) => ({
        object: { kind: 'destination' as const, id: d.id },
        message: `Destination "${d.id}" (${d.type}) drops events whenever its receiver applies backpressure.`,
        fix: 'Set backpressure behavior to Persistent Queue, or Block if upstream sources can buffer.',
        evidence: 'onBackpressure: drop',
      })),
};
