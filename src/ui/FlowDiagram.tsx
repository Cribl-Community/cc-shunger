import { useMemo, useState } from 'react';
import type { ReferenceGraph } from '../model/graph';
import { HEADER_H, NODE_H, NODE_W, PAD, type FlowLayout, type LayoutNode } from '../report/flowLayout';

interface Props {
  layout: FlowLayout;
  graph: ReferenceGraph;
}

const curve = (a: { x: number; y: number }, b: { x: number; y: number }) => {
  const dx = Math.max(24, (b.x - a.x) / 2);
  return `M${a.x},${a.y} C${a.x + dx},${a.y} ${b.x - dx},${b.y} ${b.x},${b.y}`;
};

const truncate = (s: string, max: number) => (s.length > max ? `${s.slice(0, max - 1)}…` : s);

/** Flow ids (route ids, QuickConnect source ids) that pass through a node. */
function flowsThrough(node: LayoutNode, graph: ReferenceGraph): string[] {
  switch (node.column) {
    case 'route':
      return [node.id];
    case 'source':
      return graph.flows.filter((f) => f.kind === 'quickconnect' && f.via === node.id).map((f) => f.via);
    case 'pipeline':
      return graph.flows.filter((f) => f.pipeline === node.id).map((f) => f.via);
    case 'destination':
      return graph.flows.filter((f) => f.output === node.id).map((f) => f.via);
  }
}

export default function FlowDiagram({ layout, graph }: Props) {
  const [hovered, setHovered] = useState<Set<string> | null>(null);

  const litNodes = useMemo(() => {
    if (!hovered) return null;
    const keys = new Set<string>();
    for (const f of graph.flows) {
      if (!hovered.has(f.via)) continue;
      keys.add(f.kind === 'route' ? `route:${f.via}` : `source:${f.via}`);
      keys.add(`pipeline:${f.pipeline}`);
      if (f.output) keys.add(`destination:${f.output}`);
    }
    return keys;
  }, [hovered, graph]);

  const edgeClass = (flows: string[], disabled: boolean, kind: string) => {
    const lit = hovered && flows.some((f) => hovered.has(f));
    return [
      'flow-edge',
      `flow-edge--${kind}`,
      disabled && 'is-disabled',
      hovered && (lit ? 'is-lit' : 'is-faded'),
    ]
      .filter(Boolean)
      .join(' ');
  };

  return (
    <div className="flow-scroll">
      <svg
        className="flow-diagram"
        width={layout.width}
        height={layout.height}
        viewBox={`0 0 ${layout.width} ${layout.height}`}
        role="img"
        aria-label="Data flow from Sources through Routes and Pipelines to Destinations"
      >
        {layout.columns.map((c) => (
          <text key={c.column} className="flow-col-title" x={c.x} y={PAD + HEADER_H / 2}>
            {c.title}
          </text>
        ))}

        {layout.bus && (
          <line
            className={`flow-bus${hovered ? ' is-faded' : ''}`}
            x1={layout.bus.x}
            x2={layout.bus.x}
            y1={layout.bus.y1}
            y2={layout.bus.y2}
          />
        )}

        {layout.edges.map((e) => (
          <path key={e.key} className={edgeClass(e.flows, e.disabled, e.kind)} d={curve(e.from, e.to)} />
        ))}

        {layout.nodes.map((n) => {
          const lit = litNodes?.has(n.key);
          const cls = [
            'flow-node',
            `flow-node--${n.column}`,
            n.disabled && 'is-disabled',
            n.unreferenced && 'is-unreferenced',
            litNodes && (lit ? 'is-lit' : 'is-faded'),
          ]
            .filter(Boolean)
            .join(' ');
          return (
            <g
              key={n.key}
              className={cls}
              transform={`translate(${n.x},${n.y})`}
              onMouseEnter={() => setHovered(new Set(flowsThrough(n, graph)))}
              onMouseLeave={() => setHovered(null)}
            >
              <title>
                {`${n.label}${n.sublabel ? ` — ${n.sublabel}` : ''}${n.disabled ? ' (disabled)' : ''}${n.unreferenced ? ' (not referenced)' : ''}`}
              </title>
              <rect width={NODE_W} height={NODE_H} rx={6} />
              <text x={10} y={NODE_H / 2} className="flow-node-label">
                {truncate(n.label, n.sublabel ? 17 : 28)}
              </text>
              {n.sublabel && (
                <text x={NODE_W - 10} y={NODE_H / 2} className="flow-node-sublabel" textAnchor="end">
                  {truncate(n.sublabel, 12)}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
