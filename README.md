# Runverse

A free, open-source online compiler you can host yourself: [runverse.kmerhosting.com](https://runverse.kmerhosting.com).

Pick one of 24 languages, write code across several files, give it input, run it and share a link to it.

## Self-host

You need Docker with Compose v2.

```
git clone https://github.com/toscani-tenekeu/runverse.git
cd runverse && docker compose up -d
./scripts/languages.sh python cpp java   # or: ./scripts/languages.sh all
```

Runverse is then live at http://localhost:8080. Run `./scripts/languages.sh` with no arguments to list the language ids. Installing `all` downloads about 10–15 GB.

Settings go in a `.env` file next to `docker-compose.yml`:

| Variable | Default | |
|---|---|---|
| `RUNVERSE_PORT` | `8080` | Port the site is published on |
| `RUNVERSE_BIND` | `0.0.0.0` | Set to `127.0.0.1` behind a reverse proxy |
| `RUN_TIMEOUT_MS` | `3000` | Time limit for each run |
| `MEMORY_LIMIT_BYTES` | `1073741824` | Memory limit for each run |
| `RUNS_PER_MINUTE` | `30` | Runs allowed per visitor IP |
| `SHARES_PER_HOUR` | `20` | Share links allowed per visitor IP |

Check an install with `./scripts/smoke.sh http://localhost:8080`.

## How it fits together

| Path | What |
|---|---|
| `landing/` | The landing page, plain HTML, CSS and JS |
| `web/` | The editor: React, TanStack Router and Query, CodeMirror 6, built with Bun and Vite |
| `api/` | Node + Fastify: runs code through Piston, stores share links in SQLite, rate limits |
| `docker-compose.yml` | `frontend` (nginx), `api`, and `piston`, the sandboxed code runner |

Language metadata (names, starter code, Piston packages) lives in `api/src/languages.ts`.

### Develop

```
docker compose up -d piston api        # or the whole stack
cd web && bun install && bun run dev   # proxies /api to localhost:8095
```
