#!/bin/bash
# Install languages and backend frameworks into Piston by their Runverse id, e.g.:
#   ./scripts/languages.sh python cpp java laravel django
#   ./scripts/languages.sh all          every language and framework
#   ./scripts/languages.sh frameworks   every backend framework (Laravel, Django, Flask, FastAPI, Express)
# Frontend frameworks (React, Vue, Svelte…) run in the browser and need nothing.
# Most languages come from the Piston package repository. C#, Java, Go and JavaScript
# use current toolchains built by piston-packages/ (.NET 8, Java 21, latest Go, Node 22),
# and C/C++ are switched to C17/C++20.
set -euo pipefail
cd "$(dirname "$0")/.."

if [ $# -eq 0 ]; then
  docker compose exec -T api node dist/install.js
  exit 1
fi

# Backend frameworks are built by piston-packages/<id>.sh; everything else goes through install.js.
frameworks=()
languages=()
for id in "$@"; do
  case "$id" in
    frameworks) frameworks+=(laravel django flask fastapi express) ;;
    all) frameworks+=(laravel django flask fastapi express); languages+=(all) ;;
    laravel|django|flask|fastapi|express) frameworks+=("$id") ;;
    react|vue|svelte|preact|alpine|tailwind) echo "✓ $id runs in the browser, nothing to install" ;;
    *) languages+=("$id") ;;
  esac
done

if [ ${#languages[@]} -gt 0 ]; then
  docker compose exec -T api node dist/install.js "${languages[@]}"
fi

custom=()
for id in "$@"; do
  case "$id" in
    all) custom+=(dotnet java go node gcc-cxx20) ;;
    csharp) custom+=(dotnet) ;;
    java) custom+=(java) ;;
    go) custom+=(go) ;;
    javascript) custom+=(node) ;;
    c|cpp) custom+=(gcc-cxx20) ;;
  esac
done

if [ ${#custom[@]} -gt 0 ]; then
  mapfile -t custom < <(printf '%s\n' "${custom[@]}" | awk '!seen[$0]++')
  docker compose run --rm packages "${custom[@]}"
fi

if [ ${#frameworks[@]} -gt 0 ]; then
  mapfile -t frameworks < <(printf '%s\n' "${frameworks[@]}" | awk '!seen[$0]++')
  docker compose run --rm frameworks "${frameworks[@]}"
fi

if [ ${#custom[@]} -gt 0 ] || [ ${#frameworks[@]} -gt 0 ]; then
  docker compose restart piston
fi
