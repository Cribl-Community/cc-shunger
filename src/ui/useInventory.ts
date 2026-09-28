import { useEffect, useState } from 'react';
import { fetchRawConfig } from '../api/config';
import { buildGraph, type ReferenceGraph } from '../model/graph';
import { normalize } from '../model/normalize';
import type { Inventory } from '../model/types';

export type InventoryState =
  | { state: 'idle' }
  | { state: 'loading'; group: string }
  | { state: 'error'; group: string; message: string }
  | { state: 'ready'; group: string; inventory: Inventory; graph: ReferenceGraph; loadedAt: Date; warnings: string[] };

/** Loads and normalizes one Worker Group's config; `reload` re-fetches the same group. */
export function useInventory(group: string | null): [InventoryState, () => void] {
  const [result, setResult] = useState<InventoryState>({ state: 'idle' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!group) return;
    const ctrl = new AbortController();
    fetchRawConfig(group, ctrl.signal)
      .then((raw) => {
        const inventory = normalize(raw);
        setResult({ state: 'ready', group, inventory, graph: buildGraph(inventory), loadedAt: new Date(), warnings: raw.warnings ?? [] });
      })
      .catch((e: unknown) => {
        if (!ctrl.signal.aborted) setResult({ state: 'error', group, message: String(e) });
      });
    return () => ctrl.abort();
  }, [group, attempt]);

  // A result for a different group than the one selected is stale: report it as loading.
  const current: InventoryState =
    group && (result.state === 'idle' || result.group !== group) ? { state: 'loading', group } : result;

  return [
    current,
    () => {
      if (group) setResult({ state: 'loading', group });
      setAttempt((n) => n + 1);
    },
  ];
}
