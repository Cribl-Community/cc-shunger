import { lazy, Suspense, useEffect, useState } from 'react';
import { Alert, Button, EmptyState, Spinner, Text } from '@capra/core';
import { listWorkerGroups, type WorkerGroup } from './api/groups';
import GroupPicker from './ui/GroupPicker';

// Dev-only Phase 0 probe; the DEV guard lets Vite drop it from production bundles.
const Phase0Probe = import.meta.env.DEV ? lazy(() => import('./dev/Phase0Probe')) : null;

type Load =
  | { state: 'loading' }
  | { state: 'error'; message: string }
  | { state: 'ready'; groups: WorkerGroup[] };

function App() {
  const [load, setLoad] = useState<Load>({ state: 'loading' });
  const [groupId, setGroupId] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [showProbe, setShowProbe] = useState(false);

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
          <GroupPicker groups={load.groups} value={groupId} onChange={setGroupId} />
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
            <Text>{`${group.name} · ${group.workerCount} worker${group.workerCount === 1 ? '' : 's'}`}</Text>
          </>
        )}

        {Phase0Probe && (
          <div className="dev-tools">
            <Button variant="tertiary" onClick={() => setShowProbe((s) => !s)}>
              {showProbe ? 'Hide Phase 0 probe' : 'Show Phase 0 probe (dev only)'}
            </Button>
            {showProbe && (
              <Suspense fallback={<Spinner />}>
                <Phase0Probe />
              </Suspense>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
