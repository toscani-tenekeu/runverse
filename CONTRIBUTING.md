# Contributing to Runverse

Thanks for helping. Bug reports, fixes, new languages and docs are all welcome.

## Before you start

- **Bugs and ideas**: [open an issue](https://github.com/toscani-tenekeu/runverse/issues/new/choose) first, so we can agree on the fix.
- **Security issues**: don't open a public issue. See [SECURITY.md](https://github.com/toscani-tenekeu/runverse/blob/main/SECURITY.md).
- **Small fixes** (typos, docs): send a pull request directly.

## Set up

You need Docker with Compose v2, Node.js 24 and [Bun](https://bun.sh).

```bash
git clone https://github.com/toscani-tenekeu/runverse.git && cd runverse
docker compose up -d                   # Piston, API and frontend
./scripts/languages.sh python cpp      # install a few languages
cd web && bun install && bun run dev   # editor with hot reload
```

| Folder | What | Check |
|---|---|---|
| `web/` | Editor (React, Vite) | `bun run build` |
| `api/` | API (Fastify, Node 24) | `npm run build` |
| `landing/` | Landing page (plain HTML) | open it in a browser |
| `piston-packages/` | Custom language toolchains | `./scripts/smoke.sh` |

## Adding a language

1. Add an entry to [`api/src/languages.ts`](api/src/languages.ts) with its Piston package, file name and a hello-world template.
2. Add it to `LANGS` in [`landing/index.html`](landing/index.html).
3. Install it with `./scripts/languages.sh <id>`, then run `./scripts/smoke.sh`.

## Pull requests

- Keep each PR focused on one change.
- Make sure `web` and `api` build, and `./scripts/smoke.sh` passes for the languages you touched.
- Write commit messages in the imperative: "Add Zig 0.14", not "Added Zig".
- Describe what changed and how you tested it. Add a screenshot for UI changes.

By contributing, you agree that your work is released under the [MIT License](https://github.com/toscani-tenekeu/runverse/blob/main/LICENSE) and that you follow the [Code of Conduct](https://github.com/toscani-tenekeu/runverse/blob/main/CODE_OF_CONDUCT.md).
