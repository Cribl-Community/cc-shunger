import { useState } from 'react';
import { Alert, Button, EmptyState, Tag, Text } from '@capra/core';
import type { ReferenceGraph } from '../model/graph';
import type { Inventory } from '../model/types';
import { RULES } from '../lint/rules';
import type { Finding, ObjectRef, Severity } from '../lint/types';
import ObjectDrawer from './ObjectDrawer';

interface Props {
  inventory: Inventory;
  graph: ReferenceGraph;
  findings: Finding[];
}

const SEVERITIES: { key: Severity; title: string; color: 'danger' | 'warning' | 'info' }[] = [
  { key: 'error', title: 'Errors', color: 'danger' },
  { key: 'warning', title: 'Warnings', color: 'warning' },
  { key: 'info', title: 'Info', color: 'info' },
];

const RULE_TITLE = new Map(RULES.map((r) => [r.id, r.title]));
const KIND_LABEL = { route: 'Route', pipeline: 'Pipeline', destination: 'Destination', source: 'Source' } as const;

function FindingCard({ f, onOpen }: { f: Finding; onOpen: (object: ObjectRef, location?: string) => void }) {
  const color = SEVERITIES.find((s) => s.key === f.severity)!.color;
  return (
    <article className={`finding finding--${f.severity}`}>
      <div className="finding-head">
        <Tag color={color}>{f.ruleId}</Tag>
        <span className="finding-title">{RULE_TITLE.get(f.ruleId)}</span>
        <Button variant="tertiary" size="sm" onClick={() => onOpen(f.object, f.location)}>
          {`${KIND_LABEL[f.object.kind]}: ${f.object.name ?? f.object.id}`}
        </Button>
      </div>
      <Text>{f.message}</Text>
      {(f.location || f.evidence) && (
        <div className="finding-evidence">
          {f.location && <span>{f.location}</span>}
          {f.evidence && <code className="mono">{f.evidence}</code>}
        </div>
      )}
      <Text>
        <strong>Fix: </strong>
        {f.fix}
      </Text>
    </article>
  );
}

export default function LinterTab({ inventory, graph, findings }: Props) {
  const [open, setOpen] = useState<{ object: ObjectRef; location?: string } | null>(null);
  const counts = Object.fromEntries(SEVERITIES.map((s) => [s.key, findings.filter((f) => f.severity === s.key).length]));
  const dynamicRoutes = inventory.routes.filter((r) => !r.disabled && r.outputExpression !== undefined);

  return (
    <div className="tab-body">
      <div className="toolbar">
        <div className="stats">
          {SEVERITIES.map((s) => (
            <div key={s.key} className={`stat stat--${s.key}`}>
              <span className="stat-value">{counts[s.key]}</span>
              <span className="stat-label">{s.title}</span>
            </div>
          ))}
        </div>
      </div>

      {graph.hasDynamicOutputs && (
        <Alert appearance="info" title="L04 (orphan destination) skipped">
          {`Route${dynamicRoutes.length === 1 ? '' : 's'} ${dynamicRoutes.map((r) => `"${r.name}"`).join(', ')} choose${dynamicRoutes.length === 1 ? 's' : ''} a destination with an output expression, so any destination could be in use.`}
        </Alert>
      )}

      {findings.length === 0 && (
        <EmptyState
          illustration="Celebration"
          title="No findings"
          description={`All ${RULES.length} rules passed for ${inventory.group}.`}
        />
      )}

      {SEVERITIES.filter((s) => counts[s.key] > 0).map((s) => (
        <section key={s.key} className="section">
          <Text as="h2" variant="heading">{`${s.title} (${counts[s.key]})`}</Text>
          {findings
            .filter((f) => f.severity === s.key)
            .map((f) => (
              <FindingCard key={f.key} f={f} onOpen={(object, location) => setOpen({ object, location })} />
            ))}
        </section>
      ))}

      <details className="rule-reference">
        <summary>{`Rule reference (${RULES.length} rules)`}</summary>
        <dl>
          {RULES.map((r) => (
            <div key={r.id} className="rule-ref">
              <dt>
                <Tag color={SEVERITIES.find((s) => s.key === r.severity)!.color}>{r.id}</Tag> {r.title}
              </dt>
              <dd>{r.rationale}</dd>
            </div>
          ))}
        </dl>
      </details>

      <ObjectDrawer target={open} inventory={inventory} graph={graph} onClose={() => setOpen(null)} />
    </div>
  );
}
