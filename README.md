<div align="center">

<img src="landing/favicon.svg" alt="Runverse logo" width="96" height="96">

# Runverse

**Write. Run. That's it.**

A free, open-source online compiler you can host yourself.<br>
24 languages plus HTML, CSS & JS, no ads, no sign-up, no tracking.

[![Live demo](https://img.shields.io/badge/demo-runverse.kmerhosting.com-F2B630?style=flat-square)](https://runverse.kmerhosting.com)
[![Docker Compose](https://img.shields.io/badge/docker-compose-2496ED?style=flat-square&logo=docker&logoColor=white)](#self-host)
[![Node.js](https://img.shields.io/badge/node-24-5FA04E?style=flat-square&logo=nodedotjs&logoColor=white)](api)
[![React](https://img.shields.io/badge/react-19-61DAFB?style=flat-square&logo=react&logoColor=black)](web)
[![Bun](https://img.shields.io/badge/built%20with-bun-000000?style=flat-square&logo=bun&logoColor=white)](web)

[Try it](https://runverse.kmerhosting.com/editor) · [Self-host](#self-host) · [Report a bug](https://github.com/toscani-tenekeu/runverse/issues/new) · [Donate](https://camerpay.biz/l/iagsxtl8mp)

</div>

---

## Features

- **24 languages**: C, C++, C#, Java, Python, JavaScript, TypeScript, Go, Rust, PHP, Kotlin, Swift, Ruby, Dart, Lua, Bash, R, Haskell, Scala, Elixir, Perl, Clojure, Zig and SQLite
- **HTML, CSS & JS** with a live preview and console, running safely in a sandboxed frame in the browser
- **Files and folders** per project (`lib/utils.py`), with standard input and separate stdout, stderr and compiler output
- **Share links** that expire after 1 hour, 1, 7, 15, 20 or 30 days, your choice
- **Resizable panes**, and light and dark editor themes
- **Safe by default**: every run is sandboxed by [Piston](https://github.com/engineer-man/piston) with no network, plus time, memory and process limits and per-IP rate limits
- **Works on phones and tablets**
- **One command to host**: a single Docker Compose file, and it works offline once languages are installed

## Self-host

You need Docker with Compose v2.

```bash
git clone https://github.com/toscani-tenekeu/runverse.git
cd runverse && docker compose up -d
./scripts/languages.sh python cpp java   # or: ./scripts/languages.sh all
```

Runverse is then live at **http://localhost:8085**.

- `./scripts/languages.sh` with no arguments lists the language ids. Installing `all` downloads about 10–15 GB.
- `./scripts/smoke.sh` runs hello-world in every installed language to check your install.

### Configuration

Copy `.env.example` to `.env` and change what you need:

| Variable | Default | Description |
|---|---|---|
| `RUNVERSE_PORT` | `8085` | Port the site is published on |
| `RUNVERSE_BIND` | `0.0.0.0` | Set to `127.0.0.1` behind a reverse proxy |
| `RUN_TIMEOUT_MS` | `3000` | Time limit for each run |
| `MEMORY_LIMIT_BYTES` | `536870912` | Memory limit for each run (512 MB) |
| `PISTON_MEMORY` | `3g` | Memory cap for the whole code runner |
| `PISTON_CPUS` | `2` | CPU cap for the whole code runner |
| `MAX_CONCURRENT_RUNS` | `4` | Runs executed at once; the rest wait in a queue |
| `RUNS_PER_MINUTE` | `30` | Runs allowed per visitor IP |
| `SHARES_PER_HOUR` | `20` | Share links allowed per visitor IP |

### Update

```bash
git pull && docker compose up -d --build
```

Installed languages and share links live in Docker volumes, so they survive updates.

## Architecture

```
browser ──▶ frontend (nginx) ──▶ /           landing page
                             ├─▶ /editor/*   React app
                             └─▶ /api/*  ──▶ api (Node + Fastify) ──▶ piston (sandbox)
                                                   └─ SQLite (share links)
```

| Path | What |
|---|---|
| [`landing/`](landing) | The landing page, plain HTML, CSS and JS |
| [`web/`](web) | The editor: React 19, TanStack Router and Query, CodeMirror 6, built with Bun and Vite |
| [`api/`](api) | Fastify on Node 24: runs code through Piston, stores share links, rate limits |
| [`docker-compose.yml`](docker-compose.yml) | The `frontend`, `api` and `piston` services |

Language metadata (names, starter code, Piston packages) lives in [`api/src/languages.ts`](api/src/languages.ts).

## Development

```bash
docker compose up -d                   # Piston + API (+ frontend)
cd web && bun install && bun run dev   # the Vite dev server proxies /api to localhost:8085 (or $API_URL)
```

## Contributing

Issues and pull requests are welcome. If a language is missing, [open an issue](https://github.com/toscani-tenekeu/runverse/issues/new).
