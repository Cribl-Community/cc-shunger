import type { ReferenceGraph } from '../model/graph';
import type { Inventory } from '../model/types';

export type Severity = 'error' | 'warning' | 'info';

export const SEVERITY_ORDER: Record<Severity, number> = { error: 0, warning: 1, info: 2 };

export type ObjectKind = 'route' | 'pipeline' | 'destination' | 'source';

export interface ObjectRef {
  kind: ObjectKind;
  id: string;
  /** Display name when it differs from the id (routes). */
  name?: string;
}

export interface Finding {
  /** Stable identity for suppressions: `<rule>/<kind>/<id>[/<detail>]`. */
  key: string;
  ruleId: string;
  severity: Severity;
  object: ObjectRef;
  /** One line: what is wrong. */
  message: string;
  /** One line: what to do about it. */
  fix: string;
  /** Where inside the object, e.g. `function 2 (eval) › add[0].value`. */
  location?: string;
  /** Supporting evidence. Never contains an unmasked secret. */
  evidence?: string;
}

/** What a rule returns; the runner fills in ruleId, severity, and key. */
export type RuleHit = Omit<Finding, 'key' | 'ruleId' | 'severity'> & { keyDetail?: string };

export interface LintContext {
  inv: Inventory;
  graph: ReferenceGraph;
}

export interface Rule {
  id: string;
  title: string;
  severity: Severity;
  /** Why this matters, for the rule reference. */
  rationale: string;
  run: (ctx: LintContext) => RuleHit[];
}
