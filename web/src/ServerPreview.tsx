// Preview of a backend framework project (Laravel, Django, Flask, FastAPI, Express).
// The app never listens on a port: each request (the address bar, a link, a form, a fetch()
// from the page) runs it once in the sandbox, and the page it returns is shown here.
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState, type FormEvent } from 'react';
import { ChevronLeft, ChevronRight, Loader2, RotateCw } from 'lucide-react';
import { runCode, type Code, type CodeFile, type HttpResponse } from './api';
import { injectBridge, inlineAssets, type LogLine } from './WebPreview';

export interface ServerPreviewHandle {
  /** Sends the address bar's request again (the Run button). */
  reload: () => void;
}

interface Props {
  code: Code;
  onLog: (line: LogLine) => void;
}

interface Shown {
  path: string;
  status: number;
  type: string;
  body: string; // text
  doc: string | null; // HTML pages, ready for the frame
  ms: number;
}

const decode = (base64: string) => {
  const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
};
const encode = (text: string) => btoa(String.fromCharCode(...new TextEncoder().encode(text)));
const header = (res: HttpResponse, name: string) => res.headers.find(h => h[0].toLowerCase() === name)?.[1] ?? '';

/** Turns any URL the app wrote into a path on the app: "/a?b", "http://localhost/a" or relative to the page. */
export function appPath(href: string, current: string) {
  try {
    const url = new URL(href, `http://localhost${current}`);
    if (url.hostname !== 'localhost' && url.hostname !== '127.0.0.1' && url.hostname !== 'testserver') return null;
    return url.pathname + url.search;
  } catch {
    return null;
  }
}

// Inside the frame: links, forms and fetch() to the app go to the editor, which runs the request.
const NAV_BRIDGE = (current: string) => `<script>(() => {
  const here = ${JSON.stringify(current)};
  const base = 'http://localhost' + here;
  const local = href => {
    try {
      const url = new URL(href, base);
      if (!['localhost', '127.0.0.1', 'testserver'].includes(url.hostname)) return null;
      return url.pathname + url.search + url.hash;
    } catch { return null; }
  };
  const go = (method, path, type, body) => parent.postMessage({ __rv_nav: { method, path, type, body } }, '*');
  document.addEventListener('click', e => {
    const a = e.target.closest && e.target.closest('a[href]');
    if (!a || e.defaultPrevented || a.target === '_blank') return;
    const href = a.getAttribute('href');
    if (href.startsWith('#')) return;
    const path = local(href);
    if (path === null) { e.preventDefault(); window.open(a.href, '_blank', 'noopener'); return; }
    e.preventDefault();
    go('GET', path);
  });
  document.addEventListener('submit', e => {
    const form = e.target;
    if (e.defaultPrevented) return;
    e.preventDefault();
    const method = (form.getAttribute('method') || 'GET').toUpperCase();
    const action = local(form.getAttribute('action') || here) || here;
    const data = new URLSearchParams(new FormData(form, e.submitter));
    if (method === 'GET') {
      const url = new URL(action, 'http://localhost');
      url.search = data.toString();
      go('GET', url.pathname + url.search);
    } else {
      go(method, action, 'application/x-www-form-urlencoded', data.toString());
    }
  });
  // fetch() to the app gets its answer from a run of the app.
  const realFetch = window.fetch.bind(window);
  const waiting = new Map();
  let next = 0;
  addEventListener('message', e => {
    const reply = e.data && e.data.__rv_fetch_reply;
    if (!reply || !waiting.has(reply.id)) return;
    const { resolve, reject } = waiting.get(reply.id);
    waiting.delete(reply.id);
    if (reply.error) return reject(new TypeError(reply.error));
    const bytes = Uint8Array.from(atob(reply.body), c => c.charCodeAt(0));
    resolve(new Response(bytes, { status: reply.status, headers: reply.headers }));
  });
  window.fetch = async (input, init = {}) => {
    const request = new Request(input, init);
    const path = local(typeof input === 'string' ? input : request.url);
    if (path === null) return realFetch(input, init);
    const headers = {};
    request.headers.forEach((v, k) => { headers[k] = v; });
    const body = ['GET', 'HEAD'].includes(request.method) ? '' : await request.text();
    const id = ++next;
    return new Promise((resolve, reject) => {
      waiting.set(id, { resolve, reject });
      parent.postMessage({ __rv_fetch: { id, method: request.method, path, headers, body } }, '*');
    });
  };
})();<\/script>`;

const STATUS_TEXT: Record<number, string> = {
  200: 'OK', 201: 'Created', 204: 'No Content', 301: 'Moved', 302: 'Found', 303: 'See Other', 304: 'Not Modified',
  307: 'Temporary Redirect', 308: 'Permanent Redirect', 400: 'Bad Request', 401: 'Unauthorized', 403: 'Forbidden',
  404: 'Not Found', 405: 'Method Not Allowed', 419: 'Page Expired', 422: 'Unprocessable', 500: 'Server Error',
};

/**
 * Finds the workspace file a page asks for (stylesheets, scripts, SVG): frameworks serve them
 * from public/ or static/ folders, so try those too.
 */
function assetLookup(files: CodeFile[]) {
  const byName = new Map(files.map(f => [f.name, f.content]));
  return (ref: string) => {
    const path = appPath(ref, '/');
    if (path === null) return undefined;
    const clean = decodeURIComponent(path.split(/[?#]/)[0]!).replace(/^\/+/, '');
    if (!clean) return undefined;
    for (const candidate of [clean, `public/${clean}`, `static/${clean}`]) if (byName.has(candidate)) return byName.get(candidate);
    // Django and Flask apps keep their static files in <app>/static/…
    const stripped = clean.replace(/^static\//, '');
    const match = files.find(f => f.name.endsWith(`/static/${stripped}`));
    return match?.content;
  };
}

export const ServerPreview = forwardRef<ServerPreviewHandle, Props>(function ServerPreview({ code, onLog }, ref) {
  const [address, setAddress] = useState('/');
  const [typed, setTyped] = useState('/');
  const [shown, setShown] = useState<Shown | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const history = useRef<{ list: string[]; at: number }>({ list: ['/'], at: 0 });
  const [, bump] = useState(0);
  const cookies = useRef(new Map<string, string>());
  const frame = useRef<HTMLIFrameElement>(null);
  const codeRef = useRef(code);
  codeRef.current = code;
  const onLogRef = useRef(onLog);
  onLogRef.current = onLog;

  const cookieHeader = () => [...cookies.current].map(([k, v]) => `${k}=${v}`).join('; ');
  const keepCookies = (res: HttpResponse) => {
    for (const [name, value] of res.headers) {
      if (name.toLowerCase() !== 'set-cookie') continue;
      const [pair, ...attrs] = value.split(';');
      const at = pair!.indexOf('=');
      if (at < 1) continue;
      const key = pair!.slice(0, at).trim();
      const expired = attrs.some(a => /^\s*max-age\s*=\s*(0|-)/i.test(a)) ||
        attrs.some(a => /^\s*expires\s*=/i.test(a) && Date.parse(a.split('=').slice(1).join('=')) < Date.now());
      if (expired) cookies.current.delete(key);
      else cookies.current.set(key, pair!.slice(at + 1).trim());
    }
  };

  /** Runs one request, logging it; returns the response or null when the app gave none. */
  const send = useCallback(async (method: string, path: string, headers: Record<string, string>, body: string) => {
    const started = Date.now();
    const result = await runCode({
      ...codeRef.current,
      request: { method, path, headers: { ...headers, ...(cookies.current.size ? { cookie: cookieHeader() } : {}) }, body },
    });
    const log = onLogRef.current;
    for (const line of result.run.stdout.split('\n')) if (line.trim()) log({ level: 'log', text: line });
    for (const line of result.run.stderr.split('\n')) if (line.trim()) log({ level: 'error', text: line });
    const res = result.response ?? null;
    if (res) keepCookies(res);
    const killed = result.run.signal === 'SIGKILL' || result.run.code === 137;
    log({
      level: res && res.status < 400 ? 'info' : 'warn',
      text: `${method} ${path} → ${res ? `${res.status} ${STATUS_TEXT[res.status] ?? ''}`.trim() : killed ? 'stopped: time or memory limit' : 'no response'} · ${Date.now() - started} ms`,
    });
    return { res, ms: Date.now() - started, killed };
  }, []);

  /** Loads a page into the preview, following redirects like a browser. */
  const navigate = useCallback(async (method: string, path: string, type?: string, body?: string, push = true) => {
    setPending(true);
    setError('');
    try {
      let [m, p, t, b] = [method, path, type, body];
      for (let hop = 0; hop < 6; hop++) {
        const { res, ms, killed } = await send(m, p, t ? { 'content-type': t } : {}, b ? encode(b) : '');
        if (!res) {
          setShown(null);
          setError(killed ? 'The app was stopped: it took too long or used too much memory.' : 'The app did not answer. Its error is in the console below.');
          break;
        }
        const location = header(res, 'location');
        if (res.status >= 300 && res.status < 400 && location) {
          const next = appPath(location, p);
          if (next !== null) {
            // After a POST, a redirect is followed with GET, as browsers do.
            if (res.status !== 307 && res.status !== 308) [m, t, b] = ['GET', undefined, undefined];
            p = next;
            continue;
          }
        }
        const contentType = header(res, 'content-type');
        const text = decode(res.body);
        const html = /html/i.test(contentType) || (!contentType && /^\s*</.test(text));
        const doc = html
          ? injectBridge(inlineAssets({ name: 'index.html', content: text }, codeRef.current.files, text, assetLookup(codeRef.current.files)), NAV_BRIDGE(p))
          : null;
        setShown({ path: p, status: res.status, type: contentType, body: text, doc, ms });
        setAddress(p);
        setTyped(p);
        if (push) {
          const h = history.current;
          if (h.list[h.at] !== p) {
            h.list = [...h.list.slice(0, h.at + 1), p];
            h.at = h.list.length - 1;
            bump(n => n + 1);
          }
        }
        break;
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPending(false);
    }
  }, [send]);

  useImperativeHandle(ref, () => ({ reload: () => void navigate('GET', address, undefined, undefined, false) }), [navigate, address]);

  // The first page loads by itself.
  useEffect(() => { void navigate('GET', '/', undefined, undefined, false); }, [navigate]);

  // Messages from the page: navigation, fetch() calls and console output.
  useEffect(() => {
    const listen = async (e: MessageEvent) => {
      if (e.source !== frame.current?.contentWindow) return;
      const data = e.data;
      if (data?.__runverse) return onLogRef.current({ level: data.level, text: String(data.text) });
      if (data?.__rv_nav) {
        const { method, path, type, body } = data.__rv_nav;
        return void navigate(method, path, type, body);
      }
      if (data?.__rv_fetch) {
        const { id, method, path, headers, body } = data.__rv_fetch;
        const reply = (msg: object) => frame.current?.contentWindow?.postMessage({ __rv_fetch_reply: { id, ...msg } }, '*');
        try {
          const { res } = await send(method, path, headers, body ? encode(body) : '');
          if (!res) return reply({ error: 'The app did not answer.' });
          reply({ status: res.status, headers: res.headers.filter(h => h[0].toLowerCase() !== 'set-cookie'), body: res.body });
        } catch (err) {
          reply({ error: err instanceof Error ? err.message : String(err) });
        }
      }
    };
    addEventListener('message', listen);
    return () => removeEventListener('message', listen);
  }, [navigate, send]);

  const h = history.current;
  const move = (step: number) => {
    const at = h.at + step;
    if (at < 0 || at >= h.list.length) return;
    h.at = at;
    bump(n => n + 1);
    void navigate('GET', h.list[at]!, undefined, undefined, false);
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const path = appPath(typed.trim() || '/', '/');
    if (path !== null) void navigate('GET', path);
  };

  const json = shown && /json/i.test(shown.type) ? prettyJson(shown.body) : null;

  const icon = 'text-muted-foreground hover:text-foreground hover:bg-accent inline-flex size-6 shrink-0 items-center justify-center rounded disabled:opacity-40 [&_svg]:size-3.5';
  const out = 'h-full overflow-auto bg-background p-3 font-mono text-[12.5px] whitespace-pre-wrap';

  return (
    <div className="flex h-full min-h-0 flex-col">
      <form className="bg-chrome flex h-8 shrink-0 items-center gap-0.5 border-b px-1.5" onSubmit={submit}>
        <button type="button" className={icon} aria-label="Back" title="Back" disabled={h.at === 0 || pending} onClick={() => move(-1)}><ChevronLeft /></button>
        <button type="button" className={icon} aria-label="Forward" title="Forward" disabled={h.at >= h.list.length - 1 || pending} onClick={() => move(1)}><ChevronRight /></button>
        <button type="button" className={icon} aria-label="Reload" title="Reload (Ctrl+Enter)" disabled={pending} onClick={() => void navigate('GET', address, undefined, undefined, false)}><RotateCw /></button>
        <label className="bg-background focus-within:ring-ring/50 mx-1 flex h-6 min-w-0 flex-1 items-center rounded border px-2 font-mono text-[12px] focus-within:ring-2">
          <span className="text-muted-foreground" aria-hidden="true">localhost</span>
          <input className="min-w-0 flex-1 bg-transparent outline-none" value={typed} onChange={e => setTyped(e.target.value)} aria-label="Address" spellCheck={false} autoComplete="off" />
        </label>
        {shown && !pending && (
          <span className={`rounded px-1.5 font-mono text-[11px] ${shown.status < 400 ? 'text-ok bg-ok/10' : 'text-destructive bg-destructive/10'}`} title={`${shown.ms} ms`}>{shown.status}</span>
        )}
        {pending && <Loader2 className="text-muted-foreground size-3.5 animate-spin" aria-label="Loading" />}
      </form>
      <div className="min-h-0 flex-1">
        {error ? (
          <pre className={`${out} text-destructive`}>{error}</pre>
        ) : !shown ? (
          <pre className={`${out} text-muted-foreground`}>Starting the app…</pre>
        ) : shown.doc !== null ? (
          <iframe
            ref={frame}
            className="block size-full border-0 bg-white"
            title="Preview"
            // No allow-same-origin: the page can't reach Runverse's cookies or storage.
            sandbox="allow-scripts allow-modals allow-forms allow-popups"
            srcDoc={shown.doc}
          />
        ) : (
          <pre className={out}>{json ?? shown.body}</pre>
        )}
      </div>
    </div>
  );
});

function prettyJson(text: string) {
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
}
