#!/bin/bash
# Install languages into Piston by their Runverse id, e.g.: ./scripts/languages.sh python cpp java
#   ./scripts/languages.sh all     installs every language on the landing page
# Most languages come from the Piston package repository. C#, Java, Go and JavaScript
# use current toolchains built by piston-packages/ (.NET 8, Java 21, latest Go, Node 22),
# and C/C++ are switched to C17/C++20.
set -euo pipefail
cd "$(dirname "$0")/.."

if [ $# -eq 0 ]; then
  docker compose exec -T api node dist/install.js
  exit 1
fi

docker compose exec -T api node dist/install.js "$@"

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
  docker compose restart piston
fi
