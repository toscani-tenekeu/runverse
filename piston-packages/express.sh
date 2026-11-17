# Express on Node.js 22, with EJS templates. light-my-request feeds requests to the app
# without opening a socket, since the sandbox has no network.
source /build/lib.sh
file=$(curl -fsSL https://nodejs.org/dist/latest-v22.x/SHASUMS256.txt | grep -o 'node-v22[0-9.]*-linux-x64.tar.xz' | head -1)
work=/tmp/express
rm -rf "$work" && mkdir -p "$work"
curl -fsSL "https://nodejs.org/dist/latest-v22.x/$file" | tar -xJ -C "$work" --strip-components=1
mkdir -p "$work/web"
(cd "$work/web" && echo '{"private":true}' > package.json && PATH="$work/bin:$PATH" npm install --silent --no-audit --no-fund express ejs light-my-request)
V=$(PATH="$work/bin:$PATH" node -p "require('$work/web/node_modules/express/package.json').version")
rm -rf "$work/include" "$work/share" "$work/lib/node_modules/npm" "$work/lib/node_modules/corepack" "$work/bin/npm" "$work/bin/npx" "$work/bin/corepack"
D=$PKG_ROOT/express/$V
rm -rf "$D" && mkdir -p "$(dirname "$D")" && mv "$work" "$D"
cat > "$D/pkg-info.json" <<JSON
{ "language": "express", "version": "$V", "provides": [{ "language": "express", "aliases": [] }], "build_platform": "runverse" }
JSON
cat > "$D/environment" <<'ENV'
export PATH=$PWD/bin:$PATH
export RV_PKG=$PWD
ENV
cat > "$D/run" <<'SH'
#!/usr/bin/env bash
# Projects find express and friends through a node_modules link next to their files.
[ -e node_modules ] || ln -s "$RV_PKG/web/node_modules" node_modules
case "$1" in *.sh) exec bash "$@" ;; esac
exec node "$@"
SH
finish "$D"
keep_only express "$V"
echo "✓ express $V"
