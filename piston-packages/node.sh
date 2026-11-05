# Node.js 22 (LTS) for JavaScript. Replaces Node 20.
source /build/lib.sh
file=$(curl -fsSL https://nodejs.org/dist/latest-v22.x/SHASUMS256.txt | grep -o 'node-v22[0-9.]*-linux-x64.tar.xz' | head -1)
V=$(echo "$file" | sed 's/node-v\(.*\)-linux-x64.tar.xz/\1/')
D=$PKG_ROOT/node/$V
rm -rf "$D" && mkdir -p "$D"
curl -fsSL "https://nodejs.org/dist/latest-v22.x/$file" | tar -xJ -C "$D" --strip-components=1
rm -rf "$D/include" "$D/share" "$D/lib/node_modules/npm" "$D/lib/node_modules/corepack" "$D/bin/npm" "$D/bin/npx" "$D/bin/corepack"
cat > "$D/pkg-info.json" <<JSON
{ "language": "node", "version": "$V", "provides": [{ "language": "javascript", "aliases": ["node-javascript", "node-js", "javascript", "js"] }], "build_platform": "runverse" }
JSON
cat > "$D/environment" <<'ENV'
export PATH=$PWD/bin:$PATH
ENV
cat > "$D/run" <<'SH'
#!/usr/bin/env bash
exec node "$@"
SH
finish "$D"
keep_only node "$V"
