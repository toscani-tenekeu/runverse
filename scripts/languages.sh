#!/bin/bash
# Install languages into Piston by their Runverse id, e.g.: ./scripts/languages.sh python cpp java
#   ./scripts/languages.sh all     installs every language on the landing page
set -euo pipefail
cd "$(dirname "$0")/.."
docker compose exec -T api node dist/install.js "$@"
