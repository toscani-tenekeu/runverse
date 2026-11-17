// Backend frameworks have no network in the sandbox, so a "request" is one run: the harness
// below loads the user's app, hands it the request read from stdin, and prints the response
// after RESPONSE_MARK. Whatever the app prints before that is its log output.
export const RESPONSE_MARK = '\u001e__RV_RESPONSE__';

export interface HttpRequest {
  method: string;
  path: string; // with the query string
  headers: Record<string, string>;
  body: string; // base64
}

export interface HttpResponse {
  status: number;
  headers: [string, string][];
  body: string; // base64
}

const PYTHON_COMMON = String.raw`
import base64, io, json, os, sys, traceback

sys.path.insert(0, os.getcwd())
try:
    os.remove(__file__)  # keep the harness out of the project
except OSError:
    pass

REQ = json.loads(sys.stdin.read() or "{}")
METHOD = REQ.get("method", "GET").upper()
PATH = REQ.get("path", "/") or "/"
HEADERS = {k.lower(): v for k, v in (REQ.get("headers") or {}).items()}
BODY = base64.b64decode(REQ.get("body") or "")
_real_stdout = sys.stdout


def respond(status, headers, body):
    sys.stdout.flush()
    sys.stderr.flush()
    if isinstance(body, str):
        body = body.encode()
    _real_stdout.write(MARK + json.dumps({"status": int(status), "headers": [[str(k), str(v)] for k, v in headers], "body": base64.b64encode(body).decode()}))
    _real_stdout.flush()


def fail(title):
    text = title + "\n\n" + traceback.format_exc()
    print(text, file=sys.stderr)
    respond(500, [("Content-Type", "text/plain; charset=utf-8")], text)
    sys.exit(0)


def find_entry(candidates):
    for name in candidates:
        if os.path.isfile(name + ".py"):
            return name
    for name in sorted(os.listdir(".")):
        if name.endswith(".py"):
            return name[:-3]
    return None
`;

const FLASK = String.raw`
import importlib

try:
    from flask import Flask
    entry = find_entry(["app", "main", "wsgi", "application", "server"])
    if entry is None:
        raise RuntimeError("Add an app.py that creates a Flask app.")
    module = importlib.import_module(entry)
    app = getattr(module, "app", None)
    if not isinstance(app, Flask):
        app = next((v for v in vars(module).values() if isinstance(v, Flask)), None)
    if app is None and callable(getattr(module, "create_app", None)):
        app = module.create_app()
    if app is None:
        raise RuntimeError(entry + ".py does not create a Flask app (app = Flask(__name__)).")
except Exception:
    fail("Your app could not start.")

client = app.test_client()
response = client.open(PATH, method=METHOD, headers=HEADERS, data=BODY)
respond(response.status_code, response.headers.to_wsgi_list(), response.get_data())
`;

const DJANGO = String.raw`
import re

try:
    module = "mysite.settings"
    if os.path.isfile("manage.py"):
        found = re.search(r"DJANGO_SETTINGS_MODULE['\"]\s*,\s*['\"]([\w.]+)", open("manage.py").read())
        if found:
            module = found.group(1)
    os.environ.setdefault("DJANGO_SETTINGS_MODULE", module)
    import django
    django.setup()
    from django.conf import settings
    from django.test import Client
    from django.test.utils import setup_test_environment

    setup_test_environment(debug=settings.DEBUG)
    if settings.DATABASES:
        # A fresh database every request: create the tables the installed apps need.
        from django.core.management import call_command
        call_command("migrate", run_syncdb=True, verbosity=0, interactive=False)
except Exception:
    fail("Your project could not start.")

client = Client(raise_request_exception=False)
for part in HEADERS.get("cookie", "").split(";"):
    if "=" in part:
        name, value = part.strip().split("=", 1)
        client.cookies[name] = value
extra = {"HTTP_" + k.upper().replace("-", "_"): v for k, v in HEADERS.items() if k not in ("cookie", "content-type", "content-length", "host")}
response = client.generic(METHOD, PATH, data=BODY, content_type=HEADERS.get("content-type", "application/octet-stream"), **extra)
headers = list(response.items())
headers += [("Set-Cookie", c.output(header="").strip()) for c in response.cookies.values()]
body = b"".join(response.streaming_content) if response.streaming else response.content
respond(response.status_code, headers, body)
`;

const FASTAPI = String.raw`
import asyncio, importlib
from urllib.parse import unquote, urlsplit

try:
    entry = find_entry(["main", "app", "api", "server"])
    if entry is None:
        raise RuntimeError("Add a main.py that creates a FastAPI app.")
    module = importlib.import_module(entry)
    app = getattr(module, "app", None)
    if app is None:
        from fastapi import FastAPI
        app = next((v for v in vars(module).values() if isinstance(v, FastAPI)), None)
    if app is None:
        raise RuntimeError(entry + ".py does not create an app (app = FastAPI()).")
except Exception:
    fail("Your app could not start.")


async def lifespan_start():
    # Runs startup handlers, for apps that have them. Apps without lifespan support just return.
    queue = asyncio.Queue()
    await queue.put({"type": "lifespan.startup"})
    done = asyncio.get_running_loop().create_future()

    async def receive():
        return await queue.get()

    async def send(message):
        if not done.done() and message["type"].startswith("lifespan.startup"):
            done.set_result(message)

    task = asyncio.create_task(app({"type": "lifespan", "asgi": {"version": "3.0"}, "state": {}}, receive, send))
    finished, _ = await asyncio.wait([done, task], return_when=asyncio.FIRST_COMPLETED)
    return task


async def main():
    lifespan = await lifespan_start()
    url = urlsplit(PATH)
    scope = {
        "type": "http", "asgi": {"version": "3.0"}, "http_version": "1.1", "method": METHOD, "scheme": "http",
        "path": unquote(url.path), "raw_path": url.path.encode(), "query_string": url.query.encode(), "root_path": "",
        "headers": [(k.encode(), v.encode()) for k, v in HEADERS.items()] + [(b"host", b"localhost")],
        "client": ("127.0.0.1", 50000), "server": ("localhost", 80), "state": {},
    }
    sent = False
    result = {"status": 500, "headers": [], "body": b""}

    async def receive():
        nonlocal sent
        if not sent:
            sent = True
            return {"type": "http.request", "body": BODY, "more_body": False}
        await asyncio.sleep(3600)

    async def send(message):
        if message["type"] == "http.response.start":
            result["status"] = message["status"]
            result["headers"] = [(k.decode(), v.decode()) for k, v in message.get("headers", [])]
        elif message["type"] == "http.response.body":
            result["body"] += message.get("body", b"")

    await app(scope, receive, send)
    lifespan.cancel()
    try:
        await lifespan
    except BaseException:
        pass
    respond(result["status"], result["headers"], result["body"])


try:
    asyncio.run(main())
except SystemExit:
    raise
except Exception:
    fail("The request failed.")
`;

const EXPRESS = String.raw`
const fs = require('fs');
const http = require('http');
const path = require('path');
const MARK = '__MARK__';
try { fs.unlinkSync(__filename); } catch {}

const req = JSON.parse(fs.readFileSync(0, 'utf8') || '{}');
const write = (status, headers, body) => {
  process.stdout.write(MARK + JSON.stringify({ status, headers, body: Buffer.from(body).toString('base64') }), () => process.exit(0));
};
const fail = (title, error) => {
  const text = title + '\n\n' + (error && error.stack || error);
  console.error(text);
  write(500, [['Content-Type', 'text/plain; charset=utf-8']], text);
};

// The app never really listens: listen() just hands its request handler to the harness.
let handler = null;
const fakeServer = { close(cb) { cb && cb(); return this; }, address: () => ({ port: 3000 }), on() { return this; }, once() { return this; } };
http.Server.prototype.listen = function (...args) {
  handler = handler || this.listeners('request')[0];
  const cb = args.find(a => typeof a === 'function');
  if (cb) setImmediate(cb);
  return this;
};
let express;
try { express = require(path.resolve('node_modules/express')); } catch {}
if (express) {
  express.application.listen = function (...args) {
    handler = this;
    const cb = args.find(a => typeof a === 'function');
    if (cb) setImmediate(cb);
    return fakeServer;
  };
}

(async () => {
  let exported;
  try {
    const pkg = fs.existsSync('package.json') ? JSON.parse(fs.readFileSync('package.json', 'utf8')) : {};
    const entry = [pkg.main, 'server.js', 'app.js', 'index.js', 'main.js'].find(f => f && fs.existsSync(f));
    if (!entry) throw new Error('Add a server.js that creates an Express app.');
    exported = require(path.resolve(entry));
    if (exported && typeof exported.then === 'function') exported = await exported;
  } catch (error) {
    return fail('Your app could not start.', error);
  }
  await new Promise(resolve => setImmediate(resolve));
  if (!handler) handler = typeof exported === 'function' ? exported : exported && (exported.app || exported.default);
  if (typeof handler !== 'function') return fail('Your app could not start.', 'server.js must call app.listen() or export the app (module.exports = app).');

  const inject = require(path.resolve('node_modules/light-my-request'));
  try {
    const res = await inject(handler, { method: req.method || 'GET', url: req.path || '/', headers: req.headers || {}, payload: Buffer.from(req.body || '', 'base64') });
    const headers = [];
    for (const [name, value] of Object.entries(res.headers)) {
      for (const v of Array.isArray(value) ? value : [value]) headers.push([name, String(v)]);
    }
    write(res.statusCode, headers, res.rawPayload);
  } catch (error) {
    fail('The request failed.', error);
  }
})();
`;

const LARAVEL = String.raw`<?php
@unlink(__FILE__);
const RV_MARK = '__MARK__';
$req = json_decode(stream_get_contents(STDIN) ?: '{}', true) ?: [];

function rv_respond(int $status, array $headers, string $body): void {
    fflush(STDERR);
    echo RV_MARK . json_encode(['status' => $status, 'headers' => $headers, 'body' => base64_encode($body)]);
    exit(0);
}

set_exception_handler(function (Throwable $e) {
    $text = "Your app could not start.\n\n" . $e;
    fwrite(STDERR, $text . "\n");
    rv_respond(500, [['Content-Type', 'text/plain; charset=utf-8']], $text);
});

define('LARAVEL_START', microtime(true));
require __DIR__ . '/vendor/autoload.php';
$app = require __DIR__ . '/bootstrap/app.php';
$kernel = $app->make(Illuminate\Contracts\Http\Kernel::class);

$method = strtoupper($req['method'] ?? 'GET');
$uri = 'http://localhost' . ($req['path'] ?? '/');
$headers = array_change_key_case($req['headers'] ?? [], CASE_LOWER);
$content = base64_decode($req['body'] ?? '');
$server = ['REMOTE_ADDR' => '127.0.0.1'];
foreach ($headers as $name => $value) {
    $key = strtoupper(str_replace('-', '_', $name));
    $server[in_array($key, ['CONTENT_TYPE', 'CONTENT_LENGTH']) ? $key : 'HTTP_' . $key] = $value;
}
$cookies = [];
foreach (explode(';', $headers['cookie'] ?? '') as $part) {
    if (str_contains($part, '=')) {
        [$name, $value] = explode('=', trim($part), 2);
        $cookies[$name] = urldecode($value);
    }
}
$params = [];
if (str_starts_with($headers['content-type'] ?? '', 'application/x-www-form-urlencoded')) {
    parse_str($content, $params);
}
$request = Illuminate\Http\Request::create($uri, $method, $params, $cookies, [], $server, $content);
$response = $kernel->handle($request);

ob_start();
$response->sendContent();
$body = ob_get_clean();
$out = [];
foreach ($response->headers->allPreserveCaseWithoutCookies() as $name => $values) {
    foreach ($values as $value) $out[] = [$name, (string) $value];
}
foreach ($response->headers->getCookies() as $cookie) $out[] = ['Set-Cookie', (string) $cookie];
$kernel->terminate($request, $response);
rv_respond($response->getStatusCode(), $out, $body);
`;

const PY = (framework: string) => `MARK = ${JSON.stringify(RESPONSE_MARK)}\n${PYTHON_COMMON}\n${framework}`;

/** The file Piston runs first for a backend framework, or null for anything else. */
export function harnessFor(id: string): { name: string; content: string } | null {
  switch (id) {
    case 'flask': return { name: '__rv_serve.py', content: PY(FLASK) };
    case 'django': return { name: '__rv_serve.py', content: PY(DJANGO) };
    case 'fastapi': return { name: '__rv_serve.py', content: PY(FASTAPI) };
    case 'express': return { name: '__rv_serve.js', content: EXPRESS.replace('__MARK__', JSON.stringify(RESPONSE_MARK).slice(1, -1)) };
    case 'laravel': return { name: '__rv_serve.php', content: LARAVEL.replace('__MARK__', RESPONSE_MARK) };
    default: return null;
  }
}

/** Splits a run's output into the app's own log lines and the response the harness printed. */
export function splitResponse(stdout: string): { log: string; response: HttpResponse | null } {
  const at = stdout.lastIndexOf(RESPONSE_MARK);
  if (at < 0) return { log: stdout, response: null };
  try {
    const response = JSON.parse(stdout.slice(at + RESPONSE_MARK.length)) as HttpResponse;
    return { log: stdout.slice(0, at), response };
  } catch {
    return { log: stdout, response: null };
  }
}
