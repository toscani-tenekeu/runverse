export interface Language {
  id: string;
  name: string;
  runtime: string;
  file: string;
  mode: string;
  template: string;
  installed: boolean;
  version: string | null;
}

export interface CodeFile { name: string; content: string }
export interface Code { language: string; files: CodeFile[]; stdin: string }

export interface Stage { stdout: string; stderr: string; code: number | null; signal: string | null }
export interface RunResult { run: Stage; compile?: Stage; durationMs: number; version: string }

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch('/api' + path, {
    ...init,
    headers: init?.body ? { 'content-type': 'application/json' } : undefined,
  });
  const body = await res.json().catch(() => ({ message: `The server returned ${res.status}.` }));
  if (!res.ok) throw new Error(body.message ?? `The server returned ${res.status}.`);
  return body as T;
}

export const getLanguages = () => request<Language[]>('/languages');
export const runCode = (code: Code) => request<RunResult>('/run', { method: 'POST', body: JSON.stringify(code) });
export const shareCode = (code: Code) => request<{ id: string }>('/snippets', { method: 'POST', body: JSON.stringify(code) });
export const getSnippet = (id: string) => request<Code>(`/snippets/${id}`);

export const languagesQuery = { queryKey: ['languages'], queryFn: getLanguages, staleTime: 60_000 };
