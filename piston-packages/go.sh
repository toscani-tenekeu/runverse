# Go, latest stable release (generics, slices, range-over-int…). Replaces Go 1.16.
source /build/lib.sh
GV=$(curl -fsSL 'https://go.dev/VERSION?m=text' | head -1)   # e.g. go1.25.4
V=${GV#go}
D=$PKG_ROOT/go/$V
rm -rf "$D" && mkdir -p "$D"
curl -fsSL "https://go.dev/dl/$GV.linux-amd64.tar.gz" | tar -xz -C "$D"
rm -rf "$D/go/test" "$D/go/api" "$D/go/doc"
cat > "$D/pkg-info.json" <<JSON
{ "language": "go", "version": "$V", "aliases": ["go", "golang"], "build_platform": "runverse" }
JSON
cat > "$D/environment" <<'ENV'
export GOROOT=$PWD/go
export PATH=$GOROOT/bin:$PATH
export GOTOOLCHAIN=local GOFLAGS=-mod=mod GOPROXY=off GOTELEMETRY=off CGO_ENABLED=0
ENV
cat > "$D/compile" <<'SH'
#!/usr/bin/env bash
for f in "$@"; do case "$f" in *.go|go.mod|go.sum|*/*) ;; *) mv -- "$f" "$f.go" ;; esac; done
export GOCACHE=$PWD/.gocache GOPATH=$PWD/.gopath
[ -f go.mod ] || go mod init runverse >/dev/null 2>&1
go build -o __main .
SH
cat > "$D/run" <<'SH'
#!/usr/bin/env bash
shift
exec ./__main "$@"
SH
finish "$D"
keep_only go "$V"
