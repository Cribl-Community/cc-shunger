// Thin wrapper over the platform's fetch proxy. Auth is injected by the Cribl iframe host, so no
// tokens are ever handled here. Paths are relative to CRIBL_API_URL (e.g. `/master/groups`).

export class ApiError extends Error {
  readonly status: number;
  readonly path: string;

  constructor(path: string, status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.path = path;
  }
}

export async function apiGet<T>(path: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(`${window.CRIBL_API_URL}${path}`, {
    headers: { Accept: 'application/json' },
    signal,
  });
  if (!res.ok) {
    const detail = (await res.text()).slice(0, 200);
    throw new ApiError(path, res.status, `GET ${path} failed (${res.status}): ${detail}`);
  }
  return (await res.json()) as T;
}

/** Every Cribl list endpoint returns `{ items, count }`. */
export interface ListResponse<T> {
  items?: T[];
  count?: number;
}
