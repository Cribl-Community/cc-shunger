// Dev-only: writes the demo config (demo/seed.ts) into the selected Worker Group. Creates or
// overwrites the named objects and replaces the Routing table. Nothing is committed or deployed.
// Excluded from production builds.
//
// Safety: the demo target is a spare workspace's `default` group, which shares its name with
// real groups, so the guard is based on content, not name. If the Routing table holds routes the
// seed doesn't own, seeding requires typing the workspace host to confirm.
import { useEffect, useState } from 'react';
import { Alert, Button, Text } from '@capra/core';
import { demoSeed } from '../../demo/seed';

interface Props {
  group: string;
}

type Log = (line: string) => void;

const SEED_ROUTE_IDS = new Set(demoSeed(['x']).routes.map((r) => String(r.id)));

/** Identifies the workspace, since `default` exists in every workspace. */
const workspaceHost = () => {
  try {
    return new URL(window.CRIBL_API_URL, window.location.href).host;
  } catch {
    return window.CRIBL_API_URL;
  }
};

async function call(method: string, path: string, body?: unknown) {
  const res = await fetch(`${window.CRIBL_API_URL}${path}`, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, ok: res.ok, text: await res.text() };
}

async function foreignRoutes(group: string): Promise<string[]> {
  const r = await call('GET', `/m/${encodeURIComponent(group)}/routes`);
  if (!r.ok) throw new Error(`GET routes -> ${r.status}`);
  const table = (JSON.parse(r.text).items ?? [])[0] ?? { routes: [] };
  return (table.routes as { id: string; name?: string }[])
    .filter((route) => !SEED_ROUTE_IDS.has(route.id))
    .map((route) => route.name ?? route.id);
}

async function upsert(log: Log, base: string, obj: { id: string }) {
  const existing = await call('GET', `${base}/${encodeURIComponent(obj.id)}`);
  const r = existing.ok
    ? await call('PATCH', `${base}/${encodeURIComponent(obj.id)}`, obj)
    : await call('POST', base, obj);
  log(`${existing.ok ? 'PATCH' : 'POST'} ${base}/${obj.id} -> ${r.status}${r.ok ? '' : ` ${r.text.slice(0, 160)}`}`);
  if (!r.ok) throw new Error(`Failed on ${obj.id}`);
}

async function seed(group: string, log: Log) {
  const m = `/m/${encodeURIComponent(group)}`;
  const samples = await call('GET', `${m}/system/samples`);
  const ids: string[] = samples.ok ? (JSON.parse(samples.text).items ?? []).map((s: { id: string }) => s.id) : [];
  if (!ids.length) throw new Error(`No Datagen samples in ${group} (GET system/samples -> ${samples.status})`);
  const preferred = ids.filter((id) => /access|apache|web|syslog|auth|business|metric/i.test(id));
  const chosen = [...new Set([...preferred, ...ids])].slice(0, 3);
  log(`Using Datagen samples: ${chosen.join(', ')}`);

  const s = demoSeed(chosen);
  for (const p of s.pipelines) await upsert(log, `${m}/pipelines`, p);
  for (const o of s.outputs) await upsert(log, `${m}/system/outputs`, o as { id: string });
  for (const i of s.inputs) await upsert(log, `${m}/system/inputs`, i as { id: string });
  const r = await call('PATCH', `${m}/routes/default`, { id: 'default', routes: s.routes });
  log(`PATCH ${m}/routes/default -> ${r.status}${r.ok ? '' : ` ${r.text.slice(0, 160)}`}`);
  if (!r.ok) throw new Error('Failed to write the Routing table');
  log('Done. Nothing was committed or deployed; commit in Cribl if you want a clean baseline.');
}

type Check = { state: 'checking' } | { state: 'error'; message: string } | { state: 'ready'; foreign: string[] };

export default function DemoSeeder({ group }: Props) {
  const host = workspaceHost();
  const [check, setCheck] = useState<Check>({ state: 'checking' });
  const [armed, setArmed] = useState(false);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [lines, setLines] = useState<string[]>([]);
  const s = demoSeed(['sample']);

  useEffect(() => {
    let live = true;
    foreignRoutes(group)
      .then((foreign) => live && setCheck({ state: 'ready', foreign }))
      .catch((e: unknown) => live && setCheck({ state: 'error', message: String(e) }));
    return () => {
      live = false;
    };
  }, [group]);

  const foreign = check.state === 'ready' ? check.foreign : [];
  const needsTyped = foreign.length > 0;
  const canConfirm = !needsTyped || typed.trim() === host;

  const run = async () => {
    setArmed(false);
    setTyped('');
    setBusy(true);
    setLines([]);
    try {
      await seed(group, (l) => setLines((prev) => [...prev, l]));
      setCheck({ state: 'ready', foreign: await foreignRoutes(group) });
    } catch (e) {
      setLines((prev) => [...prev, `ERROR: ${String(e)}`]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 900 }}>
      <Text as="h2" variant="heading">Seed demo config (dev only)</Text>
      <Text>{`Workspace: ${host} · Group: ${group}`}</Text>
      {check.state === 'error' && <Alert appearance="danger">{check.message}</Alert>}
      {needsTyped && (
        <Alert appearance="danger" title="This group has routes the demo seed doesn't own">
          {`Seeding replaces the whole Routing table and would delete: ${foreign.join(', ')}. Only seed a spare demo workspace.`}
        </Alert>
      )}
      {armed && (
        <Alert appearance="warning" title={`Overwrite config in ${host} / ${group}?`}>
          {`Creates or overwrites pipelines ${s.pipelines.map((p) => p.id).join(', ')}; destinations ${s.outputs.map((o) => o.id).join(', ')}; sources ${s.inputs.map((i) => i.id).join(', ')}; and replaces the entire Routing table with ${s.routes.length} routes. This cannot be undone from Blueprint.`}
        </Alert>
      )}
      {armed && needsTyped && (
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <Text>{`Type the workspace host (${host}) to confirm:`}</Text>
          <input value={typed} onChange={(e) => setTyped(e.target.value)} aria-label="Workspace host" />
        </label>
      )}
      <div style={{ display: 'flex', gap: 8 }}>
        <Button
          appearance={armed ? 'danger' : 'default'}
          disabled={check.state !== 'ready' || busy || (armed && !canConfirm)}
          onClick={() => (armed ? void run() : setArmed(true))}
        >
          {armed ? `Confirm: overwrite ${group}` : `Seed ${group}`}
        </Button>
        {armed && (
          <Button
            onClick={() => {
              setArmed(false);
              setTyped('');
            }}
          >
            Cancel
          </Button>
        )}
      </div>
      <pre style={{ whiteSpace: 'pre-wrap', fontSize: 12 }}>{lines.join('\n')}</pre>
    </div>
  );
}
