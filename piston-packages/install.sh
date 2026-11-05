#!/bin/sh
# Builds Runverse's custom Piston packages inside the piston_packages volume.
# Run through ./scripts/languages.sh; usage: install.sh dotnet java go node gcc-cxx20
set -eu
apk add --no-cache bash curl tar xz coreutils sed grep findutils >/dev/null
for pkg in "$@"; do
  echo "… building $pkg"
  bash "/build/$pkg.sh"
done
chown -R 1001:1001 /piston/packages
