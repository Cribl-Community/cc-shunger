import { lazy, Suspense, useEffect, useState } from 'react';
import { Alert, Button, EmptyState, Spinner, TabNav, Text } from '@capra/core';
import { listWorkerGroups, type WorkerGroup } from './api/groups';
import AsBuiltTab from './ui/AsBuiltTab';
import GroupPicker from './ui/GroupPicker';
import { useInventory } from './ui/useInventory';

// Dev-only tools (demo seeder, Phase 0 probe); the DEV guard lets Vite drop them from production.
const DevTools = import.meta.env.DEV ? lazy(() => import('./dev/DevTools')) : null;

type Load =
  | { state: 'loading' }
  | { state: 'error'; message: string }
  | { state: 'ready'; groups: WorkerGroup[] };

type Tab = 'asbuilt' | 'linter' | 'snapshots';

const TABS = [
  { key: 'asbuilt', name: 'As-Built' },
  { key: 'linter', name: 'Linter' },
  { key: 'snapshots', name: 'Snapshots' },
];

function App() {
  const [load, setLoad] = useState<Load>({ state: 'loading' });
  const [groupId, setGroupId] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [tab, setTab] = useState<Tab>('asbuilt');
  const [showDev, setShowDev] = useState(false);
  const [inv, reloadInventory] = useInventory(groupId);

  useEffect(() => {
    const ctrl = new AbortController();
    listWorkerGroups(ctrl.signal)
      .then((groups) => {
        setLoad({ state: 'ready', groups });
        setGroupId((current) => current ?? groups[0]?.id ?? null);
      })
      .catch((e: unknown) => {
        if (!ctrl.signal.aborted) setLoad({ state: 'error', message: String(e) });
      });
    return () => ctrl.abort();
  }, [attempt]);

  const group = load.state === 'ready' ? load.groups.find((g) => g.id === groupId) : undefined;

  return (
    <div className="app">
      <header className="app-header">
        <Text as="h1" variant="heading">Cribl Blueprint</Text>
        {load.state === 'ready' && load.groups.length > 0 && (
          <div className="header-controls">
            <GroupPicker groups={load.groups} value={groupId} onChange={setGroupId} />
            <Button onClick={reloadInventory} disabled={inv.state === 'loading'}>
              Refresh
            </Button>
          </div>
        )}
      </header>

      <main className="app-body">
        {load.state === 'loading' && <Spinner />}

        {load.state === 'error' && (
          <Alert
            appearance="danger"
            title="Couldn't load Worker Groups"
            action={{
              label: 'Retry',
              onClick: () => {
                setLoad({ state: 'loading' });
                setAttempt((n) => n + 1);
              },
            }}
          >
            {load.message}
          </Alert>
        )}

        {load.state === 'ready' && load.groups.length === 0 && (
          <EmptyState title="No Stream Worker Groups" description="This workspace has no Stream Worker Groups you can read." />
        )}

        {group && (
          <>
            {!!group.localChanges && (
              <Alert appearance="warning" title="Uncommitted changes">
                {`${group.id} has ${group.localChanges} uncommitted change${group.localChanges === 1 ? '' : 's'}. Blueprint shows the working config, including uncommitted edits.`}
              </Alert>
            )}

            <TabNav aria-label="Blueprint views" items={TABS} activeKey={tab} onTabPress={(k) => setTab(k as Tab)} />

            {inv.state === 'loading' && <Spinner />}
            {inv.state === 'error' && (
              <Alert
                appearance="danger"
                title={`Couldn't load config for ${inv.group}`}
                action={{ label: 'Retry', onClick: reloadInventory }}
              >
                {inv.message}
              </Alert>
            )}
            {inv.state === 'ready' && tab === 'asbuilt' && <AsBuiltTab inventory={inv.inventory} graph={inv.graph} />}
            {inv.state === 'ready' && tab === 'linter' && (
              <EmptyState title="Linter" description="Coming in Phase 3." />
            )}
            {inv.state === 'ready' && tab === 'snapshots' && (
              <EmptyState title="Snapshots" description="Coming in Phase 4." />
            )}
          </>
        )}

        {DevTools && (
          <div className="dev-tools">
            <Button variant="tertiary" onClick={() => setShowDev((s) => !s)}>
              {showDev ? 'Hide dev tools' : 'Show dev tools'}
            </Button>
            {showDev && (
              <Suspense fallback={<Spinner />}>
                <DevTools group={groupId} />
              </Suspense>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
