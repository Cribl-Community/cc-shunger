import { apiGet, type ListResponse } from './client';

export interface WorkerGroup {
  id: string;
  name: string;
  workerCount: number;
  /** Number of uncommitted config changes, when the Leader reports it. */
  localChanges?: number;
}

interface RawGroup {
  id: string;
  name?: string;
  type?: string;
  isFleet?: boolean;
  isSearch?: boolean;
  workerCount?: number;
  git?: { localChanges?: number };
}

/** Keeps Stream Worker Groups only: Edge Fleets and Search groups are out of scope. */
export function parseGroups(body: ListResponse<RawGroup>): WorkerGroup[] {
  return (body.items ?? [])
    .filter((g) => (g.type ? g.type === 'stream' : !g.isFleet && !g.isSearch))
    .map((g) => ({
      id: g.id,
      name: g.name || g.id,
      workerCount: g.workerCount ?? 0,
      localChanges: g.git?.localChanges,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function listWorkerGroups(signal?: AbortSignal): Promise<WorkerGroup[]> {
  const body = await apiGet<ListResponse<RawGroup>>(
    '/master/groups?product=stream&fields=git.localChanges',
    signal,
  );
  return parseGroups(body);
}
