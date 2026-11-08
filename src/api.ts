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
