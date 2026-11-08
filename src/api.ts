import type { AppState } from '../shared/types';
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export async function api<T = unknown>(
  path: string,
  method = 'GET',
  body?: unknown,
  revision?: number,
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'X-Pixel-Class': '1',
        ...(revision === undefined ? {} : { 'If-Match': `"${revision}"` }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(
      0,
      '서버에 연결하지 못했어요. 인터넷 연결을 확인하고 다시 시도해 주세요. 입력한 내용은 유지돼요.',
    );
  }
  let data: Record<string, unknown>;
  try {
    data = await res.json();
  } catch {
    throw new ApiError(res.status, '서버가 잠시 응답하지 않아요. 조금 뒤에 다시 시도해 주세요.');
  }
  if (!res.ok) throw new ApiError(res.status, String(data.error || '요청을 처리하지 못했어요.'));
  return data as T;
}
export const fetchState = () => api<AppState>('/state');

/** Advance only across revisions that did not change the fields this editor writes.
 * The subsequent If-Match still rejects a change racing this preflight read. */
export async function projectSaveRevision(
  projectId: string,
  fallbackRevision: number,
  baseline: Record<string, unknown>,
) {
  const current = (await fetchState()).projects.find((project) => project.id === projectId);
  if (!current) return fallbackRevision;
  const same = (a: unknown, b: unknown): boolean => {
    if (a === b) return true;
    if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;
    if (Array.isArray(a) !== Array.isArray(b)) return false;
    const first = a as Record<string, unknown>,
      second = b as Record<string, unknown>;
    const keys = Object.keys(first);
    return (
      keys.length === Object.keys(second).length &&
      keys.every((key) => Object.hasOwn(second, key) && same(first[key], second[key]))
    );
  };
  return Object.entries(baseline).every(([key, value]) =>
    same(current[key as keyof typeof current], value),
  )
    ? current.revision || 0
    : fallbackRevision;
}
