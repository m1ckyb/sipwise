import { API_URL } from './mode';

const TOKEN_KEY = 'sipwise_api_token';
const DEFAULT_TIMEOUT_MS = 15_000;
const MAX_RETRIES = 2;

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

async function request<T = unknown>(
  method: string,
  path: string,
  body?: unknown,
  attempt = 0,
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  try {
    const res = await fetch(`${API_URL}${path}`, {
      method,
      headers,
      credentials: 'include',
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });

    let data: Record<string, unknown> | null = null;
    if (res.status !== 204) {
      const contentType = res.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        try {
          data = await res.json();
        } catch {
          data = null;
        }
      }
    }

    if (!res.ok) {
      // Retry on 5xx errors (transient) for non-body requests
      if (res.status >= 500 && method === 'GET' && attempt < MAX_RETRIES) {
        const delay = Math.min(1000 * Math.pow(2, attempt), 5000);
        await new Promise(r => setTimeout(r, delay));
        return request<T>(method, path, body, attempt + 1);
      }
      const errMsg = typeof data?.error === 'string' ? data.error : `Request failed (${res.status})`;
      throw new Error(errMsg);
    }

    return data as T;
  } catch (err) {
    // Retry on network/abort errors for GET requests
    if (method === 'GET' && attempt < MAX_RETRIES && (
      (err instanceof DOMException && err.name === 'AbortError') ||
      (err instanceof TypeError && err.message.includes('fetch'))
    )) {
      const delay = Math.min(1000 * Math.pow(2, attempt), 5000);
      await new Promise(r => setTimeout(r, delay));
      return request<T>(method, path, body, attempt + 1);
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

export const apiGet = <T = unknown>(path: string) => request<T>('GET', path);
export const apiPost = <T = unknown>(path: string, body?: unknown) => request<T>('POST', path, body);
export const apiPut = <T = unknown>(path: string, body?: unknown) => request<T>('PUT', path, body);
export const apiDelete = <T = unknown>(path: string) => request<T>('DELETE', path);
