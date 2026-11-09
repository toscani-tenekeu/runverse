export interface Language {
  id: string;
  name: string;
  runtime: string;
  file: string;
  mode: string;
  template: string;
  files?: CodeFile[]; // starter project with several files (web)
  installed: boolean;
  version: string | null;
}

export interface CodeFile { name: string; content: string }
export interface Code { language: string; files: CodeFile[]; folders?: string[]; stdin: string }
export type Expiry = '1h' | '1d' | '7d' | '15d' | '20d' | '30d';

export interface Stage { stdout: string; stderr: string; code: number | null; signal: string | null }
export interface RunResult { run: Stage; compile?: Stage; durationMs: number; version: string }

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch('/api' + path, {
    ...init,
    headers: { ...(init?.body ? { 'content-type': 'application/json' } : {}), ...(init?.headers as Record<string, string> | undefined) },
  });
  const body = await res.json().catch(() => ({ message: `The server returned ${res.status}.` }));
  // A session that ended (or never started): the app shows the sign-in page again.
  if (res.status === 401 && !path.startsWith('/auth/')) dispatchEvent(new Event('rv-unauthorized'));
  if (!res.ok) throw new Error(body.message ?? `The server returned ${res.status}.`);
  return body as T;
}

export const getLanguages = () => request<Language[]>('/languages');
export const runCode = (code: Code) => request<RunResult>('/run', { method: 'POST', body: JSON.stringify(code) });
export const shareCode = ({ code, expiresIn }: { code: Code; expiresIn: Expiry }) =>
  request<{ id: string; expiresAt: number; deleteToken: string }>('/snippets', { method: 'POST', body: JSON.stringify({ ...code, expiresIn }) });
export const deleteSharedLink = (id: string, token: string) =>
  request<unknown>(`/snippets/${id}`, { method: 'DELETE', headers: { 'x-delete-token': token } });
export const getSnippet = (id: string) => request<Code & { expiresAt: number }>(`/snippets/${id}`);

export const languagesQuery = { queryKey: ['languages'], queryFn: getLanguages, staleTime: 60_000 };

export interface AuthState { authEnabled: boolean; authenticated: boolean; username?: string }
export const getAuth = () => request<AuthState>('/auth/me');
export const signIn = (credentials: { username: string; password: string }) =>
  request<unknown>('/auth/login', { method: 'POST', body: JSON.stringify(credentials) });
export const signOut = () => request<unknown>('/auth/logout', { method: 'POST' });
export const authQuery = { queryKey: ['auth'], queryFn: getAuth, staleTime: 60_000 };
