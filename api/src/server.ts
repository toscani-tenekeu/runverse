import Fastify from 'fastify';
import rateLimit from '@fastify/rate-limit';
import { LANGUAGES, byId } from './languages.js';
import { execute, runtimes, type PistonRuntime } from './piston.js';
import { COOKIE, isEnabled, checkLogin, initAuth, newSession, username, validSession } from './auth.js';
import { deleteSnippet, getSnippet, purgeExpired, saveSnippet, type Snippet } from './db.js';

const RUNS_PER_MINUTE = Number(process.env.RUNS_PER_MINUTE ?? 30);
const SHARES_PER_HOUR = Number(process.env.SHARES_PER_HOUR ?? 20);
// Biggest workspace a run or a share link may carry (all file contents together).
const MAX_WORKSPACE_MB = Number(process.env.MAX_WORKSPACE_MB ?? 100);
const MAX_TOTAL_BYTES = MAX_WORKSPACE_MB * 1024 * 1024;
const MAX_FILES = 2000;
// Up to 5 levels of folders: "src/lib/util.py". Segments can't start with a dot, so no "..".
const PATH = '^([A-Za-z0-9_][A-Za-z0-9_.-]{0,63}/){0,4}[A-Za-z0-9_][A-Za-z0-9_.-]{0,63}$';

// JSON escaping makes a request body bigger than the files it carries, hence the 1.5x.
const app = Fastify({ logger: { level: 'info' }, trustProxy: true, bodyLimit: Math.ceil(MAX_TOTAL_BYTES * 1.5) + 1024 * 1024 });

await app.register(rateLimit, {
  global: false,
  errorResponseBuilder: (_req, ctx) => ({
    statusCode: 429,
    error: 'Too many requests',
    message: `Slow down a little: you can try again in ${ctx.after}.`,
  }),
});

initAuth();

// With sign-in on, everything except the health check and the auth routes needs a session.
app.addHook('onRequest', async (req, reply) => {
  if (!isEnabled()) return;
  const path = req.url.split('?')[0];
  if (!path.startsWith('/api/') || path === '/api/health' || path.startsWith('/api/auth/')) return;
  if (!validSession(req.headers.cookie)) return reply.code(401).send({ message: 'Sign in to continue.' });
});

const cookie = (value: string, maxAge: number, secure: boolean) =>
  `${COOKIE}=${value}; Path=/; Max-Age=${maxAge}; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}`;

app.get('/api/auth/me', async req => {
  if (!isEnabled()) return { authEnabled: false, authenticated: true };
  const authenticated = validSession(req.headers.cookie);
  return { authEnabled: true, authenticated, username: authenticated ? username() : undefined };
});

app.post<{ Body: { username: string; password: string } }>('/api/auth/login', {
  schema: {
    body: {
      type: 'object', required: ['username', 'password'], additionalProperties: false,
      properties: { username: { type: 'string', maxLength: 100 }, password: { type: 'string', maxLength: 200 } },
    },
  },
  config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
}, async (req, reply) => {
  if (!isEnabled()) return { ok: true };
  if (!checkLogin(req.body.username, req.body.password)) return reply.code(401).send({ message: 'Wrong username or password.' });
  const session = newSession();
  return reply.header('set-cookie', cookie(session.value, session.maxAge, req.protocol === 'https')).send({ ok: true });
});

app.post('/api/auth/logout', async (req, reply) =>
  reply.header('set-cookie', cookie('', 0, req.protocol === 'https')).send({ ok: true }));

const codeBody = {
  type: 'object',
  required: ['language', 'files'],
  additionalProperties: false,
  properties: {
    language: { type: 'string', maxLength: 32 },
    // Empty folders the user created; folders holding files come from the file paths.
    folders: { type: 'array', maxItems: MAX_FILES, default: [], items: { type: 'string', maxLength: 200, pattern: PATH } },
    stdin: { type: 'string', maxLength: 64 * 1024, default: '' },
    files: {
      type: 'array',
      minItems: 1,
      maxItems: MAX_FILES,
      items: {
        type: 'object',
        required: ['name', 'content'],
        additionalProperties: false,
        properties: {
          name: { type: 'string', maxLength: 200, pattern: PATH },
          content: { type: 'string' },
        },
      },
    },
  },
} as const;

// How long a share link lives; the visitor picks one, 30 days at most.
const HOUR = 3_600_000, DAY = 24 * HOUR;
const EXPIRY: Record<string, number> = { '1h': HOUR, '1d': DAY, '7d': 7 * DAY, '15d': 15 * DAY, '20d': 20 * DAY, '30d': 30 * DAY };

const shareBody = {
  ...codeBody,
  properties: { ...codeBody.properties, expiresIn: { type: 'string', enum: Object.keys(EXPIRY), default: '7d' } },
} as const;

// Shared checks for /run and /snippets beyond what the JSON schema covers.
function checkCode(body: Snippet): string | null {
  if (!byId.has(body.language)) return `Unknown language "${body.language}".`;
  const names = new Set(body.files.map(f => f.name));
  if (names.size !== body.files.length) return 'Two files have the same name.';
  const clash = body.files.find(f => names.has(f.name.slice(0, f.name.lastIndexOf('/'))));
  if (clash) return `${clash.name} is inside a folder that has the same name as a file.`;
  const total = body.files.reduce((n, f) => n + Buffer.byteLength(f.content), 0);
  if (total > MAX_TOTAL_BYTES) return `Your files are too large (${MAX_WORKSPACE_MB} MB max in total).`;
  return null;
}

// Piston's gcc package appends ".c"/".cpp" to every file before compiling them all.
// Strip that extension from sources up front, point #includes at the renamed headers,
// and map the names back in the output so messages show the files the user wrote.
function adaptFiles(id: string, files: Snippet['files']) {
  const ext = id === 'c' ? '.c' : id === 'cpp' ? '.cpp' : null;
  if (!ext) return { files, tidy: (s: string) => s, error: null };
  // The compiler only picks up sources at the top level ("gcc *.c").
  const nested = files.find(f => f.name.includes('/') && f.name.endsWith(ext));
  if (nested) return { files, tidy: (s: string) => s, error: `Put ${ext} files at the top level. Only headers can go in folders (${nested.name}).` };
  const headers = files.map(f => f.name).filter(n => !n.endsWith(ext));
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const includes = headers.length ? new RegExp(`(#\\s*include\\s*")(${headers.map(esc).join('|')})"`, 'g') : null;
  return {
    files: files.map(f => ({
      name: f.name.endsWith(ext) ? f.name.slice(0, -ext.length) : f.name,
      content: includes ? f.content.replace(includes, `$1$2${ext}"`) : f.content,
    })),
    tidy: (s: string) => s
      .replace(/^chmod: cannot access 'a\.out'.*\n?/gm, '')
      .replace(new RegExp(`(${files.map(f => esc(f.name)).join('|')})${esc(ext)}\\b`, 'g'), '$1'),
    error: null,
  };
}

// Installed runtimes change only when someone runs languages.sh, so a short cache is enough.
let cache: { at: number; list: PistonRuntime[] } | null = null;
async function installed() {
  if (!cache || Date.now() - cache.at > 30_000) cache = { at: Date.now(), list: await runtimes() };
  return cache.list;
}

app.get('/api/health', async () => ({ ok: true }));

app.get('/api/languages', async () => {
  const list = await installed();
  return LANGUAGES.map(({ pkg: _pkg, ...l }) => {
    if (!l.runtime) return { ...l, installed: true, version: null };
    const rt = list.find(r => r.language === l.runtime);
    return { ...l, installed: !!rt, version: rt?.version ?? null };
  });
});

app.post<{ Body: Snippet }>('/api/run', {
  schema: { body: codeBody },
  config: { rateLimit: { max: RUNS_PER_MINUTE, timeWindow: '1 minute' } },
}, async (req, reply) => {
  const error = checkCode(req.body);
  if (error) return reply.code(400).send({ message: error });

  const lang = byId.get(req.body.language)!;
  if (!lang.runtime) return reply.code(400).send({ message: `${lang.name} runs in your browser, not on the server.` });
  const rt = (await installed()).find(r => r.language === lang.runtime);
  if (!rt) return reply.code(400).send({ message: `${lang.name} is not installed on this server.` });

  const { files, tidy, error: layoutError } = adaptFiles(lang.id, req.body.files);
  if (layoutError) return reply.code(400).send({ message: layoutError });
  const started = Date.now();
  const result = await execute({
    language: rt.language,
    version: rt.version,
    files,
    stdin: req.body.stdin, // time and memory limits come from Piston's config (docker-compose.yml)
  });
  const pick = (s?: typeof result.run) => s && { stdout: tidy(s.stdout), stderr: tidy(s.stderr), code: s.code, signal: s.signal };
  return { run: pick(result.run), compile: pick(result.compile), durationMs: Date.now() - started, version: rt.version };
});

app.post<{ Body: Snippet & { expiresIn: string } }>('/api/snippets', {
  schema: { body: shareBody },
  config: { rateLimit: { max: SHARES_PER_HOUR, timeWindow: '1 hour' } },
}, async (req, reply) => {
  const error = checkCode(req.body);
  if (error) return reply.code(400).send({ message: error });
  const { expiresIn, ...snippet } = req.body;
  return reply.code(201).send(saveSnippet(snippet, EXPIRY[expiresIn]));
});

app.get<{ Params: { id: string } }>('/api/snippets/:id', async (req, reply) => {
  const snippet = /^[a-z0-9]{8}$/.test(req.params.id) && getSnippet(req.params.id);
  if (!snippet) return reply.code(404).send({ message: 'This link has expired or never existed.' });
  return snippet;
});

app.delete<{ Params: { id: string }; Headers: { 'x-delete-token'?: string } }>('/api/snippets/:id', async (req, reply) => {
  const token = req.headers['x-delete-token'];
  const ok = /^[a-z0-9]{8}$/.test(req.params.id) && typeof token === 'string' && deleteSnippet(req.params.id, token);
  if (!ok) return reply.code(404).send({ message: 'This link was not found, or you cannot delete it.' });
  return reply.code(204).send();
});

app.setErrorHandler<{ validation?: unknown; statusCode?: number; message: string }>((err, _req, reply) => {
  if (err.validation) return reply.code(400).send({ message: err.message });
  if (err.statusCode === 429) return reply.code(429).send(err);
  app.log.error(err);
  reply.code(502).send({ message: 'The code runner is not responding. Try again in a moment.' });
});

// Expired links already can't be opened; this just frees the space.
const purge = () => { const n = purgeExpired(); if (n) app.log.info(`deleted ${n} expired snippets`); };
purge();
setInterval(purge, HOUR).unref();

await app.listen({ host: '0.0.0.0', port: Number(process.env.PORT ?? 3000) });
