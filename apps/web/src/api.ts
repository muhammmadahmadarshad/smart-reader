import { QueryClient } from '@tanstack/react-query';
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...options,
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', 'X-Kevnex-Request': '1', ...options.headers },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401 && !path.startsWith('/auth'))
      window.dispatchEvent(new Event('session-expired'));
    throw new ApiError(
      response.status,
      Array.isArray(body.message)
        ? body.message.join(' ')
        : body.message || 'Request failed. Try again.',
    );
  }
  return body as T;
}
export const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, staleTime: 30000, refetchOnWindowFocus: true } },
});
