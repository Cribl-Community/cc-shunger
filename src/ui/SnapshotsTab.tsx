import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Button, EmptyState, SelectField, Spinner, Text, TextField } from '@capra/core';
import { diffInventory } from '../diff/diff';
import { redactInventory } from '../model/redact';
import type { Inventory } from '../model/types';
import { deleteSnapshot, listSnapshots, loadSnapshot, saveSnapshot, type SnapshotMeta } from '../store/snapshots';
import DiffView from './DiffView';

interface Props {
  inventory: Inventory;
}

const CURRENT = '__current__';

type ListState = { state: 'loading' } | { state: 'error'; message: string } | { state: 'ready'; items: SnapshotMeta[] };

const when = (iso: string) => new Date(iso).toLocaleString();

export default function SnapshotsTab({ inventory }: Props) {
  const group = inventory.group;
  const [list, setList] = useState<ListState>({ state: 'loading' });
  const [label, setLabel] = useState('');
  const [taking, setTaking] = useState(false);
  const [actionError, setActionError] = useState<string>();
  const [armedDelete, setArmedDelete] = useState<string | null>(null);
  const [left, setLeft] = useState<string | null>(null);
  const [right, setRight] = useState<string>(CURRENT);
  const [loaded, setLoaded] = useState<Record<string, Inventory>>({});
  const [compareError, setCompareError] = useState<string>();

  const refresh = useCallback(() => {
    return listSnapshots(group)
      .then((items) => {
        setList({ state: 'ready', items });
        setLeft((cur) => (cur && items.some((m) => m.id === cur) ? cur : (items[0]?.id ?? null)));
      })
      .catch((e: unknown) => setList({ state: 'error', message: String(e) }));
  }, [group]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const items = useMemo(() => (list.state === 'ready' ? list.items : []), [list]);
  const metaOf = (id: string | null) => items.find((m) => m.id === id);

  // Load the snapshot inventories being compared.
  useEffect(() => {
    for (const id of [left, right]) {
      const meta = items.find((m) => m.id === id);
      if (!meta || loaded[meta.id]) continue;
      loadSnapshot(meta)
        .then((s) => setLoaded((prev) => ({ ...prev, [meta.id]: s.inventory })))
        .catch((e: unknown) => setCompareError(String(e)));
    }
  }, [left, right, items, loaded]);

  // Compare against the live config redacted the same way snapshots are.
  const current = useMemo(() => redactInventory(inventory), [inventory]);
  const invOf = (id: string | null) => (id === CURRENT ? current : id ? loaded[id] : undefined);
  const nameOf = (id: string | null) => (id === CURRENT ? 'Current config' : (metaOf(id)?.label ?? ''));
  const before = invOf(left);
  const after = invOf(right);
  const diff = useMemo(() => (before && after ? diffInventory(before, after) : null), [before, after]);

  const take = async () => {
    setTaking(true);
    setActionError(undefined);
    try {
      let takenBy: string | undefined;
      try {
        takenBy = (await window.getCriblUser()).username;
      } catch {
        // identity is optional
      }
      await saveSnapshot(inventory, label, { takenBy });
      setLabel('');
      await refresh();
    } catch (e) {
      setActionError(`Couldn't save the snapshot: ${String(e)}`);
    } finally {
      setTaking(false);
    }
  };

  const remove = async (meta: SnapshotMeta) => {
    setArmedDelete(null);
    setActionError(undefined);
    try {
      await deleteSnapshot(meta);
      await refresh();
    } catch (e) {
      setActionError(`Couldn't delete "${meta.label}": ${String(e)}`);
    }
  };

  const options = items.map((m) => ({ id: m.id, label: `${m.label} · ${when(m.takenAt)}` }));

  return (
    <div className="tab-body">
      <section className="section">
        <Text as="h2" variant="heading">Take a snapshot</Text>
        <Text>
          {`Saves the current config of ${group} to this app's KV store, with suspected secrets masked. Compare any two snapshots, or a snapshot against the current config.`}
        </Text>
        <div className="snapshot-form">
          <TextField
            label="Label"
            placeholder="e.g. before handoff"
            value={label}
            onChange={setLabel}
            maxLength={80}
          />
          <Button variant="primary" pending={taking} onClick={() => void take()}>
            Take snapshot
          </Button>
        </div>
        {actionError && <Alert appearance="danger">{actionError}</Alert>}
      </section>

      <section className="section">
        <Text as="h2" variant="heading">{`Snapshots${list.state === 'ready' ? ` (${items.length})` : ''}`}</Text>
        {list.state === 'loading' && <Spinner />}
        {list.state === 'error' && (
          <Alert appearance="danger" title="Couldn't list snapshots" action={{ label: 'Retry', onClick: () => void refresh() }}>
            {list.message}
          </Alert>
        )}
        {list.state === 'ready' && items.length === 0 && (
          <EmptyState illustration="EmptyFolder" title="No snapshots yet" description={`Take one to start a change log for ${group}.`} />
        )}
        {items.length > 0 && (
          <ul className="snapshot-list">
            {items.map((m) => (
              <li key={m.id} className="snapshot">
                <div>
                  <span className="snapshot-label">{m.label}</span>
                  <span className="snapshot-meta">
                    {`${when(m.takenAt)}${m.takenBy ? ` · ${m.takenBy}` : ''} · ${m.counts.routes} routes, ${m.counts.pipelines} pipelines, ${m.counts.destinations} destinations`}
                  </span>
                </div>
                <div className="snapshot-actions">
                  {armedDelete === m.id ? (
                    <>
                      <Button size="sm" appearance="danger" onClick={() => void remove(m)}>
                        {`Delete "${m.label}"`}
                      </Button>
                      <Button size="sm" onClick={() => setArmedDelete(null)}>
                        Cancel
                      </Button>
                    </>
                  ) : (
                    <Button size="sm" variant="tertiary" onClick={() => setArmedDelete(m.id)}>
                      Delete
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {items.length > 0 && (
        <section className="section">
          <Text as="h2" variant="heading">Compare</Text>
          <div className="compare-pickers">
            <SelectField label="From" items={options} value={left} onChange={(k) => k !== null && setLeft(String(k))} />
            <SelectField
              label="To"
              items={[{ id: CURRENT, label: 'Current config' }, ...options]}
              value={right}
              onChange={(k) => k !== null && setRight(String(k))}
            />
          </div>
          {compareError && <Alert appearance="danger">{compareError}</Alert>}
          {!diff && !compareError && <Spinner />}
          {diff && before && after && (
            <DiffView diff={diff} before={before} after={after} beforeLabel={nameOf(left)} afterLabel={nameOf(right)} />
          )}
        </section>
      )}
    </div>
  );
}
