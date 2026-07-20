import { API_URL } from './mode';

const TOKEN_KEY = 'sipwise_api_token';

function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

async function request<T = unknown>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  const token = getToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data?.error || `Request failed (${res.status})`);
  }

  return data as T;
}

export const apiGet = <T = unknown>(path: string) => request<T>('GET', path);
export const apiPost = <T = unknown>(path: string, body?: unknown) => request<T>('POST', path, body);
export const apiPut = <T = unknown>(path: string, body?: unknown) => request<T>('PUT', path, body);
export const apiDelete = <T = unknown>(path: string) => request<T>('DELETE', path);
