# Shared helpers for the package builders.
set -euo pipefail
PKG_ROOT=/piston/packages
BASE_PATH=/usr/local/bin:/usr/local/sbin:/usr/bin:/usr/sbin:/bin:/sbin:.

# finish <dir>: write .env from ./environment the way Piston does, then mark installed.
finish() {
  local dir=$1
  (cd "$dir" && env -i PATH="$BASE_PATH" bash -c 'source ./environment && env') \
    | grep -vE '^(PWD|OLDPWD|SHLVL|_)=' > "$dir/.env"
  chmod +x "$dir/run" "$dir/compile" 2>/dev/null || true
  date +%s000 > "$dir/.ppman-installed"
}

# keep_only <language dir> <version>: remove the other versions of a package.
keep_only() {
  find "$PKG_ROOT/$1" -mindepth 1 -maxdepth 1 -type d ! -name "$2" -exec rm -rf {} +
}
