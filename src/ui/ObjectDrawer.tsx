import { Drawer, Tag, Text } from '@capra/core';
import type { ReferenceGraph } from '../model/graph';
import type { Inventory } from '../model/types';
import type { ObjectRef } from '../lint/types';
import { describeRefs } from '../report/asBuilt';

interface Props {
  target: { object: ObjectRef; location?: string } | null;
  inventory: Inventory;
  graph: ReferenceGraph;
  onClose: () => void;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="kv">
      <span className="kv-label">{label}</span>
      <span className="kv-value">{children}</span>
    </div>
  );
}

const Code = ({ children }: { children: string }) => <code className="mono">{children || '(empty)'}</code>;

function Detail({ object, location, inventory, graph }: { object: ObjectRef; location?: string; inventory: Inventory; graph: ReferenceGraph }) {
  switch (object.kind) {
    case 'route': {
      const r = inventory.routes.find((x) => x.id === object.id);
      if (!r) return <Text>Not found.</Text>;
      return (
        <>
          <Field label="Position">{`${r.index + 1} of ${inventory.routes.length}`}</Field>
          <Field label="Filter"><Code>{r.filter}</Code></Field>
          <Field label="Pipeline">{r.pipeline}</Field>
          <Field label="Destination">
            {r.output ? `${r.output}${graph.resolveDestination(r.output) !== r.output ? ` → ${graph.resolveDestination(r.output)}` : ''}` : <Code>{r.outputExpression ?? ''}</Code>}
          </Field>
          <Field label="Final">{r.final ? 'Yes' : 'No'}</Field>
          <Field label="Status">{r.disabled ? 'Disabled' : 'Enabled'}</Field>
          {r.description && <Field label="Description">{r.description}</Field>}
        </>
      );
    }
    case 'pipeline': {
      const p = inventory.pipelines.find((x) => x.id === object.id);
      if (!p) return <Text>Not found.</Text>;
      const flagged = location ? Number(/^function (\d+)/.exec(location)?.[1] ?? 0) - 1 : -1;
      return (
        <>
          {p.description && <Field label="Description">{p.description}</Field>}
          <Field label="Used by">{describeRefs(graph.pipelineRefs.get(p.id), inventory)}</Field>
          <Text as="h3" variant="heading">{`Functions (${p.functions.length})`}</Text>
          {p.functions.length === 0 && <Text>None.</Text>}
          <ol className="fn-list">
            {p.functions.map((f, i) => (
              <li key={i} className={i === flagged ? 'fn is-flagged' : 'fn'}>
                <span className="fn-head">
                  <strong>{`${i + 1}. ${f.id}`}</strong>
                  {f.disabled && <Tag>Disabled</Tag>}
                  {f.final && <Tag color="info">Final</Tag>}
                  {i === flagged && <Tag color="danger">Flagged</Tag>}
                </span>
                {f.filter && f.filter !== 'true' && <Code>{`filter: ${f.filter}`}</Code>}
                {f.description && <span className="fn-desc">{f.description}</span>}
              </li>
            ))}
          </ol>
        </>
      );
    }
    case 'destination': {
      const d = inventory.destinations.find((x) => x.id === object.id);
      if (!d) return <Text>Not found.</Text>;
      return (
        <>
          <Field label="Type">{d.type}</Field>
          <Field label="Backpressure">{d.onBackpressure ?? '—'}</Field>
          <Field label="Post-processing">{d.pipeline ?? '—'}</Field>
          <Field label="Used by">{describeRefs(graph.destinationRefs.get(d.id), inventory)}</Field>
          <Field label="Status">{d.disabled ? 'Disabled' : 'Enabled'}</Field>
        </>
      );
    }
    case 'source': {
      const s = inventory.sources.find((x) => x.id === object.id);
      if (!s) return <Text>Not found.</Text>;
      return (
        <>
          <Field label="Type">{s.type}</Field>
          <Field label="Mode">{s.sendToRoutes ? 'Routes' : 'QuickConnect'}</Field>
          <Field label="Pre-processing">{s.pipeline ?? '—'}</Field>
          <Field label="Status">{s.disabled ? 'Disabled' : 'Enabled'}</Field>
        </>
      );
    }
  }
}

const KIND_TITLE = { route: 'Route', pipeline: 'Pipeline', destination: 'Destination', source: 'Source' } as const;

export default function ObjectDrawer({ target, inventory, graph, onClose }: Props) {
  return (
    <Drawer
      isOpen={target !== null}
      onClose={onClose}
      width={480}
      title={target ? `${KIND_TITLE[target.object.kind]}: ${target.object.name ?? target.object.id}` : ''}
    >
      {target && (
        <div className="drawer-body">
          <Detail object={target.object} location={target.location} inventory={inventory} graph={graph} />
        </div>
      )}
    </Drawer>
  );
}
