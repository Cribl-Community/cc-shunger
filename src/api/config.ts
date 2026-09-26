import { apiGet, type ListResponse } from './client';
import type { RawConfig } from '../model/types';

const g = (group: string, path: string) => `/m/${encodeURIComponent(group)}/${path}`;

/** Fetches the five config collections for one Worker Group in parallel. */
export async function fetchRawConfig(group: string, signal?: AbortSignal): Promise<RawConfig> {
  const get = (path: string) => apiGet<ListResponse<unknown>>(g(group, path), signal).then((r) => r.items ?? []);
  const [routes, pipelines, inputs, outputs, packs] = await Promise.all([
    get('routes'),
    get('pipelines'),
    get('system/inputs'),
    get('system/outputs'),
    get('packs'),
  ]);
  return { group, routes, pipelines, inputs, outputs, packs };
}
