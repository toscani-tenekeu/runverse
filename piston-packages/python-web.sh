# Shared by django.sh, flask.sh and fastapi.sh: a relocatable CPython 3.12 with one
# framework installed into it, as a self-contained Piston package.
# usage: build_python_framework <piston language> <pip requirement> <import name> [extra pip packages…]
source /build/lib.sh

PY_BASE=/piston/.cache/python-3.12

python_base() {
  [ -x "$PY_BASE/bin/python3" ] && return
  local url
  url=$(curl -fsSL https://api.github.com/repos/astral-sh/python-build-standalone/releases/latest \
    | grep -o 'https://[^"]*cpython-3\.12\.[0-9]*%2B[0-9]*-x86_64-unknown-linux-gnu-install_only\.tar\.gz' | head -1)
  [ -n "$url" ] || { echo "No Python 3.12 build found"; exit 1; }
  rm -rf "$PY_BASE" && mkdir -p "$PY_BASE"
  curl -fsSL "$url" | tar -xz -C "$PY_BASE" --strip-components=1
}

build_python_framework() {
  local language=$1 requirement=$2 module=$3
  shift 3
  python_base
  local work=/tmp/$language
  rm -rf "$work" && cp -a "$PY_BASE" "$work"
  # Wheels for glibc 2.28, which is what Piston's sandbox has.
  "$work/bin/python3" -m pip install --quiet --no-cache-dir --disable-pip-version-check \
    --target "$work/lib/python3.12/site-packages" --upgrade \
    --platform manylinux_2_28_x86_64 --only-binary=:all: --python-version 3.12 \
    "$requirement" "$@"
  local V
  V=$("$work/bin/python3" -c "import importlib.metadata as m; print(m.version('$module'))")
  local D=$PKG_ROOT/$language/$V
  rm -rf "$D" && mkdir -p "$(dirname "$D")" && mv "$work" "$D"
  # "python" and "pip" as people type them in the terminal.
  [ -e "$D/bin/python" ] || ln -s python3 "$D/bin/python"
  rm -rf "$D/lib/python3.12/test" "$D/lib/python3.12/idlelib" "$D/lib/python3.12/tkinter" "$D/share"
  # The package is read-only in the sandbox, so compile once here; otherwise every request
  # would compile the framework from source again.
  "$D/bin/python3" -m compileall -q -j0 "$D/lib/python3.12" >/dev/null 2>&1 || true
  cat > "$D/pkg-info.json" <<JSON
{ "language": "$language", "version": "$V", "provides": [{ "language": "$language", "aliases": [] }], "build_platform": "runverse" }
JSON
  cat > "$D/environment" <<'ENV'
export PATH=$PWD/bin:$PATH
export RV_PKG=$PWD
export PYTHONDONTWRITEBYTECODE=1
export PYTHONUNBUFFERED=1
ENV
  # A request runs the Runverse harness with Python; a terminal command arrives as a .sh file.
  cat > "$D/run" <<'SH'
#!/usr/bin/env bash
case "$1" in *.sh) exec bash "$@" ;; esac
exec python3 "$@"
SH
  finish "$D"
  keep_only "$language" "$V"
  echo "✓ $language $V"
}
