const PISTON_URL = process.env.PISTON_URL ?? 'http://localhost:2000';

export interface PistonRuntime { language: string; version: string; aliases: string[] }
export interface PistonPackage { language: string; language_version: string; installed: boolean }
export interface Stage { stdout: string; stderr: string; code: number | null; signal: string | null; output: string }
export interface PistonResult { language: string; version: string; run: Stage; compile?: Stage; message?: string }

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(PISTON_URL + path, {
    ...init,
    headers: { 'content-type': 'application/json', ...init?.headers },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((body as { message?: string }).message ?? `Piston returned ${res.status}`);
  return body as T;
}

export const runtimes = () => call<PistonRuntime[]>('/api/v2/runtimes');
export const packages = () => call<PistonPackage[]>('/api/v2/packages');

export const install = (language: string, version: string) =>
  call('/api/v2/packages', { method: 'POST', body: JSON.stringify({ language, version }) });

export const execute = (body: {
  language: string;
  version: string;
  files: { name: string; content: string }[];
  stdin: string;
}) => call<PistonResult>('/api/v2/execute', { method: 'POST', body: JSON.stringify(body) });

// Newest first, comparing version parts as numbers ("3.12.0" > "3.9.4").
export const compareVersions = (a: string, b: string) => {
  const pa = a.split('.').map(Number), pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pb[i] ?? 0) - (pa[i] ?? 0);
    if (d) return d;
  }
  return 0;
};
