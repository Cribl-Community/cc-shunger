// The only config write Blueprint makes: reordering a group's Routing table for the L01 fix-it.
// PATCH /routes/{id} requires the complete table, so the fresh raw table is re-fetched and
// reordered with every field intact. Nothing is committed or deployed.
import { reorderRawRoutes } from '../fix/l01';
import { ApiError, apiGet, type ListResponse } from './client';

interface RawRoute {
  id: string;
  [key: string]: unknown;
}

interface RawTable {
  id: string;
  routes: RawRoute[];
  [key: string]: unknown;
}

export async function applyRouteOrder(group: string, expectedBefore: string[], order: string[]): Promise<void> {
  const base = `/m/${encodeURIComponent(group)}/routes`;
  const tables = await apiGet<ListResponse<RawTable>>(base);
  const table = (tables.items ?? []).find((t) => t.id === 'default') ?? tables.items?.[0];
  if (!table) throw new Error(`No Routing table found for ${group}`);
  // Refuse if someone changed the table since the preview was built.
  if (table.routes.map((r) => r.id).join('\n') !== expectedBefore.join('\n')) {
    throw new Error('The Routing table changed since Blueprint loaded it. Refresh and try again.');
  }
  const body = { ...table, routes: reorderRawRoutes(table.routes, order) };
  const path = `${base}/${encodeURIComponent(table.id)}`;
  const res = await fetch(`${window.CRIBL_API_URL}${path}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new ApiError(path, res.status, `PATCH ${path} failed (${res.status}): ${(await res.text()).slice(0, 200)}`);
  }
}
