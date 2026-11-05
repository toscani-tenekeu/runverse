# Java 21 (LTS, Eclipse Temurin). Replaces Java 15.
source /build/lib.sh
tmp=$(mktemp -d)
curl -fsSL "https://api.adoptium.net/v3/binary/latest/21/ga/linux/x64/jdk/hotspot/normal/eclipse" | tar -xz -C "$tmp"
jdk=$(find "$tmp" -mindepth 1 -maxdepth 1 -type d | head -1)
V=$(sed -n 's/^JAVA_VERSION="\(.*\)"/\1/p' "$jdk/release" | sed 's/[^0-9.].*//')
D=$PKG_ROOT/java/$V
rm -rf "$D" && mkdir -p "$D" && mv "$jdk" "$D/jdk" && rm -rf "$tmp"
rm -rf "$D/jdk/lib/src.zip" "$D/jdk/jmods" "$D/jdk/man"
cat > "$D/pkg-info.json" <<JSON
{ "language": "java", "version": "$V", "aliases": ["java"], "build_platform": "runverse" }
JSON
cat > "$D/environment" <<'ENV'
export JAVA_HOME=$PWD/jdk
export PATH=$JAVA_HOME/bin:$PATH
ENV
cat > "$D/compile" <<'SH'
#!/usr/bin/env bash
for f in "$@"; do case "$f" in *.java) ;; *) mv -- "$f" "$f.java" ;; esac; done
mapfile -t sources < <(find . -name '*.java' -type f)
javac -J-XX:+UseSerialGC -J-XX:TieredStopAtLevel=1 -encoding UTF-8 -d __classes "${sources[@]}"
SH
cat > "$D/run" <<'SH'
#!/usr/bin/env bash
# The entry file names the main class; honour a `package` declaration.
entry=$1; shift
[ -f "$entry" ] || entry=$entry.java
cls=$(basename "$entry" .java)
pkg=$(sed -n 's/^[[:space:]]*package[[:space:]]\+\([A-Za-z0-9_.]*\)[[:space:]]*;.*/\1/p' "$entry" | head -1)
exec java -XX:+UseSerialGC -XX:TieredStopAtLevel=1 -Xss8m -cp __classes "${pkg:+$pkg.}$cls" "$@"
SH
finish "$D"
keep_only java "$V"
