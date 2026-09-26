// Dev-only: writes the blueprint-demo config (demo/seed.ts) into a Worker Group whose id starts
// with "blueprint-". Creates or overwrites the named objects and replaces the Routing table.
// Nothing is committed or deployed. Excluded from production builds.
import { useState } from 'react';
import { Alert, Button, Text } from '@capra/core';
import { DEMO_GROUP_PREFIX, demoSeed } from '../../demo/seed';

interface Props {
  group: string;
}

type Log = (line: string) => void;

async function call(method: string, path: string, body?: unknown) {
  const res = await fetch(`${window.CRIBL_API_URL}${path}`, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, ok: res.ok, text: await res.text() };
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
  const chosen = [...preferred, ...ids].slice(0, 3);
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

export default function DemoSeeder({ group }: Props) {
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [lines, setLines] = useState<string[]>([]);
  const allowed = group.startsWith(DEMO_GROUP_PREFIX);
  const s = demoSeed(['sample']);

  const run = async () => {
    setArmed(false);
    setBusy(true);
    setLines([]);
    try {
      await seed(group, (l) => setLines((prev) => [...prev, l]));
    } catch (e) {
      setLines((prev) => [...prev, `ERROR: ${String(e)}`]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 900 }}>
      <Text as="h2" variant="heading">Seed demo config (dev only)</Text>
      {!allowed && (
        <Alert appearance="info">{`Select a Worker Group whose id starts with "${DEMO_GROUP_PREFIX}" to enable seeding.`}</Alert>
      )}
      {allowed && armed && (
        <Alert appearance="warning" title={`Overwrite config in ${group}?`}>
          {`Creates or overwrites pipelines ${s.pipelines.map((p) => p.id).join(', ')}; destinations ${s.outputs.map((o) => o.id).join(', ')}; sources ${s.inputs.map((i) => i.id).join(', ')}; and replaces the entire Routing table with ${s.routes.length} routes. This cannot be undone from Blueprint.`}
        </Alert>
      )}
      <div style={{ display: 'flex', gap: 8 }}>
        <Button
          appearance={armed ? 'danger' : 'default'}
          disabled={!allowed || busy}
          onClick={() => (armed ? void run() : setArmed(true))}
        >
          {armed ? `Confirm: overwrite ${group}` : `Seed ${group}`}
        </Button>
        {armed && <Button onClick={() => setArmed(false)}>Cancel</Button>}
      </div>
      <pre style={{ whiteSpace: 'pre-wrap', fontSize: 12 }}>{lines.join('\n')}</pre>
    </div>
  );
}
