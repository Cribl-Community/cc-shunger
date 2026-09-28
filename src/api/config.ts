import { ApiError, apiGet, type ListResponse } from './client';
import type { RawConfig } from '../model/types';

const g = (group: string, path: string) => `/m/${encodeURIComponent(group)}/${path}`;

/**
 * Fetches the five config collections for one Worker Group in parallel. Routes, pipelines,
 * sources, and destinations are required; packs are optional, so a user who can't read them
 * still gets a report, with a warning.
 */
export async function fetchRawConfig(group: string, signal?: AbortSignal): Promise<RawConfig> {
  const get = (path: string) => apiGet<ListResponse<unknown>>(g(group, path), signal).then((r) => r.items ?? []);
  const warnings: string[] = [];
  const optional = (path: string, label: string) =>
    get(path).catch((e: unknown) => {
      if (signal?.aborted) throw e;
      const status = e instanceof ApiError ? ` (${e.status})` : '';
      warnings.push(`${label} couldn't be read${status}, so they are left out of this report.`);
      return [];
    });
  const [routes, pipelines, inputs, outputs, packs] = await Promise.all([
    get('routes'),
    get('pipelines'),
    get('system/inputs'),
    get('system/outputs'),
    optional('packs', 'Packs'),
  ]);
  return { group, routes, pipelines, inputs, outputs, packs, warnings };
}
