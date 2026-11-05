import Fastify from 'fastify';
import rateLimit from '@fastify/rate-limit';
import { LANGUAGES, byId } from './languages.js';
import { execute, runtimes, type PistonRuntime } from './piston.js';
import { getSnippet, saveSnippet, type Snippet } from './db.js';

const RUNS_PER_MINUTE = Number(process.env.RUNS_PER_MINUTE ?? 30);
const SHARES_PER_HOUR = Number(process.env.SHARES_PER_HOUR ?? 20);
const MAX_TOTAL_BYTES = 200 * 1024;

const app = Fastify({ logger: { level: 'info' }, trustProxy: true, bodyLimit: 512 * 1024 });

await app.register(rateLimit, {
  global: false,
  errorResponseBuilder: (_req, ctx) => ({
    statusCode: 429,
    error: 'Too many requests',
    message: `Slow down a little: you can try again in ${ctx.after}.`,
  }),
});

const codeBody = {
  type: 'object',
  required: ['language', 'files'],
  additionalProperties: false,
  properties: {
    language: { type: 'string', maxLength: 32 },
    stdin: { type: 'string', maxLength: 64 * 1024, default: '' },
    files: {
      type: 'array',
      minItems: 1,
      maxItems: 10,
      items: {
        type: 'object',
        required: ['name', 'content'],
        additionalProperties: false,
        properties: {
          name: { type: 'string', pattern: '^[A-Za-z0-9_][A-Za-z0-9_.-]{0,63}$' },
          content: { type: 'string' },
        },
      },
    },
  },
} as const;

// Shared checks for /run and /snippets beyond what the JSON schema covers.
function checkCode(body: Snippet): string | null {
  if (!byId.has(body.language)) return `Unknown language "${body.language}".`;
  const names = new Set(body.files.map(f => f.name));
  if (names.size !== body.files.length) return 'Two files have the same name.';
  const total = body.files.reduce((n, f) => n + Buffer.byteLength(f.content), 0);
  if (total > MAX_TOTAL_BYTES) return 'Your files are too large (200 KB max in total).';
  return null;
}

// Piston's gcc package appends ".c"/".cpp" to every file before compiling them all.
// Strip that extension from sources up front, point #includes at the renamed headers,
// and map the names back in the output so messages show the files the user wrote.
function adaptFiles(id: string, files: Snippet['files']) {
  const ext = id === 'c' ? '.c' : id === 'cpp' ? '.cpp' : null;
  if (!ext) return { files, tidy: (s: string) => s };
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
  const rt = (await installed()).find(r => r.language === lang.runtime);
  if (!rt) return reply.code(400).send({ message: `${lang.name} is not installed on this server.` });

  const { files, tidy } = adaptFiles(lang.id, req.body.files);
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

app.post<{ Body: Snippet }>('/api/snippets', {
  schema: { body: codeBody },
  config: { rateLimit: { max: SHARES_PER_HOUR, timeWindow: '1 hour' } },
}, async (req, reply) => {
  const error = checkCode(req.body);
  if (error) return reply.code(400).send({ message: error });
  return reply.code(201).send({ id: saveSnippet(req.body) });
});

app.get<{ Params: { id: string } }>('/api/snippets/:id', async (req, reply) => {
  const snippet = /^[a-z0-9]{8}$/.test(req.params.id) && getSnippet(req.params.id);
  if (!snippet) return reply.code(404).send({ message: 'This snippet does not exist.' });
  return snippet;
});

app.setErrorHandler<{ validation?: unknown; statusCode?: number; message: string }>((err, _req, reply) => {
  if (err.validation) return reply.code(400).send({ message: err.message });
  if (err.statusCode === 429) return reply.code(429).send(err);
  app.log.error(err);
  reply.code(502).send({ message: 'The code runner is not responding. Try again in a moment.' });
});

await app.listen({ host: '0.0.0.0', port: Number(process.env.PORT ?? 3000) });
