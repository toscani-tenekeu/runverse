#!/bin/bash
# Builds the backend framework packages inside the piston_packages volume.
# Run through ./scripts/languages.sh; usage: frameworks.sh django flask fastapi laravel express
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq >/dev/null
apt-get install -y -qq --no-install-recommends ca-certificates curl xz-utils tar >/dev/null
for pkg in "$@"; do
  echo "… building $pkg"
  bash "/build/$pkg.sh"
done
chown -R 1001:1001 /piston/packages
