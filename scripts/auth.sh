#!/bin/bash
# Sign-in for the editor. Takes effect immediately, no restart needed.
#   ./scripts/auth.sh status   is sign-in on or off?
#   ./scripts/auth.sh on       switch it on; a new admin password is generated and shown
#   ./scripts/auth.sh off      switch it off: the editor is open to anyone who can reach it
#   ./scripts/auth.sh reset    generate and show a new password (also switches sign-in on)
set -euo pipefail
cd "$(dirname "$0")/.."
docker compose exec -T api node dist/auth-cli.js "$@"
