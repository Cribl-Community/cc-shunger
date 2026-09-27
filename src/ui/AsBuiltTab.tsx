import { useMemo } from 'react';
import { Button, Table, Tag, Text, defineColumns } from '@capra/core';
import type { ReferenceGraph } from '../model/graph';
import type { Finding } from '../lint/types';
import type { Inventory } from '../model/types';
import { buildAsBuilt, type DestinationRow, type PackRow, type PipelineRow, type RouteRow, type SourceRow } from '../report/asBuilt';
import { layoutFlow } from '../report/flowLayout';
import { toMarkdown } from '../report/markdown';
import { downloadText } from './download';
import FlowDiagram from './FlowDiagram';

interface Props {
  inventory: Inventory;
  graph: ReferenceGraph;
  findings: Finding[];
}

const yesNo = (v: unknown) => (v ? 'Yes' : 'No');
const mono = (v: unknown) => <code className="mono">{String(v)}</code>;
const enabledTag = (v: unknown) => (v ? <Tag color="success">Enabled</Tag> : <Tag>Disabled</Tag>);

const routeColumns = defineColumns<RouteRow & Record<string, unknown>>([
  { id: 'position', label: '#' },
  { id: 'name', label: 'Name' },
  { id: 'filter', label: 'Filter', render: mono },
  { id: 'pipeline', label: 'Pipeline' },
  { id: 'output', label: 'Destination' },
  { id: 'final', label: 'Final', render: yesNo },
  { id: 'enabled', label: 'Status', render: enabledTag },
]);

const sourceColumns = defineColumns<SourceRow & Record<string, unknown>>([
  { id: 'id', label: 'ID' },
  { id: 'type', label: 'Type' },
  { id: 'mode', label: 'Mode', render: (v) => (v === 'QuickConnect' ? <Tag color="info">QuickConnect</Tag> : String(v)) },
  { id: 'preProcessing', label: 'Pre-processing' },
  { id: 'enabled', label: 'Status', render: enabledTag },
]);

const pipelineColumns = defineColumns<PipelineRow & Record<string, unknown>>([
  { id: 'id', label: 'ID' },
  { id: 'functions', label: 'Functions' },
  { id: 'disabledFunctions', label: 'Disabled functions' },
  { id: 'usedBy', label: 'Used by' },
]);

const destinationColumns = defineColumns<DestinationRow & Record<string, unknown>>([
  { id: 'id', label: 'ID' },
  { id: 'type', label: 'Type' },
  { id: 'backpressure', label: 'Backpressure' },
  { id: 'postProcessing', label: 'Post-processing' },
  { id: 'usedBy', label: 'Used by' },
]);

const packColumns = defineColumns<PackRow & Record<string, unknown>>([
  { id: 'id', label: 'ID' },
  { id: 'name', label: 'Name' },
  { id: 'version', label: 'Version' },
]);

function Section({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <section className="section">
      <Text as="h2" variant="heading">{`${title} (${count})`}</Text>
      {count === 0 ? <Text>None.</Text> : children}
    </section>
  );
}

function Stat({ label, value, detail }: { label: string; value: number; detail?: string }) {
  return (
    <div className="stat">
      <span className="stat-value">{value}</span>
      <span className="stat-label">{label}</span>
      {detail && <span className="stat-detail">{detail}</span>}
    </div>
  );
}

export default function AsBuiltTab({ inventory, graph, findings }: Props) {
  const report = useMemo(() => buildAsBuilt(inventory, graph), [inventory, graph]);
  const layout = useMemo(() => layoutFlow(inventory, graph), [inventory, graph]);
  const s = report.summary;

  const exportMarkdown = () => {
    const now = new Date();
    const stamp = now.toISOString().slice(0, 16).replace(/[-:T]/g, '');
    downloadText(`as-built-${inventory.group}-${stamp}.md`, toMarkdown(report, graph.flows, now, findings), 'text/markdown');
  };

  // Capra Table requires string/number ids; rows already carry them.
  type Rows<T> = (T & Record<string, unknown>)[];

  return (
    <div className="tab-body">
      <div className="toolbar">
        <div className="stats">
          <Stat label="Sources" value={s.sources.total} detail={`${s.sources.enabled} enabled${s.sources.quickConnect ? ` · ${s.sources.quickConnect} QuickConnect` : ''}`} />
          <Stat label="Routes" value={s.routes.total} detail={`${s.routes.enabled} enabled`} />
          <Stat label="Pipelines" value={s.pipelines} />
          <Stat label="Destinations" value={s.destinations} />
          <Stat label="Packs" value={s.packs} />
        </div>
        <Button variant="primary" onClick={exportMarkdown}>
          Export Markdown
        </Button>
      </div>

      <section className="section">
        <Text as="h2" variant="heading">Data flow</Text>
        <Text>Hover a Route, Pipeline, or Destination to trace its path. Dashed boxes are not referenced by anything.</Text>
        <FlowDiagram layout={layout} graph={graph} />
      </section>

      <Section title="Routes" count={report.routes.length}>
        <Table
          items={report.routes as Rows<RouteRow>}
          columns={routeColumns}
          visibleColumns={['position', 'name', 'filter', 'pipeline', 'output', 'final', 'enabled']}
          density="compact"
        />
      </Section>
      <Section title="Sources" count={report.sources.length}>
        <Table
          items={report.sources as Rows<SourceRow>}
          columns={sourceColumns}
          visibleColumns={['id', 'type', 'mode', 'preProcessing', 'enabled']}
          density="compact"
        />
      </Section>
      <Section title="Pipelines" count={report.pipelines.length}>
        <Table
          items={report.pipelines as Rows<PipelineRow>}
          columns={pipelineColumns}
          visibleColumns={['id', 'functions', 'disabledFunctions', 'usedBy']}
          density="compact"
        />
      </Section>
      <Section title="Destinations" count={report.destinations.length}>
        <Table
          items={report.destinations as Rows<DestinationRow>}
          columns={destinationColumns}
          visibleColumns={['id', 'type', 'backpressure', 'postProcessing', 'usedBy']}
          density="compact"
        />
      </Section>
      <Section title="Packs" count={report.packs.length}>
        <Table
          items={report.packs as Rows<PackRow>}
          columns={packColumns}
          visibleColumns={['id', 'name', 'version']}
          density="compact"
        />
      </Section>
    </div>
  );
}
