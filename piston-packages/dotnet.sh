# C# on .NET 8 (LTS). Replaces Mono, whose C# 9 compiler lacked modern language support.
source /build/lib.sh
V=8.0.427
D=$PKG_ROOT/dotnet/$V
rm -rf "$D" && mkdir -p "$D/dotnet"
curl -fsSL "https://builds.dotnet.microsoft.com/dotnet/Sdk/$V/dotnet-sdk-$V-linux-x64.tar.gz" | tar -xz -C "$D/dotnet"
# Keep the runtime, the reference assemblies and the Roslyn compiler; drop the rest of the SDK.
cd "$D/dotnet"
rm -rf shared/Microsoft.AspNetCore.App packs/Microsoft.AspNetCore.App.Ref templates sdk-manifests metadata
find "sdk/$V" -mindepth 1 -maxdepth 1 ! -name Roslyn -exec rm -rf {} +
cd "$D"
cat > pkg-info.json <<JSON
{ "language": "dotnet", "version": "$V", "provides": [{ "language": "csharp", "aliases": ["csharp", "c#", "cs", "dotnet-csharp"] }], "build_platform": "runverse" }
JSON
cat > environment <<'ENV'
export DOTNET_ROOT=$PWD/dotnet
export PATH=$DOTNET_ROOT:$PATH
export DOTNET_CLI_TELEMETRY_OPTOUT=1 DOTNET_NOLOGO=1 DOTNET_SKIP_FIRST_TIME_EXPERIENCE=1
export DOTNET_SYSTEM_GLOBALIZATION_INVARIANT=1 DOTNET_gcServer=0 DOTNET_GCHeapHardLimit=0x18000000
# W^X double-mapping creates a large memfd that trips the sandbox file-size limit.
export DOTNET_EnableWriteXorExecute=0
ENV
cat > compile <<'SH'
#!/usr/bin/env bash
# Compile with csc directly (much faster than `dotnet build`), with the implicit
# usings a `dotnet new console` project gets.
for f in "$@"; do case "$f" in *.cs) ;; *) mv -- "$f" "$f.cs" ;; esac; done
cat > __GlobalUsings.g.cs <<'CS'
global using System;
global using System.Collections.Generic;
global using System.IO;
global using System.Linq;
global using System.Net.Http;
global using System.Threading;
global using System.Threading.Tasks;
CS
ref=$(echo "$DOTNET_ROOT"/packs/Microsoft.NETCore.App.Ref/*/ref/net8.0)
refs=(); for r in "$ref"/*.dll; do refs+=("-r:$r"); done
mapfile -t sources < <(find . -name '*.cs' -type f)
dotnet "$DOTNET_ROOT"/sdk/*/Roslyn/bincore/csc.dll -nologo -langversion:latest -optimize+ -nowarn:CS0105,CS8019 \
  -target:exe -out:__main.dll "${refs[@]}" "${sources[@]}" || exit 1
fw=$(ls "$DOTNET_ROOT/shared/Microsoft.NETCore.App" | head -1)
printf '{"runtimeOptions":{"tfm":"net8.0","framework":{"name":"Microsoft.NETCore.App","version":"%s"}}}' "$fw" > __main.runtimeconfig.json
SH
cat > run <<'SH'
#!/usr/bin/env bash
shift
exec dotnet __main.dll "$@"
SH
finish "$D"
keep_only dotnet "$V"
rm -rf "$PKG_ROOT/mono"
